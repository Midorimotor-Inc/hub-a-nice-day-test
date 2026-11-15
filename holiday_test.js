// 祝日の見張り
//   ・index_dev.html と mobile.html の HOLIDAYS は必ず同じ中身にすること
//   ・12月に祝日は無い（12/23 は【平成の】天皇誕生日で 2019年から平日）。2026-11-15 現場指摘
//   ・2027年（令和9年）＝国立天文台の暦要項どおり16日＋3/22 振替休日。春分 3/21・秋分 9/23
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
  const i = src.indexOf('const HOLIDAYS');
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
  t('★5/6 は振替休日（5/3 が日曜）', A.indexOf('2026-5-6') >= 0);

  head('①-3 振替休日の取りこぼしが無いか（日曜に当たった祝日を全部見る）');
  // 祝日が日曜なら、その後ろの「祝日でない最初の日」が振替休日になる（祝日法 第3条2項）。
  // ★ここは暦要項に書いてある振替休日を【そのまま表に書く】こと。
  //   リストから数えて出そうとすると、足した振替休日まで数えて1日先を見てしまう（2026-11-15 に踏んだ）。
  const SUBS = { '2026-5-3': '2026-5-6', '2027-3-21': '2027-3-22' };
  const sundays = A.filter(dk => { const p = dk.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).getDay() === 0; });
  const noRule = sundays.filter(dk => !SUBS[dk] && Object.values(SUBS).indexOf(dk) < 0);
  t('★日曜に当たった祝日は、すべて表（SUBS）に載っている', noRule.length === 0, noRule);
  const lack = Object.keys(SUBS).filter(k => A.indexOf(SUBS[k]) < 0);
  t('★表の振替休日がすべてリストに入っている', lack.length === 0, lack.map(k => k + ' → ' + SUBS[k]));

  head('①-2 2027年（令和9年）の祝日＝暦要項どおり');
  // 国立天文台の暦要項（令和8年2月2日 発表）：祝日16日＋「3月22日は休日になる」＝振替休日
  const Y27 = ['2027-1-1','2027-1-11','2027-2-11','2027-2-23','2027-3-21','2027-3-22',
               '2027-4-29','2027-5-3','2027-5-4','2027-5-5','2027-7-19','2027-8-11',
               '2027-9-20','2027-9-23','2027-10-11','2027-11-3','2027-11-23'].sort();
  const got27 = A.filter(x => x.indexOf('2027-') === 0);
  t('★2027年の祝日が暦要項どおり17日（祝日16＋振替1）', got27.join(',') === Y27.join(','),
    { 足りない: Y27.filter(x => got27.indexOf(x) < 0), 余分: got27.filter(x => Y27.indexOf(x) < 0) });
  t('★春分の日は 2027-3-21（暦要項）', got27.indexOf('2027-3-21') >= 0);
  t('★3/21 は日曜なので 3/22 が振替休日', got27.indexOf('2027-3-22') >= 0);
  t('★秋分の日は 2027-9-23（暦要項）', got27.indexOf('2027-9-23') >= 0);
  t('★2027年も12月に祝日は無い', got27.filter(x => /^2027-12-/.test(x)).length === 0);
  // 9/20 敬老の日 と 9/23 秋分の日 の間は2日あくので「国民の休日」は付かない
  t('★2027-9-21・9-22 は祝日にしない（国民の休日は付かない）',
    got27.indexOf('2027-9-21') < 0 && got27.indexOf('2027-9-22') < 0);

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

  head('③ 画面：2027年の祝日も色が付くか');
  const goMonth = async (label) => {
    for (let i = 0; i < 36; i++) {
      if ((await monthNow()) === label) return true;
      await page.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); });
      await page.waitForTimeout(300);
    }
    return (await monthNow()) === label;
  };
  const cellOf = (dk) => page.evaluate(k => {
    const d = document.querySelector('[data-calday="' + k + '"]');
    if (!d) return { found: false };
    return { found: true, hol: d.getAttribute('data-calhol'), text: (d.innerText || '').slice(0, 12) };
  }, dk);

  t('2027年1月を開けた', await goMonth('2027年1月'), await monthNow());
  const jan1 = await cellOf('2027-1-1');
  t('★2027/1/1（元日）に「祝」が出る', jan1.hol === '1' && jan1.text.indexOf('祝') >= 0, jan1);
  const jan11 = await cellOf('2027-1-11');
  t('★2027/1/11（成人の日）に「祝」が出る', jan11.hol === '1' && jan11.text.indexOf('祝') >= 0, jan11);

  t('2027年3月を開けた', await goMonth('2027年3月'), await monthNow());
  const mar21 = await cellOf('2027-3-21'), mar22 = await cellOf('2027-3-22');
  t('★2027/3/21（春分の日）に「祝」が出る', mar21.hol === '1' && mar21.text.indexOf('祝') >= 0, mar21);
  t('★2027/3/22（振替休日）にも「祝」が出る', mar22.hol === '1' && mar22.text.indexOf('祝') >= 0, mar22);
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 });

  t('2027年9月を開けた', await goMonth('2027年9月'), await monthNow());
  const s21 = await cellOf('2027-9-21'), s23 = await cellOf('2027-9-23');
  t('★2027/9/23（秋分の日）に「祝」が出る', s23.hol === '1' && s23.text.indexOf('祝') >= 0, s23);
  t('★2027/9/21 は祝日にしない', s21.found && s21.hol === '0' && s21.text.indexOf('祝') < 0, s21);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 2));
  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
