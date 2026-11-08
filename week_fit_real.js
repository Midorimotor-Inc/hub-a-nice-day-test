// 週間カレンダーを【本番の実データ × 本番と同じ画面】で過去へさかのぼって確かめる（読み取りだけ）
//   2026-11-08 の現場報告「過去に戻していったらレンダリングエラー」の再現と見張りに使う。
//   ・毎朝の控え（Hub重要書類/hub-backup/hub-backup-prod-*.json）の【いちばん新しいもの】を読み、
//     にせの firebase に入れて index_dev.html を立ち上げる。**Firestore には一切つながない。**
//   ・週を1つずつさかのぼり、毎回「倍率」「上下に動くか」を出す。
//     React の「更新が止まらない（#185）」は console に出るので、それも拾って止める。
//   実行: node week_fit_real.js [さかのぼる週の数(既定20)]
//   ★お客様の氏名が画面に出るので、写真は撮らない・結果はコンソールだけ。
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const b of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(b, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8457, STOR = 'hub-v8-dev-';
const BKDIR = 'C:/Users/A/Documents/Hub重要書類/hub-backup';
const BACK = Number(process.argv[2] || 20);
const files = fs.readdirSync(BKDIR).filter(f => /^hub-backup-prod-.*\.json$/.test(f)).sort();
if (!files.length) { console.error('控えが見つかりません: ' + BKDIR); process.exit(1); }
const BK = path.join(BKDIR, files[files.length - 1]);
console.log('控え: ' + files[files.length - 1]);
const data = JSON.parse(fs.readFileSync(BK, 'utf8')).data;
const seed = {};
for (const k in data) {
  if (k.indexOf('hub-v8-') !== 0) continue;
  const v = data[k];
  seed[STOR + k.slice('hub-v8-'.length)] = (typeof v === 'string') ? (() => { try { return JSON.parse(v); } catch (e) { return v; } })() : v;
}
console.log('キー ' + Object.keys(seed).length + ' 件');
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
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
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { const x = m.text(); if (m.type() === 'error' && !/BABEL/.test(x)) errs.push(x.slice(0, 180)); });
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1800);
  let ng = 0;
  for (let i = 0; i <= BACK; i++) {
    if (i) { await page.evaluate(() => { const b = document.querySelector('[data-wnav="-1"]'); if (b) b.click(); }); await page.waitForTimeout(650); }
    const g = await page.evaluate(() => {
      const r = document.querySelector('[data-weekview]'); if (!r) return null;
      const sc = r.querySelector('[data-wscroll="1"]'), box = r.querySelector('[data-wfit]');
      let canY = 0; if (sc) { sc.scrollTop = 9999; canY = sc.scrollTop; sc.scrollTop = 0; }
      const head = (r.innerText || '').split(String.fromCharCode(10))[0] || '';
      return { fit: box ? box.getAttribute('data-wfit') : null, canY, head: head.slice(0, 34) };
    });
    if (!g) { console.log(String(i).padStart(2) + ' 週前  ★表が消えた（画面が落ちた）'); ng++; break; }
    const bad = (g.canY !== 0 && Number(g.fit) > 0.5);
    if (bad) ng++;
    console.log(String(i).padStart(2) + ' 週前  倍率 ' + String(g.fit).padEnd(6) + (g.canY ? ' ★上下に動く(' + g.canY + ')' : ' 収まっている') + '  ' + g.head);
    if (errs.length) { console.log('   ★エラー: ' + errs[0]); ng++; break; }
  }
  await browser.close(); server.close();
  console.log(ng ? ('\n✖ 問題あり ' + ng + ' 件') : '\n✅ ぜんぶ収まっている／エラーなし');
  process.exit(ng ? 1 : 0);
})();
