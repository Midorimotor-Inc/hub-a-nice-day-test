// 本番（または --dev でテスト版）の横断検索の索引を読み、
// PC（🔍 検索）とスマホ（顧客タブ「探す」）の数え方を同じ言葉で比べる。読み取りだけ。
//   実行: node fb_search_diff.js 藤明 藤 [--dev]
const path = require('path'), fs2 = require('fs');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
const KEY = 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const args = process.argv.slice(2);
const DEV = args.includes('--dev');
const WORDS = args.filter(a => a !== '--dev');
const STOR = DEV ? 'hub-v8-dev-' : 'hub-v8-';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs2.readFileSync(KEY, 'utf8'))) });
const db = admin.firestore();
const get = async k => { const d = await db.collection('kv').doc(k).get(); if (!d.exists) return null; try { return JSON.parse(d.data().v); } catch (e) { return null; } };

const norm = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\s　\-‐ー－()（）]/g, '');
const digits = s => String(s == null ? '' : s).normalize('NFKC').replace(/[^0-9]/g, '');
const personKey = r => (r.no !== '' && r.no != null) ? ('no:' + norm(r.no)) : ('nm:' + norm(r.n) + '/' + norm(r.c));

(async () => {
  const idx = await get(STOR + 'cf-search-index');
  if (!idx || !Number(idx.chunks)) { console.log('索引がありません'); process.exit(1); }
  const rows = [];
  for (let i = 0; i < Number(idx.chunks); i++) { const a = await get(STOR + 'cf-search-chunk-' + i); if (Array.isArray(a)) rows.push(...a); }
  console.log((DEV ? 'テスト版' : '本番') + ' 索引: ' + rows.length + '行 / ' + idx.chunks + 'チャンク / 月ファイル ' + (idx.files || []).length + '本');

  for (const w of WORDS) {
    const nq = norm(w), dq = digits(w);
    const numOnly = dq.length >= 2 && nq === dq;
    // スマホ（cfxSearch）
    const mHit = r => numOnly ? (digits(r.p).includes(dq) || digits(r.no).includes(dq))
      : (norm(r.n).includes(nq) || norm(r.c).includes(nq) || norm(r.no).includes(nq) || norm(r.p).includes(nq) || norm(r.a).includes(nq));
    const mRows = rows.filter(mHit);
    const mPeople = new Set(mRows.map(personKey));
    // PC（FindModal）：索引の行を別の形に移してから同じ言葉で見る
    const pcRows = rows.map(x => ({ name: x.n, carType: x.c, no: x.no, phoneMobile: (String(x.p || '').split('/')[0] || ''), phoneHome: (String(x.p || '').split('/')[1] || ''), address: x.a || '', custId: x.i, _file: x.f }));
    const pHit = r => [r.name, r.carType, r.no, r.phoneHome, r.phoneMobile, r.address].some(v => v != null && norm(v).includes(nq));
    const pRows = pcRows.filter(pHit);
    const pPeople = new Set(pRows.map(r => r.no ? ('no:' + String(r.no)) : (norm(r.name) + '|' + norm(r.carType))));
    console.log('');
    console.log('【' + w + '】 スマホ: ' + mPeople.size + '人（' + mRows.length + '件）　PC: ' + pPeople.size + '人（' + pRows.length + '件）'
      + (numOnly ? '　※数字だけの検索' : ''));
    if (mRows.length !== pRows.length) {
      const key = r => [r.n || r.name, r.c || r.carType, r.f || r._file].join('/');
      const ms = new Set(mRows.map(key)), ps = new Set(pRows.map(key));
      console.log('  スマホだけに出る: ' + [...ms].filter(x => !ps.has(x)).slice(0, 10).join(' , '));
      console.log('  PCだけに出る    : ' + [...ps].filter(x => !ms.has(x)).slice(0, 10).join(' , '));
    }
    // 中身を少し見せる
    mRows.slice(0, 12).forEach(r => console.log('   ・' + [r.n, r.c, 'ナンバー' + (r.no || '—'), r.p || '—', r.f].join(' | ')));
    if (mRows.length > 12) console.log('   …ほか ' + (mRows.length - 12) + '件');
    // 人まとめの内訳
    const g = {};
    mRows.forEach(r => { const k = personKey(r); (g[k] = g[k] || []).push(r.f); });
    console.log('  まとめ方: ' + Object.entries(g).map(([k, v]) => k + '→' + v.length + '件').join(' , '));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
