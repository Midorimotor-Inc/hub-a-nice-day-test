// 対応スタッフ数のアラートは【車検の見出しの行の札】で出す（v3.128.0・2026-11-23 ユーザー決定・イ案）
//   それまで：車検とタイムスケジュールの【上に帯】。1本で約2行・2本で約4行ぶん予定表が狭くなっていた。
//   いま　　：帯をやめて「🚗 車検」の見出しの行に札。「9:00　入庫 5件／対応 4名　1件オーバー」
//     ・黄＝達している／赤＝超えている（帯の時と同じ意味）
//     ・なぞるとポップ（文面は帯の時と同じ）・押すと出したまま・ほかを押すと消える
//     ・開いた直後の3秒だけ揺れる（vehMove ×4）
//   ★数え方は変えていない（9:00枠・9:30枠／車検＋整備の件数 と フロント対応の人数を比べる）。
//   ★検査の日付を決め打ちにしない：休業日（祝日・第2火曜）だと出勤者ゼロでアラートが出ない。
//     候補日を並べて、休業日でない日を場面ごとに選ぶ。
//   実行: node staff_alert_chip_test.js      見た目も撮る: SHOT=<保存先.png> node staff_alert_chip_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8527, STOR = 'hub-v8-dev-';
const FILE = process.env.HTML || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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

// ── 日付は今日から数える（決め打ちにしない）
const N = new Date();
const dayOf = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return x; };
const dkOf = (x) => x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate();
const isoOf = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');

// フロント対応できる人＝3名／できない人＝2名（出勤は5名）
const FRONT = { insp_front: true, sched_front: true, insp_work: true, sched_work: true, insp_check: false };
const BACK  = { insp_front: false, sched_front: false, insp_work: true, sched_work: true, insp_check: false };
const STAFF = [
  { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten', capabilities: BACK },
  { uid: 'h1', name: '前田一', myNumber: 1, badge: 'mechanic', store: 'honten', capabilities: FRONT },
  { uid: 'h2', name: '前田二', myNumber: 2, badge: 'mechanic', store: 'honten', capabilities: FRONT },
  { uid: 'h3', name: '前田三', myNumber: 3, badge: 'mechanic', store: 'honten', capabilities: FRONT },
  { uid: 'h4', name: '奥田四', myNumber: 4, badge: 'assistant', store: 'honten', capabilities: BACK },
];
const insp = (name, time, seq) => ({ name, carType: 'ハスラー', course: 2, time, store: 'honten', seq, staff: '', note: '', loaner: '', tokuten: '-' });
const sch = (name, id) => ({ name, carType: 'タント', work: 'Q', content: 'オイル交換', id, at: id, store: 'honten' });

// 場面（候補日に順ぐりに置く。休業日に当たった候補は飛ばす）
//   EQ   … 9:00＝車検2＋整備1＝3件＝対応3名 → 黄の札1つ
//   OVER … 9:00＝車検2＋整備2＝4件＞3名 → 赤／9:30＝車検1＋整備2＝3件 → 黄
//   LOW  … 9:00＝車検1＋整備1＝2件＜3名 → 札なし
//   NONE … 9時台に何も無い → 札なし
const SC = ['EQ', 'OVER', 'LOW', 'NONE'];
const seedInsp = {}, seedSched = {}, CAND = { EQ: [], OVER: [], LOW: [], NONE: [] };
for (let i = 1; i <= 16; i++) {
  const x = dayOf(i), k = dkOf(x), kind = SC[i % 4];
  CAND[kind].push(isoOf(x));
  if (kind === 'EQ')   { seedInsp[k] = [insp('検査 一郎', '09:00', 1), insp('検査 二郎', '09:00', 2)]; seedSched[k] = { '09:00': sch('整備 一郎', 11) }; }
  if (kind === 'OVER') { seedInsp[k] = [insp('検査 一郎', '09:00', 1), insp('検査 二郎', '09:00', 2), insp('検査 三郎', '09:30', 3)];
                         seedSched[k] = { '09:00': sch('整備 一郎', 11), '09:00__1': sch('整備 二郎', 12), '09:30': sch('整備 三郎', 13), '09:30__1': sch('整備 四郎', 14) }; }
  if (kind === 'LOW')  { seedInsp[k] = [insp('検査 一郎', '09:00', 1)]; seedSched[k] = { '09:00': sch('整備 一郎', 11) }; }
  if (kind === 'NONE') { seedInsp[k] = [insp('検査 一郎', '13:00', 1)]; seedSched[k] = { '14:00': sch('整備 一郎', 11) }; }
}

(async () => {
  const seed = {
    [STOR + 'insp']: seedInsp, [STOR + 'inspLimits']: {},
    [STOR + 'honten-sched']: seedSched, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
    [STOR + 'honten-staff-v2']: STAFF, [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-dayoff']: {}, [STOR + 'honten-pleave']: {},
    [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
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
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/' + FILE, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  const goDay = async (v) => {
    const want = v.slice(0, 7);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-datepick]')].find(e => e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(200);
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : null; });
      if (!cur || cur === want) break;
      await page.click(cur < want ? '[data-mnav="next"]' : '[data-mnav="prev"]');
      await page.waitForTimeout(80);
    }
    const day = await page.$(`[data-day="${v}"]`);
    if (!day) return false;
    await day.click();
    await page.waitForTimeout(500);
    return true;
  };
  const isClosedDay = () => page.evaluate(() => !!document.querySelector('[title="店休日のため全員休み"]'));
  // その場面の候補日のうち、休業日でない最初の日へ移る
  const goScene = async (kind) => {
    for (const v of CAND[kind]) { if (!(await goDay(v))) continue; if (await isClosedDay()) continue; return v; }
    return null;
  };
  const chips = () => page.evaluate(() => [...document.querySelectorAll('[data-staffalert]')].filter(e => e.offsetParent !== null).map(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e), hd = e.closest('[data-insphead]');
    return { slot: e.getAttribute('data-staffalert'), kind: e.getAttribute('data-staffalertkind'), text: e.innerText.replace(/\s+/g, ' ').trim(),
      border: cs.borderTopColor, anim: cs.animationName, iter: cs.animationIterationCount, inHead: !!hd, h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
  }));
  const pops = () => page.evaluate(() => [...document.querySelectorAll('[data-staffalertpop]')].map(e => ({ slot: e.getAttribute('data-staffalertpop'), text: e.innerText.replace(/\s+/g, ' ').trim(), pos: getComputedStyle(e).position, inBody: e.parentElement === document.body })));
  const layout = () => page.evaluate(() => {
    const hd = document.querySelector('[data-insphead]'); const ts = document.getElementById('sched-slot-0900') || document.querySelector('[id^="sched-slot-"]');
    const tbl = ts ? ts.closest('table') : null;
    return { headH: hd ? Math.round(hd.getBoundingClientRect().height) : null, headTop: hd ? Math.round(hd.getBoundingClientRect().top) : null, tblTop: tbl ? Math.round(tbl.getBoundingClientRect().top) : null };
  });
  const bodyHas = (s) => page.evaluate(x => document.body.innerText.includes(x), s);
  const cardOpen = () => page.evaluate(() => !!document.querySelector('.booking-modal-inner'));

  // ── ① 達している（黄の札1つ）
  head('① 9:00 が「達している」→ 車検の見出しの行に黄の札が1つ');
  const dEQ = await goScene('EQ');
  t('休業日でない日を選べた', !!dEQ, CAND.EQ);
  let c = await chips();
  t('★札が1つ出る', c.length === 1, c);
  const c0 = c[0] || {};
  t('★9:00 の札', c0.slot === '9:00', c0);
  t('★「達している」の印（黄）', c0.kind === 'equal' && c0.border === 'rgb(245, 158, 11)', c0);
  t('★札に 入庫の件数／対応の人数 が出る', /入庫 ?3件/.test(c0.text) && /対応 ?3名/.test(c0.text), c0.text);
  t('「オーバー」とは出ない', c0.text.indexOf('オーバー') < 0, c0.text);
  t('★置き場所は車検の見出しの行', c0.inHead === true, c0);
  t('★上の帯はもう無い（なぞる前は文面が画面に無い）', !(await bodyHas('入庫台数が対応スタッフ数')));
  t('★開いた直後だけ揺れる（vehMove ×4）', c0.anim === 'vehMove' && String(c0.iter) === '4', c0);
  const lEQ = await layout();
  t('見出しは1段に収まっている', lEQ.headH != null && lEQ.headH <= 40, lEQ);

  head('② なぞるとポップ・離すと消える');
  await page.hover('[data-staffalert="9:00"]');
  await page.waitForTimeout(250);
  let p = await pops();
  const p0 = p[0] || {};
  t('★ポップが出る', p.length === 1, p);
  t('★文面は帯の時と同じ', (p0.text || '').indexOf('【9:00枠】入庫台数が対応スタッフ数に達しています') >= 0, p0.text);
  t('内訳：車検2台・整備1件・合計3件', /車検 ?2台/.test(p0.text || '') && /整備 ?1件/.test(p0.text || '') && /合計 ?3件/.test(p0.text || ''), p0.text);
  t('内訳：フロント対応3名（出勤5名）', /フロント対応 ?3名/.test(p0.text || '') && (p0.text || '').indexOf('出勤5名') >= 0, p0.text);
  t('★ポップは画面に対して出す（fixed・body 直下）', p0.pos === 'fixed' && p0.inBody === true, p0);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.mouse.move(800, 700);
  await page.waitForTimeout(250);
  t('★離すと消える', (await pops()).length === 0);

  head('③ 押すと出したまま・ほかを押すと消える');
  await page.click('[data-staffalert="9:00"]');
  await page.mouse.move(800, 700);
  await page.waitForTimeout(250);
  t('★押したあと離れても出たまま', (await pops()).length === 1);
  t('★札を押しても予約カードは開かない', !(await cardOpen()));
  await page.mouse.click(800, 20);
  await page.waitForTimeout(250);
  t('★ほかを押すと消える', (await pops()).length === 0);
  await page.click('[data-staffalert="9:00"]');
  await page.waitForTimeout(150);
  await page.click('[data-staffalert="9:00"]');
  await page.mouse.move(800, 700);
  await page.waitForTimeout(250);
  t('★もう一度押しても消える', (await pops()).length === 0);

  // ── ④ 超えている＋達している
  head('④ 9:00「超えている」＋9:30「達している」→ 赤と黄の2つ');
  const dOV = await goScene('OVER');
  t('休業日でない日を選べた', !!dOV, CAND.OVER);
  c = await chips();
  t('★札が2つ出る', c.length === 2, c);
  const a9 = c.find(x => x.slot === '9:00') || {}, a930 = c.find(x => x.slot === '9:30') || {};
  t('★9:00 は赤（超えている）', a9.kind === 'over' && a9.border === 'rgb(239, 68, 68)', a9);
  t('★9:00 の札：入庫4件／対応3名　1件オーバー', /入庫 ?4件/.test(a9.text || '') && /対応 ?3名/.test(a9.text || '') && (a9.text || '').indexOf('1件オーバー') >= 0, a9.text);
  t('★9:30 は黄（達している）', a930.kind === 'equal' && /入庫 ?3件/.test(a930.text || ''), a930);
  t('並びは 9:00 → 9:30', a9.x < a930.x, [a9.x, a930.x]);
  await page.hover('[data-staffalert="9:00"]');
  await page.waitForTimeout(250);
  p = await pops();
  t('★赤のポップ：超えています・1件オーバー', p.length === 1 && p[0].text.indexOf('【9:00枠】入庫台数が対応スタッフ数を超えています') >= 0 && p[0].text.indexOf('1件オーバー') >= 0, p);
  await page.mouse.move(800, 700);
  await page.waitForTimeout(200);
  const lOV = await layout();

  // ── ⑤ 出ない場面
  head('⑤ 足りている日・9時台に何も無い日は札を出さない');
  const dLOW = await goScene('LOW');
  t('休業日でない日を選べた（足りている日）', !!dLOW, CAND.LOW);
  t('★足りている日は札なし', (await chips()).length === 0, await chips());
  const dNONE = await goScene('NONE');
  t('休業日でない日を選べた（9時台なし）', !!dNONE, CAND.NONE);
  t('★9時台に何も無い日は札なし', (await chips()).length === 0, await chips());
  const lNONE = await layout();

  head('⑥ アラートが出ても予定表は下がらない');
  t('★車検の見出しの位置が、アラート2つの日と無い日で同じ', lOV.headTop != null && lOV.headTop === lNONE.headTop, [lOV, lNONE]);
  t('★タイムスケジュールの表の位置も同じ', lOV.tblTop != null && Math.abs(lOV.tblTop - lNONE.tblTop) <= 1, [lOV, lNONE]);

  head('⑦ JSエラー');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
