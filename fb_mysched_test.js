// マイスケジュール（2026-09-30 作り直し）の検査。にせの firebase で本物には繋がない。
//   ヒントと答え（暗号のシークレット）は廃止。予定は「共有スケジュール」と「マイスケジュール」の2つ。
//   ・店の共有の端末：マイスケジュールは出さない・読み込まない。追加は共有だけ
//   ・自分専用の端末：共有／マイを選んで追加でき、「すべて表示／共有／マイ」で切り替えられる
//   ・別の人には、他人のマイスケジュールは一切見えない
//   ・以前の🔒シークレット予定の「持ってくる」案内は廃止（2026-09-30）。古い書庫があっても何も出さない
//   実行: node fb_mysched_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8168, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const now = new Date();
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = Object.assign(st['meta/allowed'] || {}, { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } });
  st['devices/dev-' + me.uid] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-' + me.uid);
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', localStorage.getItem('__testKind') || 'shared');   // 検査中に own へ切り替えられるように
};
const EGAWA = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const TIKU = { email: 'tikurin@midori-m.com', fbuid: 'uid_tiku', uid: 'h3', name: '竹林直行', store: 'honten', role: 'staff' };
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html' || p === 'mobile.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }, { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
    // 予定カレンダーに自分の休日が同期して出る検査用（2026-09-21）：今月の5日＝江川の休日、6日＝有給
    [STOR + 'honten-dayoff']: { [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-5`]: ['江川京志'] },
    [STOR + 'honten-pleave']: { [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-6`]: ['江川京志'] },
  };
  const routeFakeFb = (ctx, extra) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); ' + (extra || '') + ' })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  const openPc = async (me, storeJson) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    if (storeJson) await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(signedInInit, [0, me, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, me.name, 20000); await clickText(page, me.name); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(1200);
    return { ctx, page, errs };
  };
  const pickToday = page => page.evaluate(d => { const cells = [...document.querySelectorAll('div')].filter(el => el.style && el.style.cursor === 'pointer' && el.style.minHeight === '110px' && el.textContent.trim().startsWith(String(d))); const c = cells[0]; if (c) c.click(); return !!c; }, D);
  const rawStore = page => page.evaluate(() => localStorage.getItem('__fakeFbStore') || '');
  const kv = (page, k) => page.evaluate(k => window.__fakeFb.get(k), k);

  let storeJson = '';
  const setKind = (page, k) => page.evaluate(([s2, k2]) => { localStorage.setItem(s2 + 'auth-kind', k2); localStorage.setItem('__testKind', k2); }, [STOR, k]);
  const goCal = async page => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('カレンダー') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16); if (b) b.click(); });
    await page.waitForTimeout(800);
    await clickText(page, '予定');
    await page.waitForTimeout(600);
  };
  const panelText = page => page.evaluate(() => { const m = document.querySelector('.modal-box'); return m ? m.innerText : ''; });
  // モーダル（日の予定）の中だけを押す。ヘッダーの絞り込みと同じ文字のボタンがあるため
  const clickIn = (page, x) => page.evaluate(y => { const m = document.querySelector('.modal-box'); if (!m) return false; const b = [...m.querySelectorAll('button')].find(e => e.innerText.includes(y) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);

  // ── 1. PC・江川・店の共有の端末：マイスケジュールは出ない ──
  {
    const { ctx, page, errs } = await openPc(EGAWA);
    console.log('\n■ 1. PC・店の共有の端末');
    t('PC：カレンダーに「予定」の切替がある', await clickText(page, '予定'));
    t('PC：予定ビューが出る', await seeText(page, 'マイスケジュール', 5000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    t('PC：予定カレンダーに自分の休日・有給がスタッフ休日と同期して出る', await page.evaluate(() => { const cells = [...document.querySelectorAll('div')].filter(el => el.style && el.style.minHeight === '110px'); const has = (n, s2) => cells.some(el => el.textContent.startsWith(String(n)) && el.textContent.includes(s2)); return has(5, '🏖 休日') && has(6, '📋 有給'); }));
    const top = await page.evaluate(() => document.body.innerText);
    t('共有端末：切り替えの3つボタンは出ない', !/すべて表示/.test(top), top.slice(0, 300));
    t('共有端末：共有だけを表示する案内が出る', /店の共有のため/.test(top), top.slice(0, 300));
    t('PC：今日の日をクリックすると予定の画面が開く', await pickToday(page) && await seeText(page, 'の予定', 5000));
    await clickText(page, '＋ 予定を追加');
    await page.waitForTimeout(300);
    const addTxt = await panelText(page);
    t('共有端末：追加で「共有／マイ」を選ぶボタンは出ない', !/🙋 マイスケジュール/.test(addTxt), addTxt.slice(0, 400));
    t('共有端末：共有として追加される案内が出る', /この端末は/.test(addTxt) && /共有スケジュール/.test(addTxt), addTxt.slice(0, 400));
    await page.fill('input[placeholder*="件名"]', '本店会議');
    await page.fill('input[type="time"]', '10:00');
    await page.fill('textarea', '2階');
    await clickText(page, '追加');
    t('PC：共有予定が mysched に本人の uid・氏名付きで入る', await page.waitForFunction(([k, dk]) => Object.values(window.__fakeFb.get(k + 'mysched') || {}).some(v => v.dk === dk && v.title === '本店会議' && v.uid === 'h7' && v.owner === '江川京志' && v.time === '10:00'), [STOR, DK], { timeout: 8000 }).then(() => true).catch(() => false), await kv(page, STOR + 'mysched'));
    t('PC：一覧に「自分」の印で出る', await seeText(page, '本店会議', 3000) && (await page.evaluate(() => document.body.innerText)).includes('自分'));
    await clickText(page, '編集');
    await page.fill('input[placeholder*="件名"]', '本店会議（2階）');
    await clickText(page, '保存');
    t('PC：編集しても予定は1件のまま（件名が変わる）', await page.waitForFunction(() => { const m = document.querySelector('.modal-box'); const x = m ? m.innerText : ''; return x.includes('本店会議（2階）') && (x.match(/本店会議/g) || []).length === 1; }, null, { timeout: 8000 }).then(() => true).catch(() => false), await panelText(page));
    await clickText(page, '編集'); await clickText(page, '削除');
    t('PC：削除すると消えたまま（手元に復活しない）', await page.waitForFunction(() => !document.body.innerText.includes('本店会議'), null, { timeout: 8000 }).then(() => true).catch(() => false));
    await page.waitForTimeout(1500);
    t('PC：削除の3秒後も復活していない', !(await page.evaluate(() => document.body.innerText)).includes('本店会議') && Object.keys(await kv(page, STOR + 'mysched') || {}).length === 0);
    await clickText(page, '＋ 予定を追加'); await page.fill('input[placeholder*="件名"]', '本店会議'); await page.fill('input[type="time"]', '10:00'); await page.fill('textarea', '2階'); await clickText(page, '追加');
    await seeText(page, '本店会議', 8000);
    t('共有端末：マイスケジュールの入れ物を読みにいかない', await page.evaluate(k => window.__fakeFb.get(k + 'myprv-h7') === undefined || window.__fakeFb.get(k + 'myprv-h7') === null, STOR));
    t('PC：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    storeJson = await rawStore(page);
    await ctx.close();
  }

  // ── 2. PC・江川・自分専用の端末：共有／マイを選べる・3つで切り替えられる ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(s2 => { localStorage.setItem('__testKind', 'own'); localStorage.setItem(s2 + 'auth-kind', 'own'); }, STOR);
    await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    console.log('\n■ 2. PC・自分専用の端末');
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, EGAWA.name, 20000); await clickText(page, EGAWA.name); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await goCal(page);
    const top2 = await page.evaluate(() => document.body.innerText);
    t('自分専用：3つの切り替えボタンが出る', /すべて表示/.test(top2) && /👥 共有スケジュール/.test(top2) && /🙋 マイスケジュール/.test(top2), top2.slice(0, 400));
    await pickToday(page); await seeText(page, 'の予定', 5000);
    await clickText(page, '＋ 予定を追加');
    await page.waitForTimeout(300);
    t('自分専用：追加で「共有／マイ」を選べる', /🙋 マイスケジュール/.test(await panelText(page)));
    await page.fill('input[placeholder*="件名"]', '歯医者');
    t('自分専用：フォームで「マイ」を選べた', await clickIn(page, '🙋 マイスケジュール'));
    await clickIn(page, '追加');
    t('自分専用：マイ予定が myprv-h7 に入る', await page.waitForFunction(([k, dk]) => { const v = window.__fakeFb.get(k + 'myprv-h7') || {}; return Object.values(v).some(x => x && x.dk === dk && x.title === '歯医者'); }, [STOR, DK], { timeout: 8000 }).then(() => true).catch(() => false), await kv(page, STOR + 'myprv-h7'));
    t('自分専用：マイ予定は共有(mysched)には入らない', !Object.values(await kv(page, STOR + 'mysched') || {}).some(v => v.title === '歯医者'));
    t('自分専用：一覧に「🙋 マイ」の印で出る', /🙋 マイ/.test(await panelText(page)), await panelText(page));
    // 3つの切り替え
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await clickText(page, '👥 共有スケジュール'); await page.waitForTimeout(600);
    await pickToday(page); await seeText(page, 'の予定', 5000);
    let p2 = await panelText(page);
    t('切り替え「共有」：共有だけ出る', /本店会議/.test(p2) && !/歯医者/.test(p2), p2.slice(0, 300));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await clickText(page, '🙋 マイスケジュール'); await page.waitForTimeout(600);
    await pickToday(page); await seeText(page, 'の予定', 5000);
    p2 = await panelText(page);
    t('切り替え「マイ」：マイだけ出る', /歯医者/.test(p2) && !/本店会議/.test(p2), p2.slice(0, 300));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await clickText(page, 'すべて表示'); await page.waitForTimeout(600);
    t('切り替え「すべて」：カレンダーのセルに両方出る', await page.evaluate(() => { const c = [...document.querySelectorAll('div')].find(el => el.style && el.style.minHeight === '110px' && el.textContent.includes('本店会議')); return !!c && c.textContent.includes('歯医者') && c.textContent.includes('🙋'); }));
    // 古い暗号書庫が残っていても、案内は出さない（2026-09-30 ユーザー指示で「持ってくる」を廃止）
    console.log('\\n■ 2-2. 古い暗号書庫があっても案内を出さない');
    await page.evaluate(([k]) => {
      window.__fakeFb.set(k + 'mysec-h7', { hint: '初めて飼った犬の名前', salt: 'c2FsdA==', iter: 150000, checkIv: 'aXY=', check: 'Yw==', iv: 'aXY=', data: 'ZA==', u: Date.now() });
    }, [STOR]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seeText(page, 'スケジュール', 20000);
    await goCal(page);
    await pickToday(page); await seeText(page, 'の予定', 8000);
    await page.waitForTimeout(1200);
    const p3 = await panelText(page);
    t('「持ってくる」の案内は出ない', !/持ってくる/.test(p3), p3.slice(0, 400));
    t('ヒントも出ない', !/初めて飼った犬の名前/.test(p3), p3.slice(0, 400));
    t('マイ予定はこれまでどおり出る', /歯医者/.test(p3), p3.slice(0, 400));
    t('古い書庫には触らない（残したまま）', await page.evaluate(k => !!window.__fakeFb.get(k + 'mysec-h7'), STOR));
    t('PC：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    storeJson = await rawStore(page);
    await ctx.close();
  }

  // ── 3. 店の共有の端末に戻すと、マイ予定はどこにも出ない ──
  {
    const { ctx, page, errs } = await openPc(EGAWA, storeJson);
    console.log('\n■ 3. 共有の端末ではマイ予定を出さない');
    await clickText(page, '予定'); await page.waitForTimeout(800);
    const txt = await page.evaluate(() => document.body.innerText);
    t('共有端末：マイ予定（歯医者）が画面に出ない', !/歯医者/.test(txt), txt.slice(0, 300));
    t('共有端末：共有予定（本店会議）は出る', /本店会議/.test(txt));
    await pickToday(page); await seeText(page, 'の予定', 5000);
    t('共有端末：日の画面にもマイ予定は出ない', !/歯医者/.test(await panelText(page)), await panelText(page));
    t('共有端末：持ってくる案内も出さない', !/持ってくる/.test(await panelText(page)));
    t('PC：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ── 4. 別の人（竹林・自分専用）：共有は見える・編集不可、他人のマイは見えない ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(s2 => { localStorage.setItem('__testKind', 'own'); localStorage.setItem(s2 + 'auth-kind', 'own'); }, STOR);
    await ctx.addInitScript(signedInInit, [0, TIKU, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    console.log('\n■ 4. 別の人（竹林）');
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, TIKU.name, 20000); await clickText(page, TIKU.name); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000);
    await goCal(page);
    t('竹林：江川の共有予定がセルに出る', await page.evaluate(() => [...document.querySelectorAll('div')].some(el => el.style && el.style.minHeight === '110px' && el.textContent.includes('本店会議'))));
    t('竹林：江川のマイ予定は画面のどこにも出ない', !(await page.evaluate(() => document.body.innerText)).includes('歯医者'));
    await pickToday(page); await seeText(page, 'の予定', 5000);
    t('竹林：江川の共有予定に名前が付き、編集ボタンが無い', (await page.evaluate(() => document.body.innerText)).includes('江川京志') && !(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText === '編集'))));
    t('竹林：自分のマイスケジュールは空（江川のものは見えない）', !/歯医者/.test(await panelText(page)) && !/前の秘密の用事/.test(await panelText(page)));
    t('竹林：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ── 5. スマホ・江川：自分専用ならマイ予定が出て追加できる／共有なら出ない ──
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(s2 => { localStorage.setItem('__testKind', 'own'); localStorage.setItem(s2 + 'auth-kind', 'own'); }, STOR);
    await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    console.log('\n■ 5. スマホ・自分専用');
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
    await seeText(page, 'カレンダー', 20000);
    t('スマホ：カレンダーの今日に📝の件数が出る', await page.waitForFunction(() => /📝\d/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(() => document.body.innerText.slice(0, 200)));
    await page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, D);
    t('スマホ：日詳細に共有予定が出る', await seeText(page, '本店会議', 8000), await page.evaluate(() => document.body.innerText.slice(-400)));
    t('スマホ：自分専用ならマイ予定も出る', await seeText(page, '歯医者', 8000));
    await clickText(page, '＋ 予定を追加');
    await page.fill('input[placeholder*="件名"]', '美容院');
    await clickText(page, '🙋 マイスケジュール');
    await clickText(page, '追加');
    t('スマホ：マイ予定を足すと myprv に入り、共有には入らない', await page.waitForFunction(k => { const v = window.__fakeFb.get(k + 'myprv-h7') || {}; const p = window.__fakeFb.get(k + 'mysched') || {}; return Object.values(v).some(x => x && x.title === '美容院') && !Object.values(p).some(x => x && x.title === '美容院'); }, STOR, { timeout: 10000 }).then(() => true).catch(() => false) && await seeText(page, '美容院', 5000));
    await page.screenshot({ path: path.join(DIR, 'smoke-mysched-mobile.png') });
    storeJson = await rawStore(page);
    t('スマホ：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ── 6. スマホ・店の共有：マイ予定は出さない ──
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(sj => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', sj); }, storeJson);
    await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
    await routeFakeFb(ctx); await routeGas(ctx);
    const page = await ctx.newPage(); const errs = watch(page);
    console.log('\n■ 6. スマホ・店の共有');
    await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
    await seeText(page, 'カレンダー', 20000);
    await page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, D);
    t('スマホ・共有：共有予定は出る', await seeText(page, '本店会議', 10000));
    const mtxt = await page.evaluate(() => document.body.innerText);
    t('スマホ・共有：マイ予定（歯医者・美容院）は出ない', !/歯医者/.test(mtxt) && !/美容院/.test(mtxt), mtxt.slice(-300));
    t('スマホ・共有：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
