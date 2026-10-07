// スマホ：代車を長押ししてドラッグで入れ替える／スケジュールとのズレ チェック（2026-10-07 ユーザー要望）
//   ・長押し0.2秒で持ち上がる。短いタップは今までどおり詳細が出る
//   ・決まりは PC と同じ（🔒限定・過去は不可／本日は入庫時間前なら可／時間未定は確認）
//   ・入れ替えると lres が移り、予約カードの代車名も一緒に書き換わる
//   ・ズレを見つけて「直す」で直せる
//   実行: node mobile_loaner_dnd_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8317, STOR = 'hub-v8-dev-';
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
const d = (p) => { const x = new Date(N); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const F1 = d(5), T1 = d(7);      // これから貸す（動かせる）
const F3 = d(12), T3 = d(14);    // はじめからズレている（予約カードとの食い違いを確かめる用）
const F2 = d(-2), T2 = d(-1);    // 過去（動かせない）。既定の表示（3日前〜）に入る位置に置く
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];

(async () => {
  const bk1 = 'insp-' + dk(F1) + '-0', bk2 = 'insp-' + dk(F2) + '-0';
  const seed = {
    [STOR + 'insp']: {
      [dk(F1)]: [{ name: '辻井　博', carType: 'アルト', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'ハスラー (7074)', loanerId: 1 }],
      [dk(F2)]: [{ name: '大山　明', carType: 'ワゴンR', time: '09:00', course: 2, store: 'honten', seq: 2, id: 2, loaner: 'ハスラー (7074)', loanerId: 1 }],
      // ★わざとズラしてある：代車管理では「ハスラー」なのに、予約カードには「スペーシア」と書いてある
      [dk(F3)]: [{ name: '芝田　一郎', carType: 'アルト', time: '09:00', course: 2, store: 'honten', seq: 3, id: 3, loaner: 'スペーシア (8967)', loanerId: 2 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {
      '1': {
        r1: { id: 2001, user: '辻井　博', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk1 },
        r2: { id: 2002, user: '大山　明', fy: F2.y, fm: F2.m, fd: F2.d, ty: T2.y, tm: T2.m, td: T2.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk2 },
        r3: { id: 2003, user: '芝田　一郎', fy: F3.y, fm: F3.m, fd: F3.d, ty: T3.y, tm: T3.m, td: T3.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'insp-' + dk(F3) + '-0' },
      }, '2': {}
    },
    [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  // 代車タブへ
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === '代車' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);
  t('代車タブが開く', await seeText(page, '代車', 8000));

  head('① 作りの決まり');
  const SRC = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('長押しは0.2秒（ユーザー指示）', /LOANER_PRESS_MS\s*=\s*200/.test(SRC), (SRC.match(/LOANER_PRESS_MS\s*=\s*\d+/) || [])[0]);
  t('🔒限定・過去・本日の時間 の決まりが入っている',
    SRC.indexOf('限定の予約は入れ替えできません') > 0 && SRC.indexOf('過去の予約は入れ替えできません') > 0 && SRC.indexOf('本日の入庫時間（') > 0);
  t('時間未定の本日分は確認してから', SRC.indexOf('入庫時間が未定のため') > 0);
  t('代車 ⇄ レンタカーはまたがない', SRC.indexOf("if(!prev||prev.kind!==kind)return prev;") > 0);
  // ★2026-10-07 ユーザー報告「タップで押し続けると文字のコピーが現れます」。
  //   iPhone は長押しで「コピー」の吹き出しと文字選択を出し、それで入れ替えが取り消されていた。
  //   代車の表では文字を選べないようにしてある（画面で実際に効いているかも見る）。
  t('代車の表は文字を選べない（iPhone の「コピー」も出ない）', SRC.indexOf("[data-lcar],[data-lcar] *{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}") > 0);
  {
    const st = await page.evaluate(() => {
      const row = document.querySelector('[data-lcar]');
      if (!row) return null;
      const inner = row.querySelector('div') || row;
      const g = el => { const c = getComputedStyle(el); return { sel: c.webkitUserSelect || c.userSelect, callout: c.webkitTouchCallout }; };
      return { row: g(row), inner: g(inner) };
    });
    t('帯も車名の欄も文字選択が切れている', !!st && st.row.sel === 'none' && st.inner.sel === 'none', st);
  }
  t('長押しの直後のタップで詳細を開かない', SRC.indexOf('Date.now()-mvJust.current<400') > 0);

  // 帯のまんなかを掴む道具
  const barPos = (user) => page.evaluate(u => {
    const rows = [...document.querySelectorAll('[data-lcar]')];
    for (const row of rows) {
      const hit = [...row.children].find(c => (c.innerText || '').indexOf(u) >= 0);
      if (hit) { const r = hit.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), car: row.getAttribute('data-lcar') }; }
    }
    return null;
  }, user);
  const rowPos = (carId) => page.evaluate(c => {
    const row = [...document.querySelectorAll('[data-lcar]')].find(x => x.getAttribute('data-lcar') === String(c) && x.getAttribute('data-lkind') === 'loaner');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return Math.round(r.y + r.height / 2);
  }, carId);
  // 指で長押し→動かす→離す。
  // ★Chrome の本物の入力経路（CDP）を使う＝実機と同じ道。
  //   手作りの TouchEvent を投げるとブラウザごと落ちることがある（2026-10-07 に踏んだ）。
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  const longDrag = async (from, toY, holdMs) => {
    await touch('touchStart', from.x, from.y);
    await page.waitForTimeout(holdMs);                      // 長押し
    await touch('touchMove', from.x, from.y + 6);
    await page.waitForTimeout(50);
    await touch('touchMove', from.x, toY);
    await page.waitForTimeout(80);
    await touch('touchEnd', from.x, toY);
    await page.waitForTimeout(2500);
  };
  const lres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-lres');
  const insp = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'insp');

  head('⑤ スケジュールとのズレ チェック（入れ替えより先に見る＝保存の待ちに引っかからないように）');
  t('★はじめからあるズレを見つけて赤く知らせる', await seeText(page, 'スケジュールとズレ', 8000),
    await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));
  await clickText(page, 'スケジュールとズレ');
  await page.waitForTimeout(800);
  t('一覧に中身が出る', await seeText(page, '予約カードの代車名が代車管理と違います', 5000));
  t('どちらが正しいか分かるように両方出す',
    await page.evaluate(() => /ハスラー \(7074\)/.test(document.body.innerText) && /スペーシア \(8967\)/.test(document.body.innerText)));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('直す') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2800);
  const Ifix = await page.evaluate(k => window.__fakeFb.get(k), STOR + 'insp');
  const rowFix = ((Ifix || {})[dk(F3)] || [])[0] || {};
  t('★「直す」で予約カードが代車管理に合う', rowFix.loaner === 'ハスラー (7074)' && Number(rowFix.loanerId) === 1,
    { loaner: rowFix.loaner, loanerId: rowFix.loanerId });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '閉じる' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1000);
  t('直したあとは「一致」に戻る', await seeText(page, 'スケジュールと一致', 6000),
    await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));

  head('② 長押ししてドラッグで入れ替える');
  const p1 = await barPos('辻井');
  const y2 = await rowPos(2);
  t('帯とスペーシアの行が見つかる', !!p1 && !!y2, { p1, y2 });
  await longDrag(p1, y2, 300);
  const L1 = await lres();
  t('★ハスラーから外れる', !(L1 && L1['1'] && L1['1'].r1), Object.keys((L1 && L1['1']) || {}));
  t('★スペーシアに移る', !!(L1 && L1['2'] && Object.values(L1['2']).some(r => r.user === '辻井　博')), Object.keys((L1 && L1['2']) || {}));
  t('★移った先の車名が書き換わる', !!(L1 && L1['2'] && Object.values(L1['2']).some(r => r.carName === 'スペーシア')),
    Object.values((L1 && L1['2']) || {})[0]);
  const I1 = await insp();
  const row1 = ((I1 || {})[dk(F1)] || [])[0] || {};
  t('★予約カードの代車名も一緒に書き換わる', row1.loaner === 'スペーシア (8967)' && Number(row1.loanerId) === 2,
    { loaner: row1.loaner, loanerId: row1.loanerId });

  head('③ 短いタップでは動かない（今までどおり詳細が出る）');
  const p2 = await barPos('辻井');
  if (p2) await longDrag(p2, (await rowPos(1)), 60);    // 0.06秒＝長押しにならない
  const L2 = await lres();
  t('★短いタップでは入れ替わらない', !!(L2 && L2['2'] && Object.values(L2['2']).some(r => r.user === '辻井　博')),
    { スペーシア: Object.values((L2 && L2['2']) || {}).map(r => r.user) });

  head('④ 過去の予約は動かせない');
  const p3 = await barPos('大山');
  t('過去の帯が見つかる', !!p3, p3);
  if (p3) {
    await longDrag(p3, (await rowPos(2)), 300);
    const L3 = await lres();
    t('★過去の予約は動かない', !!(L3 && L3['1'] && Object.values(L3['1']).some(r => r.user === '大山　明')),
      Object.values((L3 && L3['1']) || {}).map(r => r.user));
    t('理由を画面に出す', await seeText(page, '過去の予約は入れ替えできません', 4000),
      await page.evaluate(() => document.body.innerText.slice(0, 200)));
  }

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
