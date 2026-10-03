// 入庫制限を店舗ごとのキーへ写す（2026-10-04 ユーザー指示で店舗別にしたため）
//   元： {STOR}schedRestrictions（両店共通。そのまま残す＝控え）
//   先： {STOR}honten-schedRestrictions / {STOR}sanda-schedRestrictions
//   すでに店舗別のキーに中身がある時は触らない（上書きしない）。
//   node fb_split_restrictions.js            … 今の状態を見るだけ
//   node fb_split_restrictions.js --write    … 本番へ写す
//   node fb_split_restrictions.js --write --dev … テスト版へ写す
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
const days = o => (o && typeof o === 'object') ? Object.keys(o).length : 0;

(async () => {
  console.log((DEV ? 'テスト版' : '本番') + ' / ' + (WRITE ? '書き込みます' : '見るだけ（--write で書き込み）'));
  const old = await read(STOR + 'schedRestrictions');
  console.log('  元（両店共通）: ' + days(old) + '日ぶん');
  for (const store of ['honten', 'sanda']) {
    const k = STOR + store + '-schedRestrictions';
    const cur = await read(k);
    const label = store === 'honten' ? '本店' : '三田店';
    if (days(cur) > 0) { console.log('  ' + label + '：すでに ' + days(cur) + '日ぶんあるので触りません'); continue; }
    if (days(old) === 0) { console.log('  ' + label + '：写すものがありません'); continue; }
    if (!WRITE) { console.log('  ' + label + '：' + days(old) + '日ぶんを写せます（--write で実行）'); continue; }
    await write(k, old);
    const back = await read(k);
    console.log('  ' + label + '：' + days(back) + '日ぶんを写しました → ' + k);
  }
  console.log('※ 元の ' + STOR + 'schedRestrictions は残してあります（控え）。');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
