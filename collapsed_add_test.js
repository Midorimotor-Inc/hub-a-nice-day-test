// 畳んだタイムスケジュール（①②）、月集計の店舗内訳（③）、スタッフ休日の初期表示（④）の検査（2026-09-30）。
//   ①：畳んだ時に予定がゼロなら「まだ予定がありません」と出る
//   ②：畳んだ時も「＋ 予定を追加」が出て、押すと予約カードが開く。時間は --:-- で、選ばないと保存できない。
//      選んだ時間の枠に入る。
//   ⑤：2026-10-15 ユーザー指示 — 畳んだ状態から開いた時はカーソルが**時間の欄**から始まる。
//      時間は <select> ではなく自前のドロップダウン（select も日本語入力を英数にするため）。
//   ⑥：2026-10-15 ユーザー選択（B案）— 欄を下へ送った時、カードの半分より下に来たら真ん中へ戻す。
//      以前は ↓キーの時だけで、Tab・クリックでは一度もスクロールしなかった。
//   ③：カレンダーの月集計に「合計○台・本店○台・三田店○台」が出る
//   ④：スタッフ休日カレンダーを開くと、ログインしている人だけが選ばれている
//   実行: node collapsed_add_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8225, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => { const sc = r ? document.querySelector(r) : document; if (!sc) return false; const b = [...sc.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, [s, root || null]);
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
const now = new Date(), Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;

(async () => {
  const seed = {
    // 車検は本店2台・三田店1台（③の内訳の確認用）
    [STOR + 'insp']: { [DK]: [
      { name: '本店客A', carType: 'アルト', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed' },
      { name: '本店客B', carType: 'タント', course: 1, store: 'honten', seq: 2, time: '10:00', bookingStatus: 'confirmed' },
      { name: '三田客C', carType: 'ハスラー', course: 3, store: 'sanda', seq: 3, time: '09:00', bookingStatus: 'confirmed' },
    ] },
    [STOR + 'honten-sched']: {},   // その日の整備はゼロ（①の確認用）
    [STOR + 'honten-staff-v2']: [
      { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
      { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' },
    ],
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
  page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(500);

  // ── ③ カレンダーの月集計 ──
  console.log('\n■ ③ 月集計の店舗内訳');
  const nav = (label) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.style.width === '118px' && e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, label);
  await nav('カレンダー');
  await page.waitForTimeout(1500);
  t('カレンダーに合計と店舗の内訳が出る', await page.waitForFunction(() => {
    const t = document.body.innerText;
    return /合計\s*3台/.test(t) && /本店\s*2台/.test(t) && /三田店\s*1台/.test(t);
  }, null, { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(() => document.body.innerText.slice(0, 300)));

  // ── ④ スタッフ休日カレンダーの初期表示 ──
  console.log('\n■ ④ スタッフ休日カレンダーの初期表示');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /休日/.test(e.innerText) && /🏖/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const sel = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => ['全員', '江川京志', '竹林直行'].includes(b.innerText.trim()));
    return btns.map(b => ({ name: b.innerText.trim(), on: b.style.borderColor === 'rgb(194, 65, 12)' || b.style.borderColor === 'rgb(5, 150, 105)' }));
  });
  t('開いた時はログインしている人（江川京志）が選ばれている', sel.some(x => x.name === '江川京志' && x.on) && !sel.some(x => x.name === '全員' && x.on), sel);
  t('「全員」ボタンで全員表示に戻せる', await clickText(page, '全員') && await page.waitForTimeout(400).then(() => true));

  // ── ①② 畳んだタイムスケジュール ──
  console.log('\n■ ①② 畳んだ時の表示と「＋ 予定を追加」');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('スケジュール') && e.offsetParent !== null && e.innerText.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1200);
  await clickText(page, '▲ 畳む');
  await page.waitForTimeout(600);
  t('① 予定がゼロなら「まだ予定がありません」と出る', await seeText(page, 'まだ予定がありません', 6000), await page.evaluate(() => document.body.innerText.slice(-300)));
  t('②「＋ 予定を追加」が出る', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('＋ 予定を追加'))));
  await clickText(page, '＋ 予定を追加');
  t('② 予約カードが開く', await seeText(page, '一般予約カード', 8000));
  await page.waitForTimeout(900);   // 開いた直後のカーソル移動（120ms のタイマー）を待つ
  t('② 時間の欄は1つだけで、--:-- で始まる', await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const sl = [...box.querySelectorAll('[data-kbkey="slot"]')];
    return sl.length === 1 && /--:--/.test(sl[0].innerText);
  }), await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); const d = b && b.querySelector('[data-kbkey="slot"]'); return d ? d.innerText : '(無い)'; }));
  // ★⑤ カーソルが時間の欄から始まる（2026-10-15 ユーザー指示）
  t('⑤ 開いた時のカーソルが「時間」の欄に入っている', await page.evaluate(() => {
    const a = document.activeElement;
    return !!(a && a.dataset && a.dataset.kbkey === 'slot');
  }), await page.evaluate(() => { const a = document.activeElement; return a ? (a.tagName + '/' + (a.dataset.kbkey || a.placeholder || '')) : '(なし)'; }));
  t('⑤ 時間の欄に <select> を使っていない（日本語入力を解除するため）', await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    return [...box.querySelectorAll('select')].every(x => ![...x.options].some(o => o.text === '--:--'));
  }));
  // ★⑥ B案：下へ送った時のスクロール
  const scrollTopOf = () => page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); return b ? Math.round(b.scrollTop) : -1; });
  const pctOf = () => page.evaluate(() => {
    const b = document.querySelector('.booking-modal-inner'), a = document.activeElement;
    if (!b || !a) return -1;
    const br = b.getBoundingClientRect(), ar = a.getBoundingClientRect();
    return Math.round(((ar.top + ar.height / 2 - br.top) / br.height) * 100);
  });
  await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); if (b) b.scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab'); await page.waitForTimeout(700);
  t('⑥ 上半分にいる間はスクロールしない', (await scrollTopOf()) === 0, { scrollTop: await scrollTopOf(), pct: await pctOf() });
  const pcts = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(700); pcts.push(await pctOf()); }
  const moved = await scrollTopOf();
  t('⑥ 下へ送るとカードがスクロールする（前は一度も動かなかった）', moved > 0, { scrollTop: moved, pcts });
  t('⑥ どの欄も画面の外（100%超）へ出ていかない', pcts.every(p => p >= 0 && p <= 100), pcts);
  // 時間の欄へ戻してから続ける（この後の保存の検査のため）
  await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); const d = b && b.querySelector('[data-kbkey="slot"]'); if (d) d.focus(); });
  await page.waitForTimeout(400);
  // 名前と作業だけ入れて保存 → 時間未選択で止まる
  await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    const inp = box.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '時間未定さん'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    const inps = [...box.querySelectorAll('input')];
    const car = inps[2] || inps[1];
    if (car) { setter.call(car, 'ワゴンR'); car.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  // 作業内容は「クリックで開くリスト」から選ぶ（項目は mousedown で決まる）
  const pickWork = async () => {
    await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const d = box && box.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(500);
    const okMd = await page.evaluate(() => {
      const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
      const el = box.querySelector('[data-wkid]'); if (!el) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      const trig = box.querySelector('[data-kbkey="work"]');
      return !!(trig && !/選択してください/.test(trig.innerText));
    });
    if (okMd) return true;
    // キーボードで選ぶ（作業欄にフォーカス → Enter で開く → ↓ → Enter）
    await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const d = box && box.querySelector('[data-kbkey="work"]'); if (d) d.focus(); });
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const okKb = await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); const trig = b && b.querySelector('[data-kbkey="work"]'); return !!(trig && !/選択してください/.test(trig.innerText)); });
    if (okKb) return true;
    await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const d = box && box.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
      const names = ['その他', '12ヶ月点検', 'メンパ6ヶ月点検', '鈑金塗装'];
      const all = [...box.querySelectorAll('div,button')];
      for (const nm of names) {
        const item = all.find(e => e.innerText.trim() === nm);
        if (item) { item.click(); break; }
      }
      const trig = box.querySelector('[data-kbkey="work"]');
      return !!(trig && !/選択してください/.test(trig.innerText));
    });
  };
  t('② 作業を選べた（検査の前提）', await pickWork());
  await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) b.click(); });
  await page.waitForTimeout(800);
  t('② 時間を選ばずに保存しようとすると止まる', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  // 時間を選んで保存
  // ★自前のドロップダウン：押して開く → 項目を mousedown で決める（2026-10-15）
  await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); const d = b && b.querySelector('[data-kbkey="slot"]'); if (d) d.click(); });
  await page.waitForTimeout(400);
  t('⑤ 押すと時間の一覧が開く', await page.evaluate(() => document.querySelectorAll('[data-slotid]').length > 3));
  await page.evaluate(() => {
    const el = document.querySelector('[data-slotid="13:00"]');
    if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) b.click(); });
  t('② 選んだ時間（13:00）の枠に入る', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'honten-sched') || {})[dk] || {};
    return Object.keys(day).some(sl => sl.indexOf('13:00') === 0 && day[sl] && day[sl].name === '時間未定さん');
  }, [STOR, DK], { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(([k, dk]) => (window.__fakeFb.get(k + 'honten-sched') || {})[dk], [STOR, DK]));
  t('① 予定が入ったら「まだ予定がありません」は消える', await page.waitForFunction(() => !document.body.innerText.includes('まだ予定がありません'), null, { timeout: 8000 }).then(() => true).catch(() => false));
  t('② 予定がある時も「＋ 予定を追加」は出る', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.includes('＋ 予定を追加'))));

  t('JSエラー・alert なし（時間未選択の知らせは除く）', errs.filter(e => !/時間を選んで/.test(e)).length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-collapsed.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
