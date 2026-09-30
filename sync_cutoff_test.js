// 同期チェックの「見はじめ」の検査（2026-09-30 ユーザー指示）。
//   スケジュールを使い始めた日（SYNC_FROM_DK = 2026/9/22）より前に入庫した方は、
//   当時スケジュールに入れていないので、毎回「反映漏れ」として並んでしまっていた（本番で33件）。
//   ・線より前の人は反映漏れに出さない
//   ・線より後の人はこれまでどおり出る
//   ・顧客ファイルの中身（予約済の印・入庫日）は書き換えない＝集計はそのまま
//   実行: node sync_cutoff_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const DIR = __dirname, PORT = 8243, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 15000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
// 本予約・入庫日あり の顧客（entryDate は "YYYY-MM-DD"）
const cust = (i, name, entryDate) => ({ custId: 'c' + i, rowIdx: i, expiry: '2026-11-20', name, no: 1000 + i, carType: 'ハスラー',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate, tokuten: '-', course: 2, store: 'honten', staff: '', note: '', status: 'confirm', bookingTime: '09:00', linkedInspDate: '' });
const seed = {
  [STOR + 'cf-index']: [{ name: '202609', count: 3 }],
  [STOR + 'cf-202609-index']: { name: '202609', chunks: 1, total: 3 },
  [STOR + 'cf-202609-chunk-0']: [
    cust(1, '古井　昔男', '2026-09-12'),   // 線より前 → 出さない
    cust(2, '境　境界', '2026-09-21'),     // 線の1日前 → 出さない
    cust(3, '新井　最近', '2026-09-25'),   // 線より後 → これまでどおり出る
  ],
  [STOR + 'cust-updates']: [],
  [STOR + 'insp']: {},                      // スケジュールは空＝全員が「漏れ」の候補
  [STOR + 'custbk']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
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
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  t('顧客リストが開く', await seeText(page, '顧客リスト', 25000));
  await page.waitForTimeout(1500);

  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('スケジュール同期チェック')); if (b) { b.click(); return true; } return false; });
  t('「スケジュール同期チェック」を押せた', clicked);
  t('結果が出る', await seeText(page, '反映漏れ', 30000) || await seeText(page, '問題ありません', 30000));
  await page.waitForTimeout(800);
  // 背景の一覧にも名前は出るので、ダイアログの中だけを読む
  const dlg = await page.evaluate(() => {
    const h = [...document.querySelectorAll('div')].find(d => /件の反映漏れを検出|問題ありません/.test(d.innerText) && d.children.length === 0);
    if (!h) return '';
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && box.parentElement; i++) {
      const st = getComputedStyle(box);
      if (st.position === 'fixed') break;
      box = box.parentElement;
    }
    return box ? box.innerText : '';
  });
  t('ダイアログの中身を読めた', !!dlg && /反映漏れ|問題ありません/.test(dlg), dlg.slice(0, 200));

  t('線より前（9/12）は出ない', !/古井/.test(dlg), dlg.slice(0, 500));
  t('線の1日前（9/21）も出ない', !/境界/.test(dlg), dlg.slice(0, 500));
  t('線より後（9/25）はこれまでどおり出る', /新井/.test(dlg), dlg.slice(0, 500));
  t('漏れは1件と数える', /1件の反映漏れ/.test(dlg), (dlg.match(/\d+件の反映漏れ/) || [''])[0]);
  t('「いつから見ているか」が画面に出る', /2026\/9\/22 以降/.test(dlg), (dlg.match(/.{0,30}以降.{0,30}/) || [''])[0]);

  // 顧客ファイルは書き換えない（集計が動かない）
  const rows = await page.evaluate(k => window.__fakeFb.get(k + 'cf-202609-chunk-0'), STOR);
  t('顧客ファイルの「本予約」の印はそのまま', Array.isArray(rows) && rows.every(r => r.status === 'confirm'), rows && rows.map(r => r.status));
  t('顧客ファイルの入庫日もそのまま', Array.isArray(rows) && rows.map(r => r.entryDate).join(',') === '2026-09-12,2026-09-21,2026-09-25', rows && rows.map(r => r.entryDate));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-sync-cutoff.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
