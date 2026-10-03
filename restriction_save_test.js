// 入庫制限を掛けた日に、整備の予約が保存できるかの検査（2026-10-04 現場報告）
//   報告：10/3（制限 09:00-11:00 ／ 14:00-17:00・鈑金は制限解除）で 16:30 に鈑金の予定が入らない。
//   原因：v3.25 の複数区間対応で startMin/endMin（1区間だった頃の変数）を消し忘れ、
//        制限を掛けた日は【どの時間でも】保存が実行時エラーで落ちていた。
//   ここで見ること：
//     ① 制限時間の中でも、制限解除の作業（鈑金）なら保存できる
//     ② 制限時間の中で、解除されていない作業は今までどおり断られる
//     ③ 制限時間の外（区間の間の時間）は、どの作業でも保存できる
//   実行: node restriction_save_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8299, STOR = 'hub-v8-dev-';
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

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    // 本番 10/3 と同じ形：2区間・鈑金(B)ほかが制限解除
    schedRestrictions: { [DK]: { ranges: [{ startTime: '09:00', endTime: '11:00' }, { startTime: '14:00', endTime: '17:00' }], exemptWorks: ['保', '納', '試', '商', 'B'] } },
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
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('制限の帯が出ている', await seeText(page, '入庫制限', 10000));

  // 指定の時間の空き行をクリックして予約カードを開き、名前と作業内容を入れて保存する
  const addAt = async (slot, workName, name) => {
    alerts.length = 0;
    await page.evaluate(s => {
      const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(s) === 0);
      if (!row) return false;
      // 空き行は中の「クリックして追加」を押す（行の枠ではなく中身にクリックが効く）
      const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
      (inner || row).click();
      return true;
    }, slot);
    await page.waitForTimeout(800);
    if(process.env.DBG)console.log("   [debug] 行:", JSON.stringify(await page.evaluate(x=>{const rs=[...document.querySelectorAll("tr")].map(r=>r.innerText.slice(0,40));return rs.filter(t=>t.indexOf(x)>=0);},slot)), "カード:", await page.evaluate(()=>/予約カード/.test(document.body.innerText)));
    const opened = await page.evaluate(() => /予約カード/.test(document.body.innerText));
    if (!opened) return { opened: false };
    // 氏名と車種（カードの必須）を入れる。モーダルの中の、見えている文字入力の1つめ・2つめ
    await page.evaluate(n => {
      const modal = document.querySelector('.booking-modal-inner') || document;
      const boxes = [...modal.querySelectorAll('input')].filter(e => e.offsetParent !== null && !['date', 'checkbox', 'radio', 'number'].includes(e.type));
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const byPh = p => boxes.find(e => (e.placeholder || '').indexOf(p) >= 0);
      const nameBox = byPh('お客様名') || boxes[0];
      const carBox = byPh('例：プリウス');
      if (nameBox) set(nameBox, n);
      if (carBox) set(carBox, 'テスト車');
      return boxes.length;
    }, name);
    // 作業内容は select ではなく自前の選択欄（data-kbkey="work" を押すと一覧が開く）
    await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(w => {
      const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').includes(w));
      if (!it) return false;
      it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // 選択は mousedown で確定する作り
      return true;
    }, workName);
    await page.waitForTimeout(300);
    if(process.env.DBG)console.log("   [debug] select:", JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll("select")].filter(e=>e.offsetParent!==null).map(e=>({v:e.value,opts:[...e.options].slice(0,4).map(o=>o.text)})))));
    if(process.env.DBG)console.log("   [debug] 入力欄:", JSON.stringify(await page.evaluate(()=>{const m=document.querySelector(".booking-modal-inner")||document;return [...m.querySelectorAll("input")].filter(e=>e.offsetParent!==null).map(e=>({t:e.type,ph:e.placeholder||"",v:e.value}));})));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(2200);
    const sd = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-sched');
    const day = (sd && sd[Object.keys(sd)[0]]) || {};
    const saved = Object.values(day).some(r => r && r.name === name);
    return { opened: true, saved, alerts: [...alerts] };
  };

  head('① 制限時間の中でも、制限解除の作業（鈑金）なら保存できる');
  const r1 = await addAt('16:30', '鈑金', 'ばんきん太郎');
  t('予約カードが開く', r1.opened, r1);
  t('★16:30 に鈑金で保存できる', !!r1.saved, r1);
  t('断りのメッセージは出ない', !(r1.alerts || []).some(a => /入庫制限中/.test(a)), r1.alerts);
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 2));

  head('② 解除されていない作業は、今までどおり断られる');
  const r2 = await addAt('16:30', 'クイック整備', 'くいっく次郎');
  t('★保存されない', !r2.saved, r2);
  t('「入庫制限中です」と出る', (r2.alerts || []).some(a => /入庫制限中/.test(a)), r2.alerts);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /^✕|×/.test(e.innerText.trim()) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);

  head('③ 制限時間の外（区間の間）は、どの作業でも保存できる');
  const r3 = await addAt('13:00', 'クイック整備', 'あいだ三郎');
  t('★13:00 は保存できる', !!r3.saved, r3);
  t('JSエラーが出ていない（通し）', errs.length === 0, errs.slice(0, 2));

  await page.screenshot({ path: path.join(DIR, 'smoke-restriction-save.png') });
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + `結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
