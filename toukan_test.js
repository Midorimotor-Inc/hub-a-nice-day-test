// 投函済みチェック（顧客リストの「投函①②」のマス）の検査
//   2026-10-31 ユーザー指示：
//     「リストの投函日1、投函日2が、元のファイルでは黄色く塗りつぶされている。
//       投函をしたら黄色が白に変わるように担当者がする。それを Hub でもできるようにしたい」
//     操作は代車カレンダーと同じ：マウスで下にスライドした分だけ選び、離すとポップが出て
//     「はい／キャンセル」。はいを押すとポストインのイラストが出る。
//   ここで見ること：
//     ① 黄色＝まだ投函していない／白＋✓＝投函済み
//     ② 日付の無いマスは黄色にしない（元ファイルの投函②は列ごと黄色の月があるため）
//     ③ ドラッグで選べる／列はまたがない
//     ④ 離すと確認ポップ。キャンセルで何も変わらない
//     ⑤ はいで 黄色→白。ポストの絵が出る。サーバーにも保存される
//     ⑥ 白からドラッグすると「未投函に戻しますか？」
//     ⑦ 「未投函①」で絞り込める／統計に件数が出る
//     ⑧ 取り込み時の色の見分け（isDmYellow）
//   実行: node toukan_test.js
//        SHOT=<保存先.png> node toukan_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8415, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const YELLOW = 'rgb(255, 242, 0)';   // #FFF200
const SEL = 'rgb(186, 230, 253)';    // #bae6fd（ドラッグ中）

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 10, 31];

// 10件。1〜7 は未投函①、8〜9 は投函済み①、10 は投函①の日付が無い
const mk = (i, o) => Object.assign({
  custId: 'F__' + i + '__客' + i, rowIdx: i, expiry: '2026-12-0' + ((i % 9) + 1),
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-09-12', dm1Book: '', dm2Date: '2026-09-19', dm2Book: '',
  dm1Sent: false, dm2Sent: false,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
const CUSTS = [
  mk(1), mk(2), mk(3), mk(4), mk(5), mk(6), mk(7),
  mk(8, { dm1Sent: true }), mk(9, { dm1Sent: true }),
  mk(10, { dm1Date: '', dm1Sent: false }),      // 日付が無い＝黄色にしない
];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202612', count: CUSTS.length }],
  [STOR + 'cf-202612-index']: { name: '202612', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202612-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// 画面に出ている投函のマスを名前つきで取る
const cells = (page, n) => page.evaluate((n) => {
  const rows = [...document.querySelectorAll('tbody tr')];
  return rows.map(tr => {
    const tds = [...tr.children];
    if (tds.length < 8) return null;
    const td = tds[4 + n * 2];                 // 0:満期 1:氏名 2:No 3:車種 4:投函① 5:予約① 6:投函② 7:予約②
    if (!td) return null;
    const cs = getComputedStyle(td);
    return { name: (tds[1].innerText || '').split('\n')[0].trim(), text: (td.innerText || '').trim(),
      bg: cs.backgroundColor, shadow: cs.boxShadow };
  }).filter(Boolean);
}, n);

// 行i・列n のマスをドラッグする（mousedown → mouseover → window の mouseup）
const dragCells = (page, n, from, to, release = true) => page.evaluate(([n, from, to, release]) => {
  const td = (i) => { const tr = document.querySelectorAll('tbody tr')[i]; return tr ? tr.children[4 + n * 2] : null; };
  const ev = (el, type) => el && el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  ev(td(from), 'mousedown');
  const step = to >= from ? 1 : -1;
  for (let i = from + step; ; i += step) { ev(td(i), 'mouseover'); if (i === to) break; }
  if (release) window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, [n, from, to, release]);

const popText = (page) => page.evaluate(() => {
  // 札の入れ子の中で、ボタンまで含んでいる一番内側の箱を取る
  const d = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null
    && /📮 投函の記録/.test(e.innerText || '') && /キャンセル/.test(e.innerText || '')).pop();
  return d ? d.innerText.replace(/\s+/g, ' ').trim() : null;
});
// ★ポップの【中の】ボタンを押す。画面には常に出ている別の「キャンセル」があるので、
//   ボタンだけで探すとそちらを押してしまう（2026-10-31 に検査が落ちた原因）。
const clickPop = (page, label) => page.evaluate((lb) => {
  const d = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null
    && /📮 投函の記録/.test(e.innerText || '') && /キャンセル/.test(e.innerText || '')).pop();
  if (!d) return false;
  const b = [...d.querySelectorAll('button')].find(e => e.innerText.trim() === lb);
  if (b) { b.click(); return true; } return false;
}, label);

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
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(600);

  head('① 黄色＝まだ投函していない／白＋✓＝投函済み');
  let c0 = await cells(page, 0);
  t('10行ぜんぶ出ている', c0.length === 10, c0.length);
  t('★客1（未投函）は黄色', c0[0] && c0[0].bg === YELLOW, c0[0]);
  t('★客1 に ✓ は付かない', c0[0] && !/✓/.test(c0[0].text), c0[0]);
  t('★客8（投函済み）は黄色でない', c0[7] && c0[7].bg !== YELLOW, c0[7]);
  t('★客8 に ✓ が付く', c0[7] && /✓/.test(c0[7].text), c0[7]);
  t('日付は 09/12 と出る', c0[0] && c0[0].text.indexOf('09/12') === 0, c0[0]);

  head('② 日付の無いマスは黄色にしない');
  t('★客10（投函①の日付なし）は黄色でない', c0[9] && c0[9].bg !== YELLOW, c0[9]);
  t('★客10 のマスは空っぽ', c0[9] && c0[9].text === '', c0[9]);

  head('③ ドラッグで選べる／列はまたがない');
  await dragCells(page, 0, 0, 2, false);
  await page.waitForTimeout(250);
  c0 = await cells(page, 0);
  t('★ドラッグした3件が水色になる', c0.slice(0, 3).every(x => x.bg === SEL), c0.slice(0, 4).map(x => x.bg));
  t('★4件目は水色にならない', c0[3].bg === YELLOW, c0[3]);
  let c1 = await cells(page, 1);
  t('★投函②の列は巻き込まれない', c1.every(x => x.bg !== SEL), c1.slice(0, 3).map(x => x.bg));
  // 投函②へマウスを移しても広がらない
  await page.evaluate(() => {
    const tr = document.querySelectorAll('tbody tr')[5];
    if (tr) tr.children[6].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  c0 = await cells(page, 0);
  t('★別の列に動かしても選択は伸びない', c0.slice(0, 3).every(x => x.bg === SEL) && c0[3].bg === YELLOW, c0.slice(0, 5).map(x => x.bg));

  head('④ 離すと確認ポップ。キャンセルで何も変わらない');
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await page.waitForTimeout(400);
  let pop = await popText(page);
  t('★ポップが出る', !!pop, pop);
  t('★「投函① の 3件」と出る', !!pop && /投函① の 3件/.test(pop), pop);
  t('★対象の名前が並ぶ', !!pop && /客1/.test(pop) && /客3/.test(pop) && !/客4/.test(pop), pop);
  t('★「はい、投函しました」ボタンがある', !!pop && /はい、投函しました/.test(pop), pop);
  t('キャンセルを押せる', await clickPop(page, 'キャンセル'));
  await page.waitForTimeout(400);
  t('★ポップが閉じる', (await popText(page)) === null);
  c0 = await cells(page, 0);
  t('★キャンセルなら黄色のまま', c0.slice(0, 3).every(x => x.bg === YELLOW), c0.slice(0, 3).map(x => x.bg));

  head('⑤ はいで 黄色→白。ポストの絵が出る');
  await dragCells(page, 0, 0, 2);
  await page.waitForTimeout(400);
  t('ポップが出る', !!(await popText(page)));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await clickPop(page, 'はい、投函しました');
  await page.waitForTimeout(250);
  const anim = await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => /件 投函しました/.test(e.innerText || '') && e.offsetParent !== null).pop();
    return d ? { txt: d.innerText.replace(/\s+/g, ' ').trim(), post: !!document.querySelector('svg rect[fill="#dc2626"]') } : null;
  });
  t('★ポストの絵が出る', !!anim && anim.post, anim);
  t('★「3件 投函しました」と出る', !!anim && /3件 投函しました/.test(anim.txt), anim);
  await page.waitForTimeout(1300);
  t('★絵は自分で消える', await page.evaluate(() => !document.querySelector('svg rect[fill="#dc2626"]')));
  c0 = await cells(page, 0);
  t('行数は10のまま', c0.length === 10, c0.map(x => x.name + ':' + x.bg));
  t('★3件が白になった', c0.slice(0, 3).every(x => x.bg !== YELLOW), c0.slice(0, 3).map(x => x.bg));
  t('★3件に ✓ が付いた', c0.slice(0, 3).every(x => /✓/.test(x.text)), c0.slice(0, 3).map(x => x.text));
  t('★4件目は黄色のまま', c0[3].bg === YELLOW, c0[3]);

  head('⑥ サーバーにも保存される');
  const saved = await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    const raw = st['kv/hub-v8-dev-cf-202612-chunk-0'];
    if (!raw) return false;
    const list = JSON.parse(raw.v);
    return list.filter(c => c.dm1Sent === true).length === 5 ? list.map(c => [c.name, c.dm1Sent]) : false;
  }, null, { timeout: 25000 }).then(h => h.jsonValue()).catch(() => null);
  t('★サーバー側も 投函済み5件（元の2件＋今の3件）', !!saved, saved);
  t('★客4 はサーバー側でも未投函のまま', !!saved && saved.find(x => x[0] === '客4')[1] === false, saved);

  head('⑦ 白からドラッグすると「未投函に戻しますか？」');
  await dragCells(page, 0, 0, 1);
  await page.waitForTimeout(400);
  pop = await popText(page);
  t('★「未投函」に戻す聞き方になる', !!pop && /未投函/.test(pop) && /2件/.test(pop), pop);
  t('★ボタンは「はい、戻します」', !!pop && /はい、戻します/.test(pop), pop);
  await clickPop(page, 'はい、戻します');
  await page.waitForTimeout(1600);
  c0 = await cells(page, 0);
  t('★2件が黄色に戻った', c0[0].bg === YELLOW && c0[1].bg === YELLOW, [c0[0].bg, c0[1].bg]);
  t('★3件目は白のまま', c0[2].bg !== YELLOW, c0[2]);

  head('⑧ 絞り込みと統計');
  const stats = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  t('★統計に「未投函①」が出る', /未投函①/.test(stats));
  t('★統計に「未投函②」が出る', /未投函②/.test(stats));
  const okBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /未投函①/.test(e.innerText) && e.offsetParent !== null);
    if (b) { b.click(); return true; } return false;
  });
  t('「📮 未投函①」のボタンがある', okBtn);
  await page.waitForTimeout(500);
  c0 = await cells(page, 0);
  // ここまでで 客3 は投函済み、客8・客9 も投函済み、客10 は日付なし → 未投函は6件
  t('★未投函の行だけになる（6件）', c0.length === 6, c0.map(x => x.name));
  t('★出ている分はぜんぶ黄色', c0.every(x => x.bg === YELLOW), c0.map(x => x.bg));
  t('★投函済みの客3 は出てこない', !c0.some(x => x.name === '客3'), c0.map(x => x.name));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /未投函①/.test(e.innerText) && e.offsetParent !== null);
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  t('★もう一度押すと絞り込みが解ける', (await cells(page, 0)).length === 10);

  head('⑨ 取り込みの時の色の見分け（isDmYellow）');
  const col = await page.evaluate(() => ({
    y1: isDmYellow('FFFF00'), y2: isDmYellow('FFFFFF00'), y3: isDmYellow('#FFF200'), y4: isDmYellow('FFFACD'),
    blue: isDmYellow('00B0F0'), green: isDmYellow('92D050'), red: isDmYellow('FF0000'),
    white: isDmYellow('FFFFFF'), whiteArgb: isDmYellow('FFFFFFFF'), none: isDmYellow(''), theme: isDmYellow('0'),
  }));
  t('★#FFFF00 は黄色', col.y1 === true, col);
  t('★ARGB の FFFFFF00 も黄色', col.y2 === true, col);
  t('★#FFF200 も黄色', col.y3 === true, col);
  t('★薄い黄色 FFFACD も黄色', col.y4 === true, col);
  t('★青 00B0F0 は黄色でない', col.blue === false, col);
  t('★緑 92D050 は黄色でない', col.green === false, col);
  t('★赤 FF0000 は黄色でない', col.red === false, col);
  t('★白 FFFFFF は黄色でない', col.white === false, col);
  t('★白 ARGB も黄色でない', col.whiteArgb === false, col);
  t('★塗りなしは黄色でない', col.none === false, col);
  t('★theme 指定（白に塗り直した分）は黄色でない', col.theme === false, col);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
