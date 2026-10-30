// 代車管理の予約編集で、日付を押して出るカレンダーが【画面からはみ出さず・切られず】に全部見えること。
//   2026-10-30 ユーザー報告：日付をクリックするとカレンダーが開くが、画面が小さく、
//                            スクロールしないと全体が見えない。
//   原因：ポップが position:absolute だったため、代車の編集モーダル
//         （width:min(420px,92vw) / maxHeight:88vh / overflowY:auto）に切られていた。
//   直し：ポップを position:fixed にして【画面に対して】置く（入れ物の形に頼らない）。
//         あわせて、大きさもモックの「大」（幅360・マス14px）にそろえた。
//   実行: node datepick_pop_test.js
//        SHOT=<保存先.png> node datepick_pop_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8401, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => {
  const scope = r ? document.querySelector(r) : document; if (!scope) return false;
  const b = [...scope.querySelectorAll('button')].find(e => e.innerText.includes(x));
  if (b) { b.click(); return true; } return false;
}, [s, root || null]);

const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const ID = Date.now() - 3 * 86400000;
const rec0 = { id: ID, carId: 1, user: '山田　太郎', fy: Y, fm: M, fd: D, ty: Y, tm: M, td: D, color: '#c2410c' };

(async () => {
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8')
    .replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')
    .replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const lres = { 1: { [ID]: rec0 } };
  // ★わざと小さめの画面にする。モーダルが縮んで、昔はここでポップが切られていた。
  const VW = 1280, VH = 760;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  await ctx.route('https://script.google.com/**', async route => {
    const req = route.request();
    const ok = b => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: b });
    if (req.method() === 'POST') return ok('ok');
    const k = new URL(req.url()).searchParams.get('key') || '';
    if (k === STOR + 'honten-lres') return ok(JSON.stringify(lres));
    return ok('null');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
  page.on('dialog', async d => { errs.push('dialog: ' + d.message()); await d.dismiss().catch(() => {}); });

  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '担当者を選択してください');
  await clickText(page, '江川京志');
  await clickText(page, 'でログイン');
  await clickText(page, 'このまま使う');   // 全画面のお誘いを閉じる（これが残っていると画面を覆う）
  await page.waitForTimeout(400);
  await seeText(page, '代車管理', 15000);
  await clickText(page, '代車管理');
  t('代車管理に山田様の予約が出る', await seeText(page, '山田　太郎', 15000));

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('td')].find(e => e.innerText.includes('山田　太郎'));
    if (el) el.click();
  });
  t('固定パネルが開く', await seeText(page, '✎ 編集', 4000));
  await clickText(page, '✎ 編集');
  t('編集モーダルが開く', await seeText(page, '代車予約の編集', 4000));

  console.log('\n■ ① 日付を押すとカレンダーが開く');
  const opened = await page.evaluate(() => {
    const b = document.querySelector('.modal-box [data-datepick]');
    if (!b) return false; b.click(); return true;
  });
  t('日付のボタンがある', opened);
  await page.waitForTimeout(400);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const pop = await page.evaluate(() => {
    const p = document.querySelector('[data-datepop]');
    if (!p) return null;
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const day = p.querySelector('[data-day]'), dr = day ? day.getBoundingClientRect() : null;
    // 入れ物（モーダル）に切られていないか：祖先に overflow が効いている箱があっても、
    // fixed なら切られない。実際に見えている高さで確かめる。
    return { pos: cs.position, w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom), right: Math.round(r.right),
      dayH: dr ? Math.round(dr.height) : 0, dayFs: day ? getComputedStyle(day).fontSize : '',
      lastDay: !!p.querySelector('[data-day$="-30"],[data-day$="-31"],[data-day$="-28"],[data-day$="-29"]') };
  });
  t('カレンダーが開いた', !!pop, pop);

  console.log('\n■ ② ★スクロールせずに全体が見える（画面からはみ出さない）');
  t('★画面に対して置いてある（position:fixed）', !!pop && pop.pos === 'fixed', pop && pop.pos);
  t('★上がはみ出していない', !!pop && pop.top >= 0, pop && pop.top);
  t('★下がはみ出していない', !!pop && pop.bottom <= VH, pop && { bottom: pop.bottom, VH });
  t('★左がはみ出していない', !!pop && pop.left >= 0, pop && pop.left);
  t('★右がはみ出していない', !!pop && pop.right <= VW, pop && { right: pop.right, VW });
  t('★月末の日まで出ている（途中で切れていない）', !!pop && pop.lastDay, pop && pop.lastDay);
  // 本当に目に映っているか（祖先の overflow に切られていないか）を要素の見え方で確かめる
  const vis = await page.evaluate(() => {
    const p = document.querySelector('[data-datepop]');
    const days = [...p.querySelectorAll('[data-day]')];
    const last = days[days.length - 1];
    const r = last.getBoundingClientRect();
    // その座標にある要素が、ポップの中のものかどうか
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inside: !!hit && p.contains(hit), label: last.innerText.trim() };
  });
  t('★いちばん下の日が実際に押せる（何にも隠れていない）', vis.inside, vis);

  console.log('\n■ ③ ★大きさ（モックの「大」＝幅360・マス14px）');
  t('★幅は 360px', !!pop && pop.w === 360, pop && pop.w);
  t('★日のマスが大きい（高さ40px以上）', !!pop && pop.dayH >= 40, pop && pop.dayH);
  t('★日の字が 16px', !!pop && pop.dayFs === '16px', pop && pop.dayFs);

  console.log('\n■ ④ 押せば今までどおり日付が入る');
  const before = await page.evaluate(() => document.querySelector('.modal-box [data-datepick]').innerText.trim());
  await page.evaluate(() => {
    const days = [...document.querySelectorAll('[data-datepop] [data-day]')];
    const d = days.find(x => x.innerText.trim() === '15') || days[0];
    d.click();
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.querySelector('.modal-box [data-datepick]').innerText.trim());
  t('日付が変わった', before !== after, { before, after });
  t('押すとカレンダーは閉じる', await page.evaluate(() => !document.querySelector('[data-datepop]')));

  t('JSエラー・警告ダイアログなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n❌ FAIL  成功 ${pass} / 失敗 ${fail}` : `\n✅ PASS  成功 ${pass} / 失敗 0`);
  process.exit(fail ? 1 : 0);
})();
