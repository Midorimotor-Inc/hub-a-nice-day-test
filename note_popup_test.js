// 備考（車検）／内容（整備）をなぞると全文が出るかの検査（2026-10-05 ユーザー決定・A案）
//   ① 長い備考は2行までに畳まれる（表が間延びしない）
//   ② なぞると、その下に全文の吹き出しが出る（画面に対する固定位置）
//   ③ 短い備考では出さない
//   ④ 吹き出しを出しても、表のスクロールできる高さ・位置は変わらない
//   ⑤ 整備（内容）の欄でも同じように出る
//   実行: node note_popup_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8301, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const LONG = 'ティッシュ15箱・代車は前日夕方に取りに来られます。バッテリー弱り気味とのことで要点検。雨の日は入庫が遅れる可能性あり。見積は必ず電話で確認してから作業開始のこと';
const SHORT = '電話';
const LONG2 = '10時15分来店　ハスラーとソリオの乗り比べ希望。奥様も同乗されるのでチャイルドシート付きの車両を用意すること。待ち時間に商談あり応接の準備も。前回の見積書を持参されるので、担当者は事前に内容を確認しておくこと。終わり次第ご連絡ください';

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [
      { name: '中野　嘉久', carType: 'ロードスター', course: 2, store: 'honten', staff: '', tokuten: '-', note: LONG, time: '10:00', bookingStatus: 'confirmed', seq: 1 },
      { name: '椿', carType: 'セレナ', course: 2, store: 'honten', staff: '', tokuten: '-', note: SHORT, time: '14:00', bookingStatus: 'confirmed', seq: 2 },
    ] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { name: '瀧本', carType: 'スペカス', work: 'A', content: LONG2, id: 1, store: 'honten' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    'honten-schedRestrictions': {},
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
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('予約が出ている', await seeText(page, '中野', 8000));

  // 備考セル（その行の最後のセル）の位置を返す
  const cellBox = (who) => page.evaluate(n => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(n) >= 0);
    if (!row) return null;
    const td = [...row.querySelectorAll('td')].pop();
    if (!td) return null;
    const inner0 = td.querySelector('div > div');
    const b = (inner0 || td).getBoundingClientRect();   // 文字の箱の真ん中をなぞる（セルは横に長いことがある）
    const box = td.querySelector('div > div');
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: Math.round(b.height),
      inner: box ? { client: Math.round(box.clientHeight), scroll: Math.round(box.scrollHeight) } : null };
  }, who);
  const popInfo = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(e => /（全文）/.test(e.innerText || '') && getComputedStyle(e).position === 'fixed');
    if (!d) return null;
    const b = d.getBoundingClientRect(), st = getComputedStyle(d);
    return { text: d.innerText.replace(/\s+/g, ''), pos: st.position, pe: st.pointerEvents, inView: b.top >= 0 && b.bottom <= window.innerHeight + 1, w: Math.round(b.width) };
  });

  head('① 長い備考は畳まれている');
  const c1 = await cellBox('中野');
  t('備考のセルが見つかる', !!c1, c1);
  t('★2行ぶん（40px以内）に畳まれている', !!c1 && !!c1.inner && c1.inner.client <= 40, c1);
  t('中身は畳まれている（全文は隠れている）', !!c1 && !!c1.inner && c1.inner.scroll > c1.inner.client, c1 && c1.inner);
  t('畳んだ印（…）が出ている', await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('中野') >= 0);
    const td = row && [...row.querySelectorAll('td')].pop();
    return !!td && /…/.test(td.innerText);
  }));

  head('② なぞると全文の吹き出しが出る');
  const sc = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('中野') >= 0);
    let el = row && row.parentElement, found = null;
    while (el) { const st = getComputedStyle(el); if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) { found = el; break; } el = el.parentElement; }
    window.__sc = found || document.scrollingElement;
    return { sh: window.__sc.scrollHeight, st: window.__sc.scrollTop };
  });
  await page.mouse.move(c1.x, c1.y);
  await page.waitForTimeout(400);
  const p1 = await popInfo();
  t('★吹き出しが出る', !!p1, p1);
  t('全文が入っている', !!p1 && p1.text.indexOf('雨の日は入庫が遅れる') >= 0, p1 && p1.text.slice(0, 60));
  t('画面に対する固定位置（fixed）', !!p1 && p1.pos === 'fixed', p1);
  t('マウスを通す（pointer-events:none）', !!p1 && p1.pe === 'none', p1);
  t('画面の中に収まっている', !!p1 && p1.inView, p1);
  const after = await page.evaluate(() => ({ sh: window.__sc.scrollHeight, st: window.__sc.scrollTop }));
  t('④ 表の高さ・スクロール位置が動かない', sc.sh === after.sh && Math.abs(sc.st - after.st) < 2, { before: sc, after });

  head('③ 短い備考では出さない');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const c2 = await cellBox('椿');
  await page.mouse.move(c2.x, c2.y);
  await page.waitForTimeout(400);
  t('★短い備考では吹き出しを出さない', !(await popInfo()), await popInfo());

  head('⑤ 一般整備の「内容」でも出る');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('瀧本') >= 0); if (row) row.scrollIntoView({ block: 'center' }); });   // 上の帯に隠れない所まで送る
  await page.waitForTimeout(600);
  const c3 = await cellBox('瀧本');
  t('整備の行がある', !!c3, c3);
  t('整備の内容も畳まれている', !!c3 && !!c3.inner && c3.inner.scroll > c3.inner.client, c3 && c3.inner);
  await page.mouse.move(c3.x, c3.y);
  await page.waitForTimeout(400);
  const p3 = await popInfo();
  t('★吹き出しが出る', !!p3, p3);
  t('全文が入っている', !!p3 && p3.text.indexOf('応接の準備') >= 0, p3 && p3.text.slice(0, 60));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await page.screenshot({ path: path.join(DIR, 'smoke-note-popup.png') });
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + '結果: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
