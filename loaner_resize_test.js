// 代車管理：帯の端をつかんで横に引っぱると、貸出期間が変わること（2026-10-30 ユーザー要望）
//   それまでは【代車管理の編集モーダルを開く】か【予約カードで一度消して取り直す】しかなかった。
//   ① 右の端＝返却日。右へ引っぱると のび、左へ引っぱると 縮む
//   ② ★もう貸し出しが始まっている予約でも、返却日は変えられる（延長は日常的に起きる）
//   ③ 左の端＝貸出日。まだ始まっていない予約だけ。始まっていたら断る
//   ④ ほかの予約と重なる所までは伸ばせない（何も書き込まない）
//   ⑤ 1日より短くはならない
//   ⑥ 伸ばしたあと、予約の中身（氏名・bookingKey・限定）は消えない
//   ⑦ レンタカーの表でも同じことができる
//   実行: node loaner_resize_test.js
//        SHOT=<保存先.png> node loaner_resize_test.js  … その時の見た目を撮る
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8407, STOR = 'hub-v8-dev-';
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

const N = new Date();
const d = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const num = (o) => o.y * 10000 + (o.m + 1) * 100 + o.d;

// 「これから貸す」辻井さん：+5 〜 +7。右に +10 まで空きがある（+11 から別の予約）
const F1 = d(5), T1 = d(7);
// 同じ車の次の予約（+11 〜 +12）。ここより先へは伸ばせない
const F9 = d(11), T9 = d(12);
// 「もう貸出中」の大山さん：-2 〜 +1（別の車）。返却日は変えられるが、貸出日は動かせない
const F2 = d(-2), T2 = d(1);
// レンタカー：+5 〜 +6
const FR = d(5), TR = d(6);

const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];

(async () => {
  const bk1 = 'insp-' + dk(F1) + '-0';
  const seed = {
    [STOR + 'insp']: {
      [dk(F1)]: [{ name: '辻井　博', carType: 'アルト', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'ハスラー (7074)', loanerId: 1 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [],
    [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': {
        r1: { id: 1001, user: '辻井　博', fy: F1.y, fm: F1.m, fd: F1.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074', bookingKey: bk1, locked: true },
        r8: { id: 1008, user: '藤明建設工業株式会社', fy: F9.y, fm: F9.m, fd: F9.d + 3, ty: T9.y, tm: T9.m, td: T9.d + 3, carName: 'ハスラー', carNum: '7074' },
        r9: { id: 1009, user: '先約　さん', fy: F9.y, fm: F9.m, fd: F9.d, ty: T9.y, tm: T9.m, td: T9.d, carName: 'ハスラー', carNum: '7074' },
      },
      '2': {
        r2: { id: 1002, user: '大山　明', fy: F2.y, fm: F2.m, fd: F2.d, ty: T2.y, tm: T2.m, td: T2.d, carName: 'スペーシア', carNum: '8967' },
      },
    },
    [STOR + 'sanda-lres']: {},
    [STOR + 'rres']: {
      '101': { q1: { id: 2001, user: '貸出　太郎', fy: FR.y, fm: FR.m, fd: FR.d, ty: TR.y, tm: TR.m, td: TR.d, carName: 'ノマド', carNum: '3101' } },
    },
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
  page.on('dialog', d => { alerts.push(d.message()); d.accept(); });

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, '代車管理', 8000));

  // ── 道具 ──────────────────────────────────────────
  // つかむ所（帯の端）の真ん中の座標
  const gripAt = (resId, side) => page.evaluate(([id, sd]) => {
    const g = document.querySelector('[data-rsgrip="' + sd + '"][data-rsres="' + id + '"]');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, [resId, side]);
  // その車の行の「この日」のセルの真ん中の座標（日付の見出しの位置から探す）
  const dayX = (dnum) => page.evaluate(n => {
    const th = [...document.querySelectorAll('th')].find(e => e.getAttribute('data-ldaynum') === String(n));
    if (!th) return null;
    const r = th.getBoundingClientRect();
    return Math.round(r.x + r.width / 2);
  }, dnum);
  // ★レンタカーの表は 2026-11-02 から横の初期位置が代車の表と違う（本日が右から7列目）。
  //   代車の見出しの x をそのまま使うと別の日をつかむので、レンタカーの見出し（data-rdaynum）から取ること。
  const rDayX = (dnum) => page.evaluate(n => {
    const th = [...document.querySelectorAll('th')].find(e => e.getAttribute('data-rdaynum') === String(n));
    if (!th) return null;
    const r = th.getBoundingClientRect();
    return Math.round(r.x + r.width / 2);
  }, dnum);
  const pull = async (from, toX) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + (toX > from.x ? 6 : -6), from.y, { steps: 2 });
    await page.mouse.move(toX, from.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(2200);
  };
  const lres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'honten-lres');
  const rres = () => page.evaluate(k => window.__fakeFb.get(k), STOR + 'rres');
  const recOf = (obj, car, id) => Object.values((obj && obj[car]) || {}).find(r => r && r.id === id);
  const endNum = r => r ? (r.ty * 10000 + (r.tm + 1) * 100 + r.td) : null;
  const startNum = r => r ? (r.fy * 10000 + (r.fm + 1) * 100 + r.fd) : null;

  head('① つかむ所がある');
  const g1 = await gripAt(1001, 'end');
  const g1s = await gripAt(1001, 'start');
  t('★返却日の端（右）につかむ所がある', !!g1, g1);
  t('★貸出日の端（左）にもつかむ所がある', !!g1s, g1s);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  t('★つかむ所は ew-resize のカーソル', await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-rsgrip="end"]')).cursor === 'ew-resize'));

  head('② 右へ引っぱると返却日がのびる');
  const x10 = await dayX(num(d(10)));
  t('＋10日の列が見つかる（検査の前提）', x10 != null, x10);
  await pull(g1, x10);
  let r1 = recOf(await lres(), '1', 1001);
  t('★返却日が ＋10日 になった', endNum(r1) === num(d(10)), { now: endNum(r1), want: num(d(10)) });
  t('★貸出日は動いていない', startNum(r1) === num(F1), { now: startNum(r1), want: num(F1) });
  t('★氏名は消えていない', !!r1 && r1.user === '辻井　博', r1 && r1.user);
  t('★予約とのつながり（bookingKey）も残っている', !!r1 && r1.bookingKey === bk1, r1 && r1.bookingKey);
  t('★🔒限定の印も残っている', !!r1 && r1.locked === true, r1 && r1.locked);

  head('③ 左へ引っぱると縮む');
  const g2 = await gripAt(1001, 'end');
  const x8 = await dayX(num(d(8)));
  t('引っぱり直せる（つかむ所が ＋10日に移っている）', !!g2, g2);
  await pull(g2, x8);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日が ＋8日 に縮んだ', endNum(r1) === num(d(8)), { now: endNum(r1), want: num(d(8)) });

  head('④ ★ほかの予約と重なる所までは伸ばせない');
  alerts.length = 0;
  const g3 = await gripAt(1001, 'end');
  const x12 = await dayX(num(d(12)));          // ＋11〜＋12 は先約さん
  await pull(g3, x12);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日は変わっていない（＋8日のまま）', endNum(r1) === num(d(8)), { now: endNum(r1) });
  t('★「重なります」と知らせる', alerts.some(a => /重なり/.test(a)), alerts);
  t('★先約さんの予約は壊していない', endNum(recOf(await lres(), '1', 1009)) === num(T9));

  head('⑤ ★1日より短くはならない');
  const g4 = await gripAt(1001, 'end');
  const x3 = await dayX(num(d(3)));            // 貸出日（＋5）より前へ引っぱる
  await pull(g4, x3);
  r1 = recOf(await lres(), '1', 1001);
  t('★返却日は貸出日より前にならない', endNum(r1) >= startNum(r1), { s: startNum(r1), e: endNum(r1) });
  t('★貸出日はそのまま', startNum(r1) === num(F1), startNum(r1));

  head('⑥ 貸出日（左の端）も動かせる');
  const g5 = await gripAt(1001, 'start');
  const x4 = await dayX(num(d(4)));
  await pull(g5, x4);
  r1 = recOf(await lres(), '1', 1001);
  t('★貸出日が ＋4日 になった', startNum(r1) === num(d(4)), { now: startNum(r1), want: num(d(4)) });

  head('⑦ ★もう貸出中の予約：返却日は変えられる／貸出日は動かせない');
  // 大山さん（スペーシア・-2 〜 +1）
  const g6 = await gripAt(1002, 'end');
  const x3b = await dayX(num(d(3)));
  t('貸出中の予約にもつかむ所がある', !!g6, g6);
  await pull(g6, x3b);
  let r2 = recOf(await lres(), '2', 1002);
  t('★★貸出中でも返却日はのばせる（＋3日）', endNum(r2) === num(d(3)), { now: endNum(r2), want: num(d(3)) });
  alerts.length = 0;
  const g7 = await gripAt(1002, 'start');
  const x0 = await dayX(num(d(0)));
  await pull(g7, x0);
  r2 = recOf(await lres(), '2', 1002);
  t('★貸出日は動かない', startNum(r2) === num(F2), { now: startNum(r2), want: num(F2) });
  t('★「もう貸し出しが始まっている」と知らせる', alerts.some(a => /始まって/.test(a)), alerts);

  head('⑧ レンタカーの表でも同じようにできる');
  // ★レンタカーの表は【本日が右から7列目】に置いてある（2026-11-02 ユーザー指示）ので、
  //   +8 日はまだ画面の外にある。表の外にある日をつかもうとしても引っぱれないので、
  //   先に本日が左から4列目に来るまで横に送ってから引っぱること（2026-11-12 に直した）。
  await page.evaluate(n => {
    const th = [...document.querySelectorAll('th[data-rdaynum]')];
    const me = th.find(e => e.getAttribute('data-rdaynum') === String(n));
    if (!me) return;
    const sc = th[0].closest('table').parentElement;
    sc.scrollLeft = Math.max(0, (th.indexOf(me) - 3) * 44);
  }, num(d(0)));
  await page.waitForTimeout(400);
  const g8 = await gripAt(2001, 'end');
  const x8r = await rDayX(num(d(8)));
  t('レンタカーの帯にもつかむ所がある', !!g8, g8);
  await pull(g8, x8r);
  const q1 = recOf(await rres(), '101', 2001);
  t('★レンタカーの返却日も変えられる', endNum(q1) === num(d(8)), { now: endNum(q1), want: num(d(8)) });
  t('★氏名は消えていない', !!q1 && q1.user === '貸出　太郎', q1 && q1.user);

  head('⑨ 伸ばした直後に中身のパネルを出さない');
  t('★「✎ 編集」のパネルが開いていない', await page.evaluate(() => document.body.innerText.indexOf('✎ 編集') < 0));

  head('⑩ ★お名前が「つかむ所」の白い棒に重ならない（2026-11-02 現場報告）');
  // v3.86.0 でつかむ所を付けた時、白い棒がお名前の1文字目の上に重なり、字が線で消されて見えていた。
  const over = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('[data-rsgrip="start"]').forEach(g => {
      const td = g.parentElement;
      const nm = [...td.querySelectorAll('div')].find(x => {
        const s = getComputedStyle(x);
        return s.position === 'absolute' && s.color === 'rgb(255, 255, 255)' && x.innerText.trim();
      });
      if (!nm) return;
      const a = g.getBoundingClientRect(), b = nm.getBoundingClientRect();
      if (b.x < a.right - 0.5) bad.push({ t: nm.innerText.trim(), name: Math.round(b.x), grip: Math.round(a.right) });
    });
    return bad;
  });
  // ★2026-11-14：白い棒は帯のいちばん端へ寄せた。つかむ所（当たり判定8px）の中に
  //   お名前が入るのが正しい形になったので、見張りは ⑨ の「白い棒に重ならない」に移した。

  head('⑪ ★レンタカーの表は本日を右寄りに出す（2026-11-02 ユーザー指示）');
  // 「レンタカーは何を出しているかを見たいので過去を見ることが多い」＝左に過去を広く出す。
  // 代車の表はこれまでどおり（本日が左から4列目）。2つの表で置き方が違う。
  // ★ここで見たいのは【開いた時の置き場所】。上の検査で帯を引っぱっており、その時の
  //   「端に近づいたら横に送る」で表が横にずれているので、必ず開き直してから測ること
  //   （開き直さないと、ずれた位置を測って必ず落ちる。2026-11-12 に直した）。
  await clickText(page, 'スケジュールに戻る');
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.innerText.indexOf('代車管理') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const pos = await page.evaluate(n => {
    const grab = (attr) => {
      const th = [...document.querySelectorAll('th[' + attr + ']')];
      if (!th.length) return null;
      const sc = th[0].closest('table').parentElement;
      const box = sc.getBoundingClientRect();
      const me = th.find(e => e.getAttribute(attr) === String(n));
      if (!me) return null;
      const mb = me.getBoundingClientRect();
      const after = th.filter(e => { const b = e.getBoundingClientRect(); return b.x > mb.x + 1 && b.right <= box.right + 1; }).length;
      return { left: Math.round(sc.scrollLeft), after: after };
    };
    return { loaner: grab('data-ldaynum'), rental: grab('data-rdaynum') };
  }, num(d(0)));
  t('どちらの表でも本日の列が見つかる', !!(pos.loaner && pos.rental), pos);
  // ★ここは【必ず違う】ことを見る。直す前は2つの表が同じ位置だったので、
  //   「以下」で見ると素通りしてしまう（見張りにならない）。
  t('★レンタカーの方が過去を広く出す（代車の表より左寄り）',
    !!(pos.loaner && pos.rental) && pos.rental.left < pos.loaner.left, pos);
  t('★本日より後ろに見える日数は、代車の表より少ない',
    !!(pos.loaner && pos.rental) && pos.rental.after < pos.loaner.after, pos);
  t('★本日より右は7日ぶんまで（いちばん左まで戻っている時を除く）',
    !!pos.rental && (pos.rental.after <= 7 || pos.rental.left === 0), pos.rental);

  head('⑨ つかむ所の白い棒が、お名前に掛からない');
  // ★2026-11-14 現場報告。白い棒を「つかむ所（8px）の真ん中」に置いていたため、
  //   お名前のために左右10pxずつ空けることになり、短い貸出でお名前の終わりが欠けていた
  //   （「藤明建設工業 様」の「様」が消える）。棒を帯のいちばん端に寄せて直した。
  const look = await page.evaluate(() => {
    const out = { names: [], bars: [], hit: [] };
    document.querySelectorAll('[data-rsgrip]').forEach(g => {
      const r = g.getBoundingClientRect(); if (r.width <= 0) return;
      out.hit.push(Math.round(r.width));
      const sp = g.querySelector('span'); if (!sp) return;
      const b = sp.getBoundingClientRect();
      out.bars.push({ side: g.getAttribute('data-rsgrip'), x: b.x, r: b.right, w: Math.round(b.width) });
    });
    document.querySelectorAll('td > div').forEach(d => {
      const c = getComputedStyle(d);
      if (c.position !== 'absolute' || c.color !== 'rgb(255, 255, 255)' || !d.innerText.trim()) return;
      const r = d.getBoundingClientRect();
      out.names.push({ txt: d.innerText.replace(/s+/g, ' '), x: r.x, r: r.right, cut: d.scrollWidth > d.clientWidth + 1 });
    });
    return out;
  });
  t('★お名前が1つも欠けていない', look.names.length >= 3 && !look.names.some(n => n.cut), look.names);
  t('★長い社名も終わりまで出る（2日だけの貸出）', look.names.some(n => /藤明建設工業 様$/.test(n.txt)), look.names.map(n => n.txt));
  t('★白い棒がお名前の字に重なっていない',
    look.bars.length >= 2 && !look.bars.some(b => look.names.some(n => b.x < n.r - 0.5 && b.r > n.x + 0.5)), { bars: look.bars, names: look.names });
  t('★つかむ所（当たり判定）は8pxのまま（細くしていない）', look.hit.length > 0 && look.hit.every(w => w >= 8), look.hit);

  head('⑩ ★つかむ所が【車名の列】の上に出ない（2026-11-14 現場報告）');
  // 表を横に送ると、左へ流れた帯のつかむ所が車名の列（position:sticky）の下に入る。
  // ここで重なりの高さ（zIndex）が同じだと【後ろに書いた方が上】になり、
  // つかむ所の白い棒がタイヤの札（夏・冬）や車名の上に出てしまっていた。
  const cover = await page.evaluate(() => {
    const sc = document.querySelector('th[data-ldaynum]').closest('table').parentElement;
    sc.scrollLeft = sc.scrollLeft + 420;      // 帯のいくつかを車名の列の下へ送る
    const grips = [...document.querySelectorAll('[data-rsgrip]')];
    const out = { under: 0, nameZ: null, gripZ: null, topIsName: null, top: null };
    for (const g of grips) {
      const r = g.getBoundingClientRect(); if (r.width <= 0) continue;
      const nm = g.closest('tr') && g.closest('tr').querySelector('td'); if (!nm) continue;
      const nb = nm.getBoundingClientRect();
      // ★【本当に重なっている】ものだけを見ること。左へ行き過ぎて車名の列より外に出たものは、
      //   重なっていないので点が表の外に落ちる（見張りにならない）。
      if (r.x >= nb.right - 1 || r.right <= nb.x + 1) continue;
      out.under++;
      if (out.topIsName === null) {
        out.nameZ = getComputedStyle(nm).zIndex;
        out.gripZ = getComputedStyle(g).zIndex;
        // ★点は【つかむ所と車名の列が重なっている所】の真ん中に取ること。
        //   はみ出した所を押すと、壊れていても車名の列が受けてしまい見張りにならない。
        const x = (Math.max(nb.x, r.x) + Math.min(nb.right, r.right)) / 2;
        const top = document.elementFromPoint(x, r.y + r.height / 2);
        out.top = top ? (top.tagName + '/' + (top.getAttribute('data-rsgrip') || '')) : null;
        out.topIsName = !!(top && top.closest('td') === nm);
      }
    }
    return out;
  });
  // SHOT2=<保存先.png> で【横に送った時の車名の列】の見た目を撮る
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 });
  t('つかむ所が車名の列の下に入っている（検査の前提）', cover.under > 0, cover);
  t('★車名の列の方が上に出る（重なりの高さ）',
    Number(cover.nameZ) > Number(cover.gripZ), { 車名: cover.nameZ, つかむ所: cover.gripZ });
  t('★車名の列の上に棒が出ていない（押しても車名の列が受ける）', cover.topIsName === true, cover);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
