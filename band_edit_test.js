// 顧客リストの全行の「✎ 編集」＝帯の色（状態）を選ぶ窓の検査（2026-11-07 ユーザー指示）
//
//   なぜ要るか：2年前にマッハ車検で予約をもらっている方を、担当者がリストを見ながら
//   青帯（本予約）に変えたい。そのため「✎ 編集」を【すべての行】に付けた。
//     黄（初回車検）… 備考に「初回車検」を入れて閉じるだけ
//     緑（仮予約）／青（本予約）… 帯を変えて予約カードが開く
//     赤（キャンセル）… 赤帯にするだけ（何も開かない）
//     すでに色が付いている行は【確認】を1枚はさむ（押し間違い対策）
//
//   実行: node band_edit_test.js
//        SHOT=<保存先.png> node band_edit_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8447, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log('\n■ ' + s);

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 7];
const cust = (i, name, status, note, extra) => Object.assign({
  custId: 'F__' + i + '__' + name, rowIdx: i, expiry: '2027-01-' + (10 + i), name, no: 1000 + i, carType: 'ワゴンＲ',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: note || '', status,
  bookingTime: '', linkedInspDate: '', isAdmin: true }, extra || {});
const CUSTS = [
  cust(1, '客1', 'none', ''),
  cust(2, '客2', 'confirm', '', { entryDate: '2027-01-12', linkedInspDate: '2027-01-12' }),
  cust(3, '客3', 'cancel', '前に断られた'),
  cust(4, '客4', 'new_car', '初回車検'),
  cust(5, '客5', 'none', '2年前にマッハで予約'),
  cust(6, '客6', 'temp', ''),
];

const seed = {
  [STOR + 'insp']: {},
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// その氏名の行の様子
const rowInfo = (page, name) => page.evaluate((nm) => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf(nm) >= 0);
  if (!tr) return null;
  const first = tr.children[0];
  const btns = [...tr.querySelectorAll('button')].map(b => (b.innerText || '').trim());
  const inFirst = [...first.querySelectorAll('button')].map(b => (b.innerText || '').trim());
  return { btns, inFirst, cls: tr.className, bg: getComputedStyle(tr).backgroundColor,
    note: (tr.children[tr.children.length - 1] || {}).innerText || '',
    stLabel: (first.querySelector('[data-bandstatus]') || {}).innerText || '' };
}, name);
const clickEdit = async (page, name) => {
  const ok = await page.evaluate((nm) => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf(nm) >= 0);
    if (!tr) return false;
    const b = tr.querySelector('[data-bandedit]'); if (!b) return false; b.click(); return true;
  }, name);
  await page.waitForTimeout(500);
  return ok;
};
const pickColor = async (page, k) => {
  const ok = await page.evaluate((kk) => { const b = document.querySelector('[data-bandpick="' + kk + '"]'); if (!b) return false; b.click(); return true; }, k);
  await page.waitForTimeout(500);
  return ok;
};
const saved = (page, name) => page.evaluate(([k, nm]) => {
  const v = window.__fakeFb.get(k) || [];
  const r = v.find(x => x && x.name === nm);
  return r ? { status: r.status, note: r.note, entryDate: r.entryDate } : null;
}, [STOR + 'cf-202701-chunk-0', name]);
// ★予約カードを閉じる。画面には絞り込みチップの「キャンセル」もあるので、
//   字で探すと そちらを押してしまう（CLAUDE.md の落とし穴）。カードの中の ✕ を押すこと。
const closeCard = async (page) => {
  await page.evaluate(() => {
    const sc = document.getElementById('booking-modal-scroll');
    if (!sc || !sc.parentElement) return;
    const b = [...sc.parentElement.querySelectorAll('button')].find(e => (e.innerText || '').trim() === '✕');
    if (b) b.click();
  });
  await page.waitForTimeout(700);
};
const openState = page => page.evaluate(() => ({
  win: !!document.querySelector('[data-bandwin]'),
  ask: !!document.querySelector('[data-bandask]'),
  askTxt: (document.querySelector('[data-bandasktxt]') || {}).innerText || '',
  card: !!document.getElementById('booking-modal-scroll'),
}));

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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(800);

  head('① すべての行に「✎ 編集」（左）と 状態のボタン（右）');
  for (const nm of ['客1', '客2', '客3', '客4', '客6']) {
    const r = await rowInfo(page, nm);
    t(nm + ' に「✎ 編集」が出る', !!r && r.btns.some(x => x.indexOf('編集') >= 0), r);
  }
  const r1 = await rowInfo(page, '客1');
  t('★「✎ 編集」が左、状態のボタンが右の順', !!r1 && r1.inFirst.length >= 2 && r1.inFirst[0].indexOf('編集') >= 0 && r1.inFirst[1].indexOf('＋予約') >= 0, r1 && r1.inFirst);
  t('★ボタンの置き場所は今までどおり一番左の列', !!r1 && r1.inFirst.length === 2, r1 && r1.inFirst);
  t('未予約の右は「＋予約」', !!r1 && r1.stLabel.indexOf('＋予約') >= 0, r1 && r1.stLabel);
  t('本予約の右は「本予約」', (await rowInfo(page, '客2')).stLabel.indexOf('本予約') >= 0);
  t('仮予約の右は「仮予約」', (await rowInfo(page, '客6')).stLabel.indexOf('仮予約') >= 0);
  t('★キャンセルの右は「再予約」', (await rowInfo(page, '客3')).stLabel.indexOf('再予約') >= 0);
  t('初回車検の右は「＋予約」', (await rowInfo(page, '客4')).stLabel.indexOf('＋予約') >= 0);

  head('② 窓の中身');
  t('「✎ 編集」で窓が開く', await clickEdit(page, '客5'));
  let o = await openState(page);
  t('窓が出ている', o.win, o);
  const pk = await page.evaluate(() => [...document.querySelectorAll('[data-bandpick]')].map(b => b.getAttribute('data-bandpick')));
  t('★色は4つ（初回車検・仮予約・本予約・キャンセル）', pk.join(',') === 'new_car,temp,confirm,cancel', pk);
  t('★「未予約に戻す」は入れない', pk.indexOf('none') < 0, pk);
  t('備考が入っている', (await page.inputValue('textarea[data-bandnote]')) === '2年前にマッハで予約');
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }

  head('③ 青（本予約）＝帯を変えて予約カードが開く');
  t('青を押せた', await pickColor(page, 'confirm'));
  o = await openState(page);
  t('★まだ色が無い行なので確認は出ない', !o.ask, o);
  await page.waitForTimeout(900);
  o = await openState(page);
  t('★窓は閉じた', !o.win, o);
  t('★予約カードが開いた', o.card, o);
  let sv = await saved(page, '客5');
  t('★帯が本予約になった', !!sv && sv.status === 'confirm', sv);
  t('備考はそのまま', !!sv && sv.note === '2年前にマッハで予約', sv);
  t('★入庫日は入れない（予約カードで入れる）', !!sv && !sv.entryDate, sv);
  t('一覧の行も青になった', (await rowInfo(page, '客5')).cls.indexOf('row-confirm') >= 0);
  await closeCard(page);

  head('④ 黄（初回車検）＝備考に「初回車検」を入れて閉じるだけ');
  await clickEdit(page, '客1');
  t('黄を押せた', await pickColor(page, 'new_car'));
  await page.waitForTimeout(900);
  o = await openState(page);
  t('★予約カードは開かない', !o.card, o);
  t('窓は閉じた', !o.win, o);
  sv = await saved(page, '客1');
  t('★帯が初回車検になった', !!sv && sv.status === 'new_car', sv);
  t('★備考に「初回車検」が入った', !!sv && sv.note === '初回車検', sv);
  t('一覧の行も黄になった', (await rowInfo(page, '客1')).cls.indexOf('row-new_car') >= 0);

  head('⑤ すでに色が付いている行は確認を1枚はさむ');
  await clickEdit(page, '客2');
  await pickColor(page, 'cancel');
  o = await openState(page);
  t('★確認のポップが出た', o.ask, o);
  t('★文面が「本予約 → キャンセル に変更しますか？」', o.askTxt.indexOf('本予約') >= 0 && o.askTxt.indexOf('キャンセル に変更') >= 0, o.askTxt);
  t('★予約が入っているので「スケジュールの予約は消えません」と出る',
    (await page.evaluate(() => (document.querySelector('[data-bandask]') || {}).innerText || '')).indexOf('消えません') >= 0);
  await page.evaluate(() => { const b = document.querySelector('[data-bandno]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  o = await openState(page);
  t('キャンセルを押すと確認だけ閉じる', !o.ask && o.win, o);
  sv = await saved(page, '客2');
  t('★帯は変わっていない', !!sv && sv.status === 'confirm', sv);

  head('⑥ 「はい」で帯が変わる（赤は何も開かない）');
  await pickColor(page, 'cancel');
  await page.evaluate(() => { const b = document.querySelector('[data-bandyes]'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  o = await openState(page);
  t('★窓が閉じた', !o.win, o);
  t('★予約カードは開かない', !o.card, o);
  sv = await saved(page, '客2');
  t('★帯がキャンセルになった', !!sv && sv.status === 'cancel', sv);
  t('一覧の行も赤になった', (await rowInfo(page, '客2')).cls.indexOf('row-cancel') >= 0);
  t('右のボタンが「再予約」に変わった', (await rowInfo(page, '客2')).stLabel.indexOf('再予約') >= 0);

  head('⑦ 同じ色をもう一度押した時');
  await clickEdit(page, '客3');
  await pickColor(page, 'cancel');
  o = await openState(page);
  t('★確認が出る', o.ask, o);
  t('★文面が「もう一度 キャンセル にしますか？」', o.askTxt.indexOf('もう一度') >= 0, o.askTxt);
  await page.evaluate(() => { const b = document.querySelector('[data-bandno]'); if (b) b.click(); });
  await page.waitForTimeout(400);

  head('⑧ 備考だけ保存／赤い行は予約カードも開ける');
  t('★赤い行の窓に「予約カードで見る」が出る', await page.evaluate(() => !!document.querySelector('[data-cxedit]')));
  await page.fill('textarea[data-bandnote]', '他店で車検を済ませたため');
  await page.evaluate(() => { const b = document.querySelector('[data-bandnotesave]'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  sv = await saved(page, '客3');
  t('★備考だけ保存された', !!sv && sv.note === '他店で車検を済ませたため', sv);
  t('★帯はキャンセルのまま', !!sv && sv.status === 'cancel', sv);
  t('窓が閉じた', !(await openState(page)).win);
  t('一覧の備考にも出る', await see('他店で車検を済ませたため', 8000));

  head('⑨ 緑（仮予約）も予約カードが開く');
  await clickEdit(page, '客4');
  await pickColor(page, 'temp');
  await page.evaluate(() => { const b = document.querySelector('[data-bandyes]'); if (b) b.click(); });
  await page.waitForTimeout(1100);
  o = await openState(page);
  t('★予約カードが開いた', o.card, o);
  sv = await saved(page, '客4');
  t('★帯が仮予約になった', !!sv && sv.status === 'temp', sv);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
