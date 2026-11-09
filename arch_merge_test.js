// 保管箱（insp-arch）の「その日ごと置き換え」バグの検査（2026-11-09・本番 2026-9-26 の消失から）
//   【何が起きていたか】14日より前の日に予約を1件足すと
//     ① 画面が {...保管箱, ...insp} の合体で、その日の既存の予約を丸ごと覆い隠す
//     ② 翌朝の仕分けが arch[k]=hot[k] で、その日ごと置き換える＝過去の車検が永久に消える
//   実データ：元6件 → 11/2 に吉岡健を1件足す → 11/3 の仕分けで6件消滅 →
//            11/8 に3件入れ直す → 11/9 の仕分けで吉岡健が消滅（＝回り続けていた）
//   実行: node arch_merge_test.js
//   ★この検査は Firestore に一切つながらない（純関数とファイルの中身だけを見る）。
const fs = require('fs'), path = require('path');
const F = n => fs.readFileSync(path.join(__dirname, n), 'utf8');
const PC = F('index_dev.html'), CU = F('customers.html'), MO = F('mobile.html');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const NL = String.fromCharCode(10);
const head = s => console.log(NL + '■ ' + s);

// 「const 名前 = …;」を1つ取り出す（中かっこの対応を数えて終わりを見つける）
const grab = (name, src) => {
  const m = src.indexOf(NL + 'const ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  let i = m + 1, depth = 0, started = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0 && started) return src.slice(m + 1, i + 1);
  }
  throw new Error(name + ' の終わりが分かりません');
};
const sandbox = {};
new Function('exports', ['archSameRow', 'archMergeDay', 'mergeInspWithArch'].map(n => grab(n, PC)).join(NL)
  + NL + 'exports.archMergeDay=archMergeDay;exports.archSameRow=archSameRow;exports.mergeInspWithArch=mergeInspWithArch;')(sandbox);
const { archMergeDay, archSameRow, mergeInspWithArch } = sandbox;

const DK = '2026-9-26';
// 本番 2026-9-26 の元の6件（10/28 の控えから＝実際に消えた予約）
const mk = (name, carType, no, store, time, course, seq, custId) => {
  const r = { name, carType, store, time, course, seq, bookingStatus: 'confirmed', bookingKey: '' };
  if (no) r.no = no; if (custId) r.custId = custId; return r;
};
const ORIG = [
  mk('船場　裕次', 'スイフト', 1874, 'sanda', '09:30', 3, 1790131880840, '202610__82__船場裕次__1874'),
  mk('田中　直人', 'ワゴンＲ', 7745, 'sanda', '09:00', 2, 1790131880841, '202610__187__田中直人__7745'),
  mk('寺本', 'エヴリィ', 0, 'honten', '09:00', 2, 1790137119137, ''),
  mk('玉井様', 'バンディット', 0, 'honten', '09:00', 3, 1790133342524, ''),
  mk('吉岡様', 'バンディット', 0, 'honten', '10:00', 1, 1790133342526, ''),
  mk('山根　愛美', 'クロスビー', 1333, 'honten', '14:00', 1, 1790137229690, '202610__68__山根愛美__1333'),
].map((r, i) => ({ ...r, bookingKey: 'insp-' + DK + '-' + i }));
// ★解説文（// の行）を落としてから調べる。落とさないと、バグの説明に書いた
// 古い書き方そのものに当たってしまい、直していても不合格になる。
const codeOf = s => s.split(NL).filter(L => L.trim().indexOf('//') !== 0).join(NL);
const PCc = codeOf(PC), CUc = codeOf(CU), MOc = codeOf(MO);
const names = rows => (rows || []).filter(r => r && r.name).map(r => r.name);

head('① archMergeDay ＝ 置き換えずに足す');
t('保管箱にその日が無ければ、そのまま入れる',
  JSON.stringify(archMergeDay(undefined, [ORIG[0]], DK)) === JSON.stringify([ORIG[0]]));
const YOSHI = { ...mk('吉岡　健', 'スペーシア', 3182, 'honten', '10:00', 2, 1793000000000, '202609__12__吉岡健__3182'), bookingKey: 'insp-' + DK + '-0' };
const r1 = archMergeDay(ORIG, [YOSHI], DK);
t('★元の6件が1件も消えない', names(r1).length === 7, names(r1));
t('元の6件は位置も中身もそのまま', JSON.stringify(r1.slice(0, 6)) === JSON.stringify(ORIG));
t('足した1件はいちばん後ろ', r1[6].name === '吉岡　健');
t('★足した行の代車の紐付けが新しい行番号になる（保管箱の行と衝突しない）', r1[6].bookingKey === 'insp-' + DK + '-6', r1[6].bookingKey);
t('代車の紐付けが空の行はそのまま', archMergeDay(ORIG, [{ ...YOSHI, bookingKey: '' }], DK)[6].bookingKey === '');

head('② 同じ予約が両方にある時は1つにまとめる（位置は動かさない）');
const again = { ...ORIG[0], seq: 1794107665631, time: '10:00' };   // 11/8 に入れ直した船場さん
const r2 = archMergeDay(ORIG, [again], DK);
t('件数は増えない（6件のまま）', names(r2).length === 6, names(r2));
t('位置は元のまま（0番目）', r2[0].name === '船場　裕次');
t('中身は新しい方になる', r2[0].seq === 1794107665631 && r2[0].time === '10:00');
t('custId が同じなら同じ予約とみなす', archSameRow(ORIG[0], again));
t('seq が同じでも同じ予約とみなす', archSameRow({ seq: 5 }, { seq: 5 }));
t('氏名＋ナンバーが同じなら同じ予約とみなす', archSameRow({ name: '寺本', no: 12 }, { name: '寺本', no: '12' }));
t('別人は別ものと見る', !archSameRow(ORIG[0], ORIG[1]));
t('空き行（氏名なし）は足さない', names(archMergeDay(ORIG, [null, {}, { name: '' }], DK)).length === 6);

head('③ 本番 2026-9-26 で起きたことを、直したあとの仕組みで通してみる');
const arch = { [DK]: ORIG.slice() };
const hot = { [DK]: [YOSHI] };
arch[DK] = archMergeDay(arch[DK], hot[DK], DK); delete hot[DK];      // 11/3 の仕分け
t('11/3 の仕分けのあと 7件ある', names(arch[DK]).length === 7, names(arch[DK]));
// 11/8 江川さんが同期チェックから3件を入れ直す → 11/9 の仕分け
hot[DK] = [{ ...ORIG[0], seq: 1794107665631 }, { ...ORIG[5], seq: 1794107754866 }, { ...ORIG[1], seq: 1794107830257 }];
arch[DK] = archMergeDay(arch[DK], hot[DK], DK); delete hot[DK];
t('★11/9 の仕分けでも 7件のまま（誰も消えない）', names(arch[DK]).length === 7, names(arch[DK]));
['寺本', '玉井様', '吉岡様', '吉岡　健'].forEach(n =>
  t('★' + n + ' が残っている', names(arch[DK]).indexOf(n) >= 0));

head('④ 画面の合体（mergeInspWithArch）＝覆い隠さない');
const shown = mergeInspWithArch({ [DK]: ORIG.slice() }, { [DK]: [YOSHI], '2026-11-20': [YOSHI] });
t('★保管箱の日に1件入れても、その日の6件が画面から消えない', names(shown[DK]).length === 7, names(shown[DK]));
t('保管箱に無い日はそのまま出る', names(shown['2026-11-20']).length === 1);
t('保管箱が空なら insp をそのまま返す', mergeInspWithArch({}, { [DK]: [YOSHI] })[DK].length === 1);
const only = mergeInspWithArch({ '2026-8-1': [ORIG[0]] }, { [DK]: [YOSHI] });
t('保管箱にしか無い日も出る', names(only['2026-8-1']).length === 1 && names(only[DK]).length === 1);
t('★空の配列が保管箱を覆い隠さない',
  names(mergeInspWithArch({ [DK]: ORIG.slice() }, { [DK]: [] })[DK]).length === 6);

head('⑤ 仕分け（fbArchiveOldInsp）が置き換えに戻っていないか');
t('★arch[k] = hot[k] の書き方が無い', PCc.indexOf('arch[k] = hot[k]') < 0);
t('archMergeDay を通している', PC.indexOf('arch[k] = archMergeDay(arch[k], hot[k], k)') >= 0);

head('⑥ 予約を書く前に保管箱から引き戻しているか');
[['スケジュール', PC], ['顧客リスト', CU], ['スマホ', MO]].forEach(([nm, s]) => {
  t(nm + '：hubUnarchiveDay がある', s.indexOf('const hubUnarchiveDay') >= 0);
  t(nm + '：画面の合体が mergeInspWithArch になっている', /mergeInspWithArch\(inspArch/.test(s));
  t(nm + '：★日付キーごと置き換える古い書き方が残っていない',
    codeOf(s).indexOf('{...inspArch, ...hotInsp}') < 0 && codeOf(s).indexOf('{...inspArch,...hotInsp}') < 0);
  t(nm + '：insp と保管箱を1つのトランザクションで書く',
    /runTransaction[\s\S]{0,1600}insp-arch[\s\S]{0,1000}archMergeDay/.test(s));
});
t('スケジュール：保存の本体が引き戻しを呼ぶ', PC.indexOf('await hubUnarchiveDay(_vDk);') >= 0);
t('スケジュール：persistInsp も引き戻せる（unarch）', PC.indexOf('if(o.unarch&&o.dk) await hubUnarchiveDay(o.dk);') >= 0);
t('スケジュール：リストからの本予約で unarch を渡している', /verb:'保存',dk,unarch:true/.test(PC));
t('スケジュール：控えの送り直しでも unarch を渡している', /verb:'送り直し',unarch:true/.test(PC));
t('顧客リスト：リストからの予約が引き戻しを呼ぶ', CU.indexOf('await hubUnarchiveDay(dkFormatted);') >= 0);
t('顧客リスト：同期チェックの修復が引き戻しを呼ぶ', CU.indexOf('await hubUnarchiveDay(_adk)') >= 0);
t('★顧客リスト：同期チェックが「手で入れてください」と見送らない',
  CUc.indexOf('保管箱の日なので手で入れてください') < 0);
t('スマホ：保存が引き戻しを呼ぶ', MO.indexOf('await hubUnarchiveDay(tDk);') >= 0);

console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
console.log((fail === 0 ? '✅ PASS' : '❌ FAIL') + '　合格 ' + pass + ' 件 / 不合格 ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
