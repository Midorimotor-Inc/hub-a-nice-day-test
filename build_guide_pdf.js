// 登録手順（Markdown）を A4 の PDF にする。 node build_guide_pdf.js [入力.md] [出力.pdf]
//   簡易 Markdown（見出し・箇条書き・番号付き・表・太字・区切り線・リンク）だけを HTML にして Chromium で印刷する。
const path = require('path'), fs = require('fs');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const IN = process.argv[2] || 'C:/Users/A/Documents/Hub取扱説明書/Hub_登録手順_2026-09.md';
const OUT = process.argv[3] || IN.replace(/\.md$/, '.pdf');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/(https?:\/\/[^\s)）]+)/g, '<a href="$1">$1</a>');
function md2html(md) {
  const L = md.replace(/\r/g, '').split('\n');
  let out = [], i = 0;
  const flushList = (tag, items) => out.push(`<${tag}>` + items.map(x => `<li>${x}</li>`).join('') + `</${tag}>`);
  while (i < L.length) {
    const l = L[i];
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    // ``` で囲んだ所はそのまま出す（命令・フォルダの形。折り返して全部見せる）
    if (/^```/.test(l)) {
      i++; const buf = [];
      while (i < L.length && !/^```/.test(L[i])) { buf.push(esc(L[i])); i++; }
      if (i < L.length) i++;
      out.push('<pre>' + buf.join('\n') + '</pre>');
      continue;
    }
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < L.length && /^\|/.test(L[i])) { rows.push(L[i]); i++; }
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      out.push('<table><thead><tr>' + head.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^\d+\.\s/.test(l) || /^[-*]\s/.test(l)) {
      const ordered = /^\d+\.\s/.test(l); const items = [];
      while (i < L.length && (ordered ? /^\d+\.\s/.test(L[i]) : /^[-*]\s/.test(L[i]))) {
        let item = inline(L[i].replace(/^(\d+\.|[-*])\s/, '')); i++;
        const sub = [];
        while (i < L.length && /^\s{2,}[-*]\s/.test(L[i])) { sub.push(inline(L[i].replace(/^\s+[-*]\s/, ''))); i++; }
        if (sub.length) item += '<ul class="sub">' + sub.map(x => `<li>${x}</li>`).join('') + '</ul>';
        items.push(item);
      }
      flushList(ordered ? 'ol' : 'ul', items); continue;
    }
    if (l.trim() === '') { i++; continue; }
    const para = []; while (i < L.length && L[i].trim() !== '' && !/^(#|---|\||\d+\.\s|[-*]\s)/.test(L[i])) { para.push(inline(L[i])); i++; }
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('\n');
}
const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
body { font-family: "Yu Gothic UI","Meiryo","Segoe UI",sans-serif; color:#1e293b; font-size: 11pt; line-height: 1.75; }
h1 { font-size: 20pt; color:#0f172a; border-bottom: 3px solid #f97316; padding-bottom: 6px; margin: 0 0 6px; }
h1 + p { color:#64748b; font-size: 9.5pt; margin-top: 0; }
h2 { font-size: 14pt; color:#c2410c; background:#fff7ed; border-left: 6px solid #f97316; padding: 5px 10px; margin: 20px 0 8px; page-break-after: avoid; }
h3 { font-size: 11.5pt; color:#1d4ed8; margin: 14px 0 4px; page-break-after: avoid; }
p { margin: 4px 0 8px; }
ul, ol { margin: 4px 0 10px; padding-left: 22px; }
li { margin: 2px 0; }
ul.sub { margin: 2px 0 2px; padding-left: 18px; color:#475569; font-size: 10.5pt; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 10pt; page-break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; text-align: left; }
th { background: #f1f5f9; }
code { background:#f1f5f9; border-radius:4px; padding: 0 4px; font-size: 10pt; }
pre { background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #94a3b8; border-radius:4px;
      padding: 8px 10px; margin: 6px 0 12px; font-size: 9.5pt; line-height: 1.6;
      font-family: "Consolas","Yu Gothic UI",monospace; white-space: pre-wrap; word-break: break-all;
      page-break-inside: avoid; }
a { color:#1d4ed8; text-decoration: none; word-break: break-all; }
hr { border: none; border-top: 1px dashed #cbd5e1; margin: 14px 0; }
b { color:#0f172a; }
`;
// 足の文字と「章ごとに改ページ」は呼ぶ側から変えられる（既定は今までどおり）
//   GUIDE_TITLE=金庫に入れるもの   … 足の文字
//   GUIDE_BREAK=h2                 … その見出しから必ず新しいページにする（最初の1つは除く）
const FOOT = process.env.GUIDE_TITLE || 'Hub a Nice Day 登録手順';
const BREAK = process.env.GUIDE_BREAK ? `
${process.env.GUIDE_BREAK} { page-break-before: always; }
${process.env.GUIDE_BREAK}:first-of-type { page-break-before: auto; }
` : '';
(async () => {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${CSS}${BREAK}</style></head><body>${md2html(fs.readFileSync(IN, 'utf8'))}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: 'load' });
  if (process.env.GUIDE_SHOT) await page.screenshot({ path: process.env.GUIDE_SHOT, fullPage: true });   // 見た目の確認用
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#94a3b8;font-family:sans-serif">' + FOOT + ' — <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  await browser.close();
  console.log('PDF:', OUT);
})();
