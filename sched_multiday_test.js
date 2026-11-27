// 日をまたぐ予定：日にちを「何日から何日まで」で入れられる（v3.136.0・2026-11-27 ユーザー要望）
//   ユーザーの言葉：「日をまたぐような予定がもしあったとしたら、日にちまで伸ばせれるように、
//   時刻設定と他に日にち設定も、何日から何日までできるように」。
//   ・予定の1件に dkEnd（終わりの日）を足した。1日だけの予定は空。昔の予定（dkEnd なし）はそのまま1日だけ
//   ・掛かっている日ぜんぶに出す：🏖 休日 の個人のカレンダー／その日の予定の窓／スマホ（📝 予定 の画面は v3.137.0 でなくした）
//   ・時刻：始まりの日＝「10:00〜」／あいだの日＝「〜」／終わりの日＝「〜15:00」。ポップと窓には全体（11/16 10:00 〜 11/18 15:00）
//   ★名前・予定は架空。日付は「今月」から作る（決め打ちにしない）。
//   実行: node sched_multiday_test.js      見た目も撮る: SHOT=<保存先のフォルダ> node sched_multiday_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8547, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const head = s => console.log(NL + '■ ' + s);

const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const dk = d => Y + '-' + (M + 1) + '-' + d;
const iso = d => Y + '-' + String(M + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const md = d => (M + 1) + '/' + d;
const DIM = new Date(Y, M + 1, 0).getDate();
const NY = M === 11 ? Y + 1 : Y, NM = (M + 1) % 12;                 // 来月
const ME = '竹林直行', OTHER = '魚住圭';
const TRIP = '出張（架空）', CAMP = '研修合宿（架空）', OLD = '昔の形の予定', CROSS = '月またぎ（架空）';

const sc = (o) => Object.assign({ time: '', end: '', allday: false, title: '', memo: '', owner: ME, uid: 'h3', at: 1 }, o);
const seed = {
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: ME, myNumber: 3, store: 'honten', badge: 'mechanic' },
    { uid: 'h4', name: OTHER, myNumber: 4, store: 'honten', badge: 'mechanic' }],
  [STOR + 'sanda-staff-v2']: [{ uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  [STOR + 'honten-dayoff']: {}, [STOR + 'honten-pleave']: {}, [STOR + 'honten-training']: {}, [STOR + 'honten-offnote']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'mholidays']: { [Y + '-' + (M + 1)]: 12 },
  [STOR + 'mysched']: {
    x1: sc({ dk: dk(16), dkEnd: dk(18), time: '10:00', end: '15:00', title: TRIP, memo: '新幹線の切符を忘れない' }),         // 16〜18日
    x2: sc({ dk: dk(22), dkEnd: dk(23), allday: true, title: CAMP, owner: OTHER, uid: 'h4' }),                             // 22〜23日・終日・ほかの人
    x3: sc({ dk: dk(6), time: '09:00', title: OLD }),                                                                       // dkEnd が無い昔の形
    x4: sc({ dk: dk(DIM), dkEnd: NY + '-' + (NM + 1) + '-2', time: '13:00', end: '11:00', title: CROSS }),                   // 月末〜来月2日
  },
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};
const STAFF = { email: 'tikurin@midori-m.com', fbuid: 'uid_tk', uid: 'h3', name: ME, store: 'honten', role: 'staff' };

let server, browser;
const start = async (file, vp, mobile) => {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, mobile ? { isMobile: true, hasTouch: true } : {}));
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [STAFF, STOR, seed]);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/' + file, { waitUntil: 'domcontentloaded' });
  await see(ME); await click(ME); await click('でログイン');
  await page.waitForTimeout(mobile ? 3200 : 2500);
  const kv = (key) => page.evaluate(k => window.__fakeFb.get(k) || {}, STOR + key);
  const byTitle = async (ttl) => Object.values(await kv('mysched')).find(v => v && v.title === ttl);
  return { ctx, page, errs, click, see, kv, byTitle };
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
  const SHOT = process.env.SHOT || '';

  // ────────────────────────────────────────────────────────
  const A = await start('index_dev.html', { width: 1500, height: 950 }); const pa = A.page;
  await pa.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.replace(/\s/g, '') === 'カレンダー' && e.offsetParent !== null); if (b) b.click(); });
  await pa.waitForTimeout(1200);

  head('① PC・🏖 休日 の個人のカレンダー：掛かっている日ぜんぶに出る／札の時刻は 始まり「10:00〜」・あいだ「〜」・終わり「〜15:00」');
  await pa.evaluate(() => { const b = document.querySelector('button[title="休日カレンダー"]'); if (b) b.click(); });
  await pa.waitForTimeout(1300);
  const chipOf = (d, id) => pa.evaluate(([d, id]) => { const e = document.querySelector('[data-off1day="' + d + '"] [data-off1sc="' + id + '"]'); return e ? e.innerText.replace(/\s+/g, '') : null; }, [d, id]);
  const c16 = await chipOf(16, 'x1'), c17 = await chipOf(17, 'x1'), c18 = await chipOf(18, 'x1');
  t('★16・17・18日のマスに同じ予定の札が出る（15・19日には出ない）', !!c16 && !!c17 && !!c18 && !(await chipOf(15, 'x1')) && !(await chipOf(19, 'x1')), [c16, c17, c18]);
  t('★始まりの日は「10:00〜」', /^10:00〜出張/.test(c16 || ''), c16);
  t('★あいだの日は「〜」', /^〜出張/.test(c17 || ''), c17);
  t('★終わりの日は「〜15:00」', /^〜15:00出張/.test(c18 || ''), c18);
  t('★終日の予定は、どの日も「終日」', /^終日/.test((await chipOf(22, 'x2')) || '') && /^終日/.test((await chipOf(23, 'x2')) || ''), [await chipOf(22, 'x2'), await chipOf(23, 'x2')]);
  t('昔の形の予定は今までどおり（6日だけ・時刻つき）', /^09:00/.test((await chipOf(6, 'x3')) || '') && !(await chipOf(7, 'x3')));
  t('★月末から来月へまたぐ予定は、今月は月末の日に出る', /^13:00〜/.test((await chipOf(DIM, 'x4')) || ''), await chipOf(DIM, 'x4'));
  await pa.hover('[data-off1day="17"] [data-off1sc="x1"]'); await pa.waitForTimeout(300);
  let pop = await pa.evaluate(() => { const p = document.querySelector('[data-off1pop]'); return p ? p.innerText.replace(/\s+/g, ' ') : ''; });
  t('★なぞると、全体の期間が出る（11/16 10:00 〜 11/18 15:00 の形）', pop.indexOf(md(16) + ' 10:00 〜 ' + md(18) + ' 15:00') >= 0 && /新幹線/.test(pop), pop);
  if (SHOT) await pa.screenshot({ path: path.join(SHOT, 'span_2_off1.png') });
  await pa.hover('[data-off1day="23"] [data-off1sc="x2"]'); await pa.waitForTimeout(300);
  pop = await pa.evaluate(() => { const p = document.querySelector('[data-off1pop]'); return p ? p.innerText.replace(/\s+/g, ' ') : ''; });
  t('★終日の予定は「11/22〜11/23（終日）」の形', pop.indexOf(md(22) + '〜' + md(23) + '（終日）') >= 0, pop);
  await pa.mouse.move(5, 5);
  await pa.evaluate(() => { const b = document.querySelector('button[title="翌月"]'); if (b) b.click(); }); await pa.waitForTimeout(700);
  const n1 = await chipOf(1, 'x4'), n2 = await chipOf(2, 'x4'), n3 = await chipOf(3, 'x4');
  t('★月をまたぐ予定は、来月の1日・2日にも出る（3日には出ない）', !!n1 && !!n2 && !n3 && /^〜/.test(n1) && /^〜11:00/.test(n2), [n1, n2, n3]);
  await pa.evaluate(() => { const b = document.querySelector('button[title="前月"]'); if (b) b.click(); }); await pa.waitForTimeout(700);

  head('③ PC・その日の予定の窓：あいだの日から開いても、期間が見えて、始まりの日のまま直せる');
  await pa.click('[data-off1day="17"] [data-off1sc="x1"]'); await pa.waitForTimeout(600);
  const pan = await pa.evaluate(() => { const m = document.querySelector('.modal-box'); const s = m && m.querySelector('[data-msspan]'); return { head: m ? m.innerText.slice(0, 30) : '', span: s ? s.innerText : '' }; });
  t('★17日の窓に、16日から始まる予定が出る', pan.head.indexOf(md(17)) >= 0 && pan.span.indexOf(md(16)) >= 0 && pan.span.indexOf(md(18)) >= 0, pan);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '編集'); if (b) b.click(); }); await pa.waitForTimeout(400);
  const dv = () => pa.evaluate(() => { const g = w => { const e = document.querySelector('.modal-box [data-msdate="' + w + '"]'); return e ? e.getAttribute('data-msdateval') : null; }; return { from: g('from'), to: g('to'), hint: (document.querySelector('[data-msdatehint]') || { innerText: '' }).innerText }; });
  let DV = await dv();
  t('★編集の欄に「日にち：16日 〜 18日」が入っている（3日間）', DV.from === dk(16) && DV.to === dk(18) && /3日間/.test(DV.hint), DV);
  t('★PC は type="date" を使わない（日本語入力が英数に落ちるため）', await pa.evaluate(() => !document.querySelector('.modal-box input[type="date"]') && document.querySelectorAll('.modal-box [data-msdate] [data-datepick]').length === 2));
  // 終わりの日を 19日 に伸ばす
  const pickDate = async (which, d) => { await pa.click('.modal-box [data-msdate="' + which + '"] [data-datepick]'); await pa.waitForTimeout(300); await pa.click('[data-datepop] [data-day="' + iso(d) + '"]'); await pa.waitForTimeout(300); };
  await pickDate('to', 19); DV = await dv();
  t('★終わりの日をカレンダーから選べる（19日・4日間）', DV.to === dk(19) && /4日間/.test(DV.hint), DV);
  if (SHOT) await pa.screenshot({ path: path.join(SHOT, 'span_3_edit.png') });
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '保存'); if (b) b.click(); }); await pa.waitForTimeout(1200);
  let x1 = await A.byTitle(TRIP);
  t('★保存：始まりの日は16日のまま・終わりの日だけ19日になる（17日に移ってしまわない）', !!x1 && x1.dk === dk(16) && x1.dkEnd === dk(19) && x1.time === '10:00' && x1.end === '15:00', x1);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); }); await pa.waitForTimeout(500);
  t('★マスの札も19日まで伸びる（終わりの日が19日に変わる）', /^〜15:00/.test((await chipOf(19, 'x1')) || '') && /^〜出張/.test((await chipOf(18, 'x1')) || ''), [await chipOf(18, 'x1'), await chipOf(19, 'x1')]);

  head('④ PC：新しい予定を「何日から何日まで」で入れる');
  await pa.click('[data-off1kind="sched"]'); await pa.waitForTimeout(300);
  await pa.click('[data-off1day="25"]', { position: { x: 30, y: 12 } }); await pa.waitForTimeout(600);
  await A.click('＋ 予定を追加'); await pa.waitForTimeout(300);
  DV = await dv();
  t('★追加の欄：始まりの日は押した日（25日）・終わりの日は空', DV.from === dk(25) && DV.to === '' && /1日だけなら空/.test(DV.hint), DV);
  await pa.fill('.modal-box input[placeholder^="件名"]', '展示会（架空）');
  await pickDate('to', 24);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '追加'); if (b) b.click(); }); await pa.waitForTimeout(700);
  t('★終わりの日が始まりの日より前だと、保存せずに知らせる', !(await A.byTitle('展示会（架空）')) && await pa.evaluate(() => /終わりの日が、始まりの日より前です/.test(document.querySelector('.modal-box').innerText)));
  await pickDate('to', 27);
  await pa.fill('.modal-box [data-tmfld="start"]', '900'); await pa.fill('.modal-box [data-tmfld="end"]', '800'); await pa.locator('.modal-box textarea').click();
  if (SHOT) await pa.screenshot({ path: path.join(SHOT, 'span_4_add.png') });
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '追加'); if (b) b.click(); }); await pa.waitForTimeout(1200);
  let ex = await A.byTitle('展示会（架空）');
  t('★保存：25日〜27日（dk と dkEnd）', !!ex && ex.dk === dk(25) && ex.dkEnd === dk(27), ex);
  t('★日をまたぐ時は、終わりの時刻が始まりより早くてもよい（別の日の時刻なので）', !!ex && ex.time === '09:00' && ex.end === '08:00', ex);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); }); await pa.waitForTimeout(500);
  const exChips = await pa.evaluate(() => [24, 25, 26, 27, 28].map(d => { const c = document.querySelector('[data-off1day="' + d + '"]'); return /展示会/.test(c.innerText); }));
  t('★25・26・27日のマスに出る（24・28日には出ない）', JSON.stringify(exChips) === '[false,true,true,true,false]', exChips);
  // 終わりの日を消すと1日だけに戻る
  await pa.click('[data-off1day="26"]', { position: { x: 30, y: 12 } }); await pa.waitForTimeout(600);
  await pa.evaluate(() => { const it = [...document.querySelectorAll('.modal-box div')].find(d => /展示会/.test(d.innerText) && d.querySelector('button') && d.innerText.length < 120); const b = it && [...it.querySelectorAll('button')].find(e => e.innerText.trim() === '編集'); if (b) b.click(); }); await pa.waitForTimeout(400);
  await pa.evaluate(() => { const x = [...document.querySelectorAll('.modal-box [data-msdate="to"] span')].find(s => s.innerText.trim() === '✕'); if (x) x.click(); }); await pa.waitForTimeout(300);
  DV = await dv();
  t('★終わりの日は ✕ で消せる', DV.to === '', DV);
  const save = async () => { await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '保存'); if (b) b.click(); }); await pa.waitForTimeout(1200); };
  await save();
  ex = await A.byTitle('展示会（架空）');
  t('★1日だけに戻すと、時刻の前後の決まりがまた効く（9:00〜8:00 は保存せずに知らせる）', !!ex && ex.dkEnd === dk(27) && await pa.evaluate(() => /終わりの時刻が始まりより前です/.test(document.querySelector('.modal-box').innerText)), ex);
  await pa.fill('.modal-box [data-tmfld="end"]', '1000'); await pa.locator('.modal-box textarea').click();
  await save();
  ex = await A.byTitle('展示会（架空）');
  t('★時刻を直して保存すると1日だけの予定に戻る（dkEnd は空・始まりの日は25日のまま）', !!ex && ex.dk === dk(25) && !ex.dkEnd && ex.time === '09:00' && ex.end === '10:00', ex);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); }); await pa.waitForTimeout(500);
  t('★マスの札も25日だけに戻る', JSON.stringify(await pa.evaluate(() => [25, 26, 27].map(d => /展示会/.test(document.querySelector('[data-off1day="' + d + '"]').innerText)))) === '[true,false,false]');
  t('画面のエラーなし（PC）', A.errs.length === 0, A.errs.slice(0, 2));
  await A.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑤ スマホ：カレンダーの件数・その日の予定・日にちの欄');
  const B = await start('mobile.html', { width: 390, height: 844 }, true); const pb = B.page;
  await B.see('カレンダー');
  await pb.waitForFunction(() => /📝\d/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const mark = (d) => pb.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; return c ? /📝/.test(c.innerText) : null; }, d);
  t('★スマホ：16・17・18日ぜんぶに 📝 の印が出る（15日には出ない）', (await mark(16)) && (await mark(17)) && (await mark(18)) && (await mark(15)) === false, [await mark(15), await mark(16), await mark(17), await mark(18)]);
  const tap = async (d) => { await pb.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, d); await pb.waitForTimeout(900); };
  await tap(17);
  t('★スマホ：あいだの日（17日）の日詳細に、その予定と期間が出る', await B.see(TRIP, 6000) && await pb.evaluate(([a, b]) => { const s = document.querySelector('[data-msspan]'); return !!s && s.innerText.indexOf(a) >= 0 && s.innerText.indexOf(b) >= 0; }, [md(16), md(18)]));
  await B.click('＋ 予定を追加'); await pb.waitForTimeout(400);
  const mdv = () => pb.evaluate(() => { const g = w => { const e = document.querySelector('input[data-msdate="' + w + '"]'); return e ? { type: e.type, val: e.value, fs: parseFloat(getComputedStyle(e).fontSize) } : null; }; return { from: g('from'), to: g('to') }; });
  let MV = await mdv();
  t('★スマホ：日にちの欄は端末の日付欄・16px以上（勝手に拡大しない）', !!MV.from && !!MV.to && MV.from.type === 'date' && MV.to.type === 'date' && MV.from.fs >= 16 && MV.to.fs >= 16, MV);
  t('★スマホ：始まりの日は開いた日（17日）・終わりの日は空', MV.from.val === iso(17) && MV.to.val === '', MV);
  await pb.fill('input[placeholder*="件名"]', '棚卸し（架空）');
  await pb.fill('input[data-msdate="to"]', iso(19));
  if (SHOT) await pb.screenshot({ path: path.join(SHOT, 'span_5_mobile.png') });
  await B.click('追加'); await pb.waitForTimeout(1500);
  const tn = await B.byTitle('棚卸し（架空）');
  t('★スマホ：17日〜19日で保存される', !!tn && tn.dk === dk(17) && tn.dkEnd === dk(19), tn);
  t('画面のエラーなし（スマホ）', B.errs.length === 0, B.errs.slice(0, 2));
  await B.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑥ ファイルの中身：PC とスマホで同じ道具／v.dk===dk で絞っていない');
  const pc = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8').replace(/\r/g, ''), mb = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8').replace(/\r/g, '');
  const cut = c => { const i = c.indexOf('const HUB_SCHED_MAXDAYS='), j = c.indexOf('const hubSchedSort='); return i > 0 && j > i ? c.slice(i, j) : ''; };
  t('★日をまたぐ予定の道具は、PC とスマホで1文字も違わない', cut(pc).length > 500 && cut(pc) === cut(mb));
  t('★その日の予定を「v.dk===dk」で絞っていない（PC・スマホ）', pc.indexOf('v&&v.dk===dk') < 0 && mb.indexOf('v&&v.dk===dk') < 0);
  t('★予定の窓は hubSchedOn で絞る（PC・スマホ）', pc.split('v&&hubSchedOn(v,dk)').length - 1 === 2 && mb.split('v&&hubSchedOn(v,dk)').length - 1 === 2);

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('合計 ' + (pass + fail) + '件　✔ ' + pass + '　✖ ' + fail);
  console.log(fail === 0 ? '★ PASS' : '✖ FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); try { browser && browser.close(); server && server.close(); } catch (x) {} process.exit(1); });
