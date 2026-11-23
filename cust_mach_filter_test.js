// 顧客リスト：マッハ車検だけを呼び出すボタン（2026-11-23 ユーザー指示）
//   ユーザーの言葉：「顧客リストの検索で、マッハ車検対象者のみ検索で呼び出すことのできる
//   ボタンが欲しい。マッハ車検の予約が確定している人と、仮予約で日にちが決まってない人と、
//   マッハ車検を予約してキャンセルした人も対象。つまり顧客リストのマッハのバッジが
//   ついている人を呼び出すように」
//   ＝【バッジを出す決まりとまったく同じ条件】で絞る：
//      status が 'none'（未予約）でない ＆ course が 1
//   ★状態の絞り込み（すべて／キャンセル…）とは別に効く＝「マッハのキャンセルだけ」も見られる。
//   実行: node cust_mach_filter_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8523, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const FILE = '202701x';
const mk = (i, o) => Object.assign({
  custId: FILE + '__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-0' + i,
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  dm1Sent: false, dm2Sent: false,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});

// 客1 マッハ・本予約 ／ 客2 マッハ・仮予約（日にち未定）／ 客3 マッハ・キャンセル
// 客4 クイック・本予約 ／ 客5 レギュラー・仮予約 ／ 客6 マッハだけど未予約（バッジが出ない）
// 客7 コースなし・本予約
const CUSTS = [
  mk(1, { course: 1, status: 'confirm', linkedInspDate: '2027-01-15' }),
  mk(2, { course: 1, status: 'temp' }),
  mk(3, { course: 1, status: 'cancel', note: '2年前にマッハで予約' }),
  mk(4, { course: 2, status: 'confirm', linkedInspDate: '2027-01-16' }),
  mk(5, { course: 3, status: 'temp' }),
  mk(6, { course: 1, status: 'none' }),
  mk(7, { course: 0, status: 'confirm', linkedInspDate: '2027-01-17' }),
];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: FILE, count: CUSTS.length }],
  [STOR + 'cf-' + FILE + '-index']: { name: FILE, chunks: 1, total: CUSTS.length },
  [STOR + 'cf-' + FILE + '-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// 一覧に並んでいる人（氏名の列）と、コースの列に出ているバッジの字
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => {
  const tds = [...tr.children];
  if (tds.length < 12) return null;
  return { name: (tds[1].innerText || '').split('\n')[0].trim(), badge: (tds[10].innerText || '').trim() };
}).filter(Boolean));
const names = (page) => rows(page).then(r => r.map(x => x.name));
const clickText = async (page, s) => page.evaluate((s) => {
  const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && (e.innerText || '').indexOf(s) >= 0);
  if (!b) return false; b.click(); return true;
}, s);

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
  const me = { email: 'egawa@midori-m.com', fbuid: 'uid_ega', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin', kind: 'own' };
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: me.kind, l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email, isAdmin: true }]));
    localStorage.setItem(stor + 'auth-kind', me.kind);
  }, [me, STOR, seed]);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(() => document.body.innerText.includes('客1'), null, { timeout: 25000 }); } catch (e) {}
  await page.waitForTimeout(1500);

  head('① 下ごしらえ（バッジの出方）');
  let r = await rows(page);
  t('7人とも並んでいる', r.length === 7, r);
  t('マッハの3人にバッジ「マ」が出る', ['客1', '客2', '客3'].every(n => (r.find(x => x.name === n) || {}).badge === 'マ'), r);
  t('★未予約の客6にはバッジが出ない（だから対象外）', (r.find(x => x.name === '客6') || {}).badge === '', r);

  head('② ボタンがある');
  t('「🚗 マッハのみ」のボタンがある', await page.evaluate(() =>
    [...document.querySelectorAll('button[data-coursefilter]')].some(b => b.offsetParent !== null && /マッハのみ/.test(b.innerText || ''))));
  t('押す前は all', await page.$eval('button[data-coursefilter]', b => b.getAttribute('data-coursefilter')) === 'all');

  head('③ 押すとマッハのバッジが付いている人だけになる');
  t('ボタンを押せた', await clickText(page, 'マッハのみ'));
  await page.waitForTimeout(400);
  let n = await names(page);
  t('★3人だけ残る（本予約・仮予約・キャンセル）', n.length === 3, n);
  t('★本予約の客1が残る', n.includes('客1'), n);
  t('★日にち未定の仮予約の客2が残る', n.includes('客2'), n);
  t('★キャンセルの客3が残る', n.includes('客3'), n);
  t('★クイックの客4は出ない', !n.includes('客4'), n);
  t('★レギュラーの客5は出ない', !n.includes('客5'), n);
  t('★未予約（バッジなし）の客6は出ない', !n.includes('客6'), n);
  t('★コースなしの客7は出ない', !n.includes('客7'), n);
  t('押したあとは mach', await page.$eval('button[data-coursefilter]', b => b.getAttribute('data-coursefilter')) === 'mach');
  t('件数表示も3件になる', await page.evaluate(() => /3件表示/.test(document.body.innerText)));

  head('④ 状態の絞り込みと重ねられる（マッハのキャンセルだけ）');
  t('「キャンセル」を押せた', await clickText(page, 'キャンセル'));
  await page.waitForTimeout(400);
  n = await names(page);
  t('★マッハのキャンセル1人だけ', n.length === 1 && n[0] === '客3', n);
  t('「すべて」に戻せた', await clickText(page, 'すべて'));
  await page.waitForTimeout(400);
  n = await names(page);
  t('マッハの3人に戻る', n.length === 3, n);

  head('⑤ もう一度押すと解除される');
  t('ボタンを押せた', await clickText(page, 'マッハのみ'));
  await page.waitForTimeout(400);
  n = await names(page);
  t('★7人に戻る', n.length === 7, n);
  t('all に戻る', await page.$eval('button[data-coursefilter]', b => b.getAttribute('data-coursefilter')) === 'all');

  head('⑥ 検索と重ねられる');
  t('ボタンを押せた', await clickText(page, 'マッハのみ'));
  await page.waitForTimeout(300);
  await page.fill('input[placeholder*="検索"]', '客2');
  await page.waitForTimeout(400);
  n = await names(page);
  t('★マッハの中から客2だけ', n.length === 1 && n[0] === '客2', n);
  await page.fill('input[placeholder*="検索"]', '客4');
  await page.waitForTimeout(400);
  n = await names(page);
  t('★マッハでない客4は出ない（0件）', n.length === 0, n);
  t('「条件に一致する顧客がいません」と出る', await page.evaluate(() => /条件に一致する顧客がいません/.test(document.body.innerText)));
  await page.fill('input[placeholder*="検索"]', '');
  await page.waitForTimeout(300);

  // 見た目の確認用（SHOT=<保存先.png> node cust_mach_filter_test.js）。マッハのみを押した状態で撮る
  if (process.env.SHOT) {
    if (await page.$eval('button[data-coursefilter]', b => b.getAttribute('data-coursefilter')) !== 'mach') await clickText(page, 'マッハのみ');
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => { const i = document.querySelector('input[placeholder*="検索"]'); const r = i.parentElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.screenshot({ path: process.env.SHOT, clip: box });
    console.log('  📷 ' + process.env.SHOT);
  }

  head('⑦ 後始末');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
