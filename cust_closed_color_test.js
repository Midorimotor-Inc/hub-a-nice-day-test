// 顧客リスト（customers.html）から開いた予約カードの入庫日カレンダーで、
// 休業日が【赤】で出ること（週間カレンダー・スケジュールと同じ色）。
//   2026-10-30 ユーザー指示：顧客リストから開いた予約カードのカレンダーの休業日が
//                            灰色なので、同じく赤色に変えてほしい。
//   それまでは灰色の斜めしま（#f9fafb/#f3f4f6）＋「休」の1文字で、
//   休業日なのか、ただ薄く出ているだけなのか見分けがつかなかった。
//   実行: node cust_closed_color_test.js
//        SHOT=<保存先.png> node cust_closed_color_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8405, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };

// ★週間カレンダー（index_dev.html の CLOSED_*）と同じ値。片方だけ変えないこと。
const BG = 'rgb(254, 202, 202)';   // #fecaca
const FG = 'rgb(153, 27, 27)';     // #991b1b

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 10, 21];   // 日付を固定（水曜が必ず月の中に何回か来る）
const CUST = { custId: 'F__1__リスト太郎', rowIdx: 1, expiry: '2026-11-20', name: 'リスト太郎', no: 1001, carType: 'アルト',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '' };

const seed = {
  [STOR + 'insp']: {},
  [STOR + 'inspLimits']: {},
  // ★本店の定休日を【水曜】にして、カレンダーに必ず休業日が出るようにする
  [STOR + 'honten-cdow']: [3], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202611', count: 1 }],
  [STOR + 'cf-202611-index']: { name: '202611', chunks: 1, total: 1 },
  [STOR + 'cf-202611-chunk-0']: [CUST],
  [STOR + 'cust-updates']: [],
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));

  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('リスト太郎'));

  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /＋予約/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('予約カードが開く', await page.evaluate(() => !!document.querySelector('input[placeholder="担当者名"]')));

  // 入庫日のカレンダーを開く
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /入庫日|日付を選ぶ|カレンダー/.test(e.innerText));
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

  console.log('\n■ ★休業日は赤で出す（灰色の斜めしまをやめた）');
  const cl = await page.evaluate(() => {
    const m = document.querySelector('[data-custclosed]');
    if (!m) return null;
    const cell = m.parentElement, cs = getComputedStyle(cell), ms = getComputedStyle(m);
    // 日付の数字（セルの最初の div）
    const num = cell.querySelector('div'), ns = num ? getComputedStyle(num) : null;
    return { n: document.querySelectorAll('[data-custclosed]').length,
      bg: cs.backgroundColor, bgImg: cs.backgroundImage, bar: cs.boxShadow,
      label: m.innerText.trim(), labelColor: ms.color, labelSize: parseFloat(ms.fontSize),
      numColor: ns ? ns.color : null };
  });
  t('カレンダーに休業日がある（水曜を定休にしてある）', !!cl && cl.n >= 3, cl && cl.n);
  t('★地は週間カレンダーと同じ赤（#fecaca）', !!cl && cl.bg === BG, cl && cl.bg);
  t('★灰色の斜めしまはもう使っていない', !!cl && cl.bgImg === 'none', cl && cl.bgImg);
  t('★左端に濃い赤の縦バーが入る', !!cl && /185, 28, 28/.test(cl.bar), cl && cl.bar);
  t('★「休」ではなく「休業日」と出す', !!cl && cl.label === '休業日', cl && cl.label);
  t('★札の字も週間カレンダーと同じ赤（#991b1b）', !!cl && cl.labelColor === FG, cl && cl.labelColor);
  t('★日付の数字も灰色ではなく赤', !!cl && cl.numColor === FG, cl && cl.numColor);

  console.log('\n■ 休業日は選べないまま（決まりは変えていない）');
  const before = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /入庫日|日付を選ぶ/.test(e.innerText));
    return b ? b.innerText.trim() : null;
  });
  await page.evaluate(() => { const m = document.querySelector('[data-custclosed]'); if (m) m.parentElement.click(); });
  await page.waitForTimeout(400);
  const stillOpen = await page.evaluate(() => !!document.querySelector('[data-custclosed]'));
  t('★休業日を押しても何も起きない（カレンダーは開いたまま）', stillOpen, { before, stillOpen });

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
