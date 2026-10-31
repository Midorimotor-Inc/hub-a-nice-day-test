// 投函済みチェックは【管理者だけ】が触れる（2026-10-31 ユーザー指示）
//   指示：「この投函済みのチェックは管理者以外触れないようにしてください」
//   管理者でない人は：
//     ① 黄色／白は**見える**（まだ投函していないのが誰かは分かってよい）
//     ② マスを掴めない（ドラッグしても選べない・ポップも出ない）
//     ④ 絞り込みと統計は使える（見るだけだから）
//   ★管理者の判定は index_dev.html の canRestore と同じ条件（isHubAdmin）。
//     共有端末は誰が座っているか分からないので、誰であっても管理者扱いにしない。
//   実行: node dm_admin_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8421, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const YELLOW = 'rgb(255, 242, 0)';
const SEL = 'rgb(186, 230, 253)';
const FILE = '202701x';

const mk = (i, o) => Object.assign({
  custId: FILE + '__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-0' + i,
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-09-12', dm1Book: '', dm2Date: '2026-09-19', dm2Book: '',
  dm1Sent: false, dm2Sent: true,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
const CUSTS = [mk(1), mk(2), mk(3), mk(4, { dm1Sent: true })];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h8', name: '岡上秀一', myNumber: 8, badge: 'mechanic', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: FILE, count: CUSTS.length }],
  [STOR + 'cf-' + FILE + '-index']: { name: FILE, chunks: 1, total: CUSTS.length },
  [STOR + 'cf-' + FILE + '-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

const cells = (page, n) => page.evaluate((n) => {
  return [...document.querySelectorAll('tbody tr')].map(tr => {
    const tds = [...tr.children];
    if (tds.length < 8) return null;
    const td = tds[4 + n * 2];
    return { name: (tds[1].innerText || '').split('\n')[0].trim(),
      bg: getComputedStyle(td).backgroundColor, cur: getComputedStyle(td).cursor, title: td.getAttribute('title') || '' };
  }).filter(Boolean);
}, n);
const dragCells = (page, n, from, to) => page.evaluate(([n, from, to]) => {
  const td = (i) => { const tr = document.querySelectorAll('tbody tr')[i]; return tr ? tr.children[4 + n * 2] : null; };
  const ev = (el, type) => el && el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  ev(td(from), 'mousedown');
  for (let i = from + 1; i <= to; i++) ev(td(i), 'mouseover');
}, [n, from, to]);
const popOpen = (page) => page.evaluate(() => [...document.querySelectorAll('div')]
  .some(e => e.offsetParent !== null && /📮 投函の記録/.test(e.innerText || '')));

// me.admin: 許可簿の role。me.cert: 端末の利用証に isAdmin を載せるか
const run = async (who, me) => {
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: me.kind, l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([
      Object.assign({ uid: me.uid, name: me.name, store: me.store, email: me.email }, me.cert || {})]));
    localStorage.setItem(stor + 'auth-kind', me.kind);
  }, [me, STOR, seed]);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(() => document.body.innerText.includes('客1'), null, { timeout: 25000 }); } catch (e) {}
  // ★許可簿の読み込みを待つ（管理者の名前一覧は後から入る）
  await page.waitForTimeout(3000);
  return { page, browser, server, errs };
};
const stop = async (c) => { await c.browser.close(); c.server.close(); await new Promise(r => setTimeout(r, 300)); };

(async () => {
  // ══ 管理者ではない人（許可簿の role は staff・利用証にも印なし）
  head('管理者ではない人（岡上さん）');
  let c = await run('staff', { email: 'okagami@midori-m.com', fbuid: 'uid_oka', uid: 'h8', name: '岡上秀一', store: 'honten', role: 'staff', kind: 'own' });
  let c0 = await cells(c.page, 0);
  t('顧客リストが開く', c0.length === 4, c0.length);
  t('★投函の色は見える（未投函3件が黄色）', c0.filter(x => x.bg === YELLOW).length === 3, c0.map(x => x.bg));
  t('★マスに指の形が出ない', c0.every(x => x.cur !== 'pointer'), c0.map(x => x.cur));
  t('★「管理者だけです」と出る', c0[0].title.indexOf('管理者だけ') >= 0, c0[0].title);
  await dragCells(c.page, 0, 0, 2);
  await c.page.waitForTimeout(300);
  c0 = await cells(c.page, 0);
  t('★ドラッグしても選べない', c0.every(x => x.bg !== SEL), c0.map(x => x.bg));
  await c.page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await c.page.waitForTimeout(500);
  t('★離してもポップが出ない', !(await popOpen(c.page)));
  t('絞り込みボタンは使える（見るだけ）',
    await c.page.evaluate(() => [...document.querySelectorAll('button')].some(b => /未投函①/.test(b.innerText) && b.offsetParent !== null)));
  t('統計の未投函も見える', await c.page.evaluate(() => /未投函①/.test(document.body.innerText)));
  t('JSエラーが出ていない', c.errs.length === 0, c.errs.slice(0, 3));
  await stop(c);

  // ══ 管理者（利用証に印あり）
  head('管理者（江川さん・自分の端末）');
  c = await run('admin', { email: 'egawa@midori-m.com', fbuid: 'uid_ega', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', kind: 'own', cert: { isAdmin: true } });
  c0 = await cells(c.page, 0);
  t('★マスに指の形が出る', c0.filter(x => x.bg === YELLOW).every(x => x.cur === 'pointer'), c0.map(x => x.cur));
  await dragCells(c.page, 0, 0, 2);
  await c.page.waitForTimeout(300);
  c0 = await cells(c.page, 0);
  t('★ドラッグで選べる', c0.slice(0, 3).every(x => x.bg === SEL), c0.map(x => x.bg));
  await c.page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await c.page.waitForTimeout(500);
  t('★ポップが出る', await popOpen(c.page));
  t('JSエラーが出ていない', c.errs.length === 0, c.errs.slice(0, 3));
  await stop(c);

  // ══ 共有端末（誰が座っているか分からないので、管理者でも触れない）
  head('共有端末（誰が座っているか分からない）');
  c = await run('device', { email: 'egawa@midori-m.com', fbuid: 'uid_ega', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', kind: 'shared', cert: { isAdmin: true, isDevice: true } });
  c0 = await cells(c.page, 0);
  t('★共有端末では触れない（指の形にならない）', c0.every(x => x.cur !== 'pointer'), c0.map(x => x.cur));
  t('★それでも投函の色は見える', c0.filter(x => x.bg === YELLOW).length === 3, c0.map(x => x.bg));
  t('JSエラーが出ていない', c.errs.length === 0, c.errs.slice(0, 3));
  await stop(c);

  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
