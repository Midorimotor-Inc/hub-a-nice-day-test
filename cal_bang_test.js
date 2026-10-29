// 車検カレンダーの「7台目の！」の検査（2026-10-29 ユーザー指示・A案）
//   ① 6台までの日には「！」を出さない（いままでと同じ見た目）
//   ② 7台目以降に未承認があれば 黄色の！
//   ③ 7台目以降がすべて承認済みなら 緑の！
//   ④ なぞると、隠れている分が氏名・コース・承認の状態つきで出る
//   ⑤ 6コマの見た目は変えていない（1日あたり6つのまま）
//   実行: node cal_bang_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8373, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
};
const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
// 同じ月の中に 6台の日／7台(未承認あり)の日／8台(すべて承認済み)の日 を作る
const dk = d => `${Y}-${M + 1}-${d}`;
const row = (n, course, extra) => Object.assign({ name: n, carType: 'アルト', no: '3503', course, store: 'honten', time: '09:00', bookingStatus: 'confirmed' }, extra || {});
const six = Array.from({ length: 6 }, (_, i) => row('六' + (i + 1), 2));
const seven = six.concat([row('七番', 3, { pendingApproval: true })]);
const eight = six.concat([row('八番A', 3, { approved: true }), row('八番B', 3, { approved: true })]);

(async () => {
  const seed = {
    [STOR + 'insp']: { [dk(6)]: six, [dk(8)]: seven, [dk(10)]: eight },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await clickText(page, 'カレンダー');
  await page.waitForTimeout(1500);

  // 日のマスを読む（日付の数字 → そのマスの ！ の種類）
  const cells = await page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('div')].forEach(d => {
      const b = d.querySelector(':scope > div > [data-calbang]');
      if (!b) return;
      const num = d.querySelector(':scope > div > span');
      if (!num) return;
      const n = Number(num.innerText.trim());
      if (!n) return;
      out[n] = { kind: b.getAttribute('data-calbang'), title: b.getAttribute('title') || '', bg: getComputedStyle(b).backgroundColor };
    });
    return out;
  });
  const slots = await page.evaluate(() => {
    const g = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).gridTemplateColumns.split(' ').length === 3 && d.children.length >= 6);
    return g.length ? g[0].children.length : 0;
  });

  console.log('\n■ ① 6台までの日には出さない');
  t('6台の日（' + 6 + '日）に「！」が無い', !cells[6], cells[6]);

  console.log('\n■ ② 7台目に未承認があれば黄色');
  t('7台の日（8日）に「！」がある', !!cells[8], Object.keys(cells));
  t('★黄色（未承認）になっている', !!cells[8] && cells[8].kind === 'wait', cells[8] && cells[8].kind);
  t('★色が黄色', !!cells[8] && /250, 204, 21/.test(cells[8].bg), cells[8] && cells[8].bg);

  console.log('\n■ ③ すべて承認済みなら緑');
  t('8台の日（10日）に「！」がある', !!cells[10], cells[10]);
  t('★緑（承認済み）になっている', !!cells[10] && cells[10].kind === 'ok', cells[10] && cells[10].kind);
  t('★色が緑', !!cells[10] && /34, 197, 94/.test(cells[10].bg), cells[10] && cells[10].bg);

  console.log('\n■ ④ なぞると中身が出る');
  const tp = (cells[8] && cells[8].title) || '';
  t('★台数が出る', /7台/.test(tp), tp);
  t('★隠れている件数が出る', /出ていない分が 1 件/.test(tp), tp);
  t('★7台目の氏名が出る', /7台目/.test(tp) && /七番/.test(tp), tp);
  t('★承認の状態が出る', /未承認/.test(tp), tp);
  const tp2 = (cells[10] && cells[10].title) || '';
  t('★承認済みの日は「承認済み」と出る', /承認済み/.test(tp2) && !/未承認/.test(tp2), tp2);

  console.log('\n■ ⑤ 6コマの見た目は変えていない');
  t('★1日あたりのコマは6つのまま', slots === 6, slots);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
