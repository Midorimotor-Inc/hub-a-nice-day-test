// 車両管理 v2 の検査（2026-10-05 ユーザー打ち合わせ）
//   ① エクセルから取り込んだ車が一覧に出る（工場代車とレンタカーが別の表）
//   ② 並びはエクセルと同じで、タイヤ（夏冬）が左端先頭
//   ③ タイヤの夏冬はクリックで切り替わり、保存される
//   ④ 赤網掛け＝アーカイブに入っていて、一覧には出ない。見ることも戻すこともできる
//   ⑤ 点検アラート：スズキ車は出る／スズキ以外は出ない（レンタカーは出る）
//   ⑥ 所在地は本店・三田店の2つだけ
//   ⑦ 手で追加する時、最低限の項目が無いと保存できない
//   実行: node vehicle_v2_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8305, STOR = 'hub-v8-dev-';
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
const iso = d => d.toISOString().slice(0, 10);
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const minus = n => plus(-n);

(async () => {
  const vehicles = [
    // スズキの代車：6か月点検が近い（登録を5.5か月前にする）
    { id: 'v1', group: 'factory', name: 'ハスラー タフワイルド ホワイト', num: '神戸58Aい7177', plate4: '7177', maker: 'スズキ',
      colorHex: '#f8fafc', purpose: 'loaner', store: 'honten', tire: 'summer', insurance: true, nav: 'MDV-L308W',
      regDate: minus(160), firstReg: minus(160).slice(0, 7), expiry: plus(900), inspections: { m1: { doneAt: minus(120) }, m6: {}, m12: [] }, archived: false },
    // スズキ以外の代車：アラートを出さない
    { id: 'v2', group: 'factory', name: 'ヴォクシー S-Z', num: '神戸302あ184', plate4: '184', maker: 'トヨタ',
      colorHex: '#374151', purpose: 'company', user: '中井さん', store: 'sanda', tire: 'winter', insurance: true,
      regDate: minus(160), firstReg: minus(160).slice(0, 7), expiry: plus(400), inspections: { m1: {}, m6: {}, m12: [] }, archived: false },
    // スズキ以外のレンタカー：アラートを出す
    { id: 'v3', group: 'rental', name: 'ヴォクシー S-Z（レンタ）', num: '神戸303わ3869', plate4: '3869', maker: 'トヨタ',
      colorHex: '#374151', purpose: 'rental', store: 'honten', tire: 'summer', insurance: true,
      regDate: minus(160), firstReg: minus(160).slice(0, 7), expiry: plus(500), inspections: { m1: { doneAt: minus(120) }, m6: {}, m12: [] }, archived: false },
    // 日付なしで「済」になっているレンタカー（＝レンタカーは全部点検済み）
    { id: 'v5', group: 'rental', name: 'ソリオバンディット（済）', num: '神戸505わ4230', plate4: '4230', maker: 'スズキ',
      colorHex: '#78350f', purpose: 'rental', store: 'honten', tire: 'summer', insurance: true,
      regDate: minus(400), firstReg: minus(400).slice(0,7), expiry: plus(300),
      inspections: { m1:{done:true,doneAt:''}, m6:{done:true,doneAt:''}, m12:[{done:true,doneAt:''}] }, archived:false },
    // 車検が切れている車（「○日超過」を出さないこと）
    { id: 'v6', group: 'factory', name: '期限切れスペーシア', num: '神戸582あ9999', plate4: '9999', maker: 'スズキ',
      colorHex: '#f8fafc', purpose: 'exhibit', store: 'honten', tire: 'summer', insurance: false,
      regDate: minus(1200), firstReg: minus(1200).slice(0,7), expiry: minus(30),
      inspections: { m1:{}, m6:{}, m12:[] }, archived:false },
    // 売却済み＝アーカイブ
    { id: 'v4', group: 'factory', name: 'ハスラー Jスタ カーキ（売却済）', num: '神戸582は3182', plate4: '3182', maker: 'スズキ',
      colorHex: '', purpose: 'loaner', store: 'honten', tire: 'summer', insurance: false,
      regDate: minus(1600), firstReg: minus(1600).slice(0, 7), expiry: minus(200), inspections: { m1: {}, m6: {}, m12: [] }, archived: true, archivedAt: '2026-10-05' },
  ];
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], 'honten-schedRestrictions': {},
    [STOR + 'vehicles-v2']: vehicles,
    [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラーオフブルー', num: '8178', store: 'honten' }],
    [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  t('車両管理を開ける', await clickText(page, '車両管理'));
  await page.waitForTimeout(1500);

  head('① 一覧に出る（工場代車とレンタカーが別）');
  t('車両管理の画面が出る', await seeText(page, '工場代車', 8000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('工場代車の車が出ている', await seeText(page, 'ハスラー タフワイルド ホワイト', 6000));
  t('レンタカーの見出しが出る', await seeText(page, 'レンタカー（わナンバー）', 6000));
  t('レンタカーの車が出ている', await seeText(page, 'ヴォクシー S-Z（レンタ）', 6000));

  head('② 並び（タイヤが左端先頭・エクセルと同じ順）');
  const headers = await page.evaluate(() => [...document.querySelectorAll('th')].map(e => e.innerText.trim()).slice(0, 15));
  t('★1列目がタイヤ', headers[0] === 'タイヤ', headers);
  t('2列目が車名・3列目がナンバー', headers[1] === '車名' && headers[2] === 'ナンバー', headers);
  t('保険・目的・ナビ・ナビ値段・車検満期の順', ['保険', '目的', 'ナビ', 'ナビ値段', '車検満期'].every((h, i) => headers[3 + i] === h), headers);

  head('③ タイヤの夏冬をクリックで切り替えられる');
  const tireOf = (name) => page.evaluate(n => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes(n));
    if (!row) return null;
    const on = [...row.querySelectorAll('span')].find(e => (e.innerText === '夏' || e.innerText === '冬') && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).backgroundColor !== 'rgb(255, 255, 255)');
    return on ? on.innerText : '';
  }, name);
  t('いまは夏', (await tireOf('ハスラー タフワイルド ホワイト')) === '夏');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('ハスラー タフワイルド ホワイト'));
    const td = row && row.querySelector('td'); if (td) td.click();
  });
  await page.waitForTimeout(1200);
  t('★クリックで冬になる', (await tireOf('ハスラー タフワイルド ホワイト')) === '冬');
  const saved = await page.evaluate(k => (JSON.parse(JSON.stringify(window.__fakeFb.get(k) || [])) || []).find(x => x && x.id === 'v1'), STOR + 'vehicles-v2');
  t('サーバーにも保存される', saved && saved.tire === 'winter', saved && saved.tire);

  head('④ アーカイブ');
  t('売却済みは一覧に出ない', !(await page.evaluate(() => document.body.innerText.includes('売却済'))));
  t('アーカイブのボタンがある', await page.evaluate(() => /アーカイブ（1台）/.test(document.body.innerText)));
  await clickText(page, 'アーカイブ（1台）');
  await page.waitForTimeout(900);
  t('★アーカイブの中身が見られる', await seeText(page, '売却済', 6000));
  await clickText(page, '一覧に戻る');
  await page.waitForTimeout(900);

  head('⑤ 点検アラート（スズキ車／レンタカーだけ）');
  const insOf = (name) => page.evaluate(n => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes(n));
    return row ? row.innerText.replace(/\s+/g, ' ') : '';
  }, name);
  const suzuki = await insOf('ハスラー タフワイルド ホワイト');
  t('★スズキ車に6か月点検のアラートが出る', /6か月/.test(suzuki), suzuki);
  const toyota = await insOf('ヴォクシー S-Z 中井さん') || await insOf('中井さん');
  t('★スズキ以外の社用車にはアラートを出さない', !/6か月 あと|6か月 急ぎ/.test(toyota), toyota);
  const rental = await insOf('ヴォクシー S-Z（レンタ）');
  t('★スズキ以外のレンタカーは12か月点検だけ出す', /12か月点検/.test(rental)&&!/6か月点検/.test(rental)&&!/1か月点検/.test(rental), rental);
  t('動いている（ムーヴ）印がある', await page.evaluate(() => [...document.querySelectorAll('span')].some(e => /vehMove/.test(getComputedStyle(e).animationName || ''))));

  head('⑥ 所在地は本店・三田店の2つ');
  const stores = await page.evaluate(() => [...document.querySelectorAll('button')].map(e => e.innerText.trim()).filter(x => x.indexOf('📍') === 0));
  t('★本店・三田店（＋両店）だけ', stores.length === 3 && stores.join(',').includes('本店') && stores.join(',').includes('三田店'), stores);
  t('八多・北神は出ない', !stores.join(',').includes('八多') && !stores.join(',').includes('北神'), stores);

  head('⑦ 手で追加する時、最低限の項目が要る');
  await clickText(page, '手で追加');
  await page.waitForTimeout(700);
  t('追加の画面が開く', await seeText(page, '車両を手で追加', 6000));
  await clickText(page, '✓ 保存');
  await page.waitForTimeout(500);
  t('★足りないと保存できず、何が足りないか出る', await page.evaluate(() => /入れてください：/.test(document.body.innerText)), await page.evaluate(() => (document.body.innerText.match(/入れてください：[^\n]*/) || [''])[0]));
  t('必須に 登録日・車検満了日・初度登録・ナンバー・ボディ色 が並ぶ', await page.evaluate(() => {
    const m = (document.body.innerText.match(/入れてください：([^\n]*)/) || [])[1] || '';
    return ['車名', 'ナンバー（FULL）', '登録日', '車検満了日', '初度登録', 'ボディ色'].every(x => m.includes(x));
  }));
  head('⑧ 直した所（2026-10-05 ユーザー指摘）');
  // 車検満期は8列目（タイヤ・車名・ナンバー・保険・目的・ナビ・ナビ値段・車検満期）
  const cellOf=(name,i)=>page.evaluate(([n,k])=>{const r=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes(n));if(!r)return'';const td=r.querySelectorAll('td')[k];return td?td.innerText.replace(/s+/g,' ').trim():'';},[name,i]);
  const expRow = await cellOf('期限切れスペーシア',7);
  t('★車検満了の「○日超過」は出さない', !/日超過/.test(expRow), expRow);
  const insCell = await page.evaluate(() => { const r=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('期限切れスペーシア')); if(!r)return null;
    const sp=[...r.querySelectorAll('span')].find(e=>e.innerText.trim()==='×'); if(!sp)return null; const st=getComputedStyle(sp); const td=sp.closest('td');
    return {bg:st.backgroundColor,color:st.color,align:getComputedStyle(td).textAlign}; });
  t('★保険×は濃い赤で囲う', !!insCell && insCell.bg === 'rgb(220, 38, 38)' && insCell.color === 'rgb(255, 255, 255)', insCell);
  t('★保険の欄は中央', !!insCell && insCell.align === 'center', insCell);
  // レンタカーの表は『ナビ値段』が無いので点検は10・11・12列目
  const rentalDone = [await cellOf('ソリオバンディット（済）',10),await cellOf('ソリオバンディット（済）',11),await cellOf('ソリオバンディット（済）',12)].join(' / ');
  t('★日付が無くても「済」と出る', /済/.test(rentalDone) && !/あと|急ぎ|超過/.test(rentalDone), rentalDone);
  t('★「○回目」は出さない', !(await page.evaluate(() => /回目/.test(document.body.innerText))));
  t('★点検バッジに日数を出さない', !(await page.evaluate(() => { const tds=[...document.querySelectorAll('td')];
    return tds.some(td=>/点検/.test(td.innerText)&&/(日超過|あとd+日)/.test(td.innerText)); })));
  const colors = await page.evaluate(() => [...document.querySelectorAll('span')].filter(e=>/点検$/.test(e.innerText.trim())).map(e=>getComputedStyle(e).backgroundColor));
  t('★黄・オレンジ・赤のどれかで出る', colors.length>0 && colors.every(c=>['rgb(253, 224, 71)','rgb(249, 115, 22)','rgb(220, 38, 38)'].includes(c)), colors);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await page.screenshot({ path: path.join(DIR, 'smoke-vehicle-v2.png') });
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + '結果: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
