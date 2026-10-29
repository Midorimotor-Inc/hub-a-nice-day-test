// 週間カレンダーの4つの検査（2026-10-29 ユーザー指示・mock_week_v6.html で確認ずみ）
//   ① 時間を畳める　… 1週間のどこにも予定が無い時間の行を隠す（午前入庫は隠さない）
//   ② 本日を一番左端　… 既定は本日から7日ぶん。「📅 月曜から」で今までの並びにも戻せる
//   ③ 7台目以降の！　… 黄＝まだ承認されていない／緑＝承認済み（車検のバッジの右上）
//   ④ なぞると予約を入れた日時　… 整備のお名前／車検のバッジ
//   実行: node week4_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8375, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

// 画面の日付を 2026-10-21（水）に固定する
//   本日から … 10/21（水）〜10/27（火）　／　月曜から … 10/19（月）〜10/25（日）
const FIX = [2026, 10, 21];
const dk = (d) => FIX[0] + '-' + FIX[1] + '-' + d;
const WED = dk(21), FRI = dk(23);

// 「いつ予約を入れたか」の記録（v3.78.0 から入る）。10/15 14:23 に江川が入れた、という想定
const AT = new Date(2026, 9, 15, 14, 23).getTime();

const ins = (nm, course, extra) => Object.assign(
  { name: nm, carType: 'アルト', no: '3503', course, store: 'honten', time: '09:00', bookingStatus: 'confirmed' }, extra || {});
const six = Array.from({ length: 6 }, (_, i) => ins('六' + (i + 1), 2));

const seed = {
  // 水曜＝7台（7台目はまだ承認されていない＝黄）／金曜＝8台（あふれた2台とも承認済み＝緑）
  [STOR + 'insp']: {
    [WED]: six.concat([ins('七番', 3, { pendingApproval: true })]),
    [FRI]: six.concat([ins('八番A', 3, { approved: true }), ins('八番B', 3, { approved: true })]),
  },
  // 整備：09:00 に1件（入れた日時の記録あり）／15:00 に1件（記録なし＝この仕組みより前の予約）
  [STOR + 'honten-sched']: {
    [WED]: {
      '09:00': { name: '記録あり花子', work: 'O', content: 'オイル交換', staff: '江川京志', at: AT, by: '江川京志' },
      '15:00': { name: '記録なし太郎', work: 'T', content: 'タイヤ交換', staff: '江川京志' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
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
  // 上の並びの「週間カレンダー」から開く
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1400);
  t('週の表が開く', await page.evaluate(() => !!document.querySelector('[data-weekview]')));

  // 見出しの並び（列の日付）
  const headDays = () => page.evaluate(() => [...document.querySelectorAll('[data-wday]')].map(b => b.innerText.trim()));

  console.log('\n■ ② 本日を一番左端に');
  let hd = await headDays();
  t('★一番左が本日（10/21（水））', hd[0] === '10/21（水）', hd);
  t('★そこから7日ぶん出る（右端は 10/27（火））', hd[6] === '10/27（火）', hd);
  t('★見出しの文も本日から', await page.evaluate(() => /10\/21（水） 〜 10\/27（火）/.test(document.querySelector('[data-weekview]').innerText)));
  t('★曜日は日付から出す（並びがズレても合う）', hd.join('|') === '10/21（水）|10/22（木）|10/23（金）|10/24（土）|10/25（日）|10/26（月）|10/27（火）', hd);
  t('★切り替えのボタンは「📍 本日から」', await page.evaluate(() => {
    const b = document.querySelector('[data-wfrom]'); return !!b && b.getAttribute('data-wfrom') === 'today' && /本日から/.test(b.innerText);
  }));
  // 月曜はじまりに戻せる
  await page.evaluate(() => document.querySelector('[data-wfrom]').click());
  await page.waitForTimeout(700);
  hd = await headDays();
  t('★押すと月曜はじまり（10/19（月）が左端）', hd[0] === '10/19（月）', hd);
  t('★日曜（10/25）が右端', hd[6] === '10/25（日）', hd);
  // 本日からに戻す
  await page.evaluate(() => document.querySelector('[data-wfrom]').click());
  await page.waitForTimeout(700);
  hd = await headDays();
  t('★もう一度押すと本日からに戻る', hd[0] === '10/21（水）', hd);

  console.log('\n■ ③ 7台目以降の「！」');
  const bangs = () => page.evaluate(() => [...document.querySelectorAll('[data-wcb]')].map(b => ({
    dk: b.getAttribute('data-wcb'), bang: b.getAttribute('data-wbang'),
    dot: (() => { const s = b.querySelector('[data-wbangdot]'); return s ? getComputedStyle(s).backgroundColor : ''; })(),
    title: b.getAttribute('title') || '',
  })));
  const bs = await bangs();
  t('車検のバッジが出ている（7台＋8台＝15台）', bs.length === 15, bs.length);
  const wait = bs.filter(x => x.bang === 'wait'), ok = bs.filter(x => x.bang === 'ok');
  t('★まだ承認されていない分が1件だけ', wait.length === 1, wait);
  t('★その印は黄色（250,204,21）', !!wait[0] && /250, 204, 21/.test(wait[0].dot), wait[0]);
  t('★承認済みの分が2件', ok.length === 2, ok);
  t('★その印は緑（34,197,94）', !!ok[0] && /34, 197, 94/.test(ok[0].dot), ok[0]);
  t('★6台までの分には印を付けない', bs.filter(x => x.bang === '0').length === 12, bs.filter(x => x.bang === '0').length);
  t('★なぞると「枠からあふれた分」と出る', !!wait[0] && /枠からあふれた分/.test(wait[0].title), wait[0] && wait[0].title);
  t('★承認されていないことが分かる', !!wait[0] && /まだ承認されていません/.test(wait[0].title), wait[0] && wait[0].title);
  t('★承認済みの分はそう出る', !!ok[0] && /承認済み/.test(ok[0].title), ok[0] && ok[0].title);

  console.log('\n■ ④ なぞると予約を入れた日時');
  t('★車検のバッジのなぞり書きにも入れた日時が出る', bs.every(x => /予約を入れた日時/.test(x.title)), bs[0] && bs[0].title);
  t('★記録が無い分は「記録なし」と出る', bs.some(x => /予約を入れた日時　記録なし/.test(x.title)), bs[0] && bs[0].title);
  const nm = await page.evaluate(() => [...document.querySelectorAll('[data-wentnm]')].map(e => e.innerText.trim()));
  t('整備のお名前が2件出ている', nm.length === 2 && nm.indexOf('記録あり花子') >= 0 && nm.indexOf('記録なし太郎') >= 0, nm);
  // 記録ありをなぞる
  // ★React は mouseover を見て onMouseEnter を呼ぶので、本物のマウス移動でなぞる
  await page.locator('[data-wentnm]').filter({ hasText: '記録あり' }).first().hover();
  await page.waitForTimeout(400);
  let tip = await page.evaluate(() => { const e = document.querySelector('[data-wtip]'); return e ? e.innerText : ''; });
  t('★吹き出しが出る', !!tip, tip);
  t('★見出しが「予約を入れた日時」', /予約を入れた日時/.test(tip), tip);
  t('★お名前が出る', /記録あり花子様/.test(tip), tip);
  t('★入れた日時が出る（10/15 14:23）', /10\/15 14:23/.test(tip), tip);
  t('★入れた人も出る', /入れた人 江川京志/.test(tip), tip);
  // 記録なしをなぞる
  await page.locator('[data-wentnm]').filter({ hasText: '記録なし' }).first().hover();
  await page.waitForTimeout(400);
  tip = await page.evaluate(() => { const e = document.querySelector('[data-wtip]'); return e ? e.innerText : ''; });
  t('★記録が無い予約は、そうと分かるように出る', /記録なし/.test(tip) && /この仕組みを入れる前の予約/.test(tip), tip);
  t('★内容（全文）の吹き出しは今までどおり残っている', await page.evaluate(() => !!document.querySelector('[data-wct]')));

  console.log('\n■ ① 時間を畳める');
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-weekview] tbody tr')]
    .map(tr => (tr.children[0] ? tr.children[0].innerText.trim() : '')).filter(Boolean));
  const before = await rows();
  t('畳む前は空いている時間の行も出ている（10:00 がある）', before.indexOf('10:00') >= 0, before);
  t('ボタンの名前は「▲ 畳む」', await page.evaluate(() => /▲ 畳む/.test(document.querySelector('[data-wfold]').innerText)));
  await page.evaluate(() => document.querySelector('[data-wfold]').click());
  await page.waitForTimeout(700);
  const after = await rows();
  t('★予定が無い時間の行は消える（10:00）', after.indexOf('10:00') < 0, after);
  t('★予定がある時間の行は残る（09:00・15:00）', after.indexOf('09:00') >= 0 && after.indexOf('15:00') >= 0, after);
  t('★車検と出勤の行は隠さない', after.indexOf('車検') >= 0 && after.indexOf('出勤') >= 0, after);
  t('★午前入庫は隠さない（置き場所が分からなくなるため）', after.indexOf('午前入庫') >= 0, after);
  t('★行がちゃんと減っている', after.length < before.length, { before: before.length, after: after.length });
  t('★ボタンの名前が「▼ 開く」に変わる', await page.evaluate(() => /▼ 開く/.test(document.querySelector('[data-wfold]').innerText)));
  await page.evaluate(() => document.querySelector('[data-wfold]').click());
  await page.waitForTimeout(700);
  const back = await rows();
  t('★もう一度押すと元に戻る', back.length === before.length && back.indexOf('10:00') >= 0, { before: before.length, back: back.length });

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
