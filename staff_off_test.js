// スタッフの休日・有給まわりの検査（2026-10-19 三田店からの報告）
//   ⑨ 有給の人がスケジュールで「出勤」に並ばない（休み側に 📋 付きで出る）
//   ⑩ 休日カレンダーは「今見ている店」で開く／休日スタッフの画面からも開ける
//   実行: node staff_off_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8358, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten', badge: 'mechanic' },
    { uid: 'h4', name: '魚住圭', myNumber: 4, store: 'honten', badge: 'mechanic' }],
  [STOR + 'sanda-staff-v2']: [
    { uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' },
    { uid: 's3', name: '芦田昌則', myNumber: 12, store: 'sanda', badge: 'mechanic' },
    { uid: 's4', name: '中井啓介', myNumber: 11, store: 'sanda', badge: 'mechanic' }],
  // 今日：本店は竹林が休日・魚住が有給／三田は中井が休日・芦田が有給
  [STOR + 'honten-dayoff']: { [DK]: ['竹林直行'] },
  [STOR + 'honten-pleave']: { [DK]: ['魚住圭'] },
  [STOR + 'sanda-dayoff']: { [DK]: ['中井啓介'] },
  [STOR + 'sanda-pleave']: { [DK]: ['芦田昌則'] },
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
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
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1600);

  // ── ⑨ 有給の人はスケジュールで「出勤」に並ばない ──
  console.log('\n■ ⑨ 有給の人はスケジュールで「出勤」に並ばない（2026-10-19 三田店からの報告）');
  // ★スタッフバーは「出勤の枠」と「休みの枠」の2つに分かれている（🏖 は休みの枠の末尾）。
  //   文字列を 🏖 で切っても分けられないので、**枠（子の div）ごとに読む**こと。
  const bar = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d =>
      d.children.length === 2 && d.children[0].innerText && /本日/.test(d.children[0].innerText)
      && d.children[1].innerText && /🏖/.test(d.children[1].innerText));
    if (!el) return null;
    const txt = e => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
    return { all: txt(el), working: txt(el.children[0]), off: txt(el.children[1]) };
  });
  const b1 = await bar();
  t('スタッフバーが出ている', !!b1, b1);
  t('★有給の人が出勤の側に出ていない（本店・魚住圭）', !!b1 && !/魚住圭/.test(b1.working), b1);
  t('★有給の人は休みの側に「有」バッジ付きで出る', !!b1 && /有 ?魚住圭/.test(b1.all), b1);
  t('休日の人は今までどおり休みの側（竹林直行）', !!b1 && /竹林直行/.test(b1.all) && !/竹林直行/.test(b1.working), b1);
  t('休んでいない人は出勤の側（江川京志）', !!b1 && /江川京志/.test(b1.working), b1);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim().startsWith('三田店') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1700);
  const b2 = await bar();
  t('★三田店でも有給の人は出勤に出ない（芦田昌則）', !!b2 && !/芦田昌則/.test(b2.working), b2);
  t('★三田店でも有給は「有」バッジ付きで休みの側', !!b2 && /有 ?芦田昌則/.test(b2.all), b2);

  // ── ⑩ 休日カレンダーは「今見ている店」で開く ──
  console.log('\n■ ⑩ 休日カレンダーは「今見ている店」で開く（2026-10-19 ユーザー要望）');
  const openQuick = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => (d.title || '').includes('クリックして休日スタッフを編集'));
    if (el) { el.click(); return true; } return false;
  });
  await page.waitForTimeout(900);
  t('🏖 の欄から休日スタッフの画面が開く', openQuick && await see('休日スタッフ', 5000));
  t('★どこまで直せるかの説明が出る（この店・この日の休日だけ）', await page.evaluate(() => /ここで直せるのは/.test(document.body.innerText)));
  const goCal = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /スタッフ休日・有給カレンダーを開く/.test(e.innerText));
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(1700);
  t('★そこからフルのカレンダーを開ける（設定の奥に入らなくてよい）', goCal && await see('スタッフ休日・有給カレンダー', 5000));
  const hdBg = await page.evaluate(() => { const hd = [...document.querySelectorAll('div')].find(d => /スタッフ休日・有給カレンダー/.test(d.innerText) && d.innerText.length < 200); return hd ? getComputedStyle(hd).backgroundImage : ''; });
  t('★三田店を見ている時は三田店で開く（見出しが赤）', /220, 38, 38/.test(hdBg), hdBg.slice(0, 70));
  const selBg = await page.evaluate(() => {
    const hd = [...document.querySelectorAll('div')].find(d => /スタッフ休日・有給カレンダー/.test(d.innerText) && d.innerText.length < 200);
    const b = hd && [...hd.querySelectorAll('button')].find(x => x.innerText.trim() === '三田店');
    return b ? getComputedStyle(b).backgroundColor : '';
  });
  t('★三田店のボタンが選ばれている', !!selBg && selBg !== 'rgba(0, 0, 0, 0)', selBg);
  const inside = await page.evaluate(() => {
    const hd = [...document.querySelectorAll('div')].find(d => /スタッフ休日・有給カレンダー/.test(d.innerText) && d.innerText.length < 200);
    const box = hd && hd.parentElement;
    return box ? box.innerText.replace(/\s+/g, ' ') : '';
  });
  t('★中身も三田店の人（藤原・芦田・中井）', /藤原/.test(inside) && /芦田/.test(inside) && /中井/.test(inside), inside.slice(0, 120));
  t('★本店の人は出ていない（竹林・魚住）', !/竹林/.test(inside) && !/魚住/.test(inside), inside.slice(0, 120));

  t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-staff-off.png') });

  // ── ⑪ スマホにもスタッフの行（2026-10-19 ユーザー指示「A案でスマホにも」）──
  //   それまでスマホのスケジュールには**スタッフの表示が無く**、出勤人数も有給を数えていなかった。
  console.log('\n■ ⑪ スマホのスケジュールにもスタッフの行（有給は「有」バッジ）');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mctx.addInitScript(([me, stor, sd]) => {
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
  await mctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await mctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  const mclick = (x) => mp.evaluate(s2 => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s2) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const msee = async (s2, ms = 25000) => { try { await mp.waitForFunction(x => document.body.innerText.includes(x), s2, { timeout: ms }); return true; } catch (e) { return false; } };
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await msee(ME.name); await mclick(ME.name); await mclick('でログイン');
  await mp.waitForTimeout(3000);
  // ★スマホの下タブは button ではなく div（onClick）。button だけ探すと押せない。
  await mp.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => /スケジュール/.test(d.innerText) && d.innerText.replace(/\s/g, '').length < 12 && d.offsetParent !== null);
    if (el) el.click();
  });
  await mp.waitForTimeout(2200);
  const mrow = () => mp.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d =>
      d.children.length === 2 && d.children[0].innerText && /出勤/.test(d.children[0].innerText)
      && d.children[1].innerText && /休み/.test(d.children[1].innerText));
    if (!el) return null;
    const txt = e => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
    return { working: txt(el.children[0]), off: txt(el.children[1]) };
  });
  if (process.env.DBG) console.log('   [debug] スマホ画面: ' + (await mp.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))));
  const m1 = await mrow();
  t('★スマホのスケジュールにスタッフの行が出る', !!m1, m1);
  t('★有給の人が出勤の側に出ていない（魚住圭）', !!m1 && !/魚住圭/.test(m1.working), m1);
  t('★有給の人は休みの側に「有」バッジ付き', !!m1 && /有 ?魚住圭/.test(m1.off), m1);
  t('★休日の人も休みの側（竹林直行）', !!m1 && /竹林直行/.test(m1.off), m1);
  t('休んでいない人は出勤の側（江川京志）', !!m1 && /江川京志/.test(m1.working), m1);
  t('⑪ スマホ：JSエラー・alert なし', merrs.length === 0, merrs.slice(0, 3));
  await mp.screenshot({ path: path.join(DIR, 'smoke-staff-off-mobile.png') });
  await mctx.close();

  await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
