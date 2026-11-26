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
  // ★会社の休日数の札は、表の上の行の右端＝「休日〜繰り越し」の列の真上（v3.134.1・2026-11-26 ユーザー決定・モックの「B・言葉2・緑」）
  //   「会社の設定された休日が今左上にあるので、表を少し下にずらして、印刷・車検・休日のボタンの下の行の右端に。
  //    休日・有給・計と書いてあるあたりの上に入れたら、真上にあるので見やすい」
  const mhPos = (pg) => pg.evaluate(() => {
    const all = [...document.querySelectorAll('[data-mhbadge]')].filter(e => e.offsetParent !== null);
    const mh = document.querySelector('[data-offview="all"] [data-offtop] [data-mhbadge]');
    const th = [...document.querySelectorAll('[data-offtable] thead tr:first-child th')].find(e => e.innerText.trim() === '休日');
    const wrap = document.querySelector('[data-offtablewrap]');
    if (!mh || !th || !wrap) return { n: all.length, has: false };
    const r = mh.getBoundingClientRect(), a = th.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const rgb = v => (String(v).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return { n: all.length, has: true, kind: mh.getAttribute('data-mhbadge'), text: mh.innerText.replace(/\s+/g, ''),
      dL: Math.round(r.left - a.left), dR: Math.round(r.right - w.right), above: r.bottom <= w.top, gap: Math.round(w.top - r.bottom), wrapTop: Math.round(w.top),
      bd: rgb(getComputedStyle(mh).borderTopColor), btn: !!mh.querySelector('[data-mhbtn]'), edit: mh.hasAttribute('data-mhedit'), h: Math.round(r.height) };
  });
  let MH = await mhPos(pv);
  t('★会社の休日数の札は表の上の行にある（左上には出さない＝1つだけ）', MH.has && MH.n === 1 && MH.kind === 'wide' && MH.above, MH);
  t('★札の左端＝「休日」の列の左端／右端＝表の枠の右端（真上にぴったり）', MH.has && Math.abs(MH.dL) <= 3 && Math.abs(MH.dR) <= 3, MH);
  t('★言葉は「N月 会社の休日数 9日」', MH.has && MH.text.indexOf((M + 1) + '月会社の休日数9日') === 0, MH.text);
  t('★札は緑系', MH.has && MH.bd[1] > MH.bd[0] && MH.bd[1] > MH.bd[2], MH.bd);
  t('★管理者でない人には「変更」を出さない', MH.has && !MH.btn, MH);
  // ★v3.134.2（2026-11-26 ユーザー指示）：「オレンジで休日、緑で有給というマークは、全体の表示としてはもう省いていい」
  t('★全員の表の時は、上の ■休日 ■有給 の色の説明を出さない', !(await pv.$('[data-offlegend]')));
  await pv.setViewportSize({ width: 1920, height: 900 }); await pv.waitForTimeout(500);
  MH = await mhPos(pv);
  t('★横長の窓（1920×900）でも列の真上にぴったり', MH.has && Math.abs(MH.dL) <= 3 && Math.abs(MH.dR) <= 3, MH);
  if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_all_wide.png') });
  await pv.setViewportSize({ width: 1500, height: 950 }); await pv.waitForTimeout(400);
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
  // ★v3.134.2（2026-11-26 ユーザー指示）：「会社の休日の項目を、左上から右の個人の休日の上あたりに移動し、
  //   個人の休日の数は1段下げる。枠は分けた方が見やすい」「うち店休いくらとかの表示は不必要。店休を含めた休日の合計を休日として表示」
  //   「休日のオレンジと有給の緑がわかりにくいので、もう少し濃い色に」
  const side1 = (pg) => pg.evaluate(() => {
    const all = [...document.querySelectorAll('[data-mhbadge]')].filter(e => e.offsetParent !== null);
    const mh = document.querySelector('[data-off1side] [data-off1mh] [data-mhbadge]'), sum = document.querySelector('[data-off1side] [data-off1sum]'), cal = document.querySelector('[data-off1scroll]');
    if (!mh || !sum || !cal) return { n: all.length, has: false };
    const r = mh.getBoundingClientRect(), b = sum.getBoundingClientRect(), c = cal.getBoundingClientRect();
    const rgb = v => (String(v).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const off = document.querySelector('[data-off1sumoff]'), lv = document.querySelector('[data-off1sumleave]');
    return { n: all.length, has: true, kind: mh.getAttribute('data-mhbadge'), text: mh.innerText.replace(/\s+/g, ''), inSum: sum.contains(mh),
      top: Math.round(r.top - c.top), gap: Math.round(b.top - r.bottom), sumTop: Math.round(b.top), dW: Math.round(r.width - b.width), dL: Math.round(r.left - b.left),
      fits: mh.scrollWidth <= mh.clientWidth + 1, edit: mh.hasAttribute('data-mhedit'), btn: !!mh.querySelector('[data-mhbtn]'),
      legend: !!document.querySelector('[data-offlegend]'), offtop: !!document.querySelector('[data-offtop]'),
      sumText: sum.innerText.replace(/\s+/g, ''), offN: off ? (off.innerText.match(/(\d+)\s*日/) || [])[1] : '',
      offBg: off ? rgb(getComputedStyle(off).backgroundColor) : [], lvBg: lv ? rgb(getComputedStyle(lv).backgroundColor) : [] };
  });
  let S1 = await side1(pv);
  t('★個人のカレンダーの時、会社の休日数の札は右の集計の上（1つだけ・左上には出さない）', S1.has && S1.n === 1 && S1.kind === 'wide' && !S1.offtop && Math.abs(S1.top) <= 2, S1);
  t('★札と集計は別の枠（札は集計の枠の外・すき間がある・幅と左端がそろう）', S1.has && !S1.inSum && S1.gap >= 4 && Math.abs(S1.dW) <= 1 && Math.abs(S1.dL) <= 1, S1);
  t('★札の言葉は「N月 会社の休日数 9日」・枠からはみ出さない', S1.has && S1.text.indexOf((M + 1) + '月会社の休日数9日') === 0 && S1.fits, S1);
  t('★個人の時は ■休日 ■有給 の色の説明を出す', S1.has && S1.legend, S1);
  t('★集計に「うち店休日…」の内訳を出さない', S1.has && !/うち|店休/.test(S1.sumText), S1.sumText);
  t('★集計の「休日」は店休日を含めた数（全員の表の「休日」と同じ）', S1.has && S1.offN === vrow('魚住圭').tot.offs && Number(S1.offN) >= 2, [S1.offN, vrow('魚住圭').tot.offs]);
  {
    // 休日＝オレンジ／有給＝緑 が、白に近い色ではなく、はっきり違う色（R と G の差で見る）
    const cells = await pv.evaluate(() => { const rgb = v => (String(v).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const cs = [...document.querySelectorAll('[data-off1week] > div')]; const pick = ch => { const e = cs.find(c => [...c.querySelectorAll('span')].some(x => x.innerText.trim() === ch)); return e ? rgb(getComputedStyle(e).backgroundColor) : null; };
      return { off: pick('休'), lv: pick('有') }; });
    const strong = c => !!c && c.length === 3 && (Math.max(...c) - Math.min(...c)) >= 90;
    t('★休日のマスは濃いオレンジ・有給のマスは濃い緑（どちらも白っぽくない）', strong(cells.off) && strong(cells.lv) && cells.off[0] > cells.off[2] + 90 && cells.lv[1] > cells.lv[0] + 60, cells);
    t('★右の集計の 休日・有給 のタイルも同じ色', JSON.stringify(S1.offBg) === JSON.stringify(cells.off) && JSON.stringify(S1.lvBg) === JSON.stringify(cells.lv), [S1.offBg, S1.lvBg]);
    t('★休日のオレンジは休業日の赤（#fecaca）と見分けが付く', !!cells.off && Math.abs(cells.off[1] - 202) + Math.abs(cells.off[2] - 202) >= 60, cells.off);
  }
  if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_one.png') });
  // ★個人のカレンダーは1画面に収まる（v3.133.0・2026-11-25 ユーザー指示：「上下スクロールしないと見れないので、
  //   1画面で全体表示して。あまり表示も小さくならないように」）
  const fit1 = () => pv.evaluate(() => {
    const sc = document.querySelector('[data-off1scroll]'); if (!sc) return null;
    const weeks = [...document.querySelectorAll('[data-off1week]')].map(e => Math.round(e.getBoundingClientRect().height));
    const sum = document.querySelector('[data-off1sum]'); const sb = sum ? sum.getBoundingClientRect() : null;
    const num = [...document.querySelectorAll('[data-off1week] span')].find(e => /^\d+$/.test(e.innerText.trim()));
    return { noScroll: sc.scrollHeight <= sc.clientHeight + 1, weeks, sumInView: !!sb && sb.bottom <= window.innerHeight + 1 && sb.top >= 0,
      numFs: num ? parseFloat(getComputedStyle(num).fontSize) : 0, vh: window.innerHeight };
  });
  let F1 = await fit1();
  t('★個人のカレンダーは上下スクロールなしで全部見える', !!F1 && F1.noScroll, F1);
  t('★集計の枠まで画面の中に入る', !!F1 && F1.sumInView, F1);
  t('★週の行は同じ高さで、空いている高さいっぱいに広がる（小さくしない）', !!F1 && Math.max(...F1.weeks) - Math.min(...F1.weeks) <= 2 && Math.min(...F1.weeks) >= 100, F1 && F1.weeks);
  t('★日付の字は小さくしていない（14px）', !!F1 && F1.numFs >= 14, F1 && F1.numFs);
  // ★枠は2つ（v3.134.0・2026-11-25 ユーザー決定・モックの「B・イ・線2」）：
  //   「実際は上部にタブとかがあってもっと横長になるので、左右を縮めて、枠を横長にならないように」
  //   「カレンダーと集計の部分を、きっちり枠を分けて」「カレンダーの枠の線ももう少し濃く」
  //   「（集計を右に置いた案が）横幅を利用できていい。黒が入ると重たいのでグリーン系に。研修は仕事なので休日の中に入れなくていい」
  const frame1 = () => pv.evaluate(() => {
    const sc = document.querySelector('[data-off1scroll]'), sum = document.querySelector('[data-off1sum]'), ttl = document.querySelector('[data-off1sumtitle]');
    if (!sc || !sum || !ttl) return null;
    const wk = [...document.querySelectorAll('[data-off1week]')];
    const cell = wk[1].children[2], cr = cell.getBoundingClientRect(), a = sc.getBoundingClientRect(), b = sum.getBoundingClientRect();
    const rgb = v => (String(v).match(/[\d.]+/g) || []).slice(0, 3).map(Number), tot = v => rgb(v).reduce((x, y) => x + y, 0);
    return { ratio: Math.round(cr.width / cr.height * 100) / 100, cell: Math.round(cr.width) + 'x' + Math.round(cr.height),
      sumOutside: !sc.contains(sum), sumRight: b.left >= a.right + 6, sumTopSame: Math.abs((document.querySelector('[data-off1side]') || sum).getBoundingClientRect().top - a.top) <= 2,
      line: tot(getComputedStyle(cell).borderTopColor), lineL: tot(getComputedStyle(cell).borderLeftColor),
      frame: tot(getComputedStyle(sc).borderTopColor), frameW: parseFloat(getComputedStyle(sc).borderTopWidth),
      head: rgb(getComputedStyle(ttl).backgroundColor), sumFrame: rgb(getComputedStyle(sum).borderTopColor),
      sumText: sum.innerText.replace(/\s+/g, ''), vw: window.innerWidth, calW: Math.round(a.width), calL: Math.round(a.left), sumR: Math.round(window.innerWidth - b.right) };
  });
  let FR = await frame1();
  t('★集計はカレンダーの枠の外（右どなりの列・列の上がカレンダーとそろう）', !!FR && FR.sumOutside && FR.sumRight && FR.sumTopSame, FR);
  t('★マスの線が濃い（以前の #e5e7eb より濃い）', !!FR && FR.line > 0 && FR.line < 600 && FR.lineL < 600, FR && [FR.line, FR.lineL]);
  t('★カレンダーの外枠はさらに濃く・2px', !!FR && FR.frame < 400 && FR.frameW >= 2, FR && [FR.frame, FR.frameW]);
  t('★集計の見出しは緑系（黒・濃い灰色にしない）', !!FR && FR.head[1] > FR.head[0] && FR.head[1] > FR.head[2] && FR.head[0] + FR.head[1] + FR.head[2] > 450, FR && FR.head);
  t('★集計の枠も緑系', !!FR && FR.sumFrame[1] > FR.sumFrame[0] && FR.sumFrame[1] > FR.sumFrame[2], FR && FR.sumFrame);
  t('★集計に 休日・有給・合計 が出る', !!FR && /休日\d+日/.test(FR.sumText) && /有給\d+日/.test(FR.sumText) && /合計\d+日/.test(FR.sumText), FR && FR.sumText);
  t('★集計に研修は出さない（研修は仕事）', !!FR && !/研修/.test(FR.sumText) && !(await pv.$('[data-tabsumtrn]')), FR && FR.sumText);
  // 横長の窓（上にタブなどがあって高さが取れない時）でも、マスが横長にならない
  await pv.setViewportSize({ width: 1920, height: 900 }); await pv.waitForTimeout(500);
  FR = await frame1(); F1 = await fit1();
  t('★横長の窓（1920×900）でも、マスは少し横長まで（横÷縦が 1.1〜1.45）', !!FR && FR.ratio >= 1.1 && FR.ratio <= 1.45, FR && [FR.ratio, FR.cell]);
  t('★その時、左右は空ける（カレンダーを窓いっぱいに広げない）', !!FR && FR.calW < FR.vw * 0.7 && FR.calL > 150 && FR.sumR > 150, FR && [FR.calW, FR.calL, FR.sumR, FR.vw]);
  t('★その時もスクロールなしで全部見える', !!F1 && F1.noScroll && F1.sumInView, F1);
  if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_one_wide.png') });
  await pv.setViewportSize({ width: 1500, height: 950 }); await pv.waitForTimeout(400);
  // 6週ある月でも収まる（最大12か月ぶん送って探す）
  { let moved = 0, six = false;
    for (let i = 0; i < 12; i++) { if ((await pv.evaluate(() => document.querySelectorAll('[data-off1week]').length)) === 6) { six = true; break; }
      await pv.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); }); await pv.waitForTimeout(350); moved++; }
    F1 = await fit1();
    t('★6週ある月でも、スクロールなしで全部見える', six && !!F1 && F1.noScroll && F1.sumInView && F1.weeks.length === 6, { six, F1 });
    // 低めの画面（1366×768）でも収まる
    await pv.setViewportSize({ width: 1366, height: 768 }); await pv.waitForTimeout(500);
    F1 = await fit1();
    t('★低めの画面（1366×768）・6週の月でも、スクロールなしで全部見える', !!F1 && F1.noScroll && F1.sumInView, F1);
    t('★その時も週の行は最低の高さ（66px）より低くしない', !!F1 && Math.min(...F1.weeks) >= 66, F1 && F1.weeks);
    if (SHOT) await pv.screenshot({ path: path.join(SHOT, 'staff_view_one_small.png') });
    await pv.setViewportSize({ width: 1500, height: 950 }); await pv.waitForTimeout(400);
    for (let i = 0; i < moved; i++) { await pv.evaluate(() => { const b = document.querySelector('button[title="前月"]'); if (b) b.click(); }); await pv.waitForTimeout(250); }
  }
  await vPick('全員');
  t('★「全員」で表に戻る', !!(await readTable(pv)));
  await pv.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); });
  await pv.waitForTimeout(600);
  T = await readTable(pv);
  t('★月を送っても表のまま・日数が変わる', T && T.heads.length === new Date(Y, M + 2, 0).getDate(), T && T.heads.length);
  t('画面のエラーなし（🏖 休日）', V.errs.length === 0, V.errs.slice(0, 2));
  await V.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑧ 管理者：表の上の札の「変更」で会社の休日数を直せる');
  const W = await start({ email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', cert: { isAdmin: true } });
  const pw = W.page;
  await pw.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => /確定して閉じる/.test(e.innerText)); if (b) b.click(); });
  await pw.waitForTimeout(600);
  await pw.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.replace(/\s/g, '') === 'カレンダー' && e.offsetParent !== null); if (b) b.click(); });
  await pw.waitForTimeout(1200);
  await pw.evaluate(() => { const b = document.querySelector('button[title="休日カレンダー"]'); if (b) b.click(); });
  await pw.waitForTimeout(1200);
  await pw.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '全員' && e.offsetParent !== null && !e.closest('[data-offtable]')); if (b) b.click(); });
  await pw.waitForTimeout(700);
  MH = await mhPos(pw);
  const carry0 = ((await readTable(pw)).rows.find(r => r.name === '江川京志') || { tot: {} }).tot.carry;
  t('★管理者には「変更」が出る', MH.has && MH.btn, MH);
  if (SHOT) { await pw.setViewportSize({ width: 1920, height: 900 }); await pw.waitForTimeout(400); await pw.screenshot({ path: path.join(SHOT, 'staff_view_all_admin.png') }); await pw.setViewportSize({ width: 1500, height: 950 }); await pw.waitForTimeout(400); MH = await mhPos(pw); }
  await pw.click('[data-offtop] [data-mhbtn]'); await pw.waitForTimeout(400);
  const MH2 = await mhPos(pw);
  t('★押すと入力欄に変わる', MH2.has && MH2.edit && !!(await pw.$('[data-offtop] input')), MH2);
  t('★その時、表は上下に動かない・札の幅も変わらない', MH2.has && Math.abs(MH2.wrapTop - MH.wrapTop) <= 1 && Math.abs(MH2.dL) <= 3 && Math.abs(MH2.dR) <= 3, [MH.wrapTop, MH2.wrapTop, MH2.dL, MH2.dR]);
  t('★入力欄・保存・やめる が札からはみ出さない', await pw.evaluate(() => { const m = document.querySelector('[data-offtop] [data-mhbadge]'); return !!m && m.scrollWidth <= m.clientWidth + 1; }));
  await pw.fill('[data-offtop] input', '10');
  await pw.click('[data-offtop] [data-mhsave]'); await pw.waitForTimeout(1200);
  const MH3 = await mhPos(pw);
  t('★保存すると札が 10日 になる', MH3.has && !MH3.edit && MH3.text.indexOf((M + 1) + '月会社の休日数10日') === 0, MH3.text);
  t('★保存先（mholidays）も 10', (await pw.evaluate(k => (window.__fakeFb.get(k + 'mholidays') || {}), STOR))[Y + '-' + (M + 1)] === 10);
  const carry1 = ((await readTable(pw)).rows.find(r => r.name === '江川京志') || { tot: {} }).tot.carry;
  t('★右端の「繰り越し」も一緒に変わる', !!carry0 && !!carry1 && carry0 !== carry1, [carry0, carry1]);
  // 個人のカレンダーの札（右の集計の上）でも直せる。押しても下の集計は動かない
  await pw.evaluate(() => { const td = document.querySelector('tr[data-offrow="魚住圭"] td'); if (td) td.click(); });
  await pw.waitForTimeout(700);
  let S2 = await side1(pw);
  t('★管理者：個人の札にも「変更」が出る', S2.has && S2.btn && S2.text.indexOf((M + 1) + '月会社の休日数10日') === 0, S2);
  if (SHOT) { await pw.setViewportSize({ width: 1920, height: 900 }); await pw.waitForTimeout(500); await pw.screenshot({ path: path.join(SHOT, 'staff_view_one_admin.png') }); await pw.setViewportSize({ width: 1500, height: 950 }); await pw.waitForTimeout(400); S2 = await side1(pw); }
  await pw.click('[data-off1mh] [data-mhbtn]'); await pw.waitForTimeout(400);
  const S3 = await side1(pw);
  t('★押すと入力欄に変わる・下の集計は動かない・はみ出さない', S3.has && S3.edit && Math.abs(S3.sumTop - S2.sumTop) <= 1 && S3.fits, [S2.sumTop, S3.sumTop, S3.fits]);
  await pw.fill('[data-off1mh] input', '9');
  await pw.click('[data-off1mh] [data-mhsave]'); await pw.waitForTimeout(1200);
  const S4 = await side1(pw);
  t('★保存すると札が 9日 に戻る', S4.has && !S4.edit && S4.text.indexOf((M + 1) + '月会社の休日数9日') === 0, S4.text);
  t('画面のエラーなし（管理者・🏖 休日）', W.errs.length === 0, W.errs.slice(0, 2));
  await W.ctx.close();

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log(fail ? ('✖ 失敗 ' + fail + ' / 成功 ' + pass) : ('✅ PASS  成功 ' + pass + ' / 失敗 0'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
