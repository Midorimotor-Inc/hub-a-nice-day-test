// オフライン予定表の控え（2026-10-09 ユーザー要望：ネットが止まった時に紙でしのぐ）の検査。
//   ・ヘッダーの「💾 控え」から店を選んで保存できる
//   ・でき上がりは **外から何も読み込まない1枚のHTML**（回線が死んでいても開ける＝ここが肝）
//   ・全部の日付が入っていて、見たい日を選べる／その日だけ印刷できる
//   ・**店ごとに別ファイル**（本店の控えに三田店の予定が混ざらない）
//   ・顧客の検索と「オフライン受付メモ用紙」も入っている
//   実行: node offline_sheet_test.js
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8333, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
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
const d = (p) => { const x = new Date(now); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const TD = d(0), D1 = d(1), FAR = d(46);          // 遠い先の日も「どこを切り取っても出せる」ことの確認用
const LF = d(0), LT = d(3);

(async () => {
  const seed = {
    [STOR + 'insp']: {
      [dk(TD)]: [
        { name: '前村　和子', carType: 'ワゴンR', no: '3310', time: '09:00', course: 1, store: 'honten', phone: '090-1234-5678', loaner: 'ハスラー (7074)', staff: '竹林', note: 'ワイパー交換', seq: 1, id: 1 },
        { name: '三田　太郎', carType: 'アルト', no: '0088', time: '10:30', course: 3, store: 'sanda', phone: '079-111-2222', loaner: '', staff: '藤原', note: '', seq: 2, id: 2 },
      ],
      [dk(FAR)]: [{ name: '遠藤　先夫', carType: 'ジムニー', no: '8612', time: '13:00', course: 2, store: 'honten', phone: '090-9999-0000', loaner: '', staff: '魚住', note: '', seq: 3, id: 3 }],
    },
    [STOR + 'honten-sched']: { [dk(TD)]: { '09:00': { name: '桑田　陽子', carType: 'N-BOX', no: '1155', phone: '090-2222-3333', work: '6ヶ月点検', content: 'オイルも', staff: '芦田' } } },
    [STOR + 'sanda-sched']: { [dk(TD)]: { '11:00': { name: '西浦　三田', carType: 'タント', no: '7021', phone: '079-555-1212', work: '車検整備', content: '', staff: '小西' } } },
    [STOR + 'honten-memo']: { [dk(TD)]: [{ content: '部品待ち：芝田様のドアミラー' }] },
    [STOR + 'sanda-memo']: {},
    [STOR + 'honten-dayoff']: { [dk(TD)]: ['幸田桂紀'] },
    [STOR + 'sanda-dayoff']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }],
    [STOR + 'sanda-cars']: [{ id: 5, name: 'ワゴンR', num: '3503' }],
    [STOR + 'rentalcars']: [{ id: 101, name: 'ノマド', num: '3101' }],
    [STOR + 'honten-lres']: { '1': { r1: { id: 9001, user: '前村　和子', fy: LF.y, fm: LF.m, fd: LF.d, ty: LT.y, tm: LT.m, td: LT.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'insp-' + dk(TD) + '-0' } }, '2': {} },
    [STOR + 'sanda-lres']: {},
    [STOR + 'rres']: {},
    [STOR + 'cf-search-index']: { built: Date.now(), total: 2, chunks: 1, files: ['202610'] },
    [STOR + 'cf-search-chunk-0']: [
      { n: '鈴木　一郎', c: 'プリウス', no: '1234', p: '090-5555-6666', e: '2027/03', f: '202610', a: '' },
      { n: '佐藤　花子', c: 'フィット', no: '5678', p: '078-777-8888', e: '2027/05', f: '202610', a: '' },
    ],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(900);

  head('① ヘッダーから控えを保存できる');
  t('「💾 控え」のボタンがある', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.indexOf('控え') >= 0 && b.offsetParent !== null)));
  await clickText(page, '💾 控え');
  await page.waitForTimeout(500);
  t('店を選ぶ画面が出る', await seeText(page, 'どの店の分を出しますか', 5000));
  t('店ごとに別ファイルになると書いてある', (await page.evaluate(() => document.body.innerText)).includes('店ごとに別のファイル'));

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-off-'));
  const grab = async (btn) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), clickText(page, btn)]);
    const f = path.join(outDir, dl.suggestedFilename());
    await dl.saveAs(f);
    return { file: f, name: dl.suggestedFilename(), html: fs.readFileSync(f, 'utf8') };
  };
  const hon = await grab('🏠 本店の分');
  t('本店の控えが保存される', !!hon.html, hon.name);
  t('ファイル名に店と日付が入る', /予定表_本店_\d+-\d+-\d+\.html/.test(hon.name), hon.name);
  t('保存できたと画面に出る', await seeText(page, '保存しました', 8000), await page.evaluate(() => document.body.innerText.slice(0, 400)));

  head('② 中身（本店の控え）');
  t('本店の車検が入っている', hon.html.indexOf('前村　和子') > 0);
  t('★三田店の車検は入っていない（店が混ざらない）', hon.html.indexOf('三田　太郎') < 0);
  t('★三田店の整備も入っていない', hon.html.indexOf('西浦　三田') < 0);
  t('整備が入っている', hon.html.indexOf('桑田　陽子') > 0);
  t('電話番号が入っている', hon.html.indexOf('090-1234-5678') > 0);
  t('代車の貸出が入っている', hon.html.indexOf('ハスラー') > 0);
  t('備考が入っている', hon.html.indexOf('部品待ち') > 0);
  t('スタッフ休日が入っている', hon.html.indexOf('幸田桂紀') > 0);
  t('★ずっと先の日（46日後）も入っている', hon.html.indexOf('遠藤　先夫') > 0);
  t('顧客リストが入っている', hon.html.indexOf('鈴木　一郎') > 0 && hon.html.indexOf('佐藤　花子') > 0);
  t('受付メモ用紙が入っている', hon.html.indexOf('オフライン受付メモ') > 0);
  t('★外から何も読み込んでいない（http を参照しない）',
    !/(src|href)\s*=\s*["']?https?:/i.test(hon.html), (hon.html.match(/(src|href)\s*=\s*["']?https?:[^"'\s>]*/i) || [])[0]);

  head('③ 三田店の控えは三田店だけ');
  const san = await grab('🏪 三田店の分');
  t('三田店の控えが保存される', /予定表_三田店_/.test(san.name), san.name);
  t('★三田店の車検が入っている', san.html.indexOf('三田　太郎') > 0);
  t('★本店の車検は入っていない', san.html.indexOf('前村　和子') < 0);
  t('★本店の整備も入っていない', san.html.indexOf('桑田　陽子') < 0);
  t('三田店の整備が入っている', san.html.indexOf('西浦　三田') > 0);

  head('④ ネットが無くても開ける（file:// で開いて確かめる）');
  const off = await ctx.newPage();
  const outside = [];
  off.on('request', r => { const u = r.url(); if (/^https?:/i.test(u)) outside.push(u); });
  const offErrs = []; off.on('pageerror', e => offErrs.push(String(e)));
  await off.goto('file:///' + hon.file.replace(/\\/g, '/'), { waitUntil: 'load' });
  await off.waitForTimeout(700);
  t('★外へ1回も取りに行かない', outside.length === 0, outside.slice(0, 3));
  t('画面のエラーが無い', offErrs.length === 0, offErrs.slice(0, 2));
  t('作成時刻が出ている', (await off.evaluate(() => document.body.innerText)).indexOf('この写しをつくった時刻') >= 0);
  t('日にちの選択肢がある', (await off.evaluate(() => document.querySelectorAll('#d option').length)) >= 2);
  t('その日の予定が見えている', (await off.evaluate(() => document.body.innerText)).indexOf('前村　和子') >= 0);
  t('印刷のボタンが3つある', (await off.evaluate(() => ['p1', 'p2', 'p3'].every(i => !!document.getElementById(i)))));

  head('⑤ 控えの中で日を切り替えられる／お客様をさがせる');
  const far = dk(FAR);
  const switched = await off.evaluate(x => { const s = document.getElementById('d'); s.value = x; s.onchange(); const on = document.querySelector('.sheet.on'); return on ? on.getAttribute('data-dk') : null; }, far);
  t('★遠い先の日に切り替えられる', switched === far, { switched, far });
  t('切り替えた日の中身が出る', (await off.evaluate(() => document.querySelector('.sheet.on').innerText)).indexOf('遠藤　先夫') >= 0);
  await off.evaluate(() => { const q = document.getElementById('q'); q.value = '鈴木'; q.oninput(); });
  await off.waitForTimeout(200);
  t('★お客様をさがせる（氏名）', (await off.evaluate(() => document.getElementById('qr').innerText)).indexOf('鈴木　一郎') >= 0);
  t('関係ない人は出ない', (await off.evaluate(() => document.getElementById('qr').innerText)).indexOf('佐藤　花子') < 0);
  await off.evaluate(() => { const q = document.getElementById('q'); q.value = '5678'; q.oninput(); });
  await off.waitForTimeout(200);
  t('★ナンバーでもさがせる', (await off.evaluate(() => document.getElementById('qr').innerText)).indexOf('佐藤　花子') >= 0);

  t('スケジュール画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) {}
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
