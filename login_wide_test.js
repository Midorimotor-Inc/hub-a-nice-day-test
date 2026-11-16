// 共有PCのログイン画面を「全体表示」にする検査（A案・2026-11-16 ユーザー選択）
//   ① 画面の低いPC（1366×768・1366×600）でもスクロールなしで全部出る
//   ② 店の枠はそのまま、中の名前は2列
//   ③ 題名が読める（白いカードに白字で見えなくなっていたのを直した）
//   ④ 端末の案内と代表取締役は横に並べる
//   ⑤ 名前を押してログインできる（動きは変えていない）
//   実行: node login_wide_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8495, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa' };
// 本番と同じ人数（本店9・三田店8・代表1＝18人）
const STAFF_H = [
  { uid: 'h1', name: '見取大介', myNumber: 1, badge: 'inspector', store: 'honten' },
  { uid: 'h2', name: '岡上秀一', myNumber: 2, badge: 'inspector', store: 'honten' },
  { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'inspector', store: 'honten' },
  { uid: 'h4', name: '幸田桂紀', myNumber: 4, badge: 'mechanic', store: 'honten' },
  { uid: 'h5', name: '魚住圭', myNumber: 5, badge: 'mechanic', store: 'honten' },
  { uid: 'h6', name: '舟田祥子', myNumber: 6, badge: 'office', store: 'honten' },
  { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
  { uid: 'h8', name: 'ダク', myNumber: 8, badge: 'assistant', store: 'honten' },
  { uid: 'h9', name: 'カビン', myNumber: 9, badge: 'assistant', store: 'honten' },
];
const STAFF_S = [
  { uid: 'h0', name: '見取勇一', myNumber: 0, badge: 'president', store: 'sanda' },
  { uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'sales', store: 'sanda' },
  { uid: 's11', name: '中井啓介', myNumber: 11, badge: 'sales', store: 'sanda' },
  { uid: 's13', name: '芦田昌則', myNumber: 12, badge: 'mechanic', store: 'sanda' },
  { uid: 's14', name: '長谷川昌彦', myNumber: 13, badge: 'mechanic', store: 'sanda' },
  { uid: 's15', name: '石井光', myNumber: 14, badge: 'mechanic', store: 'sanda' },
  { uid: 's16', name: '両澤ちよう', myNumber: 15, badge: 'sales', store: 'sanda' },
  { uid: 's17', name: '野呂遥奈', myNumber: 16, badge: 'sales', store: 'sanda' },
  { uid: 's18', name: '河合よっちゃん', myNumber: 17, badge: 'assistant', store: 'sanda' },
];
// 共有端末として登録済みのPC（auth-mine に isDevice の行がある）
const sharedInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: '共有PC', store: 'honten', uid: 'devpc', role: 'staff', active: true, kind: 'device' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: '共有PC', names: ['共有PC'], s: 'honten', k: 'shared', l: '共有PC', ua: 't', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'devpc', name: '共有PC', store: 'honten', email: me.email, isDevice: true }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
const ALL = [...STAFF_H.map(s => s.name), ...STAFF_S.map(s => s.name)];

(async () => {
  const seed = { [STOR + 'honten-staff-v2']: STAFF_H, [STOR + 'sanda-staff-v2']: STAFF_S };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const open = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(sharedInit, [ME, STOR]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '担当者を選択');
    await page.waitForTimeout(700);
    return { ctx, page, errs };
  };
  // 画面の中のことをまとめて測る
  const look = page => page.evaluate(names => {
    const btns = [...document.querySelectorAll('button')];
    const go = btns.find(b => /担当者を選択|でログイン/.test(b.innerText));
    const card = go ? go.parentElement : null;
    const stage = card ? card.parentElement : null;
    const nm = n => btns.find(b => b.innerText.trim().indexOf(n) === 0);
    const rows = {};
    names.forEach(n => { const b = nm(n); rows[n] = b ? { top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom), left: Math.round(b.getBoundingClientRect().left) } : null; });
    const h1 = document.querySelector('h1');
    const grids = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).display === 'grid' && d.querySelector('button'));
    return {
      cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
      cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
      over: stage ? Math.round(stage.scrollHeight - stage.clientHeight) : null,
      goBottom: go ? Math.round(go.getBoundingClientRect().bottom) : null,
      viewH: window.innerHeight,
      rows,
      h1: h1 ? { txt: h1.innerText.trim(), color: getComputedStyle(h1).color } : null,
      gridCols: grids.map(g => getComputedStyle(g).gridTemplateColumns.split(' ').length),
      missing: names.filter(n => !nm(n)),
    };
  }, ALL);

  head('① 1366×768（共有PCでよくある大きさ）');
  let o = await open(1366, 768);
  let v = await look(o.page);
  t('18人ぜんぶ並んでいる', v.missing.length === 0, v.missing);
  t('★スクロールが要らない', v.over === 0, { over: v.over, cardH: v.cardH });
  t('★いちばん下の名前も画面の中にある', Object.values(v.rows).every(r => r && r.bottom <= v.viewH), v.rows);
  t('★ログインのボタンも画面の中にある', v.goBottom <= v.viewH, { goBottom: v.goBottom, viewH: v.viewH });
  t('★カードが横に広がっている（900px以上）', v.cardW >= 900, v.cardW);

  head('② 店の中の名前は2列');
  t('★名前の並びが2列になっている', v.gridCols.some(c => c === 2), v.gridCols);
  t('★1人目と2人目が同じ高さに並ぶ（＝横に2つ）',
    !!v.rows['見取大介'] && !!v.rows['岡上秀一'] && v.rows['見取大介'].top === v.rows['岡上秀一'].top
    && v.rows['岡上秀一'].left > v.rows['見取大介'].left, { a: v.rows['見取大介'], b: v.rows['岡上秀一'] });
  t('★3人目は次の段に落ちる', !!v.rows['竹林直行'] && v.rows['竹林直行'].top > v.rows['見取大介'].top, v.rows['竹林直行']);
  t('店の枠は残っている（本店・三田店の見出し）', await seeText(o.page, '三田店', 3000));

  head('③ 題名が読める（白いカードに白字だった）');
  t('★題名が出ている', !!v.h1 && v.h1.txt.indexOf('Hub a Nice day') >= 0, v.h1);
  t('★白字ではない', !!v.h1 && !/rgb\(255,\s*255,\s*255\)/.test(v.h1.color), v.h1);

  head('④ 端末の案内と代表取締役を横に並べる');
  const side = await o.page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const pres = btns.find(b => b.innerText.trim().indexOf('見取勇一') === 0);
    const dev = [...document.querySelectorAll('div')].find(d => /共有端末として登録済み/.test(d.innerText) && !d.querySelector('div'));
    if (!pres || !dev) return null;
    const a = pres.getBoundingClientRect(), b = dev.getBoundingClientRect();
    return { presLeft: Math.round(a.left), presTop: Math.round(a.top), devRight: Math.round(b.right), devTop: Math.round(b.top) };
  });
  t('★代表は端末の案内の【右】にある', !!side && side.presLeft > side.devRight - 20, side);
  t('★だいたい同じ高さに並ぶ', !!side && Math.abs(side.presTop - side.devTop) < 120, side);

  head('⑤ 名前を押してログインできる（動きは変えていない）');
  await o.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().indexOf('江川京志') === 0); if (b) b.click(); });
  await o.page.waitForTimeout(400);
  t('選ぶとログインのボタンに名前が出る', await seeText(o.page, '江川京志 でログイン', 4000));
  await o.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /でログイン/.test(x.innerText)); if (b) b.click(); });
  t('★ログインしてスケジュール画面に入れる', await seeText(o.page, 'タイムスケジュール', 15000));
  t('JSエラーなし', o.errs.length === 0, o.errs.slice(0, 2));
  if (process.env.SHOT) { await o.page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await o.ctx.close();

  head('⑥ 画面がもっと低いPC（1366×600。ブラウザの枠のぶん低くなる）');
  const o2 = await open(1366, 600);
  const v2 = await look(o2.page);
  t('★スクロールが要らない', v2.over === 0, { over: v2.over, cardH: v2.cardH });
  t('★いちばん下の名前も画面の中にある', Object.values(v2.rows).every(r => r && r.bottom <= v2.viewH), v2.rows);
  t('★ログインのボタンも画面の中にある', v2.goBottom <= v2.viewH, { goBottom: v2.goBottom, viewH: v2.viewH });
  await o2.ctx.close();

  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
