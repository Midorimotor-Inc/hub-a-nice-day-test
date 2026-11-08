// 週間カレンダー：畳んだ状態は「予定が多くても1画面で全部見える」ことの検査
//   （v3.105.0・2026-11-08 ユーザー指示：
//     「畳んだ状態で予定が詰まってくると上下スクロールしないと全体が見えない。
//       一目で仕事量が分かるようにというのが週間カレンダーの意図なので、全体が見えるようにしてほしい」）
//   ・畳んだ時：上下スクロールが出ない／いちばん下の行まで枠の中に入っている
//   ・入りきらない時だけ縮める（倍率は WFIT_MIN 以上・1 未満）。横幅は変わらない＝純粋なズーム
//   ・据え置きの表（午後入庫・時間未定）も同じ倍率＝列がズレない
//   ・予定が少ない週は今までどおり（倍率1・表は高さいっぱい）
//   ・広げた時（畳んでいない時）は今までどおりスクロールする
//   実行: node week_fit_test.js        見た目も撮る: SHOT=<保存先.png> node week_fit_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8455, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

// 本日を 2026-11-09（月）に固定 … 畳んだ表は 11/9〜11/15
const FIX = [2026, 11, 9];
const dk = (d) => FIX[0] + '-' + FIX[1] + '-' + d;
const BUSY = [9, 10, 11, 12, 13];          // 予定を詰める日（本日から5日）

const TIMES = [];
for (let h = 9; h <= 18; h++) { TIMES.push(String(h).padStart(2, '0') + ':00'); if (h < 18) TIMES.push(String(h).padStart(2, '0') + ':30'); }

// ★混んだ週：どの時間の枠にも予定が入っている＝畳んでも行が19本そのまま出る
const sched = {};
BUSY.forEach((d) => {
  const day = {};
  TIMES.forEach((tm, j) => {
    day[tm] = { name: '混' + d + '-' + j, work: 'Q', content: 'オイル交換とタイヤ交換の点検', staff: '江川京志', store: 'honten' };
    if (j % 4 === 0) day[tm + '__1'] = { name: '混' + d + '-' + j + 'B', work: 'B', content: '鈑金の見積り', staff: '江川京志', store: 'honten' };
  });
  day['午前'] = { name: '午前' + d, work: 'Q', content: '午前入庫', staff: '江川京志', store: 'honten' };
  day['午後'] = { name: '午後' + d, work: 'Q', content: '午後入庫', staff: '江川京志', store: 'honten' };
  day['未定'] = { name: '未定' + d, work: 'Q', content: '時間未定', staff: '江川京志', store: 'honten' };
  sched[dk(d)] = day;
});
const ins = (nm, course) => ({ name: nm, carType: 'アルト', no: '3503', course, store: 'honten', time: '09:00', bookingStatus: 'confirmed' });
const insp = {};
BUSY.forEach(d => { insp[dk(d)] = Array.from({ length: 6 }, (_, i) => ins('車検' + d + '-' + i, (i % 3) + 1)); });

const seed = {
  [STOR + 'insp']: insp,
  [STOR + 'honten-sched']: sched,
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' },
    { uid: 'h8', name: '見取大介', myNumber: 8, badge: 'bodywork', store: 'honten' },
  ],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-schedRestrictions']: {}, [STOR + 'sanda-schedRestrictions']: {},
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};

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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
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
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1600);

  // 枠とスクロールの様子を読む
  const look = () => page.evaluate(() => {
    const root = document.querySelector('[data-weekview]'); if (!root) return null;
    const box = root.querySelector('[data-wfit]');
    const sc = root.querySelector('[data-wscroll="1"]');   // ★スクロールする枠そのもの（縮める箱の親ではない）
    const tb = box ? box.querySelector('table') : null;
    const foot = root.querySelector('[data-wfoot="1"]');
    const footTb = foot ? foot.querySelector('table') : null;
    const rows = tb ? [...tb.querySelectorAll('tbody tr')] : [];
    const lastRow = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null;
    const scR = sc ? sc.getBoundingClientRect() : null;
    const mainTm = tb ? tb.querySelector('tbody tr td') : null;
    const footTm = footTb ? footTb.querySelector('tbody tr td') : null;
    const r = (el) => el ? el.getBoundingClientRect() : null;
    // ★縮めている時、scrollHeight / scrollWidth は『縮める前』の数字を返す（transform は配置を変えないため）。
    //   本当にスクロールするかは、動かしてみて位置が変わるかで見る。
    let canY = 0, canX = 0;
    if (sc) { sc.scrollTop = 9999; canY = sc.scrollTop; sc.scrollTop = 0;
              sc.scrollLeft = 9999; canX = sc.scrollLeft; sc.scrollLeft = 0; }
    return {
      fit: box ? Number(box.getAttribute('data-wfit')) : null,
      scH: sc ? sc.clientHeight : 0, scSH: sc ? sc.scrollHeight : 0,
      scW: sc ? sc.clientWidth : 0, scSW: sc ? sc.scrollWidth : 0, canY, canX,
      bar: sc ? sc.offsetWidth - sc.clientWidth : 0,
      tf: box ? getComputedStyle(box).transform : '',
      rows: rows.length,
      lastBottom: lastRow ? Math.round(lastRow.bottom) : 0,
      scBottom: scR ? Math.round(scR.bottom) : 0,
      mainTmW: mainTm ? Math.round(mainTm.getBoundingClientRect().width * 10) / 10 : null,
      footTmW: footTm ? Math.round(footTm.getBoundingClientRect().width * 10) / 10 : null,
      footH: foot ? Math.round(r(foot).height) : 0,
      footTbH: footTb ? Math.round(r(footTb).height) : 0,
      footBottom: foot ? Math.round(r(foot).bottom) : 0,
      rootBottom: Math.round(r(root).bottom),
      foldBtn: (root.querySelector('[data-wfold]') || {}).innerText || '',
      texts: (tb ? tb.innerText : '').length,
    };
  });

  console.log('\n■ ① 畳んだ状態（予定が詰まっている週）');
  let a = await look();
  t('週の表が開いていて、畳んである', !!a && a.rows > 10, a && { rows: a.rows });
  t('★どの時間の枠にも予定がある週なので、行が全部出ている', !!a && a.rows >= 20, a && a.rows);
  t('★上下にスクロールしない（全体が見える）', !!a && a.canY === 0, a && { canY: a.canY, scH: a.scH });
  t('★いちばん下の行まで枠の中に入っている', !!a && a.lastBottom <= a.scBottom + 2, a && { last: a.lastBottom, box: a.scBottom });
  t('★据え置きの帯も画面の中に収まっている', !!a && a.footBottom <= a.rootBottom + 2, a && { foot: a.footBottom, root: a.rootBottom });
  t('★入りきらないので縮めている（倍率 < 1）', !!a && a.fit < 1, a && a.fit);
  t('★縮めすぎない（倍率は 0.5 以上）', !!a && a.fit >= 0.5, a && a.fit);
  t('★横幅は変わらない＝純粋なズーム（横スクロールは出ない）', !!a && a.canX === 0, a && { canX: a.canX, w: a.scW });
  t('★スクロールバーそのものが出ていない', !!a && a.bar === 0, a && a.bar);
  t('★据え置きの表も同じ倍率＝時間の列の幅がそろう', !!a && a.mainTmW != null && a.footTmW != null && Math.abs(a.mainTmW - a.footTmW) <= 1, a && { main: a.mainTmW, foot: a.footTmW });
  t('★据え置きの帯の高さも縮めたぶんだけ（下に余白を残さない）', !!a && Math.abs(a.footH - (a.footTbH + 3)) <= 4, a && { foot: a.footH, tb: a.footTbH });
  t('予定の字はちゃんと出ている', !!a && a.texts > 200, a && a.texts);
  t('この時点でエラーは出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('  📷 ' + process.env.SHOT); }

  console.log('\n■ ② 広げた時は今までどおりスクロールする');
  await page.evaluate(() => { const b = document.querySelector('[data-wfold]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  let b2 = await look();
  t('★広げた時は縮めない（倍率1）', !!b2 && b2.fit === 1, b2 && b2.fit);
  t('★広げた時は縮める箱を使わない（今までどおりの出し方）', !!b2 && (b2.tf === 'none' || !b2.tf), b2 && b2.tf);
  if (process.env.SHOT2) { await page.screenshot({ path: process.env.SHOT2 }); console.log('  📷 ' + process.env.SHOT2); }
  await page.evaluate(() => { const b = document.querySelector('[data-wfold]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  let b3 = await look();
  t('★また畳むと、もう一度1画面に収まる', !!b3 && b3.fit < 1 && b3.canY === 0, b3 && { fit: b3.fit, canY: b3.canY });

  console.log('\n■ ③ 予定が少ない週は今までどおり（倍率1・高さいっぱい）');
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="1"]'); if (b) b.click(); });
  await page.waitForTimeout(1300);
  let c = await look();
  t('★予定の無い週は縮めない（倍率1）', !!c && c.fit === 1, c && c.fit);
  t('★表は高さいっぱいまで伸びている（下に余白を出さない・v3.99.0）', !!c && c.lastBottom >= c.scBottom - 8, c && { last: c.lastBottom, box: c.scBottom });
  t('★上下にスクロールしない', !!c && c.canY === 0, c && { canY: c.canY });
  if (process.env.SHOT3) { await page.screenshot({ path: process.env.SHOT3 }); console.log('  📷 ' + process.env.SHOT3); }

  console.log('\n■ ④ 混んだ週に戻ると、また収まる');
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="-1"]'); if (b) b.click(); });
  await page.waitForTimeout(1300);
  let d2 = await look();
  t('★戻ると縮めて1画面に収まる（週を送っても効く）', !!d2 && d2.fit < 1 && d2.canY === 0, d2 && { fit: d2.fit, canY: d2.canY });

  console.log('\n■ ⑤ 小さい画面（縦 700px）でも収まる');
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.waitForTimeout(1300);
  let e2 = await look();
  t('★窓を小さくしても縮め直す', !!e2 && e2.canY === 0, e2 && { fit: e2.fit, canY: e2.canY });
  t('★下限（0.5）より小さくはしない', !!e2 && e2.fit >= 0.5, e2 && e2.fit);
  if (process.env.SHOT4) { await page.screenshot({ path: process.env.SHOT4 }); console.log('  📷 ' + process.env.SHOT4); }

  console.log('\n■ ⑥ ファイルの中身の見張り');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('倍率の下限は WFIT_MIN ひとつで決めている', /const WFIT_MIN\s*=\s*0\.5/.test(SRC));
  t('★広げた時は必ず倍率1（folded の時だけ縮める）', /const fitv=folded\?fit:1;/.test(SRC));
  t('★縮めている時は表の height:100% を外す（本当の高さを測るため）', /height:fitv<1\?'auto':'100%'/.test(SRC));
  t('★横は 100/倍率 ％にしてから縮める（横幅を変えない）', /width:\(100\/fitv\)\.toFixed/.test(SRC));
  t('★据え置きの表も同じ倍率で縮める', (SRC.match(/transform:'scale\('\+fitv\+'\)'/g) || []).length >= 2);
  t('★ゼブラの位相合わせも倍率で割って直している', /mod\(\(r\.left-base\.left\)\/z\)/.test(SRC));
  t('エラーは1件も出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log('\n━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
