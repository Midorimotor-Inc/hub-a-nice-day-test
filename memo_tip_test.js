// ① PC：入庫制限のポップアップが一番下でチラつかない（2026-10-03 ユーザー報告）
//    画面に対する固定位置（position:fixed）で出し、表のスクロールできる高さを変えない。
// ② スマホ：スケジュールの備考・メモを足す／直す／消せる（同日のユーザー報告）
//    実行: node memo_tip_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8291, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const goTab = (page, label) => page.evaluate(x => {
  const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null);
  const target = d.length ? d[d.length - 1].parentElement : null;
  if (target) { target.click(); return true; }
  return false;
}, label);
const clickAny = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button,div,span')].find(e => e.innerText.trim() === x && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
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
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: { [DK]: [{ content: '部品待ち' }] },
    [STOR + 'sanda-memo']: {},
    [STOR + 'memoItems']: [{ id: 'q1', text: '代車は午後返却' }],
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    // 一番下の方の時間を制限する（下端でのチラつきを見るため）
    // 2区画にする（時間の並びが長くなるので、枠からはみ出さないかも見る）
    schedRestrictions: { [DK]: { ranges: [{ startTime: '09:00', endTime: '11:00' }, { startTime: '17:00', endTime: '18:00' }], exemptWorks: ['B'] } },
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const routeFake = ctx => {
    ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
      const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  };

  // ════════ ① PC：入庫制限のポップアップ ════════
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  routeFake(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  head('① PC：制限の帯が出ている');
  t('上に2つの時間帯が並んで出る', await page.waitForFunction(() => /入庫制限\s*09:00〜11:00/.test(document.body.innerText) && /17:00〜18:00/.test(document.body.innerText), null, { timeout: 12000 }).then(() => true).catch(() => false),
    await page.evaluate(() => (document.body.innerText.match(/入庫制限[^\n]*/g) || []).slice(0, 3)));

  // 制限されている行（17:00）の位置を調べ、その行がいるスクロール容器を一番下まで送る
  const prep = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(x => /^\s*17:00/.test(x.innerText));
    if (!row) return null;
    let el = row.parentElement, sc = null;
    while (el) {
      const st = getComputedStyle(el);
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) { sc = el; break; }
      el = el.parentElement;
    }
    const target = sc || document.scrollingElement;
    target.scrollTop = target.scrollHeight;          // 一番下までスクロールした状態にする
    window.__sc = target;
    return { hasRow: true, scrolled: target.scrollTop, isDoc: !sc };
  });
  t('制限されている 17:00 の行がある', !!(prep && prep.hasRow), prep);
  await page.waitForTimeout(500);

  const box = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(x => /^\s*17:00/.test(x.innerText));
    if (!row) return null;
    const td = row.querySelector('td'); const b = (td || row).getBoundingClientRect();
    return { x: b.left + Math.min(20, b.width / 2), y: b.top + b.height / 2, top: b.top, h: b.height };
  });
  t('17:00 の行が画面の中に見えている', !!(box && box.top > 0 && box.h > 0), box);

  // ★行の上では出さない（2026-10-04 ユーザー指示。なぞるたびに出て目障りだったため）
  const before = await page.evaluate(() => ({ sh: window.__sc.scrollHeight, st: window.__sc.scrollTop }));
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(400);
  t('行の上をなぞっても説明は出ない', await page.evaluate(() => ![...document.querySelectorAll('div')].some(e => /この時間帯に入庫できる作業/.test(e.innerText || ''))));

  // 説明は上のバッジ1か所。そこで出した時に、固定位置・枠内・表の高さそのままを見る
  const badge = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div,span')].filter(e => e.offsetParent !== null && /入庫制限/.test(e.innerText || '') && /09:00〜11:00/.test(e.innerText || ''));
    const inner = all.filter(e => !all.some(o => o !== e && e.contains(o)));
    const d = inner[0]; if (!d) return null;
    const b = d.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  t('上のバッジが見つかる', !!badge, badge);
  await page.mouse.move(badge.x, badge.y);
  await page.waitForTimeout(400);

  head('① PC：ポップアップが出て、表の高さを変えない（チラつきの元を断つ）');
  const tip = await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(e => /🚫 入庫制限/.test(e.innerText || '') && getComputedStyle(e).border.indexOf('2px') === 0 && e.offsetParent !== null || (/🚫 入庫制限/.test(e.innerText || '') && getComputedStyle(e).position === 'fixed'));
    if (!d) return null;
    const st = getComputedStyle(d);
    const b = d.getBoundingClientRect();
    return { position: st.position, pe: st.pointerEvents, top: b.top, bottom: b.bottom, left: b.left, inView: b.top >= 0 && b.bottom <= window.innerHeight + 1 };
  });
  t('ポップアップが出る', !!tip, await page.evaluate(() => document.body.innerText.slice(-200)));
  t('画面に対する固定位置（fixed）で出ている', !!tip && tip.position === 'fixed', tip);
  t('マウスを通す（pointer-events:none）', !!tip && tip.pe === 'none', tip);
  t('画面の中に収まっている（下端では上側に出す）', !!tip && tip.inView, tip);
  // 時間帯が2つあると見出しが長くなる。枠からはみ出していないか（2026-10-04 ユーザー報告）
  const ov = await page.evaluate(() => {
    const tip = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && /🚫 入庫制限/.test(e.innerText || ''));
    if (!tip) return null;
    const h = tip.firstElementChild; if (!h) return null;
    const r = tip.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { tipRight: Math.round(r.right), headRight: Math.round(hr.right), ws: getComputedStyle(h).whiteSpace, lines: Math.round(hr.height) };
  });
  t('時間の表示が枠からはみ出さない', !!ov && ov.headRight <= ov.tipRight, ov);
  t('見出しが折り返せる（nowrap を受け継いでいない）', !!ov && ov.ws === 'normal', ov);

  const after = await page.evaluate(() => ({ sh: window.__sc.scrollHeight, st: window.__sc.scrollTop }));
  t('表のスクロールできる高さが変わらない', before.sh === after.sh, { before, after });
  t('スクロール位置が動かない', Math.abs(before.st - after.st) < 2, { before, after });

  // チラつきそのものを見る：マウスを少し動かしながら20回、ずっと出たままか
  let gone = 0;
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(badge.x + (i % 2), badge.y);
    const on = await page.evaluate(() => /🚫 入庫制限/.test(document.body.innerText) && [...document.querySelectorAll('div')].some(e => getComputedStyle(e).position === 'fixed' && /🚫 入庫制限/.test(e.innerText || '')));
    if (!on) gone++;
    await page.waitForTimeout(40);
  }
  t('マウスを乗せている間ずっと出たまま（消えた回数0）', gone === 0, { gone });
  t('JSエラーなし（PC）', errs.length === 0, errs.slice(0, 3));
  await ctx.close();

  // ════════ ② スマホ：備考・メモの追加／編集／削除 ════════
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mctx.addInitScript(signedInInit, [ME, STOR]);
  routeFake(mctx);
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  mp.on('dialog', async d => { await d.accept().catch(() => {}); });   // 削除の確認は OK
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 20000); await clickText(mp, '江川京志'); await clickText(mp, 'でログイン');
  await seeText(mp, '予定', 20000);
  await mp.waitForTimeout(1200);
  // 下タブ「スケジュール」へ
  t('スケジュールのタブに移れた', await goTab(mp, 'スケジュール'));
  await mp.waitForTimeout(1800);

  head('② スマホ：備考・メモの欄');
  t('「📝 備考・メモ」の見出しが出る', await seeText(mp, '備考・メモ', 10000));
  t('もともとの備考「部品待ち」が出ている', await seeText(mp, '部品待ち', 8000));
  t('「＋ 備考・メモを追加」がある', await mp.evaluate(() => /＋ 備考・メモを追加/.test(document.body.innerText)));

  head('② スマホ：足せる');
  await mp.evaluate(() => { const b = [...document.querySelectorAll('div')].find(e => e.innerText.trim() === '＋ 備考・メモを追加' && e.offsetParent !== null); if (b) b.click(); });
  await mp.waitForTimeout(400);
  t('入力シートが開く', await seeText(mp, '備考・メモを追加', 6000));
  t('クイック項目（代車は午後返却）が出る', await mp.evaluate(() => /代車は午後返却/.test(document.body.innerText)));
  await mp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '代車は午後返却'); if (b) b.click(); });
  await mp.waitForTimeout(200);
  t('クイック項目を押すと入力欄に入る', await mp.evaluate(() => { const ta = document.querySelector('textarea'); return !!ta && ta.value.includes('代車は午後返却'); }));
  await mp.evaluate(() => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, 'スマホから追加した備考');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await mp.waitForTimeout(200);
  await clickText(mp, '保存');
  await mp.waitForTimeout(2500);
  t('一覧に出る', await seeText(mp, 'スマホから追加した備考', 8000), await mp.evaluate(() => document.body.innerText.slice(-300)));
  const saved1 = await mp.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-memo');
  t('サーバーに2件入っている', !!saved1 && Array.isArray(saved1[DK]) && saved1[DK].length === 2, saved1);
  t('PC版と同じ形（{content}）で保存される', !!saved1 && saved1[DK].every(x => typeof x.content === 'string'), saved1);
  t('もともとの備考は残っている', !!saved1 && saved1[DK].some(x => x.content === '部品待ち'), saved1);

  head('② スマホ：直せる');
  await mp.evaluate(() => { const d = [...document.querySelectorAll('div')].find(e => e.innerText.trim() === '部品待ち' && e.offsetParent !== null); if (d) d.click(); else { const s = [...document.querySelectorAll('span')].find(e => e.innerText.trim() === '部品待ち'); if (s) s.click(); } });
  await mp.waitForTimeout(500);
  t('編集シートが開く', await seeText(mp, '備考・メモを編集', 6000), await mp.evaluate(() => document.body.innerText.slice(0, 160)));
  t('今の内容が入っている', await mp.evaluate(() => { const ta = document.querySelector('textarea'); return !!ta && ta.value === '部品待ち'; }));
  await mp.evaluate(() => {
    const ta = document.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, '部品が入りました');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clickText(mp, '保存');
  await mp.waitForTimeout(2500);
  const saved2 = await mp.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-memo');
  t('内容が書き換わる', !!saved2 && saved2[DK].some(x => x.content === '部品が入りました') && !saved2[DK].some(x => x.content === '部品待ち'), saved2);
  t('件数は増えない（2件のまま）', !!saved2 && saved2[DK].length === 2, saved2);

  head('② スマホ：消せる');
  await mp.evaluate(() => { const d = [...document.querySelectorAll('span,div')].find(e => e.innerText.trim() === '部品が入りました' && e.offsetParent !== null); if (d) d.click(); });
  await mp.waitForTimeout(500);
  t('削除ボタンがある', await mp.evaluate(() => /🗑 削除/.test(document.body.innerText)));
  await clickText(mp, '削除');
  await mp.waitForTimeout(2500);
  const saved3 = await mp.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-memo');
  t('1件だけ消える', !!saved3 && saved3[DK].length === 1 && saved3[DK][0].content === 'スマホから追加した備考', saved3);
  t('JSエラーなし（スマホ）', merrs.length === 0, merrs.slice(0, 3));

  await mctx.close();
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + `結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
