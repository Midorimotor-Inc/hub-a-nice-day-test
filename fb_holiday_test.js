// スマホの「🏖 休日」タブ（2026-09-19・アイデア仕様書②）の検査。にせの firebase（fake_firebase.js）で本物には繋がない。
//   ・タブが出る／今月のカレンダーに出勤人数が出る／日をタップすると休みの人と出勤人数が出る
//   ・自分の休日を入れる → dayoff-{店} のサーバー値に氏名が足される（他の人の休日はそのまま）→ もう一度で外れる
//   ・有給に切り替えると休日から外れて pleave に入る
//   ・店休日は入力できない／他の店は閲覧のみ／管理者は他の人の分も入れられる／一般スタッフは自分だけ
//   ・PC 側（他端末）で入れた休日が購読で届く
//   実行: node fb_holiday_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8167, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const now = new Date();
const Y = now.getFullYear(), M = now.getMonth();
// 今月の中で店休日（水曜・第2火曜・年末年始など）に当たらない平日を2つ選ぶ（月〜金・かつ 5日以降）
const pick = (n) => { const out = []; for (let d = 5; d <= 28 && out.length < n; d++) { const w = new Date(Y, M, d).getDay(); if (w >= 1 && w <= 5 && w !== 2 && w !== 3) out.push(d); } return out; };
const [D1, D2, D3] = pick(3);
const PM = M === 0 ? 11 : M - 1, PY = M === 0 ? Y - 1 : Y;   // 前月
const DK1 = `${Y}-${M + 1}-${D1}`, DK2 = `${Y}-${M + 1}-${D2}`, DK3 = `${Y}-${M + 1}-${D3}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    if (p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const routeFakeFb = (ctx, seed) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }, { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'inspector', store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
    [STOR + 'honten-dayoff']: { [DK1]: ['竹林直行'] },
    [STOR + 'honten-pleave']: {},
    [STOR + 'sanda-dayoff']: { [DK1]: ['藤原昭人'] },
    [STOR + 'honten-cdate']: [], [STOR + 'sanda-cdate']: [], [STOR + 'honten-cdow']: [], [STOR + 'sanda-cdow-v2']: [3],
    [STOR + 'mholidays']: { [`${PY}-${PM + 1}`]: 8, [`${Y}-${M + 1}`]: 9 },
    [STOR + 'honten-offnote']: {},
  };
  const open = async (loginName) => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, seed); await routeGas(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text()); });
    page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, loginName, 20000);
    await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes(n)); if (b) b.click(); }, loginName);
    await seeText(page, 'カレンダー', 20000);
    return { ctx, page, errs };
  };
  const openTab = page => page.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(e => e.textContent === '🏖休日' || (e.textContent.includes('休日') && e.textContent.length < 6)).pop(); if (el) el.click(); return !!el; });
  const tapDay = (page, d) => page.evaluate(d => {
    // カレンダーの日付セル（数字だけの div の親）をタップ
    const cells = [...document.querySelectorAll('div')].filter(e => e.style && e.style.cursor === 'pointer' && e.firstElementChild && e.firstElementChild.textContent === String(d));
    const c = cells[0]; if (c) c.click(); return !!c;
  }, d);
  const dayoff = page => page.evaluate(k => window.__fakeFb.get(k + 'honten-dayoff'), STOR);
  const pleave = page => page.evaluate(k => window.__fakeFb.get(k + 'honten-pleave'), STOR);
  const offnote = page => page.evaluate(k => window.__fakeFb.get(k + 'honten-offnote') || {}, STOR);

  // ── 1. 管理者（江川）：タブ・表示・自分の休日の入力 ──
  {
    const { ctx, page, errs } = await open('江川京志');
    t('休日タブがある', await openTab(page));
    t('タブを開くとスタッフ休日のカレンダーが出る', await seeText(page, 'スタッフ休日', 8000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    t('会社の今月の休日数が出る', await seeText(page, `会社の${M + 1}月の休日 9日`, 3000));
    t('各日に休みの人数だけ出る（竹林が休みの日は「休み1人」、誰も休まない日は何も出ない）', await page.evaluate(() => { const cells = [...document.querySelectorAll('div')].filter(e => e.style && e.style.cursor === 'pointer' && e.firstElementChild && /^\d+$/.test(e.firstElementChild.textContent)); return cells.some(c => c.textContent.includes('休み1人')) && !cells.some(c => /出\d/.test(c.textContent)); }));
    t(`${D1}日をタップすると休みの人と出勤人数が出る`, await tapDay(page, D1) && await seeText(page, '出勤 2人 / 3人', 3000) && (await page.evaluate(() => document.body.innerText)).includes('竹林直行'));
    // 他端末（PC）で入れた休日が届く（自分が書く前に。書いた後70秒は writeGuard で反映を止める設計のため）
    await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-dayoff') || {}; v[dk] = ['見取大介']; window.__fakeFb.set(k + 'honten-dayoff', v); }, [STOR, DK2]);
    t('PC で入れた休日が購読で届く（タップした日に見取が出る）', await tapDay(page, D2) && await seeText(page, '見取大介', 6000) && await seeText(page, '出勤 2人 / 3人', 3000));
    t('「休日を入力する」ボタンがある', await clickText(page, '休日を入力する'));
    t('入力モードになると種類のチップと確定ボタンが出る', await seeText(page, '✕ 解除', 3000) && await seeText(page, '✅ 確定', 3000));
    await clickText(page, '🏖 休日'); await tapDay(page, D1); await tapDay(page, D3);
    t('2日選んでも確定前は保存されない（確定（2日）と出る）', await seeText(page, '✅ 確定（2日）', 3000) && !((await dayoff(page))[DK1] || []).includes('江川京志') && !((await dayoff(page))[DK3] || []).includes('江川京志'), await dayoff(page));
    await clickText(page, '✅ 確定');
    t('確定で D3 も一括で保存される', await page.waitForFunction(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-dayoff') || {}; return (v[dk] || []).includes('江川京志'); }, [STOR, DK3], { timeout: 8000 }).then(() => true).catch(() => false), await dayoff(page));
    await tapDay(page, D1);
    t('自分を休日にすると dayoff に足される（竹林の分はそのまま）', await page.waitForFunction(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-dayoff'); return v && v[dk] && v[dk].includes('江川京志') && v[dk].includes('竹林直行'); }, [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), await dayoff(page));
    t('画面が「出勤 1人」に変わり、入力モードが終わる（保存の知らせ）', await seeText(page, '出勤 1人 / 3人', 5000) && await seeText(page, '日を保存しました', 3000));
    // 休日メモ（2026-09-20）
    t('休みの日にメモ欄が出る', await clickText(page, 'メモを書く'));
    await page.fill('input[placeholder*="午後休"]', '午後休');
    await clickText(page, '保存');
    t('メモが {店}-offnote に "日::氏名" で保存される', await page.waitForFunction(([k, dk]) => (window.__fakeFb.get(k + 'honten-offnote') || {})[dk + '::江川京志'] === '午後休', [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), await offnote(page));
    t('休みの人の名前の横にメモが出る', await seeText(page, '（午後休）', 5000) && await page.evaluate(() => /江川京志（[^）]*）?（午後休）/.test(document.body.innerText)));
    // 繰り越し（A案・2026-09-21）：前月の残り(8−店休日)が今月の一番早い休日に「○月繰り越し分」として充たる。バッジは翌月へ回る分だけ「繰り越しN日」
    const prevClosed = await page.evaluate(([py, pm]) => { let n = 0; const dim = new Date(py, pm + 1, 0).getDate(); for (let d = 1; d <= dim; d++) if (calIsClosed(new Date(py, pm, d), [], [], [])) n++; return n; }, [PY, PM]);
    const quota = 9 + (8 - prevClosed);
    t(`繰り越し：集計に「繰り越し休日」の内訳が出る（前月の残り ${8 - prevClosed} 日のうち充てた分）`, await seeText(page, '繰り越し休日', 5000), await page.evaluate(() => (document.body.innerText.match(/江川京志：[^\n]*/) || [''])[0]));
    t('繰り越し：バッジは「繰り越しN日 →翌月へ」だけ（枠・残りは出さない）', await page.evaluate(() => /繰り越し\d+日 →翌月へ/.test(document.body.innerText) && !/今月の枠|残り\d+日/.test(document.body.innerText)));
    t('今月の集計に自分の休日が数えられる', await page.evaluate(() => /江川京志：🏖 \d+日/.test(document.body.innerText)));
    await clickText(page, '休日を入力する'); await clickText(page, '📋 有給'); await tapDay(page, D1); await clickText(page, '✅ 確定');
    t('有給に切り替えると dayoff から外れ pleave に入る', await page.waitForFunction(([k, dk]) => { const o = window.__fakeFb.get(k + 'honten-dayoff') || {}, l = window.__fakeFb.get(k + 'honten-pleave') || {}; return !(o[dk] || []).includes('江川京志') && (o[dk] || []).includes('竹林直行') && (l[dk] || []).includes('江川京志'); }, [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), { o: await dayoff(page), l: await pleave(page) });
    await clickText(page, '休日を入力する'); await clickText(page, '✕ 解除'); await tapDay(page, D1); await clickText(page, '✅ 確定');
    t('もう一度で有給が外れる', await page.waitForFunction(([k, dk]) => { const l = window.__fakeFb.get(k + 'honten-pleave') || {}; return !(l[dk] || []).includes('江川京志'); }, [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), await pleave(page));
    t('休みを外すとメモも消える', await page.waitForFunction(([k, dk]) => !(window.__fakeFb.get(k + 'honten-offnote') || {})[dk + '::江川京志'], [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), await offnote(page));
    await tapDay(page, D2);
    // 管理者は他の人の分も入れられる
    t('管理者には「設定する人」の選択がある', await page.evaluate(() => !!document.querySelector('select')));
    await page.selectOption('select', '竹林直行');
    await clickText(page, '休日を入力する'); await clickText(page, '🏖 休日'); await tapDay(page, D2); await clickText(page, '✅ 確定');
    t('管理者が竹林の休日を入れられる', await page.waitForFunction(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-dayoff') || {}; return (v[dk] || []).includes('竹林直行') && (v[dk] || []).includes('見取大介'); }, [STOR, DK2], { timeout: 8000 }).then(() => true).catch(() => false), await dayoff(page));
    // 他の店は閲覧のみ
    await clickText(page, '三田店');
    await page.screenshot({ path: path.join(DIR, 'smoke-holiday.png'), fullPage: false });   // 見た目の控え
    t('三田店に切り替えると三田店の休日が出る（閲覧のみ）', await tapDay(page, D1) && await seeText(page, '藤原昭人', 5000) && await seeText(page, '他の店は閲覧のみ', 3000));
    t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 2. 一般スタッフ（竹林。見取は復旧4人＝管理者扱いなので使わない）：店休日は入れられない・自分だけ ──
  {
    const { ctx, page, errs } = await open('竹林直行');
    await openTab(page);
    await seeText(page, 'スタッフ休日', 8000);
    t('一般スタッフには「設定する人」の選択が無い', !(await page.evaluate(() => !!document.querySelector('select'))));
    // 店休日（本店の cdate に足す）→ 全員休み・入力ボタン無し
    const closedBefore = await page.evaluate(() => (document.body.innerText.match(/休業日/g) || []).length);
    await page.evaluate(([k, dk]) => { window.__fakeFb.set(k + 'honten-cdate', [dk]); }, [STOR, `${Y}-${String(M + 1).padStart(2, '0')}-${String(D1).padStart(2, '0')}`]);   // cdate はゼロ詰め（YYYY-MM-DD）
    t('PC で決めた休業日が購読で届く', await page.waitForFunction(n => (document.body.innerText.match(/休業日/g) || []).length > n, closedBefore, { timeout: 8000 }).then(() => true).catch(() => false));
    await tapDay(page, D1);
    t('店休日は「全員休み」と出て入力ボタンが無い', await seeText(page, '店休日（全員休み）', 5000) && !(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('🏖 休日') && b.innerText.length < 20))), await page.evaluate(() => document.body.innerText.slice(-300)));
    await tapDay(page, D2);
    t('自分の名前で入力欄が出る', await clickText(page, '休日を入力する') && await seeText(page, '竹林直行（自分）', 5000), await page.evaluate(() => document.body.innerText.slice(-400)));
    await clickText(page, '休日を入力する'); await clickText(page, '🏖 休日'); await tapDay(page, D2); await clickText(page, '✅ 確定');
    t('一般スタッフが自分の休日を入れられる', await page.waitForFunction(([k, dk]) => { const v = window.__fakeFb.get(k + 'honten-dayoff') || {}; return (v[dk] || []).includes('竹林直行'); }, [STOR, DK2], { timeout: 8000 }).then(() => true).catch(() => false), await dayoff(page));
    t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 3. PC（index_dev）：スタッフ休日カレンダーのメモ入力・繰り越し・個人表示で薄くならない ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, Object.assign({}, seed, { [STOR + 'honten-dayoff']: { [DK1]: ['竹林直行', '江川京志'] } })); await routeGas(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); });
    page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    t('PC：ログインできる', await seeText(page, 'スケジュール', 20000));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '休日' || (el.textContent.includes('休日') && el.textContent.length < 5)); if (b) b.click(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '江川京志'); if (b) b.click(); });
    await page.waitForTimeout(800);
    t('PC：個人を選んでも他の日が薄くならない（opacity 0.28 のセルが無い）', await page.evaluate(() => ![...document.querySelectorAll('div')].some(el => el.style && (el.style.opacity === '0.28'))));
    t('PC：個人の集計に繰り越しの内訳とバッジが出る', await seeText(page, '繰り越し休日', 5000) && await page.evaluate(() => /繰り越し\d+日 →翌月へ/.test(document.body.innerText) && !/枠 \d+日/.test(document.body.innerText)), await page.evaluate(() => (document.body.innerText.match(/月の集計[^]{0,200}/) || [''])[0]));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('設定') && el.textContent.length < 6 && el.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(500);
    await clickText(page, 'スタッフ休日設定');
    t('PC：スタッフ休日カレンダーが開く', await seeText(page, 'スタッフ休日・有給カレンダー', 5000));
    t('PC：休みの日に ✎ が出る', await page.evaluate(() => [...document.querySelectorAll('span')].some(el => el.textContent === '✎' && el.offsetParent !== null)));
    await page.evaluate(d => { const pens = [...document.querySelectorAll('span')].filter(el => el.textContent === '✎' && el.offsetParent !== null); const pen = pens.find(el => { let c = el; for (let i = 0; i < 4 && c; i++) c = c.parentElement; return c && c.textContent.trim().startsWith(String(d)); }) || pens[0]; if (pen) pen.click(); }, D1);
    t('PC：メモの入力欄が出る', await seeText(page, 'のメモ', 3000));
    await page.fill('input[placeholder*="午後休"]', '前月分');
    await clickText(page, '保存');
    t('PC：メモが {店}-offnote に保存される', await page.waitForFunction(([k, dk]) => (window.__fakeFb.get(k + 'honten-offnote') || {})[dk + '::江川京志'] === '前月分', [STOR, DK1], { timeout: 8000 }).then(() => true).catch(() => false), await offnote(page));
    t('PC：セルにメモが出る', await seeText(page, '📝 前月分', 3000));
    await page.screenshot({ path: path.join(DIR, 'smoke-holiday-pc.png') });
    t('PC：月次集計に繰越バッジが出る', await page.evaluate(() => /繰越\d+日/.test(document.body.innerText)));
    t('PC：JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 4. 枠を使い切った後の休日は自動で有給（2026-09-21）：PC の集計は押した瞬間に変わる ──
  {
    // 今月の店休日（第2火曜など）も「取得」に数えるので、枠 = 店休日 + 2 にして「D1 で残り1 → D2 で残り0 → D3 は有給」にする
    const closedN = (() => { let n = 0; const dim = new Date(Y, M + 1, 0).getDate(); for (let d = 1; d <= dim; d++) { const w = new Date(Y, M, d); let tue = 0, st = null; for (let k = 1; k <= dim; k++) { if (new Date(Y, M, k).getDay() === 2) { tue++; if (tue === 2) { st = k; break; } } } if (d === st) n++; } return n; })();
    const seed4 = Object.assign({}, seed, { [STOR + 'honten-dayoff']: { [DK1]: ['江川京志'] }, [STOR + 'mholidays']: { [`${Y}-${M + 1}`]: closedN + 2 } });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, seed4); await routeGas(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('設定') && el.textContent.length < 6 && el.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(400);
    await clickText(page, 'スタッフ休日設定');
    t('自動有給：スタッフ休日カレンダーが開く', await seeText(page, 'スタッフ休日・有給カレンダー', 5000));
    const summary = () => page.evaluate(() => { const el = [...document.querySelectorAll('span')].find(e => e.firstElementChild && e.firstElementChild.textContent === '江川京志' && e.textContent.includes('休')); return el ? el.textContent : ''; });   // 月次集計の江川のチップ
    const clickDay = d => page.evaluate(d => { const sp = [...document.querySelectorAll('span')].find(el => el.textContent.trim() === String(d) && el.offsetParent !== null && el.closest('.modal-box')); let c = sp; for (let i = 0; i < 6 && c; i++) { if (c.onclick || (c.getAttribute && c.style && c.style.cursor === 'pointer')) break; c = c.parentElement; } if (c) c.click(); return !!c; }, d);
    t(`自動有給：最初は「繰越1日」（会社${closedN + 2}・取得${closedN + 1}）`, await page.waitForFunction(() => { const el = [...document.querySelectorAll('span')].find(e => e.firstElementChild && e.firstElementChild.textContent === '江川京志' && e.textContent.includes('休')); return el && /繰越1日/.test(el.textContent); }, null, { timeout: 5000 }).then(() => true).catch(() => false), await summary());
    await clickDay(D2); await page.waitForTimeout(400);
    t('自動有給：D2 を押した瞬間にバッジが消える（使い切り）', await page.waitForFunction(() => { const el = [...document.querySelectorAll('span')].find(e => e.firstElementChild && e.firstElementChild.textContent === '江川京志' && e.textContent.includes('休')); return el && !/繰越\d+日/.test(el.textContent) && /休\d+日/.test(el.textContent);}, null, { timeout: 3000 }).then(() => true).catch(() => false), await summary());
    await clickDay(D3); await page.waitForTimeout(400);
    t('自動有給：枠を使い切った後の D3 は休日ではなく有給に入る', await page.waitForFunction(([k, dk]) => { const p = window.__fakeFb.get(k + 'honten-pleave') || {}; const o = window.__fakeFb.get(k + 'honten-dayoff') || {}; return (p[dk] || []).includes('江川京志') && !(o[dk] || []).includes('江川京志'); }, [STOR, DK3], { timeout: 8000 }).then(() => true).catch(() => false), [await dayoff(page), await pleave(page)]);
    t('自動有給：「有給として入れました」のお知らせが出る', await seeText(page, '有給として入れました', 3000));
    t('自動有給：集計に 有1日 が出て、超過にならない', await page.evaluate(() => /有1日/.test(document.body.innerText) && !/超過/.test(document.body.innerText)), await summary());
    // 2026-09-28：自動で有給になった日も「🏖 休日」のままもう一度押して解除できる（有給ボタンに切り替えなくてよい）
    await clickDay(D3); await page.waitForTimeout(500);
    t('自動有給：もう一度押すと（休日のまま）有給から外れる', await page.waitForFunction(([k, dk]) => { const p = window.__fakeFb.get(k + 'honten-pleave') || {}; const o = window.__fakeFb.get(k + 'honten-dayoff') || {}; return !(p[dk] || []).includes('江川京志') && !(o[dk] || []).includes('江川京志'); }, [STOR, DK3], { timeout: 8000 }).then(() => true).catch(() => false), [await dayoff(page), await pleave(page)]);
    t('自動有給：外したあとは集計から 有 が消える', await page.waitForFunction(() => { const el = [...document.querySelectorAll('span')].find(e => e.firstElementChild && e.firstElementChild.textContent === '江川京志' && e.textContent.includes('休')); return el && !/有\d+日/.test(el.textContent); }, null, { timeout: 5000 }).then(() => true).catch(() => false), await summary());
    await clickDay(D3); await page.waitForTimeout(500);
    t('自動有給：もう一度押すとまた有給として入る（行ったり来たりできる）', await page.waitForFunction(([k, dk]) => { const p = window.__fakeFb.get(k + 'honten-pleave') || {}; return (p[dk] || []).filter(n => n === '江川京志').length === 1; }, [STOR, DK3], { timeout: 8000 }).then(() => true).catch(() => false), await pleave(page));
    t('自動有給：JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 5. スマホでも同じ：枠を使い切った後に 🏖 休日 を押すと有給に入る ──
  {
    const closedN = (() => { let n = 0; const dim = new Date(Y, M + 1, 0).getDate(); let tue = 0, st = null; for (let k = 1; k <= dim; k++) { if (new Date(Y, M, k).getDay() === 2) { tue++; if (tue === 2) { st = k; break; } } } if (st) n++; return n; })();
    const seed5 = Object.assign({}, seed, { [STOR + 'honten-dayoff']: { [DK1]: ['江川京志'] }, [STOR + 'mholidays']: { [`${Y}-${M + 1}`]: closedN + 1 } });
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(signedInInit, [0, ME, STOR]);
    await routeFakeFb(ctx, seed5); await routeGas(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
    await seeText(page, 'カレンダー', 20000);
    await openTab(page); await seeText(page, 'スタッフ休日', 8000);
    t('スマホ自動有給：枠を使い切っているのでバッジが出ない', await seeText(page, '江川京志：🏖', 5000) && await page.evaluate(() => !/繰り越し\d+日 →翌月へ/.test(document.body.innerText)), await page.evaluate(() => (document.body.innerText.match(/江川京志：[^\n]*/) || [''])[0]));
    await tapDay(page, D2); await page.waitForTimeout(300);
    await clickText(page, '休日を入力する'); await clickText(page, '🏖 休日'); await tapDay(page, D2); await clickText(page, '✅ 確定');
    t('スマホ自動有給：🏖 休日 を押しても有給（pleave）に入る', await page.waitForFunction(([k, dk]) => { const p = window.__fakeFb.get(k + 'honten-pleave') || {}; const o = window.__fakeFb.get(k + 'honten-dayoff') || {}; return (p[dk] || []).includes('江川京志') && !(o[dk] || []).includes('江川京志'); }, [STOR, DK2], { timeout: 8000 }).then(() => true).catch(() => false), [await dayoff(page), await pleave(page)]);
    t('スマホ自動有給：お知らせが出る', await seeText(page, '有給として入れました', 3000));
    // 2026-09-28：🏖 休日 のまま、もう一度その日をタップすると「解除」になる
    await clickText(page, '休日を入力する'); await clickText(page, '🏖 休日'); await tapDay(page, D2);
    t('スマホ自動有給：もう一度タップすると「解除」と出る', await seeText(page, '解除', 4000), await page.evaluate(() => document.body.innerText.slice(0, 500)));
    await clickText(page, '✅ 確定');
    t('スマホ自動有給：確定すると有給から外れる', await page.waitForFunction(([k, dk]) => { const p = window.__fakeFb.get(k + 'honten-pleave') || {}; const o = window.__fakeFb.get(k + 'honten-dayoff') || {}; return !(p[dk] || []).includes('江川京志') && !(o[dk] || []).includes('江川京志'); }, [STOR, DK2], { timeout: 10000 }).then(() => true).catch(() => false), [await dayoff(page), await pleave(page)]);
    t('スマホ自動有給：JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
