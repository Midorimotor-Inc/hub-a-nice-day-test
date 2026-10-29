// スマホの名簿がPCと連動しているかの検査（2026-10-29 ユーザー報告：退職者が残っていた）
//   ・予約カードの「担当」に出るのは【Firestoreの名簿（PCのスタッフ設定）】の人だけ
//   ・静的名簿にしか居ない人（＝古い名前・退職者）は出さない
//   ・社長（番号0）は出さない
//   ・ログイン画面の名前も名簿から
//   ・名簿が読めないとき（電波なし）は【最後に読めた名簿の控え】を使う＝退職者が復活しない
//   実行: node mobile_staff_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8387, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const now = new Date();
const TODAY = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// ★Firestoreの名簿にだけ居る人（新しく入った人）。静的名簿には書いていない
const NEWBIE = '新人さくら';
// ★静的名簿にだけ居る人（古い名前・退職者の立場）。名簿から外したので出てはいけない
const GONE = 'カビン';
// ★控えにだけ居る人（電波なしの検査用）
const CACHED = '控え太郎';

const ROSTER_H = [
  { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
  { uid: 'h6', name: '舟田祥子', myNumber: 6, badge: 'office', store: 'honten' },
  { uid: 'h20', name: NEWBIE, myNumber: 20, badge: 'office', store: 'honten' },
  { uid: 'h0', name: '見取勇一', myNumber: 0, badge: 'president', store: 'honten' },
];
const ROSTER_S = [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'sales', store: 'sanda' }];

const baseSeed = (staffH, staffS) => ({
  [STOR + 'insp']: { [TODAY]: [] },
  [STOR + 'honten-sched']: { [TODAY]: { '10:00': { name: '整備テスト', carType: 'ワゴンR', work: 'Q', content: 'オイル交換', store: 'honten', at: 2, id: 2 } } },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: staffH,
  [STOR + 'sanda-staff-v2']: staffS,
});

// 「担当」の選択肢を読む
const staffOpts = async (page) => {
  await page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find(e => e.innerText.trim() === '担当' && e.offsetParent !== null);
    const b = lab && lab.parentElement && lab.parentElement.querySelector('button');
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const sheet = [...document.querySelectorAll('div')].find(d => d.style && d.style.zIndex === '3150');
    if (!sheet) return null;
    return [...sheet.querySelectorAll('button')].map(b => b.innerText.trim()).filter(x => x && x !== '✕');
  });
};

const makeCtx = async (browser, seed, extraInit) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(([me, stor, cached]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
    if (cached) localStorage.setItem(stor + 'staff-cache', JSON.stringify(cached));
  }, [ME, STOR, extraInit || null]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  return ctx;
};

const toSched = async (page) => {
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const errs = [];

  // ══ ① 名簿が読めるとき ══
  const ctx1 = await makeCtx(browser, baseSeed(ROSTER_H, ROSTER_S));
  const page = await ctx1.newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, ME.name);
  await page.waitForTimeout(2200);   // Firestore の名簿が届くのを待つ

  head('① 読めた名簿を控える（電波なしの備え）');
  const body1 = await page.evaluate(() => document.body.innerText);
  t('★★名簿から外れた人（静的名簿にしか居ない人）は画面に出さない', body1.indexOf(GONE) < 0);
  const cached1 = await page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, STOR + 'staff-cache');
  t('★読めた名簿を控えに残す', !!cached1 && (cached1.h || []).some(x => x && x.name === NEWBIE), cached1 && (cached1.h || []).map(x => x.name));
  t('★控えに静的名簿の人が混ざらない', !!cached1 && !(cached1.h || []).some(x => x && x.name === GONE), cached1 && (cached1.h || []).map(x => x.name));

  await page.evaluate(nm => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(nm) && e.offsetParent !== null); if (b) b.click(); }, ME.name);
  await seeText(page, 'カレンダー');
  await toSched(page);

  head('② 予約カードの「担当」');
  await page.getByText('整備テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('整備の予約カードが開く', await page.evaluate(() => [...document.querySelectorAll('label')].some(e => e.innerText.trim() === '担当' && e.offsetParent !== null)));
  const opts = await staffOpts(page);
  t('担当の選択肢が読めた', Array.isArray(opts) && opts.length > 0, opts);
  t('★名簿に居る人が出る（江川京志）', !!opts && opts.indexOf('江川京志') >= 0, opts);
  t('★名簿に居る新しい人が出る', !!opts && opts.indexOf(NEWBIE) >= 0, opts);
  t('★★名簿から外れた人は出さない（ここが退職者の出どころだった）', !!opts && opts.indexOf(GONE) < 0, opts);
  t('社長（番号0）は出さない', !!opts && opts.indexOf('見取勇一') < 0, opts);
  t('「（なし）」は残す', !!opts && opts.some(x => x.indexOf('（なし）') >= 0), opts);
  t('三田店の人は本店のカードに出さない', !!opts && opts.indexOf('藤原昭人') < 0, opts);
  await ctx1.close();

  // ══ ② 名簿が読めないとき（電波なし）＝控えを使う ══
  head('③ 名簿が読めないとき（控えを使う）');
  const cache = { h: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
                      { uid: 'h21', name: CACHED, myNumber: 21, badge: 'office', store: 'honten' }],
                  s: [], at: Date.now() };
  const ctx2 = await makeCtx(browser, baseSeed([], []), cache);
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errs.push(String(e)));
  await page2.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page2, ME.name);
  await page2.waitForTimeout(1600);
  const login2 = await page2.evaluate(() => document.body.innerText);
  t('★★控えがあるときは静的名簿を使わない（退職者が復活しない）', login2.indexOf(GONE) < 0);
  await page2.evaluate(nm => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(nm) && e.offsetParent !== null); if (b) b.click(); }, ME.name);
  await seeText(page2, 'カレンダー');
  await toSched(page2);
  await page2.getByText('整備テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page2.waitForTimeout(1200);
  const opts2 = await staffOpts(page2);
  t('★担当にも控えの人が出る', !!opts2 && opts2.indexOf(CACHED) >= 0, opts2);
  t('★★担当に静的名簿の人は出さない', !!opts2 && opts2.indexOf(GONE) < 0, opts2);
  await ctx2.close();

  head('④ その他');
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
