// タイムスケジュールの自動追従スクロールの検査（2026-10-02 ユーザー指示）
//   ・今日を開くと、現在時刻のあたりまで自動で下がる（今までどおり）
//   ・自分でスクロールしたら、もう勝手に動かない（バネのように戻らない）
//     1.5秒ごとの再試行・30秒ごとの見直し・タブに戻った時のどれでも戻らないことを見る
//   ・日を変えると自動追従に戻る
//   実行: node sched_scroll_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8257, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const SEC = 'sec-sched';

(async () => {
  // 朝から夕方まで整備を入れて、縦に長い表にする（スクロールできる状態を作る）
  const day = {};
  ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'].forEach((tm, i) => {
    day[tm] = { id: 100 + i, name: '客' + (i + 1), carType: '車' + (i + 1), work: 'オイル', content: '' };
  });
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '原村', carType: 'シエンタ', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed' }] },
    [STOR + 'honten-sched']: { [DK]: day },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 760 } });
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
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('タイムスケジュールが出る', await seeText(page, 'タイムスケジュール', 15000));
  const top = () => page.evaluate(id => { const c = document.getElementById(id); return c ? Math.round(c.scrollTop) : -1; }, SEC);
  const canScroll = await page.evaluate(id => { const c = document.getElementById(id); return !!c && (c.scrollHeight - c.clientHeight) > 60; }, SEC);
  t('縦に長くてスクロールできる状態', canScroll, await page.evaluate(id => { const c = document.getElementById(id); return c ? { sh: c.scrollHeight, ch: c.clientHeight } : null; }, SEC));

  // ── ① 触らなければ自動で下がる（今の時刻のあたりへ） ──
  console.log('\n■ ① 触らなければ自動で現在時刻へ下がる');
  await page.waitForTimeout(4500);
  const auto = await top();
  const hour = new Date().getHours();
  if (hour >= 10 && hour < 18) t('自動で下へ下がっている（今は' + hour + '時台）', auto > 10, { auto });
  else t('朝/夜なので先頭のまま（今は' + hour + '時台・判定は飛ばす）', true, { auto });

  // ── ② 自分でスクロールしたら戻らない ──
  console.log('\n■ ② 自分で上にスクロールしたら戻らない');
  await page.evaluate(id => { const c = document.getElementById(id); c.scrollTop = 0; c.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true })); }, SEC);
  await page.waitForTimeout(600);
  const after0 = await top();
  t('一番上に動かせた', after0 <= 10, { after0 });
  await page.waitForTimeout(5000);   // 1.5秒ごとの再試行が3回以上回る時間
  const after5 = await top();
  t('★5秒待っても戻らない（バネが効かない）', after5 <= 10, { after0, after5 });
  // タブに戻った時も戻らない
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1200);
  t('★タブに戻っても戻らない', (await top()) <= 10, { now: await top() });
  // 途中の位置でも同じ（上に少し戻した位置を保つ）
  await page.evaluate(id => { const c = document.getElementById(id); c.scrollTop = 60; c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); }, SEC);
  await page.waitForTimeout(4000);
  const mid = await top();
  t('★途中の位置も保たれる', Math.abs(mid - 60) < 25, { mid });

  // ── ③ 日を変えると自動追従に戻る ──
  console.log('\n■ ③ 日を変えると自動追従に戻る');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '»' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('本日') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(4500);
  const back = await top();
  if (hour >= 10 && hour < 18) t('日を戻すとまた自動で下がる', back > 10, { back });
  else t('朝/夜なので判定は飛ばす', true, { back });

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-sched-scroll.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
