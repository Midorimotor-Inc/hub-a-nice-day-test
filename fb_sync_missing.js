// 顧客リストの「スケジュール同期チェック」で出る〈反映漏れ〉を、画面の外から数えて一覧にする（2026-09-30）。
//   customers.html の handleSyncCheck と同じ判定：
//     顧客ファイルで status==='confirm' かつ 入庫日あり なのに、その日の insp に同じ人の行が無い＝漏れ。
//   読むだけ。何も書かない。
//   node fb_sync_missing.js [--dev]
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const STOR = process.argv.indexOf('--dev') >= 0 ? 'hub-v8-dev-' : 'hub-v8-';

const read = async k => { const d = await db.collection('kv').doc(k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
// customers.html の toDk と同じ：入庫日の文字列を "YYYY-M-D" に直す
const toDk = s => {
  if (!s) return '';
  const m = String(s).match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (m) return m[1] + '-' + Number(m[2]) + '-' + Number(m[3]);
  return '';
};
const dkNum = dk => { const p = String(dk).split('-'); return Number(p[0]) * 10000 + Number(p[1]) * 100 + Number(p[2]); };

(async () => {
  const insp = (await read(STOR + 'insp')) || {};
  const idx = (await read(STOR + 'cf-index')) || [];
  const all = [];
  for (const fi of idx) {
    const fidx = await read(STOR + 'cf-' + fi.name + '-index');
    if (!fidx) continue;
    for (let i = 0; i < fidx.chunks; i++) {
      const c = await read(STOR + 'cf-' + fi.name + '-chunk-' + i);
      (c || []).forEach(r => all.push(Object.assign({ _file: fi.name }, r)));
    }
  }
  const confirmedWithDate = all.filter(c => c.status === 'confirm' && c.entryDate);
  const missing = confirmedWithDate.filter(c => {
    const dk = toDk(c.entryDate);
    if (!dk) return false;
    const rows = (insp[dk] || []).filter(r => r && r.bookingStatus !== 'cancelled');
    return !rows.some(r => (r.custId && r.custId === c.custId) || (r.name && r.name === c.name));
  });
  const CUT = dkNum('2026-9-22');
  const before = missing.filter(c => dkNum(toDk(c.entryDate)) < CUT);
  const after = missing.filter(c => dkNum(toDk(c.entryDate)) >= CUT);
  console.log('■ ' + (STOR === 'hub-v8-' ? 'メイン（本番）' : 'テスト版') + '　顧客ファイル ' + idx.map(f => f.name).join('・'));
  console.log('  本予約・入庫日あり ' + confirmedWithDate.length + '件　うち反映漏れ ' + missing.length + '件');
  console.log('\n── 9/22 より前の漏れ（' + before.length + '件） ──');
  before.sort((a, b) => dkNum(toDk(a.entryDate)) - dkNum(toDk(b.entryDate)))
    .forEach(c => console.log('  ' + toDk(c.entryDate) + '　' + (c.name || '?') + '　' + (c.carType || '') + '　ナンバー' + (c.no == null ? '' : c.no) + '　[' + c._file + ' ' + c.rowIdx + '行]'));
  console.log('\n── 9/22 以降の漏れ（' + after.length + '件・今回は触らない） ──');
  after.sort((a, b) => dkNum(toDk(a.entryDate)) - dkNum(toDk(b.entryDate)))
    .forEach(c => console.log('  ' + toDk(c.entryDate) + '　' + (c.name || '?') + '　' + (c.carType || '') + '　[' + c._file + ' ' + c.rowIdx + '行]'));
  process.exit(0);
})().catch(e => { console.error('できませんでした:', e.message); process.exit(1); });
