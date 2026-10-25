// 週間カレンダーの「空き探し（🔍 検索）」と「⛶ 最大化」の検査（v3.74・2026-10-25 ユーザー決定）
//   ① 右上の並びは 🔍 検索 → ⛶ 最大化 → ✕
//   ② マッハ車検＝10:00・14:00 の枠で見る。空いている方をオレンジで囲い「マッハ可」、
//      すでに入っている方は「マッハ車検」。両方ふさがっている日はまるごと暗く
//   ③ クイック・レギュラーは台数で見る（1日6台／制限を掛けた日はその数／レギュラーは3台まで）
//   ④ 整備は所要時間を選び、空いている続きを丸ごと1つの枠で囲う（1時間ずつに刻まない）
//     マッハ車検の枠（10:00〜11:00・14:00〜15:00）は常に空けておく＝整備の空きには数えない
//   ⑤ 網掛けは ほぼ黒の 45%。札は枠のど真ん中
//   実行: node week_find_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8367, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

// 画面の日付を 2026-10-21（水）に固定。週は 10/19（月）〜10/25（日）
const FIX = [2026, 10, 21];
const dk = (d) => FIX[0] + '-' + FIX[1] + '-' + d;
const MON = dk(19), TUE = dk(20), WED = dk(21), THU = dk(22), FRI = dk(23), SAT = dk(24), SUN = dk(25);
const C = (n) => ({ MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 }[n]);
const ins = (course, time, name) => ({ name, course, time, store: 'honten', bookingStatus: 'confirmed' });

const seed = {
  [STOR + 'insp']: {
    // 月＝マッハが10:00だけ（14:00 は空き）／火＝10:00も14:00もふさがっている
    [MON]: [ins(1, '10:00', 'マ朝')],
    [TUE]: [ins(1, '10:00', 'マ朝'), ins(1, '14:00', 'マ昼')],
    // 水＝車検なし（10:00・14:00 とも空き）
    [WED]: [],
    // 木＝クイック3台＋台数制限3台（＝いっぱい）／金＝クイック1台（あと5台）
    [THU]: [ins(2, '09:00', 'ク一'), ins(2, '10:00', 'ク二'), ins(2, '11:00', 'ク三')],
    [FRI]: [ins(2, '09:00', 'ク四')],
    // 土＝レギュラー3台（レギュラーは上限／クイックならまだ入る）
    [SAT]: [ins(3, '09:00', 'レ一'), ins(3, '10:00', 'レ二'), ins(3, '11:00', 'レ三')],
    // 日＝三田店のクイック1台（本店で見ていても出る／台数にも数える）
    [SUN]: [{ name: '三田ク', course: 2, time: '10:00', store: 'sanda', bookingStatus: 'confirmed' }],
  },
  // 整備：水の 09:00 と 13:00 だけ埋める（09:30〜11:30 と 13:30〜18:00 が続きの空き）
  [STOR + 'honten-sched']: {
    [WED]: {
      '09:00': { name: '朝一', work: 'Q', staff: '江川京志' },
      '13:00': { name: '昼一', work: 'B', staff: '竹林直行' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [
    { uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten', badge: 'mechanic' },
    { uid: 'h3', name: '竹林直行', myNumber: 3, store: 'honten', badge: 'mechanic' },
  ],
  [STOR + 'sanda-staff-v2']: [{ uid: 's1', name: '藤原昭人', myNumber: 10, store: 'sanda', badge: 'mechanic' }],
  [STOR + 'honten-dayoff']: {}, [STOR + 'honten-pleave']: {},
  [STOR + 'sanda-dayoff']: {}, [STOR + 'sanda-pleave']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  // ★台数制限は必ず これから先の日に掛ける（過去の日の制限は起動時に消される）
  [STOR + 'inspLimits']: { [THU]: 3 },
  [STOR + 'honten-schedRestrictions']: {}, [STOR + 'sanda-schedRestrictions']: {},
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
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  }, [ME, STOR, seed]);
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
  // 週の表の中だけを見る道具
  const tap = (sel) => page.evaluate(s => { const b = document.querySelector(s); if (b) { b.click(); return true; } return false; }, sel);
  const ORANGE = /245,\s*158,\s*11/;
  const cellAt = (label, dayIdx) => page.evaluate(([tl, di]) => {
    const rows = [...document.querySelectorAll('[data-weekview] tr')];
    const tr = rows.find(r => r.children[0] && r.children[0].innerText.replace(/\s+/g, '') === tl);
    if (!tr) return null;
    const td = tr.children[di + 1]; if (!td) return null;
    const st = getComputedStyle(td);
    const ov = [...td.querySelectorAll('span')].find(s => getComputedStyle(s).position === 'absolute' && getComputedStyle(s).inset.indexOf('0px') === 0);
    return {
      dim: td.getAttribute('data-wdim'), txt: td.innerText.replace(/\s+/g, ''),
      bt: parseFloat(st.borderTopWidth), bb: parseFloat(st.borderBottomWidth),
      bl: st.borderLeftColor, bg: st.backgroundColor,
      ovbg: ov ? getComputedStyle(ov).backgroundColor : '',
    };
  }, [label, dayIdx]);
  const insAt = (d) => page.evaluate(x => {
    const td = document.querySelector('[data-wins="' + x + '"]');
    if (!td) return null;
    const lab = td.querySelector('[data-wdaylab]');
    return { lab: lab ? lab.innerText.replace(/\s+/g, '') : '', shadow: getComputedStyle(td).boxShadow };
  }, d);
  const headDim = (d) => page.evaluate(x => {
    const b = document.querySelector('[data-wday="' + x + '"]'); if (!b) return null;
    const th = b.closest('th'); return th ? th.getAttribute('data-wdim') : null;
  }, d);
  const dimCount = () => page.evaluate(() => document.querySelectorAll('[data-weekview] [data-wdim="1"]').length);
  const anyBlock = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-weekview] tr')];
    return rows.some(r => [...r.children].some(td => parseFloat(getComputedStyle(td).borderTopWidth) >= 2 && /245,\s*158,\s*11/.test(getComputedStyle(td).borderLeftColor)));
  });

  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  t('週間カレンダーが開く', await page.evaluate(() => !!document.querySelector('[data-weekview]')));

  // ── ① 右上の並び ──
  console.log('\n■ ① 右上は 🔍 検索 → ⛶ 最大化 → ✕ の順');
  const top = await page.evaluate(() => {
    const f = document.querySelector('[data-wfind]'), s = document.querySelector('[data-wfs]');
    if (!f || !s) return null;
    const bar = f.parentElement;
    const txt = [...bar.children].map(e => e.innerText.replace(/\s+/g, ''));
    return { txt, find: txt.findIndex(x => /検索/.test(x)), fs: txt.findIndex(x => /最大化|戻す/.test(x)), x: txt.indexOf('✕'), ttl: s.getAttribute('title') || '' };
  });
  t('★「🔍 検索」のボタンがある', !!top && top.find >= 0, top);
  const findBtn = await page.evaluate(() => { const b = document.querySelector('[data-wfind]'); return b ? getComputedStyle(b).backgroundColor : ''; });
  t('★検索ボタンは（押す前から）赤い', findBtn === 'rgb(232, 73, 46)', findBtn);
  t('★「⛶ 最大化」のボタンがある', !!top && top.fs >= 0, top);
  t('★並びは 検索 → 最大化 → ✕', !!top && top.find < top.fs && top.fs < top.x, top);
  t('★最大化は ✕ のすぐ左', !!top && top.x === top.fs + 1, top);
  t('最大化に案内が出る', !!top && /広げ|戻す/.test(top.ttl), top);
  t('押しても落ちない（全画面は端末まかせ）', await tap('[data-wfs]'));
  await page.waitForTimeout(300);

  // ── ② 検索の帯 ──
  console.log('\n■ ② 🔍 を押すと帯が出る');
  t('はじめは帯が出ていない', await page.evaluate(() => !document.querySelector('[data-wfindbar]')));
  await tap('[data-wfind]'); await page.waitForTimeout(500);
  const bar = await page.evaluate(() => {
    const b = document.querySelector('[data-wfindbar]'); if (!b) return null;
    return {
      txt: b.innerText.replace(/\s+/g, ''),
      kinds: [...b.querySelectorAll('[data-wkind]')].map(e => e.getAttribute('data-wkind')),
      courses: [...b.querySelectorAll('[data-wcourse]')].map(e => e.innerText.replace(/\s+/g, '')),
      mins: [...b.querySelectorAll('[data-wmin]')].map(e => e.getAttribute('data-wmin')),
      go: !!b.querySelector('[data-wgo]'), clr: !!b.querySelector('[data-wclr]'),
    };
  });
  t('★帯が出る', !!bar, bar);
  t('★「車検」と「整備」を選べる', !!bar && bar.kinds.join(',') === 'insp,sched', bar);
  t('★はじめは車検＝コースの3つが出る', !!bar && bar.courses.length === 3 && /マッハ/.test(bar.courses[0]), bar);
  t('★車検の時は所要時間を出さない', !!bar && bar.mins.length === 0, bar);
  t('★「この条件で空きを探す」と「やめる」がある', !!bar && bar.go && bar.clr, bar);

  // ── ③ マッハ車検 ──
  console.log('\n■ ③ マッハ車検＝10:00・14:00 の枠で見る');
  await tap('[data-wcourse="1"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(700);
  const res = await page.evaluate(() => { const r = document.querySelector('[data-wres]'); return r ? r.innerText.replace(/\s+/g, '') : ''; });
  t('★結果の数が出る（火＝枠ずまり・木＝台数制限で 5日）', /5日に空きがあります/.test(res), res);
  const thuIns = await insAt(THU), thuCell = await cellAt('10:00', C('THU'));
  t('★★台数制限でいっぱいの日はマッハでも「可」にしない（木＝最大3台・3台入っている）',
    (await headDim(THU)) === '1' && !!thuIns && thuIns.lab === '', thuIns);
  t('★★その日は時間の枠も暗いまま（マッハ可の札を出さない）',
    !!thuCell && thuCell.dim === '1' && !/マッハ可/.test(thuCell.txt), thuCell)
  const iMon = await insAt(MON), iWed = await insAt(WED);
  t('★月（10:00 だけ入っている）は「14:00 空き」', !!iMon && iMon.lab === '14:00空き', iMon);
  t('★水（車検なし）は「10:00・14:00 空き」', !!iWed && iWed.lab === '10:00・14:00空き', iWed);
  t('★空きのある日はオレンジの枠で目立たせる', !!iWed && ORANGE.test(iWed.shadow), iWed);
  t('★火（10:00も14:00もふさがっている）は見出しまで暗く', (await headDim(TUE)) === '1');
  const tueIns = await insAt(TUE);
  t('★火の車検の欄に札は出ない', !!tueIns && tueIns.lab === '', tueIns);
  const w10 = await cellAt('10:00', C('WED')), w1030 = await cellAt('10:30', C('WED'));
  t('★水の 10:00 は「マッハ可」の札', !!w10 && /マッハ可/.test(w10.txt), w10);
  t('★入庫から1時間（10:00〜10:30）をオレンジで囲う', !!w10 && w10.bt >= 2 && !!w1030 && w1030.bb >= 2 && ORANGE.test(w10.bl), { w10, w1030 });
  t('★囲みの途中（10:30）には札を出さない', !!w1030 && !/マッハ/.test(w1030.txt), w1030);
  const m10 = await cellAt('10:00', C('MON'));
  t('★月の 10:00（すでに入っている）は「マッハ予約済み」', !!m10 && /マッハ予約済み/.test(m10.txt), m10);
  const lab = await page.evaluate(() => {
    const s = [...document.querySelectorAll('[data-weekview] span')].find(e => /マッハ可/.test(e.innerText));
    if (!s) return null; const st = getComputedStyle(s);
    return { left: st.left, top: st.top, tr: st.transform, fw: st.fontWeight };
  });
  t('★札は枠のど真ん中（左右・上下とも中央寄せ）', !!lab && lab.left !== 'auto' && /matrix/.test(lab.tr), lab);
  const labCol = await page.evaluate(() => {
    const pick = (re) => { const s = [...document.querySelectorAll('[data-weekview] span')].find(e => re.test(e.innerText) && !e.querySelector('span')); return s ? getComputedStyle(s).backgroundColor : ''; };
    return { ok: pick(/^マッハ可$/), mach: pick(/^マッハ予約済み$/) };
  });
  t('★「マッハ可」の札は緑（赤い「マッハ車検」と見分けるため）', labCol.ok === 'rgb(4, 120, 87)', labCol);
  t('★「マッハ予約済み」の札はごく薄い赤（緑の「マッハ可」と見分ける）', labCol.mach === 'rgb(254, 202, 202)', labCol);
  t('★氏名・車種は出さない', !!w10 && !/朝一|昼一/.test(w10.txt), w10);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  const dimc = await cellAt('09:00', C('TUE'));
  t('★網掛けは ほぼ黒の45%', !!dimc && dimc.ovbg === 'rgba(0, 0, 0, 0.45)', dimc);

  // ── ③-2 「マッハ可」の隣の ＋ から直接マッハ車検を受ける ──
  console.log("\n■ ③-2 「マッハ可」の隣の ＋ から直接マッハ車検を受ける");
  const addBtn = await page.evaluate(d => {
    const b = document.querySelector('[data-wmachadd="' + d + '/10:00"]');
    return b ? { txt: b.innerText.replace(/[^＋]/g, ''), title: b.getAttribute('title') || '' } : null;
  }, WED);
  t('★★「マッハ可」の隣に ＋ がある', !!addBtn && addBtn.txt === '＋', addBtn);
  t('★★何をする ＋ なのか案内が出る', !!addBtn && /マッハ車検/.test(addBtn.title), addBtn);
  t('★★すでに入っている「マッハ車検」の方には ＋ を出さない',
    await page.evaluate(d => !document.querySelector('[data-wmachadd="' + d + '/10:00"]'), MON));
  await page.evaluate(d => { const b = document.querySelector('[data-wmachadd="' + d + '/10:00"]'); if (b) b.click(); }, WED);
  await page.waitForTimeout(1300);
  const card = await page.evaluate(() => {
    const m = document.querySelector('.booking-modal-inner'); if (!m) return null;
    const cs = [...document.querySelectorAll('[data-kbkey="course"] button')]
      .map(b => ({ n: b.innerText.replace(/[ \t\r\n]+/g, ''), col: getComputedStyle(b).borderTopColor }));
    const tm = document.querySelector('[data-insptime]');
    return { on: cs.filter(c => c.col === 'rgb(185, 28, 28)').map(c => c.n), all: cs.length,
      time: tm ? tm.innerText.replace(/[ \t\r\n]+/g, '') : '', head: m.innerText.replace(/[ \t\r\n]+/g, '').slice(0, 60) };
  });
  t('★★押すと予約カードが開く', !!card, card);
  t('★★コースはマッハ車検が選ばれている', !!card && card.on.length === 1 && /マッハ/.test(card.on[0]), card);
  t('★★入庫時間はその枠（10:00）が入っている', !!card && /10:00/.test(card.time), card);
  t('★★その日の予約カードになっている（10/21）', !!card && /10.21|10月21日/.test(card.head), card);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.booking-modal-inner button')].find(e => e.innerText.trim() === 'キャンセル'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  t('★★閉じると週の表に戻る（探した結果はそのまま）',
    await page.evaluate(() => !document.querySelector('.booking-modal-inner') && !!document.querySelector('[data-weekview]')));

  // ── ③-3 車検のバッジは両店あわせて ──
  console.log("\n■ ③-3 車検のバッジは両店あわせて出す");
  const sun = await page.evaluate(d => {
    const td = document.querySelector('[data-wins="' + d + '"]'); if (!td) return null;
    const bs = [...td.querySelectorAll('[data-wcb]')];
    return { n: bs.length, oth: bs.map(b => b.getAttribute('data-wcboth')), title: bs.map(b => b.getAttribute('title') || '') };
  }, SUN);
  t('★★本店で見ていても三田店の車検が出る', !!sun && sun.n === 1, sun);
  t('★★他店のバッジは白いふちで見分けられる', !!sun && sun.oth[0] === '1', sun);
  t('★★どの店の入庫か案内に出る', !!sun && /三田店入庫/.test(sun.title[0]), sun);
  const monB = await page.evaluate(d => {
    const td = document.querySelector('[data-wins="' + d + '"]');
    return td ? [...td.querySelectorAll('[data-wcb]')].map(b => b.getAttribute('data-wcboth')) : null;
  }, MON);
  t('★★自分の店の分にはふちを付けない', !!monB && monB.join(',') === '0', monB);

  // ── ④ クイック・レギュラーは台数 ──
  console.log('\n■ ④ クイック・レギュラーは台数で見る');
  await tap('[data-wcourse="2"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(700);
  const qFri = await insAt(FRI), qSat = await insAt(SAT);
  t('★木（制限3台・3台入っている）はいっぱい＝見出しまで暗く', (await headDim(THU)) === '1');
  t('★金（1台だけ）は「あと5台」', !!qFri && qFri.lab === 'あと5台', qFri);
  t('★土（レギュラー3台）はクイックならまだ入る', !!qSat && qSat.lab === 'あと3台', qSat);
  const qSun = await insAt(SUN);
  t('★★台数は両店あわせて数える（日＝三田店の1台を引いて あと5台）', !!qSun && qSun.lab === 'あと5台', qSun);
  t('★クイックの時は時間の枠を囲わない', !(await anyBlock()));
  await tap('[data-wcourse="3"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(700);
  t('★レギュラーは1日3台まで＝土は暗く', (await headDim(SAT)) === '1');
  t('★レギュラーでも金はまだ入る', (await headDim(FRI)) === '0');

  // ── ⑤ 整備は所要時間 ──
  console.log('\n■ ⑤ 整備＝空いている続きを丸ごと1つの枠で囲う');
  await tap('[data-wkind="sched"]'); await page.waitForTimeout(400);
  const mins = await page.evaluate(() => [...document.querySelectorAll('[data-wmin]')].map(e => e.innerText.replace(/\s+/g, '')));
  t('★所要時間は 30分・1時間・1時間半・2時間の4つ', mins.join(',') === '30分,1時間,1時間半,2時間', mins);
  t('★整備の時はコースを出さない', await page.evaluate(() => document.querySelectorAll('[data-wcourse]').length === 0));
  await tap('[data-wmin="120"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(800);
  const s0900 = await cellAt('09:00', C('WED')), s1000 = await cellAt('10:00', C('WED'));
  const s1030 = await cellAt('10:30', C('WED')), s1100 = await cellAt('11:00', C('WED'));
  const s1400 = await cellAt('14:00', C('WED')), s1430 = await cellAt('14:30', C('WED'));
  const s1500 = await cellAt('15:00', C('WED')), s1600 = await cellAt('16:00', C('WED')), s1800 = await cellAt('18:00', C('WED'));
  t('★埋まっている 09:00 は暗く', !!s0900 && s0900.dim === '1', s0900);
  t('★★マッハ車検の枠（10:00・10:30）は整備では常に暗い', !!s1000 && s1000.dim === '1' && !!s1030 && s1030.dim === '1', { s1000, s1030 });
  t('★★14:00・14:30 も同じく暗い', !!s1400 && s1400.dim === '1' && !!s1430 && s1430.dim === '1', { s1400, s1430 });
  t('★★なぜ暗いのか分かるように「マッハ枠」と出す', !!s1000 && /マッハ枠/.test(s1000.txt) && !!s1400 && /マッハ枠/.test(s1400.txt), { s1000, s1400 });
  t('★★マッハ枠の中でも ＋ は押せる（入力は止めない）', !!s1000 && /＋/.test(s1000.txt), s1000);
  t('★2時間とれる続きだけを囲う（15:00 から始まる）', !!s1500 && s1500.bt >= 2 && ORANGE.test(s1500.bl), s1500);
  t('★1時間ずつに刻まない（16:00 の上に線を入れない）', !!s1600 && s1600.bt < 2, s1600);
  t('★囲いは 18:00 で終わる（下に線）', !!s1800 && s1800.bb >= 2, s1800);
  t('★★マッハ枠で切れて2時間とれない所は暗い（11:00〜11:30）', !!s1100 && s1100.dim === '1', s1100);
  t('★枠の中に「何分」は出さない', !!s1500 && !/分/.test(s1500.txt), s1500);
  const nres = await page.evaluate(() => { const r = document.querySelector('[data-wres]'); return r ? r.innerText.replace(/\s+/g, '') : ''; });
  t('★とれる所の数が出る', /2時間以上とれる空きが\d+か所/.test(nres), nres);
  await tap('[data-wmin="30"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(800);
  const h0930 = await cellAt('09:30', C('WED')), h1100 = await cellAt('11:00', C('WED'));
  const h1130 = await cellAt('11:30', C('WED')), h1000 = await cellAt('10:00', C('WED'));
  t('★30分なら 09:30 の1枠だけでも囲う', !!h0930 && h0930.bt >= 2 && h0930.bb >= 2, h0930);
  t('★11:00〜11:30 は続きなので1つの枠にまとめる', !!h1100 && h1100.bt >= 2 && !!h1130 && h1130.bb >= 2 && h1130.bt < 2, { h1100, h1130 });
  t('★★30分でもマッハ枠は空けたまま（暗い）', !!h1000 && h1000.dim === '1', h1000);

  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2, fullPage: true });
  // ── ⑥ やめる ──
  console.log('\n■ ⑥ やめると元に戻る');
  await tap('[data-wclr]'); await page.waitForTimeout(600);
  t('★網掛けが全部消える', (await dimCount()) === 0);
  t('★囲いも消える', !(await anyBlock()));
  t('★帯は出たまま（条件を変えてもう一度探せる）', await page.evaluate(() => !!document.querySelector('[data-wfindbar]')));
  await tap('[data-wfind]'); await page.waitForTimeout(400);
  t('★🔍 をもう一度押すと帯が畳まれる', await page.evaluate(() => !document.querySelector('[data-wfindbar]')));
  // ★週を送っても探した条件はそのまま（2026-10-25 ユーザー指示）
  await tap('[data-wfind]'); await page.waitForTimeout(300);
  await tap('[data-wkind="insp"]'); await page.waitForTimeout(200);
  await tap('[data-wcourse="1"]'); await page.waitForTimeout(200);
  await tap('[data-wgo]'); await page.waitForTimeout(700);
  const before = await dimCount();
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-weekview] button')].find(e => /次の週/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(900);
  t('★週を送っても検索は解除されない（帯も条件もそのまま）',
    await page.evaluate(() => { const b = document.querySelector('[data-wfindbar]'); return !!b && /マッハ/.test(b.innerText); }));
  const after = await page.evaluate(() => ({
    res: (document.querySelector('[data-wres]') || {}).innerText || '',
    lab: [...document.querySelectorAll('[data-wdaylab]')].length,
  }));
  t('★新しい週で計算し直す（その週の空きが出る）', /日に空きがあります/.test(after.res.replace(/s+/g, '')) && after.lab > 0, after);
  t('★古い週の網掛けを引きずらない（全部暗いまま、にならない）', (await dimCount()) !== before || before === 0, { before });
  await tap('[data-wclr]'); await page.waitForTimeout(500);
  t('★「やめる」は今までどおり効く', (await dimCount()) === 0);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));
  console.log('\n──────── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────────');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
