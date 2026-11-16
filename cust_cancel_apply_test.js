// 2026-11-16 ★スケジュールでキャンセル（赤帯）にした人が、顧客リストでも赤い行になるかの検査
//   【何が起きたか】ユーザー報告「スケジュールでキャンセルしたのに、顧客リストは青い帯のまま」。
//   スケジュール側は cust-updates に status:'cancel' を正しく積んでいる（cx_band_test で確認済み）。
//   ＝怪しいのは【顧客リストがその知らせを受けて行に当てる所】。ここだけを狙って見る。
//   実行: node cust_cancel_apply_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8511, STOR = 'hub-v8-dev-';
const RED = 'rgb(254, 202, 202)', BLUE = 'rgb(191, 219, 254)';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 30000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

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

// 元の日は【本日】（保管箱に落ちない日）
const N = new Date();
const DK = N.getFullYear() + '-' + (N.getMonth() + 1) + '-' + N.getDate();
const DKPAD = N.getFullYear() + '-' + String(N.getMonth() + 1).padStart(2, '0') + '-' + String(N.getDate()).padStart(2, '0');

const cust = (i, o) => Object.assign({
  custId: 'F__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-' + (10 + i),
  name: '客' + i, no: 1000 + i, carType: 'ワゴンＲ',
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-11-01', dm1Book: '', dm2Date: '2026-11-08', dm2Book: '',
  dm1Sent: false, dm2Sent: false,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '', isAdmin: true }, o || {});
// 客1＝スケジュールで予約が入り【青（本予約）】になっている人。これをキャンセルする。
const CUSTS = [cust(1, { status: 'confirm', entryDate: DKPAD, linkedInspDate: DKPAD, course: 2 }), cust(2), cust(3)];
// スケジュール側は【すでにキャンセルの帯】になっている状態（＝保存は済んでいる）
const BAND = { name: '客1', carType: 'ワゴンＲ', no: 1001, course: 2, time: '09:00', store: 'honten',
  seq: 1, custId: 'F__1__客1', bookingStatus: 'cancelled', approved: false, pendingApproval: false,
  cxAt: DK, cxBy: '江川京志', cxFrom: DK, cxTo: '' };
// その知らせが cust-updates に積まれている状態
const NOTICE = { custId: 'F__1__客1', name: '客1', no: 1001, status: 'cancel', entryDate: '', linkedInspDate: '', ts: Date.now() };

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [BAND] }, [STOR + 'insp-arch']: {}, [STOR + 'inspLimits']: {},
    [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
    [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {}, [STOR + 'custbk']: {},
    [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
    [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
    [STOR + 'cf-202701-chunk-0']: CUSTS,
    [STOR + 'cust-updates']: [NOTICE],
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

  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  head('① 顧客リストが開き、客1 は青い行（本予約）で出ている');
  t('リストが開く', await seeText(page, '客1', 30000));
  await page.waitForTimeout(2500);
  const rowOf = nm => page.evaluate(x => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => (r.innerText || '').indexOf(x) >= 0);
    if (!tr) return null;
    return { cls: tr.className || '', bg: getComputedStyle(tr).backgroundColor, txt: (tr.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
  }, nm);
  const r0 = await rowOf('客1');
  t('客1 の行がある', !!r0, r0);
  console.log('   （開いた直後の行: ' + JSON.stringify(r0) + '）');

  head('② ★キャンセルの知らせが行に当たり、赤い行になる');
  // 知らせの反映は読み返し検証つきで数十秒かかることがあるので、十分に待つ
  let red = false, waited = 0;
  while (waited < 70000) {
    const r = await rowOf('客1');
    if (r && (r.cls.indexOf('row-cancel') >= 0 || r.bg === RED)) { red = true; break; }
    await page.waitForTimeout(2500); waited += 2500;
  }
  const r1 = await rowOf('客1');
  t('★行が赤（キャンセル）になった', red, { 待った秒: waited / 1000, 行: r1 });
  t('★青（本予約）のままではない', !!(r1 && r1.bg !== BLUE), r1);

  head('③ ★サーバーの顧客ファイルにも cancel が書かれている');
  const srv = await page.evaluate(k => {
    const rows = window.__fakeFb.get(k + 'cf-202701-chunk-0') || [];
    const c = rows.find(x => x && x.name === '客1');
    return c ? { status: c.status, entryDate: c.entryDate, linkedInspDate: c.linkedInspDate } : null;
  }, STOR);
  t('status が cancel', !!(srv && srv.status === 'cancel'), srv);
  t('入庫日が空になった', !!(srv && !srv.entryDate), srv);
  t('紐づけた車検日も空になった', !!(srv && !srv.linkedInspDate), srv);

  head('④ 知らせはキューから片づけられる');
  const q = await page.evaluate(k => window.__fakeFb.get(k + 'cust-updates'), STOR);
  t('cust-updates が空になった', Array.isArray(q) && q.length === 0, q);

  head('⑤ 巻き添えがない');
  const r2 = await rowOf('客2');
  t('客2 は何も変わっていない', !!(r2 && r2.cls.indexOf('row-cancel') < 0), r2);

  head('⑥ 画面のエラー');
  t('実行時エラーなし', errs.length === 0, errs.slice(0, 3));

  console.log(NL + (fail === 0 ? '✅ PASS 成功 ' + pass + ' / 失敗 0' : '❌ 成功 ' + pass + ' / 失敗 ' + fail));
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
