// スケジュール画面の日付を「西暦から」出す検査（2026-11-07 ユーザー決定・A案）
//   ・札が「2026年11月7日（土）」の形になっているか
//   ・いちばん長い日（12月31日）にしても札の幅が変わらないか
//     ＝前後の ‹ › ボタンの位置がずれない（minWidth 200 が効いているか）
//   実行: node date_year_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8453, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const DOW = ['日','月','火','水','木','金','土'];

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
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

// スケジュールの日付の札（こげ茶の札）を探して、文字と場所を読む
const readBadge = page => page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-datepick]')]
    .filter(e => e.offsetParent !== null)
    .find(e => /rgb\(124,\s*45,\s*18\)/.test(getComputedStyle(e).backgroundColor));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const nx = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.title === '翌週');
  return { text: el.innerText.replace(/\s+/g, ''), w: Math.round(r.width),
    left: Math.round(r.left), right: Math.round(r.right),
    next: nx ? Math.round(nx.getBoundingClientRect().left) : 0 };
});
// 札を押して、その日のカレンダーから日を選ぶ
const gotoDay = async (page, ymd) => {
  const mon = ymd.slice(0, 7);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-datepick]')].filter(e => e.offsetParent !== null)
      .find(e => /rgb\(124,\s*45,\s*18\)/.test(getComputedStyle(e).backgroundColor));
    el && el.click();
  });
  await page.waitForTimeout(250);
  for (let i = 0; i < 24; i++) {
    const now = await page.evaluate(() => { const m = document.querySelector('[data-mon]'); return m ? m.getAttribute('data-mon') : ''; });
    if (now === mon) break;
    await page.evaluate(x => { const b = document.querySelector('[data-mnav="' + x + '"]'); b && b.click(); }, (now && now < mon) ? 'next' : 'prev');
    await page.waitForTimeout(90);
  }
  const ok = await page.evaluate(d => { const b = document.querySelector('[data-day="' + d + '"]'); if (!b) return false; b.click(); return true; }, ymd);
  await page.waitForTimeout(400);
  return ok;
};

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], [STOR + 'cf-index']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));

  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await clickText(page, 'スケジュール');
  await page.waitForTimeout(900);

  head('① 日付の札が西暦から出る');
  const b0 = await readBadge(page);
  t('スケジュールの日付の札がある', !!b0, b0);
  t('「YYYY年M月D日（曜）」の形で出る', !!b0 && /^\d{4}年\d{1,2}月\d{1,2}日（[日月火水木金土]）$/.test(b0.text), b0 && b0.text);
  const today = new Date();
  const want = today.getFullYear() + '年' + (today.getMonth() + 1) + '月' + today.getDate() + '日（' + DOW[today.getDay()] + '）';
  t('本日の日付が出ている', !!b0 && b0.text === want, { 出ている: b0 && b0.text, 本日: want });

  head('② いちばん長い日にしても札の幅が変わらない');
  const y = today.getFullYear();
  t('12月31日へ移れた', await gotoDay(page, y + '-12-31'));
  const b1 = await readBadge(page);
  t('12月31日も西暦から出る', !!b1 && b1.text === y + '年12月31日（' + DOW[new Date(y, 11, 31).getDay()] + '）', b1 && b1.text);
  t('札の幅が本日と同じ（伸び縮みしない）', !!b0 && !!b1 && b0.w === b1.w, { 本日: b0 && b0.w, '12/31': b1 && b1.w });
  t('前後のボタンの位置もずれない', !!b0 && !!b1 && Math.abs(b0.next - b1.next) <= 1, { 本日: b0 && b0.next, '12/31': b1 && b1.next });

  t('翌年1月1日へ移れた', await gotoDay(page, (y + 1) + '-01-01'));
  const b2 = await readBadge(page);
  t('年が変わっても西暦から出る', !!b2 && b2.text === (y + 1) + '年1月1日（' + DOW[new Date(y + 1, 0, 1).getDay()] + '）', b2 && b2.text);
  t('1桁の月日でも札の幅は同じ', !!b0 && !!b2 && b0.w === b2.w, { 本日: b0 && b0.w, '1/1': b2 && b2.w });

  head('③ ファイルの中身の見張り');
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('札の出し方に西暦（getFullYear）が入っている', /fmt=\{\(v,dt\)=>`\$\{dt\.getFullYear\(\)\}年\$\{dt\.getMonth\(\)\+1\}月/.test(src));
  const mMin = src.match(/fontWeight:900,fontSize:15,padding:'4px 14px',minWidth:(\d+)/);
  t('最小の幅が 200px 以上（130 に戻していない）', !!mMin && Number(mMin[1]) >= 200, mMin && mMin[1]);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
