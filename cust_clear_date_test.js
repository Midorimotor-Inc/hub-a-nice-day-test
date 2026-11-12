// 顧客リストの予約カードで「日程を消す」（2026-11-12 ユーザー指示）
//   ユーザーの言葉：「顧客リストの、予約を一旦決めると、日程が変更はできても消すことができません。
//   仮予約の状態に戻ったときに、日程を一旦消したいんですけども、消せれるように編集機能をつけてください」
//   ここで見ること：
//     ① 入庫日が入っている時だけ「🗑 日程を消す」が出る（未予約の行には出さない）
//     ② 押すと入庫日が空になり、案内が出て、下のボタンは「✓ 日程を消して保存」だけになる
//        （代車の区画は触れなくなる／本予約は入庫日が必須なので出さない）
//     ③ 「↩ 元に戻す」で元の入庫日に戻る
//     ④ 保存すると スケジュール(insp)・カレンダー6枠の控え(custbk)・代車の貸出(lres) から外れ、
//        お客様の行は残って「仮予約・入庫日なし」になる
//   実行: node cust_clear_date_test.js
//        SHOT=<保存先.png> node cust_clear_date_test.js  … その時の見た目を撮る
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8469, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 12];          // 本日を 2026-11-12 に固定
const DAY = '2026-11-20';            // 予約の入っている日（これから先の日）
const BK = 'insp-2026-11-20-0';      // 代車の紐付け

const mk = (i, o) => Object.assign({
  custId: 'F__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-1' + (i % 9),
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-11-12', dm1Book: '', dm2Date: '', dm2Book: '',
  dm1Sent: true, dm2Sent: true,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
const CUSTS = [
  mk(1),                                                     // 未予約（入庫日なし）
  mk(2, { status: 'confirm', entryDate: DAY, linkedInspDate: DAY, bookingTime: '09:00', course: 2, staff: '江川京志' }),
];

const seed = {
  [STOR + 'insp']: {
    [DAY]: [{
      name: '客2', carType: '車2', no: 1002, course: 2, store: 'honten', staff: '江川京志',
      time: '09:00', bookingTime: '09:00', tokuten: '-', seq: 1, id: 1,
      bookingStatus: 'confirmed', custId: 'F__2__客2', bookingKey: BK,
      loaner: 'ハスラー (7074)', loanerId: 1,
    }],
  },
  [STOR + 'insp-arch']: {},
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }],
  [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {
    '1': {
      '2026-10-20': {
        id: 1001, user: '客2', custId: 'F__2__客2', bookingKey: BK,
        fy: 2026, fm: 10, fd: 20, ty: 2026, tm: 10, td: 22,
        carName: 'ハスラー', carNum: '7074',
      },
    },
  },
  [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'custbk']: {
    '客2::2026-11-20': {
      status: 'confirmed', dk: DAY, idx: 0, savedAt: 1,
      formData: { name: '客2', carType: '車2', course: 2, time: '09:00', custId: 'F__2__客2', store: 'honten', bookingStatus: 'confirmed' },
    },
  },
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// 行の状態ボタン（＋予約／仮予約／本予約／再予約）を押す
const clickStatusBtn = (page, name) => page.evaluate((nm) => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => (r.innerText || '').indexOf(nm) >= 0);
  if (!tr) return false;
  const b = tr.querySelector('[data-bandstatus]');
  if (b) { b.click(); return true; } return false;
}, name);

// 開いているカードの様子
const cardInfo = (page) => page.evaluate(() => {
  const sc = document.getElementById('booking-modal-scroll');
  if (!sc) return null;
  const loaner = [...sc.querySelectorAll('div')].find(e => (e.getAttribute('style') || '').indexOf('pointer-events') >= 0);
  const foot = sc.parentElement ? sc.parentElement.lastElementChild : null;
  return {
    txt: sc.innerText,
    clearBtn: !!sc.querySelector('[data-bmclear]'),
    undoBtn: !!sc.querySelector('[data-bmundoclear]'),
    note: !!sc.querySelector('[data-bmclearnote]'),
    foot: foot ? [...foot.querySelectorAll('button')].map(b => (b.innerText || '').trim()) : [],
  };
});
// 代車の区画が触れるか（pointerEvents）
const loanerBlocked = (page) => page.evaluate(() => {
  const sc = document.getElementById('booking-modal-scroll');
  if (!sc) return null;
  const lab = [...sc.querySelectorAll('label')].find(e => (e.innerText || '').trim().indexOf('代車') === 0);
  if (!lab) return null;
  return getComputedStyle(lab.parentElement).pointerEvents;
});
const readKv = (page, k) => page.evaluate(x => window.__fakeFb.get(x), k);
// ★カードを閉じる時は必ずカードの ✕ を押すこと。
//   画面には「キャンセル」という字のボタンが2つあり、字で探すと別のものを押してしまう。
const closeCard = async (page) => {
  const ok = await page.evaluate(() => {
    const sc = document.getElementById('booking-modal-scroll');
    if (!sc || !sc.parentElement) return false;
    const b = [...sc.parentElement.querySelectorAll('button')].find(e => (e.innerText || '').trim() === '✕');
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(800);
  return ok;
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email, isAdmin: true }]));
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
  const asked = []; page.on('dialog', async d => { asked.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客2'));
  await page.waitForTimeout(900);

  head('① 入庫日が入っている時だけ「🗑 日程を消す」が出る');
  t('本予約の行のボタンを押せた', await clickStatusBtn(page, '客2'));
  await page.waitForTimeout(1100);
  let c = await cardInfo(page);
  t('予約カードが開いた', !!c, c);
  t('入庫日が入っている（2026-11-20）', !!c && c.txt.indexOf(DAY) >= 0, c && c.txt.slice(0, 120));
  t('★「🗑 日程を消す」が出る', !!c && c.clearBtn, c);
  t('まだ案内は出ていない', !!c && !c.note, c);
  t('下のボタンは 仮予約／本予約', !!c && c.foot.some(x => x.indexOf('仮予約') >= 0) && c.foot.some(x => x.indexOf('本予約') >= 0), c && c.foot);
  // 未予約の行には出さない
  t('カードを閉じられた', await closeCard(page));
  t('未予約の行のボタンを押せた', await clickStatusBtn(page, '客1'));
  await page.waitForTimeout(1000);
  const c0 = await cardInfo(page);
  t('★入庫日が無い行には「🗑 日程を消す」を出さない', !!c0 && !c0.clearBtn, c0);
  await closeCard(page);

  head('② 押すと入庫日が空になり、下は「✓ 日程を消して保存」だけになる');
  await clickStatusBtn(page, '客2');
  await page.waitForTimeout(1100);
  await page.evaluate(() => { const b = document.querySelector('[data-bmclear]'); if (b) b.click(); });
  await page.waitForTimeout(700);
  c = await cardInfo(page);
  t('★入庫日が画面から消えた', !!c && c.txt.indexOf(DAY) < 0, c && c.txt.slice(0, 160));
  t('★案内が出る', !!c && c.note, c);
  t('★「✓ 日程を消して保存」が出る', !!c && c.foot.some(x => x.indexOf('日程を消して保存') >= 0), c && c.foot);
  t('★「本予約」は出さない（入庫日が必須なので）', !!c && !c.foot.some(x => x.indexOf('本予約') >= 0), c && c.foot);
  t('★「仮予約」のボタンも出さない（迷わせない）', !!c && !c.foot.some(x => x.trim() === '仮予約'), c && c.foot);
  t('★代車の区画は触れない', (await loanerBlocked(page)) === 'none', await loanerBlocked(page));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }

  head('③ 「↩ 元に戻す」で元の入庫日に戻る');
  t('★「↩ 元に戻す」が出ている', !!c && c.undoBtn, c);
  await page.evaluate(() => { const b = document.querySelector('[data-bmundoclear]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  c = await cardInfo(page);
  t('★入庫日が戻った', !!c && c.txt.indexOf(DAY) >= 0, c && c.txt.slice(0, 160));
  t('★案内は消えた', !!c && !c.note, c);
  t('★「本予約」が戻った', !!c && c.foot.some(x => x.indexOf('本予約') >= 0), c && c.foot);

  head('④ 保存すると スケジュール・控え・代車から外れ、行は「仮予約・入庫日なし」になる');
  await page.evaluate(() => { const b = document.querySelector('[data-bmclear]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('[data-bmclearsave]'); if (b) b.click(); });
  await page.waitForTimeout(4000);
  const insp = await readKv(page, STOR + 'insp');
  const rows = (insp && insp[DAY]) || [];
  t('★スケジュールからこの方の車検予約が外れた',
    !rows.some(r => r && r.custId === 'F__2__客2'), rows);
  t('その日の行は詰めずに null にしてある（代車の紐付けを壊さない）',
    rows.length === 1 && rows[0] === null, rows);
  const cbk = await readKv(page, STOR + 'custbk');
  t('★カレンダー6枠の控え（custbk）も外れた',
    !Object.keys(cbk || {}).some(k => (cbk[k] || {}).formData && cbk[k].formData.custId === 'F__2__客2'), cbk);
  const lres = await readKv(page, STOR + 'honten-lres');
  t('★紐づいた代車の貸出も外れた',
    Object.keys(((lres || {})['1']) || {}).length === 0, lres);
  const chunk = await readKv(page, STOR + 'cf-202701-chunk-0');
  const c2 = (chunk || []).find(x => x && x.custId === 'F__2__客2');
  t('★お客様の行は残っている', !!c2, c2);
  t('★状態は「仮予約」になった', !!c2 && c2.status === 'temp', c2 && c2.status);
  t('★入庫日は空になった', !!c2 && !c2.entryDate && !c2.linkedInspDate, c2 && { e: c2.entryDate, l: c2.linkedInspDate });
  const row2 = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => (r.innerText || '').indexOf('客2') >= 0);
    if (!tr) return null;
    return { cls: tr.className, st: (tr.querySelector('[data-bandstatus]') || {}).innerText };
  });
  t('一覧の行も仮予約（緑）になっている',
    !!row2 && row2.cls.indexOf('row-temp') >= 0 && String(row2.st || '').indexOf('仮予約') >= 0, row2);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
