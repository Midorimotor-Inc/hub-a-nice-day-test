// スタッフ休日：全員の表示は【表（スタッフ×日）】（v3.131.0 → v3.132.0・2026-11-25 ユーザー決定）
//   ユーザーの言葉：「印刷の全体表示が良かったので、ウェブで見る表示も全体表示は表に。
//   個人に切り替えた時は、カレンダーの中に休みを入れる今まで通りの方法で」。
//   表が出る所は2つ（同じ部品 StaffOffTable）：
//     ・カレンダー画面の「🏖 休日」（見るだけ）… 表示：全員＝表／名前を選ぶ＝今まで通りのカレンダー。🖨 印刷もここ
//     ・設定の「スタッフ休日・有給カレンダー」（入れる所）… 全員表示＝表／名前を選ぶ＝今まで通りのカレンダー
//   ・表は見るだけ。氏名を押すとその人のカレンダーへ
//   ・数字は印刷の表と同じ（同じ staffOffSum・staffOffMonth を使う）
//   ★日付は「今月」から作る（決め打ちにしない）。第2火曜（8〜14日）は休業日なので使わない。
//   実行: node staff_table_test.js      見た目も撮る: SHOT=<保存先のフォルダ> node staff_table_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8541, STOR = 'hub-v8-dev-';
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

// 画面の表を読む
const readTable = (page) => page.evaluate(() => {
  const tb = document.querySelector('[data-offtable]');
  if (!tb) return null;
  const wrap = document.querySelector('[data-offtablewrap]');
  const rows = [...tb.querySelectorAll('tr[data-offrow]')].map(tr => {
    const name = tr.getAttribute('data-offrow');
    const cells = {}; [...tr.querySelectorAll('[data-offcell]')].forEach(td => { cells[td.getAttribute('data-offcell').split('/').pop()] = { kind: td.getAttribute('data-offkind'), text: td.innerText.trim(), title: td.getAttribute('title') || '' }; });
    const tot = {}; [...tr.querySelectorAll('[data-offtot]')].forEach(td => { tot[td.getAttribute('data-offtot')] = td.innerText.trim(); });
    const nameTd = tr.children[0];
    return { name, label: nameTd.innerText.trim(), cursor: getComputedStyle(nameTd).cursor, cells, tot };
  });
  const cnt = {}; [...tb.querySelectorAll('[data-offcnt]')].forEach(td => { cnt[td.getAttribute('data-offcnt')] = td.innerText.trim(); });
  const heads = [...tb.querySelectorAll('[data-offhead]')].map(th => th.innerText.trim());
  const box = (tb.closest('.modal-box') || tb.closest('[data-offtablewrap]')).getBoundingClientRect();
  return { rows, cnt, heads, fitW: wrap.scrollWidth <= wrap.clientWidth + 1, boxW: Math.round(box.width), inView: box.left >= 0 && box.right <= window.innerWidth + 1,
    rowH: [...tb.querySelectorAll('tr[data-offrow]')].map(tr => Math.round(tr.getBoundingClientRect().height)) };
});
const hasGrid = (page) => page.evaluate(() => {
  // 個別のカレンダー＝曜日の見出し7つが grid で並ぶ
  return [...document.querySelectorAll('.modal-box div')].some(d => getComputedStyle(d).display === 'grid' && d.children.length === 7 && d.innerText.replace(/\s/g, '') === '日月火水木金土');
});
const DIM = new Date(Y, M + 1, 0).getDate();

(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launch({ headless: true });
  const SHOT = process.env.SHOT || '';

  // ────────────────────────────────────────────────────────
  head('① 管理者：開いた直後は自分のカレンダー（今まで通り）');
  const A = await start({ email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', cert: { isAdmin: true } });
  const pa = A.page;
  t('休日カレンダーが開く', A.opened);
  t('★名前を選んでいる時は、今まで通りのカレンダー（表は出ない）', (await hasGrid(pa)) && !(await readTable(pa)));
  t('名前を選んでいる時は、下に集計のバッジが出る（今まで通り）', await pa.evaluate(() => /集計/.test(document.querySelector('.modal-box').innerText)));

  head('② 「全員表示」＝表（スタッフ×日）');
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '全員表示'); if (b) b.click(); });
  await pa.waitForTimeout(700);
  let T = await readTable(pa);
  t('★表が出る', !!T);
  t('★カレンダー（7列の升目）は出ない', !(await hasGrid(pa)));
  const row = n => (T.rows.find(r => r.name === n) || { cells: {}, tot: {} });
  t('★行＝名簿の3人＋名簿に無い名前1人', T && T.rows.length === 4 && ['江川京志', '竹林直行', '魚住圭', '旧名太郎'].every(n => T.rows.some(r => r.name === n)), T && T.rows.map(r => r.name));
  t('★名簿に無い名前には ⚠ が付く', /⚠/.test(row('旧名太郎').label) && !/⚠/.test(row('竹林直行').label), row('旧名太郎').label);
  t('★列＝その月の日数ぶん', T.heads.length === DIM && T.heads[0] === '1' && T.heads[DIM - 1] === String(DIM), T.heads.length);
  t('★休日は「休」', row('竹林直行').cells['3'].kind === 'off' && row('竹林直行').cells['3'].text === '休' && row('魚住圭').cells['3'].kind === 'off' && row('江川京志').cells['17'].text === '休');
  t('★有給は「有」', row('魚住圭').cells['5'].kind === 'leave' && row('魚住圭').cells['5'].text === '有');
  t('★研修は「研」', row('竹林直行').cells['18'].kind === 'trn' && row('竹林直行').cells['18'].text === '研');
  t('★店の休業日は全員「店休」', T.rows.every(r => r.cells[String(CLOSED_DAY)].kind === 'closed' && r.cells[String(CLOSED_DAY)].text === '店休'));
  t('★何も無い日は空', row('江川京志').cells['3'].kind === '' && row('江川京志').cells['3'].text === '');
  // ★スタッフの行を1つ飛びで薄い網掛け＝横のライン（v3.132.2・2026-11-25 ユーザー指示：「横ラインで。縦じゃありません」）
  {
    const bg = await pa.evaluate(([cd]) => { const g = (n, k) => { const e = document.querySelector('[data-offcell="' + n + '/' + k + '"]'); return e ? getComputedStyle(e).backgroundColor : ''; };
      const names = [...document.querySelectorAll('tr[data-offrow]')].map(tr => tr.getAttribute('data-offrow'));
      const free = [1, 2, 6, 7].filter(d => d !== cd);
      return { names, rows: names.map(n => free.map(d => g(n, d))), closed: names.map(n => g(n, cd)),
        tot: names.map(n => getComputedStyle(document.querySelector('tr[data-offrow="' + n + '"] [data-offtot="offs"]')).backgroundColor),
        cnt: [1, 2].map(d => getComputedStyle(document.querySelector('[data-offcnt="' + d + '"]')).backgroundColor) }; }, [CLOSED_DAY]);
    const W = 'rgb(255, 255, 255)';
    t('★1行目・3行目は白／2行目・4行目は薄い網掛け（横のライン）', bg.rows[0].every(c => c === W) && bg.rows[2].every(c => c === W) && bg.rows[1].every(c => c !== W) && bg.rows[3].every(c => c !== W) && new Set(bg.rows[1].concat(bg.rows[3])).size === 1, bg.rows);
    t('★同じ行の中では、日が変わっても色が変わらない（縦には掛けない）', bg.rows.every(r => new Set(r).size === 1), bg.rows);
    t('★右端の数字の欄も、同じ行は同じ網掛け', bg.tot[0] === bg.tot[2] && bg.tot[1] === bg.tot[3] && bg.tot[0] !== bg.tot[1], bg.tot);
    t('★「休みの人数」の行には掛けない', bg.cnt[0] === bg.cnt[1], bg.cnt);
    t('★休業日の赤は網掛けより優先（どの行でも赤のまま）', bg.closed.every(c => c === 'rgb(254, 202, 202)'), bg.closed);
  }
  t('★メモは、なぞると出る', /午後休/.test(row('竹林直行').cells['3'].title), row('竹林直行').cells['3'].title);
  t('★「休みの人数」＝休日＋有給（研修は数えない）', T.cnt['3'] === '2' && T.cnt['5'] === '1' && T.cnt['18'] === '' && T.cnt[String(CLOSED_DAY)] === '', [T.cnt['3'], T.cnt['5'], T.cnt['18']]);
  t('★横にはみ出さない（スクロールなしで1か月が見える）', T.fitW && T.inView, { fitW: T.fitW, boxW: T.boxW });
  t('★表の時は窓が広がる', T.boxW > 1000, T.boxW);
  t('全員表示の時、下の集計のバッジは出さない（右端に同じ数字がある）', await pa.evaluate(() => !/📊/.test(document.querySelector('.modal-box').innerText)));
  if (SHOT) await pa.screenshot({ path: path.join(SHOT, 'staff_table_all.png') });

  head('③ 設定の画面には印刷ボタンを置かない');
  t('★設定の「スタッフ休日・有給カレンダー」に 🖨 印刷が無い', !(await pa.$('.modal-box [data-offprint]')));
  t('研修は「計」に入らない（竹林＝休日だけの数）', Number(row('竹林直行').tot.sum) === Number(row('竹林直行').tot.offs) + Number(row('竹林直行').tot.leaves) && row('竹林直行').tot.trn === '1', row('竹林直行').tot);

  head('④ 表の氏名を押すと、その人のカレンダー（今まで通り）');
  await pa.evaluate(() => { const td = document.querySelector('tr[data-offrow="竹林直行"] td'); if (td) td.click(); });
  await pa.waitForTimeout(700);
  t('★カレンダーに切り替わる（表は消える）', (await hasGrid(pa)) && !(await readTable(pa)));
  t('★種類（休日・有給・研修）のボタンが出る＝今まで通り入れられる', await pa.evaluate(() => /🏖 休日/.test(document.querySelector('.modal-box').innerText) && /📋 有給/.test(document.querySelector('.modal-box').innerText)));
  // カレンダーで 25日 に休日を入れる → 全員表示に戻ると表に出る
  await pa.evaluate(() => {
    const cells = [...document.querySelectorAll('.modal-box div')].filter(d => d.style && d.style.minHeight === '82px');
    const c = cells.find(d => { const s = d.querySelector('span'); return s && s.innerText.trim() === '25'; }); if (c) c.click();
  });
  await pa.waitForTimeout(700);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '全員表示'); if (b) b.click(); });
  await pa.waitForTimeout(700);
  T = await readTable(pa);
  t('★カレンダーで入れた休みが、表にすぐ出る', T && (T.rows.find(r => r.name === '竹林直行') || { cells: {} }).cells['25'] && T.rows.find(r => r.name === '竹林直行').cells['25'].kind !== '', T && T.rows.find(r => r.name === '竹林直行').cells['25']);
  t('表のマスを押しても何も変わらない（見るだけ）', await (async () => {
    const before = JSON.stringify(await readTable(pa));
    await pa.evaluate(() => { const td = document.querySelector('[data-offcell="江川京志/26"]'); if (td) td.click(); });
    await pa.waitForTimeout(500);
    return before === JSON.stringify(await readTable(pa));
  })());

  head('⑤ 月を送る／店を切り替える');
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].filter(e => e.querySelector('svg') && !e.innerText.trim())[1]; if (b) b.click(); });
  await pa.waitForTimeout(700);
  T = await readTable(pa);
  const DIM2 = new Date(Y, M + 2, 0).getDate();
  t('★次の月でも表のまま・日数が変わる', T && T.heads.length === DIM2, T && T.heads.length);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '三田店'); if (b) b.click(); });
  await pa.waitForTimeout(700);
  T = await readTable(pa);
  t('★三田店に切り替えると、三田店の人の表', T && T.rows.length === 1 && T.rows[0].name === '藤原昭人', T && T.rows.map(r => r.name));
  t('画面のエラーなし（管理者）', A.errs.length === 0, A.errs.slice(0, 2));
  await A.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑥ 一般スタッフ：表は全員ぶん見られる／押せる氏名は自分だけ');
  const B = await start({ email: 'tikurin@midori-m.com', fbuid: 'uid_tk', uid: 'h3', name: '竹林直行', store: 'honten', role: 'staff' });
  const pb = B.page;
  await pb.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '全員表示'); if (b) b.click(); });
  await pb.waitForTimeout(700);
  T = await readTable(pb);
  t('★表に全員が出る（ほかの人の休みも見られる）', T && T.rows.length === 4);
  t('★押せるのは自分の氏名だけ', T && T.rows.find(r => r.name === '竹林直行').cursor === 'pointer' && T.rows.filter(r => r.name !== '竹林直行').every(r => r.cursor !== 'pointer'), T && T.rows.map(r => [r.name, r.cursor]));
  await pb.evaluate(() => { const td = document.querySelector('tr[data-offrow="魚住圭"] td'); if (td) td.click(); });
  await pb.waitForTimeout(500);
  t('★ほかの人の氏名を押しても切り替わらない', !!(await readTable(pb)));
  await pb.evaluate(() => { const td = document.querySelector('tr[data-offrow="竹林直行"] td'); if (td) td.click(); });
  await pb.waitForTimeout(600);
  t('★自分の氏名を押すと自分のカレンダー', (await hasGrid(pb)) && !(await readTable(pb)));
  t('画面のエラーなし（一般スタッフ）', B.errs.length === 0, B.errs.slice(0, 2));
  await B.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑦ カレンダー画面の「🏖 休日」：全員＝表／名前を選ぶ＝今まで通り／🖨 印刷と同じ数字');
  const V = await start({ email: 'tikurin@midori-m.com', fbuid: 'uid_tk', uid: 'h3', name: '竹林直行', store: 'honten', role: 'staff' });
  const pv = V.page;
  // 設定の画面を閉じて、カレンダー画面 →「🏖 休日」
  await pv.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => /確定して閉じる/.test(e.innerText)); if (b) b.click(); });
  await pv.waitForTimeout(600);
  await pv.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.replace(/\s/g, '') === 'カレンダー' && e.offsetParent !== null); if (b) b.click(); });
  await pv.waitForTimeout(1200);
  await pv.evaluate(() => { const b = document.querySelector('button[title="休日カレンダー"]'); if (b) b.click(); });
  await pv.waitForTimeout(1200);
  const vPick = async (name) => { await pv.evaluate(n => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === n && e.offsetParent !== null && !e.closest('[data-offtable]')); if (b) b.click(); }, name); await pv.waitForTimeout(600); };
  t('開いた直後は自分のカレンダー（前からの動き・表は出ない）', await pv.evaluate(() => !!document.querySelector('[data-offview="one"]') && !document.querySelector('[data-offtable]')));
  await vPick('全員');
  T = await readTable(pv);
  const vrow = n => (T.rows.find(r => r.name === n) || { cells: {}, tot: {} });
  t('★「全員」を選ぶと表（スタッフ×日）', !!T && await pv.evaluate(() => !!document.querySelector('[data-offview="all"]')));
  t('★行＝名簿の3人＋名簿に無い名前1人', T && T.rows.length === 4, T && T.rows.map(r => r.name));
  t('★休・有・研・店休が出る', vrow('竹林直行').cells['3'].text === '休' && vrow('魚住圭').cells['5'].text === '有' && vrow('竹林直行').cells['18'].text === '研' && vrow('江川京志').cells[String(CLOSED_DAY)].text === '店休');
  t('★「休みの人数」', T.cnt['3'] === '2' && T.cnt['5'] === '1', [T.cnt['3'], T.cnt['5']]);
  t('★横にはみ出さない', T.fitW, { fitW: T.fitW, boxW: T.boxW });
  t('★ここでは誰の氏名も押せる（上の名前ボタンと同じ）', T.rows.filter(r => r.name !== '旧名太郎').every(r => r.cursor === 'pointer') && vrow('旧名太郎').cursor !== 'pointer', T.rows.map(r => [r.name, r.cursor]));
  if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_all.png') });
  // 印刷と突き合わせる
  await pv.evaluate(() => { window.__printed = ''; });
  await pv.click('[data-offprint]');
  await pv.waitForTimeout(900);
  {
    const printed = await pv.evaluate(() => window.__printed);
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await p.setContent(printed, { waitUntil: 'load' });
    const pr = await p.evaluate(() => [...document.querySelectorAll('table.tb tr')].map(tr => [...tr.children].map(c => c.innerText.replace(/\s+/g, ' ').trim())));
    await ctx.close();
    const same = T.rows.every(r => {
      const q = pr.find(x => x[0] === r.name); if (!q) return false;
      const n = q.length;
      return q[n - 5] === r.tot.offs && q[n - 4] === r.tot.leaves && q[n - 3] === r.tot.sum && q[n - 2] === r.tot.trn && q[n - 1] === r.tot.carry
        && Object.keys(r.cells).every(d => (q[Number(d)] || '') === r.cells[d].text);
    });
    t('★★4人とも、マスの中身も右端の数字も印刷とまったく同じ', same, { screen: T.rows.map(r => [r.name, r.tot]), print: pr.slice(2, 6).map(q => q.slice(-5)) });
  }
  // 氏名を押す → その人のカレンダー（今まで通り）→ 全員で表に戻る
  await pv.evaluate(() => { const td = document.querySelector('tr[data-offrow="魚住圭"] td'); if (td) td.click(); });
  await pv.waitForTimeout(700);
  t('★表の氏名を押すと、その人のカレンダー（今まで通りの見た目）', await pv.evaluate(() => !!document.querySelector('[data-offview="one"]') && !document.querySelector('[data-offtable]') && /魚住圭さん/.test(document.body.innerText)));
  t('★印刷ボタンもその人を刷る表示になる', await pv.evaluate(() => (document.querySelector('[data-offprint]') || { getAttribute: () => '' }).getAttribute('data-offprintwho') === '魚住圭'));
  if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_one.png') });
  await vPick('全員');
  t('★「全員」で表に戻る', !!(await readTable(pv)));
  await pv.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); });
  await pv.waitForTimeout(600);
  T = await readTable(pv);
  t('★月を送っても表のまま・日数が変わる', T && T.heads.length === new Date(Y, M + 2, 0).getDate(), T && T.heads.length);
  t('画面のエラーなし（🏖 休日）', V.errs.length === 0, V.errs.slice(0, 2));
  await V.ctx.close();

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log(fail ? ('✖ 失敗 ' + fail + ' / 成功 ' + pass) : ('✅ PASS  成功 ' + pass + ' / 失敗 0'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
