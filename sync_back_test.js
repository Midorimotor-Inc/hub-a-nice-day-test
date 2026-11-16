// 逆向きの同期チェックの検査（2026-11-16）
//   「スケジュールには【本予約】で入っているのに、顧客リストの行が本予約になっていない」
//   ＝2026-11-16 のユーザー報告（202701 の仮予約の方が、スケジュールでは 12/20 に本予約）。
//   これまで同期チェックは【片方向】（リストが本予約なのにスケジュールに無い）だけを見ていたので、
//   この食い違いは どの安全網にも引っかからなかった（自己修復も status==='confirm' の行しか直さない）。
//   ここで見ること：
//     ① 逆向きの食い違いを見つけて、同期チェックの画面に出す
//     ② 「本予約にそろえる」で顧客リストの行だけが直る
//     ③ スケジュール（insp）には1文字も書かない＝予約そのものを動かさない
//     ④ 投函の印・備考・担当は書き換えない
//     ⑤ 見はじめ（SYNC_FROM_DK）より前は数えない／もう本予約の行は出さない
//   実行: node sync_back_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8491, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 16];

// 架空のお客様（リポジトリに本物の氏名を書かない）
const mk = (i, o) => Object.assign({
  custId: '202701__' + i + '__客' + i + '__' + (1000 + i), rowIdx: i, expiry: '2027-01-0' + ((i % 9) + 1),
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-10-18', dm1Book: '', dm2Date: '2026-10-25', dm2Book: '',
  dm1Sent: true, dm2Sent: true,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});

// 客1 … 逆向きの食い違い（リストは仮予約・入庫日なし／スケジュールは本予約）＝報告の形そのまま
// 客2 … リストも本予約・スケジュールにも居る（正常）＝出てはいけない
// 客3 … 逆向きだが見はじめ（2026-9-22）より前＝数えない
// 客4 … リストは未予約／スケジュールは本予約（これも逆向き）
const CUSTS = [
  mk(1, { status: 'temp', course: 2, tokuten: '②', staff: '魚住圭', note: '前の備考です' }),
  mk(2, { status: 'confirm', entryDate: '2026-12-10', linkedInspDate: '2026-12-10', bookingTime: '09:00', course: 1 }),
  mk(3, { status: 'temp' }),
  mk(4, { status: 'none' }),
];
const row = (i, o) => Object.assign({
  custId: CUSTS[i - 1].custId, name: '客' + i, no: 1000 + i, carType: '車' + i,
  bookingStatus: 'confirmed', store: 'honten', seq: i, time: '10:00', course: 2,
  staff: '魚住圭　日程確定は見取（メール）', tokuten: '②', note: '',
}, o || {});

const INSP = {
  '2026-12-20': [row(1)],
  '2026-12-10': [row(2, { time: '09:00', course: 1 })],
  '2026-9-10': [row(3)],            // ★見はじめより前
  '2027-1-14': [row(4, { time: '14:00' })],
};

const seed = {
  [STOR + 'insp']: INSP, [STOR + 'insp-arch']: {}, [STOR + 'inspLimits']: {}, [STOR + 'insp-limits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'custbk']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

const srvRow = (page, name) => page.evaluate(([stor, nm]) => {
  const c = window.__fakeFb.get(stor + 'cf-202701-chunk-0');
  const r = (c || []).find(x => x && x.name === nm);
  return r ? { status: r.status, entryDate: r.entryDate, linkedInspDate: r.linkedInspDate, bookingTime: r.bookingTime, course: r.course, note: r.note, staff: r.staff, dm1Sent: r.dm1Sent, dm2Sent: r.dm2Sent } : null;
}, [STOR, name]);
const srvInsp = page => page.evaluate(stor => JSON.stringify(window.__fakeFb.get(stor + 'insp') || {}), STOR);

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
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(1200);

  const inspBefore = await srvInsp(page);

  head('① 逆向きの食い違いを見つけて画面に出す');
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /スケジュール同期チェック/.test(x.innerText || ''));
    if (b) { b.click(); return true; } return false;
  });
  t('「🔧 スケジュール同期チェック」のボタンがある', clicked);
  let shown = false;
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (await page.$('[data-syncback]')) { shown = true; break; } }
  t('★逆向きの区画（data-syncback）が出る', shown);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-syncbackrow]')].map(tr => ({
    id: tr.getAttribute('data-syncbackrow'), txt: tr.innerText.replace(/\s+/g, ' ').trim(),
  })));
  t('★逆向きは2件（客1・客4）', rows.length === 2, rows);
  t('★客1 が出る', rows.some(r => /客1/.test(r.txt)), rows);
  t('★客4 が出る', rows.some(r => /客4/.test(r.txt)), rows);
  t('★もう本予約の 客2 は出ない', !rows.some(r => /客2/.test(r.txt)), rows);
  t('★見はじめより前の 客3 は出ない', !rows.some(r => /客3/.test(r.txt)), rows);
  t('★予約の日（2026-12-20）が出る', rows.some(r => /2026-12-20/.test(r.txt)), rows);
  t('★リストの状態（仮予約）が出る', rows.some(r => /仮予約/.test(r.txt)), rows);
  t('★リストの入庫日が空だと分かる', rows.some(r => /（空）/.test(r.txt)), rows);
  const note = await page.evaluate(() => {
    const e = document.querySelector('[data-syncbacknote]');
    return e ? e.innerText.replace(/\s+/g, ' ') : null;
  });
  t('★「スケジュールの予約そのものは動かしません」と説明がある', note && /動かしません/.test(note), note);
  const btns = await page.evaluate(() => ({
    all: !!document.querySelector('[data-syncbackall]'),
    one: document.querySelectorAll('[data-syncbackfix]').length,
    allTxt: (document.querySelector('[data-syncbackall]') || {}).innerText || '',
  }));
  t('★まとめて直すボタンがある', btns.all, btns);
  t('★1件ずつ直すボタンもある（2つ）', btns.one === 2, btns);
  t('★ボタンの字に件数が出る', /2件/.test(btns.allTxt), btns);

  head('② 「本予約にそろえる」で顧客リストの行だけが直る');
  // ★直す前のファイルでも落ちずに結果を出せるように、無い時は押さずに進む
  await page.evaluate(() => { const b = document.querySelector('[data-syncbackall]'); if (b) b.click(); });
  await page.waitForTimeout(6000);
  const r1 = await srvRow(page, '客1');
  t('★客1 が本予約になる', r1 && r1.status === 'confirm', r1);
  t('★入庫日が予約の日になる', r1 && r1.entryDate === '2026-12-20', r1);
  t('★紐づけの日も入る', r1 && r1.linkedInspDate === '2026-12-20', r1);
  t('★入庫時間も入る', r1 && r1.bookingTime === '10:00', r1);
  t('★コースも入る', r1 && Number(r1.course) === 2, r1);
  const r4 = await srvRow(page, '客4');
  t('★客4（未予約）も本予約になる', r4 && r4.status === 'confirm', r4);
  t('★客4 の入庫日も入る', r4 && r4.entryDate === '2027-01-14', r4);

  head('③ スケジュール（insp）には1文字も書かない');
  t('★★スケジュールがまったく変わっていない', (await srvInsp(page)) === inspBefore);

  head('④ 投函の印・備考・担当は書き換えない');
  t('★投函①の印が残っている', r1 && r1.dm1Sent === true, r1);
  t('★投函②の印が残っている', r1 && r1.dm2Sent === true, r1);
  t('★備考がそのまま', r1 && r1.note === '前の備考です', r1);
  t('★担当がそのまま（スケジュール側の字で上書きしない）', r1 && r1.staff === '魚住圭', r1);

  head('⑤ 直したあとの画面');
  const after = await page.evaluate(() => ({
    done: (document.querySelector('[data-syncbackdone]') || {}).innerText || '',
    left: document.querySelectorAll('[data-syncbackrow]').length,
  }));
  t('★「2件そろえました」と出る', /2件/.test(after.done), after);
  t('★直した分は一覧から消える', after.left === 0, after);

  head('⑦ ★手元の古い写しがサーバーの本予約を隠さない（赤帯が残る件）');
  // サーバーは【本予約】なのに、この端末の localStorage の写しが【キャンセル】のまま。
  // 「進み具合を後戻りさせない」の規則に時間の歯止めが無かったので、
  // サーバーの値で上書きされず、しかもその写しを書き戻すので【赤帯が永久に残った】。
  const back2 = await ctx.newPage();
  const errs2 = []; back2.on('pageerror', e => errs2.push(String(e)));
  back2.on('dialog', async d => { await d.accept().catch(() => {}); });
  await back2.addInitScript(([stor, custs]) => {
    // ★サーバー（にせ firebase）の方は【本予約】にしておく。
    //   ctx の addInitScript が種データで毎回まき直すので、ここで上書きすること。
    const srv = custs.map(c => c.name === '客1'
      ? Object.assign({}, c, { status: 'confirm', entryDate: '2026-12-20', linkedInspDate: '2026-12-20', bookingTime: '10:00' }) : c);
    try {
      const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
      st['kv/' + stor + 'cf-202701-chunk-0'] = { v: JSON.stringify(srv), u: Date.now() };
      localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    } catch (e) {}
    // ★この端末の写しだけ【キャンセル】のまま＝報告された形
    const rows = custs.map(c => c.name === '客1'
      ? Object.assign({}, c, { status: 'cancel', entryDate: '', linkedInspDate: '' }) : c);
    localStorage.setItem(stor + 'cf-index', JSON.stringify([{ name: '202701', count: rows.length }]));
    localStorage.setItem(stor + 'cf-202701', JSON.stringify({ name: '202701', customers: rows }));
  }, [STOR, CUSTS]);
  await back2.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  try { await back2.waitForFunction(() => document.body.innerText.includes('客1'), null, { timeout: 25000 }); } catch (e) {}
  // 最初は手元の写し（赤帯）が出る。そのあとサーバーの値で直るまで待つ。
  let cls = '';
  for (let i = 0; i < 24; i++) {
    await back2.waitForTimeout(500);
    cls = await back2.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(x => ((x.children[1] || {}).innerText || '').indexOf('客1') >= 0);
      return tr ? tr.className : '';
    });
    if (/row-confirm/.test(cls)) break;
  }
  t('★★サーバーの本予約で赤帯が直る（row-confirm になる）', /row-confirm/.test(cls), cls);
  t('★赤帯（row-cancel）が残らない', !/row-cancel/.test(cls), cls);
  const cached = await back2.evaluate(stor => {
    try { const d = JSON.parse(localStorage.getItem(stor + 'cf-202701') || '{}');
      const r = (d.customers || []).find(x => x && x.name === '客1'); return r ? r.status : null; } catch (e) { return 'err'; }
  }, STOR);
  t('★手元の写しにも本予約が書き戻される（古いキャンセルを残さない）', cached === 'confirm', cached);
  t('この画面でもJSエラーが出ていない', errs2.length === 0, errs2.slice(0, 3));
  await back2.close();

  head('⑥ 中身の見張り');
  const SRC = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  t('★逆向きを直す所は cfSaveRowFields を使っている（読めない時は書かない）',
    /handleSyncFixList[\s\S]{0,900}cfSaveRowFields/.test(SRC));
  // ★関数の本体だけを切り出して見る（文字数で見ると次の handleSyncFix に入り込む）
  const _i0 = SRC.indexOf('const handleSyncFixList=');
  const FIXLIST = SRC.slice(_i0, SRC.indexOf('const handleSyncFix=', _i0 + 10));
  t('★逆向きを直す所で insp に書いていない',
    FIXLIST.length > 300 && FIXLIST.indexOf("STOR+'insp'") < 0 && FIXLIST.indexOf('persistInsp') < 0,
    FIXLIST.length);
  t('★日付キーをゼロ詰めにそろえている（syncPad）', /const syncPad=/.test(SRC));
  t('★「後戻りさせない」に時間の歯止めがある（cfTouched）',
    /const cfTouched=/.test(SRC) && SRC.indexOf('lp>fp&&cfTouched(') >= 0);
  t('既存の目印（data-syncnote / data-syncwhy / data-syncskip）を壊していない',
    SRC.indexOf('data-syncnote') >= 0 && SRC.indexOf('data-syncwhy') >= 0 && SRC.indexOf('data-syncskip') >= 0);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
