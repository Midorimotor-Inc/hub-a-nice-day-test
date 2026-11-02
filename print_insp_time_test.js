// 印刷（🖨 印刷）に車検の入庫時間を出す検査（2026-11-02 ユーザー要望）
//   「今日のスケジュールを印刷するときに、車検の入庫時間が印刷されるように」
//   それまで印刷の車検の表は No／氏名／車種／コース／代車／特典／備考 の7列で、
//   入庫時間の列が無かった（下のタイムスケジュールの表には時間の列がある）。
//   ここで見ること：
//     ① 車検の表に「入庫」の見出しがある（No のすぐ右）
//     ② 09:00 のような時刻がその行に出る
//     ③ 未定・午前・午後（時刻を持たない枠）も短い言葉で出る
//     ④ 入庫時間が空の予約は「-」
//     ⑤ 予約が無い日の「予約なし」が列の数（8）ぶん伸びている
//   実行: node print_insp_time_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8423, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
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
  // window.open をにせ物にして、印刷に出す HTML をそのまま受け取る
  window.__printed = '';
  window.open = function () {
    return { document: { write: h => { window.__printed += h; }, close: () => {} }, print: () => {}, focus: () => {}, close: () => {} };
  };
};
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

// 印刷の HTML を受け取り、車検の表だけを行ごとの文字にして返す
const printRows = async (page) => {
  await page.evaluate(() => { window.__printed = ''; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('印刷') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const d = document.implementation.createHTMLDocument('p');
    d.documentElement.innerHTML = String(window.__printed || '').replace(/<!DOCTYPE[^>]*>/i, '');
    const tb = d.querySelector('table.insp-table');
    if (!tb) return null;
    const cell = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const colTd = tb.querySelector('tbody td[colspan]');
    return {
      head: [...tb.querySelectorAll('thead th')].map(cell),
      rows: [...tb.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell)),
      colspan: colTd ? colTd.getAttribute('colspan') : null,
      timeCells: [...tb.querySelectorAll('tbody td.insp-time')].map(cell),
    };
  });
};

(async () => {
  const mk = (name, time) => ({ name: name, time: time, carType: 'ワゴンR', course: 2, store: 'honten', no: '1234', bookingStatus: 'confirmed' });
  const seed = {};
  seed[STOR + 'insp'] = {};
  seed[STOR + 'insp'][DK] = [
    mk('印刷太郎', '09:00'),
    mk('印刷次郎', '10:30'),
    mk('印刷三郎', '未定'),
    mk('印刷四郎', '午前'),
    mk('印刷五郎', ''),
  ];
  seed[STOR + 'honten-sched'] = {};
  seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-memo'] = {};
  seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-dayoff'] = {};
  seed[STOR + 'honten-pleave'] = {};

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 10000));

  const r = await printRows(page);
  t('印刷の HTML を受け取れた', !!r, r);
  if (!r) { console.log(String.fromCharCode(10) + '❌ FAIL  成功 ' + pass + ' / 失敗 ' + fail); await browser.close(); server.close(); process.exit(1); }

  head('① 車検の表に「入庫」の列がある');
  t('★見出しに「入庫」がある', r.head.indexOf('入庫') >= 0, r.head);
  t('★「入庫」は No のすぐ右（2列目）', r.head[1] === '入庫', r.head);
  t('氏名・車種・コース・代車・特典・備考もそのまま', ['氏名', '車種', 'コース', '代車', '特典', '備考'].every(x => r.head.indexOf(x) >= 0), r.head);
  t('列は8つ', r.head.length === 8, r.head);

  head('② 時刻がその行に出る');
  const byName = n => r.rows.find(c => c.some(x => x.indexOf(n) >= 0));
  t('★09:00 の人の行に 09:00 が出る', (byName('印刷太郎') || [])[1] === '09:00', byName('印刷太郎'));
  t('★10:30 の人の行に 10:30 が出る', (byName('印刷次郎') || [])[1] === '10:30', byName('印刷次郎'));
  t('どの行も8つの欄がある', r.rows.length === 5 && r.rows.every(c => c.length === 8), r.rows.map(c => c.length));

  head('③ 時刻を持たない枠も短い言葉で出る');
  t('★「未定」が出る（「入庫時間未定」と長くしない）', (byName('印刷三郎') || [])[1] === '未定', byName('印刷三郎'));
  t('★「午前」が出る', (byName('印刷四郎') || [])[1] === '午前', byName('印刷四郎'));

  head('④ 入庫時間が空の予約は「-」');
  t('★空なら -', (byName('印刷五郎') || [])[1] === '-', byName('印刷五郎'));

  head('⑤ 時間の欄に印（class="insp-time"）が付いている');
  t('★5行とも印が付いている', r.timeCells.length === 5, r.timeCells);

  head('⑥ 予約が無い日の「予約なし」は8列ぶん');
  await page.evaluate(k => window.__fakeFb.set(k, {}), STOR + 'insp');
  await page.waitForTimeout(1800);
  const r2 = await printRows(page);
  t('★colspan が 8', !!r2 && r2.colspan === '8', r2 && r2.colspan);
  t('「予約なし」と出る', !!r2 && JSON.stringify(r2.rows).indexOf('予約なし') >= 0, r2 && r2.rows);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
