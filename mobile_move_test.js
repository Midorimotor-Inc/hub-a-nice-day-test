// スマホ版の検査（2026-10-01 ユーザー指示）
//   ① 入っている整備（タイムスケジュール）の日にちと時間を変えられる。元の枠は空く
//   ② 代車のボタンが「代車なし／代車あり／レンタカー」の3つで、今の状態が光って出る
//   ③ 「＋追加」が中心部に大きく出る（予約ゼロ＝箱の真ん中／予約あり＝一覧の下）。
//      カレンダーの予約ゼロの日は「✎ 予約・編集」が真ん中に大きく出る
//   実行: node mobile_move_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8247, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
// 下のタブは <div>（button ではない）ので、文字で探して押す
const goTab = (page, label) => page.evaluate(x => {
  const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null);
  const target = d.length ? d[d.length - 1].parentElement : null;
  if (target) { target.click(); return true; }
  return false;
}, label);
// 予約カードを文字で押す（その文字を含む一番小さい枠を選ぶ）
const clickCard = (page, name) => page.evaluate(x => {
  const c = [...document.querySelectorAll('div')].filter(e => e.innerText.includes(x) && e.offsetParent !== null && e.style && e.style.borderRadius);
  if (!c.length) return false;
  c.sort((a, b) => a.innerText.length - b.innerText.length);
  c[0].click(); return true;
}, name);
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
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;                       // 今日（整備が入っている日）
const nx = new Date(Y, M, D + 1);
const DK2 = `${nx.getFullYear()}-${nx.getMonth() + 1}-${nx.getDate()}`;   // 移り先の日
const IN2 = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`;
const EMPTY = new Date(Y, M, D + 2);                   // 予約がゼロの日
const EMPTY_D = EMPTY.getDate();

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '原村', carType: 'シエンタ', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' }] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '', shimi: '' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdow-v2']: [], [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
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
  const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 25000);

  // ── ③-1 カレンダーの予約ゼロの日 ──
  console.log('\n■ ③-1 カレンダーの予約ゼロの日');
  await page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, EMPTY_D);
  t('この日の予約はありません と出る', await seeText(page, 'この日の予約はありません', 10000));
  const big = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('予約・編集') && e.offsetParent !== null);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), fs: getComputedStyle(b).fontSize, hint: document.body.innerText.includes('この日のスケジュール画面へ移ります') };
  });
  t('「✎ 予約・編集」が大きく（幅いっぱい・16px）出る', !!big && big.w > 250 && big.fs === '16px', big);
  t('案内の文も出る', !!big && big.hint, big);
  t('右上の小さいボタンは出ていない', await page.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.innerText.includes('予約・編集') && e.offsetParent !== null).length === 1));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(600);

  // 予約がある日は今までどおり右上に小さく
  await page.evaluate(d => { const c = [...document.querySelectorAll('div')].filter(el => el.style && el.style.borderRadius === '10px' && el.firstElementChild && el.firstElementChild.textContent === String(d))[0]; if (c) c.click(); }, D);
  t('予約がある日は小さいボタンのまま', await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('予約・編集') && e.offsetParent !== null);
    return !!b && getComputedStyle(b).fontSize === '11px';
  }, null, { timeout: 10000 }).then(() => true).catch(() => false));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(500);

  // ── ③-2/③-3 スケジュールの車検 ──
  console.log('\n■ ③-2/③-3 スケジュールの「＋ 車検を追加」');
  t('スケジュールのタブに移れた', await goTab(page, 'スケジュール'));
  await page.waitForTimeout(1800);
  t('予約がある日は一覧の下に「＋ 車検を追加」', await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('＋ 車検を追加') && e.offsetParent !== null);
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 250 && getComputedStyle(b).borderStyle === 'dashed';
  }, null, { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(() => document.body.innerText.slice(0, 300)));
  t('右端の小さい「＋ 追加」は無くなった', await page.evaluate(() => ![...document.querySelectorAll('button')].some(e => e.innerText.trim() === '＋ 追加' && e.offsetParent !== null)));

  // ── ① 整備の日にち・時間の変更 ──
  console.log('\n■ ① 整備の日にちと時間を変える');
  // Playwright の click（本物のマウス操作）で押す。React の onClick は親の枠に付いている
  const _ok = await page.getByText('相原', { exact: false }).last().click({ timeout: 8000 }).then(() => true).catch(() => false);
  t('整備の予約カードを押せた', _ok);
  await page.waitForTimeout(900);
  t('整備の編集画面が開く', await seeText(page, '作業内容', 10000), await page.evaluate(() => document.body.innerText.slice(-600)));
  const fields = await page.evaluate(() => {
    const lbl = x => { const l = [...document.querySelectorAll('label')].find(e => e.innerText.trim() === x); if (!l || !l.parentElement) return null; const n = l.parentElement.querySelector('input,select'); return n ? { tag: n.tagName, val: n.value } : null; };
    return { d: lbl('日にち'), t: lbl('時間') };
  });
  t('「日にち」の欄がある', !!fields.d && fields.d.tag === 'INPUT', fields);
  t('「時間」の欄があり 10:00 が入っている', !!fields.t && fields.t.tag === 'SELECT' && fields.t.val === '10:00', fields);
  t('移動の案内文は出さない（ユーザー指示）', !(await page.evaluate(() => document.body.innerText)).includes('元の枠は空きます'));
  // 翌日の 13:00 へ移す
  await page.evaluate(([inDate]) => {
    const l = [...document.querySelectorAll('label')].find(e => e.innerText.trim() === '日にち');
    if (!l) return;
    const inp = l.parentElement.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, inDate); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, [IN2]);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find(e => e.innerText.trim() === '時間');
    if (!l) return;
    const sel = l.parentElement.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '13:00'); sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  t('「予約確定」を押せた', await clickText(page, '予約確定'));
  t('移り先（翌日 13:00）に入る', await page.waitForFunction(([k, dk2]) => {
    const day = (window.__fakeFb.get(k + 'honten-sched') || {})[dk2] || {};
    return Object.entries(day).some(([slot, r]) => r && r.name === '相原' && slot.indexOf('13:00') === 0);
  }, [STOR, DK2], { timeout: 20000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));
  t('元の枠（今日 10:00）は空く', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'honten-sched') || {})[dk] || {};
    return !day['10:00'];
  }, [STOR, DK], { timeout: 20000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));
  t('二重に残らない（全部で1件）', await page.evaluate(k => {
    const all = window.__fakeFb.get(k + 'honten-sched') || {};
    let n = 0; Object.values(all).forEach(day => Object.values(day || {}).forEach(r => { if (r && r.name === '相原') n++; }));
    return n === 1;
  }, STOR));

  // ── ② 代車のボタン ──
  console.log('\n■ ② 代車のボタン（3つ）');
  await page.waitForTimeout(1200);
  await clickText(page, '＋ 車検を追加');
  t('車検の予約画面が開く', await seeText(page, '代車', 10000));
  const btns = await page.evaluate(() => {
    const box = [...document.querySelectorAll('div')].find(e => e.innerText.includes('🔑 代車・レンタカー'));
    if (!box) return null;
    return [...box.querySelectorAll('button')].map(b => b.innerText.trim()).filter(x => /代車|レンタカー/.test(x) && x.length < 8);
  });
  t('ボタンは「代車なし／代車あり／レンタカー」の3つ', !!btns && btns.length === 3 && btns[0] === '代車なし' && btns[1] === '代車あり' && btns[2] === 'レンタカー', btns);
  t('「変更なし」「なし」は無くなった', !!btns && !btns.includes('変更なし') && !btns.includes('なし'), btns);
  t('新規は「代車なし」が光っている', await page.evaluate(() => {
    const box = [...document.querySelectorAll('div')].find(e => e.innerText.includes('🔑 代車・レンタカー'));
    const b = [...box.querySelectorAll('button')].find(e => e.innerText.trim() === '代車なし');
    return !!b && getComputedStyle(b).borderColor.indexOf('2, 132, 199') >= 0;
  }));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-move.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
