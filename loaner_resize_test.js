// 代車管理：帯の端をつかんで横に引っぱると、貸出期間が変わること（2026-10-30 ユーザー要望）
//   それまでは【代車管理の編集モーダルを開く】か【予約カードで一度消して取り直す】しかなかった。
//   ① 右の端＝返却日。右へ引っぱると のび、左へ引っぱると 縮む
//   ② ★もう貸し出しが始まっている予約でも、返却日は変えられる（延長は日常的に起きる）
//   ③ 左の端＝貸出日。まだ始まっていない予約だけ。始まっていたら断る
//   ④ ほかの予約と重なる所までは伸ばせない（何も書き込まない）
//   ⑤ 1日より短くはならない
//   ⑥ 伸ばしたあと、予約の中身（氏名・bookingKey・限定）は消えない
//   ⑦ レンタカーの表でも同じことができる
//   実行: node loaner_resize_test.js
//        SHOT=<保存先.png> node loaner_resize_test.js  … その時の見た目を撮る
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8407, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

const N = new Date();
const d = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const num = (o) => o.y * 10000 + (o.m + 1) * 100 + o.d;

// 「これから貸す」辻井さん：+5 〜 +7。右に +10 まで空きがある（+11 から別の予約）
const F1 = d(5), T1 = d(7);
// 同じ車の次の予約（+11 〜 +12）。ここより先へは伸ばせない
const F9 = d(11), T9 = d(12);
// 「もう貸出中」の大山さん：-2 〜 +1（別の車）。返却日は変えられるが、貸出日は動かせない
const F2 = d(-2), T2 = d(1);
// レンタカー：+5 〜 +6
const FR = d(5), TR = d(6);

const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];

(async () => {
  const bk1 = 'insp-' + dk(F1) + '-0';
  const seed = {
    [STOR + 'insp']: {
      [dk(F1)]: [{ name: '辻井　博', carType: 'アルト', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'ハスラー (7074)', loanerId: 1 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [],
    [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': {
        r1: { id: 1001, user: '辻井　博', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk1, locked: true },
        r9: { id: 1009, user: '先約　さん', fy: F9.y, fm: F9.m, fd: F9.d, ty: T9.y, tm: T9.m, td: T9.d, carName: 'ハスラー', carNum: '7074' },
      },
      '2': {
        r2: { id: 1002, user: '大山　明', fy: F2.y, fm: F2.m, fd: F2.d, ty: T2.y, tm: T2.m, td: T2.d, carName: 'スペーシア', carNum: '8967' },
      },
    },
    [STOR + 'sanda-lres']: {},
    [STOR + 'rres']: {
      '101': { q1: { id: 2001, user: '貸出　太郎', fy: FR.y, fm: FR.m, fd: FR.d, ty: TR.y, tm: TR.m, td: TR.d, carName: 'ノマド', carNum: '3101' } },
    },
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept(); });

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, '代車管理', 8000));

  // ── 道具 ──────────────────────────────────────────
  // つかむ所（帯の端）の真ん中の座標
  const gripAt = (resId, side) => page.evaluate(([id, sd]) => {
    const g = document.querySelector('[data-rsgrip="' + sd + '"][data-rsres="' + id + '"]');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, [resId, side]);
  // その車の行の「この日」のセルの真ん中の座標（日付の見出しの位置から探す）
  const dayX = (dnum) => page.evaluate(n => {
    const th = [...document.querySelectorAll('th')].find(e => e.getAttribute('data-ldaynum') === String(n));
    if (!th) return null;
    const r = th.getBoundingClientRect();
    return Math.round(r.x + r.width / 2);
  }, dnum);
  const pull = async (from, toX) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + (toX > from.x ? 6 : -6), from.y, { steps: 2 });
    await page.mouse.move(toX, from.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(2200);
  };
  const lres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-lres');
  const rres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'rres');
  const recOf = (obj, car, id) => Object.values((obj && obj[car]) || {}).find(r => r && r.id === id);
  const endNum = r => r ? (r.ty * 10000 + (r.tm + 1) * 100 + r.td) : null;
  const startNum = r => r ? (r.fy * 10000 + (r.fm + 1) * 100 + r.fd) : null;

  head('① つかむ所がある');
  const g1 = await gripAt(1001, 'end');
  const g1s = await gripAt(1001, 'start');
  t('★返却日の端（右）につかむ所がある', !!g1, g1);
  t('★貸出日の端（左）にもつかむ所がある', !!g1s, g1s);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  t('★つかむ所は ew-resize のカーソル', await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-rsgrip="end"]')).cursor === 'ew-resize'));

  head('② 右へ引っぱると返却日がのびる');
  const x10 = await dayX(num(d(10)));
  t('＋10日の列が見つかる（検査の前提）', x10 != null, x10);
  await pull(g1, x10);
  let r1 = recOf(await lres(), '1', 1001);
  t('★返却日が ＋10日 になった', endNum(r1) === num(d(10)), { now: endNum(r1), want: num(d(10)) });
  t('★貸出日は動いていない', startNum(r1) === num(F1), { now: startNum(r1), want: num(F1) });
  t('★氏名は消えていない', !!r1 && r1.user === '辻井　博', r1 && r1.user);
  t('★予約とのつながり（bookingKey）も残っている', !!r1 && r1.bookingKey === bk1, r1 && r1.bookingKey);
  t('★🔒限定の印も残っている', !!r1 && r1.locked === true, r1 && r1.locked);

  head('③ 左へ引っぱると縮む');
  const g2 = await gripAt(1001, 'end');
  const x8 = await dayX(num(d(8)));
  t('引っぱり直せる（つかむ所が ＋10日に移っている）', !!g2, g2);
  await pull(g2, x8);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日が ＋8日 に縮んだ', endNum(r1) === num(d(8)), { now: endNum(r1), want: num(d(8)) });

  head('④ ★ほかの予約と重なる所までは伸ばせない');
  alerts.length = 0;
  const g3 = await gripAt(1001, 'end');
  const x12 = await dayX(num(d(12)));          // ＋11〜＋12 は先約さん
  await pull(g3, x12);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日は変わっていない（＋8日のまま）', endNum(r1) === num(d(8)), { now: endNum(r1) });
  t('★「重なります」と知らせる', alerts.some(a => /重なり/.test(a)), alerts);
  t('★先約さんの予約は壊していない', endNum(recOf(await lres(), '1', 1009)) === num(T9));

  head('⑤ ★1日より短くはならない');
  const g4 = await gripAt(1001, 'end');
  const x3 = await dayX(num(d(3)));            // 貸出日（＋5）より前へ引っぱる
  await pull(g4, x3);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日は貸出日より前にならない', endNum(r1) >= startNum(r1), { s: startNum(r1), e: endNum(r1) });
  t('★貸出日はそのまま', startNum(r1) === num(F1), startNum(r1));

  head('⑥ 貸出日（左の端）も動かせる');
  const g5 = await gripAt(1001, 'start');
  const x4 = await dayX(num(d(4)));
  await pull(g5, x4);
  r1 = recOf(await lres(), '1', 1001);
  t('★貸出日が ＋4日 になった', startNum(r1) === num(d(4)), { now: startNum(r1), want: num(d(4)) });

  head('⑦ ★もう貸出中の予約：返却日は変えられる／貸出日は動かせない');
  // 大山さん（スペーシア・-2 〜 +1）
  const g6 = await gripAt(1002, 'end');
  const x3b = await dayX(num(d(3)));
  t('貸出中の予約にもつかむ所がある', !!g6, g6);
  await pull(g6, x3b);
  let r2 = recOf(await lres(), '2', 1002);
  t('★★貸出中でも返却日はのばせる（＋3日）', endNum(r2) === num(d(3)), { now: endNum(r2), want: num(d(3)) });
  alerts.length = 0;
  const g7 = await gripAt(1002, 'start');
  const x0 = await dayX(num(d(0)));
  await pull(g7, x0);
  r2 = recOf(await lres(), '2', 1002);
  t('★貸出日は動かない', startNum(r2) === num(F2), { now: startNum(r2), want: num(F2) });
  t('★「もう貸し出しが始まっている」と知らせる', alerts.some(a => /始まって/.test(a)), alerts);

  head('⑧ レンタカーの表でも同じようにできる');
  const g8 = await gripAt(2001, 'end');
  const x8r = await dayX(num(d(8)));
  t('レンタカーの帯にもつかむ所がある', !!g8, g8);
  await pull(g8, x8r);
  const q1 = recOf(await rres(), '101', 2001);
  t('★レンタカーの返却日も変えられる', endNum(q1) === num(d(8)), { now: endNum(q1), want: num(d(8)) });
  t('★氏名は消えていない', !!q1 && q1.user === '貸出　太郎', q1 && q1.user);

  head('⑨ 伸ばした直後に中身のパネルを出さない');
  t('★「✎ 編集」のパネルが開いていない', await page.evaluate(() => document.body.innerText.indexOf('✎ 編集') < 0));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
