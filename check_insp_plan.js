// 「新車から 1か月 → 6か月 → 12か月 → 12か月 → 車検」の自動設計ができているかを、
// 本番の実データ（vehicles-v2）で確かめる。読み取りのみ・画面と同じ関数をそのまま取り出して使う。
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync('C:/Users/A/HUB-A-NICE-DAY-DEV/index_dev.html', 'utf8');

// 画面の純関数をそのまま切り出す（写し間違いを防ぐため、コードを複製しない）
const from = SRC.indexOf('const vehIsSuzuki=');
const to = SRC.indexOf('const vehInspState=');
if (from < 0 || to < 0 || to < from) { console.error('関数の切り出しに失敗'); process.exit(1); }
const code = SRC.slice(from, to);
const box = {};
new Function('box', code + ';Object.assign(box,{vehIsSuzuki,vehAlertKinds,vehAddMonths,vehBase,vehIsNewPeriod,vehM12List,vehM12Done,vehInspDue,vehDays});')(box);
const { vehIsSuzuki, vehAlertKinds, vehBase, vehIsNewPeriod, vehM12List, vehInspDue, vehAddMonths } = box;

const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json', 'utf8'))) });
const db = admin.firestore();

const mo = (a, b) => { // a→b の月数
  if (!a || !b) return null;
  const p = String(a).split('-').map(Number), q = String(b).split('-').map(Number);
  return (q[0] - p[0]) * 12 + ((q[1] || 1) - (p[1] || 1));
};

(async () => {
  const d = await db.collection('kv').doc('hub-v8-vehicles-v2').get();
  const all = JSON.parse(d.data().v).filter(v => v && v.id);
  const live = all.filter(v => !v.archived);
  console.log('本番の車両 ' + all.length + '台（現役 ' + live.length + '台）\n');

  // ① 設計どおりの並びになるか（新車の乗用＝スズキ）
  const newCars = live.filter(v => vehIsNewPeriod(v));
  console.log('■ ① 「初回車検までの新車」と判定された車: ' + newCars.length + '台');
  console.log('   並びが 1か月→6か月→12か月→12か月→車検 になっているか\n');
  let ok = 0, ng = 0;
  const show = [];
  newCars.forEach(v => {
    const b = vehBase(v), m1 = vehInspDue(v, 'm1'), m6 = vehInspDue(v, 'm6'), list = vehM12List(v);
    const seq = [m1, m6, ...list, v.expiry].filter(Boolean);
    const sorted = seq.slice().sort();
    const good = m1 && m6 && list.length === (v.cargo4 ? 1 : 2) && JSON.stringify(seq) === JSON.stringify(sorted)
      && mo(b, m1) === 1 && mo(b, m6) === 6 && mo(b, list[0]) === 12 && (v.cargo4 || mo(b, list[1]) === 24);
    if (good) ok++; else ng++;
    if (show.length < 6 || !good) show.push({ v, b, m1, m6, list, good });
  });
  show.slice(0, 10).forEach(({ v, b, m1, m6, list, good }) => {
    console.log('   ' + (good ? '✔' : '✖') + ' ' + String(v.name || '').slice(0, 12).padEnd(13) + (v.num || '').padEnd(6) +
      ' 登録(基準) ' + b + '  → 1か月 ' + m1 + ' / 6か月 ' + m6 +
      ' / 12か月 ' + list.join(' , ') + ' / 車検 ' + (v.expiry || '—') + (v.cargo4 ? '  [4ナンバー]' : ''));
  });
  console.log('\n   設計どおり ' + ok + '台 ／ 食い違い ' + ng + '台');

  // ② 12か月点検の回数
  const cnt = {};
  live.forEach(v => { const n = vehM12List(v).length; cnt[n] = (cnt[n] || 0) + 1; });
  console.log('\n■ ② 12か月点検の回数の内訳（現役 ' + live.length + '台）: ' +
    Object.entries(cnt).sort().map(([k, n]) => k + '回:' + n + '台').join('  '));
  const kuruma = live.filter(v => vehIsNewPeriod(v) && !v.cargo4);
  console.log('   新車の乗用 ' + kuruma.length + '台のうち 12か月が2回の車: ' + kuruma.filter(v => vehM12List(v).length === 2).length + '台');
  const k4 = live.filter(v => vehIsNewPeriod(v) && v.cargo4);
  console.log('   新車の4ナンバー ' + k4.length + '台のうち 12か月が1回の車: ' + k4.filter(v => vehM12List(v).length === 1).length + '台');

  // ③ 1か月・6か月が「新車の間だけ」になっているか
  const oldCars = live.filter(v => !vehIsNewPeriod(v));
  const leak = oldCars.filter(v => vehInspDue(v, 'm1') || vehInspDue(v, 'm6'));
  console.log('\n■ ③ 新車でない ' + oldCars.length + '台に 1か月・6か月が出ていないか: ' + (leak.length === 0 ? '✔ 出ていない' : '✖ ' + leak.length + '台に出ている'));

  // ④ 知らせる対象（スズキ＝3つ／スズキ以外のレンタカー＝12か月だけ）
  const kinds = {};
  live.forEach(v => { const k = vehAlertKinds(v).join('+') || '(出さない)'; kinds[k] = (kinds[k] || 0) + 1; });
  console.log('\n■ ④ 知らせる点検の内訳: ' + Object.entries(kinds).map(([k, n]) => k + ':' + n + '台').join('  '));
  const badRental = live.filter(v => !vehIsSuzuki(v) && (v.purpose === 'rental' || v.group === 'rental') && vehAlertKinds(v).join('+') !== 'm12');
  console.log('   スズキ以外のレンタカーで 12か月だけになっていない車: ' + badRental.length + '台');

  // ⑤ 期日が出せない車（基準日が無い）
  const noBase = live.filter(v => !vehBase(v));
  console.log('\n■ ⑤ 基準日（登録日/満了日）が無くて期日を出せない車: ' + noBase.length + '台' +
    (noBase.length ? ' → ' + noBase.slice(0, 5).map(v => (v.name || '') + '(' + (v.num || '') + ')').join(' , ') : ''));
  process.exit(0);
})();
