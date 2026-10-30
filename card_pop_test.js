// 予約カードのポップ（選ぶ一覧）の検査（2026-10-30 ユーザー指示・A案）
//   ★ねらい：ポップの中をスクロールさせず、項目を全部ならべて見せる。
//     これまでは maxHeight＋overflowY:'auto' で、13項目や21項目が数行しか見えなかった。
//   ① 整備の「時間帯」… 21項目ぜんぶ出る／縦も横もスクロールしない
//   ② 整備の「作業内容」… 13項目ぜんぶ出る／字が切れない／選べる
//   ③ 整備の「指・見」… 4項目ぜんぶ出る
//   ④ 車検の「入庫時間」… 21項目ぜんぶ出る
//   ⑤ 「納車時間」… 21項目ぜんぶ出る
//   ★ポップの中に maxHeight / overflow を付け直すと、この検査が落ちる（それが目的）
//   実行: node card_pop_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8389, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

const FIX = [2026, 10, 21];
const TODAY = '2026-10-21';

const seed = {
  [STOR + 'insp']: {
    [TODAY]: [{ name: '車検花子', carType: 'ヴィッツ', no: '5555', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: 1, time: '10:00' }],
  },
  [STOR + 'honten-sched']: {
    [TODAY]: {
      // ★納車日を入れておくと「納車時間」の欄がはじめから出る（⑤の検査のため）
      '09:00': { name: '整備太郎', carType: 'アルト', no: '3503', work: 'Q', content: 'オイル交換', staff: '江川京志', deliveryDate: '2026-10-22', deliveryTime: '未定' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
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
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  const closeCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(600);
  };
  // ポップの採寸：中がスクロールしないか／項目が切れていないか
  const measure = (key) => page.evaluate(k => {
    const g = document.querySelector('[data-popgrid="' + k + '"]');
    if (!g) return null;
    const items = [...g.children];
    const cs = getComputedStyle(g);
    return {
      n: items.length,
      vScroll: g.scrollHeight > g.clientHeight + 1,
      hScroll: g.scrollWidth > g.clientWidth + 1,
      overflow: cs.overflowY + '/' + cs.overflowX,
      maxH: cs.maxHeight,
      grid: cs.display,
      cols: cs.gridTemplateColumns.split(' ').length,
      // 項目の字が箱からあふれていないか（横に切れていないか）
      clipped: items.filter(e => e.scrollWidth > e.clientWidth + 1).length,
      // ぜんぶ画面の中に入っているか（カードの外へはみ出していないか）
      outside: items.filter(e => { const b = e.getBoundingClientRect(); return b.width < 2 || b.height < 2; }).length,
      first: items.length ? items[0].innerText.trim() : '',
      last: items.length ? items[items.length - 1].innerText.trim() : '',
    };
  }, key);
  const openField = async (sel) => {
    await page.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, sel);
    await page.waitForTimeout(400);
  };

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1400);

  // ── 整備のカードを開く ──
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /整備太郎/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(1000);
  t('整備の予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));

  console.log('\n■ ① 整備の「時間帯」は21項目ぜんぶ見える');
  await openField('[data-kbkey="slot"]');
  let m = await measure('slot');
  t('ポップが出る', !!m, m);
  t('★21項目ぜんぶ出る', !!m && m.n === 21, m && m.n);
  t('★縦にスクロールしない', !!m && !m.vScroll, m);
  t('★横にスクロールしない', !!m && !m.hScroll, m);
  t('★高さの上限を付けていない', !!m && m.maxH === 'none', m && m.maxH);
  t('★ならべて出す（grid）', !!m && m.grid === 'grid', m && m.grid);
  t('★4列', !!m && m.cols === 4, m && m.cols);
  t('★どの項目も字が切れていない', !!m && m.clipped === 0, m && m.clipped);
  t('★つぶれた項目がない', !!m && m.outside === 0, m && m.outside);
  t('★先頭は「午前入庫」', !!m && m.first === '午前入庫', m && m.first);
  t('★「入庫時間未定」も入っている', await page.evaluate(() => !!document.querySelector('[data-slotid="未定"]')));
  // 選べることも確かめる（印 data-slotid は検査が見ているので消さないこと）
  await page.evaluate(() => { const e = document.querySelector('[data-slotid="11:00"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  t('★選ぶと欄に入る（11:00）', await page.evaluate(() => (document.querySelector('[data-kbkey="slot"]') || {}).innerText || '').then(x => /11:00/.test(x)));
  t('★選ぶとポップは閉じる', await page.evaluate(() => !document.querySelector('[data-popgrid="slot"]')));

  console.log('\n■ ② 整備の「作業内容」は13項目ぜんぶ見える');
  await openField('[data-kbkey="work"]');
  m = await measure('work');
  t('ポップが出る', !!m, m);
  t('★13項目ぜんぶ出る', !!m && m.n === 13, m && m.n);
  t('★縦にスクロールしない', !!m && !m.vScroll, m);
  t('★横にスクロールしない', !!m && !m.hScroll, m);
  t('★高さの上限を付けていない', !!m && m.maxH === 'none', m && m.maxH);
  t('★2列', !!m && m.cols === 2, m && m.cols);
  t('★どの項目も字が切れていない（メンパ12ヶ月点検まで）', !!m && m.clipped === 0, m && m.clipped);
  t('★先頭は「Q クイック整備・修理」', !!m && /クイック整備/.test(m.first), m && m.first);
  t('★最後は「他 その他」', !!m && /その他/.test(m.last), m && m.last);
  await page.evaluate(() => { const e = document.querySelector('[data-wkid="B"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  t('★選ぶと欄に入る（鈑金塗装）', await page.evaluate(() => (document.querySelector('[data-kbkey="work"]') || {}).innerText || '').then(x => /鈑金塗装/.test(x)));

  console.log('\n■ ③ 整備の「指・見」は4項目ぜんぶ見える');
  await openField('[data-kbkey="shimi"]');
  m = await measure('shimi');
  t('ポップが出る', !!m, m);
  t('★4項目ぜんぶ出る', !!m && m.n === 4, m && m.n);
  t('★縦にスクロールしない', !!m && !m.vScroll, m);
  t('★高さの上限を付けていない', !!m && m.maxH === 'none', m && m.maxH);
  await page.evaluate(() => { const e = document.querySelector('[data-shid="両"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  t('★選ぶと欄に入る（両方）', await page.evaluate(() => (document.querySelector('[data-kbkey="shimi"]') || {}).innerText || '').then(x => /両方/.test(x)));

  console.log('\n■ ⑤ 「納車時間」も21項目ぜんぶ見える');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('div')].find(e => /納車時間未定|納車時間/.test(e.innerText || '') && e.style && e.style.cursor === 'pointer');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  m = await measure('deliv');
  t('ポップが出る', !!m, m);
  t('★21項目ぜんぶ出る', !!m && m.n === 21, m && m.n);
  t('★縦にスクロールしない', !!m && !m.vScroll, m);
  t('★横にスクロールしない', !!m && !m.hScroll, m);
  t('★高さの上限を付けていない', !!m && m.maxH === 'none', m && m.maxH);
  t('★4列', !!m && m.cols === 4, m && m.cols);
  t('★「納車時間未定」も入っている', await page.evaluate(() => !!document.querySelector('[data-dtmid="未定"]')));
  await closeCard();

  console.log('\n■ ④ 車検の「入庫時間」は21項目ぜんぶ見える');
  // ★1日表示は車検の表と整備の表が同じ画面に並ぶ（タブの切り替えは要らない）。
  //   車検の行はカードを開く onClick が【お名前のマスだけ】に付いているので、tr ではなく td を押す。
  await page.evaluate(() => { const td = [...document.querySelectorAll('td')].find(e => /車検花子/.test(e.innerText)); if (td) td.click(); });
  await page.waitForTimeout(1000);
  t('車検の予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  await openField('[data-insptime]');
  m = await measure('time');
  t('ポップが出る', !!m, m);
  t('★21項目ぜんぶ出る', !!m && m.n === 21, m && m.n);
  t('★縦にスクロールしない', !!m && !m.vScroll, m);
  t('★横にスクロールしない', !!m && !m.hScroll, m);
  t('★高さの上限を付けていない', !!m && m.maxH === 'none', m && m.maxH);
  t('★4列', !!m && m.cols === 4, m && m.cols);
  t('★どの項目も字が切れていない', !!m && m.clipped === 0, m && m.clipped);
  await page.evaluate(() => { const e = document.querySelector('[data-tmid="15:00"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  t('★選ぶと欄に入る（15:00）', await page.evaluate(() => (document.querySelector('[data-insptime]') || {}).innerText || '').then(x => /15:00/.test(x)));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
