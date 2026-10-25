// 週表示の検査（v3.69・2026-10-21 ユーザー決定）
//   ① スケジュールの「📅 週表示」で1週間の表が開く（1日表示はそのまま残る）
//   ② 車検は台数ではなく マ→ク→レ の順のバッジ／右に ＋
//   ③ 同じ時間に数件あっても積んで全部出る（隠さない）
//   ④ 出勤と休みは1行の中で左右に分かれる（B案）。休み＝有給も含む
//   ⑤ 日曜も出す／休業日は網掛けで ＋ を出さない
//   ⑥ バッジ・空き枠・＋ から予約カードが開く
//   ⑦ 週送り（前の週・今週・次の週）
//   ⑧ スタッフ設定の「1文字」（空なら名前の先頭1文字）
//   実行: node week_view_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8361, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

// 画面の日付を固定する（週の並びが日によって変わらないように）。2026-10-21（水）
const FIX = [2026, 10, 21];
const dk = (d) => FIX[0] + '-' + FIX[1] + '-' + d;
const MON = dk(19), TUE = dk(20), WED = dk(21), SUN = dk(25);

const seed = {
  // 車検：月＝レ1台／火＝マ2・ク1・レ1（並びの確認用に わざと バラバラの順で入れる）
  [STOR + 'insp']: {
    [MON]: [{ name: '月曜太郎', course: 3, time: '10:00', store: 'honten', bookingStatus: 'confirmed' }],
    [TUE]: [
      { name: 'レ子', course: 3, time: '11:00', store: 'honten', bookingStatus: 'confirmed' },
      { name: 'ク一', course: 2, time: '09:30', store: 'honten', bookingStatus: 'confirmed' },
      { name: 'マ二', course: 1, time: '14:00', store: 'honten', bookingStatus: 'confirmed' },
      { name: 'マ一', course: 1, time: '09:00', store: 'honten', bookingStatus: 'confirmed' },
      { name: '三田の人', course: 1, time: '10:00', store: 'sanda', bookingStatus: 'confirmed' },
      { name: '消した人', course: 1, time: '10:00', store: 'honten', bookingStatus: 'cancelled' },
    ],
    // 水：クイック2台（マッハにすると自動の入庫制限が増えて他の検査に響くのでコースは2）
    [WED]: [
      { name: '水一', course: 2, time: '13:00', store: 'honten', bookingStatus: 'confirmed' },
      { name: '水二', course: 2, time: '13:30', store: 'honten', bookingStatus: 'confirmed' },
    ],
    [SUN]: [{ name: '日曜花子', course: 2, time: '09:00', store: 'honten', bookingStatus: 'confirmed' }],
  },
  // 整備：月の 09:00 に3件（積む確認）／火の 13:00 に1件
  [STOR + 'honten-sched']: {
    [MON]: {
      '09:00': { name: '積一', work: 'Q', staff: '江川京志', content: 'エンジンオイル交換' },
      '09:00__1': { name: '積二', work: 'B', staff: '竹林直行' },
      '09:00__2': { name: '積三', work: '納', staff: '魚住圭' },
    },
    [TUE]: {
      '13:00': { name: '火曜整備', work: 'M6', staff: '江川京志', loaner: '🔑 タント (1234)' },
      // 長い内容：幅に入らないので … で切れる
      '14:00': { name: '長文', work: 'Q', staff: '竹林直行', content: 'エアコンフィルター交換、エバポレーター洗浄、ブレーキ修理、ついでにワイパーも' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten', badge: 'mechanic' },
    { uid: 'h5', name: '魚住圭', myNumber: 5, store: 'honten', badge: 'mechanic' },
    { uid: 'h1', name: '見取大介', myNumber: 1, store: 'honten', badge: 'inspector', ini: '大' },
  ],
  [STOR + 'sanda-staff-v2']: [{ uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  // 月＝竹林が休日／火＝魚住が有給
  [STOR + 'honten-dayoff']: { [MON]: ['竹林直行'] },
  [STOR + 'honten-pleave']: { [TUE]: ['魚住圭'] },
  [STOR + 'sanda-dayoff']: {}, [STOR + 'sanda-pleave']: {},
  // 本店に曜日の定休日は無い（実データどおり）。10/22（木）だけ手で休業日にする
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: ['2026-10-22'],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  // 入庫制限（店ごと。STOR 無しのキーだが Firestore では STOR が前に付く）
  [STOR + 'inspLimits']: { [WED]: 2, [SUN]: 5 },   // 水＝上限に達している／日＝まだ空き
  [STOR + 'honten-schedRestrictions']: { [TUE]: { ranges: [{ startTime: '10:00', endTime: '11:00' }], exemptWorks: ['B'] } },
  [STOR + 'sanda-schedRestrictions']: {},
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  // 日付を 2026-10-21（水）に固定
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1600);

  // ── ① 入口 ──
  console.log('\n■ ① スケジュールから週表示を開く');
  const hasBtn = await page.evaluate(() => !!document.querySelector('[data-weekbtn]'));
  t('スケジュールに「📅 週表示」のボタンがある', hasBtn);
  // ★入口はカレンダーの横にも（2026-10-21 ユーザー指示：どこで見るのか分からなかった）
  const nav = await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (!b) return null;
    const bar = b.parentElement; const names = [...bar.children].map(e => e.innerText.replace(/s+/g, ''));
    return { txt: b.innerText.replace(/s+/g, ''), i: names.indexOf('週間カレンダー'), cal: names.indexOf('カレンダー') }; });
  t('★上の並びに「週間カレンダー」のボタンがある', !!nav && nav.txt === '週間カレンダー', nav);
  t('★「カレンダー」のすぐ右どなりにある', !!nav && nav.i === nav.cal + 1, nav);
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  t('★カレンダー横のボタンからも週の表が開く', await page.evaluate(() => !!document.querySelector('[data-weekview]')));
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-weekview] button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('[data-weekbtn]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  const open = await page.evaluate(() => !!document.querySelector('[data-weekview]'));
  t('★押すと週の表が開く', open);
  t('見出しに週の範囲が出る（10/19（月） 〜 10/25（日））', await page.evaluate(() => {
    const el = document.querySelector('[data-weekview]'); return !!el && /10\/19（月） 〜 10\/25（日）/.test(el.innerText);
  }));
  t('日曜（10/25）の列も出す', await page.evaluate(() => {
    const el = document.querySelector('[data-weekview]'); return !!el && /10\/25（日）/.test(el.innerText);
  }));
  t('1日表示は無くなっていない（下にそのまま残る）', await page.evaluate(() =>
    [...document.querySelectorAll('th')].some(th => th.innerText.trim() === '代車・レンタカー')));

  // ── ② 車検はコース順のバッジ ──
  console.log('\n■ ② 車検は マ→ク→レ の順のバッジ（台数ではない）');
  const tue = await page.evaluate(d => {
    const td = document.querySelector('[data-wins="' + d + '"]');
    if (!td) return null;
    const bs = [...td.querySelectorAll('[data-wcb]')];
    return { txt: bs.map(b => b.innerText.trim()).join(''), colors: bs.map(b => getComputedStyle(b).backgroundColor), plus: !!td.querySelector('[data-wiadd]'), oth: bs.map(b => b.getAttribute('data-wcboth')).join('') };
  }, TUE);
  t('★火曜はコース順に「マママクレ」と並ぶ（入れた順ではない／両店あわせて）', !!tue && tue.txt === 'マママクレ', tue);
  t('マッハは赤（185,28,28）', !!tue && /185, 28, 28/.test(tue.colors[0]), tue && tue.colors[0]);
  t('クイックは青（29,78,216）', !!tue && /29, 78, 216/.test(tue.colors[3]), tue && tue.colors[3]);
  t('レギュラーは橙（217,119,6）', !!tue && /217, 119, 6/.test(tue.colors[4]), tue && tue.colors[4]);
  t('★「○台」の文字は出さない', !!tue && !/台/.test(tue.txt));
  t('★バッジの横に ＋ がある（予約カードへ直接）', !!tue && tue.plus);
  // ★車検は両店あわせて出す（2026-10-25 ユーザー指示）。insp は両店が1本に入っていて
  //   台数制限も両店共通なので、見ている店だけに絞ると台数が合わない。
  t('★★他店（三田店）の車検も出す（両店あわせて5台）', !!tue && tue.txt.length === 5, tue);
  t('★★他店の分だけ白いふちで見分けられる', !!tue && tue.oth === '01000', tue);
  t('キャンセルの分は出さない', !!tue && tue.txt.length === 5);
  const tip = await page.evaluate(d => { const b = document.querySelector('[data-wins="' + d + '"] [data-wcb]'); return b ? b.getAttribute('title') : ''; }, TUE);
  t('なぞると「時間・氏名・コース」が出る', /09:00/.test(tip) && /マ一/.test(tip) && /マッハ車検/.test(tip), tip);

  // ── ②-2 車検のバッジは2段ずつ・コースが変わったら列を変える（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-2 車検のバッジは2段ずつ積み、コースが変わったら列を変える');
  const grp = await page.evaluate(d => {
    const td = document.querySelector('[data-wins="' + d + '"]');
    if (!td) return null;
    const cols = [...td.querySelectorAll('[data-wgrp]')];
    return {
      n: cols.length,
      letters: cols.map(c => [...c.querySelectorAll('[data-wcb]')].map(b => b.innerText.trim()).join('')),
      rows: cols.map(c => getComputedStyle(c).gridTemplateRows),
      flow: cols.map(c => getComputedStyle(c).gridAutoFlow),
      size: (() => { const b = td.querySelector('[data-wcb]'); const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })(),
      addInOwnCol: !!(td.querySelector('[data-wiadd]') && !td.querySelector('[data-wgrp] [data-wiadd]')),
    };
  }, TUE);
  t('★コースごとに列が分かれる（火曜は マ・ク・レ の3かたまり）', !!grp && grp.n === 3, grp);
  t('★同じ列にコースが混ざらない', !!grp && grp.n === 3 && grp.letters.every(x => new Set(x.split('')).size === 1), grp);
  t('★マッハ3台（両店あわせて）は 2段＋1 の同じかたまりに入る', !!grp && grp.letters[0] === 'マママ', grp);
  t('★列は2段ずつ（上から下へ積み、いっぱいなら右の列へ）', !!grp && grp.n === 3 && grp.rows.every(r => r.split(' ').length === 2), grp);
  t('★積む向きは縦（grid-auto-flow: column）', !!grp && grp.n === 3 && grp.flow.every(f => /column/.test(f)), grp);
  t('★バッジの大きさは今までどおり 19x19', !!grp && grp.size === '19x19', grp);
  t('★＋ はコースの列と別（かたまりに混ぜない）', !!grp && grp.n === 3 && grp.addInOwnCol, grp);

  // ── ②-3 担当者バッジを外して内容を出す（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-3 担当者バッジを外して、内容を入る幅だけ出す');
  const ent = await page.evaluate(d => {
    const e = document.querySelector('[data-went="' + d + '/09:00"]');
    if (!e) return null;
    const ct = e.querySelector('[data-wct]');
    return { txt: e.innerText.replace(/\s+/g, ''), hasCt: !!ct, ctTxt: ct ? ct.innerText.trim() : '',
      ov: ct ? getComputedStyle(ct).textOverflow : '', wrap: ct ? getComputedStyle(ct).whiteSpace : '' };
  }, MON);
  t('★担当者の1文字バッジを行に出さない（江川京志＝江）', !!ent && ent.txt.indexOf('江') < 0, ent);
  t('★代わりに内容が出る', !!ent && ent.hasCt && ent.ctTxt === 'エンジンオイル交換', ent);
  t('入りきらない時は … で切る', !!ent && ent.ov === 'ellipsis' && /nowrap/.test(ent.wrap), ent);
  const longCt = await page.evaluate(d => {
    const e = document.querySelector('[data-went="' + d + '/14:00"]');
    const ct = e && e.querySelector('[data-wct]');
    if (!ct) return null;
    return { cut: ct.scrollWidth > ct.clientWidth + 1,
      fits: e.scrollWidth <= e.clientWidth + 1 };
  }, TUE);
  t('★長い内容でもセルからはみ出さない', !!longCt && longCt.fits, longCt);
  // ★2026-10-24 ユーザー指示：ブラウザの素の吹き出しではなく、1日表示と同じ角丸の吹き出しにする
  await page.hover('[data-went="' + TUE + '/14:00"] [data-wct]').catch(() => {});
  await page.waitForTimeout(400);
  const ctip = await page.evaluate(() => { const e = document.querySelector('[data-wtip]'); if (!e) return null;
    const st = getComputedStyle(e);
    return { txt: e.innerText.replace(/s+/g, ' ').trim(), r: st.borderRadius, bw: st.borderTopWidth, bc: st.borderTopColor, pos: st.position }; });
  t('★切れていても、なぞれば全文の吹き出しが出る', !!ctip && /ワイパー/.test(ctip.txt), ctip);
  t('★吹き出しの角が丸い（1日表示と同じ 10px）', !!ctip && parseFloat(ctip.r) >= 10, ctip);
  t('★1日表示と同じ水色の2px枠', !!ctip && parseFloat(ctip.bw) >= 2 && /8, 145, 178/.test(ctip.bc), ctip);
  t('見出しに「内容（全文）」が出る', !!ctip && /内容（全文）/.test(ctip.txt), ctip);

  // ── ②-4 30分ごとの帯（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-4 :00 の行は水色／:30 の行は白');
  const band = await page.evaluate(() => {
    const pick = (slot) => {
      const tr = [...document.querySelectorAll('[data-weekview] tr')].find(x => x.children[0] && x.children[0].innerText.trim() === slot);
      if (!tr) return null;
      return { flag: tr.getAttribute('data-wband'), tm: getComputedStyle(tr.children[0]).backgroundColor,
        cell: getComputedStyle(tr.children[3]).backgroundColor };
    };
    return { h9: pick('09:00'), h930: pick('09:30'), h10: pick('10:00'), am: pick('午前入庫') };
  });
  t('★09:00 の行に色が付く', !!band.h9 && band.h9.flag === '1' && band.h9.cell !== 'rgba(0, 0, 0, 0)', band.h9);
  t('★09:30 の行は白のまま', !!band.h930 && band.h930.flag === '0' && band.h930.cell === 'rgba(0, 0, 0, 0)', band.h930);
  t('★10:00 の行はまた色が付く（30分ごとに切り替わる）', !!band.h10 && band.h10.flag === '1' && band.h10.cell === band.h9.cell, band.h10);
  t('★時間の列は少し濃い色', !!band.h9 && band.h9.tm !== band.h9.cell, band.h9);
  t('午前入庫・午後入庫・入庫未定は時刻を持たないので帯を付けない', !!band.am && band.am.flag === '0', band.am);

  // ── ②-6 車検の台数制限（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-6 車検の台数制限「最大N台」と、達した時の赤い網掛け');
  const lim = await page.evaluate(([full, room, none]) => {
    const one = dk => {
      const td = document.querySelector('[data-wins="' + dk + '"]');
      if (!td) return null;
      const tag = td.querySelector('[data-wlim]');
      return { flag: td.getAttribute('data-wfull'), bg: getComputedStyle(td).backgroundImage, bgc: getComputedStyle(td).backgroundColor,
        tag: tag ? tag.innerText.replace(/s+/g, '') : '', title: td.getAttribute('title') || '',
        n: td.querySelectorAll('[data-wcb]').length, add: !!td.querySelector('[data-wiadd]') };
    };
    return { full: one(full), room: one(room), none: one(none) };
  }, [WED, SUN, MON]);
  t('★制限をかけた日に「最大N台」が出る', !!lim.full && lim.full.tag === '最大2台', lim.full);
  t('★上限に達したら車検の欄が薄いピンクになる（2台/最大2台）', !!lim.full && lim.full.flag === '1' && lim.full.bgc === 'rgb(254, 226, 226)', lim.full);
  t('★まだ空きがある日は網掛けにしない（1台/最大5台）', !!lim.room && lim.room.tag === '最大5台' && lim.room.flag === '0', lim.room);
  t('★制限をかけていない日は何も出さない', !!lim.none && lim.none.tag === '' && lim.none.flag === '0', lim.none);
  t('なぞると「最大N台（いま○台）」が出る', !!lim.full && /最大2台（いま2台）/.test(lim.full.title), lim.full);
  t('上限に達しても ＋ は残す（入力は止めない。断るのは今までどおり保存の時）', !!lim.full && lim.full.add, lim.full);

  // ── ②-5 入庫制限を網掛けで出す（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-5 入庫制限を網掛けで出す');
  const rstr = await page.evaluate(([d, other]) => {
    const cell = (dk, slot) => {
      const e = document.querySelector('[data-wadd="' + dk + '/' + slot + '"]') ||
        [...document.querySelectorAll('[data-wrcell]')].find(x => (x.getAttribute('data-wadd') || '').indexOf(dk + '/' + slot) === 0);
      if (!e) return null;
      const st = getComputedStyle(e);
      return { flag: e.getAttribute('data-wrcell'), bg: st.backgroundImage, bgc: st.backgroundColor, title: e.getAttribute('title') || '', add: !!e.getAttribute('data-wadd'), cur: st.cursor };
    };
    const head = document.querySelector('[data-wrestr="' + d + '"]');
    return {
      in1: cell(d, '10:00'), in2: cell(d, '10:30'), mach: cell(d, '09:30'), out2: cell(d, '11:00'), free: cell(d, '11:30'),
      otherDay: cell(other, '10:00'),
      head: head ? head.innerText.replace(/\s+/g, '') : '',
      headTitle: head ? head.getAttribute('title') : '',
      legend: [...document.querySelectorAll('[data-weekview] *')].filter(x => /マッハ車検$/.test(x.textContent || '') && x.children.length === 0).length,
    };
  }, [TUE, WED]);
  // ★2026-10-24 ユーザー決定：斜線のゼブラはやめて、1日表示と同じベタの薄いピンク（#fee2e2）
  t('★制限の中（10:00）はベタの薄いピンクになる', !!rstr.in1 && rstr.in1.flag === '1' && rstr.in1.bgc === 'rgb(254, 226, 226)', rstr.in1);
  t('★斜線のゼブラは使わない（行の境目でズレるため）', !!rstr.in1 && !/repeating-linear-gradient/.test(rstr.in1.bg), rstr.in1);
  t('★10:30 も制限の中なので網掛け', !!rstr.in2 && rstr.in2.flag === '1', rstr.in2);
  // ★マッハ車検（09:00入庫）の自動制限 09:00〜10:00 もここに出る
  t('★マッハ車検の自動制限（09:30）も網掛けになる', !!rstr.mach && rstr.mach.flag === '1' && /マッハ車検/.test(rstr.mach.title), rstr.mach);
  t('★どの制限にも入らない時間（11:30）は網掛けにしない', !!rstr.free && rstr.free.flag === '0', rstr.free);
  t('★終わり（11:00）は制限に入らない', !!rstr.out2 && rstr.out2.flag === '0', rstr.out2);
  t('★制限の無い日は網掛けにしない', !!rstr.otherDay && rstr.otherDay.flag === '0', rstr.otherDay);
  t('★なぞると時間と通せる作業が出る', !!rstr.in1 && /10:00〜11:00/.test(rstr.in1.title) && /B/.test(rstr.in1.title), rstr.in1);
  // ★2026-10-23 ユーザー指示：日付の下に入庫制限は出さない（表を広く使うため）。網掛けとツールチップで分かる
  t('★日付の下に入庫制限の文字を出さない', rstr.head === '', rstr.head);
  t('★いちばん下の説明書きも出さない', rstr.legend === 0, rstr.legend);
  t('制限の中でも入力はできる（＋ は押せるまま）', !!rstr.in1 && rstr.in1.add && rstr.in1.cur === 'pointer', rstr.in1);

  // ── ②-7 並べ方（2026-10-23 ユーザー指示）──
  console.log('\n■ ②-7 週送りを真ん中に大きく／未定・午後は下に貼り付け／12:00・18:00 は細く');
  const lay = await page.evaluate(() => {
    const box = document.querySelector('[data-weekview]').getBoundingClientRect();
    const nav = [...document.querySelectorAll('[data-wnav]')].map(b => {
      const r = b.getBoundingClientRect(); const st = getComputedStyle(b);
      return { txt: b.innerText.trim(), cx: Math.round(r.left + r.width / 2), w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(st.fontSize) };
    });
    const foot = document.querySelector('[data-wfoot]');
    // ★後ろに1日表示が残っているので、必ず週表の中だけを見る
    const wv = document.querySelector('[data-weekview]');
    const rowOf = (slot, root) => [...(root || wv).querySelectorAll('tr')].find(x => x.children[0] && x.children[0].innerText.trim() === slot);
    const info = (slot, root) => { const tr = rowOf(slot, root); if (!tr) return null;
      return { pin: tr.getAttribute('data-wpin'), thin: tr.getAttribute('data-wthin'),
        inFoot: !!(foot && foot.contains(tr)), top: Math.round(tr.getBoundingClientRect().top),
        h: Math.round(tr.getBoundingClientRect().height),
        idx: [...tr.parentElement.children].indexOf(tr), n: tr.parentElement.children.length }; };
    const scroller = [...document.querySelectorAll('[data-weekview] div')].find(e => e.scrollHeight > e.clientHeight + 20);
    return { navCx: Math.round((box.left + box.right) / 2), nav, boxBottom: Math.round(box.bottom),
      mitei: info('時間未定'), gogo: info('午後入庫'), gozen: info('午前入庫'),
      t12: info('12:00'), t18: info('18:00'), t9: info('09:00'), t1130: info('11:30'), t13: info('13:00'),
      footRows: foot ? [...foot.querySelectorAll('tr')].map(x => x.children[0].innerText.trim()) : null,
      scrollable: !!scroller, footOutside: !!(foot && scroller && !scroller.contains(foot)) };
  });
  const mid = lay.nav.length === 3 ? Math.round((lay.nav[0].cx + lay.nav[2].cx) / 2) : -1;
  t('★週送りが帯の真ん中にある', mid > 0 && Math.abs(mid - lay.navCx) <= 40, { mid, center: lay.navCx });
  t('★前より大きい（高さ30px以上・文字14px以上）', lay.nav.every(b => b.h >= 30 && b.fs >= 14), lay.nav);
  t('3つとも出ている（前の週・今週・次の週）', lay.nav.map(b => b.txt).join(',').indexOf('今週') > 0, lay.nav);
  t('★12:00 の枠はもう出さない', lay.t12 === null, lay.t12);
  t('★12:00 のあった所に「午前入庫」が入る（11:30 の次・13:00 の前）',
    !!lay.gozen && !!lay.t1130 && !!lay.t13 && lay.gozen.idx === lay.t1130.idx + 1 && lay.t13.idx === lay.gozen.idx + 1,
    { gozen: lay.gozen, t1130: lay.t1130, t13: lay.t13 });
  // 09:00 は予定が3件積まれていて高いので、細い枠（18:00）と比べる
  t('★午前入庫は細くしない（12:00 の細さを引き継がない）', !!lay.gozen && lay.gozen.thin === '0' && !!lay.t18 && lay.gozen.h > lay.t18.h, { gozen: lay.gozen, t18: lay.t18 });
  t('★「午後入庫」「時間未定」はこの順で下に据え置く（時間未定がいちばん下）',
    JSON.stringify(lay.footRows) === JSON.stringify(['午後入庫', '時間未定']), lay.footRows);
  t('★2つともスクロールする表の外にある（上の予定と重ならない）',
    !!lay.gogo && lay.gogo.inFoot && !!lay.mitei && lay.mitei.inFoot, { gogo: lay.gogo, mitei: lay.mitei });
  t('★据え置きの表は画面のいちばん下にある', !!lay.mitei && lay.boxBottom - (lay.mitei.top + lay.mitei.h) < 12, { mitei: lay.mitei, bottom: lay.boxBottom });
  // ★2026-10-24 ユーザー決定：出勤の下は二重線（イ案）／時刻を持たない枠は緑地に白文字（B案）
  const look2 = await page.evaluate(() => {
    const wv = document.querySelector('[data-weekview]');
    const stf = wv.querySelector('[data-wstf]');
    const rowOf = slot => [...wv.querySelectorAll('tr')].find(x => x.children[0] && x.children[0].innerText.trim() === slot);
    const sp = rowOf('午前入庫'), hh = rowOf('09:00');
    const px = e => { const st = getComputedStyle(e); return { bs: st.borderBottomStyle, bw: st.borderBottomWidth }; };
    const tm = e => { const st = getComputedStyle(e.children[0]); return { bg: st.backgroundColor, c: st.color }; };
    return { stf: stf ? px(stf) : null, sp: sp ? tm(sp) : null, hh: hh ? tm(hh) : null,
      spCell: sp ? getComputedStyle(sp.children[2]).backgroundColor : '' };
  });
  t('★出勤の欄の下が二重線', !!look2.stf && look2.stf.bs === 'double' && parseFloat(look2.stf.bw) >= 3, look2.stf);
  t('★午前入庫などの時間の列が緑地', !!look2.sp && look2.sp.bg === 'rgb(4, 120, 87)', look2.sp);
  t('★その文字は白', !!look2.sp && look2.sp.c === 'rgb(255, 255, 255)', look2.sp);
  t('★中の枠はうっすら緑', !!look2.spCell && look2.spCell === 'rgb(240, 253, 244)', look2.spCell);
  t('ふつうの時間の列は今までどおり（緑にしない）', !!look2.hh && look2.hh.bg !== 'rgb(4, 120, 87)', look2.hh);

  t('★18:00 は細い', !!lay.t18 && lay.t18.thin === '1' && lay.t18.h < lay.t9.h, { t18: lay.t18, t9: lay.t9 });

  // ── ②-8 本日の列を太枠で囲む（2026-10-24 ユーザー指示・ア案）──
  console.log(String.fromCharCode(10) + '■ ②-8 本日の列を太枠で囲む');
  const tdy = await page.evaluate(() => {
    const wv = document.querySelector('[data-weekview]');
    const th = wv.querySelector('[data-wtoday="1"]');
    if (!th) return null;
    const ix = [...th.parentElement.children].indexOf(th);
    const other = [...wv.querySelectorAll('[data-wtoday]')].find(x => x.getAttribute('data-wtoday') === '0');
    const px = e => { const st = getComputedStyle(e); return { l: st.borderLeftWidth, r: st.borderRightWidth, t: st.borderTopWidth, b: st.borderBottomWidth, c: st.borderLeftColor }; };
    const rows = [...wv.querySelectorAll('tr')].filter(r => r.children.length > ix);
    const col = rows.map(r => px(r.children[ix]));
    const foot = document.querySelector('[data-wfoot]');
    const fr = foot ? [...foot.querySelectorAll('tr')] : [];
    const lastCell = fr.length ? fr[fr.length - 1].children[ix] : null;
    return { head: px(th), other: other ? px(other) : null, thick: col.filter(x => parseFloat(x.l) >= 3 && parseFloat(x.r) >= 3).length, rows: col.length,
      bottom: lastCell ? px(lastCell).b : '' };
  });
  t('★本日の見出しに印が付く', !!tdy, tdy);
  t('★本日の列の左右が太い（3px以上）', !!tdy && parseFloat(tdy.head.l) >= 3 && parseFloat(tdy.head.r) >= 3, tdy && tdy.head);
  t('★上も閉じている（見出しの上に線）', !!tdy && parseFloat(tdy.head.t) >= 3, tdy && tdy.head);
  t('★いちばん下も閉じている（据え置きの表の最後）', !!tdy && parseFloat(tdy.bottom) >= 3, tdy && tdy.bottom);
  t('★色はカレンダーの今日と同じオレンジ', !!tdy && /194, 65, 12/.test(tdy.head.c), tdy && tdy.head.c);
  t('★本日の列は上から下までずっと太枠', !!tdy && tdy.rows >= 10 && tdy.thick === tdy.rows, tdy);
  t('ほかの日は太くしない', !!tdy && !!tdy.other && parseFloat(tdy.other.l) < 3, tdy && tdy.other);

  // ── ③ 同じ時間に数件＝積む ──
  console.log('\n■ ③ 同じ時間に数件あっても積んで全部出す');
  const stack = await page.evaluate(d => {
    const tds = [...document.querySelectorAll('[data-went]')].filter(e => e.getAttribute('data-went').indexOf(d + '/09:00') === 0);
    return { n: tds.length, keys: tds.map(e => e.getAttribute('data-went')), txt: tds.map(e => e.innerText.replace(/\s+/g, '')).join('|') };
  }, MON);
  t('★月曜 09:00 の3件が3件とも出ている', stack.n === 3, stack);
  t('「＋2」のような隠し方をしていない', !/＋2/.test(stack.txt), stack.txt);
  t('2行目以降のキー（__1・__2）も拾う', stack.keys.join(',').indexOf('__1') > 0 && stack.keys.join(',').indexOf('__2') > 0, stack.keys);
  const loan = await page.evaluate(d => { const e = document.querySelector('[data-went="' + d + '/13:00"]'); return e ? e.innerText.replace(/\s+/g, '') : ''; }, TUE);
  t('代車は「代タント」と短く出る（鍵マークは落とす）', /代タント/.test(loan) && !/🔑/.test(loan), loan);

  // ── ④ 出勤と休みを左右に分ける（B案） ──
  console.log('\n■ ④ 出勤と休みは1行の中で左右に分ける（B案）');
  const stf = (d) => page.evaluate(x => {
    const td = document.querySelector('[data-wstf="' + x + '"]');
    if (!td) return null;
    const faint = s => /255, 255, 255/.test(getComputedStyle(s).backgroundColor);
    const on = [...td.querySelectorAll('span')].filter(s => s.innerText.trim() && !faint(s));
    const off = [...td.querySelectorAll('span')].filter(s => s.innerText.trim() && faint(s));
    return { on: on.map(s => s.getAttribute('title')), off: off.map(s => s.getAttribute('title')), ini: on.concat(off).map(s => s.innerText.trim()) };
  }, d);
  const sMon = await stf(MON), sTue = await stf(TUE);
  t('★月曜：休日の竹林は出勤側にいない', !!sMon && !sMon.on.some(x => /竹林/.test(x)), sMon);
  t('★月曜：竹林は薄い側（休み）に出る', !!sMon && sMon.off.some(x => /竹林直行（休み）/.test(x)), sMon);
  t('★火曜：有給の魚住も休み側に出る（出勤に数えない）', !!sTue && !sTue.on.some(x => /魚住/.test(x)) && sTue.off.some(x => /魚住圭（休み）/.test(x)), sTue);
  t('休んでいない人は出勤側（江川京志）', !!sMon && sMon.on.some(x => /江川京志/.test(x)), sMon);
  t('★1文字は名前の先頭（江・竹・魚）', !!sMon && sMon.ini.indexOf('江') >= 0 && sMon.ini.indexOf('竹') >= 0 && sMon.ini.indexOf('魚') >= 0, sMon);
  t('★手で決めた1文字が優先（見取大介＝大）', !!sMon && sMon.ini.indexOf('大') >= 0 && sMon.ini.indexOf('見') < 0, sMon);

  // ── ⑤ 休業日 ──
  console.log('\n■ ⑤ 休業日の列');
  const closed = await page.evaluate(d => {
    const el = document.querySelector('[data-weekview]');
    const ths = [...el.querySelectorAll('th')];
    const th = ths.find(x => /10\/22（木）/.test(x.innerText));
    return { label: th ? th.innerText.replace(/\s+/g, '') : '', ins: !!document.querySelector('[data-wins="' + d + '"]'), add: !!document.querySelector('[data-wadd^="' + d + '/"]') };
  }, dk(22));
  t('★休業日は見出しに「休業日」と出る', /休業日/.test(closed.label), closed);
  t('★休業日の列には車検の ＋ を出さない', !closed.ins, closed);
  t('★休業日の列には空き枠の ＋ を出さない', !closed.add, closed);
  t('営業日（水）には空き枠の ＋ が出る', await page.evaluate(d => !!document.querySelector('[data-wadd^="' + d + '/"]'), WED));

  // ── ⑥ 予約カードが開く ──
  console.log('\n■ ⑥ バッジ・空き枠から予約カードが開く');
  await page.evaluate(d => { const b = document.querySelector('[data-wins="' + d + '"] [data-wcb]'); if (b) b.click(); }, TUE);
  await page.waitForTimeout(900);
  const nameVal = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.value === 'マ一'); return i ? i.value : ''; });
  t('★車検のバッジを押すとその予約カードが開く', !!nameVal, nameVal);
  t('開いたのは押した人の予約（マ一）', nameVal === 'マ一', nameVal);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /閉じる|キャンセル/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(700);
  t('週の表は閉じずに残っている（カードだけ閉じる）', await page.evaluate(() => !!document.querySelector('[data-weekview]')));
  const addKey = await page.evaluate(d => { const e = document.querySelector('[data-wadd^="' + d + '/10:30"]'); if (e) { e.click(); return e.getAttribute('data-wadd'); } return ''; }, WED);
  await page.waitForTimeout(900);
  t('★空き枠の ＋ で、その時間の新しい予定が開く', /10:30/.test(addKey) && await page.evaluate(() => /10:30/.test(document.body.innerText)), addKey);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /閉じる|キャンセル/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(700);

  // ── ⑦ 週送り ──
  console.log('\n■ ⑦ 週送り');
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="1"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('★「次の週 ›」で翌週（10/26 〜 11/1）になる', await page.evaluate(() => /10\/26（月） 〜 11\/1（日）/.test(document.querySelector('[data-weekview]').innerText)));
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="-1"]'); if (b) b.click(); });
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="-1"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('★「‹ 前の週」で前の週（10/12 〜 10/18）になる', await page.evaluate(() => /10\/12（月） 〜 10\/18（日）/.test(document.querySelector('[data-weekview]').innerText)));
  await page.evaluate(() => { const b = document.querySelector('[data-wnav="0"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('★「今週」で今日の週に戻る', await page.evaluate(() => /10\/19（月） 〜 10\/25（日）/.test(document.querySelector('[data-weekview]').innerText)));

  // ── ⑦-2 日付のバッジを押すとその日のスケジュールへ（2026-10-23 ユーザー指示）──
  console.log('\n■ ⑦-2 日付を押すとその日のスケジュールへ移る');
  const dayBtn = await page.evaluate(d => {
    const b = document.querySelector('[data-wday="' + d + '"]');
    if (!b) return null;
    const st = getComputedStyle(b);
    return { tag: b.tagName, txt: b.innerText.replace(/\s+/g, ''), radius: st.borderRadius, cur: st.cursor, title: b.getAttribute('title') || '' };
  }, WED);
  t('★日付がバッジ（押せるボタン）になっている', !!dayBtn && dayBtn.tag === 'BUTTON' && parseFloat(dayBtn.radius) >= 10, dayBtn);
  t('見た目で押せると分かる（指のカーソル・案内）', !!dayBtn && dayBtn.cur === 'pointer' && /スケジュール/.test(dayBtn.title), dayBtn);
  await page.evaluate(d => { const b = document.querySelector('[data-wday="' + d + '"]'); if (b) b.click(); }, WED);
  await page.waitForTimeout(1200);
  t('★押すと週の表が閉じる', await page.evaluate(() => !document.querySelector('[data-weekview]')));
  const moved = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ''));
  t('★その日の1日表示になる（10月21日）', /10月21日|10\/21/.test(moved), moved.slice(0, 120));
  t('★スケジュール画面に移っている（タイムスケジュールが出ている）',
    await page.evaluate(() => [...document.querySelectorAll('th')].some(th => th.innerText.trim() === '代車・レンタカー')));
  // 週表を開き直して続ける
  await page.evaluate(() => { const b = document.querySelector('[data-weekbtn]'); if (b) b.click(); });
  await page.waitForTimeout(900);

  // ── ⑦-2 本日より前の列をうっすら暗く（15%・2026-10-25 ユーザー決定）──
  console.log("\n■ ⑦-2 本日より前の列をうっすら暗く（15%）");
  const dim = await page.evaluate(([mon, tue, wed, thu]) => {
    const col = (dk) => {
      const th = document.querySelector('[data-wday="' + dk + '"]');
      const ins = document.querySelector('[data-wins="' + dk + '"]');
      const stf = document.querySelector('[data-wstf="' + dk + '"]');
      const cel = document.querySelector('[data-wadd^="' + dk + '/"]');
      const has = (e) => !!(e && e.querySelector('[data-wpast]'));
      return { head: has(th && th.closest('th')), ins: has(ins), stf: has(stf), cell: has(cel) };
    };
    const any = document.querySelector('[data-wpast]');
    const foot = document.querySelector('[data-wfoot]');
    return { mon: col(mon), tue: col(tue), wed: col(wed), thu: col(thu),
      alpha: any ? getComputedStyle(any).backgroundColor : '',
      z: any ? getComputedStyle(any).zIndex : '',
      pe: any ? getComputedStyle(any).pointerEvents : '',
      footPast: !!(foot && foot.querySelector('[data-wpast]')) };
  }, [MON, TUE, WED, dk(22)]);
  t('★★月（本日より前）は見出しも暗くする', dim.mon.head, dim);
  t('★★車検の欄にも掛かる（元の色が残ってまだらにならない）', dim.mon.ins, dim);
  t('★★出勤の欄にも掛かる', dim.mon.stf, dim);
  t('★★時間の枠にも掛かる', dim.mon.cell, dim);
  t('★★火（本日より前）も同じ', dim.tue.head && dim.tue.ins && dim.tue.stf && dim.tue.cell, dim);
  t('★★本日（水）は暗くしない（オレンジの太枠で目立たせているため）',
    !dim.wed.head && !dim.wed.ins && !dim.wed.stf && !dim.wed.cell, dim);
  t('★★先の日（木）も暗くしない', !dim.thu.head && !dim.thu.ins && !dim.thu.stf, dim);
  t('★★濃さは15%', dim.alpha === 'rgba(0, 0, 0, 0.15)', dim);
  t('★★網掛け（45%）より下に敷く（重なっても濁らない）', String(dim.z) === '2', dim);
  t('★★覆いは押せない（＋ や バッジの邪魔をしない）', dim.pe === 'none', dim);
  t('★★据え置きの表（午後入庫・時間未定）にも掛かる', dim.footPast, dim);

  // ── ⑧ 店を変えると中身も変わる ──
  console.log('\n■ ⑧ 店ごとに出す');
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-weekview] button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim().startsWith('三田店') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.querySelector('[data-weekbtn]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  const sanda = await page.evaluate(d => {
    const el = document.querySelector('[data-weekview]');
    const td = document.querySelector('[data-wins="' + d + '"]');
    return { head: el ? /三田店/.test(el.innerText) : false, n: td ? td.querySelectorAll('[data-wcb]').length : -1, staff: el ? /藤原昭人/.test(el.innerHTML) : false };
  }, TUE);
  t('★三田店で開くと見出しが三田店', sanda.head, sanda);
  t('★★三田店で開いても車検は両店ぶん出る（火曜は5台）', sanda.n === 5, sanda);
  t('★スタッフも三田店の人', sanda.staff, sanda);
  const wedSanda = await page.evaluate(d => {
    const el = document.querySelector('[data-weekview]');
    const th = [...el.querySelectorAll('th')].find(x => /10\/21（水）/.test(x.innerText));
    return { label: th ? th.innerText.replace(/\s+/g, '') : '', add: !!document.querySelector('[data-wadd^="' + d + '/"]') };
  }, WED);
  t('★三田店は水曜が定休日（網掛け・＋なし）', /休業日/.test(wedSanda.label) && !wedSanda.add, wedSanda);

  // ── ⑨ スタッフ設定の「1文字」 ──
  console.log('\n■ ⑨ スタッフ設定の「1文字」');
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-weekview] button')].find(e => e.innerText.trim() === '✕'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('openStaffSettings')));
  await page.waitForTimeout(900);
  t('スタッフ設定が開く', await see('スタッフ設定', 5000));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('見取大介') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('★「週表示の1文字」の欄がある', await page.evaluate(() => /週表示の1文字/.test(document.body.innerText)));
  const iniVal = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.maxLength === 2); return i ? { v: i.value, ph: i.placeholder } : null; });
  t('★今の1文字（大）が入っている', !!iniVal && iniVal.v === '大', iniVal);
  t('★空の時の案内に先頭1文字が出る', !!iniVal && /見/.test(iniVal.ph || ''), iniVal);

  // ── まとめ ──
  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));
  console.log('\n──────── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────────');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
