// 顧客リストのPDFを下見する道具（2026-11-10・ブロードリーフのCSV/Excel廃止への備え）
//   来年から 顧客ファイル（202701.xlsx のような月ファイル）が PDF でしか出せなくなる見込み。
//   取り込みを作る前に、その PDF から【何がどこまで取れるか】を確かめるための読み取り専用の道具。
//
//   使い方:  node pdf_probe.js "C:/Users/A/Documents/Hub重要書類/サンプル.pdf"
//            node pdf_probe.js <PDF> --full   … 全文を Hub重要書類 に書き出す（お客様の情報が入る）
//            node pdf_probe.js <PDF> --page 2 … 見るページを変える（既定は1ページ目）
//            node pdf_probe.js <PDF> --all   … 全ページを数える（全件のPDFは何百ページにもなる）
//
//   ★お客様のお名前・電話・住所が入るので、既定では画面に出す分を伏せ字にする（架○ ○○）。
//     リポジトリにも OneDrive にも PDF を置かないこと（両リポジトリは public）。
//   ★読み取り専用。Firestore にも本番データにも一切触らない。
//   ★pdf.js は CDN から読む（アプリと同じ 3.11.174。v4 系は ESM なので使えない）。
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const args = process.argv.slice(2);
const FILE = args.find(a => !a.startsWith('--'));
const FULL = args.includes('--full');
const PAGE_NO = Number((args[args.indexOf('--page') + 1] || '1')) || 1;
const ALL = args.includes('--all');   // 全ページを数える（全件のPDFは何百ページにもなる）
if (!FILE) { console.error('PDFのパスを渡してください（例: node pdf_probe.js "C:/Users/A/Documents/Hub重要書類/サンプル.pdf"）'); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error('見つかりません: ' + FILE); process.exit(1); }

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const PORT = 8467;

// 画面に出す時だけ伏せ字にする（人の名前・電話・住所らしきもの）
const mask = (s) => String(s || '')
  .replace(/0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}/g, m => m.slice(0, 3) + '○'.repeat(Math.max(1, m.length - 3)))
  .replace(/[一-龥ぁ-んァ-ヶ]{2,}/g, m => m.length <= 2 ? m[0] + '○' : m.slice(0, 1) + '○'.repeat(m.length - 1));

(async () => {
  const bytes = fs.readFileSync(FILE);
  console.log('■ ファイル: ' + path.basename(FILE) + '（' + Math.round(bytes.length / 1024) + ' KB）');
  // ローカルの空ページを立てる（about:blank だと CDN のスクリプトを入れられないことがある）
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>pdf probe</title><body>');
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ url: PDFJS });
  const ok = await page.evaluate(w => { if (!window.pdfjsLib) return false; pdfjsLib.GlobalWorkerOptions.workerSrc = w; return true; }, WORKER);
  if (!ok) { console.error('pdf.js を読み込めませんでした（回線を確認してください）'); await browser.close(); server.close(); process.exit(1); }

  const out = await page.evaluate(async ([b64, pno]) => {
    const raw = atob(b64), data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pg = await doc.getPage(Math.min(pno, doc.numPages));
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    // ① 行に組み立てる（同じ高さ＝±3 を1行、左から並べる）。アプリの pdfText と同じ考え方
    const items = tc.items.filter(i => String(i.str).trim() !== '').map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    const rows = [];
    items.forEach(it => {
      let r = rows.find(r => Math.abs(r.y - it.y) <= 3);
      if (!r) { r = { y: it.y, cells: [] }; rows.push(r); }
      r.cells.push(it);
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => r.cells.sort((a, b) => a.x - b.x));
    // ② 列の推定（x座標のまとまり。10pt 以内は同じ列）
    const xs = items.map(i => Math.round(i.x)).sort((a, b) => a - b);
    const cols = [];
    xs.forEach(x => { const c = cols.find(c => Math.abs(c.x - x) <= 10); if (c) { c.n++; } else cols.push({ x, n: 1 }); });
    // ③ 塗り色（投函の黄色・行の色が PDF に残っているか）
    const opl = await pg.getOperatorList();
    const OPS = pdfjsLib.OPS, fills = {};
    let cur = null;
    for (let i = 0; i < opl.fnArray.length; i++) {
      const fn = opl.fnArray[i], a = opl.argsArray[i];
      if (fn === OPS.setFillRGBColor) cur = 'rgb(' + a.join(',') + ')';
      else if (fn === OPS.setFillGray) cur = 'gray(' + a[0] + ')';
      else if (fn === OPS.setFillCMYKColor) cur = 'cmyk(' + a.join(',') + ')';
      else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.constructPath) {
        if (cur) fills[cur] = (fills[cur] || 0) + 1;
      }
    }
    return {
      pages: doc.numPages, page: Math.min(pno, doc.numPages),
      size: { w: Math.round(vp.width), h: Math.round(vp.height) },
      textItems: tc.items.length, chars: items.reduce((n, i) => n + i.s.length, 0),
      rows: rows.map(r => ({ y: Math.round(r.y), cells: r.cells.map(c => ({ x: Math.round(c.x), s: c.s })) })),
      cols: (cols.filter(c => c.n >= 3).length ? cols.filter(c => c.n >= 3) : cols).sort((a, b) => a.x - b.x).slice(0, 24),
      fills: Object.entries(fills).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  }, [bytes.toString('base64'), PAGE_NO]);

  // --all: 全ページを通して「何件あるか」と「欲しい項目が入っているか」を数える
  let total = null;
  if (ALL) {
    console.log('■ 全ページを数えています…');
    total = await page.evaluate(async ([b64]) => {
      const raw = atob(b64), data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      const doc = await pdfjsLib.getDocument({ data }).promise;
      let rows = 0, chars = 0, text = '';
      const per = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const tc = await pg.getTextContent();
        const items = tc.items.filter(i => String(i.str).trim() !== '');
        const ys = [];
        items.forEach(i => { const y = i.transform[5]; if (!ys.some(v => Math.abs(v - y) <= 3)) ys.push(y); });
        rows += ys.length; chars += items.reduce((a, i) => a + i.str.length, 0);
        per.push({ p: n, rows: ys.length, items: items.length });
        if (text.length < 400000) text += items.map(i => i.str).join(' ') + String.fromCharCode(10);
      }
      return { pages: doc.numPages, rows, chars, per, text };
    }, [bytes.toString('base64')]);
  }

  console.log('■ ページ数: ' + out.pages + '（見ているのは ' + out.page + 'ページ目・' + out.size.w + '×' + out.size.h + 'pt）');
  console.log('');
  if (out.textItems === 0) {
    console.log('★【画像PDF】文字が1つも入っていません（スキャンした絵だと思われます）');
    console.log('   → 取り込みは OCR になります。数字は強いですが、氏名・英数字混じりは取り違えが出ます。');
    console.log('   → システムから「PDFで保存」したものがあれば、そちらをもらってください。');
  } else {
    console.log('★【文字入りPDF】文字が ' + out.textItems + '個・' + out.chars + '文字 入っています＝1文字も間違えずに取れます');
    console.log('   （車検証の記録事項の取り込みと同じ道。OCRは要りません）');
  }
  console.log('');
  console.log('■ 列の見当（x座標・その位置に何個文字があったか）');
  console.log('   ' + out.cols.map(c => c.x + '(' + c.n + ')').join('  '));
  console.log('');
  console.log('■ 行の組み立て（上から30行・お名前などは伏せ字）');
  out.rows.slice(0, 30).forEach((r, i) => {
    const line = r.cells.map(c => c.s).join(' │ ');
    console.log('   ' + String(i + 1).padStart(2) + ' ' + mask(line).slice(0, 150));
  });
  console.log('');
  console.log('■ 塗り色（投函の黄色・行の色が残っているか）');
  if (!out.fills.length) console.log('   色の指示はありません＝色は取れません（投函の黄色・行の色は Hub の中で持つ作りにします）');
  else out.fills.forEach(([c, n]) => console.log('   ' + c + ' … ' + n + '回'));
  console.log('');
  // 欲しい7項目が入っているかの当たり（全文で見る。画面には出さない）
  const whole = out.rows.map(r => r.cells.map(c => c.s).join(' ')).join('\n');
  const has = (name, re) => console.log('   ' + (re.test(whole) ? '○' : '×') + ' ' + name);
  console.log('■ 一本化に欲しい項目が入っているか（1ページ目で判定）');
  has('車検満了日・点検満期日らしい日付', /(令和|R|20\d\d)[\s./年-]*\d{1,2}[\s./月-]*\d{0,2}/);
  has('ナンバー（4桁）', /\b\d{2,4}\b/);
  has('ナンバー（地名つき・神戸 582 は 3182 のような形）', /[一-龥]{2,3}\s?\d{2,3}\s?[ぁ-ん]\s?\d{1,4}/);
  has('電話番号', /0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}/);
  has('住所（県・市・町・丁目など）', /[都道府県市区町村丁目番地]/);
  has('顧客コードらしい連番', /\b\d{5,}\b/);
  console.log('');
  if (FULL) {
    const dir = 'C:/Users/A/Documents/Hub重要書類';
    const to = path.join(dir, 'pdf-probe-' + path.basename(FILE).replace(/\.pdf$/i, '') + '.txt');
    fs.writeFileSync(to, whole, 'utf8');
    console.log('■ 全文を書き出しました（お客様の情報が入ります。リポジトリに置かないこと）');
    console.log('   ' + to);
  } else {
    console.log('■ 全文を目で見たい時は --full を付けてください（Hub重要書類 に .txt で出します）');
  }
  if (total) {
    console.log('');
    console.log('■ 全ページの合計（' + total.pages + 'ページ）');
    console.log('   行の数 ' + total.rows + '行 ／ 文字 ' + total.chars + '文字');
    const body = total.per.filter(x => x.rows > 3);
    const avg = body.length ? Math.round(body.reduce((a, x) => a + x.rows, 0) / body.length) : 0;
    console.log('   1ページあたり ' + avg + '行くらい（見出し・余白の行も含む）');
    console.log('   ★お客様の件数の見当：ざっと ' + Math.max(0, total.rows - total.pages * 3) + '件前後');
    const hasA = (name, re) => console.log('   ' + (re.test(total.text) ? '○' : '×') + ' ' + name);
    console.log('■ 全ページで見た「欲しい項目」');
    hasA('電話番号', /0d{1,4}[-(]?d{1,4}[-)]?d{3,4}/);
    hasA('住所', /[都道府県市区町村丁目番地]/);
    hasA('顧客コードらしい連番', /d{5,}/);
    hasA('ナンバー（地名つき）', /[一-龥]{2,3}s?d{2,3}s?[ぁ-ん]s?d{1,4}/);
  }
  if (errs.length) console.log('■ JSエラー: ' + errs.slice(0, 3).join(' / '));
  await browser.close(); server.close();
})();
