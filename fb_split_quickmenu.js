// クイックメニューを「車検の備考用」と「一般整備の内容用」に分ける（2026-11-04 ユーザー指示）
//   それまで setItems / setGroups を車検の【備考】と一般整備の【内容】で使い回していたので、
//   片方を直すともう片方も変わった（＝連動していた）。v3.98.0 からキーを2組に分けた。
//   元： {STOR}setItems   / {STOR}setGroups   … 一般整備の【内容】用（そのまま残す）
//   先： {STOR}inspItems  / {STOR}inspGroups  … 車検の【備考】用（今の中身を写して始める）
//   ★写すだけ。元は1文字も変えない。先に中身がある時は触らない（上書きしない）。
//   node fb_split_quickmenu.js             … 今の状態を見るだけ
//   node fb_split_quickmenu.js --write     … 本番へ写す
//   node fb_split_quickmenu.js --write --dev … テスト版へ写す
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const WRITE = process.argv.indexOf('--write') >= 0;
const DEV = process.argv.indexOf('--dev') >= 0;
const STOR = DEV ? 'hub-v8-dev-' : 'hub-v8-';
const read = async k => { const d = await db.collection('kv').doc(k).get(); if (!d.exists) return null; try { return JSON.parse(d.data().v); } catch (e) { return null; } };
const write = async (k, v) => db.collection('kv').doc(k).set({ v: JSON.stringify(v), u: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
const n = a => Array.isArray(a) ? a.length : 0;

const PAIRS = [
  { from: 'setItems', to: 'inspItems', label: '定型文' },
  { from: 'setGroups', to: 'inspGroups', label: 'グループ' },
];

(async () => {
  console.log((DEV ? 'テスト版' : '本番') + ' / ' + (WRITE ? '書き込みます' : '見るだけ（--write で書き込み）'));
  // 書く前に、両方の今の中身を控えに残す（リポジトリの外）
  const snap = {};
  for (const p of PAIRS) { snap[p.from] = await read(STOR + p.from); snap[p.to] = await read(STOR + p.to); }
  if (WRITE) {
    const dir = 'C:/Users/A/Documents/Hub重要書類';
    const d = new Date(), z = x => String(x).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
    const out = path.join(dir, 'quickmenu-before-' + (DEV ? 'dev' : 'prod') + '-' + stamp + '.json');
    if (fs.existsSync(dir)) { fs.writeFileSync(out, JSON.stringify(snap, null, 2)); console.log('  控え: ' + out); }
    else console.log('  ※ 控えの置き場所が見つかりません: ' + dir);
  }
  for (const p of PAIRS) {
    const old = snap[p.from], cur = snap[p.to];
    console.log('  ' + p.label + '：一般整備 ' + n(old) + '件 → 車検 ' + n(cur) + '件');
    if (n(cur) > 0) { console.log('    車検側にすでに ' + n(cur) + '件あるので触りません'); continue; }
    if (n(old) === 0) { console.log('    写すものがありません（画面の既定が出ます）'); continue; }
    if (!WRITE) { console.log('    ' + n(old) + '件を写せます（--write で実行）'); continue; }
    await write(STOR + p.to, old);
    const back = await read(STOR + p.to);
    if (JSON.stringify(back) !== JSON.stringify(old)) { console.error('    ✖ 書いた中身が読み直せません: ' + STOR + p.to); process.exit(1); }
    console.log('    ' + n(back) + '件を写しました → ' + STOR + p.to);
  }
  console.log('※ 元の ' + STOR + 'setItems / ' + STOR + 'setGroups は変えていません（一般整備の分）。');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
