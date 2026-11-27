// 🏖 休日 の画面（個人のカレンダー）から 休日・有給・研修・予定を入れる（v3.135.0・2026-11-27 ユーザー決定）
//   ユーザーの言葉：「設定ボタンからスタッフ休日設定を押して入るんですけども、休日のボタンで、この画面から休日設定が
//   できるように。…スタッフ休日・有給カレンダーというカレンダーも見にくいので、どちらかというと不要」
//   「休日、有給、合計の下あたりに、休日設定のボタン枠があって、その上に予定を。そこを押してから日付を押していくと、
//   休日になったり休日じゃなかったり切り替えができる。予定を押すと、入れたい日に押すと予定を入れれる」
//   「予定の内容が多い場合は枠が小さくて見にくいので、なぞったらポップが出るように」
//   ・右の列：会社の休日数 → 集計 → 【箱：上＝📝 予定／下＝🏖 休日設定】
//   ・開いた直後はどちらも押していない＝日を押しても何も変わらない
//   ・休日設定を押すと下に 休日／有給／研修。日を押すたびに付く・外れる。同じボタンをもう一度押すと終わる
//   ・休みの決まり（本人だけ・管理者は全員／休業日は不可／枠を使い切ったら有給／研修は別キー／メモ）は今までどおり
//   ・設定の「🏖 スタッフ休日設定」と StaffCalendarModal はなくした
//   ★名前・予定は架空。日付は「今月」から作る（決め打ちにしない）。第2火曜（8〜14日）は休業日なので使わない。
//   実行: node off1_edit_test.js      見た目も撮る: SHOT=<保存先のフォルダ> node off1_edit_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8546, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const head = s => console.log(NL + '■ ' + s);

const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const dk = d => Y + '-' + (M + 1) + '-' + d;
const iso = d => Y + '-' + String(M + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const CLOSED_DAY = 20;   // 手で入れた休業日
const ME = '竹林直行', OTHER = '魚住圭', ADMIN = '江川京志';

const sc = (d, o) => Object.assign({ dk: dk(d), time: '', end: '', allday: false, title: '', memo: '', owner: ME, uid: 'h3', at: 1 }, o);
const mkSeed = (over) => Object.assign({
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: ADMIN, myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: ME, myNumber: 3, store: 'honten', badge: 'mechanic' },
    { uid: 'h4', name: OTHER, myNumber: 4, store: 'honten', badge: 'mechanic' }],
  [STOR + 'sanda-staff-v2']: [{ uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  // 3日＝竹林・魚住が休日（竹林にメモ）／4日＝竹林が休日／5日＝魚住が有給／20日＝店の休業日
  [STOR + 'honten-dayoff']: { [dk(3)]: [ME, OTHER], [dk(4)]: [ME] },
  [STOR + 'honten-pleave']: { [dk(5)]: [OTHER] },
  [STOR + 'honten-training']: {},
  [STOR + 'honten-offnote']: { [dk(3) + '::' + ME]: '午後休' },
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [iso(CLOSED_DAY)],
  [STOR + 'mholidays']: { [Y + '-' + (M + 1)]: 12 },
  // 予定（架空）。6日＝自分の共有2件＋ほかの人の共有1件／7日＝9件（マスに入りきらない）
  [STOR + 'mysched']: Object.assign({
    s1: sc(6, { time: '10:00', end: '11:30', title: '架空商事 来店 見積もりの説明', memo: '見積書を2部用意。' + NL + '前回の値引きの話の続き。' }),
    s2: sc(6, { time: '15:00', title: '陸運局 書類の提出' }),
    s3: sc(6, { allday: true, title: '店長会議（本店2階）', memo: '議題：年末の営業日', owner: OTHER, uid: 'h4' }),
  }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({ ['m' + i]: sc(7, { time: String(8 + i).padStart(2, '0') + ':00', title: 'たくさんの予定 ' + i, at: i }) }))),
  // マイスケジュール（自分専用の端末だけ）
  [STOR + 'myprv-h3']: { p1: { dk: dk(6), time: '18:30', end: '', allday: false, title: '歯医者', memo: '診察券を忘れない', at: 1 } },
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
}, over || {});

let server, browser;
const start = async (me, seed, vp) => {
  const ctx = await browser.newContext({ viewport: vp || { width: 1500, height: 950 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([Object.assign({ uid: me.uid, name: me.name, store: me.store, email: me.email }, me.cert || {})]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [me, STOR, seed || mkSeed()]);
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
  const o = { ctx, page, errs, click, see };
  // カレンダー → 🏖 休日
  o.goOff = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.replace(/\s/g, '') === 'カレンダー' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const b = document.querySelector('button[title="休日カレンダー"]'); if (b) b.click(); });
    await page.waitForTimeout(1200);
  };
  o.pick = async (name) => { await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === n && e.offsetParent !== null && !e.closest('[data-offtable]')); if (b) b.click(); }, name); await page.waitForTimeout(700); };
  o.kv = (key) => page.evaluate(k => window.__fakeFb.get(k) || {}, STOR + key);
  o.has = async (key, d, name) => { const v = await o.kv(key); return Array.isArray(v[dk(d)]) && v[dk(d)].includes(name); };
  o.day = async (d) => { await page.click('[data-off1day="' + d + '"]', { position: { x: 30, y: 12 } }); await page.waitForTimeout(900); };
  o.kOf = (d) => page.evaluate(d => { const e = document.querySelector('[data-off1day="' + d + '"]'); return e ? e.getAttribute('data-off1k') : null; }, d);
  o.kind = async (k) => { await page.click('[data-off1kind="' + k + '"]'); await page.waitForTimeout(400); };
  o.hk = async (k) => { await page.click('[data-off1hk="' + k + '"]'); await page.waitForTimeout(300); };
  o.st = () => page.evaluate(() => {
    const q = s => document.querySelector(s);
    const on = k => { const b = q('[data-off1kind="' + k + '"]'); return b ? b.getAttribute('data-on') : null; };
    const off = q('[data-off1sumoff]'), lv = q('[data-off1sumleave]');
    const num = e => e ? Number((e.innerText.match(/(\d+)\s*日/) || [])[1]) : null;
    return { pick: !!q('[data-off1pick]'), ro: !!q('[data-off1ro]'), sched: on('sched'), hol: on('hol'),
      sub: [...document.querySelectorAll('[data-off1hk]')].map(b => b.getAttribute('data-off1hk') + ':' + b.getAttribute('data-on')),
      hint: (q('[data-off1hint]') || { innerText: '' }).innerText, msg: (q('[data-off1msg]') || { innerText: '' }).innerText,
      auto: !!q('[data-auto-leave]'), offN: num(off), lvN: num(lv), modal: /の予定/.test((q('.modal-box') || { innerText: '' }).innerText) };
  });
  return o;
};
const STAFF = { email: 'tikurin@midori-m.com', fbuid: 'uid_tk', uid: 'h3', name: ME, store: 'honten', role: 'staff' };
const ADM = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: ADMIN, store: 'honten', role: 'admin', cert: { isAdmin: true } };

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
  const shot = async (pg, name, vp) => { if (!SHOT) return; if (vp) { await pg.setViewportSize(vp); await pg.waitForTimeout(500); } await pg.screenshot({ path: path.join(SHOT, name) }); if (vp) { await pg.setViewportSize({ width: 1500, height: 950 }); await pg.waitForTimeout(400); } };

  // ────────────────────────────────────────────────────────
  head('① 開いた直後：集計の下に箱（上＝予定／下＝休日設定）・どちらも押していない');
  const A = await start(STAFF); const pa = A.page;
  await A.goOff();
  let S = await A.st();
  t('🏖 休日 を開くと自分のカレンダー', await pa.evaluate(() => !!document.querySelector('[data-offview="one"]')));
  t('★右の列に「予定／休日設定」の箱がある', S.pick && !S.ro, S);
  const lay = await pa.evaluate(() => {
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const mh = r('[data-off1mh]'), sum = r('[data-off1sum]'), pk = r('[data-off1pick]'), a = r('[data-off1kind="sched"]'), b = r('[data-off1kind="hol"]');
    const side = document.querySelector('[data-off1side]'), sumEl = document.querySelector('[data-off1sum]'), pkEl = document.querySelector('[data-off1pick]');
    return { order: !!(mh && sum && pk) && mh.bottom <= sum.top && sum.bottom <= pk.top, gap: pk && sum ? Math.round(pk.top - sum.bottom) : -1,
      schedAbove: !!(a && b) && a.bottom <= b.top, inSide: !!side && side.contains(pkEl), outSum: !!sumEl && !sumEl.contains(pkEl),
      dW: pk && sum ? Math.round(pk.width - sum.width) : 99, txt: [...document.querySelectorAll('[data-off1kind]')].map(x => x.innerText.replace(/\s+/g, '')) };
  });
  t('★並びは 会社の休日数 → 集計 → 箱（箱は集計の下・別の枠・同じ幅）', lay.order && lay.inSide && lay.outSum && lay.gap >= 4 && Math.abs(lay.dW) <= 1, lay);
  t('★箱の中は 上＝「📝 予定」／下＝「🏖 休日設定」', lay.schedAbove && /予定/.test(lay.txt[0]) && /休日設定/.test(lay.txt[1]), lay);
  t('★開いた直後はどちらも押していない・休日／有給／研修 の切り替えも出ていない', S.sched === '0' && S.hol === '0' && S.sub.length === 0, S);
  t('★「⚙ 設定」は 🏖 休日 では出さない（スタッフ休日設定はなくした）', await pa.evaluate(() => !document.querySelector('[data-calgear]') && !/スタッフ休日設定/.test(document.body.innerText)));
  await shot(pa, 'off1_1_open.png', { width: 1920, height: 900 });

  head('② 何も押していない時：日を押しても何も変わらない');
  const off0 = S.offN;
  await A.day(25); S = await A.st();
  t('★日を押しても休日は付かない', !(await A.has('honten-dayoff', 25, ME)) && !(await A.has('honten-pleave', 25, ME)) && (await A.kOf(25)) === '' && S.offN === off0, S);
  t('★「予定か休日設定を押してから」の一言が出る', /予定.*休日設定.*押してから/.test(S.msg), S.msg);
  t('予定の窓も開かない', !S.modal);

  head('③ 休日設定：押してから日を押すと休日が付く・もう一度押すと外れる');
  await A.kind('hol'); S = await A.st();
  t('★「休日設定」が押された状態になる（予定は押されていない）', S.hol === '1' && S.sched === '0', S);
  t('★すぐ下に 休日／有給／研修 が出て、最初は休日', S.sub.join(',') === 'dayoff:1,leave:0,training:0', S.sub);
  await A.day(25); S = await A.st();
  t('★日を押すと休日が付く（保存もされる）', (await A.has('honten-dayoff', 25, ME)) && (await A.kOf(25)) === 'off', await A.kv('honten-dayoff'));
  t('★集計の「休日」が1日増える', S.offN === off0 + 1, [off0, S.offN]);
  t('ほかの人の休日は巻き添えにしない', (await A.has('honten-dayoff', 3, OTHER)) && (await A.has('honten-pleave', 5, OTHER)));
  await shot(pa, 'off1_2_hol.png', { width: 1920, height: 900 });
  await A.day(25); S = await A.st();
  t('★同じ日をもう一度押すと外れる', !(await A.has('honten-dayoff', 25, ME)) && (await A.kOf(25)) === '' && S.offN === off0, S);
  t('予定の窓は開かない（休日設定の最中）', !S.modal);

  head('④ 有給・研修も同じ箱から');
  await A.hk('leave'); S = await A.st();
  t('★「有給」に切り替えられる', S.sub.join(',') === 'dayoff:0,leave:1,training:0' && /有給/.test(S.hint), S);
  const lv0 = S.lvN;
  await A.day(25); S = await A.st();
  t('★日を押すと有給が付く', (await A.has('honten-pleave', 25, ME)) && !(await A.has('honten-dayoff', 25, ME)) && (await A.kOf(25)) === 'lv' && S.lvN === lv0 + 1, S);
  await shot(pa, 'off1_3_leave.png', { width: 1920, height: 900 });
  await A.day(25);
  t('★もう一度押すと有給が外れる', !(await A.has('honten-pleave', 25, ME)) && (await A.kOf(25)) === '');
  await A.hk('training'); S = await A.st();
  t('★「研修」に切り替えると「休みではありません」と出る', S.sub.join(',') === 'dayoff:0,leave:0,training:1' && /休みではありません/.test(S.hint), S.hint);
  const offB = S.offN;
  await A.day(26); S = await A.st();
  t('★日を押すと研修が付く（別のキー honten-training）', (await A.has('honten-training', 26, ME)) && (await A.kOf(26)) === 'tr');
  t('★研修は休日の数に入らない', S.offN === offB && !(await A.has('honten-dayoff', 26, ME)), [offB, S.offN]);
  await A.day(4); S = await A.st();
  t('★休日の日を研修にすると、休日は外れる（両方は持たせない）', (await A.has('honten-training', 4, ME)) && !(await A.has('honten-dayoff', 4, ME)) && S.offN === offB - 1, S);
  await A.hk('dayoff'); await A.day(4);
  t('★研修の日を休日にすると、研修は外れる', (await A.has('honten-dayoff', 4, ME)) && !(await A.has('honten-training', 4, ME)) && (await A.kOf(4)) === 'off');
  await A.hk('training'); await A.day(26); await A.hk('dayoff');
  t('研修をもう一度押すと外れる', !(await A.has('honten-training', 26, ME)));

  head('⑤ 店の休業日には入れられない');
  await A.day(CLOSED_DAY); S = await A.st();
  t('★休業日を押しても付かない', !(await A.has('honten-dayoff', CLOSED_DAY, ME)) && (await A.kOf(CLOSED_DAY)) === 'cl');
  t('★「休業日には入れられません」と出る', /休業日には入れられません/.test(S.msg), S.msg);

  head('⑥ 休みのメモ（✎ メモ）');
  t('★休日設定の最中は、休みの日に「✎ メモ」が出る', await pa.evaluate(() => !!document.querySelector('[data-off1pen="3"]') && !document.querySelector('[data-off1pen="25"]')));
  await pa.click('[data-off1pen="3"]'); await pa.waitForTimeout(400);
  t('★押すと箱の中にメモの欄が開く（今のメモが入っている）・休日は外れない', (await pa.inputValue('[data-off1memoinput]')) === '午後休' && (await A.has('honten-dayoff', 3, ME)));
  await pa.fill('[data-off1memoinput]', '病院'); await pa.click('[data-off1memosave]'); await pa.waitForTimeout(900);
  t('★保存するとメモが変わる（honten-offnote）', (await A.kv('honten-offnote'))[dk(3) + '::' + ME] === '病院' && !(await pa.$('[data-off1memo]')), await A.kv('honten-offnote'));
  t('マスにもメモが出る', await pa.evaluate(() => /病院/.test(document.querySelector('[data-off1day="3"]').innerText)));
  await A.day(3);
  t('★休みを外すと、その日のメモも消える', !(await A.has('honten-dayoff', 3, ME)) && !(dk(3) + '::' + ME in (await A.kv('honten-offnote'))), await A.kv('honten-offnote'));
  await A.day(3);

  head('⑦ もう一度「休日設定」を押すと終わる');
  await A.kind('hol'); S = await A.st();
  t('★押していない状態に戻る（切り替えも消える・✎ メモも消える）', S.hol === '0' && S.sub.length === 0 && !(await pa.$('[data-off1pen]')), S);
  await A.day(27);
  t('★その後は日を押しても付かない', !(await A.has('honten-dayoff', 27, ME)) && (await A.kOf(27)) === '');

  head('⑧ 予定：マスに札が出る／入りきらない分は「＋n件」／なぞるとポップ');
  const chips = await pa.evaluate(() => {
    const of = d => [...document.querySelectorAll('[data-off1day="' + d + '"] [data-off1sc]')].map(e => e.getAttribute('data-off1sc') + ':' + e.getAttribute('data-off1sckind'));
    const more = d => { const e = document.querySelector('[data-off1day="' + d + '"] [data-off1more]'); return e ? Number(e.getAttribute('data-off1more')) : 0; };
    const c7 = document.querySelector('[data-off1day="7"]');
    return { d6: of(6), d7: of(7).length, more7: more(7), fit7: c7.scrollHeight <= c7.clientHeight + 1,
      bg: k => 0, col: ['s1', 's3', 'p1'].map(id => { const e = document.querySelector('[data-off1sc="' + id + '"]'); return e ? getComputedStyle(e).backgroundColor : ''; }) };
  });
  t('★6日：自分の共有2件・ほかの人の共有1件・マイ1件 が出る', ['s1:mine', 's2:mine', 's3:other', 'p1:priv'].every(x => chips.d6.includes(x)) && chips.d6.length === 4, chips.d6);
  t('★並びは 終日 → 時刻順（終日の店長会議が先頭）', chips.d6[0] === 's3:other' && chips.d6[1] === 's1:mine', chips.d6);
  t('★色は 📝 予定 と同じ（共有＝水色／ほかの人＝灰色／マイ＝ピンク）', chips.col[0] === 'rgb(207, 250, 254)' && chips.col[1] === 'rgb(243, 244, 246)' && chips.col[2] === 'rgb(252, 231, 243)', chips.col);
  t('★7日（9件）：入りきる分だけ出し、残りは「＋n件」', chips.d7 >= 1 && chips.more7 >= 1 && chips.d7 + chips.more7 === 9 && chips.fit7, chips);
  await pa.hover('[data-off1sc="s1"]'); await pa.waitForTimeout(300);
  let pop = await pa.evaluate(() => { const p = document.querySelector('[data-off1pop]'); if (!p) return null; const r = p.getBoundingClientRect(); return { text: p.innerText, in: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, parentBody: p.parentElement === document.body }; });
  t('★札をなぞるとポップが出る（その予定だけ・時刻・件名・メモ全文）', !!pop && /10:00〜11:30/.test(pop.text) && /架空商事 来店 見積もりの説明/.test(pop.text) && /前回の値引きの話の続き/.test(pop.text) && !/陸運局/.test(pop.text), pop);
  t('★誰の予定かも出る（自分・共有）', !!pop && /自分・共有/.test(pop.text), pop && pop.text);
  t('★ポップは画面の中に収まる（document.body へ出す）', !!pop && pop.in && pop.parentBody, pop);
  await shot(pa, 'off1_5_pop.png');
  await pa.hover('[data-off1sc="s3"]'); await pa.waitForTimeout(300);
  pop = await pa.evaluate(() => { const p = document.querySelector('[data-off1pop]'); return p ? p.innerText : ''; });
  t('★ほかの人の予定は、その人の名前が出る', /店長会議/.test(pop) && pop.indexOf('魚住圭') >= 0 && /終日/.test(pop), pop);
  await pa.hover('[data-off1day="7"] [data-off1more]'); await pa.waitForTimeout(300);
  pop = await pa.evaluate(() => { const p = document.querySelector('[data-off1pop]'); return p ? p.innerText : ''; });
  t('★「＋n件」をなぞると、その日の予定が全部出る', /9件/.test(pop) && [1, 5, 9].every(i => pop.indexOf('たくさんの予定 ' + i) >= 0), pop.slice(0, 120));
  await pa.mouse.move(5, 5); await pa.waitForTimeout(300);
  t('★マウスを外すとポップは消える', !(await pa.$('[data-off1pop]')));

  head('⑨ 予定：押してから日を押すと、その日の予定を足せる');
  await pa.click('[data-off1sc="s2"]'); await pa.waitForTimeout(600); S = await A.st();
  t('★予定の札は、何も押していなくても押すとその日の予定が開く', S.modal && await pa.evaluate(() => /陸運局/.test(document.querySelector('.modal-box').innerText) && /歯医者/.test(document.querySelector('.modal-box').innerText)));
  await pa.keyboard.press('Escape'); await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); }); await pa.waitForTimeout(400);
  await A.kind('sched'); S = await A.st();
  t('★「予定」が押された状態になる（休日設定は押されていない）', S.sched === '1' && S.hol === '0' && S.sub.length === 0, S);
  await shot(pa, 'off1_4_sched.png', { width: 1920, height: 900 });
  await A.day(25); S = await A.st();
  t('★日を押すと、その日の予定の窓が開く（休日は付かない）', S.modal && !(await A.has('honten-dayoff', 25, ME)));
  await A.click('＋ 予定を追加'); await pa.waitForTimeout(300);
  await pa.fill('.modal-box input[placeholder^="件名"]', 'テストの予定');
  await pa.fill('.modal-box textarea', 'メモの本文');
  await shot(pa, 'off1_6_schedadd.png', { width: 1920, height: 900 });
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '追加'); if (b) b.click(); });
  await pa.waitForTimeout(1200);
  const ms = await A.kv('mysched'); const added = Object.values(ms).find(v => v && v.title === 'テストの予定');
  t('★追加した予定が保存される（共有スケジュール・その日・自分の名前）', !!added && added.dk === dk(25) && added.uid === 'h3' && added.owner === ME && added.memo === 'メモの本文', added);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('.modal-box button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); }); await pa.waitForTimeout(500);
  t('★マスにその予定の札が出る', await pa.evaluate(() => /テストの予定/.test(document.querySelector('[data-off1day="25"]').innerText)));
  await A.kind('sched'); S = await A.st();
  t('★もう一度「予定」を押すと終わる', S.sched === '0', S);
  // 休日設定の最中に予定の札を押した時は、休日を付ける（マスを押したのと同じ）
  await A.kind('hol');
  await pa.click('[data-off1sc="s2"]'); await pa.waitForTimeout(900); S = await A.st();
  t('★休日設定の最中に予定の札を押すと、休日が付く（予定の窓は開かない）', (await A.has('honten-dayoff', 6, ME)) && !S.modal, S);
  await A.day(6); await A.kind('hol');

  head('⑩ ほかの人のカレンダーは見るだけ／人を変えると「押していない」に戻る');
  await A.kind('hol');
  await A.pick(OTHER); S = await A.st();
  t('★ほかの人のカレンダーでは箱を出さず「見るだけ」と出す', !S.pick && S.ro, S);
  await A.day(26);
  t('★日を押しても、その人の休日は付かない', !(await A.has('honten-dayoff', 26, OTHER)) && !(await A.has('honten-dayoff', 26, ME)));
  const oc = await pa.evaluate(() => [...document.querySelectorAll('[data-off1day="6"] [data-off1sc]')].map(e => e.getAttribute('data-off1sc') + ':' + e.getAttribute('data-off1sckind')));
  t('★その人のカレンダーでは、その人の共有予定が水色・マイスケジュールは出さない', oc.includes('s3:mine') && oc.includes('s1:other') && !oc.some(x => /^p1/.test(x)), oc);
  await pa.click('[data-off1sc="s3"]'); await pa.waitForTimeout(500);
  t('ほかの人のカレンダーでは、札を押しても予定の窓は開かない（なぞって読む）', !(await A.st()).modal);
  await A.pick(ME); S = await A.st();
  t('★自分のカレンダーに戻ると箱が出る・「休日設定」は押していない状態に戻っている', S.pick && S.hol === '0' && S.sched === '0', S);
  t('画面のエラーなし（一般スタッフ）', A.errs.length === 0, A.errs.slice(0, 2));

  head('⑪ 低めの画面（1366×768）でも、右の列とカレンダーが収まる');
  await A.kind('hol');
  await pa.setViewportSize({ width: 1366, height: 768 }); await pa.waitForTimeout(600);
  const small = await pa.evaluate(() => { const s = document.querySelector('[data-off1side]'), c = document.querySelector('[data-off1scroll]'), p = document.querySelector('[data-off1pick]').getBoundingClientRect();
    return { side: [s.scrollHeight, s.clientHeight], cal: [c.scrollHeight, c.clientHeight], pickBottom: Math.round(p.bottom), vh: innerHeight }; });
  t('★休日設定を押した状態でも、右の列はスクロールなしで全部見える', small.side[0] <= small.side[1] + 1 && small.pickBottom <= small.vh, small);
  t('★カレンダーもスクロールなし', small.cal[0] <= small.cal[1] + 1, small);
  if (SHOT) await pa.screenshot({ path: path.join(SHOT, 'off1_7_small.png') });
  await pa.setViewportSize({ width: 1500, height: 950 }); await pa.waitForTimeout(400);
  await A.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑫ 休日の枠を使い切っていたら、休日ではなく有給として入る（今までどおりの決まり）');
  //   会社の休日数を 2 にする。店の休業日（第2火曜＋手で入れた1日）だけで枠が埋まる。
  const C = await start(STAFF, mkSeed({ [STOR + 'mholidays']: { [Y + '-' + (M + 1)]: 2 }, [STOR + 'honten-dayoff']: {}, [STOR + 'honten-offnote']: {} })); const pc = C.page;
  await C.goOff(); await C.kind('hol'); await C.day(25); S = await C.st();
  t('★休日を押すと、有給として入る', (await C.has('honten-pleave', 25, ME)) && !(await C.has('honten-dayoff', 25, ME)) && (await C.kOf(25)) === 'lv', [await C.kv('honten-dayoff'), await C.kv('honten-pleave')]);
  t('★「枠を使い切っているので有給として入れました」と出る', S.auto && /使い切っている/.test(S.msg) && /有給として入れました/.test(S.msg), S.msg);
  await C.day(25);
  t('★「休日」のまま、もう一度押すと外れる', !(await C.has('honten-pleave', 25, ME)) && (await C.kOf(25)) === '');
  t('画面のエラーなし（枠）', C.errs.length === 0, C.errs.slice(0, 2));
  await C.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑬ 管理者：ほかの人のカレンダーでも休日を入れられる（予定は自分のカレンダーだけ）');
  const D = await start(ADM); const pd = D.page;
  await D.goOff(); S = await D.st();
  t('管理者：自分のカレンダーには 予定・休日設定 の両方', S.pick && S.sched === '0' && S.hol === '0', S);
  await D.pick(ME); S = await D.st();
  t('★ほかの人のカレンダー：「休日設定」だけ出る（予定のボタンは出さない）', S.pick && S.hol === '0' && S.sched === null && !S.ro, S);
  await D.day(26);
  t('★押していない時は付かない', !(await D.has('honten-dayoff', 26, ME)));
  await D.kind('hol'); S = await D.st();
  t('★誰の分を入れるかが箱に出る', S.hint.indexOf(ME + 'さん') >= 0, S.hint);
  await D.day(26);
  t('★その人の休日が付く（管理者の名前では付かない）', (await D.has('honten-dayoff', 26, ME)) && !(await D.has('honten-dayoff', 26, ADMIN)), await D.kv('honten-dayoff'));
  await D.day(26);
  t('★もう一度押すと外れる', !(await D.has('honten-dayoff', 26, ME)));
  await D.pick('全員'); await D.pick(OTHER); S = await D.st();
  t('★人を変えると「押していない」に戻る（うっかりほかの人に付けない）', S.pick && S.hol === '0', S);
  await D.day(26);
  t('★そのまま日を押しても付かない', !(await D.has('honten-dayoff', 26, OTHER)));
  t('画面のエラーなし（管理者）', D.errs.length === 0, D.errs.slice(0, 2));

  head('⑭ スケジュールの 🏖（休日スタッフ）から、カレンダーの 🏖 休日 へ移れる');
  await pd.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await pd.waitForTimeout(1500);
  await pd.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => (d.title || '').includes('クリックして休日スタッフを編集') || (d.title || '').includes('店休日のため全員休み')); if (el) el.click(); });
  await pd.waitForTimeout(900);
  const hasBtn = await pd.evaluate(() => { const b = document.querySelector('[data-opencal]'); if (b) { b.click(); return true; } return false; });
  await pd.waitForTimeout(1500);
  t('★「休日のカレンダーを開く」を押すと、カレンダーの 🏖 休日 が開く（設定のモーダルは出ない）', hasBtn && await pd.evaluate(() => !!document.querySelector('[data-offview]') && !/スタッフ休日・有給カレンダー/.test(document.body.innerText)), hasBtn);
  t('画面のエラーなし（入口）', D.errs.length === 0, D.errs.slice(0, 2));
  await D.ctx.close();

  // ────────────────────────────────────────────────────────
  head('⑮ ファイルの中身：設定のモーダルは無い／決まりは1か所');
  const src = fs.readFileSync(path.join(DIR, SRC), 'utf8');
  t('★StaffCalendarModal（設定のモーダル）が無い', src.indexOf('const StaffCalendarModal') < 0 && src.indexOf('<StaffCalendarModal') < 0 && src.indexOf('setShowStaffCal') < 0);
  t('★「🏖 スタッフ休日設定」のボタンが無い', !/>\s*🏖 スタッフ休日設定\s*</.test(src));
  t('★休みを付ける・外す決まりは staffOffApply の1か所', src.split('const staffOffApply=').length - 1 === 1 && src.split('refillOffFromLeave(').length - 1 === 1, src.split('refillOffFromLeave(').length - 1);
  t('★研修を休日の枠に入れない（staffOffApply の研修の枝は calcHolidayCarry を呼ばない）', (() => { const a = src.indexOf("if(kind==='training'){", src.indexOf('const staffOffApply=')), b = src.indexOf('return true;', a); return a > 0 && b > a && src.slice(a, b).indexOf('calcHolidayCarry') < 0; })());

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('合計 ' + (pass + fail) + '件　✔ ' + pass + '　✖ ' + fail);
  console.log(fail === 0 ? '★ PASS' : '✖ FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); try { browser && browser.close(); server && server.close(); } catch (x) {} process.exit(1); });
