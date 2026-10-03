// 車検予約の「日にち変更」と二重予約の検査（2026-10-04 現場からの報告）
//   ① スマホの車検カードに「車検日（予約の日）」があり、変えると予約がその日へ移る
//   ② 元の日からは消える（二重にならない）／代車も新しい日に付け替わる
//   ③ 顧客リストから日にちを変えた時、custId が変わっていても古い予約を外せる（尋ねてから）
//   ④ 古い日のカレンダー控え（custbk）も残らない
//   ⑤ PC の制限ポップは、表の行の上では出ない（説明は上のバッジ1か所だけ）
//   実行: node insp_move_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8295, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const goTab = (page, label) => page.evaluate(x => {
  const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null);
  const target = d.length ? d[d.length - 1].parentElement : null;
  if (target) { target.click(); return true; }
  return false;
}, label);
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
// 休業日（水曜・第2火曜）を避けて、来月の平日を2つ選ぶ
const pickDays = () => {
  const out = [], d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  const isClosed = x => {
    const dow = x.getDay();
    if (dow === 3 || dow === 0) return true;                    // 水・日
    if (dow === 2) { let c = 0; for (let i = 1; i <= x.getDate(); i++) { const y = new Date(x.getFullYear(), x.getMonth(), i); if (y.getDay() === 2) c++; } if (c === 2) return true; }
    return false;
  };
  for (let i = 1; i <= 28 && out.length < 2; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), i);
    if (!isClosed(x)) out.push(x);
  }
  return out.map(x => ({ dk: `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`, input: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }));
};
const todayDk = (() => { const x = new Date(); return { dk: `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`, input: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }; })();
const [, D2] = pickDays();
const D1 = todayDk;   // 今日に入っている予約を、来月の平日へ移す
const CUST = { name: '山東　庸子', carType: 'スペーシア', no: 5902 };

(async () => {
  const seed = {
    [STOR + 'insp']: {
      [D1.dk]: [{
        name: CUST.name, carType: CUST.carType, no: CUST.no, course: 2, store: 'honten', staff: '',
        tokuten: '-', note: '', time: '10:00', bookingStatus: 'confirmed', seq: 1000,
        custId: '202612__121__山東庸子__5902', bookingKey: `insp-${D1.dk}-0`,
      }],
    },
    [STOR + 'honten-sched']: { [D1.dk]: { '10:00': { name: '辻井', carType: 'ノート', work: 'A', content: 'オイル交換', id: 1, store: 'honten' } },
      [D2.dk]: { '11:00': { name: '来月の人', carType: 'アルト', work: 'A', content: '点検', id: 2, store: 'honten' } } }, [STOR + 'sanda-sched']: {},
    [STOR + 'custbk']: { [`${CUST.name}::${D1.dk}`]: { status: 'confirmed', dk: D1.dk, idx: 0, savedAt: Date.now(), formData: { name: CUST.name, carType: CUST.carType, no: CUST.no, custId: '202612__121__山東庸子__5902', course: 2, store: 'honten' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    'honten-schedRestrictions': {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const mkCtx = async (mobile) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1500, height: 920 } });
    await ctx.addInitScript(signedInInit, [ME, STOR]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
      const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    return ctx;
  };
  const readKv = (page, k) => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), k);

  // ════════ ① スマホ：車検の日にちを変える ════════
  const mctx = await mkCtx(true);
  const mp = await mctx.newPage();
  const merr = []; mp.on('pageerror', e => merr.push(String(e)));
  const malerts = []; mp.on('dialog', async d => { malerts.push(d.message()); await d.accept().catch(() => {}); });
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 20000);
  await mp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(mp, 'カレンダー', 20000);
  await mp.waitForTimeout(1200);
  t('スケジュールのタブに移れた', await goTab(mp, 'スケジュール'));
  await mp.waitForTimeout(1800);

  head('① スマホ：車検カードに「車検日」がある');
  t('その日に予約が出ている', await seeText(mp, '山東', 8000), await mp.evaluate(() => document.body.innerText.slice(0, 300)));
  await mp.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => /山東/.test(e.innerText || '')); const small = d.sort((a, b) => a.innerText.length - b.innerText.length)[0]; if (small) small.click(); });
  await mp.waitForTimeout(900);
  t('予約カードが開く', await seeText(mp, '🚗 車検', 6000), await mp.evaluate(() => document.body.innerText.slice(0, 200)));
  t('「車検日（予約の日）」の欄がある', await mp.evaluate(() => /車検日（予約の日）/.test(document.body.innerText)));
  t('「入庫日」の欄も今までどおりある', await mp.evaluate(() => /入庫日/.test(document.body.innerText)));

  head('② スマホ：日にちを変えると移る（元の日は消える）');
  await mp.evaluate(v => {
    const labels = [...document.querySelectorAll('label')];
    const lb = labels.find(l => /車検日（予約の日）/.test(l.innerText));
    const box = lb && lb.parentElement;
    const i = box && box.querySelector('input[type=date]');
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, D2.input);
  await mp.waitForTimeout(500);
  t('「→ ○月○日 へ移します」と出る', await mp.evaluate(() => /へ移します（元の日からは消えます）/.test(document.body.innerText)));
  await clickText(mp, '予約確定');
  await mp.waitForTimeout(4000);
  const insp = await readKv(mp, STOR + 'insp');
  const alive = d => ((insp && insp[d]) || []).filter(r => r && r.name && r.bookingStatus !== 'cancelled');
  t('移り先の日に1件ある', alive(D2.dk).length === 1, { [D2.dk]: alive(D2.dk).map(r => r.name) });
  t('元の日は空になっている（二重にならない）', alive(D1.dk).length === 0, { [D1.dk]: alive(D1.dk).map(r => r.name) });
  t('氏名・コースはそのまま', (alive(D2.dk)[0] || {}).name === CUST.name && String((alive(D2.dk)[0] || {}).course) === '2', alive(D2.dk)[0]);
  t('代車の紐付け（bookingKey）が新しい日になる', (alive(D2.dk)[0] || {}).bookingKey === `insp-${D2.dk}-0`, (alive(D2.dk)[0] || {}).bookingKey);

  head('④ 古い日のカレンダー控え（custbk）が残らない');
  const custbk = await readKv(mp, STOR + 'custbk');
  t('元の日の控えが消えている', !Object.keys(custbk || {}).some(k => custbk[k] && String(custbk[k].dk) === D1.dk), custbk);
  const upd = await readKv(mp, STOR + 'cust-updates');
  t('顧客リストへ新しい日を知らせている', Array.isArray(upd) && upd.some(u => u && String(u.entryDate || '').indexOf(String(D2.dk.split('-')[0])) === 0 && u.name === CUST.name), upd);
  t('スマホ：JSエラーなし', merr.length === 0, merr.slice(0, 3));
  await mctx.close();

  // ════════ ⑤ PC：制限の説明は表の行の上では出さない ════════
  const seed2dk = D1.dk;
  seed['honten-schedRestrictions'] = { [seed2dk]: { ranges: [{ startTime: '09:00', endTime: '11:00' }], exemptWorks: ['B'] } };
  const pctx = await mkCtx(false);
  const pp = await pctx.newPage();
  const perr = []; pp.on('pageerror', e => perr.push(String(e)));
  pp.on('dialog', async d => { await d.accept().catch(() => {}); });
  await pp.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(pp, '江川京志', 20000); await clickText(pp, '江川京志'); await clickText(pp, 'でログイン');
  await seeText(pp, 'スケジュール', 20000);
  await clickText(pp, 'このまま使う');
  await pp.waitForTimeout(600);
  await pp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await pp.waitForTimeout(1200);
  // 制限を掛けた日へ移動（日付入力欄）
  await pp.evaluate(v => {
    const i = [...document.querySelectorAll('input[type=date]')].find(e => e.offsetParent !== null);
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, D1.input);
  await pp.waitForTimeout(1500);

  head('⑤ PC：制限の説明はバッジ1か所だけ');
  t('上に「入庫制限 09:00〜11:00」のバッジが出る', await seeText(pp, '入庫制限', 10000));
  const box = await pp.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(x => /^\s*09:30/.test(x.innerText) || /^\s*09:00/.test(x.innerText));
    if (!row) return null;
    const td = row.querySelector('td'); const b = (td || row).getBoundingClientRect();
    return { x: b.left + Math.min(20, b.width / 2), y: b.top + b.height / 2 };
  });
  t('制限されている行がある', !!box, box);
  await pp.mouse.move(box.x, box.y);
  await pp.waitForTimeout(500);
  t('★行の上をなぞっても説明は出ない', await pp.evaluate(() => ![...document.querySelectorAll('div')].some(e => /🚫 入庫制限/.test(e.innerText || '') && getComputedStyle(e).position === 'fixed')));
  const badge = await pp.evaluate(() => {
    // 「入庫制限 09:00〜11:00」と書かれた帯（設定ボタンではない方）
    const all = [...document.querySelectorAll('div,span')].filter(e => e.offsetParent !== null && /入庫制限/.test(e.innerText || '') && /09:00〜11:00/.test(e.innerText || ''));
    const inner = all.filter(e => !all.some(o => o !== e && e.contains(o)));
    const d = inner[0]; if (!d) return null;
    const b = d.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, txt: d.innerText.slice(0, 40) };
  });
  t('上のバッジが見つかる', !!badge, badge);
  await pp.mouse.move(badge.x, badge.y);
  await pp.waitForTimeout(500);
  t('★バッジの上では説明が出る', await pp.evaluate(() => [...document.querySelectorAll('div')].some(e => /この時間帯に入庫できる作業/.test(e.innerText || '') && getComputedStyle(e).position === 'fixed')));
  head('⑥ PC：日にち変更のカレンダー（2026-10-04 ユーザー報告）');
  // 今日の整備カードを開く
  await pp.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /辻井/.test(r.innerText)); if (tr) tr.click(); });
  await pp.waitForTimeout(800);
  t('整備の予約カードが開く', await seeText(pp, '予約カード', 6000));
  const openPicker = async () => {
    await pp.evaluate(() => { const s = [...document.querySelectorAll('span')].find(e => e.innerText && e.innerText.trim() === 'クリックで日付変更' && e.offsetParent !== null); if (s) s.click(); });
    await pp.waitForTimeout(500);
    return pp.evaluate(() => {
      const box = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
      if (!box) return null;
      const title = (box.innerText.match(/(\d+)年(\d+)月/) || []);
      const grid = [...box.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
      const circled = grid ? [...grid.children].filter(c => /rgb\(239, 68, 68\)/.test(getComputedStyle(c).borderColor) && getComputedStyle(c).borderRadius === '50%').map(c => c.innerText.trim()) : [];
      return { year: Number(title[1]), month: Number(title[2]), circled };
    });
  };
  const p1 = await openPicker();
  t('カレンダーが開く', !!p1, p1);
  t('★その予約の月が出る', !!p1 && p1.year === Number(D1.dk.split('-')[0]) && p1.month === Number(D1.dk.split('-')[1]), { picker: p1, card: D1.dk });
  t('★変更前の日付が赤まるで囲まれる', !!p1 && p1.circled.length === 1 && p1.circled[0] === String(Number(D1.dk.split('-')[2])), p1);
  // 同じ月の別の日へ動かす（今日の2日後。休業日なら翌日）
  const moveTo = await pp.evaluate(() => {
    const box = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
    const grid = [...box.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
    const today = new Date().getDate();
    const cell = [...grid.children].find(c => c.innerText.trim() === String(today + 2));
    if (!cell) return null;
    cell.click(); return today + 2;
  });
  t('別の日を選べる', !!moveTo, moveTo);
  await pp.waitForTimeout(600);
  await pp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await pp.waitForTimeout(2500);
  const sd = await pp.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-sched');
  const movedDk = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${moveTo}`;
  t('★その日へ移る', !!(sd && sd[movedDk] && Object.values(sd[movedDk]).some(r => r && r.name === '辻井')), sd && Object.keys(sd));
  t('★元の日からは消える', !(sd && sd[D1.dk] && Object.values(sd[D1.dk] || {}).some(r => r && r.name === '辻井')), sd && sd[D1.dk]);

  // 別の月の予約を開くと、その月のカレンダーが出る（前に開いた月を覚えたままにしない）
  await pp.evaluate(v => {
    const i = [...document.querySelectorAll('input[type=date]')].find(e => e.offsetParent !== null);
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, D2.input);
  await pp.waitForTimeout(1500);
  await pp.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => /来月の人/.test(r.innerText)); if (tr) tr.click(); });
  await pp.waitForTimeout(800);
  const p2 = await openPicker();
  t('★次に開いた予約では、その予約の月が出る', !!p2 && p2.year === Number(D2.dk.split('-')[0]) && p2.month === Number(D2.dk.split('-')[1]), { picker: p2, card: D2.dk });
  t('★そこでも変更前の日付が赤まる', !!p2 && p2.circled.length === 1 && p2.circled[0] === String(Number(D2.dk.split('-')[2])), p2);

  t('PC：JSエラーなし', perr.length === 0, perr.slice(0, 3));
  await pp.screenshot({ path: path.join(DIR, 'smoke-insp-move.png') });

  await pctx.close();
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + `結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
