// レンタカーの貸出期間がスケジュールとズレていたら知らせるかの検査（2026-10-02 ユーザー報告）
//   これまで：ズレの警告は代車（lres）だけに効いており、レンタカーは明示的に対象外だった。
//            そのため「スケジュールは 9/6→10/4 なのにレンタカーは 9/6 の1日だけ」でも
//            黄色い帯も出ず、保存の確認も出なかった。
//   ここで見ること：
//     ① 1日だけのレンタカーが付いた整備（納車日あり）を開くと、黄色い帯に
//        「レンタカーの期間がスケジュールと一致しません」が出る
//     ② 保存を押すと確認が出る（文面に「レンタカー」と期間が入る）
//     ③ 期間が合っている時は何も出ない
//   実行: node rental_period_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8267, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const goTab = (page, label) => page.evaluate(x => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null); const tt = d.length ? d[d.length - 1].parentElement : null; if (tt) { tt.click(); return true; } return false; }, label);
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
const now = new Date();
const W = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);   // 作業日
const D2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10); // 納車日
const WDK = `${W.getFullYear()}-${W.getMonth() + 1}-${W.getDate()}`;
const DDK = `${D2.getFullYear()}-${D2.getMonth() + 1}-${D2.getDate()}`;
const BK = `sched-${WDK}-未定`;

const mk = (over) => ({
  [STOR + 'insp']: {},
  [STOR + 'honten-sched']: { [WDK]: { '未定': { id: 11, name: '大山', carType: 'スペーシア', work: 'B', content: '', deliveryDate: DDK, deliveryTime: '', rentalLabel: '🔑 ノート (55)', rentalCarId: 'R1' } } },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'rcars']: [{ id: 'R1', name: 'ノート', num: '55' }],
  [STOR + 'rres']: { R1: { k1: Object.assign({ id: 9001, user: '大山', bookingKey: BK, color: '#ccc' }, over) } },
  [STOR + 'honten-lcars']: [{ id: 'L1', name: 'ハスラー', num: '12' }],
  [STOR + 'honten-lres']: {},
});
// ① ズレている（作業日の1日だけ）  ② 合っている（作業日〜納車日）
const SEED_BAD = mk({ fy: W.getFullYear(), fm: W.getMonth(), fd: W.getDate(), ty: W.getFullYear(), tm: W.getMonth(), td: W.getDate() });
const SEED_OK = mk({ fy: W.getFullYear(), fm: W.getMonth(), fd: W.getDate(), ty: D2.getFullYear(), tm: D2.getMonth(), td: D2.getDate() });

const run = async (browser, seed) => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 25000);
  await goTab(page, 'スケジュール');
  await page.waitForTimeout(1500);
  for (let n = 0; n < 4; n++) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '‹' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(800);
  await page.getByText('大山', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await seeText(page, '整備の編集', 10000);
  return { ctx, page, errs, dialogs };
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  console.log('\n■ ① 1日だけのレンタカー（スケジュールは作業日〜納車日）');
  {
    const { ctx, page, errs, dialogs } = await run(browser, SEED_BAD);
    const txt = await page.evaluate(() => document.body.innerText);
    t('整備の編集が開く', txt.includes('整備の編集'), txt.slice(0, 160));
    t('★黄色い帯に「レンタカーの期間が…一致しません」が出る', /レンタカーの期間がスケジュールと一致しません/.test(txt), (txt.match(/.{0,20}一致しません.{0,40}/) || [''])[0]);
    dialogs.length = 0;
    await clickText(page, '予約確定');
    await page.waitForTimeout(1200);
    t('★保存を押すと確認が出る', dialogs.some(m => /レンタカーの期間/.test(m)), dialogs);
    t('確認の文面に期間が入っている', dialogs.some(m => /貸出期間/.test(m)), dialogs);
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await page.screenshot({ path: path.join(DIR, 'smoke-rental-period.png') });
    await ctx.close();
  }

  console.log('\n■ ② 期間が合っている時は何も出ない');
  {
    const { ctx, page, errs, dialogs } = await run(browser, SEED_OK);
    const txt = await page.evaluate(() => document.body.innerText);
    t('黄色い帯は出ない', !/一致しません/.test(txt), (txt.match(/.{0,20}一致しません.{0,30}/) || [''])[0]);
    dialogs.length = 0;
    await clickText(page, '予約確定');
    await page.waitForTimeout(1500);
    t('保存の確認も出ない', !dialogs.some(m => /一致していません/.test(m)), dialogs);
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
