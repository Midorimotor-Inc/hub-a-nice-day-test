// 予約カードの「下に移動した時にスクロールするか」を実測する。読み取りのみ。
//   ① ↓キー（goNext）で送った時  ② Tab で送った時  ③ 畳んだ状態の「＋ 予定を追加」で最初にどこに入るか
const path = require('path'), fs = require('fs'), http = require('http');
const chromium = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'playwright')).chromium;
const DIR = 'C:/Users/A/HUB-A-NICE-DAY-DEV', PORT = 8354, STOR = 'hub-v8-dev-';
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const now = new Date();
const dk = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
const seed = {
  [STOR + 'insp']: { [dk]: [{ name: '前村　和子', carType: 'ワゴンR', no: '3310', time: '09:00', course: 1, store: 'honten', seq: 1, id: 1, staff: '竹林' }] },
  [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {}, [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [], [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }],
  [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [], [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
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
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const click = (x) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(t) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (t, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), t, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  // ③ タイムスケジュールを畳んで「＋ 予定を追加」
  console.log('■ ③ 畳んだ状態の「＋ 予定を追加」');
  console.log('  畳むボタン: ' + await click('▲ 畳む'));
  await page.waitForTimeout(900);
  console.log('  ＋ 予定を追加: ' + await click('＋ 予定を追加'));
  await page.waitForTimeout(1200);
  const first = await page.evaluate(() => {
    const a = document.activeElement;
    const box = document.querySelector('.booking-modal-inner');
    if (!box) return { err: 'カードが開いていない' };
    const lblOf = (el) => { let p = el; for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const l = p.querySelector && p.querySelector(':scope > label'); if (l) return l.innerText.replace(/\s+/g, ' ').trim().slice(0, 14); } return ''; };
    return { tag: a ? a.tagName : '(なし)', label: a ? lblOf(a) : '', ph: a ? (a.placeholder || '') : '' };
  });
  console.log('  最初にカーソルが入る欄: ' + JSON.stringify(first));

  // 欄の並びと位置を出す道具
  const snap = async (how) => page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    const a = document.activeElement;
    if (!box || !a) return null;
    const br = box.getBoundingClientRect(), ar = a.getBoundingClientRect();
    const lblOf = (el) => { let p = el; for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const l = p.querySelector && p.querySelector(':scope > label'); if (l) return l.innerText.replace(/\s+/g, ' ').trim().slice(0, 10); } return (el.dataset && el.dataset.kbkey) || el.tagName; };
    return { field: lblOf(a), scrollTop: Math.round(box.scrollTop), posPct: Math.round(((ar.top + ar.height / 2 - br.top) / br.height) * 100) };
  });

  console.log('');
  console.log('■ ① ↓キーで下へ送った時（goNext → centerField が効くはず）');
  for (let i = 0; i < 7; i++) {
    const s = await snap();
    if (s) console.log('   ' + String(i).padStart(2) + ' ' + String(s.field).padEnd(12) + ' カードの上から ' + String(s.posPct).padStart(3) + '%  scrollTop=' + s.scrollTop);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
  }

  // いったん閉じて開き直し、Tab で送る
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  console.log('');
  console.log('■ ② Tab で下へ送った時');
  console.log('  ＋ 予定を追加: ' + await click('＋ 予定を追加'));
  await page.waitForTimeout(1200);
  for (let i = 0; i < 9; i++) {
    const s = await snap();
    if (s) console.log('   ' + String(i).padStart(2) + ' ' + String(s.field).padEnd(12) + ' カードの上から ' + String(s.posPct).padStart(3) + '%  scrollTop=' + s.scrollTop);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(350);
  }
  if (errs.length) console.log('⚠ エラー: ' + errs.slice(0, 2).join(' / '));
  await browser.close(); server.close(); process.exit(0);
})();
