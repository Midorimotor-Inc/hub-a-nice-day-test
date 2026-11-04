// Hub a Nice Day「共有パソコンでも控えを開けるようにする手順」のスライドを生成する（2026-11）。
//   実行: node build_manual5_pptx.js
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_共有パソコンに控えを置く手順_2026-11.pptx
//
//   ★この説明書は画面写真を使わない（直すのは Windows の設定で、Hub の画面ではないため）。
//     素材が要らないので capture_manual5_shots.js は無い。文章を直す時はこのファイルだけを直す。
//   中身のもとは `hub_paper.js` の写し先3つ（① ドライブ ② 写し先メモ ③ Hub控え フォルダのあるドライブ）。
//   仕組みを変えた時は、このスライドの ⑦⑧ と「毎朝どう動くか」を合わせて直すこと。
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }

const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const OUT = path.join(OUTDIR, 'Hub_共有パソコンに控えを置く手順_2026-11.pptx');
const MEMO = 'C:\\Users\\A\\Documents\\Hub重要書類\\Hub控え-写し先.txt';
const PCNAME = 'SHOP-PC';   // 例として出す共有PCの名前（実物が決まったらここだけ直す）

const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C', ORANGE_L = 'FDEDE2', INK = '1B2735',
      MUTED = '5B6B7C', LINE = 'D8E0EA', PAPER = 'FFFFFF', SOFT = 'F4F7FB', RED = 'E11D48', WHITE = 'FFFFFF',
      GREEN = '15803D', GREEN_L = 'E6F3EA';
const F = 'Meiryo';
const W = 13.333, H = 7.5;
const STEPS = 9;   // 手順の数（各ページの「③/9」の分母）

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Hub a Nice Day';
pres.title = 'Hub a Nice Day 共有パソコンに控えを置く手順';

const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0 }, o));
const shadow = () => ({ type: 'outer', color: '8A9AAD', blur: 8, offset: 2, angle: 90, opacity: 0.3 });
const box = (s, o) => s.addShape(pres.ShapeType.roundRect, Object.assign({ rectRadius: 0.1 }, o));
const lines = (a) => a.join('\n');

function pageTitle(s, kicker, title, sub) {
  if (kicker) {
    box(s, { x: 0.55, y: 0.3, w: 1.75, h: 0.34, rectRadius: 0.17, fill: { color: kicker.color || BLUE }, line: { color: kicker.color || BLUE, width: 0 } });
    T(s, kicker.t, { x: 0.55, y: 0.3, w: 1.75, h: 0.34, fontSize: 11.5, bold: true, color: WHITE, align: 'center', valign: 'middle' });
  }
  T(s, title, { x: kicker ? 2.45 : 0.55, y: 0.24, w: 10.3, h: 0.5, fontSize: 24, bold: true, color: INK });
  if (sub) T(s, sub, { x: 0.55, y: 0.78, w: 12.2, h: 0.36, fontSize: 12.5, color: MUTED });
}
function numCircle(s, n, x, y, d, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || RED }, line: { color: WHITE, width: 1.2 }, shadow: shadow() });
  T(s, String(n), { x, y, w: d, h: d, fontSize: d >= 0.5 ? 20 : 13, bold: true, color: WHITE, align: 'center', valign: 'middle' });
}
// 操作の道順（設定 → システム → バージョン情報）をつぶつぶの札で出す
function crumbs(s, x, y, arr, color) {
  let cx = x;
  arr.forEach((c, i) => {
    const w = 0.34 + c.length * 0.145;
    box(s, { x: cx, y, w, h: 0.38, rectRadius: 0.19, fill: { color: BLUE_L }, line: { color: color || BLUE, width: 1 } });
    T(s, c, { x: cx, y, w, h: 0.38, fontSize: 11.5, bold: true, color: color || BLUE, align: 'center', valign: 'middle' });
    cx += w;
    if (i < arr.length - 1) { T(s, '▶', { x: cx, y, w: 0.3, h: 0.38, fontSize: 10, color: MUTED, align: 'center', valign: 'middle' }); cx += 0.3; }
  });
}
// 下に置く帯（ここだけ気をつける、の1行）
function footNote(s, text, tone) {
  const c = tone === 'warn' ? ORANGE : tone === 'ok' ? GREEN : BLUE;
  box(s, { x: 0.55, y: 6.6, w: 12.2, h: 0.55, fill: { color: tone === 'warn' ? ORANGE_L : tone === 'ok' ? GREEN_L : SOFT }, line: { color: c, width: 1 } });
  T(s, text, { x: 0.8, y: 6.6, w: 11.7, h: 0.55, fontSize: 12, bold: true, color: tone === 'warn' ? '9A3412' : tone === 'ok' ? '14532D' : INK, valign: 'middle' });
}

// ── 手順のページ（左に大きい番号・上に道順・本文・右に「画面でさがす字」） ──
//   where: 'どのパソコンで' を出す札。body: やること。look: 画面に出ている文字そのまま。note: 下の帯。
function slideStep(no, where, title, crumb, body, look, note, noteTone) {
  const here = where === '共有パソコン';
  const col = here ? ORANGE : BLUE, colL = here ? ORANGE_L : BLUE_L;
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, { t: '手順 ' + no + ' / ' + STEPS, color: col }, title);
  box(s, { x: 10.6, y: 0.28, w: 2.17, h: 0.38, rectRadius: 0.19, fill: { color: colL }, line: { color: col, width: 1 } });
  T(s, where + 'で', { x: 10.6, y: 0.28, w: 2.17, h: 0.38, fontSize: 11.5, bold: true, color: here ? '9A3412' : BLUE, align: 'center', valign: 'middle' });

  let y = 1.25;
  if (crumb && crumb.length) { crumbs(s, 0.55, y, crumb); y += 0.75; }
  // 中身の行数ぶんだけの高さ（下の帯にぶつかる所で止める）
  const h = Math.min((note ? 6.4 : 7.0) - y,
    Math.max(1.5, 0.62 + body.length * 0.52, (look && look.length) ? 1.05 + look.length * 0.44 : 0));
  const bw = (look && look.length) ? 7.55 : 11.2;
  numCircle(s, no, 0.6, y + 0.12, 0.72, col);
  box(s, { x: 1.55, y: y, w: bw, h: h, fill: { color: SOFT }, line: { color: LINE, width: 1 } });
  T(s, lines(body), { x: 1.9, y: y + 0.3, w: bw - 0.65, h: h - 0.6, fontSize: 15, color: INK, paraSpaceAfter: 10, valign: 'top' });
  if (look && look.length) {
    const x = 1.55 + bw + 0.3, lw = 12.77 - x;
    box(s, { x, y: y, w: lw, h: h, fill: { color: colL }, line: { color: col, width: 1.2 } });
    T(s, '画面でさがす字', { x: x + 0.28, y: y + 0.22, w: lw - 0.5, h: 0.35, fontSize: 13.5, bold: true, color: here ? '9A3412' : BLUE });
    T(s, lines(look), { x: x + 0.28, y: y + 0.75, w: lw - 0.56, h: h - 0.95, fontSize: 12.5, color: INK, paraSpaceAfter: 9, valign: 'top' });
  }
  if (note) footNote(s, note, noteTone);
}

// ── ① 表紙 ──
function slideCover() {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, 'Hub a Nice Day', { x: 0.9, y: 1.85, w: 11.5, h: 0.8, fontSize: 40, bold: true, color: WHITE });
  T(s, '共有パソコンに「控え」を置く手順', { x: 0.9, y: 2.75, w: 11.5, h: 0.9, fontSize: 36, bold: true, color: '9FC2FF' });
  T(s, 'ネットが止まっても、Hub が開けなくても、共有パソコンから予定表とお客様を印刷できるようにする',
    { x: 0.9, y: 3.8, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
  box(s, { x: 0.9, y: 4.6, w: 4.7, h: 0.46, rectRadius: 0.2, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
  T(s, '1回だけの設定　／　あとは毎朝8時に自動', { x: 0.9, y: 4.6, w: 4.7, h: 0.46, fontSize: 12, color: 'C6D4E8', align: 'center', valign: 'middle' });
  T(s, '緑モータース　2026年11月版', { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  s.addNotes('共有パソコンを触る人と、江川さんのパソコンを触る人の2人で進めると早い。所要 15〜20分。');
}

// ── ② 全体の形（図） ──
function slideHow() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, 'どういう仕組みか', '共有パソコンの中に「実物のファイル」が毎朝置かれる。だからネットが死んでいても開ける');

  box(s, { x: 0.55, y: 1.5, w: 4.6, h: 3.1, fill: { color: BLUE_L }, line: { color: BLUE, width: 1.5 } });
  T(s, '江川さんのパソコン', { x: 0.85, y: 1.7, w: 4.0, h: 0.4, fontSize: 16, bold: true, color: BLUE });
  T(s, lines([
    '毎朝 8時（自動）',
    '① Hub の中身をぜんぶ控える',
    '② 紙の控え（1枚のHTML）を作る',
    '③ 写し先へコピーする'
  ]), { x: 0.85, y: 2.25, w: 4.0, h: 2.1, fontSize: 13, color: INK, paraSpaceAfter: 8 });

  s.addShape(pres.ShapeType.line, { x: 5.35, y: 3.0, w: 2.6, h: 0.001, line: { color: GREEN, width: 3, endArrowType: 'triangle' } });
  T(s, '社内LAN', { x: 5.35, y: 2.55, w: 2.6, h: 0.35, fontSize: 12, bold: true, color: GREEN, align: 'center' });
  T(s, '\\\\' + PCNAME + '\\Hub控え', { x: 5.15, y: 3.15, w: 3.0, h: 0.35, fontSize: 11.5, color: MUTED, align: 'center' });

  box(s, { x: 8.15, y: 1.5, w: 4.62, h: 3.1, fill: { color: ORANGE_L }, line: { color: ORANGE, width: 1.5 } });
  T(s, '共有パソコン', { x: 8.45, y: 1.7, w: 4.0, h: 0.4, fontSize: 16, bold: true, color: '9A3412' });
  T(s, lines([
    'C:\\Hub控え の中に実物が入る',
    'Hub控え-2026-11-01.html',
    'Hub控え-2026-10-31.html　…（7本まで）',
    'ダブルクリック → 開く → 印刷'
  ]), { x: 8.45, y: 2.25, w: 4.0, h: 2.1, fontSize: 13, color: INK, paraSpaceAfter: 8 });

  box(s, { x: 0.55, y: 4.85, w: 12.22, h: 1.55, fill: { color: SOFT }, line: { color: LINE, width: 1 } });
  T(s, 'ここが大事', { x: 0.85, y: 5.0, w: 2.0, h: 0.35, fontSize: 14, bold: true, color: RED });
  T(s, lines([
    '・「見に行く」のではなく、共有パソコンのディスクの中にファイルが置かれる。だから回線・Hub・江川さんのPCが全部止まっていても開ける。',
    '・外から何も読み込まない1枚のHTML。共有パソコンに Node.js も Excel も要らない（ブラウザで開くだけ）。',
    '・中身は 予定表／代車管理表／お客様（1349件）／車両台帳／休日表／受付メモ用紙 の6つ。どれも A4 で印刷できる。'
  ]), { x: 0.85, y: 5.4, w: 11.6, h: 0.95, fontSize: 12.5, color: INK, paraSpaceAfter: 4 });
  s.addNotes('主の控えは今までどおり江川さんのPCとGoogleドライブ。共有パソコンは「見る・印刷する用の写し」。');
}

// ── ③ 先に決める2つ ──
function slideDecide() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, '先に決めておく2つ', 'これが決まれば、あとは手順どおりに進むだけ');
  const cards = [
    { t: '① 共有パソコンの名前', c: BLUE, bg: BLUE_L, d: lines([
      '設定 ▶ システム ▶ バージョン情報 の',
      '「デバイス名」を見る。',
      '',
      '例）' + PCNAME,
      '',
      'これが住所になる：',
      '\\\\' + PCNAME + '\\Hub控え'
    ]) },
    { t: '② ログインにパスワードが有るか', c: ORANGE, bg: ORANGE_L, d: lines([
      '【有る】そのまま進める（安全・おすすめ）。',
      '　江川さんのPCに ID とパスワードを',
      '　1回だけ覚えさせる。',
      '',
      '【無い】「パスワード保護共有」を切らないと',
      '　書き込めない。切ると社内LANの誰でも',
      '　読める＝この機会にパスワードを付けたい。'
    ]) },
  ];
  cards.forEach((c, i) => {
    const x = 0.55 + i * 6.25;
    box(s, { x, y: 1.5, w: 5.97, h: 4.0, fill: { color: c.bg }, line: { color: c.c, width: 1.5 } });
    T(s, c.t, { x: x + 0.3, y: 1.7, w: 5.4, h: 0.45, fontSize: 18, bold: true, color: c.c });
    T(s, c.d, { x: x + 0.3, y: 2.3, w: 5.4, h: 3.0, fontSize: 13, color: INK, paraSpaceAfter: 2 });
  });
  footNote(s, 'この2つが分かれば、手順 ⑦⑧（写し先メモの1行追加と試し打ち）は Claude 側で代行できます。', 'ok');
}

// ── 毎朝どう動くか ──
function slideDaily() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, '設定が済んだあと、毎朝どう動くか', '人は何もしない。スタッフは「いちばん新しい日付のファイル」を開くだけ');
  const t = [
    { h: '8:00', t: '江川さんのPCのタスク「HubBackup」が動く', c: BLUE },
    { h: '〜8:01', t: 'Hub の中身を控える（JSON）→ 紙の控え（HTML）を作る', c: BLUE },
    { h: '〜8:01', t: 'Googleドライブ・共有パソコン・USB の順に写す', c: GREEN },
    { h: '毎朝', t: '7本より古いものは、写した先でも自動で片づく', c: GREEN },
  ];
  t.forEach((r, i) => {
    const y = 1.5 + i * 0.78;
    box(s, { x: 0.55, y, w: 1.45, h: 0.6, rectRadius: 0.1, fill: { color: r.c }, line: { color: r.c, width: 0 } });
    T(s, r.h, { x: 0.55, y, w: 1.45, h: 0.6, fontSize: 13.5, bold: true, color: WHITE, align: 'center', valign: 'middle' });
    box(s, { x: 2.15, y, w: 10.62, h: 0.6, fill: { color: SOFT }, line: { color: LINE, width: 1 } });
    T(s, r.t, { x: 2.45, y, w: 10.1, h: 0.6, fontSize: 13.5, color: INK, valign: 'middle' });
  });
  box(s, { x: 0.55, y: 4.85, w: 12.22, h: 1.5, fill: { color: ORANGE_L }, line: { color: ORANGE, width: 1 } });
  T(s, 'その日が飛ぶのはこの2つ（エラーにはならず、黙って飛ばします）', { x: 0.85, y: 5.0, w: 11.6, h: 0.35, fontSize: 14, bold: true, color: '9A3412' });
  T(s, lines([
    '・共有パソコンの電源が切れている朝　→ 次に両方が起きている朝に入ります',
    '・江川さんのパソコンがログインしていない朝　→ 毎朝立ち上げる運用ならそのままで大丈夫'
  ]), { x: 0.85, y: 5.45, w: 11.6, h: 0.85, fontSize: 13, color: INK, paraSpaceAfter: 4 });
  footNote(s, '飛んだ朝でも、共有パソコンには前の日のファイルが残っています（7本＝約1週間ぶん）。', 'ok');
}

// ── 通らない時に見る所 ──
function slideTrouble() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, '\\\\' + PCNAME + '\\Hub控え が開けない時に見る所', '上から順に見ると、ほぼこの6つのどれかです');
  const items = [
    { t: 'ネットワークの種類が「パブリック」になっている', d: '共有パソコン側：設定 ▶ ネットワークとインターネット ▶（接続中のもの）▶「プライベート ネットワーク」に変える' },
    { t: 'ファイルとプリンターの共有がオフ', d: '共有パソコン側：設定 ▶ ネットワークとインターネット ▶ ネットワークの詳細設定 ▶ 共有の詳細設定 ▶ プライベートで2つオン' },
    { t: 'パソコンの名前で引けない', d: 'IPアドレスで試す（例 \\\\192.168.1.23\\Hub控え）。通ったら名前の問題。IPはルーター側で固定しておく' },
    { t: 'ID・パスワードを聞かれて先に進めない', d: '共有パソコンのログインID・パスワードを入れ、「資格情報を記憶する」にチェック。パスワード無しのPCなら「パスワード保護共有」をオフに' },
    { t: '開けるけど書き込めない（コピーが弾かれる）', d: '共有の「アクセス許可」が読み取りだけになっている。Everyone の「変更」を許可にする' },
    { t: '共有名の大文字小文字がちがう', d: '写し先メモの1行を、共有PCが出している名前と1文字ずつ同じに直す（HUB控え と Hub控え は別物として扱われた・2026-11-02）' },
  ];
  items.forEach((it, i) => {
    const y = 1.35 + i * 0.95;
    numCircle(s, i + 1, 0.6, y + 0.17, 0.42, RED);
    box(s, { x: 1.2, y, w: 11.57, h: 0.88, fill: { color: SOFT }, line: { color: LINE, width: 1 } });
    T(s, it.t, { x: 1.5, y: y + 0.08, w: 11.0, h: 0.34, fontSize: 14, bold: true, color: INK });
    T(s, it.d, { x: 1.5, y: y + 0.45, w: 11.0, h: 0.38, fontSize: 12, color: MUTED });
  });
  s.addNotes('どれを試したかを控えておくと、次に同じことが起きた時に早い。');
}

// ── 気をつけること ──
function slideCare() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, '気をつけること', '中身はお客様の氏名・電話・住所です');
  const cards = [
    { t: '置いていい所・いけない所', c: RED, bg: 'FDE8EC', d: lines([
      '○ 会社のパソコン（共有パソコン・江川さんのPC）',
      '○ 会社の Google ドライブ（制限付き共有）',
      '✕ 個人の OneDrive・個人のパソコン',
      '✕ リポジトリ（GitHub）'
    ]) },
    { t: '主（本物）はどこか', c: BLUE, bg: BLUE_L, d: lines([
      '主は 江川さんのPC と Google ドライブ。',
      '共有パソコンは「見る・印刷する用の写し」。',
      '書き込める共有フォルダは、万一の',
      'ウイルスにも書かれる所なので主にしない。'
    ]) },
    { t: '社内LANの中だけに', c: ORANGE, bg: ORANGE_L, d: lines([
      '共有フォルダは同じネットワークの機器から',
      '見えます。お客様用のWi-Fiと同じ',
      'ネットワークにしないこと。',
      '来客用は分けてください。'
    ]) },
    { t: '紙を捨てる時', c: GREEN, bg: GREEN_L, d: lines([
      '印刷した紙には電話番号が載ります。',
      '用が済んだらシュレッダーへ。',
      '受付メモ用紙も同じ（1週間ほど保管して破棄）。'
    ]) },
  ];
  cards.forEach((c, i) => {
    const x = 0.55 + (i % 2) * 6.25, y = 1.45 + Math.floor(i / 2) * 2.55;
    box(s, { x, y, w: 5.97, h: 2.35, fill: { color: c.bg }, line: { color: c.c, width: 1.3 } });
    T(s, c.t, { x: x + 0.3, y: y + 0.18, w: 5.4, h: 0.4, fontSize: 16, bold: true, color: c.c });
    T(s, c.d, { x: x + 0.3, y: y + 0.68, w: 5.4, h: 1.5, fontSize: 12.5, color: INK, paraSpaceAfter: 3 });
  });
  footNote(s, 'Hub の控えは「会社のパソコンの中だけ」。持ち出す時は紙か、会社の USB だけにしてください。', 'warn');
}

// ── 最後：チェックリスト ──
function slideCheck() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, 'できたか確かめる（この紙を印刷して使えます）', '上から順に ✓ が付けば完成です');
  const items = [
    '共有パソコンの名前を書き出した（＿＿＿＿＿＿＿＿＿＿）',
    '共有パソコンに C:\\Hub控え フォルダを作った',
    'そのフォルダを共有した（共有名 Hub控え・アクセス許可は「変更」）',
    'ネットワークの種類がプライベートで、ファイル共有がオン',
    '江川さんのPCのエクスプローラーで \\\\PC名\\Hub控え が開けた',
    '写し先メモ（Hub控え-写し先.txt）に \\\\PC名\\Hub控え を1行足した',
    '試し打ち（node hub_paper.js）で「写し先メモにも写しました」が出た',
    '共有パソコンの C:\\Hub控え に HTML が入っているのを目で見た',
    '共有パソコンのデスクトップにショートカットを置いた',
    '共有パソコンでそのHTMLを開き、予定表を1枚印刷してみた',
  ];
  items.forEach((it, i) => {
    const y = 1.45 + i * 0.52;
    s.addShape(pres.ShapeType.rect, { x: 0.6, y: y + 0.08, w: 0.3, h: 0.3, fill: { color: WHITE }, line: { color: MUTED, width: 1.2 } });
    T(s, it, { x: 1.05, y, w: 11.7, h: 0.45, fontSize: 13.5, color: INK, valign: 'middle' });
  });
  footNote(s, '最後の「印刷してみた」まで済めば、ネットが止まった日でも店は回ります。', 'ok');
}

// ── 組み立て ───────────────────────────────────────
slideCover();
slideHow();
slideDecide();

slideStep(1, '共有パソコン', 'パソコンの名前を調べる',
  ['設定', 'システム', 'バージョン情報'],
  ['・「デバイス名」に出ている文字を、そのまま書き写す（例 ' + PCNAME + '）。',
   '・大文字・小文字は気にしなくて大丈夫。ハイフン（-）まで正しく写すこと。',
   '・この名前が、江川さんのPCから書き込む時の住所になる。'],
  ['デバイス名', '（例）' + PCNAME, '', 'このPCの名前を変更',
   '→ 変えた時は再起動してから先へ'],
  'デバイス名が長い・読みにくい時は、この機会に短い名前に変えてもかまいません（変えたら再起動）。');

slideStep(2, '共有パソコン', 'フォルダを作る',
  ['エクスプローラー', 'PC', 'Windows (C:)'],
  ['・C ドライブの直下に「Hub控え」という名前のフォルダを新しく作る。',
   '・場所は C:\\Hub控え。ドキュメントの中ではなく、直下にすること。',
   '　（ログインする人が変わっても場所が動かず、住所が短くて済む）'],
  ['新規作成 ▶ フォルダー', '', '名前：Hub控え', '場所：C:\\Hub控え',
   '', '※ ドキュメントや デスクトップ の中ではない'],
  'フォルダの名前は「Hub控え」。この名前にしておくと、USB に挿した時も同じやり方で使えます。');

slideStep(3, '共有パソコン', 'そのフォルダを共有する（ここが一番の山）',
  ['C:\\Hub控え を右クリック', 'プロパティ', '共有', '詳細な共有'],
  ['・「このフォルダーを共有する」に チェック を入れる。',
   '・共有名 … Hub控え（そのまま）',
   '・「アクセス許可」を押して、Everyone の 変更 を 許可 にする。',
   '　★読み取りだけだと、毎朝のコピーが弾かれて入りません。',
   '　★Everyone が一覧に無ければ「追加」で足す。ここが抜けていると、',
   '　　江川さんのPCから EPERM（許可がありません）で弾かれます。'],
  ['☑ このフォルダーを共有する', '共有名：Hub控え', '［アクセス許可］ボタン',
   '', 'グループ名：Everyone', 'フル コントロール … □', '変更 … ☑ 許可', '読み取り … ☑ 許可'],
  '「詳細な共有」が見つからない時は、右クリック ▶ その他のオプションを確認 ▶ アクセスを許可する ▶ 特定のユーザー ▶ Everyone を追加 ▶「読み取り/書き込み」でも同じことができます（共有とフォルダの許可を一度に設定してくれます）。', 'warn');

slideStep(4, '共有パソコン', 'ファイル共有をオンにする',
  ['設定', 'ネットワークとインターネット', 'ネットワークの詳細設定', '共有の詳細設定'],
  ['・「プライベート ネットワーク」を開いて、2つをオンにする。',
   '　① ネットワーク探索　② ファイルとプリンターの共有',
   '・つないでいるネットワークが「パブリック」になっていたら、',
   '　「プライベート ネットワーク」に変える（パブリックだと共有が塞がれます）。'],
  ['プライベート ネットワーク', '', '☑ ネットワーク探索',
   '☑ ファイルとプリンターの共有', '', '（パブリック ネットワーク の方は', '　さわらなくてよい）'],
  'ここがオフのままだと、江川さんのPCから「見つかりません」と言われます。');

slideStep(5, '共有パソコン', 'パスワードの扱いを決める',
  ['設定', 'ネットワークの詳細設定', '共有の詳細設定', 'すべてのネットワーク'],
  ['【共有パソコンのログインにパスワードが有る】',
   '　・「パスワード保護共有」は オンのまま。次の手順でそのID・パスワードを使う（安全）。',
   '【パスワード無しでログインしている】',
   '　・「パスワード保護共有」を オフ にしないと書き込めない。',
   '　・オフ＝社内LANの誰でも読める。お客様の氏名・電話が入るので、',
   '　　できればこの機会に共有パソコンにパスワードを付けるのがおすすめ。'],
  ['すべてのネットワーク', '', 'パスワード保護共有',
   '　○ オン（パスワード有りの時）', '　○ オフ（パスワード無しの時）'],
  '★パスワードを入れても「ネットワークパスワードが間違っています」と出続ける時は、オフにすると通ります（2026-11-02 の実例）。オフにしても共有パソコンの起動時のパスワードは変わりません。', 'warn');

slideStep(6, '江川さんのパソコン', '住所が通るか確かめる',
  ['エクスプローラー', 'アドレス欄に入力'],
  ['・アドレス欄に \\\\' + PCNAME + '\\Hub控え と入れて Enter。',
   '・ID・パスワードを聞かれたら、共有パソコンのものを入れて',
   '　「資格情報を記憶する」に チェック（これを忘れると毎朝だけ失敗します）。',
   '・★ユーザー名は 共有PC名＼ユーザー名 と頭から書く（例 SHOP-PC＼tenpo）。',
   '　頭を付けないと、江川さんのPCのアカウントとして送られて必ず弾かれます。',
   '・空のフォルダが開けば成功。ここに1つファイルをコピーできるか試すとより確実。'],
  ['\\\\' + PCNAME + '\\Hub控え', '', 'ネットワーク資格情報の入力',
   '　ユーザー名：（共有PCのID）', '　パスワード：', '　☑ 資格情報を記憶する'],
  '毎朝のタスクは江川さんのユーザーで動くので、ここで覚えさせた ID・パスワードがそのまま使われます。', 'ok');

slideStep(7, '江川さんのパソコン', '写し先メモに1行足す',
  ['Hub重要書類', 'Hub控え-写し先.txt'],
  ['・' + MEMO + ' をメモ帳で開く。',
   '・いちばん下に1行だけ足して保存する：',
   '　　\\\\' + PCNAME + '\\Hub控え',
   '・頭に # が付いている行は「お休み」。足した行には # を付けないこと。',
   '・★共有名は 大文字小文字まで そのまま 写すこと。2026-11-02 の実例：共有名が',
   '　「HUB控え」なのにメモへ「Hub控え」と書いて ENOENT（見つかりません）になった。'],
  ['# ■ 紙の控えを…（説明の行）', '# \\\\SHOP-PC\\Hub控え（例の行）',
   '', '↓ いちばん下に足す', '', '\\\\' + PCNAME + '\\Hub控え'],
  '置き場所を増やしたい時も、この紙に1行足すだけ（USB は挿すだけで効きます）。');

slideStep(8, '江川さんのパソコン', '試し打ちして、入ったのを見る',
  ['HUB-A-NICE-DAY-DEV のフォルダ', 'node hub_paper.js'],
  ['・node hub_paper.js を1回動かす（毎朝を待たなくてよい）。',
   '・出てくる文に、こう並べば成功：',
   '　■ 紙の控えを作りました：…\\Hub控え\\Hub控え-2026-11-01.html',
   '　■ 写し先メモにも写しました：\\\\' + PCNAME + '\\Hub控え\\Hub控え-2026-11-01.html',
   '・「写せませんでした」の後ろの字で、どこを直すか分かる：',
   '　UNKNOWN＝届いていない（手順5・6）／ENOENT＝共有名ちがい（手順7）',
   '　EPERM＝許可が出ていない（手順3の Everyone）'],
  ['■ 紙の控えを作りました', '■ ドライブにも写しました',
   '■ 写し先メモにも写しました', '', '△ …へは今回写せませんでした',
   '　→ まだ直す所があるしるし'],
  'ここは Claude 側で代行できます。共有パソコンの名前を教えてもらえれば、写ったところまで確認します。', 'ok');

slideStep(9, '共有パソコン', 'ショートカットを置いて、スタッフに伝える',
  ['C:\\Hub控え を右クリック', 'ショートカットの作成', 'デスクトップへ'],
  ['・デスクトップに置いて「Hubの控え（紙に出す）」と名前を付ける。',
   '・スタッフへの伝え方は2行で足ります：',
   '　① デスクトップの「Hubの控え」を開く',
   '　② いちばん新しい日付のファイルを開いて、上のタブから選んで印刷',
   '・ネットが止まっていても、Hub が開けなくても、これだけで印刷できる。'],
  ['右クリック ▶ その他のオプションを表示',
   '▶ ショートカットの作成', '', '名前：Hubの控え（紙に出す）',
   '', '置く所：デスクトップ'],
  '古いファイルは7本より前が毎朝自動で消えます。スタッフが片づける必要はありません。', 'ok');

slideDaily();
slideTrouble();
slideCare();
slideCheck();

fs.mkdirSync(OUTDIR, { recursive: true });
pres.writeFile({ fileName: OUT }).then(() => {
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log('■ できました：' + OUT + '（' + kb + 'KB・' + (pres.slides ? pres.slides.length : '?') + 'ページ）');
}).catch(e => { console.error('✖ 作れませんでした：' + e.message); process.exit(1); });
