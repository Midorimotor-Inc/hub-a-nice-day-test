// スマホの予約カードの電話番号欄の検査（2026-10-06 ユーザー要望：車検・一般とも）
//   ・車検のカードに「電話」と「住所」が出る（PC版と同じ並び）
//   ・一般整備のカードには「電話」だけ出る（住所は車検だけ）
//   ・入れて保存すると、その予約に残る
//   ・入っていれば 📞 でそのままかけられる（記号は外して tel: にする）
//   ・iPhone が勝手に拡大しないよう16px以上
//   実行: node mobile_phone_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8302, STOR = 'hub-v8-dev-';
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
const now = new Date();
const TODAY = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 開いている予約カードの「電話」欄を調べる
const phoneInfo = page => page.evaluate(() => {
  const lab = [...document.querySelectorAll('label')].find(e => /^電話/.test(e.innerText.trim()) && e.offsetParent !== null);
  if (!lab) return null;
  const inp = lab.parentElement && lab.parentElement.querySelector('input');
  if (!inp) return null;
  return { type: inp.type, ph: inp.placeholder || '', fs: parseFloat(getComputedStyle(inp).fontSize) };
});
const typePhone = (page, v) => page.evaluate(val => {
  const lab = [...document.querySelectorAll('label')].find(e => /^電話/.test(e.innerText.trim()) && e.offsetParent !== null);
  const inp = lab && lab.parentElement && lab.parentElement.querySelector('input');
  if (!inp) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, val);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, v);
const hasLabel = (page, re) => page.evaluate(r =>
  [...document.querySelectorAll('label')].some(e => new RegExp(r).test(e.innerText.trim()) && e.offsetParent !== null), re);

(async () => {
  const seed = {
    [STOR + 'insp']: { [TODAY]: [{ name: '車検テスト', carType: 'アルト', no: '3503', course: 2, time: '09:00', store: 'honten', seq: 1, id: 1 }] },
    [STOR + 'honten-sched']: { [TODAY]: { '10:00': { name: '整備テスト', carType: 'ワゴンR', work: 'Q', content: 'オイル交換', store: 'honten', at: 2, id: 2 } } },
    [STOR + 'sanda-sched']: {},
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
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  // スケジュール画面へ
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);

  head('① 車検の予約カード');
  await page.getByText('車検テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('車検のカードが開く', await hasLabel(page, '^氏名'));
  const p1 = await phoneInfo(page);
  t('★電話の欄がある', !!p1, p1);
  t('電話のキーボードが出る（type=tel）', !!p1 && p1.type === 'tel', p1 && p1.type);
  t('例の表示が出る', !!p1 && /0000/.test(p1.ph), p1 && p1.ph);
  t('16px以上（iPhoneが勝手に拡大しない）', !!p1 && p1.fs >= 16, p1 && p1.fs);
  t('車検には住所の欄もある（PC版と同じ）', await hasLabel(page, '^住所'));

  t('電話番号を入れられる', await typePhone(page, '090-1234-5678'));
  await page.waitForTimeout(400);
  t('入っていると 📞 が出る', await page.evaluate(() =>
    [...document.querySelectorAll('a')].some(a => a.innerText.indexOf('📞') >= 0 && a.offsetParent !== null)));
  t('発信先から記号（ハイフン）が外れている', await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => x.innerText.indexOf('📞') >= 0 && x.offsetParent !== null);
    return !!a && a.getAttribute('href') === 'tel:09012345678';
  }), await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(x => x.innerText.indexOf('📞') >= 0); return a ? a.getAttribute('href') : null; }));

  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(3500);
  const savedInsp = await page.evaluate(([stor, dk]) => {
    const rows = (window.__fakeFb.get(stor + 'insp') || {})[dk] || [];
    const r = rows.find(x => x && String(x.name || '').indexOf('車検テスト') >= 0);
    return r ? (r.phone || '') : null;
  }, [STOR, TODAY]);
  t('★保存すると車検の予約に電話番号が残る', savedInsp === '090-1234-5678', savedInsp);

  head('② 一般整備の予約カード');
  await page.waitForTimeout(600);
  await page.getByText('整備テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('整備のカードが開く', await hasLabel(page, '^氏名'));
  const p2 = await phoneInfo(page);
  t('★電話の欄がある', !!p2, p2);
  t('16px以上', !!p2 && p2.fs >= 16, p2 && p2.fs);
  t('整備には住所の欄は出さない（PC版と同じ）', (await hasLabel(page, '^住所')) === false);
  t('電話番号を入れられる', await typePhone(page, '078-123-4567'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(3500);
  const savedSched = await page.evaluate(([stor, dk]) => {
    const d = (window.__fakeFb.get(stor + 'honten-sched') || {})[dk] || {};
    for (const sk in d) if (d[sk] && String(d[sk].name || '').indexOf('整備テスト') >= 0) return d[sk].phone || '';
    return null;
  }, [STOR, TODAY]);
  t('★保存すると整備の予約に電話番号が残る', savedSched === '078-123-4567', savedSched);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
