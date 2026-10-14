// 本番の実データで「本物の画面」を動かし、代車管理のズレの件数と中身をそのまま読む。2026-10-14
//   診断スクリプト（fb_sync_diag.js）は画面の写しなので、ずれていないか突き合わせるために使う。
//   Firestore には**何も書かない**（にせの firebase に流し込むだけ）。
//   実行: node fb_sync_screen.js            … 本番の実データ × 本番の画面
//         node fb_sync_screen.js --dev      … テスト版
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DEV = process.argv.includes('--dev');
const STOR = DEV ? 'hub-v8-dev-' : 'hub-v8-';
const DIR = DEV ? __dirname : path.join(__dirname, '..', 'hub-a-nice-day');
const PAGE = DEV ? 'index_dev.html' : 'index_main.html';
const PORT = 8343;
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', name: '江川京志', uid: 'h7' };

(async () => {
  const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json', 'utf8'))) });
  const db = admin.firestore();
  const q = await db.collection('kv').get();
  const store = {}; let n = 0;
  q.forEach(d => {
    if (d.id.indexOf(STOR) !== 0) return;
    if (!DEV && d.id.indexOf('hub-v8-dev-') === 0) return;
    store['kv/' + d.id] = { v: d.data().v, u: Date.now() }; n++;
  });
  console.log((DEV ? 'テスト版' : '本番') + ' の実データを読みました：kv ' + n + ' 件（読み取りのみ）');
  store['meta/allowed'] = { 'egawa@midori-m,com': { email: ME.email, name: ME.name, store: 'honten', uid: ME.uid, role: 'admin', active: true, kind: 'staff' } };
  store['devices/dev-screen'] = { env: STOR, e: ME.email, n: ME.name, names: [ME.name], s: 'honten', k: 'own', l: '画面確認', ua: 'x', at: 1, last: Date.now() };

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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(([me, stor]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: 'uid_screen' }));
    localStorage.setItem(stor + 'auth-devid', 'dev-screen');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: 'honten', email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ try{ localStorage.setItem("__fakeFbStore", ' + JSON.stringify(JSON.stringify(store)) + '); }catch(e){} })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? extra + FAKE_FB : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const click = (s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
  const see = async (s, ms = 30000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(3000);
  console.log('画面の版: ' + await page.evaluate(() => (document.body.innerText.match(/v[0-9.]+/) || [''])[0]));

  for (const [label, btn] of [['本店', null], ['三田店', '三田店']]) {
    if (btn) { await click(btn); await page.waitForTimeout(2500); }
    await click('代車管理'); await page.waitForTimeout(3000);
    const badge = await page.evaluate(() => (document.body.innerText.match(/スケジュール(と一致|とズレ[^\n]*)/) || ['（見つからない）'])[0]);
    console.log('');
    console.log('━━ ' + label + '：' + badge);
    if (/ズレ/.test(badge)) {
      await click('スケジュールとズレ'); await page.waitForTimeout(1200);
      const items = await page.evaluate(() => {
        const box = [...document.querySelectorAll('div')].find(e => /スケジュールとのズレ/.test(e.innerText || '') && e.querySelectorAll('div').length > 3);
        if (!box) return [];
        return [...box.querySelectorAll('div')].map(d => d.innerText).filter(x => x && /が代車管理と違います|予約が見つかりません|代車管理に貸出がありません/.test(x))
          .map(x => x.replace(/\s+/g, ' ').trim()).filter((v, i, a) => a.indexOf(v) === i).slice(0, 30);
      });
      items.forEach((x, i) => console.log('   ' + (i + 1) + '. ' + x.slice(0, 160)));
      const past = await page.evaluate(() => (document.body.innerText.match(/過去の分 [0-9]+件/) || [''])[0]);
      if (past) console.log('   （' + past + '）');
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '閉じる' && e.offsetParent !== null); if (b) b.click(); });
      await page.waitForTimeout(600);
    }
    await click('スケジュール'); await page.waitForTimeout(1500);
  }
  if (errs.length) console.log(NL + '⚠ 画面のエラー: ' + errs.slice(0, 2).join(' / '));
  await browser.close(); server.close();
  console.log('');
  console.log('※ Firestore には何も書いていません。');
  process.exit(0);
})();
