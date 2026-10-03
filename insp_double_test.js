// 顧客リストから予約の日を変えた時に二重にならないかの検査（2026-10-04 現場報告）
//   customers.html の中の純関数（画面を開かずに動かせる部分）をそのまま取り出して確かめる。
//   ・custId が変わっていても（＝月ファイルを取り込み直した後でも）古い予約を見つけられるか
//   ・「両方残す」を選んだ時は消さないか
//   ・同じ人でも別の車（車種が違う）なら消さないか
//   実行: node insp_double_test.js
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'customers.html'), 'utf8');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

// customers.html から「const 名前 = …;」を1つ取り出す（中かっこの対応を数えて終わりを見つける）
const grab = (name) => {
  const m = SRC.indexOf(String.fromCharCode(10) + 'const ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  let i = m + 1, depth = 0, started = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0 && started) return SRC.slice(m + 1, i + 1);   // 終わりは「深さ0の ;」だけで見る
  }
  throw new Error(name + ' の終わりが分かりません');
};
const code = ['bkNorm', 'isSameVehicleRow', 'findOtherDayRows', 'resDropForMove', 'applyBookingToInsp', 'recomputeInspApproval', 'applyMahPendingRule']
  .map(grab).join(String.fromCharCode(10));
const sandbox = {};
new Function('exports', code + String.fromCharCode(10) +
  'exports.applyBookingToInsp=applyBookingToInsp;exports.findOtherDayRows=findOtherDayRows;exports.isSameVehicleRow=isSameVehicleRow;exports.resDropForMove=resDropForMove;')(sandbox);
const { applyBookingToInsp, findOtherDayRows, isSameVehicleRow, resDropForMove } = sandbox;

const D1 = '2026-10-24', D2 = '2026-10-31';
const CUST = { name: '山東　庸子', carType: 'スペーシア', no: 5902, custId: '202612__121__山東庸子__5902' };
// 10/24 に入っている予約。custId はファイルを取り込み直す前のもの（行番号が違う）
const oldRow = { name: '山東 庸子', carType: 'スペーシア', no: 5902, course: 2, store: 'sanda',
  bookingStatus: 'confirmed', seq: 1000, custId: '202612__9__山東庸子__5902', bookingKey: `insp-${D1}-0` };
const base = { [D1]: [oldRow], [D2]: [] };
const row = { name: CUST.name, carType: CUST.carType, no: CUST.no, course: 2, store: 'sanda', bookingStatus: 'confirmed' };
const alive = (data, d) => ((data && data[d]) || []).filter(r => r && r.name && r.bookingStatus !== 'cancelled');

head('① custId が変わっていても、同じ車の予約として見つけられる');
const others = findOtherDayRows(base, CUST, D2);
t('10/24 の予約を見つける', others.length === 1 && others[0].dk === D1, others);
t('氏名の全角スペースの違いは気にしない', isSameVehicleRow(oldRow, CUST));
t('別の車（車種が違う）は別ものと見る', !isSameVehicleRow({ ...oldRow, carType: 'ハスラー' }, CUST));
t('同じ4桁ナンバーの別人も別ものと見る', !isSameVehicleRow({ ...oldRow, name: '阿部　佳世子' }, CUST));

head('② 「移す」を選んだ時（movePerson=true）');
const moved = applyBookingToInsp(base, { customer: CUST, dkFormatted: D2, row, inspLimits: {}, movePerson: true });
t('10/31 に1件入る', alive(moved.data, D2).length === 1, alive(moved.data, D2).map(r => r.name));
t('★10/24 からは消える（二重予約にならない）', alive(moved.data, D1).length === 0, alive(moved.data, D1).map(r => r.name));
t('代車の紐付け（bookingKey）が新しい日になる', alive(moved.data, D2)[0].bookingKey === `insp-${D2}-0`, alive(moved.data, D2)[0].bookingKey);

head('③ 「両方残す」を選んだ時（movePerson=false）');
const kept = applyBookingToInsp(base, { customer: CUST, dkFormatted: D2, row, inspLimits: {}, movePerson: false });
t('10/31 に1件入る', alive(kept.data, D2).length === 1, alive(kept.data, D2).map(r => r.name));
t('10/24 の予約は残る', alive(kept.data, D1).length === 1, alive(kept.data, D1).map(r => r.name));

head('④ custId がそのまま合う時は、今までどおり黙って移る');
const sameId = { [D1]: [{ ...oldRow, custId: CUST.custId }], [D2]: [] };
const r4 = applyBookingToInsp(sameId, { customer: CUST, dkFormatted: D2, row, inspLimits: {}, movePerson: false });
t('custId が同じなら尋ねなくても消える', alive(r4.data, D1).length === 0 && alive(r4.data, D2).length === 1, { D1: alive(r4.data, D1).length, D2: alive(r4.data, D2).length });

head('⑤ 同じ人の「別の車」は巻き添えにしない');
const twoCars = { [D1]: [{ ...oldRow, carType: 'ハスラー', custId: '202612__55__山東庸子__5902' }], [D2]: [] };
const r5 = applyBookingToInsp(twoCars, { customer: CUST, dkFormatted: D2, row, inspLimits: {}, movePerson: true });
t('別の車の予約は 10/24 に残る', alive(r5.data, D1).length === 1, alive(r5.data, D1).map(r => r.carType));
t('尋ねる対象にもならない', findOtherDayRows(twoCars, CUST, D2).length === 0);

head('⑥ キャンセル済みの行は触らない');
const cancelled = { [D1]: [{ ...oldRow, bookingStatus: 'cancelled', custId: 'x' }], [D2]: [] };
t('キャンセル済みは尋ねる対象にしない', findOtherDayRows(cancelled, CUST, D2).length === 0);
const r6 = applyBookingToInsp(cancelled, { customer: CUST, dkFormatted: D2, row, inspLimits: {}, movePerson: true });
t('キャンセル済みの記録は消さない', ((r6.data[D1] || []).length === 1), r6.data[D1]);

head('⑦ 変更前の代車を消す（2026-10-04 報告）');
// 代車の形：{車ID:{キー:予約}}。8/24 から 8/28 まで借りていた予約
const lres = {
  car1: { '2026-7-24': { id: 1, bookingKey: `insp-${D1}-0`, user: '山東　庸子', custId: '202612__9__山東庸子__5902', fy: 2026, fm: 7, fd: 24, ty: 2026, tm: 7, td: 28 } },
  car2: { '2026-7-24': { id: 2, bookingKey: 'insp-2026-8-24-1', user: '別の人', fy: 2026, fm: 7, fd: 24, ty: 2026, tm: 7, td: 26 } },
};
const dropped = resDropForMove(lres, { keys: [`insp-${D1}-0`], custId: CUST.custId, name: CUST.name, dks: [D1] });
t('変更前の予約の代車が消える', !!dropped && Object.keys(dropped.car1 || {}).length === 0, dropped && dropped.car1);
t('ほかの人の代車は残る', !!dropped && Object.keys(dropped.car2 || {}).length === 1, dropped && dropped.car2);
// bookingKey がずれていても、その人＋その日の始まりで見つける
const lres2 = { car1: { k: { id: 3, bookingKey: 'insp-ずれた-9', user: '山東 庸子', fy: 2026, fm: 9, fd: 24, ty: 2026, fd2: 0, td: 28, tm: 9 } } };
const dropped2 = resDropForMove(lres2, { keys: [], custId: '', name: CUST.name, dks: ['2026-10-24'] });
t('紐付けがずれていても、その人のその日の代車なら消える', !!dropped2 && Object.keys(dropped2.car1 || {}).length === 0, dropped2 && dropped2.car1);
// 消すものが無ければ何も返さない（＝書き込みをしない）
t('消すものが無い時は書き込まない', resDropForMove(lres2, { keys: [], custId: '', name: '誰か', dks: ['2026-10-24'] }) === undefined);

console.log(String.fromCharCode(10) + `結果: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
