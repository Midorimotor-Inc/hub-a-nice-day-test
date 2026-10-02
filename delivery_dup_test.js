// 納車の派生行から別の日の予約を開いた時の検査（2026-10-02 ユーザー報告のバグ）
//   症状：9/6入庫・納車10/4 の整備を、10/4 の「納車」の行から開くと
//         カード上部が 10/4 と出て（実際は 9/6 の予約）、日付を変えると
//         元の 9/6 の予約が消えずに二重に残った。
//   ここで見ること：
//     ① カードの日付が「その予約が乗っている日」(9/6) で出る／「◯/◯ の予約を編集中」と添える
//     ② 納車時間を入れて保存しても、予約は1件のまま・納車行も1本だけ
//     ③ そのカードから日付を変えても二重にならない（元の日から消えて移る）
//     ④ 車検でも同じ（納車の行から開いた時に日付が正しく、二重にならない）
//   実行: node delivery_dup_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8259, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const cardTop = page => page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); if (!box) return null; const h = box.firstElementChild; return h ? h.innerText.replace(/\s+/g, ' ').trim() : null; });
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
// 作業日＝4日前、納車日＝2日後（月をまたいでも壊れないよう今日からの相対で作る）
const now = new Date();
const W = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);
const DLV = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
const WDK = `${W.getFullYear()}-${W.getMonth() + 1}-${W.getDate()}`;
const DDK = `${DLV.getFullYear()}-${DLV.getMonth() + 1}-${DLV.getDate()}`;
const DISO = `${DLV.getFullYear()}-${String(DLV.getMonth() + 1).padStart(2, '0')}-${String(DLV.getDate()).padStart(2, '0')}`;
const WMD = `${W.getMonth() + 1}月${W.getDate()}日`;
const DMD = `${DLV.getMonth() + 1}月${DLV.getDate()}日`;

(async () => {
  const seed = {
    // 車検：作業日に1件（納車日は納車日、時間は未定）
    [STOR + 'insp']: { [WDK]: [{ name: '車検の大山', carType: 'スペーシア', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', deliveryDate: DDK, deliveryTime: '', note: '' }] },
    // 整備：作業日の「未定」枠に1件（納車日は納車日、時間は未定）
    [STOR + 'honten-sched']: { [WDK]: { '未定': { id: 11, name: '整備の大山', carType: 'スペーシア', work: 'B', content: '', deliveryDate: DDK, deliveryTime: '' } } },
    [STOR + 'sanda-sched']: {},
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
  await page.waitForTimeout(1200);
  // 納車日へ移動
  const goDay = async iso => page.evaluate(v => {
    const inp = [...document.querySelectorAll('input[type=date]')].find(e => e.offsetParent !== null);
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, iso);
  t('納車日へ移動できた', await goDay(DISO));
  await page.waitForTimeout(1500);
  const dlvRows = () => page.evaluate(n => [...document.querySelectorAll('tr')].filter(r => r.innerText.includes(n)).length, '整備の大山');
  t('納車の行が1本だけ出る（整備）', (await dlvRows()) === 1, { n: await dlvRows() });

  // ── ① カードの日付が「その予約の日」で出る ──
  console.log('\n■ ① 納車の行から開いた時のカードの日付');
  await page.evaluate(n => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes(n)); if (r) r.click(); }, '整備の大山');
  t('カードが開く', await seeText(page, '予約カード', 8000));
  const top1 = await cardTop(page);
  t('★作業日（' + WMD + '）が出る（見ている日ではない）', !!top1 && top1.includes(WMD.replace('月', '/').replace('日', '')), top1);
  t('★「◯/◯ の予約を編集中」と添えてある', !!top1 && top1.includes('の予約を編集中'), top1);

  // ── ② 納車時間を入れて保存しても二重にならない ──
  console.log('\n■ ② 納車時間を入れて保存');
  // 納車時間は専用のピッカー：表示をクリックして開き、一覧を mousedown で選ぶ
  const openTm = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const lb = [...box.querySelectorAll('label')].find(e => e.innerText.trim() === '納車時間');
    if (!lb || !lb.parentElement) return false;
    const sp = [...lb.parentElement.querySelectorAll('div')].find(e => e.style && e.style.cursor === 'pointer');
    if (!sp) return false;
    sp.click(); return true;
  });
  await page.waitForTimeout(500);
  const setDlvTime = openTm && await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const it = [...box.querySelectorAll('div')].find(e => e.innerText.trim() === '11:00' && e.style && e.style.cursor === 'pointer');
    if (!it) return false;
    it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(400);
  t('納車時間の欄に 11:00 を入れた', setDlvTime, await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); return b ? b.innerText.replace(/\s+/g, ' ').slice(0, 400) : null; }));
  t('保存できた', await saveCard(page));
  await page.waitForTimeout(2500);
  t('★整備は1件のまま（二重にならない）', await page.evaluate(([k, wdk]) => {
    const all = window.__fakeFb.get(k + 'honten-sched') || {};
    let n = 0; Object.values(all).forEach(day => Object.values(day || {}).forEach(r => { if (r && r.name === '整備の大山') n++; }));
    return n === 1;
  }, [STOR, WDK]), await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));
  t('★納車の行も1本だけ', (await dlvRows()) === 1, { n: await dlvRows(), txt: await page.evaluate(() => document.body.innerText.slice(0, 300)) });

  // ── ③ そのカードから日付を変えても二重にならない ──
  console.log('\n■ ③ 納車の行から開いて日付を変える');
  await page.waitForTimeout(800);
  await page.evaluate(n => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes(n)); if (r) r.click(); }, '整備の大山');
  await seeText(page, '予約カード', 8000);
  const picked = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const card = [...box.querySelectorAll('div')].find(e => e.title === 'クリックで日付変更' && e.style && e.style.borderRadius === '12px');
    if (!card) return false;
    card.click(); return true;
  });
  t('日付の札を押せた', picked);
  await page.waitForTimeout(600);
  const dayClicked = await page.evaluate(() => {
    const pick = [...document.querySelectorAll('.booking-modal-inner div')].find(e => e.style && e.style.zIndex === '9999');
    if (!pick) return false;
    const cells = [...pick.querySelectorAll('div')].filter(e => /^\d+$/.test(e.innerText.trim()) && e.style && e.style.cursor === 'pointer');
    const c = cells.find(e => e.innerText.trim() === '15') || cells[10];
    if (!c) return false;
    c.click(); return true;
  });
  t('カレンダーで別の日を選べた', dayClicked);
  await page.waitForTimeout(600);
  t('保存できた（日付変更）', await saveCard(page));
  await page.waitForTimeout(2500);
  t('★日付を変えても整備は1件のまま', await page.evaluate(k => {
    const all = window.__fakeFb.get(k + 'honten-sched') || {};
    let n = 0; Object.values(all).forEach(day => Object.values(day || {}).forEach(r => { if (r && r.name === '整備の大山') n++; }));
    return n === 1;
  }, STOR), await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));

  // ── ④ 車検でも同じ ──
  console.log('\n■ ④ 車検の納車の行から開いた時');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await goDay(DISO);
  await page.waitForTimeout(1500);
  const inspRows = () => page.evaluate(n => [...document.querySelectorAll('tr')].filter(r => r.innerText.includes(n)).length, '車検の大山');
  t('車検の納車の行が1本だけ出る', (await inspRows()) === 1, { n: await inspRows() });
  await page.evaluate(n => { const r = [...document.querySelectorAll('tr')].find(x => x.innerText.includes(n)); if (r) r.click(); }, '車検の大山');
  t('車検のカードが開く', await seeText(page, '車検予約カード', 8000));
  const top2 = await cardTop(page);
  t('★車検も作業日（' + WMD + '）が出る', !!top2 && top2.includes(WMD.replace('月', '/').replace('日', '')), top2);
  t('保存できた（車検）', await saveCard(page));
  await page.waitForTimeout(2500);
  t('★車検も1件のまま（二重にならない）', await page.evaluate(k => {
    const all = window.__fakeFb.get(k + 'insp') || {};
    let n = 0; Object.values(all).forEach(rows => (rows || []).forEach(r => { if (r && r.name === '車検の大山' && r.bookingStatus !== 'cancelled') n++; }));
    return n === 1;
  }, STOR), await page.evaluate(k => { const all = window.__fakeFb.get(k + 'insp') || {}; const o = {}; Object.keys(all).forEach(dk => { const m = (all[dk] || []).filter(r => r && r.name === '車検の大山'); if (m.length) o[dk] = m.length; }); return o; }, STOR));
  t('車検の納車の行も1本だけ', (await inspRows()) === 1, { n: await inspRows() });

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-delivery-dup.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
