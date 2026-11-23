// スタッフ休日・有給カレンダーの 🖨 印刷（v3.129.0・2026-11-23 ユーザー要望）
//   「スタッフ休日の、全体（店舗）・スタッフ個別で、印刷できるように、印刷ボタンをつけてください」
//   ・上の帯の「🖨 印刷」→ 小さなメニュー →「店舗 全体」か スタッフの名前
//   ・店舗全体＝【表型（スタッフ×日）】（B案・ユーザー決定）／個別＝その人だけの1か月
//   ・A4 横・1枚に収める／外から何も読み込まない／集計は画面と同じ数え方
//   ・個別で選べる人：管理者＝全員／一般スタッフ＝自分だけ（全体は誰でも）
//   ・名簿に無い名前も、その月に休みが入っていれば全体の表に出す（黙って消さない）
//   ★window.open をにせ物にして、印刷に出す HTML をそのまま受け取る（印刷ダイアログは出さない）。
//   ★日付は「今月」から作る（決め打ちにしない）。第2火曜（8〜14日）は休業日なので使わない。
//   実行: node staff_print_test.js      見た目も撮る: SHOT=<保存先のフォルダ> node staff_print_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8529, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(NL + '■ ' + s);

const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const dk = d => Y + '-' + (M + 1) + '-' + d;
const iso = d => Y + '-' + String(M + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const YM = Y + '年' + (M + 1) + '月';
const CLOSED_DAY = 20;   // 手で入れた休業日

const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten', badge: 'mechanic' },
    { uid: 'h4', name: '魚住圭', myNumber: 4, store: 'honten', badge: 'mechanic' }],
  [STOR + 'sanda-staff-v2']: [{ uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  // 3日＝竹林・魚住が休日／4日＝竹林が休日／5日＝魚住が有給／17日＝江川が休日／18日＝竹林が研修
  // 24日＝名簿に無い名前（名前を変えた人）が休日／20日＝店の休業日
  [STOR + 'honten-dayoff']: { [dk(3)]: ['竹林直行', '魚住圭'], [dk(4)]: ['竹林直行'], [dk(17)]: ['江川京志'], [dk(24)]: ['旧名太郎'] },
  [STOR + 'honten-pleave']: { [dk(5)]: ['魚住圭'] },
  [STOR + 'honten-training']: { [dk(18)]: ['竹林直行'] },
  [STOR + 'honten-offnote']: { [dk(3) + '::竹林直行']: '午後休' },
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [iso(CLOSED_DAY)],
  [STOR + 'mholidays']: { [Y + '-' + (M + 1)]: 9 },
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};

let server, browser;
const start = async (me) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([Object.assign({ uid: me.uid, name: me.name, store: me.store, email: me.email }, me.cert || {})]));
    localStorage.setItem(stor + 'auth-kind', 'own');
    // window.open をにせ物にして、印刷に出す HTML をそのまま受け取る
    window.__printed = ''; window.__opened = [];
    window.open = function (u, n) {
      window.__opened.push([u, n]);
      return { document: { write: h => { window.__printed += h; }, close: () => {} }, print: () => { window.__printCalled = true; }, focus: () => {}, close: () => {} };
    };
  }, [me, STOR, seed]);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await see(me.name); await click(me.name); await click('でログイン');
  await see('スケジュール');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);
  // 🏖 の欄 → 休日スタッフ → フルのカレンダー
  await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => (d.title || '').includes('クリックして休日スタッフを編集') || (d.title || '').includes('店休日のため全員休み')); if (el) el.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /スタッフ休日・有給カレンダーを開く/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(1500);
  const opened = await see('スタッフ休日・有給カレンダー', 6000);
  return { ctx, page, errs, opened };
};
// 受け取った印刷の HTML を別のページに描いて中身を読む
const readSheet = async (html, shot) => {
  const ctx = await browser.newContext({ viewport: { width: 1123, height: 794 } });
  const p = await ctx.newPage();
  const reqs = []; p.on('request', r => { if (!/^(about:|data:)/.test(r.url())) reqs.push(r.url()); });
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const sh = document.querySelector('.sheet');
    const rows = [...document.querySelectorAll('table.tb tr')].map(tr => [...tr.children].map(c => c.innerText.replace(/\s+/g, ' ').trim()));
    const cells = [...document.querySelectorAll('.one td')].map(td => td.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { mode: sh ? sh.getAttribute('data-printmode') : null, title: document.title, h1: (document.querySelector('h1') || {}).innerText || '',
      fitH: sh ? sh.scrollHeight <= sh.clientHeight + 1 : false, fitW: sh ? sh.scrollWidth <= sh.clientWidth + 1 : false,
      rows, cells, big: (document.querySelector('.big') || {}).innerText || '', text: document.body.innerText };
  });
  if (shot) await p.screenshot({ path: shot });
  await ctx.close();
  r.reqs = reqs;
  return r;
};

(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launch({ headless: true });

  // ══ 管理者 ══
  head('① 管理者：上の帯に 🖨 印刷／押すとメニュー');
  let c = await start({ email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', cert: { isAdmin: true } });
  t('休日カレンダーが開く', c.opened);
  const page = c.page;
  t('★🖨 印刷のボタンがある', await page.evaluate(() => { const b = document.querySelector('[data-offprint]'); return !!b && b.offsetParent !== null && /印刷/.test(b.innerText); }));
  t('押す前はメニューが出ていない', !(await page.$('[data-offprintmenu]')));
  await page.click('[data-offprint]');
  await page.waitForTimeout(200);
  const menu = await page.evaluate(() => { const m = document.querySelector('[data-offprintmenu]'); if (!m) return null;
    const r = m.getBoundingClientRect();
    return { text: m.innerText, all: !!m.querySelector('[data-offprintall]'), ones: [...m.querySelectorAll('[data-offprintone]')].map(b => b.getAttribute('data-offprintone')), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
  t('★メニューが出る（画面の中に収まる）', !!menu && menu.inView, menu);
  t('★いまの月と店が書いてある', !!menu && menu.text.indexOf(YM) >= 0 && menu.text.indexOf('本店') >= 0, menu && menu.text);
  t('★「全体を印刷」がある', !!menu && menu.all);
  t('★管理者は全員の名前が並ぶ', !!menu && menu.ones.join(',') === '江川京志,竹林直行,魚住圭', menu && menu.ones);

  head('② 店舗全体＝スタッフ×日の表');
  await page.click('[data-offprintall]');
  await page.waitForTimeout(900);
  const st1 = await page.evaluate(() => ({ html: window.__printed, opened: window.__opened, printed: !!window.__printCalled, menu: !!document.querySelector('[data-offprintmenu]') }));
  t('★印刷の窓を開く（名前は _blank）', st1.opened.length === 1 && st1.opened[0][1] === '_blank', st1.opened);
  t('★印刷を呼ぶ', st1.printed);
  t('刷ったらメニューは閉じる', !st1.menu);
  t('★A4 横', /@page\{size:A4 landscape/.test(st1.html));
  t('★外から何も読み込まない（http・src・link・script なし）', !/https?:\/\//.test(st1.html) && !/\ssrc=/.test(st1.html) && !/<link/i.test(st1.html) && !/<script/i.test(st1.html));
  const A = await readSheet(st1.html, process.env.SHOT ? path.join(process.env.SHOT, 'staff_print_all.png') : null);
  t('表型で出ている', A.mode === 'table', A.mode);
  t('★見出し：年月・店・（全体）', A.h1.indexOf(YM) >= 0 && A.h1.indexOf('本店') >= 0 && A.h1.indexOf('（全体）') >= 0, A.h1);
  t('★1枚に収まる（縦も横もはみ出さない）', A.fitH && A.fitW, [A.fitH, A.fitW]);
  t('描く時も外へ取りに行かない', A.reqs.length === 0, A.reqs);
  const days = new Date(Y, M + 1, 0).getDate();
  const rowOf = n => A.rows.find(r => r[0] === n) || [];
  const cell = (n, d) => rowOf(n)[d];                      // [0]=氏名・[1..days]=日
  const tot = (n, i) => rowOf(n)[days + 1 + i];           // 0=休日 1=有給 2=計 3=研修 4=繰り越し
  const tk = rowOf('竹林直行'), closedN = tk.slice(1, days + 1).filter(x => x === '店休').length;
  t('日の列が月の日数ぶんある', (A.rows[0] || []).length === 1 + days + 5, (A.rows[0] || []).length);
  t('★名簿の3人の行がある', ['江川京志', '竹林直行', '魚住圭'].every(n => rowOf(n).length > 0), A.rows.map(r => r[0]));
  t('★竹林：3日・4日が「休」', cell('竹林直行', 3) === '休' && cell('竹林直行', 4) === '休', [cell('竹林直行', 3), cell('竹林直行', 4)]);
  t('★竹林：18日が「研」', cell('竹林直行', 18) === '研', cell('竹林直行', 18));
  t('★魚住：3日が「休」・5日が「有」', cell('魚住圭', 3) === '休' && cell('魚住圭', 5) === '有', [cell('魚住圭', 3), cell('魚住圭', 5)]);
  t('★江川：17日が「休」', cell('江川京志', 17) === '休', cell('江川京志', 17));
  t('★休業日（20日）は全員「店休」', ['江川京志', '竹林直行', '魚住圭'].every(n => cell(n, CLOSED_DAY) === '店休'), cell('竹林直行', CLOSED_DAY));
  t('何も無い日は空欄', cell('江川京志', 3) === '' && cell('魚住圭', 4) === '', [cell('江川京志', 3), cell('魚住圭', 4)]);
  t('★名簿に無い名前も行に出る（24日が「休」）', cell('旧名太郎', 24) === '休', A.rows.map(r => r[0]));
  t('★集計は画面と同じ：竹林の休日＝2＋店休日', closedN >= 1 && tot('竹林直行', 0) === String(2 + closedN), [closedN, tot('竹林直行', 0)]);
  t('★魚住：有給1・計＝休日＋有給', tot('魚住圭', 1) === '1' && tot('魚住圭', 2) === String(1 + closedN + 1), [tot('魚住圭', 0), tot('魚住圭', 1), tot('魚住圭', 2)]);
  t('★研修は別の列（竹林1）・休みの計に入れない', tot('竹林直行', 3) === '1' && tot('竹林直行', 2) === String(2 + closedN), [tot('竹林直行', 2), tot('竹林直行', 3)]);
  const cnt = A.rows.find(r => r[0] === '休みの人数') || [];
  t('★「休みの人数」：3日＝2人・5日＝1人・休業日は空欄', cnt[3] === '2' && cnt[5] === '1' && cnt[CLOSED_DAY] === '', [cnt[3], cnt[5], cnt[CLOSED_DAY]]);
  t('凡例に 休・有・研・休業日', ['休日', '有給', '研修', '休業日'].every(w => A.text.indexOf(w) >= 0));

  head('③ スタッフ個別');
  await page.evaluate(() => { window.__printed = ''; window.__opened = []; window.__printCalled = false; });
  await page.click('[data-offprint]');
  await page.waitForTimeout(200);
  await page.click('[data-offprintone="竹林直行"]');
  await page.waitForTimeout(900);
  const st2 = await page.evaluate(() => ({ html: window.__printed, opened: window.__opened, printed: !!window.__printCalled }));
  t('★印刷の窓を開いて印刷を呼ぶ', st2.opened.length === 1 && st2.printed, st2.opened);
  const B = await readSheet(st2.html, process.env.SHOT ? path.join(process.env.SHOT, 'staff_print_one.png') : null);
  t('個別で出ている', B.mode === 'one', B.mode);
  t('★見出し：年月・店・その人の名前', B.h1.indexOf(YM) >= 0 && B.h1.indexOf('本店') >= 0 && B.h1.indexOf('竹林直行 さん') >= 0, B.h1);
  t('★1枚に収まる', B.fitH && B.fitW, [B.fitH, B.fitW]);
  const cellOf = d => B.cells.find(x => new RegExp('^' + d + '(\\s|$)').test(x)) || '';
  t('★3日は「休日」＋メモ「午後休」', cellOf(3).indexOf('休日') >= 0 && cellOf(3).indexOf('午後休') >= 0, cellOf(3));
  t('★4日は「休日」', cellOf(4).indexOf('休日') >= 0, cellOf(4));
  t('★18日は「研修」', cellOf(18).indexOf('研修') >= 0, cellOf(18));
  t('★20日は「休業日」', cellOf(CLOSED_DAY).replace(/\s/g, '').indexOf('休業日') >= 0, cellOf(CLOSED_DAY));
  t('★ほかの人の休み（17日＝江川）は出ない', cellOf(17) === '17', cellOf(17));
  t('★下の集計：休日＝2＋店休日・研修1', new RegExp('休日\\s*' + (2 + closedN) + '\\s*日').test(B.big) && /研修\s*1\s*日/.test(B.big), B.big);
  t('★外から何も読み込まない', !/https?:\/\//.test(st2.html) && !/<script/i.test(st2.html) && B.reqs.length === 0);

  head('④ メニューはほかを押すと閉じる／月を変えるとその月を刷る');
  await page.click('[data-offprint]');
  await page.waitForTimeout(150);
  await page.evaluate(() => { const el = [...document.querySelectorAll('span')].find(e => /^\d{4}年\d{1,2}月$/.test(e.innerText.trim()) && e.offsetParent !== null); if (el) el.click(); });
  await page.waitForTimeout(200);
  t('★ほかを押すとメニューが閉じる', !(await page.$('[data-offprintmenu]')));
  t('カレンダーは閉じていない', await page.evaluate(() => document.body.innerText.includes('スタッフ休日・有給カレンダー')));
  // 次の月へ（月ナビの右の矢印＝年月の字のすぐ次のボタン）
  await page.evaluate(() => { const el = [...document.querySelectorAll('span')].find(e => /^\d{4}年\d{1,2}月$/.test(e.innerText.trim()) && e.offsetParent !== null); const b = el && el.nextElementSibling; if (b) b.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__printed = ''; });
  await page.click('[data-offprint]');
  await page.waitForTimeout(150);
  await page.click('[data-offprintall]');
  await page.waitForTimeout(700);
  const nx = new Date(Y, M + 1, 1), NYM = nx.getFullYear() + '年' + (nx.getMonth() + 1) + '月';
  const h3 = await page.evaluate(() => window.__printed);
  t('★開いている月（次の月）の表が出る', h3.indexOf(NYM) >= 0 && h3.indexOf('旧名太郎') < 0, NYM);
  t('JSエラーが出ていない（管理者）', c.errs.length === 0, c.errs.slice(0, 3));
  await c.ctx.close();

  // ══ 一般スタッフ ══
  head('⑤ 一般スタッフ：全体と自分だけ');
  c = await start({ email: 'tikurin@midori-m.com', fbuid: 'uid_tk', uid: 'h3', name: '竹林直行', store: 'honten', role: 'staff' });
  t('休日カレンダーが開く', c.opened);
  await c.page.click('[data-offprint]');
  await c.page.waitForTimeout(200);
  const m2 = await c.page.evaluate(() => { const m = document.querySelector('[data-offprintmenu]'); return m ? { all: !!m.querySelector('[data-offprintall]'), ones: [...m.querySelectorAll('[data-offprintone]')].map(b => b.getAttribute('data-offprintone')) } : null; });
  t('★全体は刷れる', !!m2 && m2.all, m2);
  t('★個別は自分の名前だけ', !!m2 && m2.ones.join(',') === '竹林直行', m2 && m2.ones);
  await c.page.click('[data-offprintall]');
  await c.page.waitForTimeout(700);
  const h4 = await c.page.evaluate(() => window.__printed);
  t('全体の表が出る（他の人の行もある＝画面の「全員表示」と同じ）', h4.indexOf('data-printmode="table"') >= 0 && h4.indexOf('魚住圭') >= 0);
  t('JSエラーが出ていない（一般）', c.errs.length === 0, c.errs.slice(0, 3));
  await c.ctx.close();

  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
