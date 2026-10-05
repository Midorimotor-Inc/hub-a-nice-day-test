// 「A4を1枚に写した写真の中の小さいQR」を見つけられるか／日本語が化けないか の検査（2026-10-05）
//   ユーザー指摘：「自動車検査証記録事項の下部にあるQRは車両情報ではないですか？」
//   → そのとおり。写真から読めなかったのは、1枚に写したときQRが小さすぎたのが大きい。
//   本物の jsQR と本物のQR画像で、実際に見つかるか・文字が正しく出るかを確かめる。
//   ※この検査だけは CDN に実際につなぐ（jsQR と QR作成のため）。
//   ※QRを作る qrcode-generator の既定は「文字コードの下1バイトだけ」を入れる作りなので、
//     日本語を入れる時は stringToBytes を差し替えること（差し替えないと作った時点で化ける）。
//   実行: node qr_small_scan_test.js
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
  const m = SRC.indexOf(NL + 'const ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  let i = m + 1, depth = 0, sawEq = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === '=' && depth === 0) sawEq = true;
    else if (c === ';' && depth === 0 && sawEq) return SRC.slice(m + 1, i + 1);
  }
  throw new Error(name + ' の終わりが分かりません');
};
const grabLet = (name) => {
  const m = SRC.indexOf(NL + 'let ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  return SRC.slice(m + 1, SRC.indexOf(';', m) + 1);
};
const CODE = [grabLet('_qrBdP'), grab('qrDetector'), grab('JSQR_SRC'), grabLet('_jsqrP'),
  grab('qrLoadJsQR'), grab('qrText'), grab('QR_MAX_HITS'), grab('qrScanCanvas')].join(NL);

// 車検証・記録事項の2次元コードに入っていそうな中身（長さの感じを本物に寄せる）。
// コード1・2は英数字中心、コード3には日本語が混じる
const T1 = '1/KOBE 580 A 3503/2/MK53S-123456/R06A';
const T2 = '2/18014/0001';
const T3J = '3/5100916/50709/1/乗用/自家用/箱型/スズキ/5AA-MK53S/4/850/1200/3395/1475/1785';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('about:blank');
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js' });
  await page.evaluate(() => { delete window.BarcodeDetector; });   // ★iPhone と同じ条件（jsQR だけ）にする
  await page.addScriptTag({ content: CODE });

  // QRを1つ描く部品（文字コードを選べる）
  await page.evaluate(() => {
    window.__drawBytes = (g, bytes, ox, oy, px) => {
      const keep = qrcode.stringToBytes;
      qrcode.stringToBytes = () => bytes;
      const q = qrcode(0, 'M'); q.addData('x', 'Byte'); q.make();
      qrcode.stringToBytes = keep;
      const n = q.getModuleCount(), cell = px / n;
      g.fillStyle = '#fff'; g.fillRect(ox - cell * 4, oy - cell * 4, px + cell * 8, px + cell * 8);
      g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue;
        const x0 = Math.round(ox + c * cell), x1 = Math.round(ox + (c + 1) * cell);
        const y0 = Math.round(oy + r * cell), y1 = Math.round(oy + (r + 1) * cell);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      return n;
    };
    window.__drawQR = (g, txt, ox, oy, px) =>
      window.__drawBytes(g, Array.from(new TextEncoder().encode(txt)), ox, oy, px);
  });

  // A4を1枚に写した写真を作る（縦2800px＝実際に写真から読む時と同じ大きさ）
  const makeSheet = (texts, qrPx, blur) => page.evaluate(([texts, qrPx, blur]) => {
    const H = 2800, W = Math.round(H * 210 / 297);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#222'; g.font = '34px sans-serif';
    g.fillText('自動車検査証記録事項', 60, 100);
    for (let i = 0; i < 26; i++) { g.fillRect(60, 180 + i * 62, W - 120, 2); g.fillText('項目 ' + (i + 1) + '  値', 70, 225 + i * 62); }
    texts.forEach((txt, i) => window.__drawQR(g, txt, 80 + i * (qrPx + 50), H - qrPx - 100, qrPx));
    if (blur) {
      const b = document.createElement('canvas'); b.width = W; b.height = H;
      const bg = b.getContext('2d', { willReadFrequently: true });
      bg.filter = 'blur(' + blur + 'px)'; bg.drawImage(cv, 0, 0);
      window.__sheet = b;
    } else window.__sheet = cv;
    return { W, H, qrPx };
  }, [texts, qrPx, blur]);

  const scan = (deep) => page.evaluate(d => qrScanCanvas(window.__sheet, d), deep);

  head('① 日本語が正しく出るか（iPhone と同じ jsQR で）');
  const one = await page.evaluate(async ([txt]) => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 900;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 900);
    window.__drawQR(g, txt, 100, 100, 700);
    return qrScanCanvas(cv, false);
  }, [T3J]);
  t('UTF-8 で入った日本語のQRを、化けずに読める', one.length === 1 && one[0] === T3J, one);

  head('② A4の下に並ぶ小さいQR（1辺190px ≒ 実物2cm）');
  const texts = [T1, T2, T3J];
  const info = await makeSheet(texts, 190, 0);
  t('写真の大きさは縦2800px（実際と同じ）', info.H === 2800, info);
  const whole = await scan(false);
  // ★見つけた所を白く塗って読み直すようにしたので、丸ごと1回でも3つとも拾える（2026-10-05）
  t('丸ごと1回読むだけでも3つとも見つかる', whole.length === 3, whole.length);
  const deep = await scan(true);
  t('切り分けて探せば3つとも見つかる', deep.length === 3, deep.length);
  t('中身が元の文字列と一致する（日本語も）',
    texts.every(x => deep.indexOf(x) >= 0), deep.map(x => x.slice(0, 24)));

  head('③ 少しボケた写真でも見つかるか');
  await makeSheet(texts, 190, 1.2);
  const d2 = await scan(true);
  t('わずかなボケでも3つとも見つかる', d2.length === 3, d2.length);

  head('④ もっと小さく写ってしまった時（1辺130px）');
  await makeSheet(texts, 130, 0);
  const d3 = await scan(true);
  t('1つ以上は見つかる', d3.length >= 1, d3.length);
  console.log('     （参考：' + d3.length + '/3 件。小さすぎると取りこぼすので、近づけて1つずつ撮るのが確実）');

  head('⑤ 近づけて1つだけ大きく撮った時（その場で撮る＝カメラと同じ条件）');
  const d4 = await page.evaluate(async ([txt]) => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 900;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 900);
    window.__drawQR(g, txt, 100, 100, 700);
    return qrScanCanvas(cv, false);
  }, [T1]);
  t('丸ごと1回読むだけで確実に読める（カメラ向きの撮り方）', d4.length === 1 && d4[0] === T1, d4);

  head('⑥ jsQR が文字に直せなかった時も捨てない（Shift_JIS で入っていた場合）');
  const sj = await page.evaluate(async () => {
    // "3/スズキ/OK" を Shift_JIS のバイト列で入れたQR
    const bytes = [0x33, 0x2F, 0x83, 0x58, 0x83, 0x59, 0x83, 0x4C, 0x2F, 0x4F, 0x4B];
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 600;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 600);
    window.__drawBytes(g, bytes, 80, 80, 440);
    const js = await qrLoadJsQR();
    const d = g.getImageData(0, 0, 600, 600);
    const raw = js(d.data, 600, 600, { inversionAttempts: 'attemptBoth' });
    return { rawData: raw ? raw.data : null, got: await qrScanCanvas(cv, false) };
  });
  t('Shift_JIS で入っていても読み捨てない', sj.got.length === 1, sj);
  t('Shift_JIS の日本語を正しく戻せる', sj.got[0] === '3/スズキ/OK', sj.got);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
