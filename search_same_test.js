// PCとスマホで同じ言葉を検索した時、同じ数になるかの検査（2026-10-02 ユーザー報告）
//   報告：「藤」PC 70件／スマホ 12件、「藤明」PC 4件／スマホ 0件。
//   原因：本番に索引（cf-search-*）が作られておらず、スマホは顧客ファイルから0件だった。
//        加えて ①スマホは2文字未満だと探さない ②住所が索引に無い ③上限60人
//        ④PCは行数・スマホは人数で数えていた、の4つのズレがあった。
//   ここで見ること（同じ中身を両方に読ませて、出る数を比べる）：
//     ① 1文字（藤）でも両方が同じ数
//     ② 2文字（藤明）でも両方が同じ数
//     ③ 住所（けやき台）でも両方が同じ数
//     ④ 同じ人が複数の月にいる時は「N人（M件）」と出る
//   実行: node search_same_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8271, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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
// 顧客：藤がつく人を数人。藤原さんは2ヶ月に居る（＝人1・行2）。住所でも引けるように
const cust = (i, name, car, over) => Object.assign({
  custId: 'c' + i, rowIdx: i, expiry: '2026-11-30', name, no: 1000 + i, carType: car,
  phoneHome: '', phoneMobile: '090-1111-' + (1000 + i), address: '三田市けやき台1-2-3',
  dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-', course: null,
  store: 'honten', staff: '', note: '', status: '', bookingTime: '', linkedInspDate: '',
}, over || {});
const M1 = '202610', M2 = '202609';
const ROWS1 = [cust(1, '藤原 昭人', 'ハスラー'), cust(2, '有限会社　藤明建設工業', 'ダイナ'), cust(3, '佐藤 太郎', 'スイフト'),
  // ★同じ4桁ナンバー（3505）の別人。今までは1件にまとめられて、片方が画面から消えていた
  cust(5, '栗﨑 茂人', 'ヴォクシー', { no: 3505, expiry: '2026-12-03' }),
  cust(6, '阿部 佳世子', 'ムーヴ', { no: 3505, expiry: '2026-12-20' })];
const ROWS2 = [cust(1, '藤原 昭人', 'ハスラー'), cust(2, '有限会社　藤明建設工業', 'タイタン', { expiry: '2026-09-15' }), cust(4, '藤田 花子', 'アルト', { address: '神戸市中央区' })];
// 索引（アプリの cfxRow と同じ形。住所 a つき）
const cfxRow = (c, f) => ({ n: c.name, c: c.carType, no: c.no, p: [c.phoneMobile, c.phoneHome].filter(Boolean).join('/'), a: c.address || '', e: c.expiry, f, i: c.custId });

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'cf-index']: [{ name: M1, count: ROWS1.length }, { name: M2, count: ROWS2.length }],
    [STOR + 'cf-' + M1 + '-index']: { name: M1, total: ROWS1.length, chunks: 1 },
    [STOR + 'cf-' + M1 + '-chunk-0']: ROWS1,
    [STOR + 'cf-' + M2 + '-index']: { name: M2, total: ROWS2.length, chunks: 1 },
    [STOR + 'cf-' + M2 + '-chunk-0']: ROWS2,
    [STOR + 'cf-search-index']: { built: Date.now(), total: ROWS1.length + ROWS2.length, chunks: 1, files: [M1, M2] },
    [STOR + 'cf-search-chunk-0']: [...ROWS1.map(c => cfxRow(c, M1)), ...ROWS2.map(c => cfxRow(c, M2))],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const mkCtx = async (mobile) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true } : { viewport: { width: 1500, height: 950 } });
    await ctx.addInitScript(signedInInit, [ME, STOR]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    return ctx;
  };
  // 顧客タブのボタンの文字から数を読む（本文全体だと別の数字を拾うため）
  const readCount = (page) => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && /^顧客(ファイル)?(\s|$)/.test(e.innerText.trim()));
    if (!b) return null;
    return b.innerText.replace(/^顧客(ファイル)?/, '').trim() || '0';
  });
  // 画面に並んだ行の数（氏名の見出しがいくつ出ているか）。
  //   ラベルの数が合っていても、PC だけ月ごとの行を並べていたことがあるので、ここも見る。
  const countRows = (page, name) => page.evaluate(nm => {
    const norm = x => String(x || '').replace(/[\s\u3000]/g, '');
    const all = [...document.querySelectorAll('span,div')].filter(e => e.offsetParent !== null && norm(e.innerText) === norm(nm));
    return all.filter(e => !all.some(o => o !== e && e.contains(o))).length;   // 一番内側だけ＝1行につき1つ
  }, name);
  // ── PC ──
  const pc = await mkCtx(false);
  const pp = await pc.newPage();
  const perr = []; pp.on('pageerror', e => perr.push(String(e)));
  pp.on('dialog', async d => { await d.accept().catch(() => {}); });
  await pp.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(pp, '江川京志', 20000); await clickText(pp, '江川京志'); await clickText(pp, 'でログイン');
  await seeText(pp, 'スケジュール', 20000);
  await clickText(pp, 'このまま使う');
  await pp.waitForTimeout(600);
  t('PC：検索を開ける', await clickText(pp, '検索'));
  await pp.waitForTimeout(1500);
  console.log('   PCの入力欄:', JSON.stringify(await pp.evaluate(()=>[...document.querySelectorAll('input')].map(e=>({ph:e.placeholder||'',vis:e.offsetParent!==null})))));
  await pp.waitForTimeout(2500);   // 顧客ファイルの読み込み待ち

  // ── スマホ ──
  const mb = await mkCtx(true);
  const mp = await mb.newPage();
  const merr = []; mp.on('pageerror', e => merr.push(String(e)));
  mp.on('dialog', async d => { await d.accept().catch(() => {}); });
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 25000);
  await mp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(mp, 'カレンダー', 25000);
  t('スマホ：検索を開ける', await mp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '🔍' && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }));
  await mp.waitForTimeout(2500);

  const typeIn = async (page, q) => page.evaluate(x => {
    const i = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /セリエ/.test(e.placeholder || ''));
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, x); i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, q);

  for (const [q, note] of [['藤', '1文字'], ['藤明', '2文字'], ['けやき台', '住所']]) {
    console.log('\n■ 「' + q + '」（' + note + '）');
    t('PC：打ち込めた', await typeIn(pp, q));
    t('スマホ：打ち込めた', await typeIn(mp, q));
    await pp.waitForTimeout(900); await mp.waitForTimeout(900);
    const a = await readCount(pp), b = await readCount(mp);
    console.log('   PC=' + a + ' / スマホ=' + b);
    t('★PCとスマホの数が同じ', !!a && a === b, { pc: a, mobile: b });
  }

  console.log('\n■ 同じ人が複数の月にいる時の出し方');
  await typeIn(pp, '藤原'); await typeIn(mp, '藤原');
  await pp.waitForTimeout(900); await mp.waitForTimeout(900);
  const a2 = await readCount(pp), b2 = await readCount(mp);
  console.log('   PC=' + a2 + ' / スマホ=' + b2);
  t('重複をまとめた時は、そう分かる形で出る', !!a2 && /重複/.test(a2), { pc: a2, mobile: b2 });
  t('★PCとスマホの数が同じ', a2 === b2, { pc: a2, mobile: b2 });

  console.log(String.fromCharCode(10) + '■ 1台ずつ別の行で出る（2026-10-04 ユーザー指摘）');
  // ① 同じ会社の別の車（ナンバー4桁は同じ・車種と満了日が違う）＝ 2行
  await typeIn(pp, '藤明'); await typeIn(mp, '藤明');
  await pp.waitForTimeout(900); await mp.waitForTimeout(900);
  {
    const la = await readCount(pp), lb = await readCount(mp);
    const ra = await countRows(pp, '有限会社　藤明建設工業'), rb = await countRows(mp, '有限会社　藤明建設工業');
    console.log('   「藤明」 PC=' + la + '/' + ra + '行　スマホ=' + lb + '/' + rb + '行');
    t('同じナンバーでも車が違えば別の行（PC 2行）', ra === 2, { pc: ra, mobile: rb });
    t('同じナンバーでも車が違えば別の行（スマホ 2行）', rb === 2, { pc: ra, mobile: rb });
    t('PCとスマホで数の出方が同じ', la === lb, { pc: la, mobile: lb });
  }
  // ② 同じ4桁ナンバーの別人は、両方とも出る（今までは片方が隠れていた）
  await typeIn(pp, '3505'); await typeIn(mp, '3505');
  await pp.waitForTimeout(900); await mp.waitForTimeout(900);
  {
    const a1 = await countRows(pp, '栗﨑 茂人'), a2 = await countRows(pp, '阿部 佳世子');
    const b1 = await countRows(mp, '栗﨑 茂人'), b2 = await countRows(mp, '阿部 佳世子');
    console.log('   「3505」 PC=栗﨑' + a1 + '/阿部' + a2 + '　スマホ=栗﨑' + b1 + '/阿部' + b2);
    t('★同じ4桁ナンバーの別人が両方出る（PC）', a1 === 1 && a2 === 1, { 栗﨑: a1, 阿部: a2 });
    t('★同じ4桁ナンバーの別人が両方出る（スマホ）', b1 === 1 && b2 === 1, { 栗﨑: b1, 阿部: b2 });
  }
  // ③ 本当に同じ内容（氏名・車種・ナンバー・満了日が同じ）の重複だけ1つにまとめる
  await typeIn(pp, '藤原'); await typeIn(mp, '藤原');
  await pp.waitForTimeout(900); await mp.waitForTimeout(900);
  {
    const la = await readCount(pp), lb = await readCount(mp);
    const ra = await countRows(pp, '藤原 昭人'), rb = await countRows(mp, '藤原 昭人');
    console.log('   「藤原」 PC=' + la + '/' + ra + '行　スマホ=' + lb + '/' + rb + '行');
    t('同じ内容の重複は1行にまとまる（PC）', ra === 1, { pc: ra, mobile: rb });
    t('同じ内容の重複は1行にまとまる（スマホ）', rb === 1, { pc: ra, mobile: rb });
    t('重複をまとめたことが数に出る', !!la && /重複/.test(la) && la === lb, { pc: la, mobile: lb });
  }

  t('PC：JSエラーなし', perr.length === 0, perr.slice(0, 3));
  t('スマホ：JSエラーなし', merr.length === 0, merr.slice(0, 3));
  await pp.screenshot({ path: path.join(DIR, 'smoke-search-pc.png') });
  await mp.screenshot({ path: path.join(DIR, 'smoke-search-mobile.png') });
  await pc.close(); await mb.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
