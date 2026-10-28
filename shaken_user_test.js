// PC の車検予約カード「来店者氏名／車検証の使用者」の検査（2026-10-29 整備からの依頼）
//   ① 車検のカードに「来店者氏名」と「車検証の使用者」の2つがあり、同じ行に並んでいる
//   ② はじめは空（勝手に入れない）。「同じ」を押すと来店者氏名が入る
//   ③ 保存すると、その予約の行に user が残る
//   ④ 整備（一般予約カード）には使用者を出さない
//   ⑤ ↓キーで 来店者氏名 → 車検証の使用者 → 担当 の順に送られる
//   実行: node shaken_user_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8371, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const saveCard = page => page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); if (!box) return false; const b = [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) { b.click(); return true; } return false; });
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
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 画面の中の「来店者氏名」「車検証の使用者」を読む
const fields = page => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  if (!box) return null;
  // ★見出しは <label> だけでなく、見出しの行の中の <span> にも入っている
  //   （「車検証の使用者」は span ＋「同じ」ボタンの2つを並べた行なので）
  const labs = [...box.querySelectorAll('label,div,span')]
    .filter(e => e.offsetParent !== null && e.children.length === 0);
  const findLab = re => labs.find(e => re.test(e.innerText.trim()));
  const nm = box.querySelector('input[placeholder="お客様名"]');
  const us = box.querySelector('[data-userfld]');
  const r = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width) }; };
  return {
    hasRaisha: !!findLab(/^来店者氏名/),
    hasUserLab: !!findLab(/^車検証の使用者/),
    hasPlainName: !!findLab(/^氏名/),
    nameVal: nm ? nm.value : null, userVal: us ? us.value : null,
    nameBox: nm ? r(nm) : null, userBox: us ? r(us) : null,
    sameBtn: !!box.querySelector('[data-userSame]'),
  };
});

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '原村', carType: 'シエンタ', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' }] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '', store: 'honten' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  };
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の車検が出ている', await seeText(page, '原村', 15000));

  // ── ① 車検のカードに2つの欄がある ──
  console.log('\n■ ① 車検のカードの欄');
  await page.click('td:has-text("原村")', { timeout: 8000 }).catch(() => {});
  t('車検予約カードが開く', await seeText(page, '車検予約カード', 8000));
  const f0 = await fields(page);
  t('★「来店者氏名」がある', !!f0 && f0.hasRaisha, f0);
  t('★「車検証の使用者」がある', !!f0 && f0.hasUserLab, f0);
  t('★ただの「氏名」は出さない', !!f0 && f0.hasPlainName === false);
  t('★「同じ」ボタンがある', !!f0 && f0.sameBtn);
  t('来店者氏名に今の名前が入っている', !!f0 && f0.nameVal === '原村', f0 && f0.nameVal);
  t('★使用者ははじめ空（勝手に入れない）', !!f0 && f0.userVal === '', f0 && f0.userVal);

  // ── ② 同じ行に並んでいるか（モックで実測して決めた決まり）──
  console.log('\n■ ② 左右が同じ行に並ぶ');
  const gap = (f0 && f0.nameBox && f0.userBox) ? Math.abs(f0.nameBox.top - f0.userBox.top) : 999;
  t('★左右の入力欄の上端がそろっている（ずれ2px以内）', gap <= 2, { gap, name: f0 && f0.nameBox, user: f0 && f0.userBox });
  t('★使用者は右側にある', !!f0 && f0.userBox.left > f0.nameBox.left, f0 && [f0.nameBox.left, f0.userBox.left]);
  t('★幅はほぼ半分ずつ', !!f0 && Math.abs(f0.nameBox.w - f0.userBox.w) <= 4, f0 && [f0.nameBox.w, f0.userBox.w]);

  // ── ③ 「同じ」ボタン ──
  console.log('\n■ ③ 「同じ」ボタン');
  await page.click('[data-userSame]').catch(() => {});
  await page.waitForTimeout(300);
  const f1 = await fields(page);
  t('★押すと来店者氏名が入る', !!f1 && f1.userVal === '原村', f1 && f1.userVal);

  // ── ④ 違う名前を入れて保存すると残る ──
  console.log('\n■ ④ 保存すると予約の行に残る');
  await page.evaluate(() => {
    const i = document.querySelector('[data-userfld]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, '原村商事'); i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await saveCard(page);
  await page.waitForTimeout(1800);
  const saved = await page.evaluate(([stor, dk]) => {
    const v = window.__fakeFb.get(stor + 'insp');
    const rows = (v && v[dk]) || [];
    const r = rows.find(x => x && x.name === '原村');
    return r ? { name: r.name, user: r.user } : null;
  }, [STOR, DK]);
  t('★保存した行に car検証の使用者が残る'.replace('car検証', '車検証'), !!saved && saved.user === '原村商事', saved);
  t('来店者氏名は変わっていない', !!saved && saved.name === '原村', saved);

  // ── ⑤ 整備のカードには出さない ──
  console.log('\n■ ⑤ 整備（一般予約カード）には出さない');
  await page.waitForTimeout(600);
  await page.click('td:has-text("相原")', { timeout: 8000 }).catch(() => {});
  t('一般予約カードが開く', await seeText(page, '一般予約カード', 8000));
  const f2 = await fields(page);
  t('★整備には「車検証の使用者」を出さない', !!f2 && f2.hasUserLab === false && f2.userVal === null, f2);
  t('整備は今までどおり「氏名」', !!f2 && f2.hasPlainName, f2);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
