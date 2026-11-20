// 車両管理 → 代車管理への登録（2026-09-23）の検査。にせの firebase で本物には繋がない。
//   ・代車／レンタカーの車両に「代車管理に登録」ボタンが出る
//   ・押すと {店}-cars / rentalcars に 車種＋色・ナンバー で入る（ナンバーは最後の数字のかたまり）
//   ・すでに同じナンバーがあれば名前を更新（確認あり）／登録済みの印が出る
//   実行: node vehicle_loaner_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
const DIR = __dirname, PORT = 8179, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラーオフブルー', num: '8178', store: 'honten' }],
  [STOR + 'rentalcars']: [{ id: 'r1', name: 'ハスラーTW', num: '8902' }],
  [STOR + 'vehicles']: [
    { id: 'v1', name: 'スペーシアカスタム', num: '神戸582わ1741', color: 'パール', category: 'rental', regDate: '2026-09-01', inspections: [], note: '' },
    { id: 'v2', name: 'ワゴンR', num: '1234', color: 'シルバー', category: 'loaner', regDate: '2026-09-01', inspections: [], note: '' },
  ],
};
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
  sessionStorage.setItem(stor + 'fs-pref2', 'off');
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (/\.html$/.test(p)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(signedInInit, [0, ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });   // 確認・お知らせは OK
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  // ★車両管理は v3.80.0（2026-10-29）でナビから【ダッシュボードの中】へ移った（ナビのボタンはもう無い）。
  await page.evaluate(() => { window.open = () => null; });
  await page.click('[data-dashnav]');
  await page.waitForTimeout(600);
  await page.click('[data-dashtile="vehicle"]');
  t('車両管理を開ける', await seeText(page, 'スペーシアカスタム', 15000));
  // レンタカーの車両を選ぶ
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && e.textContent.trim().startsWith('スペーシアカスタム') && e.textContent.length < 40); if (el) el.click(); });
  await page.waitForTimeout(600);
  t('代車管理に入れる内容が出る（車種＋色・ナンバーは最後の数字）', await seeText(page, 'スペーシアカスタムパール', 8000) && (await page.evaluate(() => document.body.innerText)).includes('1741'), await page.evaluate(() => (document.body.innerText.match(/代車管理に入れる内容[^\n]*/) || [''])[0]));
  t('レンタカーに登録ボタンがある', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('レンタカーに登録'))));
  await clickText(page, 'レンタカーに登録');
  t('rentalcars に 車種＋色・ナンバーで入る', await page.waitForFunction(k => { const v = window.__fakeFb.get(k + 'rentalcars') || []; return v.some(c => c.name === 'スペーシアカスタムパール' && c.num === '1741'); }, STOR, { timeout: 10000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'rentalcars'), STOR));
  t('登録済みの印が出る', await seeText(page, '登録済み', 8000));
  // 代車の車両
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && e.textContent.trim().startsWith('ワゴンR') && e.textContent.length < 40); if (el) el.click(); });
  await page.waitForTimeout(600);
  t('代車は本店・三田の2つのボタンが出る', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].map(x => x.innerText); return b.some(x => x.includes('本店の代車に登録')) && b.some(x => x.includes('三田店の代車に登録')); }));
  await clickText(page, '本店の代車に登録');
  t('代車管理に色の見本（colorHex）も入る', await page.evaluate(k => (window.__fakeFb.get(k + 'honten-cars') || []).some(c => c.num === '1234' && /^#/.test(c.colorHex || '')), STOR), await page.evaluate(k => window.__fakeFb.get(k + 'honten-cars'), STOR));
  t('honten-cars に入る（店の印つき）', await page.waitForFunction(k => { const v = window.__fakeFb.get(k + 'honten-cars') || []; return v.some(c => c.name === 'ワゴンRシルバー' && c.num === '1234' && c.store === 'honten'); }, STOR, { timeout: 10000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'honten-cars'), STOR));
  t('もとからあった代車は消えない', await page.evaluate(k => (window.__fakeFb.get(k + 'honten-cars') || []).some(c => c.num === '8178'), STOR));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
