// 予約カードの代車「削除」は、予約確定を押すまでサーバーから消さない（2026-11-12 ユーザー指示）
//   ・削除したら代車管理表からは消えて見える（同じ車・同じ期間を選び直せる）
//   ・予約確定を押さずにカードを閉じたら、元の貸出がそのまま戻る
//   ・選び直して確定したら、古い帯は消えて新しい帯だけになる
const path = require('path'), fs = require('fs'), http = require('http');
const DIR = 'C:/Users/A/HUB-A-NICE-DAY-DEV';
let chromium;
for (const base of [DIR, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const NL = String.fromCharCode(10);
const PORT = 8473, STOR = 'hub-v8-dev-';
const FILE = process.env.HUB_FILE || 'index_dev.html';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  NG   ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };

const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const clickExact = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === x && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

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
const d = (p) => { const x = new Date(N); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dkey = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const dnum = (o) => o.y * 10000 + (o.m + 1) * 100 + o.d;
const TODAY = d(0), T1 = d(1), T2 = d(2), T3 = d(3);
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RENTS = [{ id: 101, name: 'ノマド', num: '3101' }];
const NAME = '辻井　博', RNAME = '古家　明';
const BK = 'insp-' + dkey(TODAY) + '-0';
const RBK = 'insp-' + dkey(TODAY) + '-1';

// 代車の表（data-ldaynum を持つ表）だけの中身
const loanerTableText = (page) => page.evaluate(() => {
  const th = document.querySelector('th[data-ldaynum]');
  if (!th) return '(表なし)';
  return th.closest('table').innerText;
});
const rentalTableText = (page) => page.evaluate(() => {
  const th = document.querySelector('th[data-rdaynum]');
  if (!th) return '(表なし)';
  return th.closest('table').innerText;
});
// その車の行の、その日のセルの座標（代車の表）
const cellAt = (page, num, carId) => page.evaluate(([n, cid]) => {
  const th = [...document.querySelectorAll('th[data-ldaynum]')];
  const me = th.find(e => e.getAttribute('data-ldaynum') === String(n));
  if (!me) return null;
  const tb = me.closest('table').querySelector('tbody');
  const tr = [...tb.querySelectorAll('tr')].find(r => String(r.getAttribute('data-lcar')) === String(cid))
    || [...tb.querySelectorAll('tr')][cid - 1];
  if (!tr) return null;
  const tds = [...tr.children];
  const idx = th.indexOf(me) + (tds.length - th.length);
  const cell = tds[idx];
  if (!cell) return null;
  const cr = cell.getBoundingClientRect();
  if (cr.width < 2) return null;
  return { x: Math.round(cr.x + cr.width / 2), y: Math.round(cr.y + cr.height / 2) };
}, [num, carId]);
const readKv = (page, k) => page.evaluate(x => { try { return window.__fakeFb.get(x); } catch (e) { return null; } }, STOR + k);
const closeCard = (page) => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  if (!box) return false;
  // カードの右上の閉じるボタンは文字ではなくアイコン（svg）なので、字の無いボタンで探す
  const b = [...box.querySelectorAll('button')].find(e => !(e.innerText || '').trim() && e.querySelector('svg'));
  if (b) { b.click(); return true; }
  return false;
});
const cardOpen = (page) => page.evaluate(() => !!document.querySelector('.booking-modal-inner'));
// カードの代車・レンタカー欄に出ている文字
const loanerFieldVal = (page) => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  if (!box) return '(カードなし)';
  const lb = [...box.querySelectorAll('label')].find(e => (e.innerText || '').indexOf('代車・レンタカー') >= 0);
  if (!lb) return '(欄なし)';
  const inp = lb.parentElement.querySelector('input');
  return inp ? (inp.value || '') : '(入力欄なし)';
});
const resCount = (lres, carId, bk) => {
  const days = (lres && lres[carId]) || {};
  return Object.values(days).filter(r => r && (!bk || r.bookingKey === bk)).length;
};

(async () => {
  const seed = {};
  seed[STOR + 'insp'] = (function () {
    const o = {};
    o[dkey(TODAY)] = [
      { name: NAME, carType: 'アルト', no: '1234', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, bookingKey: BK, loaner: 'ハスラー (7074)', loanerId: 1 },
      { name: RNAME, carType: 'ワゴンR', no: '5678', time: '10:00', course: 2, store: 'honten', seq: 2, id: 2, bookingKey: RBK, rentalLabel: '🔑 ノマド (3101)', rentalCarId: 101 },
    ];
    return o;
  })();
  seed[STOR + 'honten-sched'] = {}; seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-memo'] = {}; seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-cars'] = CARS; seed[STOR + 'sanda-cars'] = [];
  seed[STOR + 'rentalcars'] = RENTS;
  seed[STOR + 'honten-lres'] = {
    '1': { [dkey(TODAY)]: { id: 1001, user: NAME, bookingKey: BK, fy: TODAY.y, fm: TODAY.m, fd: TODAY.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ハスラー', carNum: '7074' } },
  };
  seed[STOR + 'sanda-lres'] = {};
  seed[STOR + 'rres'] = {
    '101': { [dkey(TODAY)]: { id: 2001, user: RNAME, bookingKey: RBK, fy: TODAY.y, fm: TODAY.m, fd: TODAY.d, ty: T1.y, tm: T1.m, td: T1.d, carName: 'ノマド', carNum: '3101' } },
  };

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;'));
      return;
    }
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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/' + FILE, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(800);
  const toSched = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
    await page.waitForTimeout(1200);
  };
  const openCard = async (who) => {
    await toSched();
    await page.getByText(who.slice(0, 2), { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
  };
  await toSched();

  console.log(NL + '■ ① 削除してもサーバーにはまだ書かない（代車）');
  await openCard(NAME);
  ok(await cardOpen(page), '予約カードが開く');
  ok(/ハスラー/.test(await loanerFieldVal(page)), '代車欄にハスラーが出ている', await loanerFieldVal(page));
  ok(await clickExact(page, '削除'), '「削除」を押せた');
  await page.waitForTimeout(1200);
  ok((await loanerFieldVal(page)) === '', '★削除したら代車欄が空になる', await loanerFieldVal(page));
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '1', BK) === 1, '★サーバーの貸出はまだ残っている（確定していないので消さない）', resCount(lres, '1', BK));
  }

  console.log(NL + '■ ② 代車管理表では消えて見える（選び直せる）');
  ok(await clickExact(page, '選択'), '「選択」を押せた');
  await page.waitForTimeout(1600);
  ok(await seeText(page, '予約カードに戻る', 6000), '代車管理表（選ぶ画面）が開く');
  {
    const t = await loanerTableText(page);
    ok(t.indexOf('辻井') < 0, '★削除した帯が代車管理表から消えている', t.slice(0, 120));
  }

  console.log(NL + '■ ③ 予約カードに戻ってから閉じると、元の貸出が戻る');
  ok(await clickText(page, '予約カードに戻る'), '「予約カードに戻る」を押せた');
  await page.waitForTimeout(1500);
  ok(await cardOpen(page), 'カードが戻ってくる');
  ok(await closeCard(page), 'カードを ✕ で閉じた');
  await page.waitForTimeout(1500);
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '1', BK) === 1, '★確定していないので貸出はそのまま残る', resCount(lres, '1', BK));
    const insp = await readKv(page, 'insp');
    const row = ((insp || {})[dkey(TODAY)] || [])[0] || {};
    ok(row.loaner === 'ハスラー (7074)', '★予約カードの代車名もそのまま残る', row.loaner);
  }
  await toSched();
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('代車管理') && el.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1600);
  {
    const t = await loanerTableText(page);
    ok(t.indexOf('辻井') >= 0, '★代車管理表にも帯が戻っている', t.slice(0, 120));
  }
  ok(await clickText(page, 'スケジュールに戻る'), '代車管理を閉じた');
  await page.waitForTimeout(1000);

  console.log(NL + '■ ④ 削除 → 別の車を選び直して確定 → 予約確定で入れ替わる');
  await openCard(NAME);
  ok(await cardOpen(page), 'カードをもう一度開いた');
  ok(await clickExact(page, '削除'), '「削除」を押せた');
  await page.waitForTimeout(900);
  ok(await clickExact(page, '選択'), '「選択」を押せた');
  await page.waitForTimeout(1600);
  const c2 = await cellAt(page, dnum(T2), 2);
  ok(!!c2, 'スペーシアの行のセルが取れた', c2);
  if (c2) {
    await page.mouse.move(c2.x, c2.y); await page.mouse.down();
    await page.mouse.move(c2.x + 44, c2.y, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(900);
  }
  ok(await clickText(page, '✓ 確定'), '代車を「✓ 確定」で選べた');
  await page.waitForTimeout(1800);
  ok(await cardOpen(page), '★代車を選んだあと予約カードが戻ってくる');
  ok(/スペーシア/.test(await loanerFieldVal(page)), '代車欄がスペーシアになる', await loanerFieldVal(page));
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '1', BK) === 1, '★まだ確定していないので古い帯も残っている', resCount(lres, '1', BK));
  }
  const saved = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    if (!box) return false;
    const b = [...box.querySelectorAll('button')].find(e => /確定して登録|内容を保存/.test(e.innerText || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  ok(saved, '保存（予約確定）を押せた');
  await page.waitForTimeout(3500);
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '1', BK) === 0, '★確定したら古い代車（ハスラー）の帯は消える', resCount(lres, '1', BK));
    ok(resCount(lres, '2', '') >= 1, '★新しい代車（スペーシア）の帯が入る', resCount(lres, '2', ''));
    const insp = await readKv(page, 'insp');
    const row = ((insp || {})[dkey(TODAY)] || []).find(r => r && r.name === NAME) || {};
    ok(/スペーシア/.test(row.loaner || ''), '予約カードの代車名もスペーシアになる', row.loaner);
  }

  console.log(NL + '■ ⑤ 削除だけして予約確定 → その時に初めて消える');
  await openCard(NAME);
  ok(await cardOpen(page), 'カードを開いた');
  ok(await clickExact(page, '削除'), '「削除」を押せた');
  await page.waitForTimeout(900);
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '2', '') >= 1, '押した時点ではまだ消えていない', resCount(lres, '2', ''));
  }
  const saved2 = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    if (!box) return false;
    const b = [...box.querySelectorAll('button')].find(e => /確定して登録|内容を保存/.test(e.innerText || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  ok(saved2, '保存（予約確定）を押せた');
  await page.waitForTimeout(3500);
  {
    const lres = await readKv(page, 'honten-lres');
    ok(resCount(lres, '2', '') === 0, '★予約確定を押したら代車の帯が消える', resCount(lres, '2', ''));
    const insp = await readKv(page, 'insp');
    const row = ((insp || {})[dkey(TODAY)] || []).find(r => r && r.name === NAME) || {};
    ok(!row.loaner, '★予約カードの代車名も空になる', row.loaner);
  }

  console.log(NL + '■ ⑥ レンタカーも同じ（削除して閉じたら戻る）');
  await openCard(RNAME);
  ok(await cardOpen(page), 'レンタカーの予約カードを開いた');
  ok(/ノマド/.test(await loanerFieldVal(page)), 'レンタカー欄にノマドが出ている', await loanerFieldVal(page));
  ok(await clickExact(page, '削除'), '「削除」を押せた');
  await page.waitForTimeout(1200);
  {
    const rres = await readKv(page, 'rres');
    ok(resCount(rres, '101', RBK) === 1, '★サーバーのレンタカー予約はまだ残っている', resCount(rres, '101', RBK));
  }
  ok(await closeCard(page), 'カードを ✕ で閉じた');
  await page.waitForTimeout(1500);
  {
    const rres = await readKv(page, 'rres');
    ok(resCount(rres, '101', RBK) === 1, '★閉じただけならレンタカー予約は戻る', resCount(rres, '101', RBK));
    const insp = await readKv(page, 'insp');
    const row = ((insp || {})[dkey(TODAY)] || []).find(r => r && r.name === RNAME) || {};
    ok(/ノマド/.test(row.rentalLabel || ''), '★カードのレンタカー名もそのまま残る', row.rentalLabel);
  }

  console.log(NL + '■ ⑦ レンタカーも、予約確定を押した時に消える');
  await openCard(RNAME);
  ok(await cardOpen(page), 'カードを開いた');
  ok(await clickExact(page, '削除'), '「削除」を押せた');
  await page.waitForTimeout(900);
  const saved3 = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner');
    if (!box) return false;
    const b = [...box.querySelectorAll('button')].find(e => /確定して登録|内容を保存/.test(e.innerText || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  ok(saved3, '保存（予約確定）を押せた');
  await page.waitForTimeout(3500);
  {
    const rres = await readKv(page, 'rres');
    ok(resCount(rres, '101', RBK) === 0, '★予約確定を押したらレンタカー予約が消える', resCount(rres, '101', RBK));
  }

  console.log(NL + '■ ⑨ 週間カレンダーから開いたカードで「選択」を押すと、代車管理表が見える');
  // ★週表の覆い（zIndex 900）を開いたままだと、代車管理（zIndex 10）がその下に隠れ、
  //   「予約カードだけが消えた」ように見える（2026-11-12 ユーザー報告）。
  await toSched();
  await page.evaluate(() => { const b = document.querySelector('[data-weekbtn]'); if (b) b.click(); });
  await page.waitForTimeout(1600);
  ok(await page.evaluate(() => !!document.querySelector('[data-wcb]')), '週間カレンダーが開いて車検のバッジが出ている');
  await page.evaluate(() => { const b = document.querySelector('[data-wcb]'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  ok(await cardOpen(page), '週表から予約カードが開く');
  ok(await clickExact(page, '選択'), '「選択」を押せた');
  await page.waitForTimeout(1700);
  ok(await seeText(page, '予約カードに戻る', 6000), '代車管理表が開く');
  {
    const vis = await page.evaluate(() => {
      // 画面の中に入っている日の見出しを選ぶ（横スクロールで外に出ているものがある）
      const th = [...document.querySelectorAll('th[data-ldaynum]')].find(e => {
        const q = e.getBoundingClientRect();
        return q.width > 2 && q.x > 130 && q.x + q.width < window.innerWidth && q.y > 0 && q.y + q.height < window.innerHeight;
      });
      if (!th) return { ok: false, why: '表が無い' };
      const r = th.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
      return { ok: !!(el && el.closest('table') === th.closest('table')), why: el ? (el.tagName + ':' + (el.getAttribute('data-wfold') || el.className || '')) : 'なし' };
    });
    ok(vis.ok, '★代車管理表が覆いの下に隠れていない（指で触れる）', vis.why);
  }
  ok(!(await page.evaluate(() => !!document.querySelector('[data-wcb]'))), '★代車を選びに行く時は週間カレンダーを閉じる');
  ok(await clickText(page, '予約カードに戻る'), '「予約カードに戻る」を押せた');
  await page.waitForTimeout(1500);
  ok(await cardOpen(page), '予約カードが戻ってくる');
  await closeCard(page);
  await page.waitForTimeout(900);

  console.log(NL + '■ ⑧ 作りの見張り（ファイルの中身）');
  const src = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  ok(/const dropPendRes=/.test(src), 'dropPendRes（画面だけ消して見せる道具）がある');
  ok(/setPendLoanerDrop\(\{carId/.test(src), '削除は印を立てるだけになっている');
  ok(!/setPendingRentalRec\(prev=>\{\s*\n?\s*if\(prev\)deleteRentalRes/.test(src), 'レンタカーの削除がその場で deleteRentalRes を呼んでいない');
  {
    const fn = src.slice(src.indexOf('const handleDeleteLoaner'), src.indexOf('const handleDeleteLoaner') + 1600);
    ok(fn.indexOf('persistLres') < 0, '★handleDeleteLoaner がサーバーに書いていない');
    ok(fn.indexOf('deleteRentalRes') < 0, '★handleDeleteLoaner がレンタカーも消していない');
  }
  ok(/loanerRes=\{loanerResView\}/.test(src), '画面には印を抜いた控えを渡している');
  ok(/rentalRes=\{rentalResView\}/.test(src), 'レンタカーの表も控えを渡している');

  console.log(NL + 'ページのエラー: ' + (errs.length ? errs.slice(0, 3).join(' / ') : 'なし'));
  if (errs.length) fail++;
  console.log(NL + '===== ' + FILE + ' : ' + pass + '件 合格 / ' + fail + '件 不合格 =====');
  await ctx.close(); await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
