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
  // v7（取り込み分と同じ形＝登録日が空で初度は年月だけ）の満了日は【今日の2か月後 + 2年】。
  //   → 12か月点検の期日（満了−2年）が いつも2か月先 になる。
  const _n = new Date(); const _dm = _n.getMonth() + 2;
  const _dy = _n.getFullYear() + Math.floor(_dm / 12), _dmm = (_dm % 12) + 1;
  const _p = x => String(x).padStart(2, '0');
  const V7_M12 = _dy + '-' + _p(_dmm) + '-20';                       // 12か月点検の期日
  const V7_EXPIRY = (_dy + 2) + '-' + _p(_dmm) + '-20';              // 車検満了（期日の2年後）
  const V7_FIRST = (_dy - 1) + '-' + _p(_dmm);                       // 初度登録（年月だけ）
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
    // 取り込み分と同じ形（登録日が無く、初度は年月だけ）。満了から逆算して期日が出るか
    { id: 'v7', group: 'factory', name: 'ハスラーG オフブルー1800', num: '神戸58Aき1800', plate4: '1800', maker: 'スズキ',
      colorHex: '#7dd3fc', purpose: 'loaner', store: 'honten', tire: 'summer', insurance: true,
      // ★期日を決め打ちにしないこと（2026-11-20 に踏んだ）。
      //   12か月点検の期日は【満了日−2年】。固定の日付にすると、今日がその日に追いついた時点で
      //   「まだ先」でなくなり、期日が出なくなって落ちる（製品側は正しい）。いつも2か月先になるようにする。
      regDate: '', firstReg: V7_FIRST, expiry: V7_EXPIRY,
      inspections: { m1:{done:true}, m6:{done:true}, m12:[] }, archived:false },
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
  // ★車両管理は v3.80.0（2026-10-29）でナビから【ダッシュボードの中】へ移った。
  //   ナビの字で探す書き方だと開けず、以降の画面の検査が全部落ちる（41件の不合格の正体）。
  //   ダッシュボードは別タブで開く作りなので、window.open を黙らせて【同じタブに重ねて】から中のタイルを押す。
  await page.evaluate(() => { window.open = () => null; });
  await page.click('[data-dashnav]');
  await page.waitForTimeout(600);
  t('ダッシュボードが開ける', (await page.$('[data-dashtile="vehicle"]')) !== null);
  t('車両管理を開ける', await page.click('[data-dashtile="vehicle"]').then(() => true, () => false));
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
  t('必須に 車検満了日・初度登録・ナンバー・ボディ色 が並ぶ（登録日は満了日から入る）', await page.evaluate(() => {
    const m = (document.body.innerText.match(/入れてください：([^\n]*)/) || [])[1] || '';
    return ['車名', 'ナンバー（FULL）', '車検満了日', '初度登録', 'ボディ色'].every(x => m.includes(x));
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

  head('⑨ 期日は車検満了日から逆算（2026-10-05 ユーザー指摘）');
  const m12cell = await cellOf('ハスラーG オフブルー1800',13);
  // ★画面の日付は【ゼロ詰めなし】で出る（2027/1/20）。文字をそのまま見比べないこと。
  const _ymd = x => x.split('-').map(Number).join('/');
  t('★12か月点検の期日が 車検満了日から逆算して出る', m12cell.indexOf(_ymd(V7_M12)) >= 0, [m12cell, _ymd(V7_M12)]);
  const expCell = await cellOf('ハスラーG オフブルー1800',7);
  t('★車検満了に「あと○日」を出さない', !/あと/.test(expCell), expCell);
  const doneCell = await cellOf('ハスラーG オフブルー1800',11);
  t('★済に実施日を出さない', doneCell.trim()==='済', doneCell);

  head('⑩ 取り込み分も編集して保存できる（登録日が空でも）');
  await page.evaluate(() => { const r=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('ハスラーG オフブルー1800')); if(r)r.querySelectorAll('td')[1].click(); });
  await page.waitForTimeout(700);
  t('詳細が開く', await seeText(page, '代車管理とのつながり', 6000));
  await clickText(page, '✎ 直す');
  await page.waitForTimeout(600);
  t('編集の画面が開く', await seeText(page, '車両を直す', 6000));
  await page.evaluate(() => { const i=[...document.querySelectorAll('input')].find(e=>e.offsetParent!==null&&/ハスラーG オフブルー1800/.test(e.value));
    if(i){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'ハスラーG オフブルー1800（直した）');i.dispatchEvent(new Event('input',{bubbles:true}));} });
  await clickText(page, '✓ 保存');
  await page.waitForTimeout(1200);
  t('★保存すると画面が閉じる', !(await page.evaluate(() => /車両を直す/.test(document.body.innerText))), await page.evaluate(()=>document.body.innerText.slice(0,120)));
  t('★直した名前が一覧に出る', await seeText(page, '（直した）', 6000));
  const after = await page.evaluate(k => (JSON.parse(JSON.stringify(window.__fakeFb.get(k)||[]))||[]).find(x=>x&&x.id==='v7'), STOR + 'vehicles-v2');
  // 登録日は【満了−3年】＝12か月点検の期日の1年前。ここも決め打ちにしない。
  const V7_REG = (Number(V7_M12.slice(0, 4)) - 1) + V7_M12.slice(4);
  t('登録日が満了日から入る', !!after && after.regDate === V7_REG, [after && after.regDate, V7_REG]);

  head('⑪ 動きと保険（2026-10-05 ユーザー指示）');
  const anim = await page.evaluate(() => [...document.querySelectorAll('span')].filter(e=>/点検$/.test(e.innerText.trim()))
    .map(e=>{const st=getComputedStyle(e);return {name:st.animationName,dur:st.animationDuration,cnt:st.animationIterationCount};}));
  t('★動きは止まる（ずっと動かない）', anim.length>0 && anim.every(a=>a.cnt!=='infinite'), anim.slice(0,3));
  t('★3秒くらいで止まる', anim.length>0 && anim.every(a=>Math.abs(parseFloat(a.dur)*parseFloat(a.cnt)-3)<=0.6), anim.slice(0,3));
  t('★速さは色によらず同じ', new Set(anim.map(a=>a.dur+'/'+a.cnt)).size===1, anim.slice(0,3));
  const insBefore = await page.evaluate(k => (JSON.parse(JSON.stringify(window.__fakeFb.get(k)||[]))||[]).find(x=>x&&x.id==='v1').insurance, STOR+'vehicles-v2');
  await page.evaluate(() => { const r=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('ハスラー タフワイルド ホワイト')); if(r)r.querySelectorAll('td')[3].click(); });
  await page.waitForTimeout(1200);
  const insAfter = await page.evaluate(k => (JSON.parse(JSON.stringify(window.__fakeFb.get(k)||[]))||[]).find(x=>x&&x.id==='v1').insurance, STOR+'vehicles-v2');
  t('★一覧で保険の○×を切り替えられる', insBefore!==insAfter, {before:insBefore,after:insAfter});

  // ── ★所在地は押すたびに 本店⇄三田店（2026-10-17 ユーザー指示）──
  //   タイヤ・保険と同じで、押しても右の詳細パネルは開かない（stopPropagation）。
  const stOf = () => page.evaluate(k => ((window.__fakeFb.get(k)||[]).find(x=>x&&x.id==='v1')||{}).store, STOR+'vehicles-v2');
  const tapLoc = () => page.evaluate(() => {
    const r=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('ハスラー タフワイルド ホワイト'));
    if(!r)return false; const td=[...r.querySelectorAll('td')].find(c=>(c.title||'').includes('本店⇄三田店'));
    if(!td)return false; td.click(); return true; });
  // 先に詳細パネルを閉じておく（前の検査で開いたままのことがある）
  await page.evaluate(() => { const p=document.querySelector('[data-vehpanel]'); if(p){ const x=[...p.querySelectorAll('button')].find(b=>b.innerText.trim()==='✕'); if(x)x.click(); } });
  await page.waitForTimeout(600);
  t('★検査の前提：詳細パネルは閉じている', !(await page.evaluate(() => !!document.querySelector('[data-vehpanel]'))));
  const stBefore = await stOf();
  t('★所在地の欄が押せるようになっている', await tapLoc());
  await page.waitForTimeout(1200);
  const stAfter1 = await stOf();
  t('★1回押すと所在地が入れ替わる', stBefore!==stAfter1 && ['honten','sanda'].includes(stAfter1), {before:stBefore,after:stAfter1});
  t('★押しても右の詳細パネルは開かない', !(await page.evaluate(() => !!document.querySelector('[data-vehpanel]'))));
  await tapLoc(); await page.waitForTimeout(1200);
  t('★もう一度押すと元に戻る（本店→三田店→本店）', (await stOf())===stBefore, {before:stBefore,after1:stAfter1,after2:await stOf()});

  head('⑫ 期日の表示とナビの印（2026-10-05 ユーザー指示）');
  const m6cell = await cellOf('ハスラー タフワイルド ホワイト',12);
  t('★6か月点検は期日も出す', /[0-9]+\/[0-9]+/.test(m6cell), m6cell);
  const m12cell2 = await cellOf('ハスラーG オフブルー1800',13);
  t('12か月は予定の時だけ期日', /12か月点検/.test(m12cell2), m12cell2);
  // ★知らせの印（2026-10-29 にナビの「車両管理」ボタンそのものが無くなった）。
  //   いまは【スケジュール画面のダッシュボードのボタン】の右上に「！」が出る（data-dashbang）。
  //   色と大きさは車検カレンダーの「！」にそろえてある（CALBANG_YEL・DASHBANG）。
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(e=>/^.{0,3}スケジュール$/.test(e.innerText.trim())&&e.offsetParent!==null); if(b)b.click(); });
  await page.waitForTimeout(1200);
  const mark = await page.evaluate(() => { const sp=document.querySelector('[data-dashbang]'); if(!sp)return null;
    const st=getComputedStyle(sp); return {bg:st.backgroundColor,bd:st.borderTopColor,w:Math.round(sp.getBoundingClientRect().width),txt:sp.innerText.trim()}; });
  t('★ダッシュボードのボタンに「！」が出る', !!mark && mark.txt==='!', mark);
  t('★色は蛍光の黄（CALBANG_YEL）', !!mark && mark.bg==='rgb(255, 242, 0)', mark);
  t('★濃い青の帯に沈まないよう白ふち', !!mark && mark.bd==='rgb(255, 255, 255)', mark);
  t('★大きさは DASHBANG（23px）', !!mark && Math.abs(mark.w-23)<=1, mark);
  // ── ⑦ 点検の自動設計（画面の純関数をそのまま取り出して確かめる）──
  console.log(String.fromCharCode(10) + '■ ⑦ 点検の自動設計 1か月→6か月→12か月→12か月→車検');
  const SRC2 = fs.readFileSync(path.join(DIR, process.env.SRC || 'index_dev.html'), 'utf8');
  const _f = SRC2.indexOf('const vehIsSuzuki='), _to = SRC2.indexOf('const vehInspState=');
  const vbox = {};
  new Function('box', SRC2.slice(_f, _to) + ';Object.assign(box,{vehAddMonths,vehBase,vehIsNewPeriod,vehM12List,vehInspDue,vehAlertKinds});try{Object.assign(box,{vehIsKei,vehClassNo});}catch(e){}')(vbox);
  const mo = (a, b) => { const p = String(a).split('-').map(Number), q = String(b).split('-').map(Number); return (q[0] - p[0]) * 12 + (q[1] - p[1]); };
  // 新車の乗用（登録から車検満了まで36か月）
  const car = { id: 1, maker: 'スズキ', regDate: '2026-04-20', expiry: '2029-04-20' };
  const list = vbox.vehM12List(car);
  t('⑦ 1か月点検は登録の1か月後', vbox.vehInspDue(car, 'm1') === '2026-05-20', vbox.vehInspDue(car, 'm1'));
  t('⑦ 6か月点検は登録の6か月後', vbox.vehInspDue(car, 'm6') === '2026-10-20', vbox.vehInspDue(car, 'm6'));
  t('⑦ 12か月点検は2回（1年後・2年後）', list.length === 2 && list[0] === '2027-04-20' && list[1] === '2028-04-20', list);
  t('⑦ 車検満了の回は作らない（3年後は出さない）', !list.includes('2029-04-20'), list);
  t('⑦ 並びが 1か月→6か月→12か月→12か月→車検 の順になる', (() => {
    const seq = [vbox.vehInspDue(car, 'm1'), vbox.vehInspDue(car, 'm6'), ...list, car.expiry];
    return JSON.stringify(seq) === JSON.stringify(seq.slice().sort());
  })());
  // 4ナンバー貨物（2年車検）は12か月が1回
  const k4 = { id: 2, maker: 'スズキ', cargo4: true, regDate: '2026-04-20', expiry: '2028-04-20' };
  t('⑦ 4ナンバーの12か月点検は1回', vbox.vehM12List(k4).length === 1, vbox.vehM12List(k4));
  // 新車でない車には 1か月・6か月を出さない
  const old = { id: 3, maker: 'スズキ', regDate: '2020-04-20', expiry: '2028-04-20' };
  t('⑦ 新車でない車に 1か月・6か月は出さない', !vbox.vehInspDue(old, 'm1') && !vbox.vehInspDue(old, 'm6'));
  // ★月末の繰り上がり（2026-10-17。本番の実データで1台ずれていた）
  t('★⑦ 1/30 の1か月後は 2月末（3/2 にならない）', vbox.vehAddMonths('2023-01-30', 1) === '2023-02-28', vbox.vehAddMonths('2023-01-30', 1));
  t('★⑦ 1/31 の1か月後も 2月末', vbox.vehAddMonths('2023-01-31', 1) === '2023-02-28', vbox.vehAddMonths('2023-01-31', 1));
  t('★⑦ 8/31 の1か月後は 9/30（10/1 にならない）', vbox.vehAddMonths('2026-08-31', 1) === '2026-09-30', vbox.vehAddMonths('2026-08-31', 1));
  t('★⑦ うるう日 2/29 の12か月後は 2/28', vbox.vehAddMonths('2024-02-29', 12) === '2025-02-28', vbox.vehAddMonths('2024-02-29', 12));
  t('⑦ 月末でない日はそのまま', vbox.vehAddMonths('2026-04-20', 6) === '2026-10-20', vbox.vehAddMonths('2026-04-20', 6));

  // ── ⑬ 点検アラートは【軽自動車だけ】（2026-11-20 ユーザー指示）──
  //   なぜ：点検費用がスズキから出るのは軽だけ。普通乗用車は同じスズキでも出ないので知らせる意味がない。
  //   レンタカーは今までどおり【12か月点検だけ】（普通車も含めて全車）。1か月・6か月は出さない。
  console.log(String.fromCharCode(10) + '■ ⑬ 点検アラートは軽自動車だけ');
  const KEI = { id: 11, maker: 'スズキ', num: '神戸58Aい7177', purpose: 'loaner' };
  const FUTSU = { id: 12, maker: 'スズキ', num: '神戸505す3119', purpose: 'loaner' };
  const RENT_F = { id: 13, maker: 'スズキ', num: '神戸505わ4230', purpose: 'rental' };
  const RENT_T = { id: 14, maker: 'トヨタ', num: '神戸303わ3869', purpose: 'rental' };
  const k = v => vbox.vehAlertKinds(v).join(',');
  // ★道具そのものが無い版（直す前）でも、検査が落ちずに FAIL と出るようにする
  const kei = v => (typeof vbox.vehIsKei === 'function') ? vbox.vehIsKei(v) : '(vehIsKei が無い)';
  const cls = x => (typeof vbox.vehClassNo === 'function') ? vbox.vehClassNo(x) : '(vehClassNo が無い)';
  t('⑬ 軽／普通を見分ける道具がある', typeof vbox.vehIsKei === 'function' && typeof vbox.vehClassNo === 'function');
  t('⑬ スズキの軽は 1か月・6か月・12か月とも出す', k(KEI) === 'm1,m6,m12', k(KEI));
  t('★⑬ スズキの【普通車】は1つも出さない', k(FUTSU) === '', k(FUTSU));
  t('★⑬ レンタカー（普通車）は12か月だけ', k(RENT_F) === 'm12', k(RENT_F));
  t('⑬ レンタカー（スズキ以外）も12か月だけ', k(RENT_T) === 'm12', k(RENT_T));
  t('⑬ スズキ以外の軽は出さない（費用が出ないため）', k({ id: 15, maker: 'トヨタ', num: '神戸58Aあ1111' }) === '');
  t('⑬ 保管箱の車は出さない', k({ id: 16, maker: 'スズキ', num: '神戸58Aあ1111', archived: true }) === '');
  // 軽／普通の見分け＝ナンバーの分類番号（頭1桁の 5 では判断できない。505 は普通）
  t('⑬ 58x は軽乗用', kei({ num: '神戸582は3182' }) === true);
  t('⑬ 58A（英字つき）も軽乗用', kei({ num: '神戸58Aき1800' }) === true);
  t('★⑬ 全角の 58Ａ も軽と読む', kei({ num: '神戸５８Ａき1800' }) === true);
  t('⑬ 48x は軽貨物', kei({ num: '神戸480よ824' }) === true);
  t('★⑬ 505 は普通（頭が5でも軽ではない）', kei({ num: '神戸505わ4230' }) === false);
  t('⑬ 3xx は普通乗用', kei({ num: '神戸302あ184' }) === false);
  t('⑬ 分類番号が読めない時は分からない（null）', kei({ num: 'あああ' }) === null, kei({ num: 'あああ' }));
  t('⑬ 分類番号を取り出せる', cls('神戸58Aい7177') === '58A', cls('神戸58Aい7177'));
  // ★登録画面の「軽／普通」の選択はナンバーより強い（分類番号が読めない車のため）
  t('★⑬ 手で「普通車」にしたら軽ナンバーでも普通あつかい', kei({ num: '神戸58Aい7177', kei: 'normal' }) === false);
  t('★⑬ 手で「軽」にしたら読めないナンバーでも軽あつかい', kei({ num: '神戸787く8000', kei: 'kei' }) === true);
  t('★⑬ 手で軽にしたスズキ車は 1か月・6か月も出る', k({ id: 17, maker: 'スズキ', num: '神戸787く8000', kei: 'kei' }) === 'm1,m6,m12');

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await page.screenshot({ path: path.join(DIR, 'smoke-vehicle-v2.png') });
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + '結果: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
