// 予約カードから開いた代車ピッカーでは、レンタカーの表も【代車の表と同じ左寄せ】にする
//   （2026-11-12 ユーザー指示）
//   ユーザーの言葉：「予約を取るときは、未来の方に日数を見ないとダメなので左端に寄せてほしい。
//   台車管理の方で確認するときは、結構過去の方に目を向けることがあるので、そういうふうにしました」
//   ① 代車管理（ふつうに開いた時）… レンタカーは【本日が右から7列目】＝過去を広く出す（今までどおり）
//   ② 予約カードの「選択」から開いた時（pickMode）… レンタカーも【本日が左から4列目】＝代車の表と同じ
//   ★レンタカーの表の座標は th[data-rdaynum] で取ること（代車の data-ldaynum を流用すると別の日をつかむ）
//   実行: node rent_pick_left_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8467, STOR = 'hub-v8-dev-';
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
const dkey = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const num = (o) => o.y * 10000 + (o.m + 1) * 100 + o.d;

const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];
const TODAY = d(0);

// 2つの表の「本日の列」の位置を測る（代車＝data-ldaynum／レンタカー＝data-rdaynum）
const measure = (page, n) => page.evaluate(x => {
  const grab = (attr) => {
    const th = [...document.querySelectorAll('th[' + attr + ']')];
    if (!th.length) return null;
    const sc = th[0].closest('table').parentElement;
    const box = sc.getBoundingClientRect();
    const me = th.find(e => e.getAttribute(attr) === String(x));
    if (!me) return null;
    const mb = me.getBoundingClientRect();
    const after = th.filter(e => { const b = e.getBoundingClientRect(); return b.x > mb.x + 1 && b.right <= box.right + 1; }).length;
    const idx = th.indexOf(me);                       // 表の中で何列目か（0から）
    const want4 = Math.max(0, (idx - 3) * 44);         // 「本日が左から4列目」になる scrollLeft
    return { left: Math.round(sc.scrollLeft), after: after, idx: idx, want4: want4 };
  };
  return { loaner: grab('data-ldaynum'), rental: grab('data-rdaynum') };
}, n);

(async () => {
  const seed = {};
  seed[STOR + 'insp'] = (function () { const o = {}; o[dkey(TODAY)] = [{ name: '辻井　博', carType: 'アルト', no: '1234', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1 }]; return o; })();
  seed[STOR + 'honten-sched'] = {}; seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-memo'] = {}; seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-cars'] = CARS; seed[STOR + 'sanda-cars'] = [];
  seed[STOR + 'rentalcars'] = RCARS;
  seed[STOR + 'honten-lres'] = {}; seed[STOR + 'sanda-lres'] = {}; seed[STOR + 'rres'] = {};

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
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(700);

  // ── ① 代車管理（ふつうに開いた時） ──
  head('① 代車管理：レンタカーは【本日が右から7列目】（今までどおり）');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, '代車管理', 8000));
  const m1 = await measure(page, num(TODAY));
  t('どちらの表でも本日の列が見つかる', !!(m1.loaner && m1.rental), m1);
  t('★レンタカーの方が過去を広く出す（代車の表より左寄り）',
    !!(m1.loaner && m1.rental) && m1.rental.left < m1.loaner.left, m1);
  t('★本日より右に見える日数は、代車の表より少ない',
    !!(m1.loaner && m1.rental) && m1.rental.after < m1.loaner.after, m1);
  t('★本日より右は7日ぶんまで', !!m1.rental && (m1.rental.after <= 7 || m1.rental.left === 0), m1.rental);
  t('代車の表は本日が左から4列目（scrollLeft=(列-3)×44）',
    !!m1.loaner && m1.loaner.left === m1.loaner.want4, m1.loaner);

  await clickText(page, 'スケジュールに戻る');
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1600);

  // ── ② 予約カードから開いた時（pickMode） ──
  head('② 予約カードの代車ピッカー：レンタカーも【本日が左から4列目】');
  await page.getByText('辻井', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1300);
  t('予約カードが開いた', await page.evaluate(() => /予約カード|来店者氏名/.test(document.body.innerText)));
  const went = await clickText(page, '選択');
  await page.waitForTimeout(1800);
  t('代車ピッカーが開いた（「予約カードに戻る」が出る）', !!went && await seeText(page, '予約カードに戻る', 8000));
  const m2 = await measure(page, num(TODAY));
  t('どちらの表でも本日の列が見つかる', !!(m2.loaner && m2.rental), m2);
  t('★レンタカーの表も代車の表と同じ位置（左寄せ）',
    !!(m2.loaner && m2.rental) && m2.rental.left === m2.loaner.left, m2);
  t('★レンタカーも本日が左から4列目（scrollLeft=(列-3)×44）',
    !!m2.rental && m2.rental.left === m2.rental.want4, m2.rental);
  t('★右から7列目ではない（未来が7日より多く見える）',
    !!m2.rental && m2.rental.after > 7, m2.rental);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
