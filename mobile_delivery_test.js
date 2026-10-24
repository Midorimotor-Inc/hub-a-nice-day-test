// スマホ：納車はタイムスケジュールの【納車時間の枠の中】に出す（v3.71・2026-10-24 ユーザー指示）
//   報告「スマホの納車表示がタイムスケジュールの一番上に来るので、タイムスケジュールの時間に表示してほしい」
//   ① 上にまとめて出す緑の箱はもう無い
//   ② 納車は納車時間の枠の中に出る（14:00 の納車は 14:00 の行）
//   ③ 納車時間が「未定」の分は「未定」の枠
//   ④ 整備が無くても納車がある枠は「空き」の見た目にしない
//   ⑤ タップすると元の予約（別の日の車検・整備）が開く
//   ⑥ 納車日の備考・入庫時の備考（スイッチが入っている時だけ）も出る
//   ⑦ 事前入庫の箱は今までどおり上に残す（今回の指示の対象外）
//   実行: node mobile_delivery_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8363, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'mobile.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const DK = `${Y}-${M + 1}-${D}`;                 // 今日＝納車日
const pad = n => String(n).padStart(2, '0');
const prev = new Date(Y, M, D - 3);
const PDK = `${prev.getFullYear()}-${prev.getMonth() + 1}-${prev.getDate()}`;   // 3日前＝入庫（車検・整備）の日

(async () => {
  const seed = {
    // 3日前の車検2件：1件は 14:00 納車、1件は 納車時間未定
    [STOR + 'insp']: {
      [PDK]: [
        { name: '納車太郎', carType: 'シエンタ', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00',
          bookingStatus: 'confirmed', deliveryDate: DK, deliveryTime: '14:00', deliveryNote: '洗車してから', note: '入庫時のメモ', noteToDelivery: true },
        { name: '未定花子', carType: 'ワゴンR', no: '1609', course: 2, store: 'honten', seq: 2, time: '10:00',
          bookingStatus: 'confirmed', deliveryDate: DK, deliveryTime: '未定' },
        // 三田店の納車は本店の画面に出さない
        { name: '三田三郎', carType: 'タント', no: '7777', course: 2, store: 'sanda', seq: 3, time: '11:00',
          bookingStatus: 'confirmed', deliveryDate: DK, deliveryTime: '14:00' },
      ],
      [DK]: [],
    },
    // 3日前の整備1件：16:30 納車
    [STOR + 'honten-sched']: {
      [PDK]: { '13:00': { id: 31, name: '整備次郎', carType: 'ジムニー', work: 'Q', content: '', deliveryDate: DK, deliveryTime: '16:30' } },
      [DK]: { '09:00': { id: 41, name: '当日整備', carType: 'アルト', work: 'Q', content: '' } },
    },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
    [STOR + 'honten-cdow-v2']: [], [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [], [STOR + 'sanda-cdow']: [],
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
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 25000);
  // 下タブ「予定」へ（スマホの下タブは button ではなく div）
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => /^(⏰ )?スケジュール$/.test(e.innerText.trim()) && e.offsetParent !== null);
    const target = d.length ? d[d.length - 1].parentElement : null;
    if (target) target.click();
  });
  await page.waitForTimeout(1800);
  await seeText(page, 'タイムスケジュール', 12000);

  // 枠ごとの中身を読む
  const slots = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('[data-mslot]').forEach(el => { o[el.getAttribute('data-mslot')] = el.innerText.replace(/\s+/g, ' ').trim(); });
    return o;
  });
  const dlInfo = await page.evaluate(() => [...document.querySelectorAll('[data-mdl]')].map(e => {
    const row = e.closest('[data-mslot]');
    return { slot: row ? row.getAttribute('data-mslot') : null, txt: e.innerText.replace(/\s+/g, ' ').trim() };
  }));

  console.log('\n■ ① 上にまとめて出す緑の箱はもう無い');
  const box = await page.evaluate(() => {
    // 「🏁 納車（N件）」の見出しを持つ箱（以前の出し方）
    return [...document.querySelectorAll('div')].some(e => /^🏁 納車（\d+件）$/.test(e.innerText.trim()));
  });
  t('★「🏁 納車（N件）」のまとめ箱が無い', !box);
  t('納車そのものは画面に出ている', dlInfo.length > 0, dlInfo);

  console.log('\n■ ② 納車時間の枠の中に出る');
  const at = (slot) => dlInfo.filter(d => d.slot === slot);
  t('★14:00 の納車は 14:00 の枠に出る', at('14:00').some(d => /納車太郎/.test(d.txt)), { at14: at('14:00'), slots1400: slots['14:00'] });
  t('★16:30 の納車（整備から）は 16:30 の枠に出る', at('16:30').some(d => /整備次郎/.test(d.txt)), { at1630: at('16:30') });
  t('★納車時間が未定の分は「未定」の枠', at('未定').some(d => /未定花子/.test(d.txt)), { atMitei: at('未定') });
  t('★ちがう枠には出ない（09:00 に納車太郎はいない）', !/納車太郎/.test(slots['09:00'] || ''), slots['09:00']);
  t('★他店（三田店）の納車は出さない', !dlInfo.some(d => /三田三郎/.test(d.txt)), dlInfo);

  console.log('\n■ ③ 見た目と中身');
  t('★納車の行に「🏁 納車」の札が付く', at('14:00').some(d => /🏁 納車/.test(d.txt)), at('14:00'));
  t('車種も出る', at('14:00').some(d => /シエンタ/.test(d.txt)), at('14:00'));
  t('★どの予約から来たか分かる（3日前の車検）', at('14:00').some(d => /車検/.test(d.txt)), at('14:00'));
  t('★納車日の備考が出る', at('14:00').some(d => /洗車してから/.test(d.txt)), at('14:00'));
  t('★入庫時の備考もスイッチが入っていれば出る', at('14:00').some(d => /入庫時のメモ/.test(d.txt)), at('14:00'));
  const look = await page.evaluate(() => {
    const row = document.querySelector('[data-mslot="14:00"]');
    const empty = document.querySelector('[data-mslot="11:00"]');
    return { dl: row ? getComputedStyle(row).backgroundColor : '', empty: empty ? getComputedStyle(empty).backgroundColor : '' };
  });
  t('★整備が無くても納車がある枠は「空き」の見た目にしない', !!look.dl && look.dl !== look.empty, look);

  console.log('\n■ ④ タップすると元の予約が開く');
  await page.evaluate(() => { const e = document.querySelector('[data-mslot="14:00"] [data-mdl]'); if (e) e.click(); });
  await page.waitForTimeout(1200);
  const opened = await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find(x => x.value === '納車太郎');
    return { found: !!i, body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) };
  });
  t('★納車の行をタップすると、その人の予約カードが開く', opened.found, opened);

  console.log('\n■ ⑤ 事前入庫の箱は今までどおり');
  t('事前入庫のまとめ箱のコードは残してある', /🚗 事前入庫（/.test(fs.readFileSync(path.join(DIR, SRC), 'utf8')));

  // 見た目を目で見たい時： SHOT=<保存先.png> node mobile_delivery_test.js
  if (process.env.SHOT) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /閉じる|キャンセル|✕/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); }); await page.waitForTimeout(600); await page.evaluate(() => { const r = document.querySelector('[data-mslot="13:00"]'); if (r) r.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
  // ── ⑥ カレンダーの日のカードに「前の日／次の日」（2026-10-24 ユーザー要望）──
  console.log(String.fromCharCode(10) + '■ ⑥ カレンダーの日のカードに前後送り');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /閉じる|キャンセル|✕/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => /^(📅 )?カレンダー$/.test(e.innerText.trim()) && e.offsetParent !== null);
    const target = d.length ? d[d.length - 1].parentElement : null;
    if (target) target.click();
  });
  await page.waitForTimeout(1200);
  // 今日の日を押して日のカードを開く
  await page.evaluate(d => {
    const cells = [...document.querySelectorAll('div')].filter(e => e.onclick && e.innerText.trim().split(String.fromCharCode(10))[0] === String(d));
    if (cells.length) cells[0].click();
  }, D);
  await page.waitForTimeout(1000);
  const head = () => page.evaluate(() => {
    const b = document.querySelector('[data-daynav]');
    const card = b ? b.parentElement : null;
    return { has: !!b, txt: card ? card.innerText.replace(/s+/g, ' ').trim() : '' };
  });
  const h0 = await head();
  t('★日のカードに前後送りのボタンが出る', h0.has, h0);
  t('いま見ている日が出ている', new RegExp((M + 1) + '月' + D + '日').test(h0.txt), h0);
  const size = await page.evaluate(() => { const b = document.querySelector('[data-daynav="1"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  t('★指で押せる大きさ（40px以上）', !!size && size.w >= 40 && size.h >= 40, size);
  await page.evaluate(() => { const b = document.querySelector('[data-daynav="1"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  const h1 = await head();
  t('★「›」で次の日になる', h1.has && !new RegExp((M + 1) + '月' + D + '日').test(h1.txt), h1);
  await page.evaluate(() => { const b = document.querySelector('[data-daynav="-1"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  const h2 = await head();
  t('★「‹」で元の日に戻る', new RegExp((M + 1) + '月' + D + '日').test(h2.txt), h2);
  t('★送ってもカードは閉じない', h2.has, h2);

  // 日のカードの見た目： SHOT2=<保存先.png> node mobile_delivery_test.js
  if (process.env.SHOT2) { await page.screenshot({ path: process.env.SHOT2 }); }
  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));
  console.log('\n──────── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────────');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
