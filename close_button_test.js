// PC画面の右上の ✕（閉じる）の検査（2026-10-07 ユーザー要望）
//   ①赤い ✕（B案）②確認は出さない ③顧客リストにも付ける ④スマホには付けない
//   ・いちばん右端にあるか（ログアウトより外側）
//   ・押すと全画面が解除されるか
//   ・閉じられなかった時に案内が出るか
//   実行: node close_button_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8312, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

// 右上の ✕ を探す（赤い丸みのあるボタン）
const findX = page => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕' && e.offsetParent !== null && e.title === '閉じる');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const st = getComputedStyle(b);
  return { right: Math.round(r.right), w: window.innerWidth, bg: st.backgroundColor, top: Math.round(r.top) };
});

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

  // ════ ① スケジュール（index_dev.html） ════
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(900);

  head('① スケジュール画面の右上の ✕');
  const x1 = await findX(page);
  t('✕ がある', !!x1, x1);
  t('赤い（B案）', !!x1 && /rgb\(220,\s*38,\s*38\)/.test(x1.bg), x1 && x1.bg);
  t('いちばん右端にある（画面の右から30px以内）', !!x1 && (x1.w - x1.right) <= 30, x1);
  t('ヘッダーの1行目にある（上から60px以内）', !!x1 && x1.top < 60, x1 && x1.top);
  t('ログアウトより外側にある', await page.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕' && e.title === '閉じる' && e.offsetParent !== null);
    const lo = [...document.querySelectorAll('button')].find(e => e.title === 'ログアウト' && e.offsetParent !== null);
    return !!x && !!lo && x.getBoundingClientRect().left > lo.getBoundingClientRect().right;
  }));

  head('② 押したときの動き');
  // 全画面に入れてから ✕ を押し、全画面が解除されるか／案内が出るか
  await page.evaluate(() => { window.__exited = 0; const d = document;
    d.exitFullscreen = () => { window.__exited++; return Promise.resolve(); };
    Object.defineProperty(d, 'fullscreenElement', { configurable: true, get: () => (window.__exited ? null : d.documentElement) });
    window.__closed = 0; window.close = () => { window.__closed++; };   // 実際には閉じない（検査なので）
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕' && e.title === '閉じる' && e.offsetParent !== null);
    if (b) b.click();
  });
  await page.waitForTimeout(200);
  const acted = await page.evaluate(() => ({ exited: window.__exited, closed: window.__closed }));
  t('確認は出さず、すぐ動く（ユーザー指示②）', acted.closed === 1, acted);
  t('まず全画面を解除する', acted.exited === 1, acted);
  await page.waitForTimeout(900);
  t('閉じられなければ案内が出る', await seeText(page, 'このタブは閉じられませんでした', 4000));
  t('案内にタブの ✕ と Ctrl+W の説明がある',
    await page.evaluate(() => /タブ/.test(document.body.innerText) && /Ctrl/.test(document.body.innerText)));
  await clickText(page, 'わかりました');
  await page.waitForTimeout(400);
  t('「わかりました」で案内が消える',
    await page.evaluate(() => document.body.innerText.indexOf('このタブは閉じられませんでした') < 0));
  t('スケジュール画面でエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  // ════ ③ 顧客リスト（customers.html） ════
  head('③ 顧客リストの右上の ✕');
  const p2 = await ctx.newPage();
  const errs2 = []; p2.on('pageerror', e => errs2.push(String(e)));
  await p2.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  await seeText(p2, '顧客リスト', 25000);
  await p2.waitForTimeout(900);
  const x2 = await findX(p2);
  t('✕ がある', !!x2, x2);
  t('赤い（B案）', !!x2 && /rgb\(220,\s*38,\s*38\)/.test(x2.bg), x2 && x2.bg);
  t('いちばん右端にある', !!x2 && (x2.w - x2.right) <= 30, x2);
  t('「全画面」ボタンより外側にある', await p2.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕' && e.title === '閉じる' && e.offsetParent !== null);
    const fsb = [...document.querySelectorAll('button')].find(e => /全画面|元に戻す/.test(e.innerText) && e.offsetParent !== null);
    return !!x && !!fsb && x.getBoundingClientRect().left > fsb.getBoundingClientRect().right;
  }));
  await p2.evaluate(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });
  await p2.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕' && e.title === '閉じる' && e.offsetParent !== null);
    if (b) b.click();
  });
  await p2.waitForTimeout(300);
  t('押すと閉じようとする', (await p2.evaluate(() => window.__closed)) === 1);
  await p2.waitForTimeout(900);
  t('閉じられなければ案内が出る', await seeText(p2, 'このタブは閉じられませんでした', 4000));
  t('顧客リストでエラーは出ていない', errs2.length === 0, errs2.slice(0, 3));

  // ════ ④ スマホには付けない ════
  head('④ スマホには付けない（ユーザー指示）');
  const SRC_M = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('mobile.html に閉じるボタンは無い', SRC_M.indexOf('hubCloseWindow') < 0);

  await browser.close();
  server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
