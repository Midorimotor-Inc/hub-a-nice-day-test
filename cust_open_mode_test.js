// 顧客リストの開き方が、今の画面の大きさに合うかの検査（2026-09-30 ユーザー指示）。
//   顧客リストは いつでも同じタブの中 で開く。そうすると行き来しても画面の大きさが揃う。
//   ・ふつうの大きさ → リストもふつう。リストの中で全画面にして戻れば、スケジュールも全画面。
//   ・全画面         → リストも全画面。「スケジュールに戻る」で戻っても全画面のまま。
//   検索から選んだ時も、ナビの「顧客リスト」からも同じ規則。
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

  // ── ふつうの大きさ：同じタブの中で開く（大きさが揃う） ──
  console.log('\n■ ふつうの大きさの時');
  let newTab0 = null;
  ctx.once('page', p => { newTab0 = p; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.style.width === '118px' && e.innerText.includes('顧客リスト')); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('同じタブの中で顧客リストが開く', await page.evaluate(() => { const f = document.querySelector('iframe[title="顧客リスト"]'); return !!f && f.parentElement.style.display !== 'none'; }));
  t('新しいタブは開かない', !newTab0, { newTab: !!newTab0 });
  t('ふつうの大きさのまま', await page.evaluate(() => !(document.fullscreenElement || document.webkitFullscreenElement)));
  const fr0 = page.frames().find(f => /customers.html/.test(f.url()));
  t('顧客リストの中身が出ている', !!fr0 && await fr0.waitForFunction(() => document.body.innerText.includes('顧客リスト'), null, { timeout: 15000 }).then(() => true).catch(() => false));
  if (fr0) {
    await fr0.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('全画面') && !e.innerText.includes('元に戻す')); if (b) b.click(); });
    await page.waitForTimeout(1000);
  }
  t('リストの中で全画面にできた（検査の前提）', await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)));
  if (fr0) {
    await fr0.evaluate(() => { const a = [...document.querySelectorAll('a')].find(e => e.innerText.includes('スケジュールに戻る')); if (a) a.click(); });
    await page.waitForTimeout(1500);
  }
  t('戻るとリストが閉じる', await page.evaluate(() => { const f = document.querySelector('iframe[title="顧客リスト"]'); return !f || f.parentElement.style.display === 'none'; }));
  t('★リストで全画面にしたら、戻ったスケジュールも全画面', await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)));
  // ── 全画面：同じタブの中で開く ──
  console.log('\n■ 全画面の時');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('全画面') && !e.innerText.includes('元に戻す')); if (b) b.click(); });
  await page.waitForTimeout(800);
  const isFs = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
  t('全画面に入れた（検査の前提）', isFs);
  let newTab = null;
  ctx.once('page', p => { newTab = p; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.style.width === '118px' && e.innerText.includes('顧客リスト')); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('同じタブの中で顧客リストが開く', await page.evaluate(() => !!document.querySelector('iframe[title="顧客リスト"]')));
  t('新しいタブは開かない', !newTab, { newTab: !!newTab });
  t('全画面のまま', await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)));
  // 「スケジュールに戻る」で閉じても全画面のまま
  const frame = page.frames().find(f => /customers\.html/.test(f.url()));
  t('顧客リストの中身が出ている', !!frame && await frame.waitForFunction(() => document.body.innerText.includes('顧客リスト'), null, { timeout: 15000 }).then(() => true).catch(() => false));
  if (frame) {
    await frame.evaluate(() => { const a = [...document.querySelectorAll('a')].find(e => e.innerText.includes('スケジュールに戻る')); if (a) a.click(); });
    await page.waitForTimeout(1500);
  }
  t('戻ると顧客リストが閉じる', await page.evaluate(() => { const f = document.querySelector('iframe[title="顧客リスト"]'); return !f || f.parentElement.style.display === 'none'; }));
  t('戻っても全画面のまま', await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement)));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
