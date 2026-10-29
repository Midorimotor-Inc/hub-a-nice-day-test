// 予約のお名前に「様」が付くかの検査（2026-10-30 ユーザー指示）
//   ① 1日表示（車検の行・整備の行）
//   ② 週表示・ダッシュボード・検索
//   ③ 予約カードの氏名欄に「様」が見える
//   ④ ★保存する名前には「様」を入れない（顧客リストとの突き合わせ・検索・代車の紐付けが壊れるため）
//   ⑤ すでに「様」「御中」で終わっている名前には足さない（二重敬称にしない）
//   実行: node sama_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8385, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 10, 21];
const TODAY = '2026-10-21';

const ins = (nm, extra) => Object.assign(
  { name: nm, carType: 'アルト', no: '3503', course: 2, store: 'honten', time: '09:00',
    staff: '岡田', bookingStatus: 'confirmed' }, extra || {});

const seed = {
  [STOR + 'insp']: {
    [TODAY]: [
      ins('青木　一郎'),
      ins('井上商事 御中'),      // すでに敬称あり → 足さない
      ins('上田　歩 様'),        // すでに「様」 → 足さない
    ],
  },
  [STOR + 'honten-sched']: {
    [TODAY]: {
      '13:00': { name: '遠藤　咲', carType: 'タント', no: '1234', work: 'T', content: 'タイヤ交換', staff: '江川京志' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
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
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1600);

  console.log('\n■ ① 1日表示');
  const body = await page.evaluate(() => document.body.innerText);
  t('★車検の行に「青木　一郎様」と出る', /青木　一郎様/.test(body), body.slice(0, 200));
  t('★整備の行に「遠藤　咲様」と出る', /遠藤　咲様/.test(body));
  t('★「青木　一郎」だけ（様なし）では出ていない', !/青木　一郎(?!様)/.test(body));

  console.log('\n■ ⑤ 二重敬称にしない');
  t('★「井上商事 御中」はそのまま（御中様にしない）', /井上商事 御中/.test(body) && !/御中様/.test(body), body.match(/井上商事[^\n]*/));
  t('★「上田　歩 様」はそのまま（様様にしない）', !/様\s*様/.test(body), body.match(/上田[^\n]*/));

  console.log('\n■ ③ 予約カードの氏名欄');
  await page.evaluate(() => { const td = [...document.querySelectorAll('td')].find(e => /青木/.test(e.innerText)); if (td) td.click(); });
  await page.waitForTimeout(1000);
  t('予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  t('★氏名の欄に「様」が見えている', await page.evaluate(() => !!document.querySelector('[data-namesama]')));
  t('★★入力欄の中身には「様」が入っていない（保存する名前は元のまま）', await page.evaluate(() => {
    const i = [...document.querySelectorAll('.booking-modal-inner input')].find(x => x.value === '青木　一郎');
    return !!i;
  }), await page.evaluate(() => [...document.querySelectorAll('.booking-modal-inner input')].map(x => x.value).filter(Boolean).slice(0, 5)));
  t('★すでに「様」で終わる名前には出さない', await (async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { const td = [...document.querySelectorAll('td')].find(e => /上田/.test(e.innerText)); if (td) td.click(); });
    await page.waitForTimeout(1000);
    return await page.evaluate(() => !document.querySelector('[data-namesama]'));
  })());
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(700);

  console.log('\n■ ② 週表示・ダッシュボード・検索');
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1400);
  const wk = await page.evaluate(() => [...document.querySelectorAll('[data-wentnm]')].map(e => e.innerText.trim()));
  t('★週表のお名前に様が付く', wk.indexOf('遠藤　咲様') >= 0, wk);
  const wkb = await page.evaluate(() => [...document.querySelectorAll('[data-wcb]')].map(b => b.getAttribute('title') || ''));
  t('★車検のバッジのなぞり書きにも様', wkb.some(x => /青木　一郎様/.test(x)), wkb[0]);
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-weekview] button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(600);
  // 検索
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /検索/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const i = document.querySelector('input[type=search], input[placeholder*="氏名"], input[placeholder*="検索"]'); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, '青木'); i.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(1200);
  t('★検索の結果にも様が付く', await page.evaluate(() => /青木　一郎様/.test(document.body.innerText)),
    await page.evaluate(() => document.body.innerText.slice(0, 300)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  console.log('\n■ ④ 保存するデータには入らない');
  const saved = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'insp');
  const names = (saved && saved[TODAY] ? saved[TODAY] : []).map(r => r && r.name);
  t('★★保存されている名前に「様」が付いていない', names.indexOf('青木　一郎') >= 0 && !names.some(n => n === '青木　一郎様'), names);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
