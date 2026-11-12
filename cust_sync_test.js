// 顧客リストの「投函チェックの表示が パソコンごとに全く違う」の検査（2026-11-12 ユーザー報告）
//   報告：「顧客リストの投函のチェックの件、まだ直ってない。それぞれのパソコンによって
//          表示が全く異なっています。もう少し詳しくチェックして改善してください」
//   実データで裏も取れている：本番の 202701 は 11/02 に 259行すべてへ印が付いたのに
//   11/04 には 240件ぶんが消えていた（11/09 に入れ直し）。202702 は 11/03 から
//   ずっと 済3/未316 のまま＝現場の作業がサーバーに残っていなかった。
//   元凶は3つ：
//     ① applyServerFile が【行まるごと】ローカル優先（既定 return lc）
//        ＝他のPCが付けた投函の印・備考・担当をこの画面に出さない
//     ② 書き込みが【手元のファイル全体】を書く経路が何本もあり、古い写しを持ったPCが
//        1回保存するだけで他のPCの印をサーバーから消す
//     ③ 一度読んだファイルを二度と読み直さない（60秒の pickup は手元に無いファイルだけ・
//        チャンクは購読していない）
//   ここで見ること：
//     ① 道具がそろっている（cfRowDiff / cfMergeRow / cfSaveRowFields / cfHoldMark）
//     ② cfMergeRow は既定でサーバーを採る（投函の印・備考・担当・入庫日）
//     ③ 予約の進み具合だけは後戻りさせない
//     ④ 他のPCが付けた投函の印が、開いたままの画面に出る（チャンクの購読）
//     ⑤ 他のPCの備考・担当も出る
//     ⑥ ★古い写しを持ったPCが備考を1件保存しても、他のPCの投函の印を消さない
//     ⑦ 自分が付けた印は、直後に古い値が届いても戻らない（20秒の守り）
//     ⑧ 手元のファイル全体を書く経路が残っていない
//   実行: node cust_sync_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8477, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log('\n■ ' + s);
const YELLOW = 'rgb(255, 242, 0)';

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 12];
const cust = (i, o) => Object.assign({
  custId: 'F__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-' + (10 + i),
  name: '客' + i, no: 1000 + i, carType: 'ワゴンＲ',
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-11-01', dm1Book: '', dm2Date: '2026-11-08', dm2Book: '',
  dm1Sent: false, dm2Sent: false,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '', isAdmin: true }, o || {});
const CUSTS = [cust(1), cust(2), cust(3), cust(4), cust(5), cust(6)];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// 投函のマス（n=0：投函①）
const cells = (page, n) => page.evaluate((n) => {
  return [...document.querySelectorAll('tbody tr')].map(tr => {
    const tds = [...tr.children];
    if (tds.length < 8) return null;
    const td = tds[4 + n * 2];
    if (!td) return null;
    return { name: (tds[1].innerText || '').split('\n')[0].trim(), text: (td.innerText || '').trim(),
      bg: getComputedStyle(td).backgroundColor, row: (tr.innerText || '').replace(/\s+/g, ' ').trim() };
  }).filter(Boolean);
}, n);
const cellOf = async (page, n, name) => (await cells(page, n)).find(c => c.name.indexOf(name) >= 0);
// サーバー（にせ firebase）に入っているその人の行
const onServer = (page, name) => page.evaluate(([k, nm]) => {
  const rows = window.__fakeFb.get(k + 'cf-202701-chunk-0') || [];
  return rows.find(r => r && r.name === nm) || null;
}, [STOR, name]);

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email, isAdmin: true }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));

  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(800);

  const SRC = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const ENDP = String.fromCharCode(41);   // 閉じかっこ

  head('① 道具がそろっている');
  const has = await page.evaluate(() => ({
    diff: typeof cfRowDiff, merge: typeof cfMergeRow, save: typeof cfSaveRowFields,
    mark: typeof cfHoldMark, held: typeof cfHeld,
  }));
  t('cfRowDiff がある', has.diff === 'function', has);
  t('cfMergeRow がある', has.merge === 'function', has);
  t('cfSaveRowFields がある', has.save === 'function', has);
  t('cfHoldMark / cfHeld がある', has.mark === 'function' && has.held === 'function', has);
  t('チャンクを購読している（cf-…-chunk- を fbLive に渡している）',
    /fbLive\(keys/.test(SRC) && SRC.indexOf("'cf-'+sn+'-chunk-'+i") >= 0);

  head('② cfMergeRow は既定でサーバーを採る');
  const m = await page.evaluate(() => {
    if (typeof cfMergeRow !== 'function') return {};
    const lc = { custId: 'x', name: '客', dm1Sent: false, dm2Sent: false, note: 'ふるい備考', staff: '江川', entryDate: '', status: 'none' };
    const fc = { custId: 'x', name: '客', dm1Sent: true, dm2Sent: true, note: 'あたらしい備考', staff: '岡本', entryDate: '2027-01-20', status: 'none' };
    return cfMergeRow(lc, fc);
  });
  t('★投函①の印はサーバーの値になる', m.dm1Sent === true, m);
  t('★投函②の印もサーバーの値になる', m.dm2Sent === true, m);
  t('★備考はサーバーの値になる', m.note === 'あたらしい備考', m);
  t('★担当もサーバーの値になる', m.staff === '岡本', m);
  t('★入庫日もサーバーの値になる', m.entryDate === '2027-01-20', m);

  head('③ 予約の進み具合だけは後戻りさせない');
  const m2 = await page.evaluate(() => {
    if (typeof cfMergeRow !== 'function') return { a: {}, b: {} };
    const lc = { custId: 'x', status: 'confirm', entryDate: '2027-01-15', bookingTime: '10:00', dm1Sent: false };
    const fc = { custId: 'x', status: 'none', entryDate: '', bookingTime: '', dm1Sent: true };
    const lc2 = { custId: 'y', status: 'temp', dm1Sent: false };
    const fc2 = { custId: 'y', status: 'confirm', dm1Sent: true };
    return { a: cfMergeRow(lc, fc), b: cfMergeRow(lc2, fc2) };
  });
  t('★手元が本予約／サーバーが未予約なら本予約のまま', m2.a.status === 'confirm', m2.a);
  t('★その時の入庫日・時間も残る', m2.a.entryDate === '2027-01-15' && m2.a.bookingTime === '10:00', m2.a);
  t('★それでも投函の印はサーバーを採る', m2.a.dm1Sent === true, m2.a);
  t('★サーバーが進んでいる時はサーバーを採る', m2.b.status === 'confirm', m2.b);

  head('④ 他のPCが付けた投函の印が、開いたままの画面に出る');
  let c = await cellOf(page, 0, '客3');
  t('いまは黄色（まだ投函していない）', !!c && c.bg === YELLOW, c);
  // 他のPCが 客3 に投函の印・客4 に備考と担当を書いた
  await page.evaluate(([k]) => {
    const rows = (window.__fakeFb.get(k + 'cf-202701-chunk-0') || []).map(r => {
      if (r.name === '客3') return Object.assign({}, r, { dm1Sent: true });
      if (r.name === '客4') return Object.assign({}, r, { note: '他のPCで書いた備考', staff: '岡本' });
      return r;
    });
    window.__fakeFb.set(k + 'cf-202701-chunk-0', rows);
  }, [STOR]);
  const gotMark = await page.waitForFunction(() => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf('客3') >= 0);
    const td = tr && tr.children[4];
    return !!td && getComputedStyle(td).backgroundColor !== 'rgb(255, 242, 0)';
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  c = await cellOf(page, 0, '客3');
  t('★開き直さなくても 客3 の印が画面に出る（黄色でなくなる）', gotMark, c);
  t('★✓ が出ている', !!c && /✓/.test(c.text), c);

  head('⑤ 他のPCの備考・担当も出る');
  const r4 = await cellOf(page, 0, '客4');
  t('★備考が出ている', !!r4 && r4.row.indexOf('他のPCで書いた備考') >= 0, r4 && r4.row);
  t('★担当も出ている', !!r4 && r4.row.indexOf('岡本') >= 0, r4 && r4.row);

  head('⑥ ★古い写しを持ったPCが備考を1件保存しても、他のPCの投函の印を消さない');
  // 他のPCが 客5 に投函の印を付ける。この画面には知らせない（＝手元は古いまま）
  await page.evaluate(([k]) => {
    const rows = (window.__fakeFb.get(k + 'cf-202701-chunk-0') || []).map(r =>
      r.name === '客5' ? Object.assign({}, r, { dm1Sent: true, note: '他のPCの投函済み' }) : r);
    window.__fakeFb.setQuiet(k + 'cf-202701-chunk-0', rows);   // 購読に流さない＝この画面は知らない
  }, [STOR]);
  t('サーバーには 客5 の印が入っている', (await onServer(page, '客5')).dm1Sent === true);
  t('この画面はまだ知らない（黄色のまま）', (await cellOf(page, 0, '客5')).bg === YELLOW);
  // この画面で 客1 の備考だけを直す
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf('客1') >= 0);
    const b = tr && tr.querySelector('[data-bandedit]'); if (b) b.click();
  });
  await page.waitForTimeout(500);
  await page.fill('textarea[data-bandnote]', 'このPCで書いた備考');
  await page.evaluate(() => { const b = document.querySelector('[data-bandnotesave]'); if (b) b.click(); });
  const wrote = await page.waitForFunction(([k]) => {
    const rows = window.__fakeFb.get(k + 'cf-202701-chunk-0') || [];
    const r = rows.find(x => x && x.name === '客1');
    return !!r && r.note === 'このPCで書いた備考';
  }, [STOR], { timeout: 20000 }).then(() => true).catch(() => false);
  t('この PC の備考は保存された', wrote, await onServer(page, '客1'));
  const s5 = await onServer(page, '客5');
  t('★他のPCが付けた 客5 の投函の印がサーバーに残っている', !!s5 && s5.dm1Sent === true, s5);
  t('★他のPCが書いた 客5 の備考も残っている', !!s5 && s5.note === '他のPCの投函済み', s5);
  const s4 = await onServer(page, '客4');
  t('★客4 の備考・担当も消えていない', !!s4 && s4.note === '他のPCで書いた備考' && s4.staff === '岡本', s4);
  const s3 = await onServer(page, '客3');
  t('★客3 の投函の印も消えていない', !!s3 && s3.dm1Sent === true, s3);

  head('⑦ 自分が付けた印は、直後に古い値が届いても戻らない');
  // 客2 の投函①をドラッグ1行ぶん＝そのマスだけ選んで確定する
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf('客2') >= 0);
    const td = tr && tr.children[4]; if (!td) return;
    const r = td.getBoundingClientRect();
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1, clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const okPop = await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null
      && /📮 投函の記録/.test(e.innerText || '') && /キャンセル/.test(e.innerText || '')).pop();
    if (!d) return false;
    const b = [...d.querySelectorAll('button')].find(e => /はい/.test(e.innerText));
    if (b) { b.click(); return true; } return false;
  });
  t('確認ポップが出て「はい」を押せる', okPop);
  const mark2 = await page.waitForFunction(([k]) => {
    const rows = window.__fakeFb.get(k + 'cf-202701-chunk-0') || [];
    const r = rows.find(x => x && x.name === '客2');
    return !!r && r.dm1Sent === true;
  }, [STOR], { timeout: 20000 }).then(() => true).catch(() => false);
  t('★客2 の印がサーバーに入った', mark2, await onServer(page, '客2'));
  // 保存の猶予（8秒）が明けてから、古い値を購読に流す
  await page.waitForTimeout(9500);
  await page.evaluate(([k, custs]) => {
    window.__fakeFb.emit(k + 'cf-202701-chunk-0', custs);   // 印の無い古い値が届いた
  }, [STOR, CUSTS]);
  await page.waitForTimeout(1500);
  const c2 = await cellOf(page, 0, '客2');
  t('★古い値が届いても 客2 の印は画面から消えない', !!c2 && c2.bg !== YELLOW, c2);

  head('⑧ 手元のファイル全体を書く経路が残っていない');
  t('★帯・備考の保存が「ファイル全体」を書いていない',
    SRC.indexOf('saveFileChunked({...f,customers:custs})') < 0);
  t('★帯の保存は cfSaveRowFields0 を通る',
    /const applyBand=useCallback[\s\S]{0,600}cfSaveRowFields0/.test(SRC));
  t('★備考だけの保存も cfSaveRowFields0 を通る',
    /const saveBandNote=useCallback[\s\S]{0,400}cfSaveRowFields0/.test(SRC));
  t('★キャンセルの備考も cfSaveRowFields0 を通る',
    /const handleCancelNote=useCallback[\s\S]{0,400}cfSaveRowFields0/.test(SRC));
  t('★欠けて読めたサーバー値では書かない（_complete!==false を見ている）',
    (SRC.match(/_complete!==false\)\?/g) || []).length >= 3);
  t('★予約の保存は「変えた項目だけ」を当てる', SRC.indexOf('cfRowDiff(customer,updCustomer)') >= 0);
  t('★書く前の読み直しは【サーバー】から（購読の写しを使わない）',
    /const fbGetFresh/.test(SRC) && SRC.indexOf('loadFileChunked(name,true)') >= 0);
  t('★購読の写しから読む経路で書いていない（fresh 付きの読み直しが5か所以上）',
    SRC.split('loadFileChunked(').filter(x => x.slice(0, x.indexOf(ENDP)).indexOf(',true') >= 0).length >= 5);

  const MOB = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('★スマホも行まるごと置き換えない（fields だけ当てる）',
    MOB.indexOf('next[ci]=fields?{...c[ci],...fields}:cust;') >= 0);
  t('★スマホの予約は投函の印に触らない（書く項目を決め打ちしている）',
    MOB.indexOf('await cfSaveRow(file,upd,put);') >= 0 && MOB.indexOf('const put={status:isTemp') >= 0);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT, fullPage: false }); console.log('写真: ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
