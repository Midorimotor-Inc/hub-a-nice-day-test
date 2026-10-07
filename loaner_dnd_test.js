// 代車管理：帯をドラッグして車を入れ替える／スケジュールとのズレ チェック（2026-10-07 ユーザー要望）
//   ① 入れ替えると lres が移り、**予約カードの代車名も一緒に書き換わる**
//   ② 🔒限定・貸出が始まっている（開始日が今日以前）・過去 は動かせない
//   ③ ふさがっている車へは落とせない
//   ④ 代車 ⇄ レンタカー はまたがない
//   ⑤ スケジュールとのズレを見つけて「直す」で直せる
//   ⑥ 自動最適化は廃止されている
//   実行: node loaner_dnd_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8315, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

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
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

// 日付：未来（動かせる）と 過去／今日（動かせない）を作る
const N = new Date();
const d = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const F1 = d(5), T1 = d(7);      // これから貸す（動かせる）
const F2 = d(-2), T2 = d(1);     // もう貸出中（動かせない）
const F3 = d(9), T3 = d(11);     // これから貸す・限定（動かせない）

// 代車2台・レンタカー1台
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];

(async () => {
  const bk1 = 'insp-' + dk(F1) + '-0';
  const bk2 = 'insp-' + dk(F2) + '-0';
  const bk3 = 'insp-' + dk(F3) + '-0';
  const seed = {
    [STOR + 'insp']: {
      [dk(F1)]: [{ name: '辻井　博', carType: 'アルト', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'ハスラー (7074)', loanerId: 1 }],
      [dk(F2)]: [{ name: '大山　明', carType: 'ワゴンR', time: '09:00', course: 2, store: 'honten', seq: 2, id: 2, loaner: 'ハスラー (7074)', loanerId: 1 }],
      [dk(F3)]: [{ name: '桑田　陽子', carType: 'スペーシア', time: '09:00', course: 2, store: 'honten', seq: 3, id: 3, loaner: 'ハスラー (7074)', loanerId: 1 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [],
    [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': {
        r1: { id: 1001, user: '辻井　博', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk1 },
        r2: { id: 1002, user: '大山　明', fy: F2.y, fm: F2.m, fd: F2.d, ty: T2.y, tm: T2.m, td: T2.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk2 },
        r3: { id: 1003, user: '桑田　陽子', fy: F3.y, fm: F3.m, fd: F3.d, ty: T3.y, tm: T3.m, td: T3.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk3, locked: true },
      }, '2': {}
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(700);
  // 代車管理へ
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, '代車管理', 8000));

  head('⑥ 自動最適化は廃止されている');
  t('「最適化」ボタンが無い', await page.evaluate(() => document.body.innerText.indexOf('最適化') < 0));
  t('日付の見出しに「基準」が無い', await page.evaluate(() => document.body.innerText.indexOf('基準 ') < 0));

  // 帯のセルを掴む道具（氏名の帯が乗っているセルを car 行から探す）
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
    const tr = [...document.querySelectorAll('tr')].find(x => (x.innerText || '').indexOf(n) === 0 || (x.firstElementChild && (x.firstElementChild.innerText || '').indexOf(n) >= 0));
    if (!tr) return null;
    const r = tr.getBoundingClientRect();
    return Math.round(r.y + r.height / 2);
  }, carName);
  const drag = async (from, toY) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 12, { steps: 3 });
    await page.mouse.move(from.x, toY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(2200);
  };
  const lres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-lres');
  const insp = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'insp');

  head('① これから貸す予約をドラッグして入れ替える');
  const c1 = await cellOf('辻井');
  const y2 = await rowY('スペーシア');
  t('帯のセルが見つかる', !!c1 && !!y2, { c1, y2 });
  await drag(c1, y2);
  const L1 = await lres();
  t('★ハスラーから外れる', !(L1 && L1['1'] && L1['1'].r1), Object.keys((L1 && L1['1']) || {}));
  t('★スペーシアに移る', !!(L1 && L1['2'] && Object.values(L1['2']).some(r => r.user === '辻井　博')), Object.keys((L1 && L1['2']) || {}));
  t('★移った先の車名が書き換わる', !!(L1 && L1['2'] && Object.values(L1['2']).some(r => r.carName === 'スペーシア' && r.carNum === '8967')),
    L1 && L1['2'] && Object.values(L1['2'])[0]);
  const I1 = await insp();
  const row1 = ((I1 || {})[dk(F1)] || [])[0] || {};
  t('★予約カードの代車名も一緒に書き換わる（スケジュールとズレない）', row1.loaner === 'スペーシア (8967)' && Number(row1.loanerId) === 2,
    { loaner: row1.loaner, loanerId: row1.loanerId });

  head('② 動かせないもの');
  alerts.length = 0;
  const c2 = await cellOf('大山');
  const y1 = await rowY('ハスラー');
  if (c2) await drag(c2, (await rowY('スペーシア')));
  t('もう貸出が始まっている予約は動かせない（理由を出す）',
    alerts.some(m => /貸出が始まっている|過去/.test(m)), alerts.slice(0, 2));
  const L2 = await lres();
  t('データも動いていない', !!(L2 && L2['1'] && Object.values(L2['1']).some(r => r.user === '大山　明')), Object.keys((L2 && L2['1']) || {}));

  alerts.length = 0;
  const c3 = await cellOf('桑田');
  if (c3) await drag(c3, (await rowY('スペーシア')));
  t('🔒限定の予約は動かせない（理由を出す）', alerts.some(m => /限定/.test(m)), alerts.slice(0, 2));
  const L3 = await lres();
  t('データも動いていない', !!(L3 && L3['1'] && Object.values(L3['1']).some(r => r.user === '桑田　陽子')), Object.keys((L3 && L3['1']) || {}));

  head('⑤ スケジュールとのズレ チェック');
  t('「一致」のボタンが出ている', await seeText(page, 'スケジュールと一致', 6000),
    await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));
  // わざとズレを作る（予約カードの代車名だけ古い名前に戻す）
  await page.evaluate(([k, d]) => {
    const v = window.__fakeFb.get(k) || {};
    const rows = [...(v[d] || [])];
    rows[0] = { ...rows[0], loaner: 'ハスラー (7074)', loanerId: 1 };
    window.__fakeFb.set(k, { ...v, [d]: rows });
    window.__fakeFb.emit(k, { ...v, [d]: rows });
  }, [STOR + 'insp', dk(F1)]);
  await page.waitForTimeout(1500);
  t('★ズレを見つけて赤く知らせる', await seeText(page, 'スケジュールとズレ', 6000),
    await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));
  await clickText(page, 'スケジュールとズレ');
  await page.waitForTimeout(700);
  t('一覧に中身が出る（予約カード → 代車管理）', await seeText(page, '予約カードの代車名が代車管理と違います', 5000));
  t('どちらが正しいか分かるように両方出す',
    await page.evaluate(() => /ハスラー \(7074\)/.test(document.body.innerText) && /スペーシア \(8967\)/.test(document.body.innerText)));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('直す') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2500);
  const I2 = await insp();
  const row2 = ((I2 || {})[dk(F1)] || [])[0] || {};
  t('★「直す」で予約カードが代車管理に合う', row2.loaner === 'スペーシア (8967)' && Number(row2.loanerId) === 2,
    { loaner: row2.loaner, loanerId: row2.loanerId });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '閉じる' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1200);
  t('直したあとは「一致」に戻る', await seeText(page, 'スケジュールと一致', 6000),
    await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));

  head('④ 代車 ⇄ レンタカーはまたがない（作りの確認）');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('入れ替えは同じ表の中だけ（kind が違えば受け付けない）', SRC.indexOf("if(!mvDrag||mvDrag.kind!==kind)return;") > 0);
  t('代車の表は loaner、レンタカーの表は rental で動かす',
    SRC.indexOf("mvDown('loaner'") > 0 && SRC.indexOf("mvDown('rental'") > 0);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
