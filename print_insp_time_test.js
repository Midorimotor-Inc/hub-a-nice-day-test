// 印刷（🖨 印刷）に車検の入庫時間を出す検査（2026-11-02 ユーザー要望）
//   「今日のスケジュールを印刷するときに、車検の入庫時間が印刷されるように」
//   それまで印刷の車検の表は No／氏名／車種／コース／代車／特典／備考 の7列で、
//   入庫時間の列が無かった（下のタイムスケジュールの表には時間の列がある）。
//   ここで見ること：
//     ① 車検の表に「入庫」の見出しがある（No のすぐ右）
//     ② 09:00 のような時刻がその行に出る
//     ③ 未定・午前・午後（時刻を持たない枠）も短い言葉で出る
//     ④ 入庫時間が空の予約は「-」
//     ⑤ 予約が無い日の「予約なし」が列の数（8）ぶん伸びている
//   実行: node print_insp_time_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8423, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
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
  // window.open をにせ物にして、印刷に出す HTML をそのまま受け取る
  window.__printed = '';
  window.open = function () {
    return { document: { write: h => { window.__printed += h; }, close: () => {} }, print: () => {}, focus: () => {}, close: () => {} };
  };
};
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

// 印刷の HTML を受け取り、車検の表だけを行ごとの文字にして返す
const printRows = async (page) => {
  await page.evaluate(() => { window.__printed = ''; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('印刷') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const d = document.implementation.createHTMLDocument('p');
    d.documentElement.innerHTML = String(window.__printed || '').replace(/<!DOCTYPE[^>]*>/i, '');
    const tb = d.querySelector('table.insp-table');
    if (!tb) return null;
    const cell = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const colTd = tb.querySelector('tbody td[colspan]');
    return {
      head: [...tb.querySelectorAll('thead th')].map(cell),
      dense: /dense/.test(tb.className),          // ★台数が多い日は詰めて刷る（1枚に収める）
      chips: [...tb.querySelectorAll('tbody .adv2y-p')].map(cell),   // ★2年前予約の札
      hasDenseCss: String(window.__printed || '').indexOf('.insp-table.dense') >= 0,
      hasChipCss: String(window.__printed || '').indexOf('.adv2y-p') >= 0,
      rows: [...tb.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell)),
      colspan: colTd ? colTd.getAttribute('colspan') : null,
      timeCells: [...tb.querySelectorAll('tbody td.insp-time')].map(cell),
      // ★車種（1行に収める）と担当（2026-11-12）
      carW: (tb.querySelectorAll('thead th')[3] || {}).getAttribute ? tb.querySelectorAll('thead th')[3].getAttribute('style') : '',
      hasCarCss: String(window.__printed || '').indexOf('.car-fit') >= 0,
      hasStfCss: String(window.__printed || '').indexOf('.stf-p') >= 0,
      inspCar: [...tb.querySelectorAll('tbody tr')].map(tr => {
        const td = tr.children[3]; if (!td) return null;
        const c = td.querySelector('.car-fit > i'), st = td.querySelector('.stf-p > i');
        return { car: c ? cell(c) : '', sty: c ? (c.getAttribute('style') || '') : '', stf: st ? cell(st) : '' };
      }),
      // タイムスケジュールの表（入庫制限の帯を見るため）
      sched: [...d.querySelectorAll('table.sched-table tbody tr')].map(tr => ({
        cls: tr.className, cells: [...tr.querySelectorAll('td')].map(cell),
        lab: (tr.querySelector('.restr-lab') ? cell(tr.querySelector('.restr-lab')) : ''),
        stf: (tr.querySelector('.stf-p > i') ? cell(tr.querySelector('.stf-p > i')) : ''),
        car: (tr.querySelector('.car-fit > i') ? cell(tr.querySelector('.car-fit > i')) : ''),
        carSty: (tr.querySelector('.car-fit > i') ? (tr.querySelector('.car-fit > i').getAttribute('style') || '') : ''),
      })),
    };
  });
};

(async () => {
  const mk = (name, time) => ({ name: name, time: time, carType: 'ワゴンR', course: 2, store: 'honten', no: '1234', bookingStatus: 'confirmed' });
  const seed = {};
  seed[STOR + 'insp'] = {};
  seed[STOR + 'insp'][DK] = [
    mk('印刷太郎', '09:00'),
    mk('印刷次郎', '10:30'),
    mk('印刷三郎', '未定'),
    mk('印刷四郎', '午前'),
    mk('印刷五郎', ''),
  ];
  seed[STOR + 'honten-sched'] = {};
  seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-memo'] = {};
  seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-dayoff'] = {};
  seed[STOR + 'honten-pleave'] = {};

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
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 10000));

  const r = await printRows(page);
  t('印刷の HTML を受け取れた', !!r, r);
  if (!r) { console.log(String.fromCharCode(10) + '❌ FAIL  成功 ' + pass + ' / 失敗 ' + fail); await browser.close(); server.close(); process.exit(1); }

  head('① 車検の表に「入庫」の列がある');
  t('★見出しに「入庫」がある', r.head.indexOf('入庫') >= 0, r.head);
  t('★「入庫」は No のすぐ右（2列目）', r.head[1] === '入庫', r.head);
  t('氏名・車種・コース・代車・特典・備考もそのまま', ['氏名', '車種', 'コース', '代車', '特典', '備考'].every(x => r.head.indexOf(x) >= 0), r.head);
  t('列は8つ', r.head.length === 8, r.head);

  head('② 時刻がその行に出る');
  const byName = n => r.rows.find(c => c.some(x => x.indexOf(n) >= 0));
  t('★09:00 の人の行に 09:00 が出る', (byName('印刷太郎') || [])[1] === '09:00', byName('印刷太郎'));
  t('★10:30 の人の行に 10:30 が出る', (byName('印刷次郎') || [])[1] === '10:30', byName('印刷次郎'));
  t('どの行も8つの欄がある', r.rows.length === 5 && r.rows.every(c => c.length === 8), r.rows.map(c => c.length));

  head('③ 時刻を持たない枠も短い言葉で出る');
  t('★「未定」が出る（「入庫時間未定」と長くしない）', (byName('印刷三郎') || [])[1] === '未定', byName('印刷三郎'));
  t('★「午前」が出る', (byName('印刷四郎') || [])[1] === '午前', byName('印刷四郎'));

  head('④ 入庫時間が空の予約は「-」');
  t('★空なら -', (byName('印刷五郎') || [])[1] === '-', byName('印刷五郎'));

  head('⑤ 時間の欄に印（class="insp-time"）が付いている');
  t('★5行とも印が付いている', r.timeCells.length === 5, r.timeCells);

  head('⑦ 入庫制限の帯も紙に出す（2026-11-02 ユーザー要望）');
  // マッハ車検（本店・10:00）を足すと 10:00〜11:00 が自動で入庫制限になる
  await page.evaluate(([k, dk]) => {
    const v = JSON.parse(JSON.stringify(window.__fakeFb.get(k) || {}));
    v[dk] = (v[dk] || []).concat([{ name: '芝田', carType: 'ワゴンR', course: 1, store: 'honten',
      tokuten: '-', time: '10:00', bookingStatus: 'confirmed', seq: Date.now() }]);
    window.__fakeFb.set(k, v);
  }, [STOR + 'insp', DK]);
  await page.waitForTimeout(2200);
  const r3 = await printRows(page);
  const sl = s => (r3.sched || []).find(x => (x.cells[0] || '') === s);
  t('★10:00 の枠が入庫制限の色になっている', !!sl('10:00') && /slot-restr/.test(sl('10:00').cls), sl('10:00'));
  t('★10:30 の枠も入庫制限', !!sl('10:30') && /slot-restr/.test(sl('10:30').cls), sl('10:30'));
  t('11:00 の枠は制限しない', !!sl('11:00') && !/slot-restr/.test(sl('11:00').cls), sl('11:00'));
  t('★札に「入庫制限」と出る', !!sl('10:00') && sl('10:00').lab.indexOf('入庫制限') >= 0, sl('10:00') && sl('10:00').lab);
  t('★札に「マッハ車検」と出る', !!sl('10:00') && sl('10:00').lab.indexOf('マッハ車検') >= 0, sl('10:00') && sl('10:00').lab);
  t('★お客様のお名前が「様」付きで出る', !!sl('10:00') && /芝田\s*様/.test(sl('10:00').lab), sl('10:00') && sl('10:00').lab);
  t('車検の表にもマッハの入庫時間 10:00 が出る', (r3.rows.find(c => c.some(x => x.indexOf('芝田') >= 0)) || [])[1] === '10:00', r3.rows);

  head('⑥ 予約が無い日の「予約なし」は8列ぶん');
  await page.evaluate(k => window.__fakeFb.set(k, {}), STOR + 'insp');
  await page.waitForTimeout(1800);
  const r2 = await printRows(page);
  t('★colspan が 8', !!r2 && r2.colspan === '8', r2 && r2.colspan);
  t('「予約なし」と出る', !!r2 && JSON.stringify(r2.rows).indexOf('予約なし') >= 0, r2 && r2.rows);

  head('⑧ 2年前予約の印も紙に出す。ただし【1日が1枚に収まる】こと（2026-11-04 ユーザー指示）');
  // ★⑥ で insp を空にしているので、ここで7台ぶんを入れ直す（6台＋2年前予約の1台）。
  await page.evaluate(([k, dk]) => {
    const mk = (n, tm) => ({ name: n, carType: 'ワゴンR', course: 2, store: 'honten', tokuten: '-', time: tm, bookingStatus: 'confirmed', seq: Date.now() });
    const rows = ['紙一郎', '紙二郎', '紙三郎', '紙四郎', '紙五郎', '紙六郎'].map((n, i) => mk(n, '0' + (9 + i) + ':00'));
    rows.push({ name: '二年太郎', carType: 'アルト', course: 2, store: 'honten', tokuten: '-', time: '15:00',
      bookingStatus: 'confirmed', seq: Date.now() + 1,
      adv2y: true, contact: 'sms', fixed: true, fixedBy: '江川京志', fixedAt: Date.now() });
    window.__fakeFb.set(k, { [dk]: rows });
  }, [STOR + 'insp', DK]);
  await page.waitForTimeout(2200);
  const r4 = await printRows(page);
  t('印刷の HTML を受け取れた（7台）', !!r4 && r4.rows.length === 7, r4 && r4.rows.length);
  t('★列は8つのまま（印のために列を増やさない）', !!r4 && r4.head.length === 8, r4 && r4.head);
  t('★どの行も8つの欄のまま（印のために行や欄を増やさない）', !!r4 && r4.rows.every(c => c.length === 8), r4 && r4.rows.map(c => c.length));
  const nn = r4 && r4.rows.find(c => c.some(x => x.indexOf('二年太郎') >= 0));
  t('★2年前予約の人の行に「2年前SMS」の印が出る', !!nn && /2年前SMS/.test(nn.join(' ')), nn);
  t('★予約確定なので ✓ も付く', !!nn && nn.join(' ').indexOf('✓') >= 0, nn);
  t('★印は【氏名の欄】の中（2列目の入庫時間ではない）', !!nn && nn[1] === '15:00' && /2年前/.test(nn[2]), nn && nn.slice(0, 3));
  t('★2年前予約でない人の行には印が出ない', !!r4 && r4.chips.length === 1, r4 && r4.chips);
  t('★紙で色が出ない時のために枠付きの印の決まりがある', !!r4 && r4.hasChipCss);
  t('★7台以上の日は詰めて刷る（dense）', !!r4 && r4.dense, r4 && r4.dense);
  t('★詰め方の決まりが印刷の CSS に入っている', !!r4 && r4.hasDenseCss);
  t('★6台までは詰めない（ふだんの大きさ）', !!r3 && r3.dense === false, r3 && r3.dense);

  head('⑨ 担当者名を紙にも出す／車種は1行（2026-11-12 ユーザー要望）');
  // 「誰が受けたか印刷の紙では分からない」＝車検は【車種の下】・一般整備は【お客様名の下】に担当。
  // 車種は2行にせず1行（長体＝高さは残して横だけ縮める）。★行も列も増やさないこと。
  await page.evaluate(([ki, ks, dk]) => {
    window.__fakeFb.set(ki, { [dk]: [
      { name: '担当太郎', carType: 'アルト', course: 2, store: 'honten', tokuten: '-', time: '09:00', staff: '江川京志', bookingStatus: 'confirmed', seq: 1 },
      { name: '担当次郎', carType: 'アルトラパンショコラ', course: 2, store: 'honten', tokuten: '-', time: '10:00', staff: '長谷川昌彦', bookingStatus: 'confirmed', seq: 2 },
      { name: '担当三郎', carType: 'ワゴンR', course: 2, store: 'honten', tokuten: '-', time: '11:00', staff: '', bookingStatus: 'confirmed', seq: 3 }
    ] });
    window.__fakeFb.set(ks, { [dk]: { '13:00': { name: '整備花子', carType: 'ワゴンRスティングレー', work: 'Q', content: 'オイル交換', staff: '魚住', store: 'honten', id: 11 } } });
  }, [STOR + 'insp', STOR + 'honten-sched', DK]);
  await page.waitForTimeout(2200);
  const r5 = await printRows(page);
  const row1 = r5 && r5.inspCar[0], row2 = r5 && r5.inspCar[1], row3 = r5 && r5.inspCar[2];
  t('印刷の HTML を受け取れた（3台）', !!r5 && r5.rows.length === 3, r5 && r5.rows.length);
  t('★列は8つのまま（担当のために列を増やさない）', !!r5 && r5.head.length === 8, r5 && r5.head);
  t('★どの行も8つの欄のまま', !!r5 && r5.rows.every(c => c.length === 8), r5 && r5.rows.map(c => c.length));
  t('★車検：車種の欄に「担 江川京志」が出る', !!row1 && row1.stf === '担 江川京志', row1);
  t('★車検：担当が空の人には出さない', !!row3 && row3.stf === '', row3);
  t('★車検：車種はそのまま出る', !!row2 && row2.car === 'アルトラパンショコラ', row2);
  // 長体：font-size と scaleX から「1行に収まるか」を計算で確かめる（列78px・左右のpadding 6px）
  const fitOk = (o, w) => { if (!o || !o.car) return false;
    const fs = parseFloat((o.sty.match(/font-size:([0-9.]+)px/) || [])[1] || '0');
    const k = parseFloat((o.sty.match(/scaleX\(([0-9.]+)\)/) || [])[1] || '0');
    if (!fs || !k) return false;
    return Array.from(o.car).length * fs * k <= (w - 12) + 0.5; };
  t('★車検：ふつうの長さは縮めない（13px のまま）', !!row1 && /font-size:13.0px/.test(row1.sty) && /scaleX\(1.000\)/.test(row1.sty), row1 && row1.sty);
  t('★車検：長い車種でも1行に収まる（横だけ縮める）', fitOk(row2, 78), row2 && row2.sty);
  t('★車検：長い車種でも字の高さは 10px 以上（等倍で小さくしない）',
    !!row2 && parseFloat((row2.sty.match(/font-size:([0-9.]+)px/) || [])[1] || '0') >= 10, row2 && row2.sty);
  t('★車種の列は 78px', !!r5 && /78px/.test(r5.carW || ''), r5 && r5.carW);
  t('★1行に収める決まりが印刷の CSS に入っている', !!r5 && r5.hasCarCss);
  t('★担当の決まりが印刷の CSS に入っている', !!r5 && r5.hasStfCss);
  const sr = (r5.sched || []).find(x => (x.cells[1] || '').indexOf('整備花子') >= 0);
  t('★一般整備：お客様名の欄に「担 魚住」が出る', !!sr && sr.stf === '担 魚住', sr);
  t('★一般整備：車種も1行に収まる', !!sr && (function () {
      const fs = parseFloat((sr.carSty.match(/font-size:([0-9.]+)px/) || [])[1] || '0');
      const k = parseFloat((sr.carSty.match(/scaleX\(([0-9.]+)\)/) || [])[1] || '0');
      return !!fs && !!k && Array.from(sr.car).length * fs * k <= 78 - 12 + 0.5; })(), sr && sr.carSty);
  t('★一般整備：予定が無い枠には担当が出ない', !!r5 && (r5.sched || []).filter(x => !x.cells[1] && x.stf).length === 0);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
