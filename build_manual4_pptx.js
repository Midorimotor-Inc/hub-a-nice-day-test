// Hub a Nice Day「週間カレンダーの使い方」のスライドを生成する（2026-10）。
//   素材: manual4_shots/*.png と index.json（capture_manual4_shots.js が作る。各ボタンの座標入り）
//   実行: node build_manual4_pptx.js
//   出力: C:\Users\A\Documents\Hub取扱説明書\Hub_取扱説明書_2026-09.pptx（試作は _試作.pptx）
//
//   作り方：画面写真の上に赤枠を描き、右の説明欄と線で結ぶ（ユーザー指示・2026-09-21）。
//   座標は撮影時に記録した要素の位置（CSS px）を、写真の縮尺に合わせて換算する。
const path = require('path'), fs = require('fs');
let pptxgen; try { pptxgen = require('pptxgenjs'); } catch (e) { pptxgen = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'pptxgenjs')); }
let sharp; try { sharp = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'sharp')); } catch (e) { sharp = null; }

const PROTO = process.argv.includes('--proto');
const SHOTS = path.join(__dirname, 'manual4_shots');
const META = {}; JSON.parse(fs.readFileSync(path.join(SHOTS, 'index.json'), 'utf8')).forEach(m => { META[m.file] = m; });
const OUTDIR = 'C:\\Users\\A\\Documents\\Hub取扱説明書';
const OUT = path.join(OUTDIR, PROTO ? 'Hub_週間カレンダー_試作.pptx' : 'Hub_週間カレンダーの使い方_2026-10.pptx');
const VERSION = (fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';

const NAVY = '12233F', BLUE = '1D4ED8', BLUE_L = 'E8EFFC', ORANGE = 'EA580C', ORANGE_L = 'FDEDE2', INK = '1B2735', MUTED = '5B6B7C',
      LINE = 'D8E0EA', PAPER = 'FFFFFF', SOFT = 'F4F7FB', RED = 'E11D48', WHITE = 'FFFFFF', GREEN = '15803D';
const F = 'Meiryo';
const W = 13.333, H = 7.5;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; pres.author = 'Hub a Nice Day'; pres.title = 'Hub a Nice Day 週間カレンダーの使い方';

const dim = {};
async function loadDims() { if (!sharp) return; for (const f of fs.readdirSync(SHOTS).filter(x => x.endsWith('.png'))) { try { const m = await sharp(path.join(SHOTS, f)).metadata(); dim[f] = { w: m.width, h: m.height }; } catch (e) {} } }
const shadow = () => ({ type: 'outer', color: '8A9AAD', blur: 8, offset: 2, angle: 90, opacity: 0.3 });
// ── URL版（manual4_web/deck.json）用に、同じ素データを控えておく ──
//   PPTX と URL版で中身がずれないように、文章を作る所は1か所だけにしてある。
const WEBDIR = path.join(__dirname, 'manual4_web');
const WEB = [];
const webImgs = new Set();
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0 }, o));

function pageTitle(s, kicker, title, sub) {
  if (kicker) {
    s.addShape(pres.ShapeType.roundRect, { x: 0.55, y: 0.3, w: 1.55, h: 0.34, rectRadius: 0.17, fill: { color: kicker.color || BLUE }, line: { color: kicker.color || BLUE, width: 0 } });
    T(s, kicker.t, { x: 0.55, y: 0.3, w: 1.55, h: 0.34, fontSize: 11.5, bold: true, color: WHITE, align: 'center', valign: 'middle' });
  }
  T(s, title, { x: kicker ? 2.25 : 0.55, y: 0.24, w: 10.5, h: 0.5, fontSize: 24, bold: true, color: INK });
  if (sub) T(s, sub, { x: 0.55, y: 0.78, w: 12.2, h: 0.36, fontSize: 12.5, color: MUTED });
}
function numCircle(s, n, x, y, d, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || RED }, line: { color: WHITE, width: 1.2 }, shadow: shadow() });
  T(s, String(n), { x, y, w: d, h: d, fontSize: d >= 0.34 ? 13 : 11, bold: true, color: WHITE, align: 'center', valign: 'middle' });
}
// (x1,y1)→(x2,y2) の線
function leader(s, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(dx) || 0.001, h: Math.abs(dy) || 0.001, line: { color: color || RED, width: 1.5, dashType: 'solid' }, flipV: (dx * dy) < 0 });
}

// ── 赤枠＋引き出し線つきの画面写真スライド ──
//   items: [{k:'boxキー', t:'見出し', d:'説明'}]  写真は左、説明は右の欄。枠は上から順に番号。
async function annotated(kicker, title, sub, file, items, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, kicker, title, sub);
  const meta = META[file] || { vw: 1500, vh: 950, boxes: {} };
  const d = dim[file] || { w: meta.vw * 2, h: meta.vh * 2 };
  const colW = opt.layout === 'below' ? 0 : (opt.colW == null ? 3.7 : opt.colW);
  // ★写真の上に番号を置くための余白をあける（2026-10-30 ユーザー指示）。
  //   番号を枠の横に出すと、となりのボタンに重なって読めなかった。
  const head = 0.4;
  const bx = 0.55, by = 1.28, bw = 12.2 - (colW ? colW + 0.35 : 0), bh = opt.layout === 'below' ? (opt.imgH || 3.3) : 5.95 - head;
  // 写真の切り出し（crop: {x,y,w,h} CSS px）に対応
  const crop = opt.crop || { x: 0, y: 0, w: meta.vw, h: meta.vh };
  const r = Math.min(bw / crop.w, bh / crop.h);            // 1 CSS px = r インチ
  const iw = crop.w * r, ih = crop.h * r;
  const ix = bx, iy = by + (opt.top ? head : (bh - ih) / 2);
  const scaleX = d.w / meta.vw, scaleY = d.h / meta.vh;    // 写真は 2倍解像度
  // 切り出しは sharp で実ファイルを作る（pptxgenjs の crop 指定は環境で解釈が揺れるため）
  let imgPath = path.join(SHOTS, file);
  if (opt.crop && sharp) {
    const cdir = path.join(SHOTS, 'crops'); fs.mkdirSync(cdir, { recursive: true });
    imgPath = path.join(cdir, file.replace(/.png$/, '') + '-' + [crop.x, crop.y, crop.w, crop.h].join('_') + '.png');
    if (!fs.existsSync(imgPath)) await sharp(path.join(SHOTS, file)).extract({ left: Math.round(crop.x * scaleX), top: Math.round(crop.y * scaleY), width: Math.round(crop.w * scaleX), height: Math.round(crop.h * scaleY) }).toFile(imgPath);
  }
  s.addImage({ path: imgPath, x: ix, y: iy, w: iw, h: ih, shadow: shadow() });
  // 項目は写真の上から順（線が交差しないように）
  const inside = bx0 => bx0 && bx0.x + bx0.w > crop.x && bx0.x < crop.x + crop.w && bx0.y + bx0.h > crop.y && bx0.y < crop.y + crop.h;
  const list = items.map(it => Object.assign({}, it, { box: meta.boxes[it.k] })).filter(it => inside(it.box));
  // 右配置は上から順、下配置は左から順（線が交差しないように）
  if (opt.layout === 'below') list.sort((p, q) => (p.box.x - q.box.x) || (p.box.y - q.box.y)); else list.sort((p, q) => (p.box.y - q.box.y) || (p.box.x - q.box.x));
  const n = list.length;
  // 切り出しの外にある枠は省かれる。省かれたら写真か crop の指定が合っていない合図なので知らせる
  console.log('  ・' + title + '　枠 ' + n + '/' + items.length + (n < items.length ? '　★' + items.filter(it => !meta.boxes[it.k] || list.indexOf(list.find(x => x.k === it.k)) < 0).map(it => it.k).join(',') + ' は写真の外' : ''));
  const pad = 4;
  // 撮影環境の描画不良（日付入力の表示崩れなど）を隠す：白で塗って文字を載せる
  (opt.mask || []).forEach(m => { const bx0 = meta.boxes[m.k]; if (!inside(bx0)) return; const mx = ix + (bx0.x - crop.x + 2) * r, my = iy + (bx0.y - crop.y + 2) * r, mw = (bx0.w - 4) * r, mh = (bx0.h - 4) * r; s.addShape(pres.ShapeType.rect, { x: mx, y: my, w: mw, h: mh, fill: { color: WHITE }, line: { color: WHITE, width: 0 } }); if (m.text) T(s, m.text, { x: mx + 0.12, y: my, w: mw - 0.2, h: mh, fontSize: Math.max(9, Math.min(14, mh * 40)), color: INK, valign: 'middle' }); });
  const frame = (it) => ({ fx: ix + (it.box.x - crop.x - pad) * r, fy: iy + (it.box.y - crop.y - pad) * r, fw: (it.box.w + pad * 2) * r, fh: (it.box.h + pad * 2) * r });
  const frames = list.map(frame);
  // URL版の素データ（赤枠の位置は、切り出した写真に対する割合で持つ）
  {
    const fr = b0 => ({ x: (b0.x - crop.x) / crop.w, y: (b0.y - crop.y) / crop.h, w: b0.w / crop.w, h: b0.h / crop.h });
    webImgs.add(imgPath);
    WEB.push({ kind: 'shot', kicker: kicker || null, title, sub: sub || '', img: path.basename(imgPath),
      ratio: crop.w / crop.h, below: opt.layout === 'below',
      items: list.map((it, i) => ({ n: i + 1, t: it.t, d: it.d || '', rect: fr(it.box) })),
      masks: (opt.mask || []).filter(m => inside(meta.boxes[m.k])).map(m => ({ rect: fr(meta.boxes[m.k]), text: m.text || '' })),
      note: opt.note || '' });
  }
  // ★番号は【枠の真上】に出す（2026-10-30 ユーザー指示）。
  //   それまでは枠の左の外に出していたので、ボタンが横に並んでいる所では
  //   となりのボタンの上に数字が乗って読めなかった。
  //   真上が他の赤枠とぶつかる時だけ「真下」→「左の外」の順でずらす。
  //   どこもぶつかる時は真上（＝必ず枠の外。中の文字は隠さない）。
  const ND = 0.3;
  const spots = [];
  const hitBox = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const numSpot = (f, i) => {
    // 横長の行は真ん中ではなく左の端の上（真ん中だと表のまん中に浮いて、どの行か分からない）
    const cx = f.fw > 3 ? f.fx + 0.05 : f.fx + f.fw / 2 - ND / 2;
    const cands = [
      { x: cx, y: f.fy - ND - 0.04 },
      { x: f.fx - 0.36, y: f.fy + Math.min(f.fh / 2, 0.22) - 0.15 },
      { x: cx, y: f.fy + f.fh + 0.04 },
    ];
    const where = ['上', '左', '下'];
    for (let w = 0; w < cands.length; w++) {
      const c = cands[w];
      if (c.x < 0.14 || c.x + ND > 13.19 || c.y < 1.18 || c.y + ND > H - 0.1) continue;
      const r0 = { x: c.x, y: c.y, w: ND, h: ND };
      if (frames.some((g, j) => j !== i && hitBox(r0, { x: g.fx, y: g.fy, w: g.fw, h: g.fh }))) continue;
      spots.push((i + 1) + where[w]);
      return c;
    }
    // ★どこもぶつかる＝写真が小さすぎるか、項目が近すぎる。番号が枠に重なるので知らせる
    spots.push((i + 1) + '★重なり');
    return { x: Math.min(Math.max(0.14, cx), 13.19 - ND), y: Math.max(1.18, f.fy - ND - 0.04) };
  };
  const drawFrame = (it, i) => {
    const f = frames[i];
    s.addShape(pres.ShapeType.rect, { x: f.fx, y: f.fy, w: f.fw, h: f.fh, fill: { type: 'none' }, line: { color: RED, width: 2.25 } });
    const sp = numSpot(f, i);
    numCircle(s, i + 1, sp.x, sp.y, ND);
    return f;
  };
  if (opt.layout === 'below') {
    // 写真を上いっぱいに、説明はその下に2〜3列
    const cols = n <= 6 ? Math.max(n, 1) : Math.ceil(n / 2), rows = Math.ceil(n / cols);   // 1行に並べて線の交差を避ける
    const gy = iy + ih + 0.4, rh = Math.min(1.6, (H - 0.35 - gy) / rows);
    // 項目が1〜2個の時は札を画面いっぱいに広げず、真ん中にまとめる
    const cw = n <= 2 ? Math.min(5.4, (12.2 - (cols - 1) * 0.2) / cols) : (12.2 - (cols - 1) * 0.2) / cols;
    const gx = n <= 2 ? (W - (cols * cw + (cols - 1) * 0.25)) / 2 : 0.55;
    list.forEach((it, i) => {
      const f = drawFrame(it, i);
      const cx = gx + (i % cols) * (cw + 0.25), cy = gy + Math.floor(i / cols) * rh;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: rh - 0.12, rectRadius: 0.05, fill: { color: SOFT }, line: { color: LINE, width: 0.75 } });
      numCircle(s, i + 1, cx + 0.1, cy + 0.1, 0.32);
      T(s, it.t, { x: cx + 0.5, y: cy + 0.08, w: cw - 0.6, h: 0.3, fontSize: cols >= 5 ? 11 : 12.5, bold: true, color: INK });
      if (it.d) T(s, it.d, { x: cx + 0.15, y: cy + 0.42, w: cw - 0.3, h: rh - 0.55, fontSize: 9.5, color: MUTED, valign: 'top' });
      // 枠の下辺の中央 → カードの上辺（番号の位置）
      leader(s, f.fx + Math.min(f.fw / 2, 1.0), f.fy + f.fh, cx + 0.26, cy);
    });
  } else {
    const cx = ix + iw + 0.35, cW = Math.max(2.8, 12.75 - cx), cTop = by;
    const rowH = Math.min(n <= 2 ? 1.7 : 1.15, bh / Math.max(n, 1));
    list.forEach((it, i) => {
      const f = drawFrame(it, i);
      const cy = cTop + i * rowH;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: cy + 0.04, w: cW, h: rowH - 0.1, rectRadius: 0.05, fill: { color: SOFT }, line: { color: LINE, width: 0.75 } });
      numCircle(s, i + 1, cx + 0.1, cy + 0.12, 0.32);
      T(s, it.t, { x: cx + 0.5, y: cy + 0.1, w: cW - 0.6, h: 0.3, fontSize: 12.5, bold: true, color: INK });
      if (it.d) T(s, it.d, { x: cx + 0.5, y: cy + 0.4, w: cW - 0.6, h: rowH - 0.5, fontSize: 10, color: MUTED, valign: 'top' });
      // 枠の右辺 → カードの左辺（番号の高さ）
      leader(s, f.fx + f.fw, f.fy + Math.min(f.fh / 2, 0.25), cx, cy + 0.28);
    });
  }
  if (spots.length) console.log('      番号 ' + spots.join(' / ') + (spots.some(x => x.indexOf('★') >= 0) ? '　← 要確認' : ''));
  if (opt.note) s.addNotes(opt.note);
  return s;
}

function slideSection(no, title, lead, items, color) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, '第 ' + no + ' 部', { x: 0.9, y: 1.4, w: 11.5, h: 0.4, fontSize: 14, bold: true, color: 'F2A97C', charSpacing: 2 });
  T(s, title, { x: 0.9, y: 1.85, w: 11.5, h: 0.85, fontSize: 38, bold: true, color: WHITE });
  if (lead) T(s, lead, { x: 0.9, y: 2.75, w: 10.5, h: 0.5, fontSize: 14, color: 'C6D4E8' });
  (items || []).forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.9 + col * 5.9, y = 3.5 + row * 0.62;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.6, h: 0.5, rectRadius: 0.08, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
    T(s, it, { x: x + 0.2, y, w: 5.3, h: 0.5, fontSize: 13, color: WHITE, valign: 'middle' });
  });
  WEB.push({ kind: 'section', no, title, lead: lead || '', items: items || [] });
}
function slideText(kicker, title, sub, blocks, opt) {
  opt = opt || {};
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, kicker, title, sub);
  const n = blocks.length, cols = n <= 2 ? n : (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols);
  const cw = (12.2 - (cols - 1) * 0.3) / cols, rh = Math.min(2.6, (H - 1.7 - 0.4) / rows);
  blocks.forEach((b, i) => {
    const x = 0.55 + (i % cols) * (cw + 0.3), y = 1.45 + Math.floor(i / cols) * (rh + 0.15);
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: rh, rectRadius: 0.08, fill: { color: b.tone === 'warn' ? ORANGE_L : b.tone === 'ok' ? 'E6F3EA' : SOFT }, line: { color: b.tone === 'warn' ? ORANGE : b.tone === 'ok' ? GREEN : LINE, width: 1 } });
    if (b.n != null) numCircle(s, b.n, x + 0.18, y + 0.2, 0.36, b.tone === 'warn' ? ORANGE : BLUE);
    T(s, b.t, { x: x + (b.n != null ? 0.66 : 0.25), y: y + 0.18, w: cw - (b.n != null ? 0.9 : 0.5), h: 0.4, fontSize: 15, bold: true, color: INK });
    T(s, b.d, { x: x + 0.25, y: y + 0.68, w: cw - 0.5, h: rh - 0.85, fontSize: 11.5, color: INK, valign: 'top', paraSpaceAfter: 4 });
  });
  if (opt.note) s.addNotes(opt.note);
  WEB.push({ kind: 'text', kicker: kicker || null, title, sub: sub || '', blocks, note: opt.note || '' });
}

// ── 表紙 ──
function slideCover() {
  const s = pres.addSlide(); s.background = { color: NAVY };
  T(s, 'Hub a Nice Day', { x: 0.9, y: 1.95, w: 11.5, h: 0.8, fontSize: 40, bold: true, color: WHITE });
  T(s, '週間カレンダーの使い方', { x: 0.9, y: 2.85, w: 11.5, h: 0.9, fontSize: 38, bold: true, color: '9FC2FF' });
  T(s, '1週間ぶんの車検と整備を、1枚で見る・入れる・空きを探す', { x: 0.9, y: 3.9, w: 11.5, h: 0.4, fontSize: 15, color: 'C6D4E8' });
  s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 4.7, w: 3.05, h: 0.46, rectRadius: 0.2, fill: { color: '1E3A66' }, line: { color: '2F5590', width: 1 } });
  T(s, '本店・三田店 共通', { x: 0.9, y: 4.7, w: 3.05, h: 0.46, fontSize: 12, color: 'C6D4E8', align: 'center', valign: 'middle' });
  T(s, '緑モータース　2026年10月版（v' + VERSION + '）' + (PROTO ? '　※試作' : ''), { x: 0.9, y: 6.5, w: 11.5, h: 0.35, fontSize: 11, color: '7E92AE' });
  WEB.push({ kind: 'cover', title: 'Hub a Nice Day', sub: '週間カレンダーの使い方',
    lead: '1週間ぶんの車検と整備を、1枚で見る・入れる・空きを探す', tag: '本店・三田店 共通',
    foot: '緑モータース　2026年10月版（v' + VERSION + '）' });
  s.addNotes('実際の画面を撮影して作っています。お客様のお名前・電話・住所は架空のものに置き換えてあります。');
}

function slideToc4() {
  const s = pres.addSlide(); s.background = { color: PAPER };
  pageTitle(s, null, 'この説明書でわかること', '週間カレンダーは「見る」だけでなく、そのまま「予約を入れる」「空きを探す」ところまでできます');
  const cols = [
    { t: '見る・開く', c: BLUE, bg: BLUE_L, items: ['週間カレンダーの開き方', '画面の見方（上の帯のボタン）', '畳む／開く（▲▼）', '日付を押して、その日の1日表示へ'] },
    { t: '予約を入れる', c: GREEN, bg: 'E6F3EA', items: ['車検を入れる（車検の行の ＋）', '一般（整備）を入れる（時間のマス）', '時間が決まっていない時（＋ 予定）'] },
    { t: '空きを探す', c: ORANGE, bg: ORANGE_L, items: ['🔍 空き検索の開き方', '車検の空き検索（コースで探す）', '一般の空き検索（かかる時間で探す）', 'やめる／週を送る'] },
  ];
  cols.forEach((c, i) => {
    const x = 0.55 + i * 4.12;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.45, w: 3.92, h: 5.4, rectRadius: 0.1, fill: { color: c.bg }, line: { color: c.c, width: 1.5 } });
    T(s, c.t, { x: x + 0.28, y: 1.65, w: 3.4, h: 0.5, fontSize: 19, bold: true, color: c.c });
    c.items.forEach((it, j) => {
      numCircle(s, j + 1, x + 0.28, 2.38 + j * 0.85, 0.34, c.c);
      T(s, it, { x: x + 0.76, y: 2.3 + j * 0.85, w: 3.0, h: 0.55, fontSize: 12.5, color: INK, valign: 'middle' });
    });
  });
  WEB.push({ kind: 'toc', title: 'この説明書でわかること',
    sub: '週間カレンダーは「見る」だけでなく、そのまま「予約を入れる」「空きを探す」ところまでできます',
    cols: cols.map(c => ({ t: c.t, c: c.c, items: c.items })) });
}

(async () => {
  await loadDims();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const A = { t: '見る', color: BLUE }, B = { t: '予約', color: GREEN }, C = { t: '空き検索', color: ORANGE };

  slideCover();
  slideToc4();

  // ═══════════ 第1部　見る・開く ═══════════
  slideSection(1, '見る・開く', '1週間ぶんを1枚で見られるようにしました',
    ['週間カレンダーの開き方', '画面の見方（上の帯のボタン）', '畳む／開く', '日付を押して、その日の1日表示へ']);

  await annotated(A, '① 週間カレンダーの開き方', 'スケジュール画面のいちばん上、ナビの「週間カレンダー」を押します', 'w1-open-sched.png', [
    { k: 'navWeek', t: '週間カレンダー', d: 'ここを押すと、1週間ぶんの表が画面いっぱいに開きます' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 110 }, top: true, layout: 'below', imgH: 1.1,
       note: '週間カレンダーは「開きっぱなし」にはなりません。✕ か Esc で閉じると元の画面に戻ります。' });

  await annotated(A, '② 画面の見方（上の帯）', '開いた直後は「畳んだ状態」＝予定がある時間だけが出ます', 'w2-week-folded.png', [
    { k: 'fold', t: '▲ 畳む ／ ▼ 開く', d: '予定が無い時間の行を隠す・また出す' },
    { k: 'from', t: '📍 本日から ／ 📅 月曜から', d: '週の始まりを切り替えます。既定は「本日から」＝今日が一番左' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 100 }, top: true, layout: 'below', imgH: 1.0 });

  await annotated(A, '③ 表の見方', '左端に「車検」「出勤」「時刻」、上に1週間ぶんの日が並びます', 'w2-week-folded.png', [
    { k: 'inspRow', t: '「車検」の行', d: 'その日の車検。マ＝マッハ／ク＝クイック／レ＝レギュラー。右端の ＋ で新しく受けられます' },
    { k: 'staffRow', t: '「出勤」の行', d: '左が出勤している人、右（うすい字）が休みの人。頭文字で出ます' },
    { k: 'ent', t: '整備の予定', d: '時間ごとの予定。お名前をなぞると「いつ予約を入れたか」が出ます' },
  ], { crop: { x: 0, y: 55, w: 1500, h: 255 }, top: true, colW: 4.3 });

  slideText(A, '④ 畳む／開く の考え方', '「▲ 畳む」が既定です。1週間のどこにも予定が無い時間は、行ごと隠します', [
    { n: 1, t: '▲ 畳む（開いた直後はこちら）', d: '1週間のどこにも予定が入っていない時間の行を隠します。\n「午前入庫」「午後入庫」「入庫時間未定」も、空なら隠れます。\n→ 画面が短くなり、予定だけがひと目で分かります。' },
    { n: 2, t: '▼ 開く', d: '9:00〜18:00 の 30分きざみの行を全部出します。\n「この時間が空いているか」を確かめたい時はこちら。' },
    { n: 3, t: '予定を入れる場所が無くなる心配は要りません', d: '畳んでいても、表のいちばん下に「＋ 予定」の行がいつも出ています。\nそこから、時間を決めずに予約カードを開けます（時間はカードの中で選びます）。', tone: 'ok' },
  ], { note: '空き検索をした時に見つかった枠は、畳んでいても隠れません（探した結果が消えないように）。' });

  await annotated(A, '⑤「▼ 開く」で全部の時間を出す', '時間の行が 9:00〜18:00 まで並びます', 'w3-week-open.png', [
    { k: 'fold', t: '▼ 開く を押した所', d: 'もう一度押すと「▲ 畳む」に戻ります' },
    { k: 'addCell', t: '空いているマス', d: 'クリックすると、その日・その時間で一般（整備）の予約カードが開きます' },
    { k: 'foot', t: 'いちばん下の帯', d: '「午後入庫」「入庫時間未定」は、表をスクロールしても下に貼り付いたまま残ります' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 950 }, top: true, colW: 4.0 });

  // ═══════════ 第2部　予約を入れる ═══════════
  slideSection(2, '予約を入れる', '週間カレンダーから、そのまま予約カードを開けます',
    ['車検を入れる（車検の行の ＋）', '一般（整備）を入れる（時間のマス）', '時間が決まっていない時（＋ 予定）']);

  await annotated(B, '⑥ 車検を入れる', '「車検」の行の右端にある ＋ を押します', 'w2-week-folded.png', [
    { k: 'inspAdd', t: '車検の ＋', d: 'その日の車検を新しく受けます。押すと車検予約カードが開きます' },
    { k: 'inspBadge', t: '入っている車検', d: 'マ・ク・レ の札。押すとその予約を開いて直せます。なぞると時間・お名前・コースが出ます' },
    { k: 'dayCnt', t: '○台', d: 'その日の合計。6台を超えると「承認待ち」の印（！）が付きます' },
  ], { crop: { x: 0, y: 55, w: 760, h: 100 }, top: true, layout: 'below', imgH: 1.5 });

  await annotated(B, '⑥ 車検を入れる（カード）', '＊の付いた項目は必ず入れてください。Enter で次の項目へ移れます', 'w4-insp-card.png', [
    { k: 'head', t: 'カードの見出し', d: '日にちと時間。「クリックで日付変更」で別の日へ移せます' },
    { k: 'name', t: '★ここが変わりました　来店者氏名 ＊ ／ 車検証の使用者', d: '氏名の欄を左右に分け、右に「車検証の使用者」を入れられるようにしました。当日ご来店された方に確かめる項目です。車検証の名前と来店者が違っていれば、右の「車検証の使用者」にその名前を入れてください（同じ時は「同じ」を押すと入ります）。陸運局へ出す時に、車検証の使用者と来店された方の名前が違うと不都合があるためです。' },
  ], { crop: { x: 0, y: 0, w: 560, h: 760 }, top: true, colW: 4.6 });

  await annotated(B, '⑦ 一般（整備）を入れる', '時間のマスをクリックすると、その日・その時間で予約カードが開きます', 'w3-week-open.png', [
    { k: 'addCell', t: '空いているマス', d: 'クリックで一般（整備）の予約カードが開きます。日と時間は、押したマスのものが最初から入ります' },
  ], { crop: { x: 0, y: 150, w: 1500, h: 300 }, top: true, colW: 3.2 });

  await annotated(B, '⑧ 時間がまだ決まっていない時', '畳んだ表のいちばん下「＋ 予定」から入れます', 'w2-week-folded.png', [
    { k: 'foldPlusRow', t: '「予定を足す」の行', d: '畳んでいても、開いていても、いつも表のいちばん下にあります' },
    { k: 'foldPlus', t: '＋ 予定', d: 'その日の予約カードを、時間を決めずに開きます' },
  ], { crop: { x: 0, y: 265, w: 1500, h: 48 }, top: true, layout: 'below', imgH: 0.75 });

  await annotated(B, '⑧ 時間はカードの中で選ぶ', '「時間帯」を押すと、選べる時間が全部ならびます（スクロールしません）', 'w5b-sched-slot.png', [
    { k: 'am', t: '午前入庫 ／ 午後入庫', d: '「午前に来る」「午後に来る」だけ決まっている時に使います' },
    { k: 'undec', t: '入庫時間未定', d: '時間がまったく決まっていない時。あとから直せます' },
  ], { crop: { x: 0, y: 60, w: 560, h: 360 }, top: true, colW: 4.6 });

  // ═══════════ 第3部　空き検索 ═══════════
  slideSection(3, '空き検索', 'お客様の電話を受けながら、空いている日・時間をすぐ出せます',
    ['🔍 空き検索の開き方', '車検の空き検索（コースで探す）', '一般の空き検索（かかる時間で探す）', 'やめる／週を送る']);

  await annotated(C, '⑨ 空き検索を開く', '上の帯の「🔍 空き検索」を押すと、条件を決める帯が出ます', 'w6-find-insp-bar.png', [
    { k: 'find', t: '🔍 空き検索', d: 'もう一度押すと帯が閉じます' },
    { k: 'kindInsp', t: '🚗 車検', d: '車検の空きを探します' },
    { k: 'kindSched', t: '⏰ 整備', d: '一般（整備）の空きを探します' },
    { k: 'go', t: 'この条件で空きを探す', d: '押すと、いま出している1週間の中から空きを探して色を付けます' },
    { k: 'clr', t: 'やめる', d: '色を消して、ふつうの表に戻します（帯は出たまま。条件を変えてもう一度探せます）' },
  ], { crop: { x: 0, y: 0, w: 1500, h: 125 }, top: true, layout: 'below', imgH: 1.25 });

  await annotated(C, '⑩ 車検の空き検索（条件）', '車検は「コース」で探します。コースごとに数え方が違います', 'w6-find-insp-bar.png', [
    { k: 'course1', t: 'マッハ車検', d: '10:00 と 14:00 の枠で見ます（入庫から1時間）' },
    { k: 'course2', t: 'クイック車検', d: '台数で見ます。1日6台まで（台数制限を掛けた日はその数）' },
    { k: 'course3', t: 'レギュラー車検', d: '台数で見ます。1日3台まで' },
    { k: 'hint', t: '数え方の案内', d: '選んだコースの数え方が、その場に出ます' },
  ], { crop: { x: 0, y: 55, w: 1010, h: 62 }, top: true, layout: 'below', imgH: 1.0 });

  await annotated(C, '⑩ 車検の空き検索（結果の見方）', '空いている日が明るく残り、空いていない日は暗くなります', 'w7-find-insp-run.png', [
    { k: 'lab', t: '空いている枠の案内', d: 'マッハなら「10:00・14:00 空き」のように、どの枠が空いているかが出ます' },
  ], { crop: { x: 0, y: 55, w: 1500, h: 440 }, top: true, colW: 3.2,
       note: 'マッハ車検は、整備の表の中に「マッハ可」の緑の札が出ます。札の隣の ＋ を押すと、その日・その時間でマッハ車検として受けられます。' });

  await annotated(C, '⑪ 一般（整備）の空き検索（条件）', '整備は「作業にかかる時間」で探します', 'w8-find-sched-bar.png', [
    { k: 'kindSched', t: '⏰ 整備', d: 'ここを押すと、条件が「作業の所要時間」に変わります' },
    { k: 'minGroup', t: '作業の所要時間', d: '30分／1時間／1時間半／2時間。選んだ時間より短い空きは出ません' },
    { k: 'go', t: 'この条件で空きを探す', d: '押すと、続けて取れる空きを探して囲います' },
  ], { crop: { x: 0, y: 55, w: 820, h: 62 }, top: true, layout: 'below', imgH: 1.0 });

  await annotated(C, '⑪ 一般の空き検索（結果の見方）', '「続けて取れるひとかたまり」を丸ごと囲います。1時間ずつには刻みません', 'w9-find-sched-run.png', [
    { k: 'blk', t: '明るい囲い', d: '続けて空いているひとかたまり。この中のどこから始めるかは、使う人が決めます' },
  ], { crop: { x: 0, y: 55, w: 1500, h: 530 }, top: true, colW: 3.2,
       note: '囲いに入っていない枠は暗くなります。選んだ所要時間より短い続きは取れないので、暗いままです。' });

  slideText(C, '⑫ 覚えておくと便利なこと', '空き検索まわりの決まりごと', [
    { n: 1, t: '週を送っても条件は残る', d: '「次の週 ›」を押すと、同じ条件でその週の空きを探し直します。\n電話で「来週は？」と聞かれた時に、そのまま送れます。' },
    { n: 2, t: '「やめる」は色を消すだけ', d: '帯は出たままなので、コースや時間を変えてもう一度探せます。\n帯ごと閉じたい時は、上の「🔍 空き検索」をもう一度押します。' },
    { n: 3, t: '探した枠は畳んでも隠れない', d: '畳んだ状態でも、見つかった枠の行は残ります。\n探した結果が消えてしまわないようにしています。', tone: 'ok' },
    { n: 4, t: '休業日・過ぎた日は対象外', d: '休業日の列と、今日より前の日は、はじめから対象にしません。', tone: 'warn' },
  ]);

  slideText(A, '困った時は', '週間カレンダーでよくある「あれ？」', [
    { t: '予定が出てこない', d: '「▲ 畳む」になっていると、予定が無い時間の行は隠れています。「▼ 開く」で全部出ます。\nそれでも出ない時は、店（本店／三田店）が合っているか確かめてください。' },
    { t: '入れたい時間の行が無い', d: '畳んでいるためです。「▼ 開く」で出すか、いちばん下の「＋ 予定」から、時間を決めずにカードを開いてください。' },
    { t: '今日がどこか分からない', d: '太いオレンジの枠で囲まれた列が今日です。「本日へ」を押すと今日の週に戻ります。' },
    { t: '表が小さくて見づらい', d: '右上の「画面いっぱい」の印を押すと、表だけを画面いっぱいに広げられます。もう一度押すと戻ります。' },
    { t: '並び順を紙と同じにしたい', d: '「📅 月曜から」に切り替えると、A3の紙と同じ月曜はじまりになります。' },
    { t: '誰が入れた予約か知りたい', d: 'お名前をなぞると「いつ・だれが予約を入れたか」が出ます。日にちを変えた記録も残ります。', tone: 'ok' },
  ]);

  // URL版（manual4_web）の素データと写真を書き出す。build_manual4_web.js がこれを読む
  fs.mkdirSync(path.join(WEBDIR, 'img'), { recursive: true });
  for (const f of webImgs) fs.copyFileSync(f, path.join(WEBDIR, 'img', path.basename(f)));
  fs.writeFileSync(path.join(WEBDIR, 'deck.json'), JSON.stringify({ version: VERSION, built: new Date().toISOString(), slides: WEB }, null, 1));

  await pres.writeFile({ fileName: OUT });
  console.log('');
  console.log('スライド ' + pres.slides.length + ' 枚');
  console.log('出力: ' + OUT);
})();
