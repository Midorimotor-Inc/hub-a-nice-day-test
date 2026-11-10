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

// 13件。1〜7 は未投函①、8〜9 は投函済み①、10 は投函①の日付が無い、
//       11〜12 は赤（キャンセル・案内不要）、13 は青（本予約）＝どちらも投函の対象外
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
  // ★赤い行。元ファイルの凡例が「キャンセル・案内不要 … 赤」なので投函の対象外
  mk(11, { status: 'cancel', dm1Sent: false }),  // 印は未投函だが、黄色にしてはいけない
  mk(12, { status: 'cancel', dm1Sent: true }),   // 印は投函済みだが、✓を出してはいけない
  // ★青い行＝もう本予約が入っている。投函する前に予約が決まったので DM は要らない
  mk(13, { status: 'confirm', dm1Sent: false }),
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
  // ★本物のマウスと同じものを送ること（2026-11-10）。本体は2つを見張っている：
  //   ・押しているボタン（buttons:1）… 離していたらドラッグを打ち切る
  //   ・座標が動いたか … 同じ場所なら「スクロールだけ」とみなして伸ばさない
  const ev = (el, type, buttons) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, buttons: buttons,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
  };
  ev(td(from), 'mousedown', 1);
  const step = to >= from ? 1 : -1;
  for (let i = from + step; ; i += step) { ev(td(i), 'mouseover', 1); if (i === to) break; }
  if (release) window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, [n, from, to, release]);

// 水色（選択中）のマスの行番号を取る
const selRows = (page, n) => page.evaluate((n) => {
  const out = [];
  [...document.querySelectorAll('tbody tr')].forEach((tr, i) => {
    const td = tr.children[4 + n * 2];
    if (td && getComputedStyle(td).backgroundColor === 'rgb(186, 230, 253)') out.push(i);
  });
  return out;
}, n);
// 行 row のマスに mouseover を送る。buttons＝押しているボタン、
// srcRow を渡すとその行の座標で送る（＝マウスは動いていない＝スクロールだけの時の姿）
const overAt = (page, n, row, buttons, srcRow) => page.evaluate(([n, row, buttons, srcRow]) => {
  const td = (i) => { const tr = document.querySelectorAll('tbody tr')[i]; return tr ? tr.children[4 + n * 2] : null; };
  const el = td(row), src = td(srcRow == null ? row : srcRow);
  if (!el || !src) return false;
  const r = src.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: buttons,
    clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
  return true;
}, [n, row, buttons, srcRow]);
const downAt = (page, n, row) => page.evaluate(([n, row]) => {
  const tr = document.querySelectorAll('tbody tr')[row]; const td = tr && tr.children[4 + n * 2];
  if (!td) return false;
  const r = td.getBoundingClientRect();
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1,
    clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
  return true;
}, [n, row]);
const popNum = (str) => { const m = str && str.match(/投函. の ([0-9]+)件/); return m ? Number(m[1]) : null; };

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
  t('13行ぜんぶ出ている', c0.length === 13, c0.length);
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
    const td = tr && tr.children[6]; if (!td) return;
    const r = td.getBoundingClientRect();
    td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
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
  t('行数は13のまま', c0.length === 13, c0.map(x => x.name + ':' + x.bg));
  t('★3件が白になった', c0.slice(0, 3).every(x => x.bg !== YELLOW), c0.slice(0, 3).map(x => x.bg));
  t('★3件に ✓ が付いた', c0.slice(0, 3).every(x => /✓/.test(x.text)), c0.slice(0, 3).map(x => x.text));
  t('★4件目は黄色のまま', c0[3].bg === YELLOW, c0[3]);

  head('⑥ サーバーにも保存される');
  const saved = await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    const raw = st['kv/hub-v8-dev-cf-202612-chunk-0'];
    if (!raw) return false;
    const list = JSON.parse(raw.v);
    return list.filter(c => c.dm1Sent === true).length === 6 ? list.map(c => [c.name, c.dm1Sent]) : false;
  }, null, { timeout: 25000 }).then(h => h.jsonValue()).catch(() => null);
  t('★サーバー側も 投函済み6件（元の2件＋赤の1件＋今の3件）', !!saved, saved);
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
  t('★もう一度押すと絞り込みが解ける', (await cells(page, 0)).length === 13);

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

  head('⑩ 赤い行（キャンセル・案内不要）と青い行（本予約）は投函の対象外');
  //   元ファイルの凡例に「キャンセル・案内不要 … 赤」と書いてある。
  //   車検のキャンセルだけでなく、もともとDMを出さない人も同じ赤で塗られている（2026-10-31 ユーザー指摘）。
  c0 = await cells(page, 0);
  const ng1 = c0.find(x => x.name === '客11'), ng2 = c0.find(x => x.name === '客12');
  t('★印が未投函でも黄色にしない（客11）', !!ng1 && ng1.bg !== YELLOW, ng1);
  t('★印が投函済みでも ✓ を出さない（客12）', !!ng2 && !/✓/.test(ng2.text), ng2);
  t('★マウスを乗せると「投函の対象外」と出る',
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => /客11/.test(r.innerText));
      return tr ? (tr.children[4].getAttribute('title') || '').indexOf('対象外') >= 0 : false;
    }));
  t('★指の形にならない（掴めない）',
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => /客11/.test(r.innerText));
      return tr ? getComputedStyle(tr.children[4]).cursor !== 'pointer' : false;
    }));
  // 赤い行をまたいでドラッグしても、赤だけは変わらない
  await dragCells(page, 0, 9, 11);
  await page.waitForTimeout(500);
  t('★赤い行しか含まない範囲ではポップが出ない', (await popText(page)) === null, await popText(page));
  c0 = await cells(page, 0);
  t('★赤い行は黄色にならないまま', c0.find(x => x.name === '客11').bg !== YELLOW);
  // ★青い行（本予約）も同じ（2026-10-31 ユーザー指示：投函前に本予約が入った分は投函不要）
  const bl = c0.find(x => x.name === '客13');
  t('★本予約の行も黄色にしない（客13）', !!bl && bl.bg !== YELLOW, bl);
  t('★本予約の行も掴めない',
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => /客13/.test(r.innerText));
      return tr ? getComputedStyle(tr.children[4]).cursor !== 'pointer' : false;
    }));
  t('★マウスを乗せると「本予約が入っている」と出る',
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => /客13/.test(r.innerText));
      return tr ? (tr.children[4].getAttribute('title') || '').indexOf('本予約が入っている') >= 0 : false;
    }));
  t('★「📮 投函の印だけ取り込む」のボタンはもう無い',
    !(await page.evaluate(() => /投函の印だけ取り込む/.test(document.body.innerText))));

  // ═══════════════════════════════════════════
  head('⑪ 【2026-11-10 現場報告】選んだもの以外まで選ばれないか');
  // 報告：「選んで、クリックを離すと、選んだもの以外まで選んだような感じになる」。
  // 原因は2つ（実際のブラウザで再現して確かめた）：
  //   ⒜ mouseup を取りこぼすと、ボタンを押していない【ただの hover】で選択が伸び続け、
  //      次にどこかをクリックした瞬間に大きな範囲が確定していた
  //   ⒝ 押したままホイールでスクロールすると、指は動いていないのに
  //      流れてきた行ぜんぶが選ばれていた（319行ある月では必ずスクロールする）
  // いまの画面の黄色いマスを読んでから確かめる（前の節で色が変わっているため）
  const ys = (await cells(page, 0)).map((x, i) => ({ i: i, y: x.bg === YELLOW })).filter(x => x.y).map(x => x.i);
  t('黄色いマスが3つ以上ある（これから使う）', ys.length >= 3, ys);
  const y0 = ys[0], y1 = ys[1], yFar = ys[ys.length - 1];

  // ⒜ ボタンを離した後の hover では伸びない＝その場でドラッグを打ち切る
  await downAt(page, 0, y0);
  await overAt(page, 0, y1, 1);
  await page.waitForTimeout(200);
  t('★ふつうのドラッグでは伸びる（2マス）', (await selRows(page, 0)).length === 2, await selRows(page, 0));
  await overAt(page, 0, yFar, 0);                 // ボタンを離したあとの、ただの hover
  await page.waitForTimeout(200);
  t('★★ボタンを押していない hover では伸びない（打ち切る）', (await selRows(page, 0)).length === 0, await selRows(page, 0));
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await page.waitForTimeout(350);
  t('★★そのあとクリックしてもポップが出ない', (await popText(page)) === null, await popText(page));

  // ⒝ スクロールだけ（座標が同じ mouseover）では伸びない
  await downAt(page, 0, y0);
  await overAt(page, 0, y1, 1);
  await page.waitForTimeout(150);
  await overAt(page, 0, yFar, 1, y1);             // 指は y1 のまま＝スクロールで行が流れてきた時の姿
  await page.waitForTimeout(200);
  t('★★スクロールだけでは選択が伸びない', (await selRows(page, 0)).length === 2, await selRows(page, 0));
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await page.waitForTimeout(400);
  t('★★離した時の件数も2件のまま', popNum(await popText(page)) === 2, await popText(page));
  await clickPop(page, 'キャンセル'); await page.waitForTimeout(300);

  // ⒞ 範囲に「もう投函済み」「対象外」が混ざっていても、水色の数とポップの件数が必ず一致する
  await dragCells(page, 0, y0, 12, false);        // 12 行目＝客13（本予約・対象外）まで
  await page.waitForTimeout(250);
  const selN = (await selRows(page, 0)).length;
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await page.waitForTimeout(400);
  const pn = popNum(await popText(page));
  t('★★水色の数と、ポップの件数が一致する', selN > 0 && selN === pn, { 水色: selN, ポップ: pn });
  await clickPop(page, 'キャンセル'); await page.waitForTimeout(300);

    // ═══════════════════════════════════════════
  head('⑫ 端に寄せると自動で送りながら選ぶ（2026-11-10 ユーザー要望）');
  // 316件を順に消していく作業では、画面に入る20行ほどでは足りない。
  // 代車管理の edgeAutoScroll の縦版。★スクロールだけでは伸ばさない決まり（⑪）と両立させること：
  //   ホイールで眺めるだけなら伸びない／端に寄せている間だけ、送りながら伸びる。
  await page.setViewportSize({ width: 1500, height: 600 });   // 13行が入りきらない高さにする
  await page.waitForTimeout(400);
  const bx = await page.evaluate(() => {
    const el = document.querySelector('[data-custscroll]');
    if (!el) return null;
    el.scrollTop = 0;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), canScroll: el.scrollHeight > el.clientHeight + 20 };
  });
  t('表の入れものに印（data-custscroll）がある', !!bx, bx);
  t('この高さなら縦にスクロールできる', !!bx && bx.canScroll, bx);
  // ★印か高さが無い時は、ここで止めずに飛ばす（下は本物のマウスを動かすので null で落ちるため）
  if (!bx || !bx.canScroll) { console.log('  … 以下の自動送りの検査は飛ばす'); } else {
  const sTop = (p) => p.evaluate(() => { const el = document.querySelector('[data-custscroll]'); return el ? Math.round(el.scrollTop) : -1; });

  // ドラッグしていない時は、端にマウスを置いても送らない
  await page.mouse.move(700, bx.bottom - 20);
  await page.waitForTimeout(500);
  t('★押していない時は端に置いても送らない', (await sTop(page)) === 0, await sTop(page));

  // 見えている黄色いマスで押して、少し下げる
  const yv = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('tbody tr')].forEach((tr, i) => {
      const td = tr.children[4]; if (!td) return;
      const r = td.getBoundingClientRect();
      if (getComputedStyle(td).backgroundColor === 'rgb(255, 242, 0)' && r.top > 300 && r.bottom < 480)
        out.push({ i: i, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    });
    return out;
  });
  t('画面の中ほどに黄色いマスがある（これから使う）', yv.length >= 1, yv);
  const st = yv[0];
  await page.mouse.move(st.x, st.y); await page.mouse.down();
  await page.mouse.move(st.x, st.y + 10);
  await page.waitForTimeout(200);
  const sel0 = (await selRows(page, 0)).length;
  t('押して少し下げると選べている', sel0 >= 1, sel0);

  // 下の端で止める＝自動で送りながら範囲が伸びる
  await page.mouse.move(st.x, bx.bottom - 20);
  await page.waitForTimeout(900);
  const sc1 = await sTop(page);
  const sel1 = (await selRows(page, 0)).length;
  t('★★下の端に置くと自動で送る', sc1 > 20, sc1);
  t('★★送りながら範囲も伸びる', sel1 > sel0, { 前: sel0, 後: sel1 });

  // 端から離すと止まる
  await page.mouse.move(st.x, Math.round((bx.top + bx.bottom) / 2));
  await page.waitForTimeout(400);
  const sc2 = await sTop(page);
  await page.waitForTimeout(500);
  t('★★端から離すと送りが止まる', (await sTop(page)) === sc2, { 離した直後: sc2, その後: await sTop(page) });

  // 離した時の件数は、水色の数とそろっている
  const selEnd = (await selRows(page, 0)).length;
  await page.mouse.up(); await page.waitForTimeout(500);
  const pEnd = popNum(await popText(page));
  t('★★水色の数とポップの件数が一致する', selEnd > 0 && selEnd === pEnd, { 水色: selEnd, ポップ: pEnd });
  await clickPop(page, 'キャンセル'); await page.waitForTimeout(300);

  // 上の端に寄せると上へ送る（見出しの行の下に指が居ても範囲が伸びること）
  // ★13行しか無いので、下げられる量はわずか（150px ほど）。少し下げてから上へ送る。
  let low = null, startTop = 0;
  for (const tryTop of [150, 120, 90, 60]) {
    low = await page.evaluate((tt) => {
      const el = document.querySelector('[data-custscroll]'); el.scrollTop = tt;
      const rows = [...document.querySelectorAll('tbody tr')];
      for (let i = rows.length - 1; i >= 0; i--) {
        const td = rows[i].children[4]; if (!td) continue;
        const r = td.getBoundingClientRect();
        // EDGE(70) の外＝自動送りが始まらない所に居る黄色いマスを探す
        if (getComputedStyle(td).backgroundColor === 'rgb(255, 242, 0)'
          && r.top > 345 && r.bottom < window.innerHeight - 80)
          return { i: i, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(el.scrollTop) };
      }
      return null;
    }, tryTop);
    await page.waitForTimeout(200);
    if (low) { startTop = low.top; break; }
  }
  t('下げた所に黄色いマスがある（これから使う）', !!low && startTop > 20, { low: low, startTop: startTop });
  await page.mouse.move(low.x, low.y); await page.mouse.down();
  await page.mouse.move(low.x, low.y - 10);
  const selU0 = (await selRows(page, 0)).length;
  await page.mouse.move(low.x, bx.top + 20);     // 見出しの行のあたり（EDGE の中）
  await page.waitForTimeout(900);
  const scU = await sTop(page);
  const selU1 = (await selRows(page, 0)).length;
  t('★★上の端に置くと上へ送る', scU < startTop - 20, { 前: startTop, 後: scU });
  t('★★見出しの下に指が居ても範囲が伸びる', selU1 > selU0, { 前: selU0, 後: selU1 });
  await page.mouse.up(); await page.waitForTimeout(400);
  await clickPop(page, 'キャンセル'); await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.waitForTimeout(300);

    head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
