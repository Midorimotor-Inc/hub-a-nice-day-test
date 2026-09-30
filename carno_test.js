// ナンバー4桁の検査（2026-09-30 ユーザー指示・A案）。
//   ・予約カードに「ナンバー 4桁」の欄があり、車種の右横に並ぶ。数字だけ・4桁まで。
//   ・顧客リスト（検索）から予約した人は、リストの「No.」がナンバーとして自動で入る。
//   ・スケジュール表：ナンバーは車種の下。電話はコース（整備は作業内容）のバッジの下。
//   実行: node carno_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8241, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 予約カードの中の入力欄を、その上のラベルの文字で探す
const fieldByLabel = (page, label) => page.evaluate(lb => {
  const box = document.querySelector('.booking-modal-inner'); if (!box) return null;
  const wrap = [...box.querySelectorAll('div')].find(d => {
    const l = d.querySelector(':scope > label');
    return l && l.innerText.replace(/\s/g, '').startsWith(lb) && d.querySelector(':scope > input');
  });
  if (!wrap) return null;
  const inp = wrap.querySelector(':scope > input');
  const r = inp.getBoundingClientRect();
  return { value: inp.value, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), max: inp.maxLength };
}, label);

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [
      { name: '原村', carType: 'シエンタ', no: '3310', phone: '090-1234-5678', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' },
    ] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', no: '8612', phone: '079-560-0000', work: 'オイル', content: '' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'cf-index']: [{ name: '202610', count: 1 }],
    [STOR + 'cf-202610-index']: { name: '202610', total: 1, chunks: 1 },
    [STOR + 'cf-202610-chunk-0']: [{ custId: 'c1', rowIdx: 1, name: '井上花子', no: 7879, carType: 'スイフト', phoneMobile: '090-1111-2222', address: '三田市', expiry: '2026-11-30', status: '', entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', bookingTime: '', linkedInspDate: '' }],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, (process.env.SRC && p === 'index_dev.html') ? process.env.SRC : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
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
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の車検が出ている', await seeText(page, '原村', 15000));

  // ── ① 表の見え方（A案） ──
  console.log('\n■ ① スケジュール表：ナンバーは車種の下、電話はバッジの下');
  const inspCells = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('原村')); if (!tr) return null;
    return [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim());
  });
  t('車検：ナンバーが車種と同じマスに出る', !!inspCells && inspCells.some(c => /シエンタ/.test(c) && /ナンバー\s*3310/.test(c)), inspCells);
  t('車検：電話がコースと同じマスに出る', !!inspCells && inspCells.some(c => /クイック車検/.test(c) && /090-1234-5678/.test(c)), inspCells);
  t('車検：電話は車種のマスから消えている', !!inspCells && !inspCells.some(c => /シエンタ/.test(c) && /090-1234-5678/.test(c)), inspCells);
  const schedCells = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('相原')); if (!tr) return null;
    return [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim());
  });
  t('整備：ナンバーが車種と同じマスに出る', !!schedCells && schedCells.some(c => /ワゴンR/.test(c) && /ナンバー\s*8612/.test(c)), schedCells);
  t('整備：電話が作業内容と同じマスに出る', !!schedCells && schedCells.some(c => /079-560-0000/.test(c) && !/ワゴンR/.test(c)), schedCells);

  // ── ② 予約カードの欄 ──
  console.log('\n■ ② 予約カード：車種の右横にナンバー4桁');
  await page.click('td:has-text("原村")', { timeout: 8000 }).catch(() => {});
  t('予約カードが開く', await seeText(page, '車検予約カード', 8000));
  const car = await fieldByLabel(page, '車種');
  const no = await fieldByLabel(page, 'ナンバー');
  t('ナンバーの欄がある', !!no, { car, no });
  t('既に入っているナンバーが出ている', !!no && no.value === '3310', no);
  t('車種と同じ行の、右横にある', !!car && !!no && Math.abs(car.y - no.y) <= 4 && no.x > car.x, { car, no });
  t('車種の欄より狭い', !!car && !!no && no.w < car.w, { carW: car && car.w, noW: no && no.w });
  // 数字だけ・4桁まで
  await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    const wrap = [...box.querySelectorAll('div')].find(d => { const l = d.querySelector(':scope > label'); return l && l.innerText.replace(/\s/g, '').startsWith('ナンバー') && d.querySelector(':scope > input'); });
    const inp = wrap.querySelector(':scope > input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'あ12-345x9');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const after = await fieldByLabel(page, 'ナンバー');
  t('数字だけ・4桁までに直される', !!after && after.value === '1234', after);
  // 保存するとサーバーに入る
  await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) b.click(); });
  t('保存するとナンバーが残る', await page.waitForFunction(([k, dk]) => {
    const rows = (window.__fakeFb.get(k + 'insp') || {})[dk] || [];
    return rows.some(r => r && r.name === '原村' && String(r.no) === '1234');
  }, [STOR, DK], { timeout: 15000 }).then(() => true).catch(() => false),
    await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).map(r => r && { n: r.name, no: r.no }), [STOR, DK]));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ── ③ 検索から選んだ人はナンバーが自動で入る ──
  console.log('\n■ ③ 顧客リスト（検索）から予約するとナンバーが自動で入る');
  const found = await page.evaluate(() => {
    const rows = window.__fakeFb.get('hub-v8-dev-cf-202610-chunk-0') || [];
    return rows[0] && rows[0].no;
  });
  t('顧客リストの「No.」がナンバー（7879）', String(found) === '7879', found);
  const src = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8');
  t('リストから予約する時に no を渡している', /no:\s*cust\.no/.test(src));
  t('新しい予約の初期値に no がある（車検・整備とも）',
    /blankInsp\s*=\s*\(\)\s*=>\s*\(\{[^)]*no:''/.test(src) && /blankSched\s*=\s*\(\)\s*=>\s*\(\{[^)]*no:''/.test(src));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-carno.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
