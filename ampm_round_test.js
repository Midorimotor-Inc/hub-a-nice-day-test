// 2026-11-02 ユーザー決定の2つを見張る検査
//   ① 午前と午後の区切り＝【二重線だけ】（帯も文字も入れない）
//      ・週間カレンダー … 午前入庫の枠の【下】に1本
//      ・1日表示　　　 … 午後入庫の枠の【上】に1本（並びが 午前入庫→09:00〜12:00→時間未定→午後入庫→13:00 のため）
//      ★どちらも1本だけ。何本も出さない。
//   ② 代車・レンタカーの帯の角を 5px 丸める
//      ★表は border-collapse なので td の角丸は効かない。帯の色は中に敷いた箱で塗っている。
//        始まりのセル＝左の角だけ／終わりのセル＝右の角だけ／途中＝角丸なし。
//   実行: node ampm_round_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8427, STOR = 'hub-v8-dev-';
const WANT_R = '5px';            // 角の丸み（ユーザー決定）
const WANT_LINE = 'double';      // 区切りは二重線
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
const dk = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const T0 = d(0), F1 = d(0), T1 = d(3), FR = d(0), TR = d(2);

const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [dk(T0)]: { '09:00': { name: '相原', carType: 'タント', work: 'Q', content: 'オイル交換', id: 1, at: 1, store: 'honten' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [],
    [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': { r1: { id: 1001, user: '辻井　博', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074' } },
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
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.waitForTimeout(800);

  // ── ① 1日表示（タイムスケジュール） ───────────────────────────────
  head('① 1日表示：午後入庫の枠の【上】に二重線が1本');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const day = await page.evaluate(() => {
    const seps = [...document.querySelectorAll('tr[data-ampmsep]')];
    if (!seps.length) return { n: 0 };
    const td = seps[0].querySelector('td');
    const s = getComputedStyle(td);
    // 区切りのすぐ下の行の時間欄の文字（＝午後入庫のはず）
    const next = seps[0].nextElementSibling;
    const prev = seps[0].previousElementSibling;
    const txt = e => (e && e.querySelector('td') ? e.querySelector('td').innerText.replace(/\s/g, '') : '');
    return { n: seps.length, style: s.borderBottomStyle, w: s.borderBottomWidth, below: txt(next), above: txt(prev) };
  });
  t('区切りの行が1本だけある', day.n === 1, day);
  t('★二重線になっている', day.style === WANT_LINE, day);
  t('★太さは 4px', day.w === '4px', day);
  t('★すぐ下が「午後入庫」', /午後入庫/.test(day.below || ''), day);
  t('★すぐ上は午後入庫ではない（線が午後入庫の上にある）', !/午後入庫/.test(day.above || ''), day);

  // ★畳んでいる時は出さない（空き枠が消えるので線だけが浮いて残る）
  await clickText(page, '畳む');
  await page.waitForTimeout(700);
  t('★畳んでいる時は区切りを出さない', await page.evaluate(() => document.querySelectorAll('tr[data-ampmsep]').length === 0));
  await clickText(page, '開く');
  await page.waitForTimeout(700);
  t('★開き直すとまた出る', await page.evaluate(() => document.querySelectorAll('tr[data-ampmsep]').length === 1));

  // ── ② 週間カレンダー ──────────────────────────────────────────
  head('② 週間カレンダー：午前入庫の枠の【下】に二重線');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').includes('週間カレンダー')); if (b) b.click(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.querySelector('[data-wfold]'); if (b) b.click(); });   // 畳んであるので広げる
  await page.waitForTimeout(900);
  const wk = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')];
    const nameOf = r => { const c = r.querySelector('td'); return c ? c.innerText.replace(/\s/g, '') : ''; };
    const dbl = r => [...r.querySelectorAll('td')].filter(c => getComputedStyle(c).borderBottomStyle === 'double').length;
    const out = { am: null, others: [] };
    rows.forEach(r => {
      // 1日表示の区切りの行（data-ampmsep）は下の画面のものなので数えない
      if (r.hasAttribute('data-ampmsep')) return;
      const nm = nameOf(r), n = dbl(r), tds = r.querySelectorAll('td').length;
      if (!tds) return;
      if (nm === '午前入庫') out.am = { n: n, tds: tds, w: getComputedStyle(r.querySelector('td')).borderBottomWidth };
      else if (n > 0) out.others.push({ nm: nm, n: n });
    });
    return out;
  });
  t('午前入庫の行が見つかる', !!wk.am, wk);
  t('★午前入庫の行は すべての枠に二重線が付く', !!wk.am && wk.am.n === wk.am.tds, wk.am);
  t('★太さは 4px', !!wk.am && wk.am.w === '4px', wk.am);
  // 出勤の行（STAFF_UNDER）だけは元から二重線。それ以外に増やしていないこと
  t('★二重線は「出勤」と「午前入庫」だけ', wk.others.every(x => x.nm === '出勤'), wk.others);
  await page.evaluate(() => { const b = document.querySelector('[data-wclose]'); if (b) b.click(); });
  await page.waitForTimeout(700);

  // ── ③ 代車・レンタカーの帯の角 ───────────────────────────────
  head('③ 代車・レンタカーの帯の角を 5px 丸める');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, '代車管理', 8000));

  const bars = await page.evaluate(() => {
    // 帯の本体＝セルの中に敷いた箱（position:absolute で、つかむ所より下に敷いてある）
    const out = [];
    document.querySelectorAll('td').forEach(td => {
      const box = [...td.children].find(c => {
        const s = getComputedStyle(c);
        return c.tagName === 'DIV' && s.position === 'absolute' && s.zIndex === '0';
      });
      if (!box) return;
      const s = getComputedStyle(box);
      out.push({
        tl: s.borderTopLeftRadius, bl: s.borderBottomLeftRadius,
        tr: s.borderTopRightRadius, br: s.borderBottomRightRadius,
        start: !!td.querySelector('[data-rsgrip="start"]'), end: !!td.querySelector('[data-rsgrip="end"]'),
        tdbg: getComputedStyle(td).backgroundColor, boxbg: s.backgroundColor
      });
    });
    return out;
  });
  t('帯の本体（中に敷いた箱）がある', bars.length > 0, bars.length);
  const starts = bars.filter(b => b.start), ends = bars.filter(b => b.end);
  const mids = bars.filter(b => !b.start && !b.end);
  t('★始まりの枠は 左の角だけ 5px', starts.length > 0 && starts.every(b => b.tl === WANT_R && b.bl === WANT_R), starts);
  t('★終わりの枠は 右の角だけ 5px', ends.length > 0 && ends.every(b => b.tr === WANT_R && b.br === WANT_R), ends);
  t('★途中の枠は角を丸めない', mids.length === 0 || mids.every(b => b.tl === '0px' && b.tr === '0px'), mids);
  t('★セル自体の背景は塗らない（角丸が効かないため）',
    bars.every(b => b.tdbg === 'rgba(0, 0, 0, 0)' || b.tdbg === 'transparent'), bars.map(b => b.tdbg));
  t('★帯の色は箱の方に付いている', bars.every(b => b.boxbg && b.boxbg !== 'rgba(0, 0, 0, 0)'), bars.map(b => b.boxbg));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
