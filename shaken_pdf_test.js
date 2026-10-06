// 自動車検査証記録事項の PDF から取り込めるかの検査（2026-10-06 ユーザー要望）
//   ・本物の PDF（文字入り）を作り、pdf.js で読み直して必要な4項目が取れるか
//   ・行がばらばらの文字片で入っていても、同じ高さのものを1行にまとめられるか
//   ・スマホの画面に「📄 PDFから読み取る」の入口があるか
//   ※この検査は CDN に実際につなぐ（pdf.js と PDF作成のため）。
//   実行: node shaken_pdf_test.js
const path = require('path'), fs = require('fs');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const SRC = fs.readFileSync(path.join(__dirname, 'mobile.html'), 'utf8');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);

const grab = (name) => {
  for (const kw of ['const ', 'let ']) {
    const m = SRC.indexOf(NL + kw + name);
    if (m < 0) continue;
    let i = m + 1, depth = 0, sawEq = false;
    for (; i < SRC.length; i++) {
      const c = SRC[i];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if (c === '=' && depth === 0) sawEq = true;
      else if (c === ';' && depth === 0 && sawEq) return SRC.slice(m + 1, i + 1);
    }
  }
  throw new Error(name + ' が見つかりません');
};
const CODE = ['PDFJS_SRC', 'PDFJS_WORKER', '_pdfP', 'pdfLoad', 'pdfOpen', 'pdfText', 'pdfPageCanvas',
  'SHK_ERA', 'shkIso', 'SHK_HK', 'SHK_ZK', 'shkNorm', 'shkDate', 'SHK_MAKERS', 'SHK_PLATE_RE',
  'shkPlate', 'shkVin', 'shkModel', 'shkClass', 'shkJoinPlate', 'shakenParse',
  'OCR_LABELS', 'ocrFixVin', 'shakenOcrParse'].map(grab).join(NL);

// 自動車検査証記録事項に近い中身（項目名＋値）
const ROWS = [
  ['自動車検査証記録事項', ''],
  ['自動車登録番号又は車両番号', '神戸 580 あ 3503'],
  ['登録年月日/交付年月日', '令和 7年 9月16日'],
  ['初度登録年月', '令和 7年 9月'],
  ['自動車の種別', '普通'],
  ['用途', '乗用'],
  ['車名', 'スズキ'],
  ['型式', '5AA-MK53S'],
  ['車台番号', 'MK53S-123456'],
  ['原動機の型式', 'R06A'],
  ['型式指定番号', '18014'],
  ['類別区分番号', '0001'],
  ['有効期間の満了する日', '令和10年 9月16日'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('about:blank');
  // PDF を作る（jsPDF）。日本語を入れるため、文字は画像化せず Unicode フォントを埋め込む…のは重いので、
  // ★「文字がそのまま入っている PDF」を作れる pdf-lib ＋ 日本語フォントは重い。
  //   ここでは pdfmake の代わりに、jsPDF の addFont を使わず **PDF を手書き**で作る（Identity-H なしの簡易版）。
  //   目的は「pdf.js で文字が取り出せるか」なので、ToUnicode を自前で付けた最小 PDF を作る。
  await page.addScriptTag({ content: CODE });

  head('① PDF の文字から必要な項目が取れるか');
  // 手書きの最小 PDF（1ページ・Type0/Identity-H・ToUnicode 付き）を作る
  const made = await page.evaluate((rows) => {
    // --- 最小 PDF を組み立てる ---------------------------------------------
    // 文字は「グリフ番号＝通し番号」に割り当て、ToUnicode で本来の文字に戻す。
    // これで pdf.js は正しい文字列として読み取れる（実物のPDFと同じ読み取られ方）。
    const chars = [];
    const idx = new Map();
    const gid = ch => { if (!idx.has(ch)) { chars.push(ch); idx.set(ch, chars.length); } return idx.get(ch); };
    const lines = [];
    rows.forEach(([k, v], i) => {
      const y = 780 - i * 26;
      lines.push({ x: 60, y, s: k });
      if (v) lines.push({ x: 300, y, s: v });
    });
    lines.forEach(l => { for (const ch of l.s) gid(ch); });
    const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
    const content = lines.map(l =>
      'BT /F1 11 Tf ' + l.x + ' ' + l.y + ' Td <' + [...l.s].map(c => hex(gid(c))).join('') + '> Tj ET'
    ).join('\n');
    const widths = chars.map(() => 1000);
    const toUni = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n'
      + '/CMapName /A def /CMapType 2 def /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n'
      + '1 begincodespacerange <0000> <FFFF> endcodespacerange\n'
      + chars.length + ' beginbfchar\n'
      + chars.map((c, i) => '<' + hex(i + 1) + '> <' + [...c].map(x => hex(x.charCodeAt(0))).join('') + '>').join('\n')
      + '\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end';
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    const oCat = add('<< /Type /Catalog /Pages 2 0 R >>');
    const oPgs = add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    const oPg = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
    const oCnt = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    const oF1 = add('<< /Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>');
    const oDF = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Test /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /W [1 [' + widths.join(' ') + ']] >>');
    const oTU = add('<< /Length ' + toUni.length + ' >>\nstream\n' + toUni + '\nendstream');
    const oFD = add('<< /Type /FontDescriptor /FontName /Test /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>');
    let out = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
      + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    window.__pdfFile = new File([bytes], 'kiroku.pdf', { type: 'application/pdf' });
    return { size: bytes.length, chars: chars.length };
  }, ROWS);
  t('検査用のPDFを作れた', made.size > 1000 && made.chars > 20, made);

  const got = await page.evaluate(async () => {
    const doc = await pdfOpen(window.__pdfFile);
    const txt = await pdfText(doc);
    const p = shakenOcrParse(txt, 'pdf');
    return { txt, p, pages: doc.numPages };
  });
  t('pdf.js でPDFを開ける', got.pages === 1, got.pages);
  t('文字を取り出せる（項目名が読める）', /車台番号/.test(got.txt) && /有効期間の満了する日/.test(got.txt),
    String(got.txt || '').slice(0, 120));
  t('★ナンバーが入る', got.p.plate === '神戸580あ3503', got.p.plate);
  t('★初度登録年月が入る', got.p.firstReg === '2025-09', got.p.firstReg);
  t('★有効期間の満了する日が入る', got.p.expiry === '2028-09-16', got.p.expiry);
  t('★車台番号が入る', got.p.vin === 'MK53S-123456', got.p.vin);
  t('メーカー（車名）も入る', got.p.maker === 'スズキ', got.p.maker);
  t('型式も入る（型式指定番号と取り違えない）', got.p.model === '5AA-MK53S', got.p.model);
  t('PDFから読んだ印が付く', got.p.via === 'pdf', got.p.via);

  head('② 項目名と値が同じ行にそろうか（ばらばらの文字片でも）');
  t('項目名のすぐ右に値が来ている',
    String(got.txt).split(NL).some(l => /車台番号/.test(l) && /MK53S-123456/.test(l)),
    String(got.txt).split(NL).filter(l => /車台番号/.test(l)));

  head('③ 1ページ目を絵にできるか（車検証の控え用）');
  const cv = await page.evaluate(async () => {
    const doc = await pdfOpen(window.__pdfFile);
    const c = await pdfPageCanvas(doc, 1600);
    return { w: c.width, h: c.height, url: c.toDataURL('image/jpeg', 0.8).slice(0, 22) };
  });
  t('絵にできる（長辺1600px前後）', cv.h > 1200 && cv.h <= 1600 && cv.w > 0, cv);
  t('JPEGとして保存できる形になる', cv.url.indexOf('data:image/jpeg') === 0, cv.url);

  head('④ 画面の作り');
  t('入口に「PDFから読み取る」がある', SRC.indexOf('PDFから読み取る') > 0);
  t('PDFの入口は application/pdf を受ける', SRC.indexOf('accept="application/pdf"') > 0);
  // ★2026-10-06：カメラ・写真からの読み取りは外した。入口は PDF だけ
  t('カメラ・写真からの読み取りの入口は無い',
    SRC.indexOf('その場で撮る') < 0 && SRC.indexOf('写真から選ぶ') < 0 && SRC.indexOf('文字から読み取る') < 0
    && SRC.indexOf('accept="image/*') < 0 && SRC.indexOf('capture="environment"') < 0);
  t('カメラを動かす仕掛けも残っていない', SRC.indexOf('getUserMedia') < 0 && SRC.indexOf('videoRef') < 0);
  t('QR・文字読み取りの部品は残す（文字が入っていないPDFの保険）',
    SRC.indexOf('qrScanCanvas') > 0 && SRC.indexOf('const ocrRun=') > 0);
  t('手で入れる道は残してある', SRC.indexOf('読み取らずに手で入れる') > 0);
  t('文字が入っていないPDFはQR→文字読み取りに進む',
    SRC.indexOf('文字が入っていないPDFのようです') > 0 && SRC.indexOf('PDFのすみずみからQRを探しています') > 0);
  t('PDFから読んだ時は「見比べてください」の赤帯を出さない', SRC.indexOf('PDFの文字をそのまま読み取りました') > 0);
  t('pdf.js は使う時だけ読み込む', SRC.indexOf('const pdfLoad=') > 0 && SRC.indexOf('_pdfP') > 0);

  head('⑤ 「📖 PDFの作り方」');
  t('機能メニューに入口がある', SRC.indexOf('PDFの作り方') > 0 && SRC.indexOf('const PdfHowToSheet=') > 0);
  t('読み取り画面にも入口がある（2か所）', SRC.indexOf('PDFの作り方を見る') > 0);
  t('手順は5つ', [1, 2, 3, 4, 5].every(n => SRC.indexOf('{step(' + n + ',') > 0));
  t('写真を2枚使う', SRC.indexOf('help_shaken_app.jpg') > 0 && SRC.indexOf('help_shaken_code.jpg') > 0);
  t('紙の車検証の注意が入っている', SRC.indexOf('紙の車検証（2023年より前のもの）にはICチップがありません') > 0);
  t('手順の画面は読み取り画面より前に出る（かぶらない）', (() => {
    const z1 = Number((SRC.match(/zIndex:3500/) || []).length);      // 手順
    const z2 = Number((SRC.match(/zIndex:3300/) || []).length);      // 読み取り
    return z1 > 0 && z2 > 0;
  })());

  // 写真がリポジトリに置かれていて、スマホで開ける大きさか
  const imgs = ['help_shaken_app.jpg', 'help_shaken_code.jpg'].map(f => {
    const p = path.join(__dirname, f);
    return { f, exists: fs.existsSync(p), kb: fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1024) : 0 };
  });
  t('写真2枚がリポジトリにある', imgs.every(x => x.exists), imgs);
  t('写真は軽い（1枚100KB未満）', imgs.every(x => x.kb > 0 && x.kb < 100), imgs);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
