// 代車のドラッグ入れ替えを「何度も続けて」やってもデータが壊れないかの検査（2026-10-14 ユーザー要望）
//   「入れ替えるとき何度も入れ替えるとバグが起きそうで心配」への答え。
//   本物のマウス操作で 10 回続けて入れ替え、毎回つぎを確かめる：
//     ・貸出の本数が increase/decrease しない（増えない・減らない・重複しない）
//     ・動かした帯が狙った車に乗り、車名も書き換わる
//     ・**予約カードの代車名が毎回ついてくる**
//     ・**スケジュールとのズレが最後まで 0 件のまま**
//   さらに「待たずに連続で入れ替える」（速い操作）と「↶ 戻す」も見る。
//   実行: node loaner_dnd_stress_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8347, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const d = (p) => { const x = new Date(now); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const F1 = d(5), T1 = d(6);     // 動かす本人（これから貸す＝動かせる）
const F2 = d(9), T2 = d(10);    // じゃまにならない別の予約
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' },
              { id: 3, name: 'ワゴンR', num: '3503' }, { id: 4, name: 'アルト', num: '1188' }];
const CARNAME = { 1: 'ハスラー (7074)', 2: 'スペーシア (8967)', 3: 'ワゴンR (3503)', 4: 'アルト (1188)' };

(async () => {
  const bk1 = 'insp-' + dk(F1) + '-0';
  const seed = {
    [STOR + 'insp']: {
      [dk(F1)]: [{ name: '周回　太郎', carType: 'アルト', no: '1234', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'ハスラー (7074)', loanerId: 1 }],
      [dk(F2)]: [{ name: '居座　花子', carType: 'ワゴンR', no: '5678', time: '10:00', course: 2, store: 'honten', seq: 2, id: 2, loaner: 'ワゴンR (3503)', loanerId: 3 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {
      '1': { r1: { id: 9001, user: '周回　太郎', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk1 } },
      '2': {}, '3': { r2: { id: 9002, user: '居座　花子', fy: F2.y, fm: F2.m, fd: F2.d, ty: T2.y, tm: T2.m, td: T2.d, carName: 'ワゴンR', carNum: '3503', bookingKey: 'insp-' + dk(F2) + '-0' } }, '4': {}
    },
    [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 160)); });
  page.on('dialog', async dd => { await dd.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(800);
  await clickText(page, '代車管理'); await page.waitForTimeout(2200);

  const lres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-lres');
  const insp = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'insp');
  const badge = () => page.evaluate(() => (document.body.innerText.match(/スケジュール(と一致|とズレ[^\n]*)/) || [''])[0]);
  const cellOf = (user) => page.evaluate(u => {
    const rows = [...document.querySelectorAll('tr')];
    for (const tr of rows) {
      const tds = [...tr.querySelectorAll('td')];
      const hit = tds.find(td => (td.innerText || '').indexOf(u) >= 0 && td.getBoundingClientRect().width > 0);
      if (hit) { const r = hit.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }
    }
    return null;
  }, user);
  const rowY = (carName) => page.evaluate(n => {
    const tr = [...document.querySelectorAll('tr')].find(x => (x.firstElementChild && (x.firstElementChild.innerText || '').indexOf(n) >= 0));
    if (!tr) return null;
    const r = tr.getBoundingClientRect();
    return Math.round(r.y + r.height / 2);
  }, carName);
  const dragTo = async (user, carName, wait) => {
    const from = await cellOf(user); const toY = await rowY(carName);
    if (!from || toY == null) return false;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 12, { steps: 3 });
    await page.mouse.move(from.x, toY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(wait == null ? 2200 : wait);
    return true;
  };
  // 貸出の全体像（本数・重複・どの車に誰が）
  const snapshot = async () => {
    const L = (await lres()) || {};
    const all = [];
    Object.keys(L).forEach(cid => Object.values(L[cid] || {}).forEach(r => { if (r) all.push({ car: cid, id: r.id, user: r.user, name: r.carName, num: r.carNum, bk: r.bookingKey }); }));
    const ids = all.map(x => x.id);
    return { n: all.length, dup: ids.length !== new Set(ids).size, all };
  };

  head('① 同じ帯を10回続けて入れ替える');
  const base = await snapshot();
  t('はじめの貸出は2本', base.n === 2, base.all);
  t('はじめは「一致」', await seeText(page, 'スケジュールと一致', 8000), await badge());
  const order = [2, 4, 1, 2, 3, 1, 4, 2, 1, 4];   // 行き先の車ID（3は別の人が居るが期間が違うので空いている）
  let okAll = true, lastBad = null;
  for (let i = 0; i < order.length; i++) {
    const to = order[i];
    const moved = await dragTo('周回　太郎', CARS.find(c => c.id === to).name);
    const s = await snapshot();
    const me = s.all.find(x => x.user === '周回　太郎');
    const I = await insp();
    const row = ((I || {})[dk(F1)] || [])[0] || {};
    const good = moved && s.n === 2 && !s.dup && me && String(me.car) === String(to)
      && me.name === CARS.find(c => c.id === to).name && me.num === CARS.find(c => c.id === to).num
      && row.loaner === CARNAME[to] && Number(row.loanerId) === to;
    if (!good) { okAll = false; lastBad = { 回: i + 1, 行き先: to, 本数: s.n, 重複: s.dup, 帯: me, カード: { loaner: row.loaner, loanerId: row.loanerId } }; break; }
  }
  t('★10回続けて入れ替えても、毎回ただしく移る（本数・車名・カードの代車名）', okAll, lastBad);
  const after = await snapshot();
  t('貸出の本数は増えも減りもしない（2本のまま）', after.n === 2, after.all);
  t('同じ貸出が2つに増えていない', !after.dup, after.all);
  t('巻き添えなし：別の人（居座　花子）はワゴンRのまま',
    !!after.all.find(x => x.user === '居座　花子' && String(x.car) === '3' && x.name === 'ワゴンR'), after.all);
  t('★10回のあとも「一致」のまま', await seeText(page, 'スケジュールと一致', 8000), await badge());

  head('② 待たずに続けて入れ替える（速い操作）');
  for (const to of [2, 3, 1]) await dragTo('周回　太郎', CARS.find(c => c.id === to).name, 250);
  await page.waitForTimeout(3500);
  const fast = await snapshot();
  const fastMe = fast.all.find(x => x.user === '周回　太郎');
  const I2 = await insp();
  const row2 = ((I2 || {})[dk(F1)] || [])[0] || {};
  t('速く続けても貸出は2本のまま', fast.n === 2 && !fast.dup, fast.all);
  t('★速く続けても、帯と予約カードの代車名が食い違わない',
    !!fastMe && row2.loaner === (CARS.find(c => String(c.id) === String(fastMe.car)) ? (CARS.find(c => String(c.id) === String(fastMe.car)).name + ' (' + CARS.find(c => String(c.id) === String(fastMe.car)).num + ')') : ''),
    { 帯: fastMe, カード: row2.loaner });
  t('★速く続けたあとも「一致」', await seeText(page, 'スケジュールと一致', 8000), await badge());

  head('③ ↶ 戻す');
  const beforeUndo = await snapshot();
  const undoOk = await clickText(page, '戻す');
  await page.waitForTimeout(2500);
  const undone = await snapshot();
  t('「↶ 戻す」が押せる', undoOk);
  t('戻しても貸出は2本のまま', undone.n === 2 && !undone.dup, undone.all);
  t('1つ前の車に戻る', JSON.stringify(undone.all.find(x => x.user === '周回　太郎')) !== JSON.stringify(beforeUndo.all.find(x => x.user === '周回　太郎')),
    { 前: beforeUndo.all.find(x => x.user === '周回　太郎'), 後: undone.all.find(x => x.user === '周回　太郎') });

  head('④ 後片付け');
  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
