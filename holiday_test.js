// 祝日：12月に祝日は無い（12/23 は【平成の】天皇誕生日で 2019年から平日）。2026-11-15 現場指摘
//   ・index_dev.html と mobile.html の HOLIDAYS_2026 は必ず同じ中身にすること
//   ・画面でも 12/23 に「祝」が出ず、数字が赤くないことを見る
//   実行: node holiday_test.js
//   SHOT=<保存先.png> で 12月のカレンダーの見た目も撮れる
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8487, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

// ── ① ファイルの中身：2つのファイルの祝日リストがそろっているか ──
const listOf = (file) => {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const i = src.indexOf('HOLIDAYS_2026');
  const a = src.indexOf('[', i), b = src.indexOf(']', a);
  return (src.slice(a + 1, b).match(/'[^']+'/g) || []).map(x => x.slice(1, -1)).sort();
};

(async () => {
  head('① 祝日のリスト（ファイルの中身）');
  const A = listOf('index_dev.html'), B = listOf('mobile.html');
  t('★index_dev と mobile の祝日リストが同じ中身', A.join(',') === B.join(','), { index: A.length, mobile: B.length });
  // ★12月に祝日は無い。12/23 は【平成の】天皇誕生日で、2019年から平日（令和は 2/23）
  const dec = A.filter(x => /^2026-12-/.test(x));
  t('★12月に祝日を入れない（12/23 は平日）', dec.length === 0, dec);
  t('2/23（令和の天皇誕生日）は祝日のまま', A.indexOf('2026-2-23') >= 0);
  t('11/23（勤労感謝の日）は祝日のまま', A.indexOf('2026-11-23') >= 0);

  head('② 画面：12月のカレンダー');
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('江川京志')); if (b) b.click(); });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('でログイン')); if (b) b.click(); });
  await seeText(page, 'スケジュール', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'カレンダー' && x.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1500);
  // 2026年12月まで「翌月」で送る（今が何月でも届くように、出ている年月を見ながら押す）
  const monthNow = () => page.evaluate(() => (document.body.innerText.match(/(20\d\d)年(\d+)月/) || [])[0] || '');
  for (let i = 0; i < 24; i++) {
    if ((await monthNow()) === '2026年12月') break;
    await page.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); });
    await page.waitForTimeout(350);
  }
  t('2026年12月を開けた', (await monthNow()) === '2026年12月', await monthNow());
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const cell = await page.evaluate(() => {
    const d = document.querySelector('[data-calday="2026-12-23"]');
    if (!d) return { found: false };
    const num = d.querySelector('div');
    return { found: true, hol: d.getAttribute('data-calhol'), text: (d.innerText || '').slice(0, 12), color: num ? getComputedStyle(num).color : '' };
  });
  t('12/23 のマスが見つかる', cell.found, cell);
  t('★12/23 は祝日あつかいになっていない', cell.hol === '0', cell);
  t('★12/23 に「祝」の字が出ない', cell.found && cell.text.indexOf('祝') < 0, cell);
  t('★12/23 の数字が赤くない（平日の色）', cell.color !== 'rgb(220, 38, 38)', cell);
  // 念のため、ほかの祝日ではちゃんと出ることも見る（見張りが効いていることの裏取り）
  for (let i = 0; i < 24; i++) {
    if ((await monthNow()) === '2026年11月') break;
    await page.evaluate(() => { const b = document.querySelector('button[title="前月"]'); if (b) b.click(); });
    await page.waitForTimeout(350);
  }
  const nov = await page.evaluate(() => {
    const d = document.querySelector('[data-calday="2026-11-23"]');
    return d ? { hol: d.getAttribute('data-calhol'), text: (d.innerText || '').slice(0, 12) } : { hol: null };
  });
  t('11/23 は今までどおり「祝」が出る（見張りが効いている裏取り）', nov.hol === '1' && nov.text.indexOf('祝') >= 0, nov);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 2));
  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
