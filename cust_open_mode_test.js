// 顧客リストの開き方の検査（2026-10-04 ユーザー決定：いつでも別タブ）。
//   ・ナビの「顧客リスト」も、検索から選んだ時も、新しいタブで開く。
//   ・元のタブ（スケジュール）の中には開かない。
//   ・検索から選んだ時は、そのお客様で絞り込まれた状態で開く（?find=）。
//   ・リストのタブの「スケジュールに戻る」で、そのタブが閉じる。
//   実行: node cust_open_mode_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8237, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'cf-index']: [{ name: '202610', count: 1 }],
    [STOR + 'cf-202610-index']: { name: '202610', total: 1, chunks: 1 },
    [STOR + 'cf-202610-chunk-0']: [{ custId: 'c1', rowIdx: 1, name: '井上花子', no: 1001, carType: 'ハスラー', phoneMobile: '090-1111-2222', address: '三田市', expiry: '2026-11-30', status: '', entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', bookingTime: '', linkedInspDate: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '' }],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true, args: ['--enable-features=AllowContentInitiatedDataUrlNavigations'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');   // 全画面の案内は閉じる（＝ふつうの大きさで始める）
  await page.waitForTimeout(600);


  // ── ナビの「顧客リスト」 ──
  console.log(String.fromCharCode(10) + "■ ナビの「顧客リスト」");
  const waitTab = () => new Promise(res => { const to = setTimeout(() => res(null), 8000); ctx.once("page", p => { clearTimeout(to); res(p); }); });
  let tabP = waitTab();
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(e => e.style.width === "118px" && e.innerText.includes("顧客リスト")); if (b) b.click(); });
  const tab1 = await tabP;
  t("★新しいタブで開く", !!tab1, { tab: !!tab1 });
  if (tab1) await tab1.waitForLoadState("domcontentloaded").catch(() => {});
  t("開いたタブは顧客リスト", !!tab1 && /customers.html/.test(tab1.url()), tab1 && tab1.url());
  t("元のタブの中には開かない", await page.evaluate(() => { const f = document.querySelector("iframe[title=\"顧客リスト\"]"); return !f || f.parentElement.style.display === "none"; }));
  t("顧客リストの中身が出ている", !!tab1 && await tab1.waitForFunction(() => document.body.innerText.includes("顧客リスト"), null, { timeout: 20000 }).then(() => true).catch(() => false));

  // ── リストのタブの「スケジュールに戻る」 ──
  console.log(String.fromCharCode(10) + "■ スケジュールに戻る");
  if (tab1) {
    await tab1.evaluate(() => { const a = [...document.querySelectorAll("a")].find(e => e.innerText.includes("スケジュールに戻る")); if (a) a.click(); });
    await page.waitForTimeout(2000);
  }
  t("★そのタブが閉じる", !!tab1 && tab1.isClosed(), { closed: tab1 && tab1.isClosed(), url: tab1 && !tab1.isClosed() ? tab1.url() : "" });

  // ── 検索から選んだ時 ──
  console.log(String.fromCharCode(10) + "■ 検索から選んだ時");
  tabP = waitTab();
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(e => e.innerText.trim() === "検索" && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const i = [...document.querySelectorAll("input")].find(e => e.offsetParent !== null && /セリエ/.test(e.placeholder || ""));
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(i, "井上"); i.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(1500);
  const clicked = await page.evaluate(() => {
    const all = [...document.querySelectorAll("div")].filter(e => e.offsetParent !== null && /井上花子/.test(e.innerText || "") && /顧客/.test(e.innerText || ""));
    const row = all.filter(e => !all.some(o => o !== e && e.contains(o)))[0] || all[all.length - 1];
    if (!row) return false;
    row.click(); return true;
  });
  const tab2 = clicked ? await tabP : null;
  t("検索の顧客行を押せた", clicked);
  t("★新しいタブで開く", !!tab2, { tab: !!tab2 });
  if (tab2) await tab2.waitForLoadState("domcontentloaded").catch(() => {});
  t("★その人で絞り込んだ形で開く（?find=）", !!tab2 && /find=/.test(tab2.url()), tab2 && tab2.url());
  t("JSエラーなし", errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + '結果: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error("検査が止まりました:", e); process.exit(1); });
