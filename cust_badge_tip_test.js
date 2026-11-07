// 顧客リストの入庫日カレンダーで、車検のバッジ（マ・ク・レ）をなぞると
// その予約の【入庫時間】が出ること（2026-11-07 ユーザー依頼）
//
//   なぜ要るか：マッハ車検は入庫から1時間、一般整備の入庫制限になる。
//   リストから予約を入れる時に「その日のマッハが何時なのか」が分からないと、
//   どの時間に入れてよいか判断できなかった。バッジは今まで色と1文字だけだった。
//
//   実行: node cust_badge_tip_test.js
//        SHOT=<保存先.png> node cust_badge_tip_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8445, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 7];
const CUST = { custId: 'F__1__なぞり太郎', rowIdx: 1, expiry: '2027-01-28', name: 'なぞり太郎', no: 7777, carType: 'ワゴンＲ',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '' };
const row = (name, course, time, carType, no) => ({ name, course, time, carType, no, staff: '', phone: '', address: '',
  loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null, tokuten: '②', note: '', bookingStatus: 'confirmed',
  entryDate: '', deliveryDate: '', deliveryTime: '', store: 'honten' });

const seed = {
  // 満了月（2027年1月）に 3件。マッハ 10:00／クイック 14:00／レギュラー 時間未定
  [STOR + 'insp']: {
    '2027-1-20': [row('まはち一郎', 1, '10:00', 'ハスラー', 1234), row('くいっく二郎', 2, '14:00', 'アルト', 5678), row('れぎゅら三郎', 3, '', 'スイフト', 9012)],
  },
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: 1 }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: 1 },
  [STOR + 'cf-202701-chunk-0']: [CUST],
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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('なぞり太郎'));

  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /＋予約/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /カレンダーを開く/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(700);
  t('入庫日のカレンダーが開く（満了月）', (await page.evaluate(() => { const m = document.querySelector('[data-custmon]'); return m && m.getAttribute('data-custmon'); })) === '2027-01');

  console.log('\n■ バッジが3つ出る（マ・ク・レ）');
  const badges = await page.evaluate(() => [...document.querySelectorAll('[data-custbadge^="2027-01-20/"]')]
    .map(e => ({ k: e.getAttribute('data-custbadge'), tm: e.getAttribute('data-custbtime'), label: e.innerText.trim() })));
  t('20日のマスに車検のバッジが3つ', badges.length === 3, badges);
  t('★並びは マ → ク → レ（コース順）', badges.map(b => b.label).join('') === 'マクレ', badges.map(b => b.label));
  t('★バッジが入庫時間を持っている', badges.map(b => b.tm).join('/') === '10:00/14:00/', badges.map(b => b.tm));

  const hover = async (which) => {
    // ★吹き出しの要素を remove() しないこと。React が持っている木を横から壊すと
    //   「removeChild ... is not a child of this node」で画面が落ちる（一度踏んだ）。
    //   いったんマウスを離して消してから、次のバッジをなぞる。
    await page.mouse.move(700, 60);
    await page.waitForTimeout(150);
    const el = await page.$('[data-custbadge="2027-01-20/' + which + '"]');
    if (!el) return null;
    await el.hover();
    await page.waitForTimeout(350);
    return await page.evaluate(() => {
      const e = document.querySelector('[data-custbtip]');
      if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { txt: e.innerText.replace(/\s+/g, ' ').trim(), attr: e.getAttribute('data-custbtip'),
        pos: cs.position, pe: cs.pointerEvents, z: cs.zIndex,
        inView: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    });
  };

  console.log('\n■ ★マ（マッハ車検）をなぞると入庫時間が出る');
  // 吹き出しを出す前のカレンダーの高さ（出したあとで変わっていないことを見る）
  const boxBefore = await page.evaluate(() => {
    const m = document.querySelector('[data-custmon]');
    const box = m && m.closest('div').parentElement;
    const sc = document.getElementById('booking-modal-scroll');
    return { h: box ? box.scrollHeight : 0, top: sc ? sc.scrollTop : 0 };
  });
  const m1 = await hover('1/0');
  t('吹き出しが出る', !!m1, m1);
  t('★「入庫 10:00」と出る', !!m1 && /入庫 10:00/.test(m1.txt), m1 && m1.txt);
  t('★「マッハ車検」と出る', !!m1 && /マッハ車検/.test(m1.txt), m1 && m1.txt);
  t('氏名と車種も出る', !!m1 && /まはち一郎/.test(m1.txt) && /ハスラー/.test(m1.txt), m1 && m1.txt);
  t('★「ここから1時間は一般整備が入りません」と添える', !!m1 && /1時間は一般整備/.test(m1.txt), m1 && m1.txt);
  t('★画面に対して出す（position:fixed）', !!m1 && m1.pos === 'fixed', m1 && m1.pos);
  t('★クリックをじゃましない（pointerEvents:none）', !!m1 && m1.pe === 'none', m1 && m1.pe);
  t('★予約カードより前に出る（zIndex 1000 超）', !!m1 && Number(m1.z) > 1000, m1 && m1.z);
  t('★画面の外へ出ない', !!m1 && m1.inView, m1);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

  const boxAfter = await page.evaluate(() => {
    const m = document.querySelector('[data-custmon]');
    const box = m && m.closest('div').parentElement;
    const sc = document.getElementById('booking-modal-scroll');
    return { h: box ? box.scrollHeight : 0, top: sc ? sc.scrollTop : 0 };
  });
  t('★カレンダーの高さが変わらない（チラつかない）', boxBefore.h === boxAfter.h, { boxBefore, boxAfter });
  t('★スクロール位置も動かない', boxBefore.top === boxAfter.top, { boxBefore, boxAfter });

  console.log('\n■ ク・レ も同じように出る（1時間の注意はマだけ）');
  const m2 = await hover('2/1');
  t('ク（クイック車検）で「入庫 14:00」', !!m2 && /入庫 14:00/.test(m2.txt) && /クイック車検/.test(m2.txt), m2 && m2.txt);
  t('★ク には1時間の注意を出さない', !!m2 && !/1時間は一般整備/.test(m2.txt), m2 && m2.txt);
  const m3 = await hover('3/2');
  t('レ（入庫時間が空）は「入庫 未定」', !!m3 && /入庫 未定/.test(m3.txt), m3 && m3.txt);

  console.log('\n■ 離すと消える／バッジが無い所では出ない');
  await page.mouse.move(700, 60);
  await page.waitForTimeout(350);
  t('★なぞるのをやめると消える', await page.evaluate(() => !document.querySelector('[data-custbtip]')));
  const empty = await page.evaluate(() => {
    const cell = document.querySelector('[data-custday="2027-01-21"]');
    if (!cell) return 'マスが無い';
    return [...cell.querySelectorAll('div')].some(e => e.hasAttribute('data-custbadge')) ? '印がある' : 'ok';
  });
  t('★予約が無い日の空きマスには印を付けない', empty === 'ok', empty);

  console.log('\n■ 日を選ぶ操作はこれまでどおり');
  await page.evaluate(() => { const d = document.querySelector('[data-custday="2027-01-20"]'); if (d) d.click(); });
  await page.waitForTimeout(500);
  t('★バッジの上から押しても、その日が入庫日に入る',
    await page.evaluate(() => document.body.innerText.includes('2027') && !document.querySelector('[data-custmon]')));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
