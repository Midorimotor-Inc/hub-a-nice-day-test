// 本番ファイル スモークテスト（push前の最終確認）
// 使い方:  node smoke_main.js
//
// ../hub-a-nice-day/index_main.html と customers.html をローカルサーバで起動し、
// 【本番 Firestore の実データ】を読み取り専用で流し込んで全画面を自動巡回（2026-09-18〜）。
//   本物の Firebase には繋がない：サービスアカウント鍵で本番の kv（hub-v8-*）を読み取り、
//   にせの firebase（fake_firebase.js）に入れてブラウザへ渡す。書き込みはにせの中で完結する。
// レンダリングエラー/JSエラーが1件でもあれば FAIL（exit 1）。
//
// ★安全性: GASへのGET（読み取り）だけ本物へ転送。POST（書き込み）は全て遮断して
//   'ok'を返すので、本番データには一切書き込まれない。
//
// なぜ必要か: DEVと本番ではデータの形が違うことがある（例: 本番のrresはオブジェクト
// 構造でDEVは空 → DEVでは絶対に踏めないクラッシュが本番で発生）。本番の実データで
// 全画面を開くことでこの種の事故をpush前に検出する。
//
// 依存: playwright（無ければ `npm i playwright && npx playwright install chromium`）
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) {
  console.error('playwright が見つかりません。次を実行してください:');
  console.error('  npm i playwright && npx playwright install chromium');
  process.exit(1);
}

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const PORT = 8140;
const GAS_HOST = 'https://script.google.com';
const PROD = 'hub-v8-';
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
// 本番 Firestore の kv（hub-v8-* のみ・DEV は除く）を読み取り専用で集める
async function loadProdStore() {
  const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const q = await db.collection('kv').get();
  const store = {};
  q.forEach(d => { if (d.id.indexOf(PROD) === 0 && d.id.indexOf('hub-v8-dev-') !== 0) store['kv/' + d.id] = { v: d.data().v, u: Date.now() }; });
  // サインイン済みの管理者として開く（許可簿・台帳・登録一覧を用意）
  store['meta/allowed'] = { 'egawa@midori-m,com': { email: 'egawa@midori-m.com', name: '江川京志', store: 'honten', uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  store['devices/dev-smoke'] = { env: PROD, e: 'egawa@midori-m.com', n: '江川京志', names: ['江川京志'], s: 'honten', k: 'shared', l: 'スモーク', ua: 'smoke', at: 1, last: Date.now() };
  return store;
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(MAIN_DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(PORT, r));
  console.log('本番 Firestore の実データを読み取り中（読み取り専用）...');
  const prodStore = await loadProdStore();
  console.log('  kv ' + Object.keys(prodStore).filter(k => k.indexOf('kv/') === 0).length + ' 件');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  let gasReads = 0, gasBlockedWrites = 0;
  // Firebase SDK の代わりに、にせの firebase＋本番データを配る（本物の Firestore には一切触れない）
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
  await context.addInitScript(([store, stor]) => {
    if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(store));
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' }));
    localStorage.setItem(stor + 'auth-devid', 'dev-smoke');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }]));
    localStorage.setItem(stor + 'auth-kind', 'shared');
  }, [prodStore, PROD]);
  await context.route(GAS_HOST + '/**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      gasBlockedWrites++; // 書き込みは絶対に通さない
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
      return;
    }
    try { // 読み取りは本物のGASへ転送（実データでテストする）
      const r = await fetch(req.url(), { redirect: 'follow' });
      const body = await r.text();
      gasReads++;
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    } catch (e) {
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
    }
  });
  await context.addInitScript(() => {
    sessionStorage.setItem('hub_currentUser', JSON.stringify({
      uid: 'h1', name: '見取大介', myNumber: 1, id: 1, badge: 'inspector',
      store: { id: 'honten', name: '本店', color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8' },
    }));
  });

  const problems = [];
  const checkPage = async (page, label) => {
    const body = await page.locator('body').innerText().catch(() => '');
    if (body.includes('レンダリングエラー')) problems.push(`${label}: レンダリングエラー表示`);
    if (body.includes('テスト版')) problems.push(`${label}: DEVバッジ残骸`);
  };

  // ── index_main.html: 全ビュー巡回 ──
  const page = await context.newPage();
  page.on('pageerror', e => problems.push('JSエラー: ' + String(e).slice(0, 140)));
  page.on('dialog', async d => { problems.push('予期しないダイアログ: ' + d.message().slice(0, 80)); await d.dismiss().catch(() => {}); });
  console.log('index_main.html を起動中（本番実データ・読み取り専用）...');
  await page.goto(`http://127.0.0.1:${PORT}/index_main.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);
  await checkPage(page, '起動直後');
  // ★車両管理はナビから外れ、ダッシュボードのタイルになった（2026-10-29）。この下で別に開く。
  for (const view of ['カレンダー', 'スケジュール', '代車管理', '検索']) {
    try {
      // 代車管理など特殊ビューに遷移した後もナビを確実に押せるよう evaluate でクリック
      const ok = await page.evaluate((v) => {
        const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes(v) && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 16);
        if (b) { b.scrollIntoView(); b.click(); return true; } return false;
      }, view);
      if (!ok) throw new Error('ナビボタンが見つからない');
      await page.waitForTimeout(3500);
      await checkPage(page, view);
      console.log(`  ✔ ${view}`);
    } catch (e) { problems.push(`${view}: 画面を開けない (${String(e).slice(0, 60)})`); }
  }
  // ── ダッシュボードと車両管理 ──
  //   ★車両管理はナビから外れ、ダッシュボードのタイルになった（2026-10-29）。
  //     ダッシュボードのナビは【別タブ】を開く作りなので、この検査では ?dash=1 を
  //     別ページとして開く（同じことが起きる。開いた瞬間からダッシュボードが出る）。
  try {
    const dash = await context.newPage();
    dash.on('pageerror', e => problems.push('JSエラー(ダッシュボード): ' + String(e).slice(0, 140)));
    await dash.goto(`http://127.0.0.1:${PORT}/index_main.html?dash=1`, { waitUntil: 'domcontentloaded' });
    await dash.waitForTimeout(15000);
    const opened = await dash.evaluate(() => !!document.querySelector('[data-dash]'));
    if (!opened) throw new Error('ダッシュボードが開かない');
    await checkPage(dash, 'ダッシュボード');
    console.log('  ✔ ダッシュボード');
    const tileOk = await dash.evaluate(() => {
      const el = document.querySelector('[data-dashtile="vehicle"]');
      if (el) { el.scrollIntoView(); el.click(); return true; } return false;
    });
    if (!tileOk) throw new Error('車両管理のタイルが見つからない');
    await dash.waitForTimeout(4000);
    await checkPage(dash, '車両管理');
    console.log('  ✔ 車両管理');
    await dash.close();
  } catch (e) { problems.push('車両管理: 画面を開けない (' + String(e).slice(0, 60) + ')'); }

  // ── 週間カレンダー（v3.8x の目玉。ナビから開く全画面の表）──
  try {
    await page.keyboard.press('Escape');            // 検索などのオーバーレイを閉じる
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('週間カレンダー') && el.offsetParent !== null);
      if (b) b.click();
    });
    await page.waitForTimeout(3500);
    const wk = await page.evaluate(() => ({
      open: !!document.querySelector('[data-wfold]') || !!document.querySelector('[data-wclose]'),
      days: document.querySelectorAll('[data-wadd]').length,
    }));
    if (!wk.open) throw new Error('週の表が出ない');
    await checkPage(page, '週間カレンダー');
    console.log('  ✔ 週間カレンダー');
    await page.evaluate(() => { const b = document.querySelector('[data-wclose]'); if (b) b.click(); });
    await page.waitForTimeout(1200);
  } catch (e) { problems.push('週間カレンダー: 画面を開けない (' + String(e).slice(0, 60) + ')'); }

  // 三田店ビューも一巡（店舗切替はスケジュール画面に戻ってから）
  try {
    await page.keyboard.press('Escape'); // 空き枠検索等のオーバーレイを閉じる
    await page.waitForTimeout(800);
    const navOk = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button,div')].find(b => b.textContent.trim().endsWith('スケジュール') && b.offsetParent !== null && b.textContent.length < 12);
      if (el) { el.click(); return true; } return false;
    });
    if (!navOk) throw new Error('スケジュールナビが見つからない');
    await page.waitForTimeout(2500);
    const clicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button,div')].find(b => b.textContent.trim() === '三田店' && b.offsetParent !== null);
      if (el) { el.click(); return true; } return false;
    });
    if (!clicked) throw new Error('三田店ボタンが見つからない');
    await page.waitForTimeout(2500);
    await checkPage(page, '三田店ビュー');
    console.log('  ✔ 三田店切替');
  } catch (e) { problems.push('三田店切替: ' + String(e).slice(0, 60)); }
  await page.screenshot({ path: path.join(__dirname, 'smoke-main-last.png') });
  await page.close();

  // ── customers.html ──
  const page2 = await context.newPage();
  page2.on('pageerror', e => problems.push('customers JSエラー: ' + String(e).slice(0, 140)));
  console.log('customers.html を起動中...');
  await page2.goto(`http://127.0.0.1:${PORT}/customers.html`, { waitUntil: 'domcontentloaded' });
  // 顧客ファイルのGAS読込は時に30秒超かかる（index_main巡回直後はGASスロットリングで特に遅い）。
  // 固定待機だと遅延で誤検知するためポーリング（最大44秒）。
  // 顧客ファイルが0件のときは「Excelファイルをインポートしてください」が出るのが正常な空状態。
  // （会社アカウント移行での初期化直後がこれ。データ有無どちらでも描画できていればOKとする）
  const CUST_LOADED = '総件数';
  const CUST_EMPTY = 'Excelファイルをインポートしてください';
  let custBody = '';
  for (let i = 0; i < 22; i++) {
    await page2.waitForTimeout(2000);
    custBody = await page2.locator('body').innerText().catch(() => '');
    if (custBody.includes(CUST_LOADED) || custBody.includes(CUST_EMPTY)) break;
  }
  await checkPage(page2, '顧客リスト');
  if (custBody.includes(CUST_LOADED)) console.log('  ✔ 顧客リスト表示');
  else if (custBody.includes(CUST_EMPTY)) console.log('  ✔ 顧客リスト表示（顧客ファイル0件・インポート案内）');
  else { problems.push('顧客リスト: 画面が表示されていない'); console.log('  [debug] custBody len=' + custBody.length + ' first120="' + custBody.slice(0, 120).replace(/\n/g, ' ') + '"'); }
  await page2.close();

  // ── mobile.html: ログイン→3タブ巡回 ──
  // ログインコードは本番スタッフリスト（読み取りのみ）から実在のmyNumberを取得して使う
  try {
    const mobileSrc = fs.readFileSync(path.join(MAIN_DIR, 'mobile.html'), 'utf8');
    const gasUrl = (mobileSrc.match(/const GAS_URL='([^']+)'/) || [])[1];
    const gasKey = (mobileSrc.match(/const GAS_API_KEY='([^']+)'/) || [])[1];
    let loginCode = '1'; // フォールバック（DEFAULT_STAFF先頭）
    try {
      const r = await fetch(`${gasUrl}?key=${encodeURIComponent('hub-v8-honten-staff-v2')}&apiKey=${encodeURIComponent(gasKey)}`, { redirect: 'follow' });
      const staff = JSON.parse(await r.text());
      const first = (Array.isArray(staff) ? staff : []).find(s => s && s.name && s.myNumber != null);
      if (first) loginCode = String(first.myNumber);
    } catch (e) { console.log('  (スタッフリスト取得失敗→コード1でログイン試行)'); }
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // スマホも同じ「にせの firebase＋本番データ」で開く（サインイン済み・登録済みの状態）
    await mctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    await mctx.addInitScript(([store, stor]) => {
      if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(store));
      localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' }));
      localStorage.setItem(stor + 'auth-devid', 'dev-smoke');
      localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }]));
      localStorage.setItem(stor + 'auth-kind', 'shared');
    }, [prodStore, PROD]);
    await mctx.route(GAS_HOST + '/**', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        gasBlockedWrites++;
        await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' });
        return;
      }
      try {
        const r = await fetch(req.url(), { redirect: 'follow' });
        const body = await r.text();
        gasReads++;
        await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body });
      } catch (e) {
        await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
      }
    });
    const page3 = await mctx.newPage();
    page3.on('pageerror', e => problems.push('mobile JSエラー: ' + String(e).slice(0, 140)));
    page3.on('dialog', async d => { problems.push('mobile 予期しないダイアログ: ' + d.message().slice(0, 80)); await d.dismiss().catch(() => {}); });
    console.log('mobile.html を起動中（本番実データ・読み取り専用）...');
    await page3.goto(`http://127.0.0.1:${PORT}/mobile.html`, { waitUntil: 'domcontentloaded' });
    await page3.waitForTimeout(8000); // Babel変換＋スタッフリスト読込
    // v2.33 から番号入力は無く、名前を選ぶ（共有端末のログイン）。移行期間は全員が並ぶ
    const picked = await page3.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(el => /江川京志/.test(el.textContent));   // 登録済みの人だけ並ぶ（2026-09-18〜）
      if (b) { b.click(); return true; } return false;
    });
    if (!picked) problems.push('mobile: ログイン画面に名前が並ばない');
    await page3.waitForTimeout(12000); // ログイン演出8秒＋フェード＋初回fetchAll
    const mBody = await page3.locator('body').innerText().catch(() => '');
    if (mBody.includes('レンダリングエラー')) problems.push('mobile 起動直後: レンダリングエラー表示');
    if (mBody.includes('誰が操作しますか')) problems.push('mobile: ログインできていない');
    for (const tab of ['カレンダー', 'スケジュール', '代車', '休日']) {
      const ok = await page3.evaluate((t) => {
        // タブはbuttonではなく onClick付きdiv。最深のラベルdivをクリックすればReactイベントがバブルする
        const target = [...document.querySelectorAll('div')].filter(el => el.textContent.includes(t) && el.textContent.replace(/\s/g, '').length < 10).pop();
        if (target) { target.click(); return true; } return false;
      }, tab);
      if (!ok) { problems.push(`mobile ${tab}: タブが見つからない`); continue; }
      await page3.waitForTimeout(2500);
      const b = await page3.locator('body').innerText().catch(() => '');
      if (b.includes('レンダリングエラー')) problems.push(`mobile ${tab}: レンダリングエラー表示`);
      else console.log(`  ✔ mobile ${tab}`);
    }
    await page3.screenshot({ path: path.join(__dirname, 'smoke-main-mobile.png') });
    await mctx.close();
  } catch (e) { problems.push('mobile: スモーク実行失敗 ' + String(e).slice(0, 120)); }

  await browser.close(); server.close();
  console.log(`\nGAS読み取り ${gasReads}件 / 遮断した書き込み ${gasBlockedWrites}件（本番データへの書き込みゼロ）`);
  if (problems.length) {
    console.error('\n★FAIL — push しないでください:');
    problems.forEach(p => console.error('  ✖ ' + p));
    process.exit(1);
  }
  console.log('★PASS — 全画面エラーなし。本番リポジトリで commit & push してOKです。');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
