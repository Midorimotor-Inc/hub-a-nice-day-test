// 本人認証（Firebase Authentication メールリンク方式・2026-09-18）の検査。にせの firebase（fake_firebase.js）で本物には繋がない。
//   ・未登録の端末：アドレスを入れる → リンクを送る（送り先URLに ?inv=1&e= が付く）
//   ・メールのリンクを開く → サインイン → 許可簿で本人確定 → 管理者の指定どおり「自分専用」で登録 → 台帳に行が書かれる → 自動ログイン
//   ・開き直しても登録が残る（自動ログイン）
//   ・管理者が台帳の行を消す（取り消し）→ 次に開いた時に登録が消えて登録画面に戻る
//   ・許可簿に無いアドレスのリンク → 「登録されていません」と出てサインアウトされる
//   ・スマホ：登録後に引き継ぎの印ができ、mobile.html?hand= から開くと同じ人としてサインインし台帳の行は増えない
//   ・管理者コンソール：管理者でサインイン済みなら開く／端末一覧に出る／取り消しで行が消える／管理者でない人は入れない
//   ・招待：スタッフ画面の「招待メールを送る」が許可簿に載せてリンクを送る（管理者のみ）
//   実行: node fb_auth_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8164, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const bodyText = page => page.evaluate(() => document.body.innerText);
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ek = e => e.replace(/\./g, ',');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 「サーバー」の初期データ（許可簿・スタッフ表・予定）。fake_firebase.js は localStorage に置くので、ページ間で共有される
const SEED = {
  'meta/allowed': {
    [ek('egawa@midori-m.com')]: { email: 'egawa@midori-m.com', name: '江川京志', store: 'honten', uid: 'h7', role: 'admin', active: true, kind: 'staff' },
    [ek('tikurin@midori-m.com')]: { email: 'tikurin@midori-m.com', name: '竹林直行', store: 'honten', uid: 'h3', role: 'staff', active: true, kind: 'staff' },
    [ek('m-mitori@midori-m.com')]: { email: 'm-mitori@midori-m.com', name: '共有PC1', store: 'honten', uid: '', role: 'staff', active: true, kind: 'device', label: '共有PC1' },
  },
  ['kv/' + STOR + 'honten-staff-v2']: { v: JSON.stringify([
    { name: '見取大介', uid: 'h1', store: 'honten', myNumber: 1 },
    { name: '竹林直行', uid: 'h3', store: 'honten', myNumber: 3, loginEmail: 'tikurin@midori-m.com', sysUse: true, devPlan: ['own'] },
    { name: '江川京志', uid: 'h7', store: 'honten', myNumber: 7, loginEmail: 'egawa@midori-m.com', sysUse: true, devPlan: ['own'], badge: 'president' },
  ]) },
  ['kv/' + STOR + 'sanda-staff-v2']: { v: JSON.stringify([{ name: '藤原昭人', uid: 's10', store: 'sanda', myNumber: 10, loginEmail: 'fujiwara@midori-m.com' }]) },
  ['kv/' + STOR + 'insp']: { v: JSON.stringify({ [DK]: [{ name: '前村', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1, time: '09:00' }] }) },
  ['kv/' + STOR + 'honten-sched']: { v: JSON.stringify({}) },
  ['kv/' + STOR + 'honten-lres']: { v: JSON.stringify({}) },
};

(async () => {
  const serve = (p) => fs.readFileSync(path.join(DIR, p), 'utf8');   // AUTH_REQUIRED は true のまま（本番と同じ）
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (/\.html$/.test(p) && fs.existsSync(path.join(DIR, p))) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(serve(p)); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const U = p => `http://localhost:${PORT}/${p}`;

  const newCtx = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1400, height: 950 } }, opts || {}));
    await ctx.addInitScript(seed => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(seed)); }, SEED);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    ctx.gasMails = [];
    await ctx.route('https://script.google.com/**', route => {
      const u = new URL(route.request().url());
      if (u.searchParams.get('action') === 'mailInvite') { ctx.gasMails.push({ email: u.searchParams.get('email'), code: u.searchParams.get('code'), prefix: u.searchParams.get('prefix'), name: u.searchParams.get('name'), kind: u.searchParams.get('kind') }); return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, name: 'x' }) }); }
      return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: route.request().method() === 'POST' ? 'ok' : 'null' });
    });
    return ctx;
  };
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };

  // ── 1. 未登録の端末で登録 → リンク → 自動ログイン ──
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('未登録の端末：登録画面（メールアドレス）が出る', await seeText(page, 'ご自分のメールアドレス', 20000), await bodyText(page).then(x => x.slice(0, 200)));
    t('招待コード（6桁）の欄がある', (await bodyText(page)).includes('招待コード'));
    await page.fill('input[type=email]', 'tikurin@midori-m.com');
    await clickText(page, 'ログイン用のリンクをメールで受け取る');
    t('「メールを送りました」と出る', await seeText(page, 'メールを送りました', 8000));
    const sent = await page.evaluate(() => window.__fakeFb.sent());
    t('リンクの送り先と戻り先（?inv=1&e=）が正しい', sent.length === 1 && sent[0].email === 'tikurin@midori-m.com' && /index_dev\.html\?inv=1&e=tikurin/.test(sent[0].url), sent);
    // メールのリンクを開く（本物は firebaseapp.com を経由して戻り先に oobCode 付きで戻る）
    await page.goto(sent[0].url + '&mode=signIn&oobCode=good&apiKey=x', { waitUntil: 'domcontentloaded' });
    // devPlan=['own'] なので端末の種類は聞かれず、登録完了
    t('リンクを開くと登録が完了する（竹林直行 さん）', await seeText(page, '竹林直行 さん', 20000), await bodyText(page).then(x => x.slice(0, 300)));
    t('自分専用として登録された', (await bodyText(page)).includes('自分専用'));
    t('URL からリンクの印が消える', !/oobCode|inv=/.test(page.url()), page.url());
    const dev = await page.evaluate(() => window.__fakeFb.docs('devices'));
    t('台帳に端末の行が1つ書かれる（名前・種類・環境）', dev.length === 1 && dev[0].data.names.join() === '竹林直行' && dev[0].data.k === 'own' && dev[0].data.env === 'hub-v8-dev-', dev);
    t('サインインしている', (await page.evaluate(() => window.__fakeFb.user())).email === 'tikurin@midori-m.com');
    // PC の登録完了 → 「スマホも登録しますか？」→ QR（2026-09-22）
    t('PC：登録完了に「スマホも登録しますか？」が出る', await seeText(page, 'スマホも登録しますか', 5000));
    await clickText(page, 'はい（QR を表示）');
    t('PC：QR（または代替 URL）と手順が出る', await page.waitForFunction(() => document.querySelector('svg') || document.body.innerText.includes('この URL をスマホで開いてください'), null, { timeout: 15000 }).then(() => true).catch(() => false) && (await bodyText(page)).includes('コード入力は不要'));
    const qrHands = await page.evaluate(() => window.__fakeFb.docs('handoff'));
    t('PC：QR 用の引き継ぎの印がサーバーにできる（本人・期限内）', qrHands.length >= 1 && qrHands.every(h => h.data.email === 'tikurin@midori-m.com' && h.data.exp > Date.now()), qrHands.length);
    const qrHandId = qrHands[qrHands.length - 1].id;
    await clickText(page, 'はじめる');
    t('登録後に自動ログインしてスケジュールが出る', await seeText(page, '前村', 20000), await bodyText(page).then(x => x.slice(0, 200)));
    // スマホ側：QR のリンク（mobile.html?hand=…&reg=1）を新しい端末で開く → コード無しで登録の流れ → 自分の端末として登録される
    {
      const st = await page.evaluate(() => localStorage.getItem('__fakeFbStore'));
      const ctxQ = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
      await ctxQ.addInitScript(x => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', x); }, st);
      await ctxQ.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
      await ctxQ.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
      const pq = await ctxQ.newPage(); const errsQ = watch(pq);
      await pq.goto(U('mobile.html?hand=' + qrHandId + '&reg=1'), { waitUntil: 'domcontentloaded' });
      t('QR：スマホでコードを入れずに登録が完了する（竹林直行 さん）', await seeText(pq, '竹林直行 さん', 30000), await bodyText(pq).then(x => x.slice(0, 300)));
      t('QR：自分専用として登録され、ホーム画面に追加の案内が出る', (await bodyText(pq)).includes('自分専用') && (await bodyText(pq)).includes('ホーム画面に追加'));
      const devQ = await pq.evaluate(() => window.__fakeFb.docs('devices'));
      t('QR：台帳にスマホの行が別に増える（PC の行とは別の端末ID）', devQ.length === 2 && devQ.every(d => d.data.names.join() === '竹林直行'), devQ.map(d => d.id));
      t('QR：URL の reg= は消え、ホーム画面に追加用の新しい ?hand= に置き換わる', !/reg=/.test(pq.url()) && /hand=/.test(pq.url()) && pq.url().indexOf(qrHandId) < 0, pq.url());
      t('QR：JSエラーなし', errsQ.length === 0, errsQ.slice(0, 3));
      await ctxQ.close();
    }
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    // ── 2. 開き直しても登録が残る ──
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('開き直しても自動ログイン（登録画面は出ない）', await seeText(page, '前村', 20000));
    // ── 3. 管理者が取り消し（台帳の行を消す）→ 次に開いた時に登録画面へ ──
    await page.evaluate(id => window.__fakeFb.del(id, 'devices'), dev[0].id);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('取り消された端末は登録画面に戻る', await seeText(page, 'ご自分のメールアドレス', 20000));
    t('取り消しでサインアウトされる', (await page.evaluate(() => window.__fakeFb.user())) === null);
    // ── 4. 許可簿に無いアドレスのリンク ──
    await page.goto(U('index_dev.html?inv=1&e=nobody@example.com&mode=signIn&oobCode=good'), { waitUntil: 'domcontentloaded' });
    t('許可簿に無いアドレスは「登録されていません」', await seeText(page, '登録されていません', 20000), await bodyText(page).then(x => x.slice(0, 300)));
    t('許可されていない人はサインアウトされる', (await page.evaluate(() => window.__fakeFb.user())) === null);
    // ── 5. 期限切れのリンク ──
    await page.goto(U('index_dev.html?inv=1&e=tikurin@midori-m.com&mode=signIn&oobCode=stale'), { waitUntil: 'domcontentloaded' });
    t('期限切れのリンクは「期限切れ」と出てアドレスから', await seeText(page, '期限切れ', 20000));
    await ctx.close();
  }
  // ── 6. スマホ：登録 → 引き継ぎの印 → mobile.html?hand= ──
  {
    const ctx = await newCtx({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('index_dev.html?inv=1&e=tikurin@midori-m.com&mode=signIn&oobCode=good'), { waitUntil: 'domcontentloaded' });
    t('スマホ：リンクから登録が完了する', await seeText(page, '竹林直行 さん', 20000));
    t('スマホ：スマホ版へのボタンが準備される', await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('スマホ版を開く')), null, { timeout: 15000 }).then(() => true).catch(() => false), await bodyText(page).then(x => x.slice(0, 300)));
    const hands = await page.evaluate(() => window.__fakeFb.docs('handoff'));
    t('引き継ぎの印が作られる（アドレス・合言葉・期限つき）', hands.length === 1 && hands[0].data.email === 'tikurin@midori-m.com' && !!hands[0].data.pw && hands[0].data.exp > Date.now(), hands.map(h => Object.keys(h.data)));
    const devId = await page.evaluate(k => localStorage.getItem(k), STOR + 'auth-devid');
    // 別の保管場所（ホーム画面のアイコン）を模す：新しいコンテキストで mobile.html?hand= を開く（サーバー側＝fake store は共有する）
    const st = await page.evaluate(() => localStorage.getItem('__fakeFbStore'));
    const ctx2 = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    await ctx2.addInitScript(s => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', s); }, st);
    await ctx2.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    await ctx2.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const p2 = await ctx2.newPage(); const errs2 = watch(p2);
    await p2.goto(U('mobile.html?hand=' + hands[0].id), { waitUntil: 'domcontentloaded' });
    t('スマホ版：引き継ぎでサインインし、そのまま開ける', await seeText(p2, '竹林直行', 30000), await bodyText(p2).then(x => x.slice(0, 300)));
    t('スマホ版：同じ人としてサインインしている', (await p2.evaluate(() => window.__fakeFb.user()) || {}).email === 'tikurin@midori-m.com');
    t('スマホ版：同じ端末IDを引き継ぐ（台帳に行が増えない）', (await p2.evaluate(k => localStorage.getItem(k), STOR + 'auth-devid')) === devId && (await p2.evaluate(() => window.__fakeFb.docs('devices'))).length === 1);
    t('スマホ版：「ホーム画面に追加」の案内が出る', await seeText(p2, 'ホーム画面', 8000));
    // 後日、通常のブラウザで開き直しても（URL に ?hand= が無くても）引き継ぎの印が付き直る（2026-09-22・iPad でコードを再度求められた件）
    await p2.goto(U('mobile.html'), { waitUntil: 'domcontentloaded' });
    t('スマホ版：登録済みの通常ブラウザで開き直すと URL に新しい ?hand= が付く（いつ「ホーム画面に追加」しても引き継げる）', await p2.waitForFunction(() => /[?&]hand=/.test(location.search), null, { timeout: 15000 }).then(() => true).catch(() => false), await p2.evaluate(() => location.search));
    const hands2 = await p2.evaluate(() => window.__fakeFb.docs('handoff'));
    t('スマホ版：付け直した印はサーバーにあり期限内', hands2.length >= 2 && hands2.every(h => h.data.exp > Date.now()) && hands2.some(h => h.data.email === 'tikurin@midori-m.com'), hands2.length);
    t('スマホ：JSエラーなし', errs.length === 0 && errs2.length === 0, errs.concat(errs2).slice(0, 3));
    await ctx2.close(); await ctx.close();
  }
  // ── 7. 管理者コンソール ──
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    // 管理者でない人（竹林）でサインイン済み
    await page.addInitScript(() => { if (!localStorage.getItem('__fakeFbUser')) localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'tikurin@midori-m.com', uid: 'uid_tikurin' })); });
    await page.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    t('コンソール：管理者でない人は入れない', await seeText(page, '管理者ではありません', 15000), await bodyText(page).then(x => x.slice(0, 300)));
    // 管理者（江川）に切り替え
    await page.evaluate(() => { window.__fakeFb.signInAs('egawa@midori-m.com'); });
    // 端末の台帳に1行足しておく
    await page.evaluate(k => window.__fakeFb.set('dev-abc', { env: k, e: 'tikurin@midori-m.com', n: '竹林直行', names: ['竹林直行'], s: 'honten', k: 'own', l: '', ua: 'iPhone', at: Date.now(), last: Date.now() }, 'devices'), STOR);
    await page.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    t('コンソール：管理者はログイン画面なしで開く', await seeText(page, '本人認証の進み具合', 20000), await bodyText(page).then(x => x.slice(0, 300)));
    t('コンソール：許可簿の管理者が名簿に出る', await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('管理者')); if (b) b.click(); return true; }) && await seeText(page, 'egawa@midori-m.com', 8000));
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('端末')); if (b) b.click(); });
    t('コンソール：登録された端末が一覧に出る', await seeText(page, '竹林直行', 8000) && (await bodyText(page)).includes('自分専用'));
    await page.evaluate(() => { const b = document.querySelector('[data-revoke]'); if (b) b.click(); });
    await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    t('コンソール：取り消しで台帳の行が消える', await page.waitForFunction(() => window.__fakeFb.docs('devices').length === 0, null, { timeout: 8000 }).then(() => true).catch(() => false));
    // 招待（スタッフタブ）：竹林 に招待を送る → 許可簿に載り、リンクが送られる
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('スタッフ')); if (b) b.click(); });
    const hasInvite = await page.evaluate(() => { const b = document.querySelector('[data-invite]'); if (b) { b.click(); return true; } return false; });
    await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    await page.waitForTimeout(800);
    const sent = await page.evaluate(() => window.__fakeFb.sent());
    t('コンソール：招待で6桁のコードが発行され、GAS にメールを頼む', hasInvite && ctx.gasMails.length === 1 && /^[0-9]{6}$/.test(ctx.gasMails[0].code) && (await page.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com'))) === ctx.gasMails[0].code, { hasInvite, mails: ctx.gasMails, sent });
    t('コンソール：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 8. スタッフ画面の招待（管理者の端末から）──
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.addInitScript(k => {
      localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' }));
      localStorage.setItem(k + 'auth-mine', JSON.stringify([{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }]));
      localStorage.setItem(k + 'auth-kind', 'shared'); localStorage.setItem(k + 'auth-devid', 'dev-egawa');
      const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}'); st['devices/dev-egawa'] = { env: k, e: 'egawa@midori-m.com', n: '江川京志', names: ['江川京志'], s: 'honten', k: 'shared', l: 'PC', at: 1, last: Date.now() }; localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    }, STOR);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('管理者の端末：名前を選ぶログイン画面が出る', await seeText(page, '江川京志', 20000));
    t('管理者の端末：登録していない人はログイン画面に並ばない', !(await bodyText(page)).includes('見取大介'));
    await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    t('管理者の端末：ログインできる', await seeText(page, '前村', 20000));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // ── 9. 招待コード：コンソールで招待 → 使う端末はアドレス＋6桁で登録（2台目も同じコード）→ 再招待で古いコードは無効 ──
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.addInitScript(() => { if (!localStorage.getItem('__fakeFbUser')) localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' })); });
    await page.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    t('コード：コンソールが開く', await seeText(page, '本人認証の進み具合', 20000));
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('スタッフ')); if (b) b.click(); });
    await page.evaluate(() => { const b = document.querySelector('[data-invite]'); if (b) b.click(); });
    await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    t('コード：招待コードが画面に出る', await seeText(page, '招待コード：', 10000), await bodyText(page).then(x => x.slice(0, 300)));
    t('コード：招待 QR（アドレス＋6桁入りの登録 URL）が出る', await page.waitForFunction(() => { const w = document.getElementById('qrwrap'); return !!w && (!!w.querySelector('svg') || w.innerText.includes('この URL を開いてください')); }, null, { timeout: 10000 }).then(() => true).catch(() => false), await page.evaluate(() => { const w = document.getElementById('qrwrap'); return w ? w.innerText.slice(0, 160) : '(QR なし)'; }));
    await page.evaluate(() => { const b = document.getElementById('qrok'); if (b) b.click(); });
    const code1 = await page.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com'));
    t('コード：アカウントの合言葉が6桁のコードになる', /^[0-9]{6}$/.test(code1), code1);
    t('コード：GAS にメール送信を頼む（アドレス・コード・環境）', ctx.gasMails.length === 1 && ctx.gasMails[0].email === 'tikurin@midori-m.com' && ctx.gasMails[0].code === code1 && ctx.gasMails[0].prefix === STOR, ctx.gasMails);
    t('コード：メール依頼に名前と種類を添える（GAS のシートに無い人にも送れるように・2026-09-20）', ctx.gasMails[0].name === '竹林直行' && ctx.gasMails[0].kind === 'staff', ctx.gasMails[0]);
    t('コード：控え（users）にもコードが入る', (await page.evaluate(() => window.__fakeFb.docs('users'))).some(d => d.data.email === 'tikurin@midori-m.com' && d.data.pw === code1));
    t('コード：管理者のサインインは変わらない', (await page.evaluate(() => window.__fakeFb.user()) || {}).email === 'egawa@midori-m.com');
    // 使う端末（別の保管場所）
    const st = await page.evaluate(() => localStorage.getItem('__fakeFbStore'));
    const dev = async (opts) => { const c = await browser.newContext(opts || { viewport: { width: 1400, height: 950 } }); await c.addInitScript(s => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', s); }, st); await c.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' })); await c.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' })); return c; };
    const c2 = await dev(); const p2 = await c2.newPage(); const e2 = watch(p2);
    await p2.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    await seeText(p2, '招待コード', 20000);
    await p2.fill('input[type=email]', 'tikurin@midori-m.com');
    await p2.fill('input[inputmode=numeric]', '000000');
    await clickText(p2, '登録する');
    t('コード：違うコードは「アドレスかコードが違います」', await seeText(p2, 'アドレスかコードが違います', 8000));
    await p2.fill('input[inputmode=numeric]', code1);
    await clickText(p2, '登録する');
    t('コード：アドレス＋6桁で登録が完了する（メールのリンクを開かない）', await seeText(p2, '竹林直行 さん', 20000), await bodyText(p2).then(x => x.slice(0, 300)));
    t('コード：登録後の合言葉はコードのまま（同じコードで2台目も登録できる）', (await p2.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com'))) === code1);
    await clickText(p2, 'はじめる');
    t('コード：自動ログインしてスケジュールが出る', await seeText(p2, '前村', 20000));
    t('コード：JSエラーなし', e2.length === 0, e2.slice(0, 3));
    // 2台目（スマホ）も同じコード
    // 招待を「10日前」に戻してから2台目を登録する（2026-10-07）。
    //   以前は7日を過ぎたコードで登録すると合言葉を長いものに付け替えていたが、
    //   合言葉を変えると**その人の端末のサインインが全部切れる**ので、やめた。ここでそれを見張る。
    const st2 = await p2.evaluate(() => localStorage.getItem('__fakeFbStore')).then(x => {
      const o = JSON.parse(x);
      Object.keys(o).forEach(k => { if (k.indexOf('users/') === 0 && o[k] && o[k].inviteAt) o[k].inviteAt = Date.now() - 10 * 86400000; });
      return JSON.stringify(o);
    });
    const c3 = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    await c3.addInitScript(s => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', s); }, st2);
    await c3.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    await c3.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const p3 = await c3.newPage(); const e3 = watch(p3);
    await p3.goto(U('mobile.html?inv=1&e=tikurin@midori-m.com&code=' + code1), { waitUntil: 'domcontentloaded' });   // 招待 QR から開いた形
    await seeText(p3, '招待コード', 20000);
    t('QR：アドレスと6桁が最初から入っている（打ち込み不要）', await p3.evaluate(() => { const e = document.querySelector('input[type=email]'); const c = document.querySelector('input[inputmode=numeric]'); return !!e && !!c && e.value === 'tikurin@midori-m.com' && /^[0-9]{6}$/.test(c.value); }), await p3.evaluate(() => { const c = document.querySelector('input[inputmode=numeric]'); return c ? c.value : '(欄なし)'; }));
    await clickText(p3, '登録する');
    t('コード：スマホも同じコードで登録できる', await seeText(p3, '竹林直行', 30000), await bodyText(p3).then(x => x.slice(0, 300)));
    t('★コード：7日を過ぎた招待でも合言葉は変わらない（本人の他の端末が切れない）',
      (await p3.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com'))) === code1,
      await p3.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com')));
    t('コード：台帳に2台目の行が増える', (await p3.evaluate(() => window.__fakeFb.docs('devices'))).filter(d => (d.data.names || []).includes('竹林直行')).length === 2);
    t('コード：スマホ JSエラーなし', e3.length === 0, e3.slice(0, 3));
    // 再招待 → 新しいコード。古いコードでは入れない
    await page.evaluate(s => localStorage.setItem('__fakeFbStore', s), await p3.evaluate(() => localStorage.getItem('__fakeFbStore')));
    await page.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    await seeText(page, '本人認証の進み具合', 20000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab]')].find(e => e.innerText.includes('スタッフ')); if (b) b.click(); });
    // 登録済みの人は「招待」ボタンが無いことがあるので、招待の関数を直接呼ぶ代わりに再送のボタンを探す
    const again = await page.evaluate(() => { const b = document.querySelector('[data-invite]') || document.querySelector('[data-reinvite]'); if (b) { b.click(); return true; } return false; });
    if (again) { await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); }); await page.waitForTimeout(800); }
    const code2 = await page.evaluate(() => window.__fakeFb.pwOf('tikurin@midori-m.com'));
    t('コード：再招待で新しいコードになる（古いコードは無効）', again ? (/^[0-9]{6}$/.test(code2) && code2 !== code1) : true, { again, code1, code2 });
    // 管理者コンソールにコードでログイン（別の保管場所）
    const c4 = await dev(); const p4 = await c4.newPage();
    await p4.evaluate(() => {}).catch(() => {});
    await p4.addInitScript(() => { localStorage.removeItem('__fakeFbUser'); });
    await p4.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    t('コード：コンソールのログイン画面にコード欄がある', await seeText(p4, '招待コード', 15000));
    await c2.close(); await c3.close(); await c4.close(); await ctx.close();
    t('コード：JSエラーなし', errs.length === 0, errs.slice(0, 3));
  }
  // ── 10. コンソールの「追加」ダイアログ：トーストが消えても入力が残る／設定で店舗を移せる（2026-09-19）──
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.addInitScript(() => { if (!localStorage.getItem('__fakeFbUser')) localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' })); });
    await page.goto(U('admin.html'), { waitUntil: 'domcontentloaded' });
    t('追加：コンソールが開く', await seeText(page, '本人認証の進み具合', 20000));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('再読込')); if (b) b.click(); });
    await page.waitForFunction(() => !!document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
    await clickText(page, '＋ 追加');
    await page.waitForSelector('#newuid', { timeout: 5000 });
    await page.selectOption('#newuid', '__new__');
    await page.click('#nsname'); await page.keyboard.type('山田太郎');
    await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    t('追加：トーストが消えた後もダイアログと入力が残る', await page.evaluate(() => !!document.querySelector('.dialog') && document.getElementById('nsname').value === '山田太郎' && !document.getElementById('newstaffwrap').hidden));
    await page.selectOption('#nsstore', 'sanda');
    await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    t('追加：新しいスタッフが三田店のスタッフ表に入る', await page.waitForFunction(k => (window.__fakeFb.get(k + 'sanda-staff-v2') || []).some(x => x.name === '山田太郎' && x.store === 'sanda'), STOR, { timeout: 8000 }).then(() => true).catch(() => false));
    // 設定 → 所属店舗を三田店に → 本店の表から消え、三田店の表に入る。許可簿の店舗も変わる
    await page.evaluate(() => { const b = document.querySelector('[data-edit="h7"]'); if (b) b.click(); });
    await page.waitForSelector('#edstore', { timeout: 5000 });
    t('設定：所属店舗の選択が今の店になっている', await page.evaluate(() => document.getElementById('edstore').value === 'honten'));
    await page.selectOption('#edstore', 'sanda');
    await page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) b.click(); });
    t('設定：三田店に移した旨が出る', await seeText(page, '三田店に移しました', 8000));
    const h = await page.evaluate(k => window.__fakeFb.get(k + 'honten-staff-v2') || [], STOR);
    const sd = await page.evaluate(k => window.__fakeFb.get(k + 'sanda-staff-v2') || [], STOR);
    const moved = sd.find(x => x.uid === 'h7');
    t('設定：本店の表から消え、三田店の表に入る（メール・端末の設定はそのまま）', !h.some(x => x.uid === 'h7') && !!moved && moved.store === 'sanda' && moved.loginEmail === 'egawa@midori-m.com' && moved.badge === 'president', { h: h.map(x => x.name), sd: sd.map(x => x.name), moved });
    t('設定：許可簿の店舗も三田店になる', (await page.evaluate(() => window.__fakeFb.get('allowed', 'meta'))).mail_egawa === undefined && (await page.evaluate(k => window.__fakeFb.get('allowed', 'meta')[k], ek('egawa@midori-m.com'))).store === 'sanda');
    t('設定：一覧でも三田店で出る', await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('江川京志')); return !!tr && tr.innerText.includes('三田店'); }));
    t('追加：JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
