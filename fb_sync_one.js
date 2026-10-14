// 「ズレ」に出た人の実データを丸ごと出して、なぜそうなっているかを調べる。2026-10-14
//   実行: node fb_sync_one.js 山谷 前田 岸本        … 本番
//         node fb_sync_one.js --dev 山谷            … テスト版
//   **読み取りだけ**（Firestore には何も書かない）。
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const args = process.argv.slice(2).filter(a => a !== '--dev');
const STOR = process.argv.includes('--dev') ? 'hub-v8-dev-' : 'hub-v8-';
const NL = String.fromCharCode(10);
const kv = async (k) => { const s = await db.collection('kv').doc(STOR + k).get(); if (!s.exists) return null; try { return JSON.parse(s.data().v); } catch (e) { return null; } };
const ts = ms => (ms && ms > 1e12) ? new Date(ms + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16) : (ms || '-');
const show = (o, keys) => keys.filter(k => o[k] !== undefined && o[k] !== '' && o[k] !== null).map(k => k + '=' + JSON.stringify(o[k])).join(' ');

(async () => {
  if (!args.length) { console.log('氏名を渡してください（例: node fb_sync_one.js 山谷）'); process.exit(0); }
  const [insp, arch, schedH, schedS, lresH, lresS, rres] = await Promise.all(
    ['insp', 'insp-arch', 'honten-sched', 'sanda-sched', 'honten-lres', 'sanda-lres', 'rres'].map(kv));
  const inspData = Object.assign({}, arch || {}, insp || {});
  for (const q of args) {
    console.log('');
    console.log('════════ 「' + q + '」 ════════');
    // 車検の行
    Object.keys(inspData).forEach(dk => (inspData[dk] || []).forEach((r, i) => {
      if (r && r.name && r.name.indexOf(q) >= 0)
        console.log('  [車検] ' + dk + ' 行' + i + '（' + ((r.store || 'honten') === 'honten' ? '本店' : '三田店') + '）'
          + NL + '      ' + show(r, ['name', 'carType', 'no', 'time', 'course', 'loaner', 'loanerId', 'rentalLabel', 'rentalCarId', 'entryDate', 'deliveryDate', 'note', 'seq', 'id']));
    }));
    // 整備の行
    [['honten', schedH], ['sanda', schedS]].forEach(([sid, sd]) => {
      Object.keys(sd || {}).forEach(dk => Object.keys(sd[dk] || {}).forEach(k => {
        const r = sd[dk][k];
        if (r && r.name && r.name.indexOf(q) >= 0)
          console.log('  [整備] ' + dk + ' 枠「' + k + '」（' + (sid === 'honten' ? '本店' : '三田店') + '）'
            + NL + '      ' + show(r, ['name', 'carType', 'no', 'work', 'content', 'loaner', 'loanerId', 'rentalLabel', 'rentalCarId', 'entryDate', 'deliveryDate', 'staff', 'at', 'id']));
      }));
    });
    // 代車・レンタカーの帯
    [['本店の代車', lresH], ['三田店の代車', lresS], ['レンタカー(共通)', rres]].forEach(([label, obj]) => {
      Object.keys(obj || {}).forEach(cid => Object.values(obj[cid] || {}).forEach(r => {
        if (r && String(r.user || '').indexOf(q) >= 0)
          console.log('  [' + label + '] 車ID ' + cid + '　' + (r.fm + 1) + '/' + r.fd + '→' + (r.tm + 1) + '/' + r.td
            + NL + '      ' + show(r, ['user', 'carName', 'carNum', 'bookingKey', 'locked', 'id', 'savedAt'])
            + (r.savedAt ? ('　最後に保存=' + ts(r.savedAt)) : ''));
      }));
    });
  }
  console.log('');
  process.exit(0);
})();
