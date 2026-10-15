// 新しい日付カレンダー（HubDatePick）の見え方を撮る。読み取りのみ。
const path = require('path'), fs = require('fs'), http = require('http');
const chromium = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'playwright')).chromium;
const DIR = 'C:/Users/A/HUB-A-NICE-DAY-DEV', PORT = 8353, STOR = 'hub-v8-dev-', OUT = __dirname;
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const now = new Date();
const d = (p) => { const x = new Date(now); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const seed = {
  [STOR + 'insp']: { [dk(d(0))]: [{ name: '前村　和子', carType: 'ワゴンR', no: '3310', time: '09:00', course: 1, store: 'honten', seq: 1, id: 1, staff: '竹林' }] },
  [STOR + 'honten-sched']: { [dk(d(0))]: { '09:00': { name: '桑田　陽子', carType: 'N-BOX', work: '6ヶ月点検', staff: '芦田' } } },
  [STOR + 'sanda-sched']: {}, [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }],
  [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [], [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const click = (x) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(t) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (t, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), t, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'pick_closed.png'), clip: { x: 300, y: 60, width: 900, height: 200 } });
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-datepick]')].find(e => e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
  console.log('日付の札を押せた: ' + ok);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'pick_open.png'), clip: { x: 300, y: 60, width: 900, height: 480 } });
  const mon = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : null; });
  console.log('出ている年月: ' + mon);
  console.log('日のボタン数: ' + await page.evaluate(() => document.querySelectorAll('[data-day]').length));
  if (errs.length) console.log('⚠ エラー: ' + errs.slice(0, 2).join(' / '));
  await browser.close(); server.close(); process.exit(0);
})();
