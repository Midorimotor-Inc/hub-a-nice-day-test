// スケジュールシステム「10月からの進め方」スライド（明るい配色）。
//   実行: node build_roadmap_pptx.js
//   出力: C:/Users/A/Documents/Hub取扱説明書/Hub_10月からの進め方_2026-10.pptx（と同名の .pdf）
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }

const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const VERSION = (fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';
const F = 'Meiryo';
const W = 13.333, H = 7.5;
// 明るい配色
const INK = '1F2937', MUTED = '667085', WHITE = 'FFFFFF', PAPER = 'FFFDF7',
      ORANGE = 'FF9500', ORANGE_L = 'FFF1DC', BLUE = '2D9CDB', BLUE_L = 'E4F3FC',
      GREEN = '27AE60', GREEN_L = 'E6F6ED', PINK = 'EB5757', PINK_L = 'FDECEC',
      PURPLE = '9B51E0', PURPLE_L = 'F3E9FD', LINE = 'EAD9BE', SUN = 'FFD166';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Hub a Nice Day';
pres.title = 'スケジュールシステム 10月からの進め方';
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0 }, o));
const shadow = () => ({ type: 'outer', color: 'C9B48A', blur: 8, offset: 2, angle: 90, opacity: 0.25 });
const newSlide = (bg) => { const s = pres.addSlide(); s.background = { color: bg || PAPER }; return s; };
// 見出し（上に色の帯）
const head = (s, kicker, title, sub, color) => {
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: color || ORANGE }, line: { width: 0 } });
  if (kicker) {
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 0.45, w: 1.9, h: 0.42, rectRadius: 0.2, fill: { color: color || ORANGE }, line: { width: 0 } });
    T(s, kicker, { x: 0.6, y: 0.45, w: 1.9, h: 0.42, fontSize: 13, bold: true, color: WHITE, align: 'center', valign: 'middle' });
  }
  T(s, title, { x: kicker ? 2.7 : 0.6, y: 0.4, w: 10.2, h: 0.55, fontSize: 27, bold: true, color: INK });
  if (sub) T(s, sub, { x: 0.6, y: 1.02, w: 12.1, h: 0.4, fontSize: 14, color: MUTED });
};

// ── 1. 表紙 ──
{
  const s = newSlide('FFFFFF');
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 2.5, fill: { color: ORANGE }, line: { width: 0 } });
  s.addShape(pres.ShapeType.ellipse, { x: 10.2, y: 3.3, w: 3.6, h: 3.6, fill: { color: 'FFF1DC' }, line: { width: 0 } });
  s.addShape(pres.ShapeType.ellipse, { x: 11.6, y: -1.1, w: 2.6, h: 2.6, fill: { color: SUN }, line: { width: 0 } });
  T(s, '🚗 Hub a Nice Day', { x: 0.9, y: 0.6, w: 9, h: 0.5, fontSize: 18, bold: true, color: 'FFF6E6' });
  T(s, 'スケジュールシステム', { x: 0.9, y: 1.15, w: 11, h: 0.8, fontSize: 40, bold: true, color: WHITE });
  T(s, '10月からの進め方', { x: 0.9, y: 2.8, w: 11, h: 0.9, fontSize: 36, bold: true, color: ORANGE });
  T(s, '10/1 から、これまでのスケジュール管理方法と並行して\n約1か月ほど、実務でスケジュールシステムを使います。',
    { x: 0.9, y: 3.9, w: 9.2, h: 1.2, fontSize: 17, color: INK, lineSpacingMultiple: 1.4 });
  s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 5.35, w: 5.4, h: 0.6, rectRadius: 0.25, fill: { color: GREEN_L }, line: { color: GREEN, width: 1.5 } });
  T(s, '問題なく動くことを確認してから本格稼働', { x: 0.9, y: 5.35, w: 5.4, h: 0.6, fontSize: 14, bold: true, color: GREEN, align: 'center', valign: 'middle' });
  T(s, '本店・三田店　／　2026年10月　（v' + VERSION + '）', { x: 0.9, y: 6.6, w: 11, h: 0.4, fontSize: 12, color: MUTED });
}

// ── 2. これからの流れ ──
{
  const s = newSlide();
  head(s, null, 'これからの流れ', '急ぎません。慣れながら、実務で確かめていきます', ORANGE);
  const steps = [
    { c: ORANGE, bg: ORANGE_L, t: '10/1〜', h: '並行して使う', d: 'これまでの方法は今までどおり。\nそれと並行して、システムも\n実務で使ってみてください。' },
    { c: BLUE, bg: BLUE_L, t: '約1か月', h: '実務で確かめる', d: '毎日の予定・車検・代車を\n実際に入れてみてください。\n困るところ・直したいところを\n集めます。' },
    { c: GREEN, bg: GREEN_L, t: '10月中旬〜11月ごろ', h: '本格稼働', d: '問題なく動くことが確認できたら\nシステムへ切り替えます。\n時期は様子を見て決めます。' },
  ];
  const cw = 3.85, gap = 0.45;
  steps.forEach((st, i) => {
    const x = 0.6 + i * (cw + gap), y = 1.75;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: 4.2, rectRadius: 0.12, fill: { color: st.bg }, line: { color: st.c, width: 1.5 }, shadow: shadow() });
    s.addShape(pres.ShapeType.roundRect, { x: x + 0.35, y: y - 0.28, w: cw - 0.7, h: 0.56, rectRadius: 0.28, fill: { color: st.c }, line: { width: 0 } });
    T(s, st.t, { x: x + 0.35, y: y - 0.28, w: cw - 0.7, h: 0.56, fontSize: 13.5, bold: true, color: WHITE, align: 'center', valign: 'middle' });
    T(s, st.h, { x: x + 0.3, y: y + 0.55, w: cw - 0.6, h: 0.5, fontSize: 20, bold: true, color: st.c, align: 'center' });
    T(s, st.d, { x: x + 0.35, y: y + 1.3, w: cw - 0.7, h: 2.6, fontSize: 13, color: INK, lineSpacingMultiple: 1.45, valign: 'top' });
    if (i < steps.length - 1) T(s, '▶', { x: x + cw + 0.02, y: y + 1.7, w: 0.45, h: 0.5, fontSize: 20, bold: true, color: 'D8C6A5', align: 'center' });
  });
}

// ── 3. 並行してやってもらうこと（まとめ） ──
{
  const s = newSlide();
  head(s, null, '並行してやってもらうこと', '大きくは2つです', BLUE);
  const items = [
    { n: '①', c: BLUE, bg: BLUE_L, t: '各店舗のスケジュール表の入力', d: '車検の入力はほぼ終わっています。\n各店舗の「タイムスケジュール」の入力を\nお願いします。' },
    { n: '②', c: PURPLE, bg: PURPLE_L, t: '実際の代車の登録', d: '「代車管理」から、実際の代車を登録して\nください。三田店は今、仮の名前が\n入っています。' },
  ];
  items.forEach((it, i) => {
    const x = 0.6 + i * 6.3, y = 1.9;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.9, h: 3.9, rectRadius: 0.14, fill: { color: it.bg }, line: { color: it.c, width: 1.5 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.4, y: y + 0.4, w: 0.95, h: 0.95, fill: { color: it.c }, line: { width: 0 } });
    T(s, it.n, { x: x + 0.4, y: y + 0.4, w: 0.95, h: 0.95, fontSize: 26, bold: true, color: WHITE, align: 'center', valign: 'middle' });
    T(s, it.t, { x: x + 1.55, y: y + 0.5, w: 4.1, h: 0.8, fontSize: 19, bold: true, color: it.c });
    T(s, it.d, { x: x + 0.45, y: y + 1.75, w: 5.0, h: 1.9, fontSize: 14.5, color: INK, lineSpacingMultiple: 1.5, valign: 'top' });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 6.15, w: 12.1, h: 0.75, rectRadius: 0.12, fill: { color: 'FFFBF0' }, line: { color: SUN, width: 1.5 } });
  T(s, '既存のお客様の予約は、顧客リストの中にあります（次のページ）', { x: 0.9, y: 6.15, w: 11.5, h: 0.75, fontSize: 14.5, bold: true, color: 'A5731A', valign: 'middle' });
}

// ── 4. 既存のお客様は検索で ──
{
  const s = newSlide();
  head(s, null, '既存のお客様の予約は「検索」で', 'ドロップボックスにあるのと同じ分だけ、顧客リストに入っています', GREEN);
  const cards = [
    { c: GREEN, bg: GREEN_L, i: '🔍', t: 'パソコン', d: '最初のスケジュール画面の\n「🔍 検索」からお客様を絞れます。\n氏名・車種・No・電話で探せます。' },
    { c: BLUE, bg: BLUE_L, i: '📱', t: 'スマホ', d: '下のタブの「👥 顧客」→「探す」。\n電話の下4桁だけでも出ます。\nその場で電話もかけられます。' },
    { c: ORANGE, bg: ORANGE_L, i: '🚗', t: 'そのまま予約へ', d: 'お客様を選ぶと、そのまま\n車検の予約に進めます。\n打ち直しは要りません。' },
  ];
  const cw = 3.85, gap = 0.45;
  cards.forEach((cd, i) => {
    const x = 0.6 + i * (cw + gap), y = 1.85;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: 3.5, rectRadius: 0.14, fill: { color: cd.bg }, line: { color: cd.c, width: 1.5 }, shadow: shadow() });
    T(s, cd.i, { x, y: y + 0.35, w: cw, h: 0.8, fontSize: 34, align: 'center' });
    T(s, cd.t, { x, y: y + 1.25, w: cw, h: 0.45, fontSize: 18, bold: true, color: cd.c, align: 'center' });
    T(s, cd.d, { x: x + 0.35, y: y + 1.85, w: cw - 0.7, h: 1.5, fontSize: 13, color: INK, lineSpacingMultiple: 1.45, align: 'center' });
  });
  T(s, '※ お客様がリストに無い場合は、今までどおり直接入力してください。', { x: 0.6, y: 5.7, w: 12.1, h: 0.4, fontSize: 13, color: MUTED });
}

// ── 5. 困った時 ──
{
  const s = newSlide();
  head(s, null, '困った時は 江川 まで', '遠慮なく、どんな小さなことでも', PINK);
  s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 1.8, w: 12.1, h: 2.2, rectRadius: 0.16, fill: { color: PINK_L }, line: { color: PINK, width: 1.5 }, shadow: shadow() });
  T(s, '「どういった事で困っているか」だけ教えてください', { x: 1.0, y: 2.05, w: 11.3, h: 0.55, fontSize: 21, bold: true, color: PINK });
  T(s, 'うまくいかない・分からない・動きが変・こうしてほしい — 何でも構いません。\n直せるものはその場で直します。', { x: 1.0, y: 2.75, w: 11.3, h: 1.1, fontSize: 15, color: INK, lineSpacingMultiple: 1.45 });
  const ways = [
    { c: GREEN, bg: GREEN_L, i: '💬', t: 'LINE' },
    { c: BLUE, bg: BLUE_L, i: '✉️', t: 'メール' },
    { c: ORANGE, bg: ORANGE_L, i: '🗣', t: '直接ひとこと' },
  ];
  const cw = 3.85, gap = 0.45;
  ways.forEach((wy, i) => {
    const x = 0.6 + i * (cw + gap), y = 4.35;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: 1.55, rectRadius: 0.14, fill: { color: wy.bg }, line: { color: wy.c, width: 1.5 } });
    T(s, wy.i, { x: x + 0.3, y: y + 0.35, w: 0.9, h: 0.8, fontSize: 28, align: 'center' });
    T(s, wy.t, { x: x + 1.2, y: y + 0.45, w: cw - 1.5, h: 0.6, fontSize: 20, bold: true, color: wy.c, valign: 'middle' });
  });
  T(s, 'どれでも構いません。使いやすい方法で。', { x: 0.6, y: 6.15, w: 12.1, h: 0.4, fontSize: 13, color: MUTED, align: 'center' });
}

// ── 6. まとめ ──
{
  const s = newSlide();
  head(s, null, 'まとめ', '', ORANGE);
  const rows = [
    { c: ORANGE, t: '10/1 から', d: 'これまでの方法と並行して、スケジュールシステムを実務で使う' },
    { c: BLUE, t: 'やること ①', d: '各店舗のスケジュール表を入力する（車検はほぼ入力済み）' },
    { c: PURPLE, t: 'やること ②', d: '代車管理から、実際の代車を登録する（三田店は今は仮の名前）' },
    { c: GREEN, t: 'お客様', d: 'ドロップボックスと同じ分が顧客リストに。検索で絞って使う' },
    { c: PINK, t: '困った時', d: '江川まで。LINE・メール・直接、何でも' },
  ];
  rows.forEach((r, i) => {
    const y = 1.75 + i * 0.95;
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 12.1, h: 0.8, rectRadius: 0.1, fill: { color: WHITE }, line: { color: LINE, width: 1 } });
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 0.12, h: 0.8, rectRadius: 0.05, fill: { color: r.c }, line: { width: 0 } });
    T(s, r.t, { x: 1.0, y, w: 2.9, h: 0.8, fontSize: 15, bold: true, color: r.c, valign: 'middle' });
    T(s, r.d, { x: 3.9, y, w: 8.6, h: 0.8, fontSize: 14.5, color: INK, valign: 'middle' });
  });
  T(s, '本格稼働の時期は、様子を見て決めます（10月中旬になるかもしれませんし、11月になるかもしれません）',
    { x: 0.6, y: 6.6, w: 12.1, h: 0.45, fontSize: 13.5, color: MUTED, align: 'center' });
}

const out = path.join(OUTDIR, 'Hub_10月からの進め方_2026-10.pptx');
fs.mkdirSync(OUTDIR, { recursive: true });
pres.writeFile({ fileName: out }).then(() => {
  console.log('出力: ' + out);
  const { execFileSync } = require('child_process');
  const pdf = out.replace(/\.pptx$/, '.pdf');
  const ps = '$pp = New-Object -ComObject PowerPoint.Application; $p = $pp.Presentations.Open("' + out + '", $true, $false, $false); $p.SaveAs("' + pdf + '", 32); $p.Close(); $pp.Quit();';
  try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', timeout: 120000 }); console.log('PDF: ' + pdf); }
  catch (e) { console.log('PDF 変換は PowerPoint が必要です（スキップ）'); }
});
