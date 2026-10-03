// 本番のデータをテスト版へ写す（開発用・2026-10-05 ユーザー依頼）
//   ★向きは本番 → テスト版の一方通行。逆向きはこのスクリプトでは絶対にできない。
//     書き込み先が hub-v8-dev- で始まらない時は、その場で止める（二重の歯止め）。
//
//   node fb_copy_prod_to_dev.js            … 下見（何を写すか見るだけ・書き込みなし）
//   node fb_copy_prod_to_dev.js --write    … 実行（先にテスト版の今の中身を控えに保存する）
//
//   写さないもの（大事）：
//     ・本人認証と端末（meta/allowed・devices・users・handoff・auth-*）… 環境共通や個人のもの
//     ・マイスケジュール myprv-*（個人の予定）
//     ・時点保存 snaps/snapidx（テスト版のものをそのまま残す）
//     ・作業中の印（locks・list-pending・diag-*・gasping など）
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();

const SRC = 'hub-v8-';        // 本番（読むだけ）
const DST = 'hub-v8-dev-';    // テスト版（書き先）
const WRITE = process.argv.indexOf('--write') >= 0;
const BACKUP_DIR = 'C:/Users/A/Documents/Hub重要書類';   // リポジトリの外（控えに顧客名や電話が入るため）

// 写さないキー（本番側の名前から SRC を外した形で判定）
const SKIP = [
  /^myprv-/,            // 個人のマイスケジュール
  /^auth-/,             // 端末の登録まわり
  /^locks$/,            // 編集中の印
  /^list-pending$/,     // 端末の控え
  /^diag-/,             // 不具合調査の記録
  /^gasping$/,          // 接続確認
  /^handoff/,           // 引き継ぎの印
  /^snap/,              // 時点保存（snapidx 等）
];
const skip = base => SKIP.some(re => re.test(base));

(async () => {
  // ── 歯止め：向きを固定。書き先がテスト版でなければ何もしない ──
  if (!DST.startsWith('hub-v8-dev-')) { console.error('書き先がテスト版ではありません。中止します。'); process.exit(1); }
  if (SRC === DST) { console.error('読み元と書き先が同じです。中止します。'); process.exit(1); }

  console.log('本番 → テスト版 へ写します' + (WRITE ? '（実行）' : '（下見・書き込みはしません）'));
  const snap = await db.collection('kv').get();
  const prod = [], devNow = new Map();
  snap.forEach(d => {
    const id = d.id;
    if (id.startsWith(DST)) { devNow.set(id, d.data()); return; }
    if (!id.startsWith(SRC)) return;
    const base = id.slice(SRC.length);
    if (skip(base)) return;
    prod.push({ id, base, data: d.data() });
  });
  prod.sort((a, b) => a.base.localeCompare(b.base));

  const size = x => { try { return (x && typeof x.v === 'string') ? x.v.length : 0; } catch (e) { return 0; } };
  let total = 0, over = 0, add = 0;
  prod.forEach(p => {
    total += size(p.data);
    if (devNow.has(DST + p.base)) over++; else add++;
  });
  console.log('  写す対象: ' + prod.length + '件（上書き ' + over + ' / 新しく作る ' + add + '）  合計 ' + Math.round(total / 1024) + ' KB');
  const big = [...prod].sort((a, b) => size(b.data) - size(a.data)).slice(0, 8);
  console.log('  大きいもの: ' + big.map(p => p.base + '(' + Math.round(size(p.data) / 1024) + 'KB)').join(', '));
  const skipped = [];
  snap.forEach(d => { const id = d.id; if (id.startsWith(SRC) && !id.startsWith(DST)) { const b = id.slice(SRC.length); if (skip(b)) skipped.push(b); } });
  console.log('  写さないもの: ' + (skipped.length ? skipped.join(', ') : 'なし'));

  if (!WRITE) { console.log(String.fromCharCode(10) + '※ 下見だけです。実行する時は --write を付けてください。'); process.exit(0); }

  // ── 先にテスト版の今の中身を控えに保存（戻せるように）──
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const file = path.join(BACKUP_DIR, 'dev-backup-' + stamp + '.json');
  const backup = {};
  devNow.forEach((v, k) => { backup[k] = v && v.v; });
  fs.writeFileSync(file, JSON.stringify(backup));
  console.log('  テスト版の今の中身を控えに保存しました: ' + file + '（' + Object.keys(backup).length + '件）');

  // ── 書き込み（必ず DST を前置。保険として書き先を1件ずつ確かめる）──
  let n = 0;
  for (const p of prod) {
    const to = DST + p.base;
    if (!to.startsWith(DST)) { console.error('書き先がおかしい: ' + to); process.exit(1); }
    await db.collection('kv').doc(to).set({ v: p.data.v, u: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    n++;
    if (n % 20 === 0) console.log('   ' + n + '/' + prod.length);
  }
  console.log('  写しました: ' + n + '件');
  console.log(String.fromCharCode(10) + '※ テスト版に本番と同じ顧客情報が入りました。テスト版も必ずログインが要る設定のままにしてください。');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
