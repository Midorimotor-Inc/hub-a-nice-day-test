// ナンバーは【1枠だけ】／2年前予約の入力チェック（v3.125.0・2026-11-19 ユーザー決定・A案）
//   ★画面の純関数を index_dev.html と mobile.html から【そのまま切り出して】当てる。
//     同じ計算を検査側に書き写さないこと（写し間違いで「検査は通るのに画面はずれる」が起きる）。
//   ★PC とスマホで1文字も違わないことも見張る（2ファイルに同じものを置く決まり）。
//   実行: node plate_one_test.js
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const DIR = __dirname;
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);

// その1本のかたまりをファイルから切り出す
const cut = (file) => {
  const s = fs.readFileSync(path.join(DIR, file), 'utf8');
  const a = s.indexOf('const platePick');
  const b = s.indexOf('// ★マッハの', a);
  if (a < 0 || b < 0) return null;
  return s.slice(a, b);
};
const pc = cut('index_dev.html'), mb = cut('mobile.html');

head('① 道具が2つのファイルに入っていて、中身がそろっている');
t('★PC（index_dev.html）に platePick ／ plateIsFull ／ plateJoin ／ nameIsFull ／ adv2yMissing がある',
  !!pc && ['platePick', 'plateIsFull', 'plateJoin', 'nameIsFull', 'adv2yMissing'].every(k => pc.indexOf('const ' + k) >= 0));
t('★スマホ（mobile.html）にも同じものがある',
  !!mb && ['platePick', 'plateIsFull', 'plateJoin', 'nameIsFull', 'adv2yMissing'].every(k => mb.indexOf('const ' + k) >= 0));
// 字下げ・空白・コメントの差は無視して、中身（式）がそろっているかを見る
const bare = s => String(s || '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
t('★★PC とスマホで中身が1文字も違わない（コメント・字下げは除く）', bare(pc) === bare(mb),
  { pc: bare(pc).length, mb: bare(mb).length });

// 切り出したものを動かす
const run = (src) => { const f = new Function(src + NL +
  'return {platePick,plateIsFull,plateJoin,nameIsFull,adv2yMissing};'); return f(); };
let F = null;
try { F = run(pc); } catch (e) { t('切り出した道具が動く', false, String(e)); }
if (!F) { console.log(NL + '❌ FAIL'); process.exit(1); }
t('切り出した道具が動く', true);

head('② 1枠に打った／貼った字を 地名／分類番号／かな／4桁 に切り分ける');
const CASES = [
  ['神戸 582 は 3182',   { noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }],
  ['神戸582は3182',      { noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }],
  ['姫路 300 あ 12-34',  { noChi: '姫路', noBun: '300', noKana: 'あ', no: '1234' }],   // ハイフンは外す
  ['神戸 5A0 わ 1',      { noChi: '神戸', noBun: '5A0', noKana: 'わ', no: '1' }],       // 分類に英字
  ['神戸 582 は ３３１０', { noChi: '神戸', noBun: '582', noKana: 'は', no: '3310' }],   // 全角 → 半角
  ['３３１０',            { noChi: '', noBun: '', noKana: '', no: '3310' }],
  ['3310',               { noChi: '', noBun: '', noKana: '', no: '3310' }],             // 古い予約（4桁だけ）
  ['神戸',               { noChi: '神戸', noBun: '', noKana: '', no: '' }],
  ['',                   { noChi: '', noBun: '', noKana: '', no: '' }],
  ['神戸・582・は・3182', { noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }],   // 中点も区切り
  ['  神戸  582  は  3182  ', { noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }],
];
for (const [raw, want] of CASES) {
  const got = F.platePick(raw);
  const ok = ['noChi', 'noBun', 'noKana', 'no'].every(k => got[k] === want[k]);
  t('「' + (raw.trim() || '(空)') + '」→ ' + JSON.stringify(want), ok, got);
}
t('★★4桁（no）はいつも「数字だけ」になる（照合に使うため）',
  CASES.every(([raw]) => /^[0-9]*$/.test(F.platePick(raw).no)));

head('③ フルナンバーかどうか（plateIsFull）');
t('4つそろえばフル', F.plateIsFull(F.platePick('神戸 582 は 3182')) === true);
t('4桁だけはフルでない', F.plateIsFull(F.platePick('3310')) === false);
t('かなが無ければフルでない', F.plateIsFull({ noChi: '神戸', noBun: '582', noKana: '', no: '3182' }) === false);
t('4桁が無ければフルでない', F.plateIsFull({ noChi: '神戸', noBun: '582', noKana: 'は', no: '' }) === false);
t('空の予約でも落ちない', F.plateIsFull(null) === false);

head('④ カードを開いた時に、持っている4つから1枠の字を組み立てる（plateJoin）');
t('フルは「神戸 582 は 3182」', F.plateJoin({ noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }) === '神戸 582 は 3182',
  F.plateJoin({ noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' }));
t('古い予約（4桁だけ）は「3310」', F.plateJoin({ no: '3310' }) === '3310', F.plateJoin({ no: '3310' }));
t('何も無ければ空', F.plateJoin({}) === '' && F.plateJoin(null) === '');
t('★★組み立てて → 切り分けると、元の4つに戻る（行き帰りで壊れない）',
  ['神戸 582 は 3182', '3310', '神戸 5A0 わ 1'].every(raw => {
    const a = F.platePick(raw), b = F.platePick(F.plateJoin(a));
    return ['noChi', 'noBun', 'noKana', 'no'].every(k => a[k] === b[k]);
  }));

head('⑤ お名前は【姓と名の間にスペース】がある時だけフルネーム（きびしい判定・ユーザー選択）');
t('「速水」は通さない', F.nameIsFull('速水') === false);
t('「速水 俊之」は通す（半角スペース）', F.nameIsFull('速水 俊之') === true);
t('「速水　俊之」も通す（全角スペース）', F.nameIsFull('速水　俊之') === true);
t('前後の空白だけでは通さない', F.nameIsFull('  速水  ') === false);
t('スペースはあっても字が1つなら通さない', F.nameIsFull('速 ') === false);
t('空は通さない', F.nameIsFull('') === false && F.nameIsFull(null) === false);
t('会社名のように長くてもスペースが無ければ通さない', F.nameIsFull('藤明建設工業株式会社') === false);

head('⑥ 2年前予約の時だけ、足りない項目を出す（adv2yMissing）');
const FULL = { adv2y: true, name: '速水 俊之', carType: 'スペーシア', phone: '090-1111-2222',
               noChi: '神戸', noBun: '582', noKana: 'は', no: '3182' };
t('★★2年前予約でなければ、何も言わない（今までどおり保存できる）',
  F.adv2yMissing({ ...FULL, adv2y: false }).length === 0 && F.adv2yMissing({}).length === 0 && F.adv2yMissing(null).length === 0);
t('そろっていれば空', F.adv2yMissing(FULL).length === 0, F.adv2yMissing(FULL));
const keys = f => F.adv2yMissing(f).map(x => x.key);
t('お名前が姓だけ → name', JSON.stringify(keys({ ...FULL, name: '速水' })) === '["name"]', keys({ ...FULL, name: '速水' }));
t('車種が空 → car', JSON.stringify(keys({ ...FULL, carType: '' })) === '["car"]', keys({ ...FULL, carType: '' }));
t('4桁しか無い → plate', JSON.stringify(keys({ ...FULL, noChi: '', noBun: '', noKana: '' })) === '["plate"]');
t('電話が空 → phone', JSON.stringify(keys({ ...FULL, phone: '' })) === '["phone"]');
t('電話が空白だけ → phone', JSON.stringify(keys({ ...FULL, phone: '   ' })) === '["phone"]');
t('★4つとも足りない時は4つ出る（並びはカードの上から下）',
  JSON.stringify(keys({ adv2y: true })) === '["name","car","plate","phone"]', keys({ adv2y: true }));
t('★どの項目にも読める言葉が付いている',
  F.adv2yMissing({ adv2y: true }).every(x => typeof x.label === 'string' && x.label.length > 1),
  F.adv2yMissing({ adv2y: true }).map(x => x.label));
t('★お名前の言葉には「スペース」が入っている（何をすればよいか分かる）',
  /スペース/.test(F.adv2yMissing({ adv2y: true, name: '速水' })[0].label));

head('⑦ 画面に残っていてはいけないもの');
for (const f of ['index_dev.html', 'mobile.html']) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  t(f + '：4つに分かれた枠の印（data-nochi など）がもう無い',
    ['data-nochi', 'data-nobun', 'data-nokana', 'data-nofour'].every(k => s.indexOf(k) < 0));
  t(f + '：1枠の印（data-plate）がある', s.indexOf('data-plate="1"') >= 0);
  t(f + '：plateFull は残してある（表に出す時はこれを通す）', s.indexOf('const plateFull') >= 0);
}
// ★PC の1枠に inputMode / maxLength を付けていないこと（次の欄の日本語入力が解除される／変換が壊れる）
const pcSrc = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
const pa = pcSrc.indexOf('<input ref={plateRef}');
const plateTag = pa < 0 ? '' : pcSrc.slice(pa, pa + 800);
t('★PC の1枠に inputMode を付けていない', !!plateTag && plateTag.indexOf('inputMode') < 0);
t('★PC の1枠に maxLength を付けていない（変換中の文字が切られて壊れる）', !!plateTag && plateTag.indexOf('maxLength') < 0);
t('★★打った字を書き換えない（_plate に生で持つ）', !!plateTag && plateTag.indexOf('_plate:raw') >= 0);

console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
process.exit(fail === 0 ? 0 : 1);
