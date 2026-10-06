// 共有データのマージ（mergeSharedObjects）が、数値などの値を壊さないことの検査（2026-09-24）。
//   車検台数制限 inspLimits は {日付: 台数} の形。以前はマージで {...5} → {} になり、
//   ・台数制限が「勝手に解除」される
//   ・その月を開くと画面が落ちる（React error #31：中身 {} を表示しようとした）
//   実行: node merge_scalar_test.js
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra)); } };
const pick = (file) => {
  const s = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const i = s.indexOf('const SHARED_FRESH_MS');
  const j = s.indexOf('mergeSharedObjects', i);
  const k = s.indexOf('\n};', j) >= 0 ? s.indexOf('\n};', j) + 3 : s.indexOf('\n}', j) + 2;
  // index_dev.html からは「自分が書いた所」を覚える仕掛けも一緒に取り出す（2026-10-06）
  const tail = '\nreturn {merge: mergeSharedObjects, mark: (typeof shMineMark===\u0022function\u0022)?shMineMark:null};';
  return new Function(s.slice(i, k) + tail)();
};
for (const file of ['index_dev.html', 'customers.html']) {
  console.log('=== ' + file);
  const got = pick(file);
  const mark = got.mark;
  const KEY = 'hub-v8-dev-honten-lres';
  const merge = (local, server, now) => got.merge(local, server, now, KEY);
  const now = Date.now();
  // ① 台数制限（数値）は壊れない
  const r1 = merge({ '2026-11-2': 3 }, { '2026-11-2': 3, '2026-11-3': 5 }, now);
  t('数値のままで残る（{} に化けない）', r1['2026-11-2'] === 3 && r1['2026-11-3'] === 5, r1);
  // ② サーバーにだけある日も残る
  const r2 = merge({}, { '2026-12-1': 0 }, now);
  t('サーバーにだけある値も残る', r2['2026-12-1'] === 0, r2);
  // ③ 文字列・null も壊さない
  const r3 = merge({ a: 'x', b: null }, { a: 'y', b: 2 }, now);
  t('文字列・null もサーバー値を使う', r3.a === 'y' && r3.b === 2, r3);
  // ④ これまでどおり {車:{日:予約}} はマージする（作りたてのローカル分は残る）
  const rec = { id: now, name: 'テスト' };
  // ★自分が今入れた代車予約は、サーバーがまだ知らなくても残る（2026-08-26 の「代車が消える」対策）
  if (mark) mark(KEY, { car1: {} }, { car1: { '2026-9-1': rec } });
  const r4 = merge({ car1: { '2026-9-1': rec } }, { car1: {}, car2: { '2026-9-2': { id: 1, name: 'サーバー' } } }, now);
  t('自分が入れたばかりの代車予約は残る', r4.car1['2026-9-1'] && r4.car1['2026-9-1'].name === 'テスト' && r4.car2['2026-9-2'].name === 'サーバー', r4);
  // ★他の人が入れて他の人が消した分は作り直さない（2026-10-06 の「幽霊の行」対策）
  if (mark) {
    const r4b = got.merge({ car9: { '2026-9-1': { id: now, name: '他の人のもの' } } }, { car9: {} }, now, 'hub-v8-dev-sanda-lres');
    t('他の人が消した分は作り直さない', !r4b.car9['2026-9-1'], r4b);
  }
  // ⑤ 配列はサーバー値のまま
  const r5 = merge({ k: [1, 2] }, { k: [3] }, now);
  t('配列はサーバー値のまま', Array.isArray(r5.k) && r5.k.length === 1, r5);
}
console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
process.exit(fail ? 1 : 0);
