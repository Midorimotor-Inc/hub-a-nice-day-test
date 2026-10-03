// マッハ車検の入庫時間から1時間を自動で入庫制限にする検査（本店のみ・2026-10-05 ユーザー指示）
//   ① マッハ 10:00 → 10:00〜11:00 が自動で制限になり、網掛けに「マッハ車検」と出る
//   ② 制限中はクイック整備・点検・リコールを断る／納車などの免除項目は入れられる
//   ③ マッハより先に入っていた予定は、そのまま残る（特例）
//   ④ マッハの入庫時間を変えると、制限もその時間に移る
//   ⑤ 三田店には掛からない
//   ⑥ 入庫制限の設定画面に自動の区間が並び、🗑 で消せる
//   実行: node mach_restrict_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8303, STOR = 'hub-v8-dev-';
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
const MACH_SEQ = Date.now();                    // マッハを受け付けた時刻
const OLD_ID = MACH_SEQ - 600000;               // その10分前に入っていた予定（＝先にあった）

(async () => {
  const seed = {
    // 本店のマッハ 10:00（芝田）／三田店のマッハ 13:00（こちらは制限を作らない）
    [STOR + 'insp']: { [DK]: [
      { name: '芝田', carType: 'ワゴンR', course: 1, store: 'honten', staff: '', tokuten: '-', time: '10:00', bookingStatus: 'confirmed', seq: MACH_SEQ },
      { name: '三田太郎', carType: 'アルト', course: 1, store: 'sanda', staff: '', tokuten: '-', time: '13:00', bookingStatus: 'confirmed', seq: MACH_SEQ },
    ] },
    // 10:30 に「先に入っていた」クイック整備（at がマッハの seq より前）
    [STOR + 'honten-sched']: { [DK]: {
      '10:30': { name: '森本', carType: 'タント', work: 'Q', content: 'オイル交換', id: OLD_ID, at: OLD_ID, store: 'honten' },
    } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    'honten-schedRestrictions': {}, 'sanda-schedRestrictions': {},
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

  const red = () => page.evaluate(() => [...document.querySelectorAll('tr')]
    .filter(r => { const td = r.querySelector('td'); return getComputedStyle(r).backgroundColor === 'rgb(254, 226, 226)' || (td && getComputedStyle(td).backgroundColor === 'rgb(254, 226, 226)'); })
    .map(r => (r.innerText.match(/^\s*(\d+:\d+)/) || [])[1]).filter(Boolean));
  const band = () => page.evaluate(() => (document.body.innerText.match(/入庫制限[^\n]*/) || [''])[0]);

  head('① マッハ 10:00 → 10:00〜11:00 が自動で制限になる');
  t('マッハの予約が出ている', await seeText(page, '芝田', 8000));
  t('★上の帯に 10:00〜11:00 が出る', /10:00〜11:00/.test(await band()), await band());
  const r1 = await red();
  t('★10:00 と 10:30 が制限の色', r1.indexOf('10:00') >= 0 && r1.indexOf('10:30') >= 0, r1);
  t('11:00 は制限されない', r1.indexOf('11:00') < 0, r1);
  t('★網掛けに「マッハ車検」と出る', await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(x => /^\s*10:00/.test(x.innerText));
    return !!row && /マッハ車検/.test(row.innerText);
  }));

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


  head('② 自動の制限中も、免除項目なら入れられる');
  const rA = await addAt('10:00', '納車', 'のうしゃ太郎');
  t('★納車は入れられる', !!rA.saved, rA);
  const rB = await addAt('10:00', 'クイック整備', 'くいっく次郎');
  t('★クイック整備は断られる', !rB.saved, rB);
  t('「入庫制限中です」と出る', (rB.alerts||[]).some(x=>/入庫制限中/.test(x)), rB.alerts);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /^✕|×/.test(e.innerText.trim()) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);

  head('③ マッハより先に入っていた予定はそのまま（特例）');
  t('森本さんの予定が残っている', await seeText(page, '森本', 6000));
  t('★その行は網掛けにしない（白いまま）', await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(x => /森本/.test(x.innerText));
    if (!row) return false;
    const tds = [...row.querySelectorAll('td')];
    return tds.slice(1).every(td => getComputedStyle(td).backgroundColor !== 'rgb(254, 226, 226)');
  }));

  head('⑤ 三田店には掛からない');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim().indexOf('三田店') === 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1500);
  t('★三田店では自動制限が出ない', !/入庫制限[\s　]*\d+:\d+/.test(await page.evaluate(() => document.body.innerText)), await band());
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim().indexOf('本店') === 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1500);

  head('⑥ 入庫制限の設定画面に自動の区間が並ぶ');
  t('設定を開ける', await clickText(page, '入庫制限'));
  await page.waitForTimeout(800);
  t('「制限する時間帯」が出る', await seeText(page, '制限する時間帯', 6000));
  t('★自動の区間に「🚗 マッハ」の印が出る', await page.evaluate(() => /🚗 マッハ/.test(document.body.innerText)));
  t('時間が 10:00〜11:00 で入っている', await page.evaluate(() => {
    const box = document.querySelector('.modal-box'); if (!box) return false;
    const sels = [...box.querySelectorAll('select')];
    return sels.length >= 2 && sels[0].value === '10:00' && sels[1].value === '11:00';
  }));
  // 🗑 で消して保存 → 自動制限が消える
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '🗑' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2500);
  t('★🗑 で消すと制限が消える', !/入庫制限[\s　]*\d+:\d+/.test(await page.evaluate(() => document.body.innerText)), await band());
  const saved = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'honten-schedRestrictions');
  t('消したことがデータに残る（machOff）', !!(saved && saved[DK] && saved[DK].machOff), saved && saved[DK]);

  head('④ マッハの入庫時間を変えると、制限もその時間に移る');
  await page.evaluate(([k, dk, seq]) => {
    const insp = JSON.parse(JSON.stringify(window.__fakeFb.get(k) || {}));
    (insp[dk] || []).forEach(r => { if (r && r.name === '芝田') r.time = '14:00'; });
    window.__fakeFb.set(k, insp);
  }, [STOR + 'insp', DK, MACH_SEQ]);
  await page.waitForTimeout(2500);
  t('★14:00〜15:00 に移る', /14:00〜15:00/.test(await band()), await band());
  const r2 = await red();
  t('14:00・14:30 が制限の色', r2.indexOf('14:00') >= 0 && r2.indexOf('14:30') >= 0, r2);
  t('10:00 はもう制限されない', r2.indexOf('10:00') < 0, r2);
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await page.screenshot({ path: path.join(DIR, 'smoke-mach-restrict.png') });
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + '結果: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
