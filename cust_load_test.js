// 顧客リスト：①「読み込み中」の案内が全ファイルが並ぶまで消えないこと
//             ②特典欄に日付が紛れていても表示しないこと（2026-09-11）
// GASは模擬。ファイル本体（chunk）の返事だけ 2.5 秒遅らせて、案内の出方を見る。
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname;
const PORT = 8313;
const STOR = 'hub-v8-dev-';
const CHUNK_DELAY = 2500;

let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };

const cust = (i, name, extra) => ({ custId: 'F__' + i + '__' + name, rowIdx: i, expiry: '2026-11-20', name, no: 1000 + i, carType: '車',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '2026-09-01', dm1Book: '', dm2Date: '2026-09-08', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'sanda', staff: '', note: '', status: 'none', bookingTime: '', linkedInspDate: '', ...(extra || {}) });

const data = {
  [STOR + 'cf-index']: [{ name: '202610', count: 2 }, { name: '202611', count: 3 }],
  [STOR + 'cf-202610-index']: { name: '202610', chunks: 1, total: 2 },
  [STOR + 'cf-202610-chunk-0']: [cust(1, '甲　一郎'), cust(2, '乙　二郎', { tokuten: '①' })],
  [STOR + 'cf-202611-index']: { name: '202611', chunks: 1, total: 3 },
  [STOR + 'cf-202611-chunk-0']: [cust(1, '丙　三郎'),
    cust(2, '外賀　卓郎', { tokuten: 'Sun Nov 08 2026 00:00:00 GMT+0900 (日本標準時)', status: 'confirm', dm2Book: '2026-08-08' }),
    cust(3, '丁　四郎', { tokuten: '②' })],
};

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, d) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(d);
    });
  });
  await new Promise(r => server.listen(PORT, r));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // この検査は GAS を模擬するので Firebase SDK は読ませない（保存先が GAS 版として動く・2026-09-18）
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() !== 'GET') return ok('{"ok":true}');
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k.includes('-chunk-') || k.endsWith('-index') && k !== STOR + 'cf-index') await new Promise(r => setTimeout(r, CHUNK_DELAY / 2));
    return ok(k in data ? JSON.stringify(data[k]) : 'null');
  });

  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('deoptimised')) errs.push('CONSOLE: ' + m.text()); });

  await page.goto(`http://localhost:${PORT}/customers.html`, { waitUntil: 'domcontentloaded' });
  // 描画のたびに見張る：ファイルが2つ並ぶ前に「読み込み中」が消えたり「インポートしてください」が出たりしたら記録
  const watch = await page.evaluate(() => new Promise(res => {
    const r = { importPromptSeen: false, loadingGapSeen: false, tabsAt: 0, done: false, samples: [] };
    const t0 = Date.now();
    const tick = () => {
      const txt = document.body.innerText;
      const tabs = (txt.match(/20261[01]/g) || []).length;
      const loading = txt.includes('読み込んでいます') || txt.includes('読み込み中');
      if (txt.includes('Excelファイルをインポートしてください')) r.importPromptSeen = true;
      if (tabs < 2 && !loading && Date.now() - t0 > 300) r.loadingGapSeen = true;
      if (tabs >= 2 && !r.tabsAt) r.tabsAt = Date.now() - t0;
      if (r.tabsAt && !loading) { r.done = true; return res(r); }
      if (Date.now() - t0 > 20000) return res(r);
      requestAnimationFrame(tick);
    }; tick();
  }));
  t('ファイルが並ぶ前に「読み込み中」の案内が途切れない', !watch.loadingGapSeen, watch);
  t('ファイルが並ぶ前に「インポートしてください」が出ない', !watch.importPromptSeen, watch);
  t('2ファイルとも並んだ', watch.tabsAt > 0, watch);
  t('並び終えたら案内が消える', watch.done, watch);

  // 特典欄
  await page.click('text=202611');
  await page.waitForTimeout(500);
  const body = await page.evaluate(() => document.body.innerText);
  t('外賀さんの行に日付の文字列が出ない', !body.includes('GMT+0900') && !body.includes('Nov 08 2026'));
  t('正しい特典②は出る', /丁　四郎[\s\S]*?②/.test(body));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));

  // キャッシュあり（2回目以降）：即表示、帯は出ない。「読み込み中（あとN）」の小さな印だけ
  await page.reload({ waitUntil: 'domcontentloaded' });
  const w2 = await page.evaluate(() => new Promise(res => {
    const r = { bandSeen: false, tabsAt: 0 };
    const t0 = Date.now();
    const tick = () => {
      const txt = document.body.innerText;
      const tabs = (txt.match(/20261[01]/g) || []).length;
      if (tabs >= 2 && !r.tabsAt) r.tabsAt = Date.now() - t0;
      if (txt.includes('すべて表示されるまでお待ちください')) r.bandSeen = true;
      if (Date.now() - t0 > 6000) return res(r);
      requestAnimationFrame(tick);
    }; tick();
  }));
  t('キャッシュありなら即座に並ぶ（1秒以内）', w2.tabsAt > 0 && w2.tabsAt < 1000, w2);
  t('全部並んでいる時は黄色い帯を出さない', !w2.bandSeen, w2);

  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
