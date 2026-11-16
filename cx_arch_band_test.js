// 2026-11-16 ★保管箱（insp-arch）の日から車検の日にちを動かしても【帯】が残るかの検査
//   【何が起きていたか】14日より前の日は insp → insp-arch に移してある。
//   その日の車検の日にちを動かすと、
//     ・buildInspSave は base（insp）にその日のキーが無いので【帯を作れない】
//     ・あと始末の archDropSameBooking が保管箱の行を【黙って null にしていた】
//   ＝帯が出ないどころか、予約が跡形なく消えていた（帯の決まりの抜け穴）。
//   【直し】元の日も hubUnarchiveDay で引き戻す ＋ 保管箱側は archMarkSameBooking で帯にする。
//   実行: node cx_arch_band_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8497, STOR = 'hub-v8-dev-';
const MV_BG = 'rgb(254, 226, 226)';   // 日にち変更＝薄い赤（2026-11-17 入れ替え）
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
  try { sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: me.uid, name: me.name, store: { id: me.store }, role: me.role, email: me.email })); } catch (e) {}
};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const N = new Date();
const d = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() }; };
const dk = (o) => o.y + '-' + o.m + '-' + o.d;
const MD = (o) => o.m + '/' + o.d;
// ★元の日は【30日前】＝ふだんなら保管箱にしか無い日。移り先はその翌日（同じ月なので選びやすい）
const T0 = d(-30), DKA = dk(T0);
// 保管箱の3件。動かすのは真ん中の 客2（custId あり）。客3 は custId 無し＝氏名＋ナンバーの道
const ARCH_ROWS = [
  { name: '客1', carType: 'タント', no: '1111', course: 2, time: '09:00', store: 'honten', seq: 1, bookingStatus: 'confirmed', custId: 'C1' },
  { name: '客2', carType: 'ワゴンR', no: '2222', course: 2, time: '10:00', store: 'honten', seq: 2, bookingStatus: 'confirmed', custId: 'C2' },
  { name: '客3', carType: 'スイフト', no: '3333', course: 2, time: '11:00', store: 'honten', seq: 3, bookingStatus: 'confirmed' },
];

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'insp-arch']: { [DKA]: ARCH_ROWS },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;').replace(/const AUTH_REQUIRED=(true|false);/, 'const AUTH_REQUIRED=false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.waitForTimeout(900);
  const toDay = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
    await page.waitForTimeout(1600);
  };
  await toDay();
  // ★日の移動は日付の札（HubDatePick）から。「本日に戻る」や « は日数が決め打ちなので使わない
  const goDay = async (o) => {
    const want = o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
    const wantMon = o.y + '-' + String(o.m).padStart(2, '0');
    await page.evaluate(() => { const b = document.querySelector('[data-datepick]'); if (b) b.click(); });
    await page.waitForTimeout(500);
    for (let i = 0; i < 6; i++) {
      const mon = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : ''; });
      if (mon === wantMon) break;
      await page.evaluate(() => { const b = document.querySelector('[data-mnav="prev"]'); if (b) b.click(); });
      await page.waitForTimeout(400);
    }
    const ok = await page.evaluate(w => { const c = document.querySelector('[data-day="' + w + '"]'); if (c) { c.click(); return true; } return false; }, want);
    await page.waitForTimeout(1800);
    return ok;
  };
  const openByName = (nm) => page.evaluate(x => {
    const td = [...document.querySelectorAll('td')].find(e => e.offsetParent !== null && e.innerText.indexOf(x) >= 0 && getComputedStyle(e).cursor === 'pointer');
    if (td) { td.click(); return true; } return false;
  }, nm);
  // カードのカレンダーから「その月の別の日」へ動かす
  const moveToTomorrowOfArch = () => page.evaluate(w => {
    const box = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
    if (!box) return null;
    const grid = [...box.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
    if (!grid) return null;
    const cell = [...grid.children].find(c => c.innerText.trim() === String(w));
    if (!cell) return null;
    cell.click(); return w;
  }, T0.d > 20 ? T0.d - 1 : T0.d + 1);
  const WANT_D = T0.d > 20 ? T0.d - 1 : T0.d + 1;
  const DKTO = T0.y + '-' + T0.m + '-' + WANT_D;

  head('① 保管箱の日が1日表示に出る（引き戻しの前）');
  t('30日前の日へ移れる', await goDay(T0));
  const before = await page.evaluate(() => document.body.innerText);
  t('保管箱の3件が出ている', ['客1', '客2', '客3'].every(n => before.indexOf(n) >= 0));

  head('② その日の車検の日にちを動かす');
  t('客2 の予約カードが開く', await openByName('客2') && await seeText(page, '車検予約カード', 8000));
  await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find(e => e.innerText && e.innerText.trim() === 'クリックで日付変更' && e.offsetParent !== null); if (s) s.click(); });
  await page.waitForTimeout(600);
  t('同じ月の別の日を選べる', (await moveToTomorrowOfArch()) === WANT_D);
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /内容を保存|確定して登録/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(4000);

  head('③ ★元の日に【日にち変更の帯】が残る（消えていない）');
  const srv = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'insp');
  const arc = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'insp-arch');
  const allRows = []
    .concat(...Object.values(srv || {}).filter(Array.isArray))
    .concat(...Object.values(arc || {}).filter(Array.isArray));
  const r2 = allRows.find(r => r && r.name === '客2' && r.bookingStatus === 'cancelled');
  t('★客2 の帯がサーバーに残っている', !!r2, { insp: srv, arch: arc });
  t('★帯に「元の日 → 移った日」が入っている', !!r2 && r2.cxFrom === DKA && r2.cxTo === DKTO, r2);
  t('★動かした人が残っている', !!r2 && r2.cxBy === '江川京志', r2 && r2.cxBy);
  t('★移り先には生きている予約が入っている', allRows.some(r => r && r.name === '客2' && r.bookingStatus === 'confirmed'), allRows.filter(r => r && r.name === '客2'));
  t('★客2 が跡形なく消えてはいない（帯＋移り先の2件）', allRows.filter(r => r && r.name === '客2').length === 2, allRows.filter(r => r && r.name === '客2'));
  t('★巻き添えなし（客1・客3 はそのまま生きている）',
    allRows.some(r => r && r.name === '客1' && r.bookingStatus !== 'cancelled') &&
    allRows.some(r => r && r.name === '客3' && r.bookingStatus !== 'cancelled'), allRows.map(r => r && [r.name, r.bookingStatus]));
  t('★その日が insp と保管箱の両方に出ていない（二重持ちにしない）',
    !(srv && Array.isArray(srv[DKA]) && arc && Array.isArray(arc[DKA]) && arc[DKA].some(r => r && r.name)), { insp: !!(srv && srv[DKA]), arch: !!(arc && arc[DKA]) });

  head('④ ★画面でも元の日に帯が出る');
  t('元の日へ戻れる', await goDay(T0));
  const band = await page.evaluate(() => [...document.querySelectorAll('tr[data-cxband]')].map(r => ({
    kind: r.getAttribute('data-cxband'),
    bg: getComputedStyle(r.querySelector('td')).backgroundColor,
    date: r.querySelector('[data-cxdate]') ? r.querySelector('[data-cxdate]').innerText.replace(/\s/g, '') : '',
    by: r.querySelector('[data-cxby]') ? r.querySelector('[data-cxby]').innerText.replace(/\s/g, '') : '',
    txt: r.innerText.replace(/\s/g, ''),
  })));
  const mv = band.find(x => x.kind === 'move') || {};
  t('★日にち変更の帯が1本出る', band.filter(x => x.kind === 'move').length === 1, band);
  t('★薄い赤（#fee2e2）', mv.bg === MV_BG, mv.bg);
  t('★元の日 → 移った日 の形', mv.date === MD(T0) + '→' + T0.m + '/' + WANT_D, { got: mv.date, want: MD(T0) + '→' + T0.m + '/' + WANT_D });
  t('★お名前と担当者が出る', (mv.txt || '').indexOf('客2') >= 0 && (mv.by || '').indexOf('江川京志') >= 0, mv);
  t('生きている2件（客1・客3）は番号付きで残る', await page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].filter(r => !r.hasAttribute('data-cxband') && /客[13]/.test(r.innerText)).length) === 2);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  head('⑤ 中身の見張り（3ファイルとも「消さずに帯」になっているか）');
  const SI = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const SC = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const SM = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('★3ファイルとも archMarkSameBooking を置いている', [SI, SC, SM].every(s => s.indexOf('const archMarkSameBooking=') >= 0));
  t('★日にち変更のあと始末で archDropSameBooking を呼んでいない',
    [SI, SC, SM].every(s => s.indexOf('archDropSameBooking(_a,') < 0), {
      index: SI.indexOf('archDropSameBooking(_a,') >= 0, cust: SC.indexOf('archDropSameBooking(_a,') >= 0, mob: SM.indexOf('archDropSameBooking(_a,') >= 0 });
  t('★PC は元の日も保管箱から引き戻す', SI.indexOf('if(_saveParams.isDateChange&&_saveParams.origDk)await hubUnarchiveDay(_saveParams.origDk)') >= 0);
  t('★保管箱を書く前に引き戻しを待つ', SI.indexOf('if(_unarchDone) await _unarchDone') >= 0);
  t('★スマホも保管箱の行を帯にする', SM.indexOf('archMarkOneBooking(_a,req.dk,_aTgt,{dk:req.dk,to:tDk') >= 0);
  t('★顧客リストも保管箱の行を帯にする', SC.indexOf('archMarkSameBooking(_a,customer.custId,dkFormatted') >= 0);

  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '全' + pass + '件 PASS' : pass + '件 PASS / ' + fail + '件 不合格'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
