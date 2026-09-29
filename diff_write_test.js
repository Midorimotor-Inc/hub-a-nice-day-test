// 「手元が欠けた状態で保存しても、サーバーの他の予定を消さない」検査（2026-09-29）。
//   これまで useShared の保存は手元の中身をキーごと丸ごと書いていた。表示が消えた状態で
//   1件入力すると、その日の他の予定や別の日まで消える危険があった（＝復活しない消え方）。
//   直し：before（保存前の手元）と after を見比べ、触った所だけをサーバー最新値に当てる。
//   実行: node diff_write_test.js        修正前を見る: SRC=<古いファイル> node diff_write_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8213, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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
const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;
const OTHER = new Date(Y, M, D + 1);
const DK2 = `${OTHER.getFullYear()}-${OTHER.getMonth() + 1}-${OTHER.getDate()}`;

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [DK]: { '09:00': { id: 1, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '点検' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, (process.env.SRC && p === 'index_dev.html') ? process.env.SRC : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の予定が出ている', await seeText(page, '相原', 15000));

  // ★ほかの端末が入れた予定を、画面には知らせずにサーバーだけに足す
  //   （＝画面の手元が「欠けている」状態。表示消失が起きた時と同じ状況）
  await page.evaluate(([k, dk, dk2]) => {
    const cur = window.__fakeFb.get(k + 'honten-sched') || {};
    const next = Object.assign({}, cur);
    next[dk] = Object.assign({}, cur[dk], { '10:00': { id: 2, name: '井本', carType: 'タント', work: '点検', content: '12ヶ月' } });
    next[dk2] = { '09:00': { id: 3, name: '上野', carType: 'アルト', work: '車検前点検', content: '下回り' } };
    window.__fakeFb.setQuiet(k + 'honten-sched', next);   // 購読には知らせない
  }, [STOR, DK, DK2]);
  await page.waitForTimeout(500);
  t('画面には、他の端末が入れた分はまだ出ていない（検査の前提）', !(await page.evaluate(() => document.body.innerText.includes('井本'))));

  // その状態で、この画面から保存を1回走らせる（予定の「入庫済み」チェック＝ useShared の保存を通る）
  const saved = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => r.innerText && r.innerText.includes('相原'));
    if (!tr) return false;
    const td = tr.querySelector('td');
    if (!td) return false;
    td.click(); return true;
  });
  t('この画面から保存を1回走らせた（検査の前提）', saved, { saved });
  await page.waitForTimeout(3500);
  const after = await page.evaluate(([k, dk, dk2]) => {
    const v = window.__fakeFb.get(k + 'honten-sched') || {};
    return {
      day1: Object.values(v[dk] || {}).map(r => r && r.name),
      day2: Object.values(v[dk2] || {}).map(r => r && r.name),
    };
  }, [STOR, DK, DK2]);
  t('別の端末が入れた同じ日の予定（井本）が消えていない', after.day1.includes('井本'), after);
  t('別の日の予定（上野）も消えていない', after.day2.includes('上野'), after);
  t('自分の保存（入庫済みチェック）が反映されている', await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-sched') || {}; return Object.values(v[dk] || {}).some(r => r && r.name === '相原' && r.arrived === true); }, [STOR, DK]), after);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-diff-write.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
