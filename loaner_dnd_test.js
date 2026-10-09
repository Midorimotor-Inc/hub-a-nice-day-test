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
const TD = d(0), TDe = d(2);     // 本日はじまり（入庫時間で動かせるか決まる）
// 「まだ先の時刻」と「もう過ぎた時刻」を今の時刻から作る（検査を走らせる時刻に左右されないように）
const pad = n => String(n).padStart(2, '0');
// ★日をまたがせないこと（2026-10-09）。「1時間半後」が 0時を回ると、その時刻は“今日の過去”になり、
//   『入庫時間より前なら入れ替えできる』が夜（22:30以降）に必ず落ちていた。同じ日の中に収める。
const mkTime = (plusMin) => {
  const m0 = N.getHours() * 60 + N.getMinutes();
  let m = m0 + plusMin;
  if (m > 23 * 60 + 59) m = 23 * 60 + 59;   // 今日のいちばん遅い時刻で止める
  if (m < 0) m = 0;                          // 今日のいちばん早い時刻で止める
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
};
const T_SOON = mkTime(90);       // 1時間半後＝まだ入庫していない（深夜は 23:59 で止まる）
const T_PAST = mkTime(-90);      // 1時間半前＝もう入庫時間を過ぎた（早朝は 00:00 で止まる）

// 代車2台・レンタカー1台
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' },
              { id: 3, name: 'ワゴンR', num: '3503' }, { id: 4, name: 'アルト', num: '1188' }];
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
      [dk(TD)]: [
        { name: '河内　すみお', carType: 'ワゴンR', time: T_SOON, course: 2, store: 'honten', seq: 4, id: 4, loaner: 'ハスラー (7074)', loanerId: 1 },
        { name: '芝田　一郎', carType: 'アルト', time: T_PAST, course: 2, store: 'honten', seq: 5, id: 5, loaner: 'ハスラー (7074)', loanerId: 1 },
        { name: '両澤　花子', carType: 'ジムニー', time: '未定', course: 2, store: 'honten', seq: 6, id: 6, loaner: 'ハスラー (7074)', loanerId: 1 },
      ],
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
        r4: { id: 1004, user: '河内　すみお', fy: TD.y, fm: TD.m, fd: TD.d, ty: TDe.y, tm: TDe.m, td: TDe.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'insp-' + dk(TD) + '-0' },
        r5: { id: 1005, user: '芝田　一郎', fy: TD.y, fm: TD.m, fd: TD.d, ty: TDe.y, tm: TDe.m, td: TDe.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'insp-' + dk(TD) + '-1' },
      }, '2': {},
      '3': {
        r6: { id: 1006, user: '両澤　花子', fy: TD.y, fm: TD.m, fd: TD.d, ty: TDe.y, tm: TDe.m, td: TDe.d, carName: 'ワゴンR', carNum: '3503', bookingKey: 'insp-' + dk(TD) + '-2' },
      }, '4': {}
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
  const alerts = [];
  // ★確認（confirm）の返事を検査から切り替える。既定は「はい」
  let answerYes = true;
  page.on('dialog', d => { alerts.push(d.message()); answerYes ? d.accept() : d.dismiss(); });
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
  t('過去の予約は動かせない（理由を出す）',
    alerts.some(m => /過去の予約は入れ替えできません/.test(m)), alerts.slice(0, 2));
  const L2 = await lres();
  t('データも動いていない', !!(L2 && L2['1'] && Object.values(L2['1']).some(r => r.user === '大山　明')), Object.keys((L2 && L2['1']) || {}));

  alerts.length = 0;
  const c3 = await cellOf('桑田');
  if (c3) await drag(c3, (await rowY('スペーシア')));
  t('🔒限定の予約は動かせない（理由を出す）', alerts.some(m => /限定/.test(m)), alerts.slice(0, 2));
  const L3 = await lres();
  t('データも動いていない', !!(L3 && L3['1'] && Object.values(L3['1']).some(r => r.user === '桑田　陽子')), Object.keys((L3 && L3['1']) || {}));

  head('②-2 本日の予約は「入庫時間より前なら」入れ替えできる（2026-10-07 ユーザー指示）');
  alerts.length = 0;
  const cToday = await cellOf('河内');
  t('本日の帯が見つかる', !!cToday, cToday);
  if (cToday) await drag(cToday, (await rowY('スペーシア')));
  const L4 = await lres();
  t('★入庫時間より前なら入れ替えできる',
    !!(L4 && L4['2'] && Object.values(L4['2']).some(r => r.user === '河内　すみお')),
    { 止められた理由: alerts.slice(0, 1), スペーシア: Object.values((L4 && L4['2']) || {}).map(r => r.user) });
  t('止める理由は出ていない', alerts.length === 0, alerts.slice(0, 2));
  const I3 = await insp();
  const rowT = ((I3 || {})[dk(TD)] || [])[0] || {};
  t('★本日分でも予約カードの代車名が一緒に書き換わる', rowT.loaner === 'スペーシア (8967)', { loaner: rowT.loaner });

  alerts.length = 0;
  const cPast = await cellOf('芝田');
  t('入庫時間を過ぎた本日の帯が見つかる', !!cPast, cPast);
  if (cPast) await drag(cPast, (await rowY('スペーシア')));
  t('★入庫時間を過ぎていたら入れ替えできない（理由を出す）',
    alerts.some(m => /入庫時間/.test(m) && /過ぎている/.test(m)), alerts.slice(0, 2));
  const L5 = await lres();
  t('データも動いていない', !!(L5 && L5['1'] && Object.values(L5['1']).some(r => r.user === '芝田　一郎')),
    Object.values((L5 && L5['1']) || {}).map(r => r.user));

  head('②-3 本日・入庫時間が未定の分は「確認してから」入れ替えられる（2026-10-07 ユーザー指示）');
  // まず「いいえ」を選ぶ＝動かない
  alerts.length = 0; answerYes = false;
  const cUd = await cellOf('両澤');
  t('時間未定の帯が見つかる', !!cUd, cUd);
  if (cUd) await drag(cUd, (await rowY('アルト')));
  t('★確認がきちんと出る（代車を渡していないか聞く）',
    alerts.some(m => /入庫時間が未定/.test(m) && /お渡し/.test(m)), alerts.slice(0, 1));
  const L6 = await lres();
  t('★「いいえ」なら入れ替えない', !!(L6 && L6['3'] && Object.values(L6['3']).some(r => r.user === '両澤　花子')),
    { ワゴンR: Object.values((L6 && L6['3']) || {}).map(r => r.user) });

  // つぎに「はい」を選ぶ＝動く
  alerts.length = 0; answerYes = true;
  const cUd2 = await cellOf('両澤');
  if (cUd2) await drag(cUd2, (await rowY('アルト')));
  const L7 = await lres();
  t('★「はい」なら入れ替えられる', !!(L7 && L7['4'] && Object.values(L7['4']).some(r => r.user === '両澤　花子')),
    { アルト: Object.values((L7 && L7['4']) || {}).map(r => r.user) });
  const I4 = await insp();
  const rowU = ((I4 || {})[dk(TD)] || [])[2] || {};
  t('★予約カードの代車名も書き換わる', rowU.loaner === 'アルト (1188)', { loaner: rowU.loaner });

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

  head('⑥ ズレは本日以降だけ数える／任意で消せる（2026-10-07 ユーザー要望）');
  {
    // 片方だけ残った貸出（スケジュールに予約が無い帯）を、過去と本日以降にひとつずつ足す
    const PF = d(-30), PT = d(-25), NF = d(6), NT = d(8);
    const addBar = (key, rec) => page.evaluate(([k, kk, r]) => {
      const v = window.__fakeFb.get(k) || {};
      const next = { ...v, '4': { ...(v['4'] || {}), [kk]: r } };
      window.__fakeFb.set(k, next); window.__fakeFb.emit(k, next);
    }, [STOR + 'honten-lres', key, rec]);
    await addBar('rp', { id: 1099, user: '過去　太郎', fy: PF.y, fm: PF.m, fd: PF.d, ty: PT.y, tm: PT.m, td: PT.d,
      carName: 'ジムニー', carNum: '3504', bookingKey: 'insp-' + dk(PF) + '-9' });
    await page.waitForTimeout(1600);
    t('★返却が済んだ過去のズレは数えない', await seeText(page, 'スケジュールと一致', 6000),
      await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));
    await addBar('rn', { id: 1098, user: '未来　花子', fy: NF.y, fm: NF.m, fd: NF.d, ty: NT.y, tm: NT.m, td: NT.d,
      carName: 'ジムニー', carNum: '3504', bookingKey: 'insp-' + dk(NF) + '-9' });
    await page.waitForTimeout(1600);
    t('★本日以降のズレは数える', await seeText(page, 'スケジュールとズレ', 6000),
      await page.evaluate(() => (document.body.innerText.match(/スケジュール[^\n]*/g) || []).slice(0, 3)));
    t('数は本日以降の1件だけ', await page.evaluate(() => /スケジュールとズレ 1件/.test(document.body.innerText)),
      await page.evaluate(() => (document.body.innerText.match(/スケジュールとズレ[^\n]*/g) || [])[0]));
    await clickText(page, 'スケジュールとズレ');
    await page.waitForTimeout(800);
    t('片方だけ残っていると分かる', await seeText(page, 'スケジュールに予約が見つかりません', 5000));
    t('過去の分は件数だけ出す', await seeText(page, '過去の分', 5000));
    // 🗑 を押して「いいえ」→ 消えない
    alerts.length = 0; answerYes = false;
    const tapTrash = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('この貸出を消す') >= 0 && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
    t('🗑 消すボタンが出ている', await tapTrash());
    await page.waitForTimeout(1200);
    t('★消す前にもう一度たずねる', alerts.some(m => /消すと元に戻せません/.test(m)), alerts.slice(0, 2));
    const La = await lres();
    t('★「いいえ」なら消えない', !!(La && La['4'] && La['4'].rn), Object.keys((La || {})['4'] || {}));
    // 「はい」→ 消える
    alerts.length = 0; answerYes = true;
    await tapTrash();
    await page.waitForTimeout(3000);
    const Lb = await lres();
    t('★「はい」で消える', !(Lb && Lb['4'] && Lb['4'].rn), Object.keys((Lb || {})['4'] || {}));
    t('過去の分は消していない（貸出の履歴を守る）', !!(Lb && Lb['4'] && Lb['4'].rp));
  }

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
