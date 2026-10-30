// 予約の「受け付けの記録」の検査（2026-10-29 ユーザー指示）
//   ① 予約カードを開くと「受け付け　いつ・だれ」が出る（1日表示の行は BLOCK-C なので触らない）
//   ② v3.79.0 より前の予約は「記録なし」と出る
//   ③ 新規のカードには出さない（まだ受け付けていないため）
//   ④ 日にちを変えて保存すると「日にち変更　10/21 → 10/23　いつ・だれ」が残る
//      ★受け付けの日時は上書きしない（最初に入れた時のまま）
//   ⑤ 1日表示でお名前をなぞっても出る（車検も整備も・2026-10-30 ユーザー指示）
//   実行: node entry_log_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8381, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

const FIX = [2026, 10, 21];
const TODAY = '2026-10-21', MOVED = '2026-10-23';
const AT = new Date(2026, 9, 15, 14, 23).getTime();

const seed = {
  // ★1日表示の【車検の行】のなぞり書きを見るため、車検も1件入れておく
  [STOR + 'insp']: {
    [TODAY]: [{ name: '車検記録子', carType: 'ヴィッツ', no: '5555', course: 2, staff: '江川京志', store: 'honten', bookingStatus: 'confirmed', seq: AT, rcvAt: AT, rcvBy: '江川京志' }],
  },
  [STOR + 'honten-sched']: {
    [TODAY]: {
      '09:00': { name: '記録あり花子', carType: 'アルト', no: '3503', work: 'O', content: 'オイル交換', staff: '江川京志', rcvAt: AT, rcvBy: '江川京志' },
      '10:00': { name: '記録なし太郎', carType: 'タント', no: '1234', work: 'T', content: 'タイヤ交換', staff: '江川京志' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
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
  const entryBox = () => page.evaluate(() => { const e = document.querySelector('[data-bkentry]'); return e ? e.innerText.replace(/\n/g, ' / ') : null; });
  const closeCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(600);
  };
  // 週の表から、その日のその予定の予約カードを開く
  const openFromWeek = async (name) => {
    await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
    await page.waitForTimeout(1300);
    const ok = await page.evaluate(n => {
      const e = [...document.querySelectorAll('[data-went]')].find(x => x.innerText.indexOf(n) >= 0);
      if (!e) return false; e.click(); return true;
    }, name);
    await page.waitForTimeout(1000);
    return ok;
  };

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1400);

  console.log('\n■ ① 予約カードに受け付けの記録が出る');
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /記録あり花子/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(900);
  t('予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  let box = await entryBox();
  t('★受け付けの記録の欄がある', !!box, box);
  t('★入れた日時が出る（10/15 14:23）', !!box && /受け付け　10\/15 14:23/.test(box), box);
  t('★入れた人も出る（江川京志）', !!box && /10\/15 14:23　江川京志/.test(box), box);
  t('★まだ日にちは変えていないので、その行は出ない', !!box && !/日にち変更/.test(box), box);
  await closeCard();

  console.log('\n■ ② 前からある予約は「記録なし」');
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /記録なし太郎/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(900);
  box = await entryBox();
  t('★「記録なし」と出る', !!box && /受け付け　記録なし/.test(box), box);
  t('★理由も書いてある（この仕組みを入れる前の予約）', !!box && /この仕組みを入れる前の予約/.test(box), box);
  await closeCard();

  // ── ⑤ 1日表示のお名前をなぞる（2026-10-30 ユーザー指示）────────────────
  //   週表だけでなく、1日表示の車検・整備すべての行で読めるようにした。
  //   ★BLOCK-C の行で触ったのは【出す言葉・見た目だけ】。判定・並び・保存には手を出していない。
  console.log('\n■ ⑤ 1日表示でお名前をなぞると受け付けの記録が出る');
  const hoverName = async (name) => {
    const el = page.locator('[data-entrynm]').filter({ hasText: name }).first();
    if (!(await el.count())) return '';
    await el.hover();
    await page.waitForTimeout(400);
    return await page.evaluate(() => { const e = document.querySelector('[data-entrytip]'); return e ? e.innerText.replace(/\n/g, ' / ') : ''; });
  };
  const tipS = await hoverName('記録あり花子');
  t('★整備のお名前になぞり書きが付いている', !!tipS, tipS);
  t('★見出しが「この予約の受け付け」', /この予約の受け付け/.test(tipS), tipS);
  t('★入れた日時と入れた人が出る', /受け付け　10\/15 14:23/.test(tipS) && /江川京志/.test(tipS), tipS);
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const tipI = await hoverName('車検記録子');
  t('★車検のお名前にも付いている', !!tipI, tipI);
  t('★車検も入れた日時が出る', /受け付け　10\/15 14:23/.test(tipI), tipI);
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const tipN = await hoverName('記録なし太郎');
  t('★記録が無い予約は「記録なし」と出る', /受け付け　記録なし/.test(tipN), tipN);
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  t('★なぞるのをやめると消える', await page.evaluate(() => !document.querySelector('[data-entrytip]')));

  console.log('\n■ ③ 新しく入れるカードには出さない');
  await page.evaluate(() => { const td = document.querySelector('[data-wadd]'); if (td) td.click(); });
  await page.waitForTimeout(300);
  // 1日表示の空き枠から新規を開く
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => /14:00/.test(r.innerText) && !/記録/.test(r.innerText));
    if (tr) tr.click();
  });
  await page.waitForTimeout(900);
  const isNewCard = await page.evaluate(() => !!document.querySelector('.booking-modal-inner'));
  t('新規の予約カードが開く', isNewCard);
  t('★受け付けの記録の欄は出さない', isNewCard && !(await page.evaluate(() => !!document.querySelector('[data-bkentry]'))) ? true : !(await page.evaluate(() => !!document.querySelector('[data-bkentry]'))));
  await closeCard();

  console.log('\n■ ④ 日にちを変えると、その記録も残る');
  await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /記録あり花子/.test(r.innerText)); if (tr) tr.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find(e => e.innerText && e.innerText.trim() === 'クリックで日付変更' && e.offsetParent !== null); if (s) s.click(); });
  await page.waitForTimeout(600);
  const picked = await page.evaluate(() => {
    const box2 = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
    if (!box2) return null;
    const grid = [...box2.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
    if (!grid) return null;
    const cell = [...grid.children].find(c => c.innerText.trim() === '23');
    if (!cell) return null;
    cell.click(); return 23;
  });
  t('10/23 を選べる', picked === 23, picked);
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2600);

  const sd = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-sched');
  const row = sd && sd[MOVED] ? Object.values(sd[MOVED]).find(r => r && r.name === '記録あり花子') : null;
  t('★10/23 へ移っている', !!row, sd && Object.keys(sd));
  t('★元の日（10/21）からは消えている', !(sd && sd[TODAY] && Object.values(sd[TODAY] || {}).some(r => r && r.name === '記録あり花子')), sd && sd[TODAY]);
  t('★日にち変更の記録が1つ残る', !!row && Array.isArray(row.moved) && row.moved.length === 1, row && row.moved);
  t('★どの日からどの日へ、が残る', !!row && row.moved && row.moved[0].from === TODAY && row.moved[0].to === MOVED, row && row.moved);
  t('★誰が変えたかも残る', !!row && row.moved && row.moved[0].by === '江川京志', row && row.moved);
  t('★いつ変えたかも残る', !!row && row.moved && typeof row.moved[0].at === 'number' && row.moved[0].at > 0, row && row.moved);
  t('★★受け付けの日時は上書きしない（10/15 のまま）', !!row && row.rcvAt === AT, row && { rcvAt: row.rcvAt, want: AT });
  t('★整備の at（マッハ特例に使う別物）とは混ざっていない', !!row && row.rcvAt !== row.at, row && { at: row.at, rcvAt: row.rcvAt });

  console.log('\n■ ④-2 移った先のカードで読める');
  // ★いちど別の予約を開く。予約カードには「同じ予約を開き直した時はフォームを作り直さない」
  //   決まりがある（代車ピッカーから戻った時に書きかけを消さないため）ので、間に別の予約をはさむ。
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1300);
  await page.evaluate(() => { const e = [...document.querySelectorAll('[data-went]')].find(x => x.innerText.indexOf('記録なし太郎') >= 0); if (e) e.click(); });
  await page.waitForTimeout(900);
  await closeCard();
  t('週の表から 10/23 のカードを開ける', await openFromWeek('記録あり花子'));
  box = await entryBox();
  t('★受け付けは 10/15 14:23 のまま', !!box && /受け付け　10\/15 14:23/.test(box), box);
  t('★「日にち変更　10/21 → 10/23」と出る', !!box && /日にち変更　10\/21 → 10\/23/.test(box), box);
  await closeCard();

  console.log('\n■ ④-3 週の表のなぞり書きにも出る');
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1300);
  await page.locator('[data-wentnm]').filter({ hasText: '記録あり花子' }).first().hover();
  await page.waitForTimeout(500);
  const tip = await page.evaluate(() => { const e = document.querySelector('[data-wtip]'); return e ? e.innerText.replace(/\n/g, ' / ') : ''; });
  t('★なぞると受け付けと日にち変更の両方が出る', /受け付け　10\/15 14:23/.test(tip) && /日にち変更　10\/21 → 10\/23/.test(tip), tip);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
