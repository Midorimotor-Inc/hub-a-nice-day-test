// 店舗カラー（A案）の見え方を撮る。読み取りのみ・Firestore には触らない。
//   node shot_store.js          … テスト版そのまま（両店ともオレンジが仕様）
//   node shot_store.js --main   … port_to_main.js と同じ変換を当てた「本番の見え方」
// 出来上がり: scratchpad/a_{dev|main}_{honten|sanda}.png
const path = require('path'), fs = require('fs'), http = require('http');
const chromium = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'playwright')).chromium;
const DIR = 'C:/Users/A/HUB-A-NICE-DAY-DEV', PORT = 8352, STOR = 'hub-v8-dev-';
const OUT = __dirname;
const MAIN = process.argv.includes('--main');
const TAG = MAIN ? 'main' : 'dev';

// port_to_main.js の「配色」ルールと同じもの（ヘッダーまわりだけ）
const MAIN_RULES = [
  ["const UI_HEAD='#EA580C';", "const UI_HEAD='linear-gradient(135deg,#1e3a8a,#1d4ed8)';"],
  ["const UI_HEAD_S=UI_HEAD;", "const UI_HEAD_S='linear-gradient(135deg,#7f1d1d,#dc2626)';"],
  ["gap:7,fontSize:16,fontWeight:800,color:'#9a3412'", "gap:7,fontSize:16,fontWeight:800,color:'white'"],
];

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const now = new Date();
const d = (p) => { const x = new Date(now); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const seed = {
  [STOR + 'insp']: { [dk(d(0))]: [
    { name: '前村　和子', carType: 'ワゴンR', no: '3310', time: '09:00', course: 1, store: 'honten', seq: 1, id: 1, staff: '竹林' },
    { name: '三田　太郎', carType: 'アルト', no: '0088', time: '10:30', course: 3, store: 'sanda', seq: 2, id: 2, staff: '藤原' }] },
  [STOR + 'honten-sched']: { [dk(d(0))]: { '09:00': { name: '桑田　陽子', carType: 'N-BOX', work: '6ヶ月点検', staff: '芦田' } } },
  [STOR + 'sanda-sched']: { [dk(d(0))]: { '11:00': { name: '西浦　三田', carType: 'タント', work: '車検整備', staff: '小西' } } },
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, store: 'sanda' }],
  [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }], [STOR + 'sanda-cars']: [{ id: 5, name: 'ワゴンR', num: '3503' }],
  [STOR + 'rentalcars']: [], [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      let s = fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;');
      if (MAIN) for (const [a, b] of MAIN_RULES) {
        if (s.indexOf(a) < 0) { console.error('✖ 変換パターンが見つからない: ' + a); process.exit(1); }
        s = s.split(a).join(b);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(s); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
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
  await ctx.route('https://script.google.com/**', r =>
    r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const click = (x) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(t) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (t, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), t, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2500);
  console.log('版: ' + await page.evaluate(() => (document.body.innerText.match(/v[0-9.]+/) || [''])[0]));

  for (const [label, btn] of [['honten', null], ['sanda', '三田店']]) {
    if (btn) { await click(btn); await page.waitForTimeout(1800); }
    const file = path.join(OUT, 'a_' + TAG + '_' + label + '.png');
    const h = await page.$('header');
    await h.screenshot({ path: file });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('header')).backgroundImage + ' | ' + getComputedStyle(document.querySelector('header')).backgroundColor);
    console.log(label + ' → ' + file);
    console.log('   帯の色: ' + bg);
  }
  if (errs.length) console.log('⚠ 画面のエラー: ' + errs.slice(0, 2).join(' / '));
  await browser.close(); server.close(); process.exit(0);
})();
