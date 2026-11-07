// スマホで車検の予約を消した時に、顧客リストへ知らせるかの検査（2026-11-07）
//   ★本番で起きたこと：スマホで予約を消しても顧客リストが【本予約（青）のまま】残り、
//     同期チェックに「スケジュールに予約がありません」として出ていた（清原様・赤石様）。
//     PC（index）の削除は前から syncCustStatus で知らせていたが、スマホには無かった。
//   ・cust-updates に status='cancel'（入庫日を空に）が積まれる
//   ・その日のカレンダー控え（custbk）も外れる
//   実行: node mobile_del_sync_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const DIR = __dirname, PORT = 8451, STOR = 'hub-v8-dev-', NL = String.fromCharCode(10);
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
const now = new Date();
const TODAY = (now.getFullYear()) + '-' + (now.getMonth() + 1) + '-' + now.getDate();
(async () => {
  const seed = {
    [STOR + 'insp']: { [TODAY]: [
      { name: '清原　千咲', carType: 'ハスラー', no: '6258', course: 2, time: '09:00', store: 'honten', custId: 'c1', bookingStatus: 'confirmed', seq: 1, id: 1 },
      { name: '残る　花子', carType: 'アルト', no: '1234', course: 2, time: '10:00', store: 'honten', custId: 'c2', bookingStatus: 'confirmed', seq: 2, id: 2 },
    ] },
    [STOR + 'custbk']: {
      ['清原　千咲::' + TODAY]: { dk: TODAY, status: 'confirmed', formData: { custId: 'c1', name: '清原　千咲', no: '6258', carType: 'ハスラー', course: 2, store: 'honten', time: '09:00' } },
      ['残る　花子::' + TODAY]: { dk: TODAY, status: 'confirmed', formData: { custId: 'c2', name: '残る　花子', no: '1234', carType: 'アルト', course: 2, store: 'honten', time: '10:00' } },
    },
    [STOR + 'cust-updates']: [],
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
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
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);
  t('スマホのスケジュールに車検が出る', await seeText(page, '清原', 8000));

  await page.getByText('清原', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('予約カードが開く', await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /削除/.test(e.innerText) && e.offsetParent !== null)));
  const del = await clickText(page, '削除');
  t('🗑 削除を押せた', del);
  await page.waitForTimeout(6000);

  const insp = await page.evaluate(k => window.__fakeFb.get(k + 'insp'), STOR);
  const names = ((insp && insp[TODAY]) || []).filter(r => r && r.name).map(r => r.name);
  t('消した予約はスケジュールから消える', !names.some(n => /清原/.test(n)), names);
  t('ほかの人の予約は残る', names.some(n => /残る/.test(n)), names);

  const q = await page.evaluate(k => window.__fakeFb.get(k + 'cust-updates'), STOR);
  const u = (Array.isArray(q) ? q : []).find(x => x && (x.custId === 'c1' || /清原/.test(String(x.name || ''))));
  t('★顧客リストへの知らせ（cust-updates）が積まれる', !!u, q);
  t('★status が cancel', !!u && u.status === 'cancel', u);
  t('★入庫日を空にする', !!u && u.entryDate === '' && u.linkedInspDate === '', u);
  t('氏名とナンバーも入っている（custIdが無い行でも照合できるように）', !!u && /清原/.test(String(u.name || '')) && String(u.no) === '6258', u);
  t('ほかの人の知らせは作らない', (Array.isArray(q) ? q : []).filter(x => x && /残る/.test(String(x.name || ''))).length === 0, q);

  const bk = await page.evaluate(k => window.__fakeFb.get(k + 'custbk'), STOR);
  const keys = Object.keys(bk || {});
  t('★その日のカレンダー控え（custbk）も外れる', !keys.some(k => /清原/.test(k)), keys);
  t('ほかの人の控えは残る', keys.some(k => /残る/.test(k)), keys);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-del-sync.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
