// 研修バッジの検査（v3.99.0・2026-11-04 ユーザー指示・B案）
//   ★研修は【休みではない】。出勤の側に残し、いちばん右端に一マス空けて並べる。
//     ただし「対応可能」「フロント対応」の人数には数えない（不在だから）。
//     休日の日数・繰り越し（mholidays / calcHolidayCarry）には絶対に入れない。
//   見張るもの：
//     ① 週間カレンダーの出勤行（出勤側に残る／一マス空く／紫＋「研」）
//     ② 1日表示のスタッフ帯（同じ・休みの側に出ない）
//     ③ 休日設定（StaffCalendarModal）の 種類 の3つ目／月間集計は休日と別
//     ④ カレンダーの 🏖 休日タブ（紫の「研」の札・月間合計バー）
//     ⑤ スマホ（出勤の側に紫＋「研」／休みの側に出ない）
//     ⑥ ファイルの中身（対応可能の人数から外す／繰り越しに入れない／各道具も training を触る）
//   実行: node training_badge_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8437, STOR = 'hub-v8-dev-';
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
    { uid: 'h4', name: '魚住圭', myNumber: 4, store: 'honten', badge: 'mechanic' },
    { uid: 'h5', name: '岡本大地', myNumber: 5, store: 'honten', badge: 'mechanic' }],
  [STOR + 'sanda-staff-v2']: [
    { uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  // 今日：竹林＝休日／魚住＝有給／岡本＝研修（★休みではない）／江川＝ふつうに出勤
  [STOR + 'honten-dayoff']: { [DK]: ['竹林直行'] },
  [STOR + 'honten-pleave']: { [DK]: ['魚住圭'] },
  [STOR + 'honten-training']: { [DK]: ['岡本大地'] },
  [STOR + 'sanda-dayoff']: {}, [STOR + 'sanda-pleave']: {}, [STOR + 'sanda-training']: {},
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};
const initFor = ([me, stor, sd]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = {};
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
  for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
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
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(initFor, [ME, STOR, seed]);
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
  await page.waitForTimeout(2400);

  // ── ① 週間カレンダーの出勤行 ──
  console.log('\n■ ① 週間カレンダーの出勤行（研修は出勤の側・いちばん右端に一マス空けて）');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /週間カレンダー/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const wk = await page.evaluate(() => {
    const td = document.querySelector('[data-wstf]');
    if (!td) return null;
    const trn = [...document.querySelectorAll('[data-wtrn]')].map(e => e.getAttribute('data-wtrn'));
    const gap = document.querySelector('[data-wtrngap]');
    const sp = document.querySelector('[data-wtrn]');
    const cs = sp ? getComputedStyle(sp) : null;
    // 「研」の1文字バッジ（紫の名前バッジの右どなり）
    const ch = sp && sp.nextElementSibling ? sp.nextElementSibling.textContent : '';
    return {
      trn, gapW: gap ? Math.round(gap.getBoundingClientRect().width) : 0,
      bg: cs ? cs.backgroundColor : '', ch,
      gapBeforeTrn: !!(gap && sp && (gap.compareDocumentPosition(sp) & Node.DOCUMENT_POSITION_FOLLOWING)),
      cell: [...document.querySelectorAll('[data-wstf]')].map(e => e.innerText.replace(/\s+/g, ' ')).join(' | ')
    };
  });
  t('週表の出勤行が出ている', !!wk, wk);
  t('★研修の人のバッジが出勤行にある（岡本大地）', !!wk && wk.trn.indexOf('岡本大地') >= 0, wk && wk.trn);
  t('★色は紫（TRN_COL #7e22ce）', !!wk && /126, 34, 206/.test(wk.bg), wk && wk.bg);
  t('★名前バッジの右に「研」が出る', !!wk && wk.ch === '研', wk && wk.ch);
  t('★研修の前に一マス空いている（幅が入っている）', !!wk && wk.gapW >= 15, wk && wk.gapW);
  t('★一マスは研修バッジより前にある（いちばん右端に寄せる）', !!wk && wk.gapBeforeTrn, wk && wk.gapBeforeTrn);
  await page.evaluate(() => { const b = document.querySelector('[data-wclose]'); if (b) b.click(); });
  await page.waitForTimeout(900);

  // ── ② 1日表示のスタッフ帯 ──
  console.log('\n■ ② 1日表示のスタッフ帯（研修は出勤の側に残る／休みの側に出ない）');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const bar = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d =>
      d.children.length === 2 && d.children[0].innerText && /本日/.test(d.children[0].innerText)
      && d.children[1].innerText && /🏖/.test(d.children[1].innerText));
    if (!el) return null;
    const txt = e => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
    const sp = el.querySelector('[data-daytrn]');
    return {
      all: txt(el), working: txt(el.children[0]), off: txt(el.children[1]),
      trn: sp ? sp.getAttribute('data-daytrn') : '', bg: sp ? getComputedStyle(sp).backgroundColor : '',
      inWorking: !!(sp && el.children[0].contains(sp))
    };
  });
  const b1 = await bar();
  t('スタッフ帯が出ている', !!b1, b1);
  t('★研修の人は出勤の側にいる（岡本大地）', !!b1 && b1.trn === '岡本大地' && b1.inWorking, b1);
  t('★研修の人は休みの側に出ない', !!b1 && !/岡本大地/.test(b1.off), b1 && b1.off);
  t('★色は紫', !!b1 && /126, 34, 206/.test(b1.bg), b1 && b1.bg);
  t('★「研」の一文字が付く', !!b1 && /岡本大地 ?研/.test(b1.working), b1 && b1.working);
  t('休日・有給は今までどおり休みの側（竹林・魚住）', !!b1 && /竹林直行/.test(b1.off) && /魚住圭/.test(b1.off), b1 && b1.off);
  t('休んでいない人は出勤の側（江川京志）', !!b1 && /江川京志/.test(b1.working), b1 && b1.working);

  // ── ③ 休日設定（StaffCalendarModal）の 種類 の3つ目 ──
  console.log('\n■ ③ 休日設定の 種類 の3つ目「🎓 研修」');
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => (d.title || '').includes('クリックして休日スタッフを編集')); if (el) el.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /スタッフ休日・有給カレンダーを開く/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('休日設定が開いた', await see('スタッフ休日・有給カレンダー', 6000));
  t('★種類の3つ目に「🎓 研修」のボタンがある', await page.evaluate(() => !!document.querySelector('[data-seltrn]')));
  const ord = await page.evaluate(() => {
    const b = document.querySelector('[data-seltrn]'); if (!b) return null;
    return [...b.parentElement.querySelectorAll('button')].map(x => x.innerText.replace(/\s+/g, ''));
  });
  t('★並びは 休日 → 有給 → 研修（3つ目）', !!ord && ord.length >= 3 && /研修/.test(ord[2]), ord);
  // 人を選んで「研修」に切り替える
  const pick = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.replace(/\s+/g, '') === '岡本大地');
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('[data-seltrn]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('人（岡本大地）と「研修」を選べた', pick);
  t('★「研修は休みではありません」の注意が出る', await page.evaluate(() => /研修は休みではありません/.test(document.body.innerText)));
  t('★研修の日に 🎓 の印が出る', await page.evaluate(() => document.querySelectorAll('[data-caltrn]').length) >= 1);
  const sum0 = await page.evaluate(() => [...document.querySelectorAll('[data-sumtrn]')].map(x => x.getAttribute('data-sumtrn') + ':' + x.innerText.replace(/\s+/g, '')));
  t('★月間集計に「研N日」の札が出る（休日・有給とは別）', sum0.some(x => /岡本大地:研1日/.test(x)), sum0);

  // ── ④ カレンダーの 🏖 休日タブ ──
  console.log('\n■ ④ カレンダーの 🏖 休日タブ（紫の「研」の札・月間合計バー）');
  // ★休日設定を閉じるボタンは「✅ 確定して閉じる」（title は空）。右上の ✕（title=閉じる）は
  //   アプリそのものを閉じるボタンなので、そちらを押さないこと。
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /確定して閉じる/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /わかりました/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.replace(/\s+/g, '') === 'カレンダー' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => (e.title || '') === '休日カレンダー'); if (b) b.click(); });
  await page.waitForTimeout(1700);
  // ★「表示：」の絞り込みが誰かに掛かっていると、その人の分しか札が出ない（休日・有給も同じ）。
  //   札そのものを見る時は必ず「全員」に戻すこと。
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.replace(/\s+/g, '') === '全員' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1100);
  const tab = await page.evaluate(() => {
    const e = document.querySelector('[data-tabtrn]');
    return { name: e ? e.getAttribute('data-tabtrn') : '', txt: e ? e.innerText.replace(/\s+/g, '') : '', n: document.querySelectorAll('[data-tabtrn]').length };
  });
  t('★休日タブに研修の札が出る（岡本大地）', tab.name === '岡本大地', tab);
  t('★札に「研」が付く', /研/.test(tab.txt), tab);
  t('★休日の札（竹林）・有給の札（魚住）も今までどおり出る',
    await page.evaluate(() => /竹林直行/.test(document.body.innerText) && /魚住圭/.test(document.body.innerText)));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.replace(/\s+/g, '') === '岡本大地' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const sumTile = await page.evaluate(() => {
    const e = document.querySelector('[data-tabsumtrn]');
    return { has: !!e, txt: e ? e.innerText.replace(/\s+/g, '') : '', bar: e ? e.parentElement.innerText.replace(/\s+/g, '') : '' };
  });
  t('★月間合計バーに研修のタイルが出る', sumTile.has, sumTile);
  t('★「休みではありません」と添える', /休みではありません/.test(sumTile.txt), sumTile.txt);
  // ★研修1日あっても「合計」は 休日＋有給 のまま（この月の休日は店休日1日だけ＝合計1日）。
  t('★研修は「合計」に入れない（休日1＋有給0＝合計1日のまま）',
    /研修1日/.test(sumTile.bar) && /合計1日/.test(sumTile.bar), sumTile.bar);
  t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-training.png') });

  // ── ⑤ スマホ ──
  console.log('\n■ ⑤ スマホ（出勤の側に紫＋「研」／休みの側に出ない）');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mctx.addInitScript(initFor, [ME, STOR, seed]);
  await mctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await mctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  const mclick = (x) => mp.evaluate(s2 => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s2) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const msee = async (s2, ms = 25000) => { try { await mp.waitForFunction(x => document.body.innerText.includes(x), s2, { timeout: ms }); return true; } catch (e) { return false; } };
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await msee(ME.name); await mclick(ME.name); await mclick('でログイン');
  await mp.waitForTimeout(3200);
  // ★スマホの下タブは button ではなく div（onClick）
  await mp.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => /スケジュール/.test(d.innerText) && d.innerText.replace(/\s/g, '').length < 12 && d.offsetParent !== null);
    if (el) el.click();
  });
  await mp.waitForTimeout(2400);
  const m1 = await mp.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d =>
      d.children.length === 2 && d.children[0].innerText && /出勤/.test(d.children[0].innerText)
      && d.children[1].innerText && /休み/.test(d.children[1].innerText));
    if (!el) return null;
    const txt = e => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
    const sp = el.querySelector('[data-mtrn]');
    const gap = el.querySelector('[data-mtrngap]');
    return {
      working: txt(el.children[0]), off: txt(el.children[1]),
      trn: sp ? sp.getAttribute('data-mtrn') : '', bg: sp ? getComputedStyle(sp).backgroundColor : '',
      inWorking: !!(sp && el.children[0].contains(sp)),
      gapW: gap ? Math.round(gap.getBoundingClientRect().width) : 0
    };
  });
  t('★スマホのスタッフの行が出る', !!m1, m1);
  t('★研修の人は出勤の側（岡本大地）', !!m1 && m1.trn === '岡本大地' && m1.inWorking, m1);
  t('★研修の人は休みの側に出ない', !!m1 && !/岡本大地/.test(m1.off), m1 && m1.off);
  t('★色は紫', !!m1 && /126, 34, 206/.test(m1.bg), m1 && m1.bg);
  t('★「研」の一文字が付く', !!m1 && /岡本大地 ?研/.test(m1.working), m1 && m1.working);
  t('★研修の前に一マス空いている', !!m1 && m1.gapW >= 10, m1 && m1.gapW);
  t('休日・有給は休みの側（竹林・魚住）', !!m1 && /竹林直行/.test(m1.off) && /魚住圭/.test(m1.off), m1 && m1.off);
  // スマホの休日タブ（見るだけ）
  await mp.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => /休日/.test(d.innerText) && d.innerText.replace(/\s/g, '').length < 8 && d.offsetParent !== null);
    if (el) el.click();
  });
  await mp.waitForTimeout(1900);
  const mtab = await mp.evaluate(() => ({ cal: document.querySelectorAll('[data-mcaltrn]').length, body: document.body.innerText.replace(/\s+/g, '') }));
  t('★スマホの休日タブに研修の人数が出る', /研修1人/.test(mtab.body), mtab.body.slice(0, 160));
  t('⑤ スマホ：JSエラー・alert なし', merrs.length === 0, merrs.slice(0, 3));
  await mp.screenshot({ path: path.join(DIR, 'smoke-training-mobile.png') });
  await mctx.close();

  // ── ⑥ ファイルの中身で見張る ──
  console.log('\n■ ⑥ ファイルの中身（対応可能の人数から外す／繰り越しに入れない／各道具も training を触る）');
  const idx = fs.readFileSync(path.join(DIR, SRC), 'utf8');
  const mob = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('★PC：対応可能チェックが研修も外している', /\.concat\(trainingData\[dk\]\|\|\[\]\)/.test(idx));
  t('★スマホ：対応可能チェックが研修も外している', /\.concat\(\(trainingData\|\|\{\}\)\[dk\]\|\|\[\]\)/.test(mob));
  t('★PC：色と文字は TRN_COL / TRN_CH を通している', /const TRN_COL = '#7e22ce'/.test(idx) && /const TRN_CH\s+= '研'/.test(idx));
  t('★スマホ：同じ定数を置いている', /const TRN_COL = '#7e22ce'/.test(mob) && /const TRN_CH\s+= '研'/.test(mob));
  t('★研修は calcHolidayCarry に渡していない（休日の繰り越しに入れない）',
    !/calcHolidayCarry\([^)]*training/i.test(idx) && !/calcHolidayCarry\([^)]*training/i.test(mob));
  t('★時点保存のキーの表に training がある（index）', /SNAP_KEYS_STORE[\s\S]{0,200}'training'/.test(idx));
  t('★時点保存のキーの表に training がある（mobile）', /SNAP_KEYS_STORE[\s\S]{0,200}'training'/.test(mob));
  t('★MOBILE_KEYS に training がある', /MOBILE_KEYS[\s\S]{0,1600}storKey\('training','honten'\)/.test(mob));
  t('★印刷は trainingData を引数で受けている（外のスコープを掴まない）', /restriction, trainingData\) =>/.test(idx));
  const kc = fs.readFileSync(path.join(DIR, 'fb_snap_keycheck.js'), 'utf8');
  t('★fb_snap_keycheck.js の同じ表にも training がある', /SNAP_KEYS_STORE[\s\S]{0,200}'training'/.test(kc));
  const fx = fs.readFileSync(path.join(DIR, 'fb_fix_staff_names.js'), 'utf8');
  t('★名前の変更／退職の抹消も {店}-training を触る', /-training/.test(fx));
  const rs = fs.readFileSync(path.join(DIR, 'fb_restore.js'), 'utf8');
  t('★控えからの日ごとの復旧も training を扱える（shapeOf）', /dayoff\|pleave\|training/.test(rs));
  const pp = fs.readFileSync(path.join(DIR, 'hub_paper.js'), 'utf8');
  t('★紙の控えも {店}-training を読む', /'-training'/.test(pp));
  t('★紙の休日表に「研」の列がある', /width:44px">研</.test(pp));

  await browser.close(); server.close();
  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
