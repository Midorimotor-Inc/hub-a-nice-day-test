// 予約カードは「1回のクリック」で入力・一覧が出る（2026-11-12 ユーザー指示）
//   押した瞬間にカードがスクロールすると、欄が指の下から逃げて click が別の所に落ちる。
//   そのため 担当・作業内容・指見・入庫時間（押して開く欄）は2回押さないと開かなかった。
//   ★真ん中へ寄せる動き（B案・v3.65）は、クリックが終わったあとに効く＝今までどおり生きている。
const path = require('path'), fs = require('fs'), http = require('http');
const DIR = 'C:/Users/A/HUB-A-NICE-DAY-DEV';
let chromium;
for (const base of [DIR, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const NL = String.fromCharCode(10);
const PORT = 8475, STOR = 'hub-v8-dev-';
const FILE = process.env.HUB_FILE || 'index_dev.html';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  NG   ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };

const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const dkey = (x) => x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate();
const TODAY = dkey(N);

const cardOpen = (page) => page.evaluate(() => !!document.querySelector('.booking-modal-inner'));
const closeCard = (page) => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  if (!box) return false;
  const b = [...box.querySelectorAll('button')].find(e => !(e.innerText || '').trim() && e.querySelector('svg'));
  if (b) { b.click(); return true; }
  return false;
});
// その欄の真ん中の座標と、カードの中でどのくらい下にあるか（0〜1）
const spotOf = (page, sel) => page.evaluate(s => {
  const box = document.querySelector('.booking-modal-inner');
  const el = box && box.querySelector(s);
  if (!el) return null;
  const br = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
  const hitEl = document.elementFromPoint(x, y);
  return { x, y, hit: !!(hitEl && (hitEl === el || el.contains(hitEl) || hitEl.contains(el))),
    hitTag: hitEl ? (hitEl.tagName + '.' + String(hitEl.className || '').slice(0, 24)) : 'なし',
    rel: Math.round(((r.top + r.height / 2 - br.top) / br.height) * 100) / 100, top: Math.round(box.scrollTop) };
}, sel);
const seen = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const scrollTop = (page) => page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); return b ? Math.round(b.scrollTop) : -1; });

// 1回だけ本物のマウスで押す
const settle = async (page) => {
  // 寄せる動き（クリックのあと120ms＋なめらかスクロール）が終わるまで待つ
  let last = -999;
  for (let i = 0; i < 20; i++) {
    const t = await scrollTop(page);
    if (t === last) return t;
    last = t;
    await page.waitForTimeout(120);
  }
  return last;
};
const bringIn = async (page, sel) => {
  // ヘッダー（上に貼りつく帯）の下に隠れている時は、箱をスクロールして出す
  await page.evaluate(s => {
    const box = document.querySelector('.booking-modal-inner');
    const el = box && box.querySelector(s);
    if (!box || !el) return;
    const br = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    const want = box.scrollTop + (r.top + r.height / 2 - br.top) - br.height * 0.45;
    box.scrollTo({ top: Math.max(0, Math.min(box.scrollHeight - box.clientHeight, want)) });
  }, sel);
  await page.waitForTimeout(260);
};
const oneClick = async (page, sel) => {
  await settle(page);
  let p = await spotOf(page, sel);
  if (p && !p.hit) { if (process.env.DBG) console.log('   [dbg] かぶっていた →', p.hitTag); await bringIn(page, sel); p = await spotOf(page, sel); }
  if (!p) return null;
  if (process.env.DBG) console.log('   [dbg]', sel, JSON.stringify(p));
  // ★人は 100〜200ms ほど押している。押している間にカードが動くと click が別の所に落ちるので、
  //   delay を入れて本物のクリックに近づける（0ms だと動く前に離れてしまい、このバグを踏めない）。
  await page.mouse.click(p.x, p.y, { delay: 180 });
  await page.waitForTimeout(450);   // 2回目を押さずに、開いたかどうかだけ見る
  return p;
};

(async () => {
  const seed = {};
  seed[STOR + 'insp'] = (function () {
    const o = {};
    o[TODAY] = [{ name: '辻井　博', carType: 'アルト', no: '1234', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1 }];
    return o;
  })();
  seed[STOR + 'honten-sched'] = (function () {
    const o = {}; o[TODAY] = { '10:00': { name: '整備　一郎', carType: 'ワゴンR', work: 'Q', id: 7, at: 1, store: 'honten' } }; return o;
  })();
  seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-memo'] = {}; seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-staff-v2'] = [
    { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
    { uid: 'h8', name: '岡田　茂', myNumber: 8, badge: '', store: 'honten' },
  ];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-cars'] = [{ id: 1, name: 'ハスラー', num: '7074' }];
  seed[STOR + 'sanda-cars'] = [];
  seed[STOR + 'rentalcars'] = [];
  seed[STOR + 'honten-lres'] = {}; seed[STOR + 'sanda-lres'] = {}; seed[STOR + 'rres'] = {};

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
  // ★カードの中が必ずスクロールする高さにする（欄が真ん中より下に来る形で確かめたいため）
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 820 } });
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
  page.on('dialog', d => d.accept());

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
    await page.getByText(who, { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1300);
    if(process.env.DBG)console.log('   [dbg] open?',await page.evaluate(()=>({m:!!document.querySelector('.booking-modal-inner'),cls:[...document.querySelectorAll('div')].filter(e=>/slide-in/.test(e.className||'')).map(e=>e.className).slice(0,3),t:document.body.innerText.slice(0,80)})));
  };
  await toSched();
  if(process.env.DBG)console.log(await page.evaluate(()=>document.body.innerText.slice(0,700)));

  console.log(NL + '■ ① 一般整備の予約カード：1回のクリックで一覧が出る');
  await openCard('一郎');
  ok(await cardOpen(page), '一般予約カードが開く');
  {
    const p = await spotOf(page, '[data-kbkey="work"]');
    ok(!!p, '作業内容の欄がある', p);
    ok(!!p && p.rel > 0.5, '作業内容はカードの半分より下にある（寄せる動きが走る位置）', p && p.rel);
  }
  await oneClick(page, '[data-kbkey="work"]');
  ok(await seen(page, '[data-wkmodal]'), '★作業内容：1回のクリックで一覧（窓）が出る');
  await page.evaluate(() => { const b = document.querySelector('[data-wkgiveup]') || document.querySelector('[data-wkclose]'); if (b) b.click(); });
  await page.waitForTimeout(500);

  await oneClick(page, '[data-kbkey="shimi"]');
  ok(await seen(page, '[data-popgrid="shimi"]'), '★指・見：1回のクリックで一覧が出る');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  {
    const before = await scrollTop(page);
    const p = await oneClick(page, 'input[placeholder="担当者名 or 番号"]');
    ok(!!p, '担当の欄がある', p);
    ok(await seen(page, '[data-popgrid="staff"]'), '★担当：1回のクリックで一覧が出る');
    await page.waitForTimeout(700);   // 寄せる動き（クリックのあと120ms＋なめらかスクロール）
    const after = await scrollTop(page);
    ok(!!p && (p.rel <= 0.5 || after > before), '★クリックのあとに欄が真ん中へ寄る（B案は生きている）', { before, after, rel: p && p.rel });
  }
  await page.keyboard.press('Escape');
  await closeCard(page);
  await page.waitForTimeout(700);

  console.log(NL + '■ ② 車検の予約カード：1回のクリックで一覧が出る');
  await openCard('辻井');
  ok(await cardOpen(page), '車検予約カードが開く');
  await oneClick(page, '[data-insptime]');
  ok(await seen(page, '[data-popgrid="time"]'), '★入庫時間：1回のクリックで一覧が出る');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await oneClick(page, 'input[placeholder="担当者名 or 番号"]');
  ok(await seen(page, '[data-popgrid="staff"]'), '★担当：1回のクリックで一覧が出る（車検）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  console.log(NL + '■ ③ 1回のクリックでそのまま選べる（2回押さなくてよい）');
  // 前の手順で開いていたら閉じてから、1回だけ押して開く
  if (await seen(page, '[data-popgrid="time"]')) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await oneClick(page, '[data-insptime]');
  ok(await seen(page, '[data-popgrid="time"]'), '入庫時間の一覧が1回で開く（続けて押しても同じ）');
  const picked = await page.evaluate(() => {
    const el = document.querySelector('[data-tmid="11:00"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  ok(!!picked, '一覧の 11:00 が出ている', picked);
  if (picked) { await page.mouse.click(picked.x, picked.y); await page.waitForTimeout(600); }
  {
    const v = await page.evaluate(() => {
      const box = document.querySelector('.booking-modal-inner');
      const el = box && box.querySelector('[data-insptime]');
      return el ? el.innerText.replace(/\s/g, '') : '';
    });
    ok(/11:00/.test(v), '★選んだ時間が欄に入る', v);
  }

  console.log(NL + '■ ④ キーボードで送った時は今までどおり（その場で寄せる）');
  {
    const r = await page.evaluate(() => {
      const box = document.querySelector('.booking-modal-inner');
      const el = box && box.querySelector('input[placeholder="お客様名"]');
      if (!el) return null;
      el.focus();
      box.scrollTo({ top: 0 });
      return true;
    });
    ok(!!r, '氏名の欄にカーソルを入れた');
    const before = await scrollTop(page);
    let after = before, moved = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(260);
      after = await scrollTop(page);
      moved.push(await page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('data-kbkey') || a.getAttribute('placeholder') || a.tagName) : 'なし'; }));
      if (after > before) break;
    }
    ok(after > before, '★↓キーで送るとカードがスクロールする（キーボードはその場で寄せる）', { before, after, moved });
  }
  await closeCard(page);
  await page.waitForTimeout(500);

  console.log(NL + '■ ⑤ 作りの見張り（ファイルの中身）');
  const src = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  ok(/const centerFieldNow=/.test(src), 'centerFieldNow（その場で寄せる）がある');
  ok(/pendCenterRef/.test(src), 'クリック中は後回しにする控え（pendCenterRef）がある');
  ok(/onPointerDown=\{\(\)=>\{ptrDownRef\.current=Date\.now\(\)/.test(src), 'カードの枠で「押した」を見ている');
  ok(/onPointerUp=\{\(\)=>\{ptrDownRef\.current=0/.test(src), 'カードの枠で「離した」を見ている');

  console.log(NL + 'ページのエラー: ' + (errs.length ? errs.slice(0, 3).join(' / ') : 'なし'));
  if (errs.length) fail++;
  console.log(NL + '===== ' + FILE + ' : ' + pass + '件 合格 / ' + fail + '件 不合格 =====');
  await ctx.close(); await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
