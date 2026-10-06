// スタッフ名簿に無い名前で残っている休日・有給・休日メモを、今の名前に直す（2026-10-06）
//   背景：スタッフの名前を変えても、休日データ（氏名で持っている）は直らなかった。
//   その結果、カレンダーには出るのにタイムスケジュールには出ない、という食い違いになる。
//   例：本店の休日に「幸田かつのり」が40日ぶん残っていたが、名簿は「幸田桂紀」。
//
//   使い方：
//     node fb_fix_staff_names.js            … 下見（本番。書き込みはしない）
//     node fb_fix_staff_names.js --dev      … テスト版を見る
//     node fb_fix_staff_names.js --write    … 実際に直す（控えを Hub重要書類 に保存してから）
//   ※ 苗字が一致する人が1人だけの時にかぎって置き換える。2人以上いる／見つからない時は
//     触らずに一覧に出すだけ（人を取り違えないため）。
const path = require('path'), fs = require('fs');
const HV = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(HV, 'firebase-admin'));
const KEYFILE = 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const BACKUP_DIR = 'C:/Users/A/Documents/Hub重要書類';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DEV = args.includes('--dev');
const P = DEV ? 'hub-v8-dev-' : 'hub-v8-';

admin.initializeApp({ credential: admin.credential.cert(require(KEYFILE)) });
const db = admin.firestore();
const get = async k => { const s = await db.collection('kv').doc(k).get(); if (!s.exists) return null; try { return JSON.parse(s.data().v); } catch (e) { return null; } };
const set = async (k, v) => db.collection('kv').doc(k).set({ v: JSON.stringify(v), u: admin.firestore.FieldValue.serverTimestamp() });

// 苗字（空白より前・全角半角どちらの空白でも）
const sei = n => String(n || '').replace(/[\s\u3000]+/g, ' ').trim().split(' ')[0];
// 苗字としていちばん長く一致する分を取る（「幸田かつのり」→ 名簿「幸田桂紀」の 幸田）
const seiOf = n => { const t = String(n || '').replace(/[\s\u3000]+/g, ''); return t; };

(async () => {
  console.log('保存先プレフィックス: ' + P + (WRITE ? '  【書き込みます】' : '  （下見のみ）'));
  const plan = [];     // {store,key,from,to}
  const untouched = [];
  const snapshot = {};

  for (const store of ['honten', 'sanda']) {
    const staff = (await get(P + store + '-staff-v2')) || [];
    const names = staff.map(s => String(s.name || '')).filter(Boolean);
    const known = new Set(names);
    const off = (await get(P + store + '-dayoff')) || {};
    const pl = (await get(P + store + '-pleave')) || {};
    const nt = (await get(P + store + '-offnote')) || {};
    snapshot[store] = { staff, dayoff: off, pleave: pl, offnote: nt };

    // 名簿に無い名前を集める
    const orphan = {};
    const add = n => { if (n && !known.has(n)) orphan[n] = (orphan[n] || 0) + 1; };
    for (const k in off) (off[k] || []).forEach(add);
    for (const k in pl) (pl[k] || []).forEach(add);
    for (const k in nt) { const p = String(k).split('::'); if (p.length === 2) add(p[1]); }

    console.log('');
    console.log('── ' + (store === 'honten' ? '本店' : '三田店') + ' ──');
    console.log('   名簿: ' + names.join('・'));
    if (Object.keys(orphan).length === 0) { console.log('   名簿に無い名前はありません'); continue; }

    for (const bad of Object.keys(orphan)) {
      // ★頭から2文字以上そろう人を探す（苗字が同じ＝同じ人とみなす）。
      //   「幸田かつのり」と「幸田桂紀」のように、下の名前の書き方だけ変えた場合に効く。
      //   同じ苗字の人が2人以上いる時は触らない（取り違えを防ぐ）
      const t = seiOf(bad);
      const common = (x, y) => { let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++; return i; };
      const strong = names.filter(n => common(seiOf(n), t) >= 2);
      if (strong.length === 1) {
        plan.push({ store, from: bad, to: strong[0], days: orphan[bad] });
        console.log('   ✔ ' + bad + '（' + orphan[bad] + '日）→ ' + strong[0]);
      } else {
        untouched.push({ store, name: bad, days: orphan[bad], candidates: strong });
        console.log('   ✖ ' + bad + '（' + orphan[bad] + '日）→ 相手が ' + (strong.length === 0 ? '見つかりません' : strong.length + '人いるので触りません（' + strong.join('・') + '）'));
      }
    }
  }

  if (plan.length === 0) { console.log(NLs() + '直すものはありませんでした'); process.exit(0); }
  console.log('');
  console.log('合計 ' + plan.length + ' 件の名前を直します' + (WRITE ? '' : '（下見なので書き込みません。実行は --write）'));
  if (untouched.length) console.log('※ 触らない名前 ' + untouched.length + ' 件（退職された方などは、そのままで問題ありません）');
  if (!WRITE) process.exit(0);

  // 控えを先に取る（顧客情報ではないがリポジトリの外に置く）
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bk = path.join(BACKUP_DIR, 'staff-off-backup-' + (DEV ? 'dev-' : 'prod-') + stamp + '.json');
  fs.writeFileSync(bk, JSON.stringify(snapshot, null, 1), 'utf8');
  console.log('控えを保存しました: ' + bk);

  for (const store of ['honten', 'sanda']) {
    const mine = plan.filter(p => p.store === store);
    if (!mine.length) continue;
    const swapArr = (src) => {
      const out = {};
      for (const k in (src || {})) {
        const a = src[k];
        if (!Array.isArray(a)) { out[k] = a; continue; }
        let n = a.slice();
        mine.forEach(p => { n = n.map(x => x === p.from ? p.to : x); });
        out[k] = n.filter((x, i) => n.indexOf(x) === i);    // 新旧が両方あった日は1つに
      }
      return out;
    };
    const off = await get(P + store + '-dayoff') || {};
    const pl = await get(P + store + '-pleave') || {};
    const nt = await get(P + store + '-offnote') || {};
    await set(P + store + '-dayoff', swapArr(off));
    await set(P + store + '-pleave', swapArr(pl));
    const nt2 = {};
    for (const k in nt) {
      const p = String(k).split('::');
      if (p.length === 2) { const hit = mine.find(x => x.from === p[1]); nt2[hit ? (p[0] + '::' + hit.to) : k] = nt[k]; }
      else nt2[k] = nt[k];
    }
    await set(P + store + '-offnote', nt2);
    console.log('  ' + (store === 'honten' ? '本店' : '三田店') + ' を直しました（' + mine.map(p => p.from + '→' + p.to).join('・') + '）');
  }
  console.log('');
  console.log('できました。各画面はリロードすると反映されます。');
  process.exit(0);
})().catch(e => { console.error('失敗:', e && e.message); process.exit(1); });

function NLs() { return String.fromCharCode(10); }
