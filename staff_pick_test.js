// 「担当」を押すとスタッフの一覧がポップで出る検査（2026-10-30 ユーザー指示）
//   ねらい：予約を受けた本人が入力できず、ほかのスタッフが代わりに入れる時に選べるようにする。
//   ① 予約カード（PC・スケジュール）… 担当の欄を押すと、表示中の店のスタッフが出る
//   ② 出るのは【今の名簿（{store}-staff-v2）】の人だけ。HTMLに直書きした古い名簿は出さない
//   ③ 三田店の画面に移ると、三田店のスタッフに変わる
//   ④ 番号を打って Enter も今までどおり（今の名簿で引く）
//   ⑤ キーボードで送られてきただけでは開かない（押した時だけ開く）
//   ⑥ 顧客リスト（customers.html）の予約カードでも同じように選べる
//   実行: node staff_pick_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8393, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

const FIX = [2026, 10, 21];
const TODAY = '2026-10-21';

// ★名簿には【HTMLに直書きされていない名前】を入れる。これが出れば「今の名簿を見ている」証拠になる。
//   逆に、直書きの名簿にしか居ない「魚住圭」「芦田昌則」が出たら不合格。
const STAFF_H = [
  { uid: 'h0', name: '見取勇一', myNumber: 0, badge: 'president', store: 'honten' },
  { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
  { uid: 'h21', name: '本店あたらし', myNumber: 21, badge: 'office', store: 'honten' },
  { uid: 'h22', name: '本店ふたり', myNumber: 22, badge: 'mechanic', store: 'honten' },
];
const STAFF_S = [
  { uid: 's31', name: '三田さんいち', myNumber: 31, badge: 'sales', store: 'sanda' },
  { uid: 's32', name: '三田さんに', myNumber: 32, badge: 'mechanic', store: 'sanda' },
];

const CUST = { custId: 'c1', rowIdx: 1, expiry: '2026-11-20', name: 'リスト太郎', no: 1001, carType: 'ヴィッツ',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '' };

const seed = {
  [STOR + 'insp']: {},
  [STOR + 'honten-sched']: {
    [TODAY]: { '09:00': { name: '整備太郎', carType: 'アルト', no: '3503', work: 'Q', content: 'オイル交換', staff: '江川京志' } },
  },
  [STOR + 'sanda-sched']: {
    [TODAY]: { '09:00': { name: '三田次郎', carType: 'ムーヴ', no: '7788', work: 'Q', content: '点検', staff: '三田さんいち' } },
  },
  [STOR + 'honten-staff-v2']: STAFF_H,
  [STOR + 'sanda-staff-v2']: STAFF_S,
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  // 顧客リスト（customers.html）用
  [STOR + 'cf-index']: [{ name: '202611', count: 1 }],
  [STOR + 'cf-202611-index']: { name: '202611', chunks: 1, total: 1 },
  [STOR + 'cf-202611-chunk-0']: [CUST],
  [STOR + 'cust-updates']: [],
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  const closeCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(700);
  };
  const pop = () => page.evaluate(() => {
    const g = document.querySelector('[data-popgrid="staff"]');
    if (!g) return null;
    return { names: [...g.querySelectorAll('[data-staffid]')].map(e => e.innerText.trim()),
             none: !!g.getAttribute('data-staffnone'),
             vScroll: g.scrollHeight > g.clientHeight + 1,
             maxH: getComputedStyle(g).maxHeight };
  });
  const staffVal = () => page.evaluate(() => {
    const i = [...document.querySelectorAll('.booking-modal-inner input')].find(e => e.placeholder === '担当者名 or 番号');
    return i ? i.value : null;
  });
  const clickStaff = async () => {
    await page.evaluate(() => {
      const i = [...document.querySelectorAll('.booking-modal-inner input')].find(e => e.placeholder === '担当者名 or 番号');
      if (i) { i.focus(); i.click(); }
    });
    await page.waitForTimeout(400);
  };

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1600);

  console.log('\n■ ① 予約カードの「担当」を押すと一覧が出る（本店）');
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /整備太郎/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(1100);
  t('予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  t('★開く前は一覧が出ていない', (await pop()) === null);
  await clickStaff();
  let p = await pop();
  t('★押すと一覧が出る', !!p && !p.none, p);
  t('★番号つきで出る（21. 本店あたらし）', !!p && p.names.some(x => /^21\.\s*本店あたらし$/.test(x)), p && p.names);
  t('★中をスクロールさせない', !!p && !p.vScroll && p.maxH === 'none', p);

  console.log('\n■ ② 出るのは「今の名簿」の人だけ');
  t('★本店の人が出る', !!p && p.names.some(x => /本店あたらし/.test(x)) && p.names.some(x => /本店ふたり/.test(x)), p && p.names);
  t('★三田店の人は出さない', !!p && !p.names.some(x => /三田さん/.test(x)), p && p.names);
  t('★HTMLに直書きの古い名簿（魚住圭・芦田昌則）は出さない',
    !!p && !p.names.some(x => /魚住圭|芦田昌則|岡上秀一/.test(x)), p && p.names);
  t('★社長（番号0）は出さない', !!p && !p.names.some(x => /見取勇一/.test(x)), p && p.names);

  console.log('\n■ ③ 選べる／選ぶと閉じる');
  await page.evaluate(() => { const e = document.querySelector('[data-staffid="本店あたらし"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  t('★選ぶと欄に入る', (await staffVal()) === '本店あたらし', await staffVal());
  t('★選ぶと一覧は閉じる', (await pop()) === null);

  console.log('\n■ ④ 番号を打って Enter（今の名簿で引く）');
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('.booking-modal-inner input')].find(e => e.placeholder === '担当者名 or 番号');
    if (i) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, '22'); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); }
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  t('★22 → 本店ふたり（直書きの名簿には居ない番号）', (await staffVal()) === '本店ふたり', await staffVal());

  console.log('\n■ ⑤ キーボードで送られただけでは開かない');
  await closeCard();
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /整備太郎/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('.booking-modal-inner input')].find(e => e.placeholder === '担当者名 or 番号');
    if (i) i.focus();   // ← 押さずに、キーボードで入っただけ
  });
  await page.waitForTimeout(400);
  t('★フォーカスしただけでは出ない', (await pop()) === null);
  await clickStaff();
  t('★押せば出る', (await pop()) !== null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  t('★Esc で閉じる', (await pop()) === null);
  await closeCard();

  console.log('\n■ ⑥ 三田店の画面では三田店のスタッフ');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /三田店/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /三田次郎/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(1100);
  await clickStaff();
  p = await pop();
  t('★三田店のスタッフが出る', !!p && p.names.some(x => /三田さんいち/.test(x)) && p.names.some(x => /三田さんに/.test(x)), p && p.names);
  t('★本店の人は出さない', !!p && !p.names.some(x => /本店あたらし|江川京志/.test(x)), p && p.names);
  await closeCard();

  t('スケジュール：JSエラーなし', errs.length === 0, errs.slice(0, 3));

  // ── ⑦ 顧客リスト（customers.html）の予約カード ──
  console.log('\n■ ⑦ 顧客リストの予約カードでも選べる');
  const cpage = await ctx.newPage();
  const cerrs = []; cpage.on('pageerror', e => cerrs.push(String(e)));
  cpage.on('dialog', async d => { await d.accept().catch(() => {}); });
  await cpage.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const csee = async (s, ms = 25000) => { try { await cpage.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await csee('リスト太郎'));
  await cpage.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /＋予約/.test(e.innerText)); if (b) b.click(); });
  await cpage.waitForTimeout(1500);
  t('予約カードが開く', await cpage.evaluate(() => !!document.querySelector('input[placeholder="担当者名"]')));
  t('★開く前は一覧が出ていない', await cpage.evaluate(() => !document.querySelector('[data-staffpk]')));
  await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); if (i) { i.focus(); i.click(); } });
  await cpage.waitForTimeout(500);
  const cp = await cpage.evaluate(() => {
    const g = document.querySelector('[data-staffpk]');
    if (!g) return null;
    return { names: [...g.querySelectorAll('[data-staffid]')].map(e => e.innerText.trim()), none: !!g.getAttribute('data-staffnone') };
  });
  t('★押すと一覧が出る', !!cp && !cp.none, cp);
  t('★予約カードの店（本店）のスタッフが出る',
    !!cp && cp.names.some(x => /本店あたらし/.test(x)) && !cp.names.some(x => /三田さん/.test(x)), cp && cp.names);
  t('★社長（番号0）は出さない', !!cp && !cp.names.some(x => /見取勇一/.test(x)), cp && cp.names);
  await cpage.evaluate(() => { const e = document.querySelector('[data-staffid="本店ふたり"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await cpage.waitForTimeout(500);
  t('★選ぶと欄に入る', await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); return i ? i.value : null; }).then(v => v === '本店ふたり'),
    await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); return i ? i.value : null; }));
  t('★選ぶと一覧は閉じる', await cpage.evaluate(() => !document.querySelector('[data-staffpk]')));

  // ── ⑧ 店を切り替えると、担当の一覧もその店の人に変わる（2026-10-30 ユーザー指示）──
  //   本店の人が【三田店入庫】の予約を受けることがあり、その時は三田店の担当を入れたい。
  //   それまでは「ログインしている人の店」で固定だったので、三田店の人が出せなかった。
  console.log(String.fromCharCode(10) + '■ ⑧ ★予約カードで店を変えると、担当の一覧もその店になる');
  await cpage.evaluate(() => { const b = document.querySelector('[data-bmstore="sanda"]'); if (b) b.click(); });
  await cpage.waitForTimeout(500);
  t('三田店のボタンが押せた', await cpage.evaluate(() => !!document.querySelector('[data-bmstore="sanda"]')));
  await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); if (i) { i.focus(); i.click(); } });
  await cpage.waitForTimeout(500);
  const cs = await cpage.evaluate(() => {
    const g = document.querySelector('[data-staffpk]');
    if (!g) return null;
    return [...g.querySelectorAll('[data-staffid]')].map(e => e.innerText.trim());
  });
  t('★三田店のスタッフが出る', !!cs && cs.some(x => /三田さんいち/.test(x)) && cs.some(x => /三田さんに/.test(x)), cs);
  t('★本店のスタッフは出さない', !!cs && !cs.some(x => /本店あたらし|本店ふたり/.test(x)), cs);
  await cpage.evaluate(() => { const e = document.querySelector('[data-staffid="三田さんいち"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await cpage.waitForTimeout(400);
  t('★三田店の人を選べる', await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); return i ? i.value : null; }).then(v => v === '三田さんいち'));
  // 本店に戻すと本店の人に戻る
  await cpage.evaluate(() => { const b = document.querySelector('[data-bmstore="honten"]'); if (b) b.click(); });
  await cpage.waitForTimeout(400);
  await cpage.evaluate(() => { const i = document.querySelector('input[placeholder="担当者名"]'); if (i) { i.focus(); i.click(); } });
  await cpage.waitForTimeout(500);
  const ch = await cpage.evaluate(() => {
    const g = document.querySelector('[data-staffpk]');
    return g ? [...g.querySelectorAll('[data-staffid]')].map(e => e.innerText.trim()) : null;
  });
  t('★本店に戻すと本店のスタッフに戻る', !!ch && ch.some(x => /本店あたらし/.test(x)) && !ch.some(x => /三田さん/.test(x)), ch);

  // ── ⑨ 時間は全部が一度に見える（巻物をやめた・2026-10-30 ユーザー指示）──
  console.log(String.fromCharCode(10) + '■ ⑨ ★入庫時間は全部が一度に出る（ドラム式をやめた）');
  await cpage.evaluate(() => { const e = document.querySelector('[data-bmfield="time"]'); if (e) e.click(); });
  await cpage.waitForTimeout(400);
  const tp = await cpage.evaluate(() => {
    const p = document.querySelector('[data-timepop]');
    if (!p) return null;
    const cs = getComputedStyle(p), opts = [...p.querySelectorAll('[data-timeopt]')];
    const last = opts[opts.length - 1];
    const pr = p.getBoundingClientRect(), lr = last.getBoundingClientRect();
    return { n: opts.length, cols: cs.gridTemplateColumns.split(' ').length,
      scroll: p.scrollHeight - p.clientHeight, overflowY: cs.overflowY,
      firstT: opts[0].innerText.trim(), lastT: last.innerText.trim(),
      lastInside: lr.bottom <= pr.bottom + 1 };
  });
  t('時間のポップが開く', !!tp, tp);
  t('★09:00〜18:00 の19個が全部ある', !!tp && tp.n === 19 && tp.firstT === '09:00' && tp.lastT === '18:00', tp);
  t('★4列に並べてある', !!tp && tp.cols === 4, tp && tp.cols);
  t('★★スクロールしなくてよい（巻物になっていない）', !!tp && tp.scroll <= 1, tp && tp.scroll);
  t('★いちばん最後の時間も枠の中に出ている', !!tp && tp.lastInside, tp);
  await cpage.evaluate(() => { const e = document.querySelector('[data-timeopt="18:00"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await cpage.waitForTimeout(400);
  t('★押すと入る', await cpage.evaluate(() => (document.querySelector('[data-bmfield="time"]')||{}).innerText||'').then(v => /18:00/.test(v)));
  t('顧客リスト：JSエラーなし', cerrs.length === 0, cerrs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
