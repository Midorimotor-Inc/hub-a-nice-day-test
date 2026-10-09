// テスト版の実データで「オフライン予定表の控え」を実際に作って、見られる場所に置く。2026-10-09
//   ・Firestore は **読み取りだけ**（にせの firebase に流し込むので本物には一切書かない）
//   ・でき上がりは顧客名・電話が入るので、**リポジトリの外**（Hub重要書類）に置く
//   実行: node make_offline_sample.js            … テスト版（hub-v8-dev-）
//         node make_offline_sample.js --prod     … 本番（hub-v8-）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8337;
const PROD = process.argv.includes('--prod');
const STOR = PROD ? 'hub-v8-' : 'hub-v8-dev-';
const OUT = 'C:/Users/A/Documents/Hub重要書類';
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', name: '江川京志', uid: 'h7' };

(async () => {
  // ── ① 実データを読む（読み取り専用）──
  const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const q = await db.collection('kv').get();
  const store = {};
  let n = 0;
  q.forEach(d => {
    if (d.id.indexOf(STOR) !== 0) return;
    if (!PROD && d.id.indexOf('hub-v8-dev-') !== 0) return;
    if (PROD && d.id.indexOf('hub-v8-dev-') === 0) return;
    store['kv/' + d.id] = { v: d.data().v, u: Date.now() }; n++;
  });
  console.log((PROD ? '本番' : 'テスト版') + ' の実データを読みました：kv ' + n + ' 件（読み取りのみ）');
  store['meta/allowed'] = { 'egawa@midori-m,com': { email: ME.email, name: ME.name, store: 'honten', uid: ME.uid, role: 'admin', active: true, kind: 'staff' } };
  store['devices/dev-sample'] = { env: STOR, e: ME.email, n: ME.name, names: [ME.name], s: 'honten', k: 'own', l: '見本', ua: 'sample', at: 1, last: Date.now() };

  // ── ② にせの firebase に流し込んで画面を開き、「💾 控え」を押す ──
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    fs.readFile(f, (e, dd) => {
      if (e) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(dd);
    });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(([me, stor]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: 'uid_sample' }));
    localStorage.setItem(stor + 'auth-devid', 'dev-sample');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: 'honten', email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR]);
  let blocked = 0;
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ try{ localStorage.setItem("__fakeFbStore", ' + JSON.stringify(JSON.stringify(store)) + '); }catch(e){} })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? extra + FAKE_FB : '' });
  });
  await ctx.route('https://script.google.com/**', route => { blocked++; return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  const click = (s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2500);
  await click('💾 控え'); await page.waitForTimeout(600);
  const made = [];
  for (const [btn, label] of [['🏠 本店の分', '本店'], ['🏪 三田店の分', '三田店']]) {
    try {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), click(btn)]);
      const name = (PROD ? '本番_' : 'テスト版_') + dl.suggestedFilename();
      const dest = path.join(OUT, name);
      await dl.saveAs(dest);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      made.push({ label, dest, kb });
      await page.waitForTimeout(800);
    } catch (e) { console.error('  ✖ ' + label + ' を作れませんでした：' + ((e && e.message) || e)); }
  }
  await browser.close(); server.close();
  console.log('');
  made.forEach(m => console.log('  ✔ ' + m.label + '　' + m.dest + '　(' + m.kb + ' KB)'));
  if (errs.length) console.log('  ⚠ 画面のエラー: ' + errs.slice(0, 2).join(' / '));
  console.log('');
  console.log('※ Firestore には書いていません（にせの firebase 経由の読み取りのみ）。');
  console.log('※ 顧客名・電話が入るのでリポジトリの外（Hub重要書類）に置いています。');
  process.exit(made.length ? 0 : 1);
})();
