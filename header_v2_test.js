// スケジュール画面のヘッダーを片づけた分の検査（2026-10-29 ユーザー指示・mock_header_v2.html）
//   ① ダッシュボードのボタンはバージョンの段（1行目）に、いつも画面のまん中
//   ② ナビの段から「ダッシュボード」と「車両管理」が消えている
//   ③ 本店／三田店 が1行目に移っている（ナビの段には無い）
//   ④ アカウントの横の道具（スタッフ管理・休業日・復旧・控え）が消えて、ログアウトだけ残る
//   ⑤ 車両管理に赤・オレンジがあると、ダッシュボードのボタンに黄色の！が出る
//   ⑥ ダッシュボードの中に 車両管理 と 設定の道具 が入っている
//   実行: node header_v2_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8383, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 10, 21];

// 車両管理：期日を過ぎた点検を1台だけ入れておく（！が出る条件）
const VEH_ALERT = [
  { id: 'v1', group: 'factory', name: 'アルト（代車1）', num: '神戸 580 あ 1234', expiry: '2026-01-01' },
];
const VEH_OK = [
  { id: 'v1', group: 'factory', name: 'アルト（代車1）', num: '神戸 580 あ 1234', expiry: '2029-01-01' },
];

const seedOf = (veh) => ({
  [STOR + 'insp']: {},
  [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'vehicles-v2']: veh,
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
});

const run = async (chromium, seed) => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 980 } });
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
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  return { browser, ctx };
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

  // ══ 知らせ あり ══
  let { browser, ctx } = await run(chromium, seedOf(VEH_ALERT));
  let page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  // スケジュール画面へ
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1400);

  console.log('\n■ ① ダッシュボードのボタン（1行目・まん中）');
  const d = await page.evaluate(() => {
    const b = document.querySelector('[data-dashnav]'); if (!b) return null;
    const r = b.getBoundingClientRect();
    const logo = [...document.querySelectorAll('header div')].find(e => /Hub a Nice day/.test(e.innerText || ''));
    const lr = logo ? logo.getBoundingClientRect() : null;
    const nav = document.querySelector('[data-weeknav]');
    const nr = nav ? nav.getBoundingClientRect() : null;
    return { txt: b.innerText.replace(/\n/g, ' '), mid: (r.left + r.right) / 2, half: window.innerWidth / 2,
      top: r.top, logoTop: lr ? lr.top : null, navTop: nr ? nr.top : null,
      bang: !!b.querySelector('[data-dashbang]'),
      bangBg: (() => { const s = b.querySelector('[data-dashbang]'); return s ? getComputedStyle(s).backgroundColor : ''; })() };
  });
  t('ボタンがある', !!d, d);
  t('★★画面のまん中にある', !!d && Math.abs(d.mid - d.half) <= 6, d);
  t('★バージョンと同じ段（1行目）にある', !!d && d.logoTop != null && Math.abs(d.top - d.logoTop) <= 20, d);
  t('★ナビの段より上にある', !!d && d.navTop != null && d.top < d.navTop, d);
  t('★「別タブ」と書いてある', !!d && /別タブ/.test(d.txt), d);

  console.log('\n■ ⑤ 車両管理の知らせ → 黄色の！');
  t('★★！が出ている（期日を過ぎた点検が1台ある）', !!d && d.bang, d);
  t('★色は黄色（250,204,21）', !!d && /250, 204, 21/.test(d.bangBg), d && d.bangBg);

  console.log('\n■ ② ナビの段から外したもの');
  const nav = await page.evaluate(() => {
    const b = document.querySelector('[data-weeknav]'); if (!b) return null;
    const bar = b.parentElement;
    return [...bar.children].map(e => e.innerText.replace(/\s+/g, ''));
  });
  t('ナビの段が読めた', !!nav, nav);
  t('★「ダッシュボード」はもう無い', !!nav && !nav.some(x => /ダッシュボード/.test(x)), nav);
  t('★「車両管理」はもう無い', !!nav && !nav.some(x => /車両管理/.test(x)), nav);
  t('★残りは7つ', !!nav && nav.length === 7, nav);
  t('★カレンダー・週間カレンダー・スケジュール・代車管理・検索・顧客リスト・料金表',
    !!nav && ['カレンダー', '週間カレンダー', 'スケジュール', '代車管理', '検索', '顧客リスト', '料金表'].every(x => nav.some(y => y.indexOf(x) >= 0)), nav);

  console.log('\n■ ③ 本店／三田店 は1行目へ');
  const st = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-storebtn]')];
    if (!bs.length) return null;
    const nav = document.querySelector('[data-weeknav]');
    const nr = nav ? nav.getBoundingClientRect() : null;
    const r = bs[0].getBoundingClientRect();
    return { n: bs.length, txt: bs.map(b => b.innerText.trim()), top: r.top, navTop: nr ? nr.top : null };
  });
  t('店のボタンが2つある', !!st && st.n === 2, st);
  t('★ナビの段より上（1行目）にある', !!st && st.navTop != null && st.top < st.navTop, st);
  t('★押すと店が変わる', await (async () => {
    await page.evaluate(() => document.querySelector('[data-storebtn="sanda"]').click());
    await page.waitForTimeout(800);
    const ok = await page.evaluate(() => /三田店/.test(document.body.innerText));
    await page.evaluate(() => document.querySelector('[data-storebtn="honten"]').click());
    await page.waitForTimeout(800);
    return ok;
  })());

  console.log('\n■ ④ アカウントの横はログアウトだけ');
  const acct = await page.evaluate(() => {
    const el = document.querySelector('[data-acct]');
    if (!el) return null;
    return { txt: el.innerText.replace(/\s+/g, ''), btns: el.querySelectorAll('button').length };
  });
  t('アカウントの枠が読めた', !!acct, acct);
  t('★「🕒 復旧」はもう無い', !!acct && !/復旧/.test(acct.txt), acct);
  t('★「💾 控え」はもう無い', !!acct && !/控え/.test(acct.txt), acct);
  t('★ボタンはログアウトの1つだけ', !!acct && acct.btns === 1, acct);
  t('★名前はそのまま出る', !!acct && /江川京志/.test(acct.txt), acct);

  console.log('\n■ ⑥ ダッシュボードの中身');
  await page.goto('http://localhost:' + PORT + '/index_dev.html?dash=1', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  t('ダッシュボードが開いている', await page.evaluate(() => !!document.querySelector('[data-dash]')));
  t('★車両管理のタイルがある', await page.evaluate(() => !!document.querySelector('[data-dashtile="vehicle"]')));
  t('★期日ぎれの台数が出る', await page.evaluate(() => /期日ぎれ 1台/.test(document.querySelector('[data-dashtile="vehicle"]').innerText)),
    await page.evaluate(() => { const e = document.querySelector('[data-dashtile="vehicle"]'); return e ? e.innerText.replace(/\n/g, ' / ') : null; }));
  const tools = await page.evaluate(() => [...document.querySelectorAll('[data-dashtool]')].map(e => e.getAttribute('data-dashtool')));
  t('★設定の道具が4つある', tools.length === 4, tools);
  t('★スタッフ管理・休業日・復旧・控え', ['staff', 'holiday', 'restore', 'offline'].every(x => tools.indexOf(x) >= 0), tools);
  // 押すと本物の設定が開く（作り直していない＝今までの仕組みがそのまま出る）
  await page.evaluate(() => document.querySelector('[data-dashtool="holiday"]').click());
  await page.waitForTimeout(900);
  t('★★休業日の設定がちゃんと開く', await page.evaluate(() => /休業日/.test(document.body.innerText)));
  t('★ダッシュボードはその下に残っている（閉じれば戻れる）', await page.evaluate(() => !!document.querySelector('[data-dash]')));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await browser.close();

  // ══ 知らせ なし ══
  console.log('\n■ ⑤-2 知らせが無いときは！を出さない');
  ({ browser, ctx } = await run(chromium, seedOf(VEH_OK)));
  page = await ctx.newPage();
  page.on('dialog', async dd => { await dd.accept().catch(() => {}); });
  const click2 = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see2 = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see2(ME.name); await click2(ME.name); await click2('でログイン');
  await see2('スケジュール'); await click2('このまま使う');
  await page.waitForTimeout(2400);
  t('★★！は出ない', await page.evaluate(() => {
    const b = document.querySelector('[data-dashnav]'); return !!b && !b.querySelector('[data-dashbang]');
  }));
  t('★ボタン自体はちゃんとある', await page.evaluate(() => !!document.querySelector('[data-dashnav]')));
  await ctx.close(); await browser.close();

  server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
