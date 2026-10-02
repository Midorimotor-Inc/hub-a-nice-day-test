// PC の予約カード「入庫店舗」の検査（2026-10-02 ユーザー指示・①案）
//   ① 車検予約カードの上段に「入庫店舗」＋ボタン1つがあり、行は増えていない
//   ② 車検の店を変えて保存すると、その行の store が変わる
//   ③ 整備（一般予約カード）でも同じ欄があり、店を変えると別の店の
//      タイムスケジュールへ移って元の店の枠が空く
//   実行: node pc_card_store_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8253, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const cardStore = page => page.evaluate(() => { const b = document.querySelector('button[title*="入れ替わり"]'); return b ? b.innerText.trim() : null; });
const tapCardStore = page => page.evaluate(() => { const b = document.querySelector('button[title*="入れ替わり"]'); if (b) { b.click(); return true; } return false; });
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

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '原村', carType: 'シエンタ', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' }] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '' } } },
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

  // ── ① 車検予約カードの入庫店舗 ──
  console.log('\n■ ① 車検予約カードの「入庫店舗」');
  await page.click('td:has-text("原村")', { timeout: 8000 }).catch(() => {});
  t('予約カードが開く', await seeText(page, '車検予約カード', 8000));
  const st0 = await cardStore(page);
  t('入庫店舗の欄があり、今の店（本店）が出ている', !!st0 && st0.includes('本店'), st0);
  t('「入庫店舗」の文字が出る', await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); return !!box && box.innerText.includes('入庫'); }));
  const sameRow = await page.evaluate(() => {
    const b = document.querySelector('button[title*="入れ替わり"]');
    const d = [...document.querySelectorAll('.booking-modal-inner div')].find(e => /車検予約カード/.test(e.innerText) && e.innerText.length < 40);
    if (!b || !d) return null;
    const rb = b.getBoundingClientRect(), rd = d.getBoundingClientRect();
    return { bTop: Math.round(rb.top), dTop: Math.round(rd.top), diff: Math.round(Math.abs((rb.top + rb.height / 2) - (rd.top + rd.height / 2))) };
  });
  t('タイトルと同じ段にある（行が増えていない）', !!sameRow && sameRow.diff < 30, sameRow);

  // ── ② 車検の店を三田店に変える ──
  console.log('\n■ ② 車検の店を三田店に変える');
  t('入庫店舗を押せた', await tapCardStore(page));
  await page.waitForTimeout(400);
  t('三田店に入れ替わる', (await cardStore(page) || '').includes('三田店'), await cardStore(page));
  t('保存できた', await saveCard(page));
  t('★車検の行の store が三田店になる', await page.waitForFunction(([k, dk]) => {
    const rows = (window.__fakeFb.get(k + 'insp') || {})[dk] || [];
    const r = rows.find(x => x && x.name === '原村');
    return !!r && (r.store === 'sanda' || r.store === '三田店');
  }, [STOR, DK], { timeout: 20000 }).then(() => true).catch(() => false),
    await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).map(r => r && { n: r.name, s: r.store }), [STOR, DK]));

  // ── ③ 整備の店を変えて移す ──
  console.log('\n■ ③ 整備（一般予約カード）の店を変えて移す');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.click('td:has-text("相原")', { timeout: 8000 }).catch(() => {});
  t('一般予約カードが開く', await seeText(page, '一般予約カード', 8000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  const st1 = await cardStore(page);
  t('整備にも入庫店舗の欄がある', !!st1, st1);
  t('入庫店舗を押せた（整備）', await tapCardStore(page));
  await page.waitForTimeout(400);
  t('三田店になった', (await cardStore(page) || '').includes('三田店'), await cardStore(page));
  t('保存できた（整備）', await saveCard(page));
  t('★三田店のタイムスケジュールへ移る', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'sanda-sched') || {})[dk] || {};
    return Object.values(day).some(r => r && r.name === '相原');
  }, [STOR, DK], { timeout: 25000 }).then(() => true).catch(() => false),
    await page.evaluate(k => ({ h: window.__fakeFb.get(k + 'honten-sched'), s: window.__fakeFb.get(k + 'sanda-sched') }), STOR));
  t('★本店の枠は空く', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'honten-sched') || {})[dk] || {};
    return !Object.values(day).some(r => r && r.name === '相原');
  }, [STOR, DK], { timeout: 25000 }).then(() => true).catch(() => false),
    await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));
  t('内部用の印（_targetDk など）が保存されていない', await page.evaluate(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'sanda-sched') || {})[dk] || {};
    return !Object.values(day).some(r => r && Object.keys(r).some(x => String(x).charAt(0) === '_'));
  }, [STOR, DK]), await page.evaluate(([k, dk]) => (window.__fakeFb.get(k + 'sanda-sched') || {})[dk], [STOR, DK]));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-pc-card-store.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
