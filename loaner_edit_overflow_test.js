// 代車管理の「予約の編集」が、その車の古い予約でいっぱいになって編集できなくなる問題の検査。
//   2026-09-28 ユーザー報告：11/15 の予約（代車1日）を代車管理から編集しようとすると、
//   編集画面ではなく履歴のような一覧がずらりと出て、入力欄・更新ボタンに届かなかった。
//   原因：編集画面の「その車の既存予約」が、過去ぶんも全部・高さの上限なしで並んでいた。
//   直し：編集中の期間の前後60日と今日以降のものだけにし、一覧もモーダルもスクロールさせる。
//   実行: node loaner_edit_overflow_test.js      修正前を見る: SRC=<古いファイル> node loaner_edit_overflow_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8205, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document; if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);
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
// 今月の15日に「宮武」の1日だけの代車。同じ車に過去2年ぶんの予約が60件ある
const now = new Date();
const Y = now.getFullYear(), M = now.getMonth();
const DK = `${Y}-${M + 1}-15`;
(async () => {
  const days = {};
  for (let i = 1; i <= 60; i++) {                       // 過去の予約（30日おきにさかのぼる）
    const d = new Date(Y, M, 15 - i * 12);
    const id = Date.now() - i * 86400000;
    days[id] = { id, carId: 1, user: '過去の方' + i, fy: d.getFullYear(), fm: d.getMonth(), fd: d.getDate(), ty: d.getFullYear(), tm: d.getMonth(), td: d.getDate(), color: '#c2410c', carName: 'ワゴンR' };
  }
  const NOW_ID = Date.now();
  days[NOW_ID] = { id: NOW_ID, carId: 1, user: '宮武', fy: Y, fm: M, fd: 15, ty: Y, tm: M, td: 15, color: '#c2410c', carName: 'ワゴンR', bookingKey: `insp-${DK}-0` };
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '宮武', carType: 'セレナ', course: 3, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', loanerId: 1, loaner: 'ワゴンR', bookingKey: `insp-${DK}-0` }] },
    [STOR + 'honten-lres']: { 1: days },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, process.env.SRC && p === 'index_dev.html' ? process.env.SRC : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
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
  page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, '代車管理', 20000);
  await clickText(page, '代車管理');
  t('代車管理に宮武様の予約が出る', await seeText(page, '宮武', 15000));
  await page.evaluate(() => { const el = [...document.querySelectorAll('td')].find(e => e.innerText.includes('宮武')); if (el) el.click(); });
  t('予約をクリックすると操作パネルが出る', await seeText(page, '✎ 編集', 5000));
  await clickText(page, '✎ 編集');
  t('編集画面が開く', await seeText(page, '代車予約の編集', 5000));
  // ここが本題：入力欄と更新ボタンが画面の中にあるか
  const box = await page.evaluate(() => {
    const m = document.querySelector('.modal-box'); if (!m) return null;
    const upd = [...m.querySelectorAll('button')].find(b => b.innerText.includes('更新'));
    const inp = m.querySelector('input:not([type=date])');
    const r = m.getBoundingClientRect(), ru = upd ? upd.getBoundingClientRect() : null, ri = inp ? inp.getBoundingClientRect() : null;
    return {
      modalH: Math.round(r.height), winH: window.innerHeight,
      updBottom: ru ? Math.round(ru.bottom) : null, updTop: ru ? Math.round(ru.top) : null,
      inpTop: ri ? Math.round(ri.top) : null,
      rows: (m.innerText.match(/🚫/g) || []).length,
      hidden: /ほかに古い予約が/.test(m.innerText),
    };
  });
  t('編集画面が画面の高さに収まっている', !!box && box.modalH <= box.winH, box);
  t('利用者名の入力欄が画面の中にある', !!box && box.inpTop >= 0 && box.inpTop < box.winH, box);
  t('「更新」ボタンが画面の中にある（押せる）', !!box && box.updTop >= 0 && box.updBottom <= box.winH, box);
  t('古い予約は並べず、近い予約だけ出す', !!box && box.rows <= 12, box);
  t('隠した分は件数で知らせる', !!box && box.hidden, box);
  // 実際に編集して保存できる
  await page.fill('.modal-box input:not([type=date])', '宮武　健一');
  await clickText(page, '✓ 更新', '.modal-box');
  t('期間や名前を直して保存できる', await page.waitForFunction(([k, id]) => { const l = (window.__fakeFb.get(k + 'honten-lres') || {})['1'] || {}; return Object.values(l).some(r => r && r.id === id && r.user === '宮武　健一'); }, [STOR, NOW_ID], { timeout: 10000 }).then(() => true).catch(() => false));
  t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-loaner-edit.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
