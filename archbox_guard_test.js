// 保管箱（insp-arch）の予約で印を押しても、その日の車検が消えないかの検査（2026-11-05 現場報告の直し）。
//   ユーザーの言葉：「マッハのバッジの下にブーというブーの丸、これをクリックすると、車検がすべて消えてしまいます」
//   何が起きていたか：
//     14日より前の予約は insp から保管箱（insp-arch）へ移してあり、画面は {...保管箱, ...insp} の合体で出す。
//     印（部品注文・入庫・納車）の保存は insp にしか効かないので、保管箱の予約を押すと
//     patchInspBooking が「行が見つからない」まま data[その日]=[] を書き、
//     【空の配列が保管箱の予約を覆い隠して、その日の車検がぜんぶ消えた】。
//     しかもサーバーにも空の日が書かれるので、全員の画面から隠れたままになる（本番 10/7・10/8）。
//   ここで見ること：
//     ① 保管箱にだけある日の車検が画面に出る
//     ② 部 の丸を押しても、その日の車検が消えない
//     ③ 押した時に「保管箱なので印は付けられません」と伝える
//     ④ サーバーの insp に「空の日」を書かない
//     ⑤ 入庫チェック（No.欄）でも同じ（同じ元凶を共有している）
//     ⑥ 純関数 patchInspBooking は、行が見つからない時に base を1文字も変えない
//   実行: node archbox_guard_test.js   （FILE=別のファイル名 で古い版も試せる）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8441, STOR = 'hub-v8-dev-';
const FILE = process.env.FILE || 'index_dev.html';
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
};
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
const other = new Date(now.getTime() + 86400000 * 3);
const DK2 = other.getFullYear() + '-' + (other.getMonth() + 1) + '-' + other.getDate();

// 画面に出ている車検の行（コースのバッジで見分ける）
const inspNames = page => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('table tbody tr').forEach(tr => {
    const bdg = [...tr.querySelectorAll('span')].map(x => (x.textContent || '').replace(/\s+/g, ''))
      .find(x => /^(マ|ク|レ)(マッハ|クイック|レギュラー)$/.test(x));
    if (!bdg) return;
    const txt = (tr.innerText || '').replace(/\s+/g, ' ');
    const nm = txt.match(/保管箱\S*/);
    out.push({ course: bdg.slice(1), name: nm ? nm[0] : txt.slice(0, 12), chip: !!tr.querySelector('[data-partschip]') });
  });
  return out;
});
const serverInsp = page => page.evaluate((stor) => {
  const v = window.__fakeFb.get(stor + 'insp') || {};
  const o = {};
  Object.keys(v).forEach(k => { o[k] = (v[k] || []).map(r => (r && r.name) ? (r.name + (r.parts ? '/部' : '') + (r.arrived ? '/入' : '')) : null); });
  return o;
}, STOR);

(async () => {
  // ★その日は【保管箱にだけ】ある（insp には別の日しか無い）＝本番 10/7・10/8 と同じ形
  const mk = (nm, c, tm) => ({ name: nm, carType: 'ハスラー', course: c, store: 'honten', no: '3310',
    time: tm, note: '', tokuten: '', staff: '江川', bookingStatus: 'confirmed', seq: 1700000000000 + c });
  const seed = {};
  seed[STOR + 'insp'] = {};
  seed[STOR + 'insp'][DK2] = [mk('よその日の人', 1, '10:00')];
  seed[STOR + 'insp-arch'] = {};
  seed[STOR + 'insp-arch'][DK] = [mk('保管箱マッハ一郎', 1, '10:00'), mk('保管箱マッハ二郎', 1, '14:00'), mk('保管箱クイック三郎', 2, '09:00')];
  seed[STOR + 'honten-sched'] = {}; seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];

  head('⑥ 純関数 patchInspBooking（行が見つからない時は base をそのまま返す）');
  const src = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  const at = src.indexOf('const patchInspBooking');
  const fn = src.slice(at, at + 1600);
  t('行が無い時に base を返している', fn.indexOf('if(j<0)return base;') >= 0, fn.slice(0, 400));
  t('空の配列を書く道が残っていない', fn.indexOf('if(j>=0)rows[j]=') < 0);

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
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/' + FILE, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(2000);

  head('① 保管箱にだけある日の車検が画面に出る');
  const before = await inspNames(page);
  t('3件そろって出る', before.length === 3, before);
  t('マッハ2件・クイック1件', before.filter(r => r.course === 'マッハ').length === 2 && before.filter(r => r.course === 'クイック').length === 1, before);
  t('マッハの行に 部 の丸が出る', before.filter(r => r.chip).length === 2, before);
  const srvBefore = await serverInsp(page);
  t('はじめは insp にその日のキーが無い', srvBefore[DK] === undefined, srvBefore);

  head('② 部 の丸を押しても、その日の車検が消えない');
  dialogs.length = 0;
  await page.evaluate(() => { const c = document.querySelector('[data-partschip]'); if (c) c.click(); });
  await page.waitForTimeout(1500);
  const mid = await inspNames(page);
  t('押した直後も3件のまま', mid.length === 3, mid);
  await page.waitForTimeout(5000);
  const after = await inspNames(page);
  t('5秒待っても3件のまま（★ここが本番で消えていた）', after.length === 3, after);

  head('③ 「保管箱なので印は付けられません」と伝える');
  t('伝える文が出た', dialogs.some(d => d.indexOf('保管箱') >= 0), dialogs);
  t('「印は付けられません」と書いてある', dialogs.some(d => d.indexOf('印は付けられません') >= 0), dialogs);

  head('④ サーバーの insp に「空の日」を書かない');
  const srv = await serverInsp(page);
  t('その日のキーを作っていない', srv[DK] === undefined, srv);
  t('よその日はそのまま', JSON.stringify(srv[DK2]) === JSON.stringify(['よその日の人']), srv);

  head('⑤ 入庫チェック（No.欄）でも同じ');
  dialogs.length = 0;
  await page.evaluate(() => { const td = [...document.querySelectorAll('td[title]')].find(e => (e.getAttribute('title') || '').indexOf('入庫したらクリック') >= 0); if (td) td.click(); });
  await page.waitForTimeout(1500);
  t('入庫チェックでも伝える文が出る', dialogs.some(d => d.indexOf('保管箱') >= 0), dialogs);
  await page.waitForTimeout(4500);
  const a2 = await inspNames(page);
  t('入庫チェックを押しても3件のまま', a2.length === 3, a2);
  const srv2 = await serverInsp(page);
  t('入庫チェックでも空の日を書かない', srv2[DK] === undefined, srv2);

  t('レンダリングエラーが無い', errs.length === 0, errs.slice(0, 2));
  console.log(String.fromCharCode(10) + '結果: ' + pass + '件 合格 / ' + fail + '件 不合格  (' + FILE + ')');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
