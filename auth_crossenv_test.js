// テスト版と本番で「サインインが分かれている」ことの検査（2026-10-07 ユーザー報告）
//   症状：スマホでテスト版を開いた後、本番もログインし直しになった。
//   原因：テスト版と本番は同じ住所（midorimotor-inc.github.io）でフォルダが違うだけ。
//         Firebase はサインインを「住所＋アプリ名」ごとに保つので、名前が同じだと2つで共有され、
//         テスト版の sign out で本番まで道連れでログアウトされていた。
//   直し：テスト版だけ別のアプリ名（hub-dev）で Firebase に繋ぐ。本番は今までどおり既定の名前。
//   ここで確かめること：
//     ・テスト版は hub-dev、本番は既定の名前で繋ぐ（招待用も環境ごとに別名）
//     ・テスト版の端末を取り消す → テスト版は登録画面に戻るが、**本番はそのまま入れる**
//     ・本番の端末を取り消す → 本番は登録画面に戻るが、**テスト版はそのまま入れる**
//     ・取り消し自体は両方で効く（＝認証は弱まっていない）
//   実行: node auth_crossenv_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8321;
const DEV = 'hub-v8-dev-', MAIN = 'hub-v8-';
const DEV_APP = 'hub-dev', MAIN_APP = '[DEFAULT]';
const UKEY = '__fakeFbUser';                      // 本番（既定の名前）の控え
const UKEY_DEV = '__fakeFbUser-' + DEV_APP;       // テスト版（hub-dev）の控え
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const bodyText = page => page.evaluate(() => document.body.innerText);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa_midori_m_com', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

// 「サーバー」と端末の中身を、テスト版・本番の両方ぶん作っておく（1回だけ）
const ACCT_PW = 'kept-secret-48';   // その人の合言葉の控え（users/{uid}.pw）。引き取りはこれを使う
const seedInit = ([me, dev, main, dk, ukey, ukeyDev, pw]) => {
  window.__fakeFbIsolate = true;   // 偽firebaseにも「サインインをアプリ名ごとに分ける」本物の振る舞いをさせる
  if (localStorage.getItem('__xenvSeeded')) return;
  const kv = (k, v) => ({ k: 'kv/' + k, d: { v: JSON.stringify(v), u: Date.now() } });
  const st = {};
  st['users/' + me.fbuid] = { email: me.email, pw: pw, inviteAt: Date.now() };   // 本人だけが読める合言葉の控え
  st['__acct/' + me.email] = { at: Date.now() };
  st['__pw/' + me.email] = { pw: pw };
  st['meta/allowed'] = {};
  st['meta/allowed'][me.email.replace(/\./g, ',')] = { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' };
  [[dev, 'dev-test'], [main, 'dev-main']].forEach(function (pair) {
    const stor = pair[0], devid = pair[1];
    st['devices/' + devid] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
    const one = {};
    one[dk] = [{ name: '前村', course: 2, staff: me.name, store: 'honten', bookingStatus: 'confirmed', seq: Date.now() - 900000, id: 1, time: '09:00' }];
    [
      kv(stor + 'insp', one),
      kv(stor + 'honten-sched', {}), kv(stor + 'sanda-sched', {}),
      kv(stor + 'honten-memo', {}), kv(stor + 'sanda-memo', {}),
      kv(stor + 'honten-lres', {}), kv(stor + 'honten-rres', {}),
      kv(stor + 'honten-staff-v2', [{ uid: me.uid, name: me.name, myNumber: 7, store: 'honten', loginEmail: me.email, sysUse: true, devPlan: ['own'] }]),
      kv(stor + 'sanda-staff-v2', []), kv(stor + 'cf-index', []),
    ].forEach(function (x) { st[x.k] = x.d; });
    localStorage.setItem(stor + 'auth-devid', devid);
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  });
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  // 両方の環境で、すでにサインインしてある状態から始める
  const u = JSON.stringify({ email: me.email, uid: me.fbuid });
  localStorage.setItem(ukey, u); localStorage.setItem(ukeyDev, u);
  localStorage.setItem('__xenvSeeded', '1');
};

// 本番の画面は、テスト版のファイルの STOR を本番のものに差し替えて作る（port_to_main.js と同じ差し替え）
const asMain = (src) => src.replace(/const STOR ?= ?'hub-v8-dev-';/, (m) => m.replace('hub-v8-dev-', 'hub-v8-'));

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const isMain = p.indexOf('main/') === 0;
    if (isMain) p = p.slice(5);
    if (p.endsWith('.html')) {
      const src = fs.readFileSync(path.join(DIR, p), 'utf8');   // AUTH_REQUIRED は true のまま（本番と同じ）
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(isMain ? asMain(src) : src); return;
    }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const U = p => 'http://localhost:' + PORT + '/' + p;
  const newCtx = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1500, height: 900 } }, opts || {}));
    await ctx.addInitScript(seedInit, [ME, DEV, MAIN, DK, UKEY, UKEY_DEV, ACCT_PW]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript',
      body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    return ctx;
  };
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); });
    page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  // スマホ版は画面の組み立てが後から走るので、Firebase に繋ぐまで少し待つ
  const inits = async (page) => {
    try { await page.waitForFunction(() => (window.__fakeFb && window.__fakeFb.inits() || []).length > 0, null, { timeout: 25000 }); } catch (e) {}
    return page.evaluate(() => window.__fakeFb.inits());
  };
  const lsUser = (page, k) => page.evaluate(x => localStorage.getItem(x), k);

  // ════ ① どの名前で Firebase に繋ぐか ════
  head('① テスト版と本番で Firebase のアプリ名が違う');
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('テスト版（PC）：自動ログインして予定が出る', await seeText(page, '前村'), await bodyText(page).then(x => x.slice(0, 200)));
    t('テスト版（PC）：hub-dev という名前で繋ぐ', JSON.stringify(await inits(page)) === JSON.stringify([DEV_APP]), await inits(page));
    await page.goto(U('main/index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('本番（PC）：自動ログインして予定が出る', await seeText(page, '前村'), await bodyText(page).then(x => x.slice(0, 200)));
    t('本番（PC）：既定の名前で繋ぐ（hub-dev は使わない）', JSON.stringify(await inits(page)) === JSON.stringify([MAIN_APP]), await inits(page));
    await page.goto(U('mobile.html'), { waitUntil: 'domcontentloaded' });
    t('テスト版（スマホ）：hub-dev という名前で繋ぐ', JSON.stringify(await inits(page)) === JSON.stringify([DEV_APP]), await inits(page));
    await page.goto(U('main/mobile.html'), { waitUntil: 'domcontentloaded' });
    t('本番（スマホ）：既定の名前で繋ぐ', JSON.stringify(await inits(page)) === JSON.stringify([MAIN_APP]), await inits(page));
    await page.goto(U('customers.html'), { waitUntil: 'domcontentloaded' });
    t('テスト版（顧客リスト）：hub-dev という名前で繋ぐ', JSON.stringify(await inits(page)) === JSON.stringify([DEV_APP]), await inits(page));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ════ ② テスト版を切っても本番は残る（今回の症状そのもの・スマホ） ════
  head('② テスト版の端末を取り消しても、本番はログインしたまま');
  {
    const ctx = await newCtx({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('main/mobile.html'), { waitUntil: 'domcontentloaded' });
    t('本番（スマホ）：はじめは入れている', await seeText(page, ME.name), await bodyText(page).then(x => x.slice(0, 200)));
    await page.goto(U('mobile.html'), { waitUntil: 'domcontentloaded' });
    t('テスト版（スマホ）：はじめは入れている', await seeText(page, ME.name), await bodyText(page).then(x => x.slice(0, 200)));
    // 管理者がテスト版の端末を取り消す
    await page.evaluate(() => window.__fakeFb.del('dev-test', 'devices'));
    await page.goto(U('mobile.html'), { waitUntil: 'domcontentloaded' });
    t('取り消し：テスト版は登録画面に戻る（取り消しは効く）', await seeText(page, 'メールアドレス'), await bodyText(page).then(x => x.slice(0, 200)));
    t('取り消し：テスト版のサインインだけ消える', (await lsUser(page, UKEY_DEV)) === null, await lsUser(page, UKEY_DEV));
    t('★本番のサインインは残っている（道連れにならない）', !!(await lsUser(page, UKEY)));
    await page.goto(U('main/mobile.html'), { waitUntil: 'domcontentloaded' });
    t('★本番（スマホ）：そのまま入れる（ログインし直しにならない）', await seeText(page, ME.name), await bodyText(page).then(x => x.slice(0, 300)));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ════ ③ 逆向き：本番を切ってもテスト版は残る ════
  head('③ 本番の端末を取り消しても、テスト版はログインしたまま');
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('main/index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('本番（PC）：はじめは入れている', await seeText(page, '前村'));
    await page.evaluate(() => window.__fakeFb.del('dev-main', 'devices'));
    await page.goto(U('main/index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('取り消し：本番は登録画面に戻る（取り消しは効く）', await seeText(page, 'ご自分のメールアドレス'), await bodyText(page).then(x => x.slice(0, 200)));
    t('取り消し：本番のサインインだけ消える', (await lsUser(page, UKEY)) === null, await lsUser(page, UKEY));
    t('★テスト版のサインインは残っている', !!(await lsUser(page, UKEY_DEV)));
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('★テスト版（PC）：そのまま入れる', await seeText(page, '前村'), await bodyText(page).then(x => x.slice(0, 300)));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ════ ④ 招待用の2本目も環境ごとに別名 ════
  head('④ 招待用の2本目も環境ごとに別の名前');
  {
    for (const f of ['index_dev.html', 'mobile.html', 'customers.html']) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      t(f + '：アプリ名は STOR から決める（本番は既定・テスト版は hub-dev）',
        /const HUB_FB_APP_NAME = \(STOR === 'hub-v8-'\) \? '' : 'hub-dev';/.test(src));
      t(f + '：招待用の名前も環境ごとに分かれる',
        /const HUB_FB_INVITE_NAME = 'hub-invite' \+ \(HUB_FB_APP_NAME \? \('-' \+ HUB_FB_APP_NAME\) : ''\);/.test(src));
      t(f + '：本番に移すと既定の名前になる（port_to_main.js の差し替えで確認）',
        /const STOR ?= ?'hub-v8-';/.test(asMain(src)));
    }
  }

  // ════ ⑤ アプリ名を分けた時に「前のサインイン」を引き取る（全員の登録し直しを避ける） ════
  head('⑤ アプリ名を分ける前のサインインを引き取る');
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    const rm = (...keys) => page.evaluate(ks => ks.forEach(k => localStorage.removeItem(k)), keys);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('下準備：テスト版に入れている', await seeText(page, '前村'));
    // (a) アプリ名を分けた直後＝テスト版のサインインだけ無くなった（登録一覧は残っている）
    await rm(UKEY_DEV);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('★(a) 名前を分けてもそのまま入れる（登録し直しが要らない）', await seeText(page, '前村'), await bodyText(page).then(x => x.slice(0, 300)));
    t('(a) テスト版のサインインが作り直されている', !!(await lsUser(page, UKEY_DEV)));
    t('(a) 本番の控えは触っていない', !!(await lsUser(page, UKEY)));
    // (b) 登録一覧まで消えてしまった人（2026-10-07 の江川さんのケース）。台帳に行は残っている
    await rm(UKEY_DEV, DEV + 'auth-mine');
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('★(b) 登録一覧が消えていても引き取って使える（コードは要らない）', await seeText(page, '前村'), await bodyText(page).then(x => x.slice(0, 300)));
    t('(b) 招待コードの入力は出ない', !(await bodyText(page)).includes('招待コード'));
    t('(b) テスト版のサインインが作り直されている', !!(await lsUser(page, UKEY_DEV)));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // (c) 管理者が「取り消し」した端末は引き取らない（＝認証は弱まっていない）
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('下準備：テスト版に入れている', await seeText(page, '前村'));
    await page.evaluate(() => window.__fakeFb.del('dev-test', 'devices'));
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('(c) 取り消しで登録画面に戻る', await seeText(page, 'ご自分のメールアドレス'), await bodyText(page).then(x => x.slice(0, 200)));
    await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
    t('★(c) 開き直しても引き取らず、アドレスとコードを聞く', await seeText(page, 'ご自分のメールアドレス'), await bodyText(page).then(x => x.slice(0, 200)));
    t('(c) サインインも引き取っていない', (await lsUser(page, UKEY_DEV)) === null, await lsUser(page, UKEY_DEV));
    t('(c) 本番の控えは触っていない', !!(await lsUser(page, UKEY)));
    t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ════ ⑥ 引き取りの決まりがコードに入っているか ════
  head('⑥ 引き取りは本番では動かない・合言葉を書き換えない');
  {
    for (const f of ['index_dev.html', 'mobile.html', 'customers.html']) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      const fn = (src.split('const hubAdoptLegacySignIn = async () => {')[1] || '').split(NL + '};')[0];
      t(f + '：引き取りがある', !!fn);
      t(f + '：本番（既定の名前）では何もしない', /if \(!fbAuth \|\| !HUB_FB_APP_NAME\) return false;/.test(fn));
      t(f + '：台帳にこの環境の行が無ければ引き取らない', /d\.env !== STOR/.test(fn));
      t(f + '：合言葉を書き換えない（updatePassword を呼ばない）', fn.indexOf('updatePassword') < 0);
    }
  }

  await browser.close(); server.close();
  console.log(NL + (fail ? '✖ ' + fail + '件 不合格 / ' + pass + '件 合格' : '全' + pass + '件 PASS'));
  process.exit(fail ? 1 : 0);
})();
