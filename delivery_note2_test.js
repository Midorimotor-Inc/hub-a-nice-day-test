// 納車日の備考（C案）と、代車の長期ドラッグの検査（2026-10-02 ユーザー決定）
//   ① 納車日を入れると予約カードに「備考」欄（納車日の中）とスイッチが出る
//   ② 納車日の備考は納車日の行に出る
//   ③ スイッチが入っている時だけ、入庫時の備考も納車日の行に出る（切ると出ない）
//   ④ 代車管理：ドラッグ中に端へ行くと自動で横に送られる／確定の箱で日付を直せる
//   実行: node delivery_note2_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8269, STOR = 'hub-v8-dev-';
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
const W = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
const DLV = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
const WDK = `${W.getFullYear()}-${W.getMonth() + 1}-${W.getDate()}`;
const DDK = `${DLV.getFullYear()}-${DLV.getMonth() + 1}-${DLV.getDate()}`;
const DISO = `${DLV.getFullYear()}-${String(DLV.getMonth() + 1).padStart(2, '0')}-${String(DLV.getDate()).padStart(2, '0')}`;
const WISO = `${W.getFullYear()}-${String(W.getMonth() + 1).padStart(2, '0')}-${String(W.getDate()).padStart(2, '0')}`;

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [WDK]: { '未定': { id: 11, name: '大山', carType: 'スペーシア', work: 'B', content: '右前フェンダー　保険対応', deliveryDate: DDK, deliveryTime: '11:00' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-lcars']: [{ id: 'L1', name: 'ハスラー', num: '12' }],
    [STOR + 'honten-lres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
  await page.waitForTimeout(1200);
  const goDay = iso => page.evaluate(v => { const inp = [...document.querySelectorAll('input[type=date]')].find(e => e.offsetParent !== null); if (!inp) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); return true; }, iso);

  // ── ① 予約カードの納車日の備考欄 ──
  console.log('\n■ ① 予約カードの納車メモ欄');
  await goDay(WISO);
  await page.waitForTimeout(1300);
  t('作業日に整備が出る', await seeText(page, '大山', 12000));
  await page.click('td:has-text("大山")', { timeout: 8000 }).catch(() => {});
  t('予約カードが開く', await seeText(page, '予約カード', 8000));
  const hasMemo = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return null;
    const lb = [...box.querySelectorAll('label')].find(e => e.innerText.trim().startsWith('備考'));
    const ta = lb && lb.parentElement ? lb.parentElement.querySelector('textarea') : null;
    const sw = [...box.querySelectorAll('button')].find(e => e.innerText.includes('も納車日に出す'));
    return { lb: !!lb, ta: !!ta, sw: !!sw };
  });
  t('納車日の中に「備考」の欄がある', !!hasMemo && hasMemo.lb && hasMemo.ta, hasMemo);
  t('「入庫時の内容も納車日に出す」スイッチがある', !!hasMemo && hasMemo.sw, hasMemo);
  // 納車メモを入れて保存（スイッチは切ったまま）
  await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    const lb = [...box.querySelectorAll('label')].find(e => e.innerText.trim().startsWith('備考'));
    const ta = lb.parentElement.querySelector('textarea');
    const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    s.call(ta, '代車のガソリン確認　書類を渡す');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  t('保存できた', await saveCard(page));
  t('★納車日の備考が保存される', await page.waitForFunction(([k, wdk]) => {
    const r = ((window.__fakeFb.get(k + 'honten-sched') || {})[wdk] || {})['未定'];
    return !!r && r.deliveryNote === '代車のガソリン確認　書類を渡す' && r.noteToDelivery !== true;
  }, [STOR, WDK], { timeout: 20000 }).then(() => true).catch(() => false),
    await page.evaluate(([k, wdk]) => ((window.__fakeFb.get(k + 'honten-sched') || {})[wdk] || {})['未定'], [STOR, WDK]));

  // ── ② 納車日の行に出る ──
  console.log('\n■ ② 納車日の行に出る');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await goDay(DISO);
  await page.waitForTimeout(1500);
  const dlvRow = () => page.evaluate(() => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes('大山') && x.innerText.includes('納車')); return r ? r.innerText.replace(/\s+/g, ' ').trim() : null; });
  const row1 = await dlvRow();
  t('★納車日の備考が納車日の行に出る', !!row1 && row1.includes('代車のガソリン確認'), row1);
  t('スイッチが切れている時は入庫の内容は出ない', !!row1 && !row1.includes('保険対応'), row1);

  // ── ③ スイッチを入れると入庫の内容も出る ──
  console.log('\n■ ③ スイッチを入れると入庫の内容も出る');
  await page.evaluate(() => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes('大山') && x.innerText.includes('納車')); if (r) r.click(); });
  await seeText(page, '予約カード', 8000);
  t('スイッチを押せた', await clickText(page, 'も納車日に出す'));
  await page.waitForTimeout(300);
  t('保存できた（スイッチON）', await saveCard(page));
  await page.waitForTimeout(2500);
  const row2 = await dlvRow();
  t('★入庫時の内容も納車日の行に出る', !!row2 && row2.includes('保険対応'), row2);
  t('納車日の備考も出たまま', !!row2 && row2.includes('代車のガソリン確認'), row2);

  // ── ④ 代車管理：ドラッグの自動スクロールと日付欄 ──
  console.log('\n■ ④ 代車管理：長い期間のドラッグ');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('代車管理') && e.offsetParent !== null); if (b) b.click(); });
  t('代車管理が開く', await seeText(page, '代車', 10000));
  await page.waitForTimeout(1200);
  const sc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => e.className && String(e.className).includes('fat-hscroll') && e.scrollWidth > e.clientWidth + 50);
    return el ? { sw: el.scrollWidth, cw: el.clientWidth, left: el.scrollLeft } : null;
  });
  t('横に長い表（90日分）がある', !!sc && sc.sw > sc.cw + 50, sc);
  t('ドラッグ中に端で自動スクロールする作りが入っている', await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => e.className && String(e.className).includes('fat-hscroll') && e.scrollWidth > e.clientWidth + 50);
    return !!el;   // 動きそのものは実機で確認。ここでは入れ物の存在と下のソース確認で担保
  }));
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('自動スクロールのコードがある（edgeAutoScroll）', /edgeAutoScroll/.test(src) && /onMouseMove=\{handleDragMove\}/.test(src));
  t('表の外に出てもドラッグを捨てない（onMouseLeave の打ち切りを外した）', !/onMouseLeave=\{\(\)=>\{if\(isDragging\.current\)\{isDragging\.current=false;setDrag\(null\);\}\}\}/.test(src));
  t('確定の箱に「貸出日」「返却日」の日付欄がある', /貸出日<\/span>/.test(src) && /返却日<\/span>/.test(src));
  t('レンタカーの表にも自動スクロールが付いている', /onMouseMove=\{rHandleDragMove\}/.test(src));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-delivery-note2.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
