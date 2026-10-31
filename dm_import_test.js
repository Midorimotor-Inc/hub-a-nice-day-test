// 「📮 投函の印だけ取り込む」の検査
//   2026-10-31 ユーザー指示：202701 の元ファイルの黄色（まだ投函していない分）を、
//   すでに Hub に入っている 202701 に反映させたい。
//   ★ふつうの「＋Excelインポート」はその月を元ファイルで【まるごと置き換える】ので、
//     Hub 側だけで入れた予約・入庫日・担当が消える（本番の 202701 には予約が22件あった）。
//     そこで dm1Sent/dm2Sent だけを書き換える道を用意した。ここではそれを確かめる。
//   見ること：
//     ① 取り込む前は、印が無いので全部【白】
//     ② 📮 ボタンで元ファイルを選ぶと、黄色の分だけ【未投函】になる
//     ③ ★予約・入庫日・担当・状態・備考には一切さわらない
//     ④ サーバー側にも同じものが保存される
//   素材は fixtures/202701_sample.xlsx（架空の名前4件。投函①は2件だけ黄色）
//   実行: node dm_import_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8419, STOR = 'hub-v8-dev-';
const XLSX_FIX = path.join(DIR, 'fixtures', '202701_sample.xlsx');
if (!fs.existsSync(XLSX_FIX)) { console.error('素材がありません: ' + XLSX_FIX); process.exit(1); }
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const YELLOW = 'rgb(255, 242, 0)';
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FILE = '202701_sample';

// Hub 側のデータ。★投函の印（dm1Sent/dm2Sent）は わざと持たせない＝取り込み前の状態
const mk = (i, name, no, o) => Object.assign({
  custId: FILE + '__' + i + '__' + name.replace(/[\s　]/g, '') + '__' + no,
  rowIdx: i, expiry: '2027-01-0' + i, name, no, carType: 'テスト車' + 'ABCD'[i - 1],
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-09-12', dm1Book: '', dm2Date: '2026-09-19', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
const CUSTS = [
  mk(1, '架空　一郎', '9001', { note: 'メモは消えないこと' }),
  mk(2, '架空　二郎', '9002'),
  // ★この人は Hub 側で予約が入っている。取り込みで消えてはいけない
  mk(3, '架空　三郎', '9003', { status: 'confirm', entryDate: '2027-01-15', staff: '岡上秀一', bookingTime: '10:00', dm1Book: '2026-10-03' }),
  // ★custId の行番号をわざとずらす＝氏名＋Noで照らし合わせられるか
  Object.assign(mk(4, '架空　四郎', '9004'), { custId: FILE + '__99__架空四郎__9004' }),
];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: FILE, count: CUSTS.length }],
  [STOR + 'cf-' + FILE + '-index']: { name: FILE, chunks: 1, total: CUSTS.length },
  [STOR + 'cf-' + FILE + '-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// 画面に出ている投函のマス（n: 0=投函① 1=投函②）
const cells = (page, n) => page.evaluate((n) => {
  return [...document.querySelectorAll('tbody tr')].map(tr => {
    const tds = [...tr.children];
    if (tds.length < 8) return null;
    const td = tds[4 + n * 2];
    return { name: (tds[1].innerText || '').split('\n')[0].trim(), bg: getComputedStyle(td).backgroundColor };
  }).filter(Boolean);
}, n);
const serverRows = (page) => page.evaluate((k) => {
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  const raw = st['kv/' + k];
  return raw ? JSON.parse(raw.v) : null;
}, STOR + 'cf-' + FILE + '-chunk-0');

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
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));

  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('架空　一郎'));
  await page.waitForTimeout(700);

  head('① 取り込む前は印が無いので全部【白】');
  let c0 = await cells(page, 0);
  t('4件出ている', c0.length === 4, c0.length);
  t('★投函①は1件も黄色でない', c0.every(x => x.bg !== YELLOW), c0.map(x => x.bg));
  t('統計の未投函①は0件', await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(e => e.children.length === 2 && /^未投函①/.test(e.innerText));
    return d ? d.innerText.replace(/\s+/g, '') === '未投函①0' : false;
  }));

  head('② 📮 ボタンで元ファイルの黄色だけを取り込む');
  t('「📮 投函の印だけ取り込む」ボタンがある',
    await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /投函の印だけ取り込む/.test(b.innerText) && b.offsetParent !== null)));
  await page.setInputFiles('input[type=file]:not([multiple])', XLSX_FIX);
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const ask = dialogs.find(m => /投函の印だけを元ファイルから取り込みます/.test(m));
  t('★確認が出る', !!ask, dialogs.slice(0, 2));
  t('★取り込んだ後の件数を先に見せる（未投函① 2件）', !!ask && /未投函① … 2件/.test(ask), ask);
  t('★未投函② も 2件と出る', !!ask && /未投函② … 2件/.test(ask), ask);
  t('★「予約・入庫日…には一切さわりません」と書いてある', !!ask && /一切さわりません/.test(ask), ask);
  t('★その月の予約の件数を添える（1件）', !!ask && /予約が 1件 入っています/.test(ask), ask);

  c0 = await cells(page, 0);
  const c1 = await cells(page, 1);
  t('★投函①が黄色になったのは2件（一郎・二郎）',
    c0.filter(x => x.bg === YELLOW).map(x => x.name).join(',') === '架空　一郎,架空　二郎',
    c0.map(x => x.name + ':' + (x.bg === YELLOW ? '黄' : '白')));
  t('★投函②が黄色になったのは2件（一郎・四郎）',
    c1.filter(x => x.bg === YELLOW).map(x => x.name).join(',') === '架空　一郎,架空　四郎',
    c1.map(x => x.name + ':' + (x.bg === YELLOW ? '黄' : '白')));
  t('★custId がずれている四郎も、氏名＋Noで拾えている',
    c1.find(x => x.name === '架空　四郎').bg === YELLOW);

  head('③ 予約・入庫日・担当・状態・備考にはさわらない');
  const rows = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));
  // ★innerText を s+ でつぶすと全角スペースが半角になるので「架空　三郎」では当たらない
  const san = rows.find(x => /架空.*三郎/.test(x));
  t('★三郎の入庫日が残っている', !!san && /01\/15/.test(san), san);
  t('★三郎の担当が残っている', !!san && /岡上秀一/.test(san), san);
  t('★三郎の投函①は白のまま（元ファイルでも白）', c0.find(x => x.name === '架空　三郎').bg !== YELLOW);

  head('④ サーバーにも保存される');
  const sv = await page.waitForFunction((k) => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    const raw = st['kv/' + k]; if (!raw) return false;
    const list = JSON.parse(raw.v);
    return list.filter(c => c.dm1Sent === false).length === 2 ? list : false;
  }, STOR + 'cf-' + FILE + '-chunk-0', { timeout: 25000 }).then(h => h.jsonValue()).catch(() => null);
  t('★サーバー側も 未投函① 2件', !!sv, sv && sv.map(c => [c.name, c.dm1Sent]));
  const svSan = sv && sv.find(c => c.no === '9003' || c.no === 9003);
  t('★サーバー側でも三郎の予約が残っている', !!svSan && svSan.status === 'confirm' && svSan.entryDate === '2027-01-15', svSan && { s: svSan.status, e: svSan.entryDate, st: svSan.staff });
  t('★サーバー側でも三郎の担当が残っている', !!svSan && svSan.staff === '岡上秀一', svSan && svSan.staff);
  const svIch = sv && sv.find(c => c.no === '9001' || c.no === 9001);
  t('★備考も消えていない', !!svIch && svIch.note === 'メモは消えないこと', svIch && svIch.note);
  t('★件数は4件のまま（増えも減りもしない）', !!sv && sv.length === 4, sv && sv.length);

  head('⑤ Hub に無い月を選んだら、ふつうの取り込みに案内する');
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}'); window.__keep = st; });
  // 名前の違う素材は用意できないので、ここはメッセージの作りだけ確かめる
  t('案内の文が実装にある', await page.evaluate(() =>
    document.documentElement.innerHTML.indexOf('は Hub にまだありません') >= 0));

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
