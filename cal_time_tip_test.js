// 車検カレンダーの6コマ「なぞると入庫時間」の検査（v3.110.0・2026-11-10 ユーザー要望）
//   ユーザーの言葉：「車検カレンダーの、それぞれ車検の入庫時間を、マウスでなぞると出るように。
//     予約を取るとき、特にマッハ車検で、どの枠で取っているか、あちこちページに飛んだりしなくても
//     いいように」
//   ここで見ること：
//     ① 6コマの見た目は変えていない（3列・6コマ・色も今までどおり・素の title は使わない）
//     ② 予約が入っているコマをなぞると吹き出しが出る／離すと消える
//     ③ 中身に【入庫時間】が出る（10:00 入庫）
//     ④ コース・お名前（様つき）・車種・ナンバー・入庫店舗が出る
//     ⑤ マッハのコマには「この入庫から1時間は一般整備が入庫制限」が出る
//     ⑥ 午前・未定のような枠は「午前入庫」と出す（「午前入庫 入庫」にしない）
//     ⑦ 入庫時間が空なら「入庫時間が入っていません」
//     ⑧ 三田店入庫／承認待ちの ⚠
//     ⑨ 予約が入っていないコマには出さない
//   実行: node cal_time_tip_test.js
//        SHOT=<保存先.png> node cal_time_tip_test.js … なぞった時の見た目を撮る
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8465, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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

const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const dk = d => `${Y}-${M + 1}-${d}`;
// 6コマぶん。コースも時間も店もばらばらにして、どのコマの吹き出しかが分かるようにする
const FULL = [
  { name: '架空 一郎', carType: 'ハスラー', no: '3182', noChi: '神戸', noBun: '582', noKana: 'は', course: 1, store: 'honten', time: '10:00', bookingStatus: 'confirmed', seq: 1 },
  { name: '架空 二郎', carType: 'アルト', no: '1234', course: 2, store: 'honten', time: '09:30', bookingStatus: 'confirmed', seq: 2 },
  { name: '架空商事株式会社', carType: 'ハイエース', no: '7777', course: 3, store: 'honten', time: '午前', bookingStatus: 'confirmed', seq: 3 },
  { name: '架空 四郎', carType: 'スペーシア', no: '4444', course: 2, store: 'honten', time: '', bookingStatus: 'confirmed', seq: 4 },
  { name: '架空 五郎', carType: 'タント', no: '5555', course: 3, store: 'sanda', time: '14:00', bookingStatus: 'confirmed', seq: 5 },
  // ★承認待ちは【seq（予約を入れた順）】で決まる。6台しか無い日は起動時に承認待ちが外れる
  //   （recomputeInspApproval が枠内に繰り上げる）ので、6コマに見える承認待ちを作るには
  //   7台にして、この人の seq を一番後ろにする（2026-10-29 の 10/11 と同じ形）。
  { name: '架空 六郎', carType: 'ワゴンR', no: '6666', course: 1, store: 'honten', time: '16:00', bookingStatus: 'confirmed', seq: 999, pendingApproval: true },
  { name: '架空 七郎', carType: 'ムーヴ', no: '8888', course: 2, store: 'honten', time: '17:00', bookingStatus: 'confirmed', seq: 7 },
];
const SMALL = [FULL[0], FULL[1]];
// 休業日（祝日・第2火曜）に当たっても困らないように候補日をいくつか置き、
// 実際に6コマが描かれた日を使う
const FULL_DAYS = [4, 5, 6, 7], SMALL_DAYS = [14, 15, 16, 17];

(async () => {
  const insp = {};
  FULL_DAYS.forEach(d => { insp[dk(d)] = FULL.map(r => Object.assign({}, r)); });
  SMALL_DAYS.forEach(d => { insp[dk(d)] = SMALL.map(r => Object.assign({}, r)); });
  const seed = {
    [STOR + 'insp']: insp,
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
    [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
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
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await clickText(page, 'カレンダー');
  await page.waitForTimeout(1500);

  // 日のマスを読む（日付の数字 → 6コマ・吹き出しの出るコマ・コマの座標）
  const readCells = () => page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('div')].forEach(d => {
      const num = d.querySelector(':scope > div > span');
      if (!num) return;
      const n = Number(String(num.innerText || '').trim());
      if (!n) return;
      const g = [...d.querySelectorAll(':scope > div')].find(x => getComputedStyle(x).gridTemplateColumns.split(' ').length === 3 && x.children.length >= 6);
      if (!g) return;
      const koma = [...g.children].filter(x => x.tagName === 'DIV');
      out[n] = {
        cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
        koma: koma.length,
        tips: koma.filter(x => x.getAttribute('data-insptip')).length,
        titles: koma.filter(x => x.getAttribute('title')).length,
        rects: koma.map(x => { const r = x.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tip: !!x.getAttribute('data-insptip'), bg: getComputedStyle(x).backgroundColor }; }),
      };
    });
    return out;
  });
  const hover = async (day, i) => {
    const c = (await readCells())[day];
    if (!c || !c.rects[i]) return null;
    await page.mouse.move(c.rects[i].x, c.rects[i].y);
    await page.waitForTimeout(240);
    return await page.evaluate(() => {
      const b = document.querySelector('[data-insptipbox]');
      if (!b) return null;
      const r = b.getBoundingClientRect(), tm = b.querySelector('[data-insptiptime]');
      return { n: document.querySelectorAll('[data-insptipbox]').length,
        text: (b.innerText || '').replace(/\s+/g, ' ').trim(),
        time: tm ? (tm.innerText || '').replace(/\s+/g, ' ').trim() : '',
        fixed: getComputedStyle(b).position,
        left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
        win: { w: window.innerWidth, h: window.innerHeight } };
    });
  };
  const away = async () => { await page.mouse.move(5, 5); await page.waitForTimeout(240); };

  const cells = await readCells();
  const fullDay = FULL_DAYS.find(d => cells[d] && cells[d].tips === 6);
  const smallDay = SMALL_DAYS.find(d => cells[d] && cells[d].tips === 2);

  head('① 6コマの見た目は変えていない');
  t('6コマの日が描かれている（候補 ' + FULL_DAYS.join('/') + '）', !!fullDay, Object.keys(cells).map(k => k + ':' + cells[k].tips).join(' '));
  if (fullDay) {
    const C = cells[fullDay];
    t('3列のまま', C.cols === 3, C.cols);
    t('コマは6つのまま', C.koma === 6, C.koma);
    t('コマの色は今までどおり（マッハは赤系の地）', /252, 165, 165/.test(C.rects[0].bg), C.rects[0].bg);
    t('★素の title は付けていない', C.titles === 0, C.titles);
    t('なぞる前は吹き出しが出ていない', !(await page.$('[data-insptipbox]')));

    head('②③④ 1コマめ（マッハ・10:00・本店）をなぞる');
    const a = await hover(fullDay, 0);
    t('吹き出しが出る', !!a, a);
    t('出るのは1つだけ', !!a && a.n === 1, a && a.n);
    t('★入庫時間が出る（10:00 入庫）', !!a && /10:00\s*入庫/.test(a.time), a && a.time);
    t('コース名が出る（マッハ車検）', !!a && a.text.indexOf('マッハ車検') >= 0, a && a.text);
    t('お名前に「様」が付く', !!a && /架空 一郎\s*様/.test(a.text), a && a.text);
    t('車種とフルナンバーが出る', !!a && a.text.indexOf('ハスラー') >= 0 && a.text.indexOf('神戸582は3182') >= 0, a && a.text);
    t('入庫店舗が出る（本店入庫）', !!a && a.text.indexOf('本店入庫') >= 0, a && a.text);
    t('★画面に対して出している（position:fixed）', !!a && a.fixed === 'fixed', a && a.fixed);
    t('★画面の外へはみ出さない', !!a && a.left >= 0 && a.right <= a.win.w && a.top >= 0 && a.bottom <= a.win.h, a);
    head('⑤ マッハのコマは入庫制限の案内も出す');
    t('★「1時間は 一般整備が入庫制限」と出る', !!a && /1時間は 一般整備が入庫制限/.test(a.text), a && a.text);
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

    head('② 離すと消える');
    await away();
    t('マウスを外すと消える', !(await page.$('[data-insptipbox]')));

    head('④-2 2コマめ（クイック・09:30）');
    const b = await hover(fullDay, 1);
    t('09:30 入庫 と出る', !!b && /09:30\s*入庫/.test(b.time), b && b.time);
    t('クイック車検 と出る', !!b && b.text.indexOf('クイック車検') >= 0, b && b.text);
    t('マッハの案内は出さない', !!b && b.text.indexOf('入庫制限') < 0, b && b.text);
    await away();

    head('⑥ 午前・未定の枠は言葉のまま');
    const c2 = await hover(fullDay, 2);
    t('★「午前入庫」と出る（「午前入庫 入庫」にしない）', !!c2 && /午前入庫/.test(c2.time) && !/午前入庫 入庫/.test(c2.time), c2 && c2.time);
    t('長い会社名も「様」付きで出る', !!c2 && /様/.test(c2.text), c2 && c2.text);
    await away();

    head('⑦ 入庫時間が空のとき');
    const d2 = await hover(fullDay, 3);
    t('★「入庫時間が入っていません」と出る', !!d2 && d2.time.indexOf('入庫時間が入っていません') >= 0, d2 && d2.time);
    await away();

    head('⑧ 三田店入庫／承認待ち');
    const e2 = await hover(fullDay, 4);
    t('三田店入庫 と出る', !!e2 && e2.text.indexOf('三田店入庫') >= 0, e2 && e2.text);
    await away();
    const f2 = await hover(fullDay, 5);
    t('★承認待ちは ⚠ が出る', !!f2 && /まだ承認されていません/.test(f2.text), f2 && f2.text);
    t('16:00 入庫 と出る', !!f2 && /16:00\s*入庫/.test(f2.time), f2 && f2.time);
    await away();
  }

  head('⑨ 予約が入っていないコマには出さない');
  t('2台の日が描かれている（候補 ' + SMALL_DAYS.join('/') + '）', !!smallDay, smallDay);
  if (smallDay) {
    const C = cells[smallDay];
    t('★吹き出しが出るのは2コマだけ', C.tips === 2, C.tips);
    t('コマそのものは6つのまま', C.koma === 6, C.koma);
    const empty = C.rects.findIndex(x => !x.tip);
    const g2 = await hover(smallDay, empty);
    t('★空のコマをなぞっても出ない', !g2, g2 && g2.text);
    await away();
  }

  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
