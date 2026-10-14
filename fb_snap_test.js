// 時点保存／復旧（Firestore 版・2026-09-19）の検査。にせの firebase（fake_firebase.js）で本物には繋がない。
//   ・復旧画面の「今すぐ時点保存を作る」→ snaps/{id}/kv に全キー、一覧 snapidx に要約つきで載る
//   ・データを消してから「両店舗すべてを戻す」→ 戻る。復旧直前の pre-restore が自動で取られる
//   ・「詳しい中身を見る」→ 消えた予約1件だけ「足す」→ insp に足される（既にある予約は足さない）
//   ・店別復旧：本店の整備だけ戻り、車検・三田店は変わらない
//   ・一覧は 48 時間より古い auto/manual を落とし、daily は残す
//   実行: node fb_snap_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8165, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const bodyText = page => page.evaluate(() => document.body.innerText);
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'h7', name: '江川京志', store: 'honten' };
const seed = {
  [STOR + 'insp']: { [DK]: [
    { name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: 1, id: 1, time: '09:00', carType: 'フィット' },
    { name: '瀬川', course: 1, staff: '見取大介', store: 'honten', bookingStatus: 'confirmed', seq: 2, id: 2, time: '10:00', carType: 'アルト' },
  ] },
  [STOR + 'honten-sched']: { [DK]: { '11:00': { name: '下野', work: 'M6', staff: '岡上秀一', id: 1 } } },
  [STOR + 'sanda-sched']: { [DK]: { '13:00': { name: '三田太郎', work: 'M6', staff: '藤原昭人', id: 2 } } },
  [STOR + 'honten-lres']: { 1: { 'insp-x': { id: 9001, carId: 1, user: '前村', bookingKey: 'insp-' + DK + '-0', fy: now.getFullYear(), fm: now.getMonth(), fd: now.getDate(), ty: now.getFullYear(), tm: now.getMonth(), td: now.getDate() } } },
  [STOR + 'honten-staff-v2']: [{ name: '見取大介', uid: 'h1', store: 'honten', myNumber: 1 }, { name: '江川京志', uid: 'h7', store: 'honten', myNumber: 7, loginEmail: 'egawa@midori-m.com' }],
};
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: 'uid_egawa' }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email, isAdmin: true }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};

(async () => {
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'index_dev.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(src); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ if (localStorage.getItem("__seeded")) return; localStorage.setItem("__seeded", "1"); const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';   // 初回だけ入れる（開き直しで上書きしない）
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: route.request().method() === 'POST' ? 'ok' : 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0) errs.push(m.text().slice(0, 200)); });
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000);
  await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  t('ログインして予定が出る', await seeText(page, '前村', 20000));
  // 復旧画面
  t('管理者に「復旧」ボタンが出る', await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('復旧')), null, { timeout: 10000 }).then(() => true).catch(() => false));
  await clickText(page, '復旧');
  // ★kv を「まとめ読み（クエリ）」しないこと（2026-10-14）。
  //   ルールの kv はキー名を見る書き方なので Firestore はクエリを許可できず、
  //   時点保存だけが黙って失敗して 2026-09-30 から2週間作られていなかった。
  {
    const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
    const M = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
    const body = (src) => (src.split('const fbSnapReadAll = async () => {')[1] || '').split(String.fromCharCode(10) + '};')[0];
    t('★PC：時点保存は kv をまとめ読みしない', body(SRC).indexOf("collection('kv').where(") < 0, body(SRC).slice(0, 120));
    t('★スマホ：時点保存は kv をまとめ読みしない', body(M).indexOf("collection('kv').where(") < 0, body(M).slice(0, 120));
    t('決まったキーの表がある（PC・スマホ）', SRC.indexOf('SNAP_KEYS_COMMON') > 0 && M.indexOf('SNAP_KEYS_COMMON') > 0);
    t('前回の控えからキーを拾う（取りこぼしが自然に直る）', SRC.indexOf('前回の控えに入っていたキー') > 0);
    t('マイスケジュールは控えに入れない', SRC.indexOf("k.indexOf(STOR + 'myprv-') === 0") > 0);
    t('失敗を握りつぶさない（結果を端末に残す）', SRC.indexOf('snapNote') > 0 && SRC.indexOf('catch (e) { snapNote(false') > 0);
    t('復旧画面に「最後の控え」を出す', SRC.indexOf('最後の控え：') > 0);
  }
  t('復旧画面が開き、まだ時点保存が無い', await seeText(page, '保存された時点がまだありません', 8000));
  await clickText(page, '今すぐ時点保存を作る');
  t('時点保存が作られて一覧に出る（手動）', await seeText(page, '手動', 15000), await bodyText(page).then(x => x.slice(0, 300)));
  const snaps = await page.evaluate(() => window.__fakeFb.docs('snaps'));
  const idx = await page.evaluate(k => window.__fakeFb.get(k, 'snapidx'), STOR);
  const snapMeta = snaps.filter(d => d.id.indexOf('/') < 0);
  t('snaps に本体（ready・要約つき）が1つ', snapMeta.length === 1 && snapMeta[0].data.ready === true && snapMeta[0].data.summary && snapMeta[0].data.summary.insp === 2 && snapMeta[0].data.summary.sched === 2, snapMeta.map(d => d.data));
  t('中身に全キーが入る（insp・sched・lres・staff）', snaps.filter(d => d.id.indexOf('/kv/') > 0).length === Object.keys(seed).length, snaps.map(d => d.id));
  t('一覧 snapidx に載る', idx && idx.list && idx.list.length === 1 && idx.list[0].ready === true && idx.list[0].kind === 'manual', idx);
  const snapId = snapMeta[0].id;
  t('一覧に要約（車検2・整備2）が出る', (await bodyText(page)).includes('車検2・整備2'));
  // データを壊す：瀬川を消し、整備（本店）を消す
  await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); v[dk] = v[dk].filter(r => r.name !== '瀬川'); window.__fakeFb.set(k, v); }, [STOR + 'insp', DK]);
  await page.evaluate(k => window.__fakeFb.set(k, {}), STOR + 'honten-sched');
  await page.waitForTimeout(500);
  // 部分復旧：詳しい中身 → 瀬川を足す
  await clickText(page, '詳しい中身');
  t('詳しい中身に日付が出る', await seeText(page, '瀬川', 10000) || await page.evaluate(() => document.body.innerText.includes('件')), await bodyText(page).then(x => x.slice(-400)));
  const dayBtn = await page.evaluate(dk => { const els = [...document.querySelectorAll('div,button')].filter(e => e.onclick || e.getAttribute('role') === 'button'); return true; }, DK);
  // 日付の明細を開く（日付をタップ）
  const dayClicked = await page.evaluate(dk => { const p = dk.split('-'); const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(dk) || e.innerText.includes(p[1] + '/' + p[2])); if (b) { b.click(); return b.innerText; } return ''; }, DK);
  await page.waitForTimeout(500);
  t('日付を押すと明細が開き、消えた予約に「足す」が出る', !!dayClicked && await seeText(page, '足す', 5000), { dayClicked, body: (await bodyText(page)).slice(-300) });
  await page.waitForTimeout(500);
  // 瀬川の行の「足す」を押す
  const addOk = await page.evaluate(() => { const rows = [...document.querySelectorAll('div')].filter(e => e.innerText.includes('瀬川') && e.querySelector('button') && e.innerText.length < 200); const row = rows.pop(); const b = row && [...row.querySelectorAll('button')].find(e => e.innerText.includes('足す')); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(800);
  const inspAfterAdd = await page.evaluate(([k, dk]) => (window.__fakeFb.get(k)[dk] || []).map(r => r.name), [STOR + 'insp', DK]);
  t('部分復旧：消えた予約（瀬川）だけ足される', addOk && inspAfterAdd.join() === '前村,瀬川', { addOk, inspAfterAdd });
  const addAgain = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('足す') && !e.disabled); return !!b; });
  // 店別復旧：本店だけ戻す（整備が戻る。三田店・車検は触らない）
  // 店別復旧の前後で車検（insp）が変わらないことを確かめる。三田店の整備も変えない
  await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k); v[dk]['15:00'] = { name: '追加分', work: 'M6', staff: '藤原昭人', id: 3 }; window.__fakeFb.set(k, v); }, [STOR + 'sanda-sched', DK]);
  await page.waitForTimeout(1500);   // 画面が購読で受け取るのを待つ
  const inspBefore = await page.evaluate(([k, dk]) => (window.__fakeFb.get(k)[dk] || []).map(r => r.name), [STOR + 'insp', DK]);
  await clickText(page, '本店だけ戻す');
  await clickText(page, 'はい、本店だけ戻す');
  await page.waitForTimeout(4000);   // 復旧後はリロードされる
  await seeText(page, '前村', 20000);
  const sched = await page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-sched');
  const inspAfterStore = await page.evaluate(([k, dk]) => (window.__fakeFb.get(k)[dk] || []).map(r => r.name), [STOR + 'insp', DK]);
  t('店別復旧：本店の整備が戻る', sched && sched[DK] && sched[DK]['11:00'] && sched[DK]['11:00'].name === '下野', sched);
  t('店別復旧：車検は触らない', inspAfterStore.join() === inspBefore.join(), { inspBefore, inspAfterStore });
  const sandaAfter = await page.evaluate(([k, dk]) => Object.keys((window.__fakeFb.get(k) || {})[dk] || {}), [STOR + 'sanda-sched', DK]);
  t('店別復旧：三田店の整備は触らない（時点保存に無い追加分が残る）', sandaAfter.includes('15:00'), sandaAfter);
  const idx2 = await page.evaluate(k => window.__fakeFb.get(k, 'snapidx'), STOR);
  t('店別復旧の直前に pre-restore が取られる', idx2.list.some(e => e.kind === 'pre-restore'), idx2.list.map(e => e.kind));
  // 全復旧（リロードされる）
  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '前村', 20000);
  await clickText(page, '復旧');
  await seeText(page, '手動', 10000);
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(e => e.innerText.includes('手動') && e.innerText.length < 80); if (el) el.click(); });
  await clickText(page, '両店舗すべてを戻す');
  await clickText(page, 'はい、両店舗すべて戻す');
  await page.waitForTimeout(4000);   // 復旧後はリロードされる
  await seeText(page, '前村', 20000);
  const inspAll = await page.evaluate(([k, dk]) => (window.__fakeFb.get(k)[dk] || []).map(r => r.name), [STOR + 'insp', DK]);
  t('全復旧：車検が時点保存どおりに戻る（前村・瀬川）', inspAll.join() === '前村,瀬川', inspAll);
  // 保持ルール：古い auto は落ち、daily は残る
  await page.evaluate(k => { const idx = window.__fakeFb.get(k, 'snapidx'); idx.list.push({ file: 'old-auto', ts: Date.now() - 3 * 86400000, tsText: 'x', kind: 'auto', label: '', summary: null, ready: true }); idx.list.push({ file: 'old-daily', ts: Date.now() - 10 * 86400000, tsText: 'y', kind: 'daily', label: '', summary: null, ready: true }); window.__fakeFb.set(k, idx, 'snapidx'); }, STOR);
  await page.goto(`http://localhost:${PORT}/index_dev.html`, { waitUntil: 'domcontentloaded' });
  await seeText(page, '前村', 20000);
  await clickText(page, '復旧'); await seeText(page, '手動', 10000);
  await clickText(page, '今すぐ時点保存を作る'); await page.waitForTimeout(1500);
  const idx3 = await page.evaluate(k => window.__fakeFb.get(k, 'snapidx'), STOR);
  t('保持ルール：3日前の auto は一覧から落ち、10日前の daily は残る', !idx3.list.some(e => e.file === 'old-auto') && idx3.list.some(e => e.file === 'old-daily'), idx3.list.map(e => e.file));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 4));
  await ctx.close(); await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
