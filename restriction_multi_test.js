// 入庫制限を複数の時間帯にした検査（2026-10-03 ユーザー決定・B案＋①）
//   ① 今までの1区間のデータ（{startTime,endTime,exemptWorks}）がそのまま読める
//   ② 設定画面で時間帯を足して2区間にでき、{ranges:[...],exemptWorks:[...]} で保存される
//   ③ スケジュール表の上に区間が並んで出る（①案）
//   ④ 2つの区間の時間だけが制限され、間の時間は制限されない
//   ⑤ 終わりが始まりより前の区間は保存を弾く
//   実行: node restriction_multi_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8273, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    // 今までの形（1区間）で置く＝そのまま読めるかを見る
    schedRestrictions: { [DK]: { startTime: '10:00', endTime: '11:00', exemptWorks: ['B'] } },
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    // schedRestrictions は STOR 無しのキー名で持つが、Firestore 側は STOR を前置した名前になる
    const extra = '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  // ── ① 今までの1区間がそのまま読める ──
  console.log('\n■ ① 今までの1区間データがそのまま読める');
  t('上に「入庫制限 10:00〜11:00」が出る', await page.waitForFunction(() => /入庫制限\s*10:00〜11:00/.test(document.body.innerText), null, { timeout: 12000 }).then(() => true).catch(() => false),
    (await page.evaluate(() => document.body.innerText)).match(/入庫制限[^\n]*/g));
  const restrictedSlots = () => page.evaluate(() => [...document.querySelectorAll('tr')].filter(r => /入庫制限/.test(r.innerText)).map(r => (r.innerText.match(/^\s*(\d+:\d+)/) || [])[1]).filter(Boolean));
  t('10:00 の枠が制限の色になっている', await page.evaluate(() => {
    const r = [...document.querySelectorAll('tr')].find(x => /^\s*10:00/.test(x.innerText));
    if (!r) return false;
    const red = x => x === 'rgb(254, 226, 226)';
    const cell = r.querySelector('td');
    return red(getComputedStyle(r).backgroundColor) || (cell && red(getComputedStyle(cell).backgroundColor));
  }));

  // ── ② 設定画面で時間帯を足す ──
  console.log('\n■ ② 時間帯を足して2区間にする');
  t('入庫制限の設定を開ける', await clickText(page, '入庫制限'));
  t('設定画面が出る', await seeText(page, '制限する時間帯', 8000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('「1つめ」が 10:00〜11:00 で入っている', await page.evaluate(() => {
    const box = document.querySelector('.modal-box'); if (!box) return false;
    const sels = [...box.querySelectorAll('select')];
    return sels.length >= 2 && sels[0].value === '10:00' && sels[1].value === '11:00';
  }));
  t('「＋ 時間帯を追加」を押せた', await clickText(page, '時間帯を追加'));
  await page.waitForTimeout(400);
  t('2つめの行が増える', await page.evaluate(() => { const box = document.querySelector('.modal-box'); return box && box.innerText.includes('2つめ'); }));
  // 2つめを 14:00〜15:00 に
  await page.evaluate(() => {
    const box = document.querySelector('.modal-box');
    const sels = [...box.querySelectorAll('select')];
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set(sels[2], '14:00'); set(sels[3], '15:00');
  });
  await page.waitForTimeout(400);
  t('保存を押せた', await page.evaluate(() => { const box = document.querySelector('.modal-box'); const b = [...box.querySelectorAll('button')].find(e => e.innerText.includes('保存') && !e.innerText.includes('解除')); if (b) { b.click(); return true; } return false; }));
  t('★{ranges:[2本],exemptWorks} の形で保存される', await page.waitForFunction(([k, dk]) => {
    const v = (window.__fakeFb.get(k + 'schedRestrictions') || {})[dk];
    return !!v && Array.isArray(v.ranges) && v.ranges.length === 2
      && v.ranges[0].startTime === '10:00' && v.ranges[0].endTime === '11:00'
      && v.ranges[1].startTime === '14:00' && v.ranges[1].endTime === '15:00'
      && Array.isArray(v.exemptWorks) && v.exemptWorks.includes('B');
  }, [STOR, DK], { timeout: 20000 }).then(() => true).catch(() => false),
    await page.evaluate(([k, dk]) => (window.__fakeFb.get(k + 'schedRestrictions') || {})[dk], [STOR, DK]));

  // ── ③ 上に2区間が並ぶ ──
  console.log('\n■ ③ 上に区間が並んで出る');
  await page.waitForTimeout(1500);
  const head = await page.evaluate(() => (document.body.innerText.match(/入庫制限[^\n]*/g) || []).join(' | '));
  t('★「10:00〜11:00 ／ 14:00〜15:00」と並ぶ', /10:00〜11:00/.test(head) && /14:00〜15:00/.test(head), head);

  // ── ④ 間の時間は制限されない ──
  console.log('\n■ ④ 間の時間は制限されない');
  // 制限されている枠は行の地色が #fee2e2（rgb(254, 226, 226)）になる
  const marks = await page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('tr')].forEach(r => {
      const m = r.innerText.match(/^\s*(\d+:\d+)/);
      if (!m) return;
      const bg = getComputedStyle(r).backgroundColor;
      const cell = r.querySelector('td');
      const bg2 = cell ? getComputedStyle(cell).backgroundColor : '';
      const red = x => x === 'rgb(254, 226, 226)';
      if (out[m[1]] !== true) out[m[1]] = red(bg) || red(bg2);
    });
    return out;
  });
  t('10:00 は制限', marks['10:00'] === true, marks);
  t('12:00 は制限でない（間の時間）', marks['12:00'] !== true, marks);
  t('14:00 は制限', marks['14:00'] === true, marks);
  t('16:00 は制限でない', marks['16:00'] !== true, marks);

  // ── ⑤ 前後が逆な区間は弾く ──
  console.log('\n■ ⑤ 終わりが始まりより前なら保存しない');
  await clickText(page, '入庫制限');
  await seeText(page, '制限する時間帯', 8000);
  await page.evaluate(() => {
    const box = document.querySelector('.modal-box');
    const sels = [...box.querySelectorAll('select')];
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set(sels[0], '15:00'); set(sels[1], '10:00');   // 1つめを逆さにする
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const box = document.querySelector('.modal-box'); const b = [...box.querySelectorAll('button')].find(e => e.innerText.includes('保存') && !e.innerText.includes('解除')); if (b) b.click(); });
  await page.waitForTimeout(600);
  t('★知らせが出て保存されない', await page.evaluate(() => { const box = document.querySelector('.modal-box'); return !!box && /終わりが始まりより後になっていません/.test(box.innerText); }),
    await page.evaluate(() => { const b = document.querySelector('.modal-box'); return b ? b.innerText.slice(0, 300) : null; }));
  t('データは前のまま（2区間）', await page.evaluate(([k, dk]) => {
    const v = (window.__fakeFb.get(k + 'schedRestrictions') || {})[dk];
    return !!v && Array.isArray(v.ranges) && v.ranges.length === 2 && v.ranges[0].startTime === '10:00';
  }, [STOR, DK]));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-restriction-multi.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
