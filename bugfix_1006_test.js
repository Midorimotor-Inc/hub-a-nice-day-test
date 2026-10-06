// 2026-10-06 の現場報告3件の検査
//   ① 他の人が動かした予定の「前の時間」が、見ているPCにだけ残る（幽霊の行）
//   ② スタッフの名前を変えると、休日がカレンダーには出てスケジュールには出ない
//   ③ 入庫のチェックが、納車日の行にもそのまま出てしまう
//   実行: node bugfix_1006_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8299, STOR = 'hub-v8-dev-';
const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);

// ソースから「const 名前 = …;」または「function 名前(…){…}」を1つ取り出す
const grab = (name) => {
  for (const kw of ['const ', 'let ', 'function ']) {
    const m = SRC.indexOf(NL + kw + name);
    if (m < 0) continue;
    const isFn = kw === 'function ';
    let i = m + 1, depth = 0, sawEq = false, started = false;
    for (; i < SRC.length; i++) {
      const c = SRC[i];
      if (c === '{' || c === '(' || c === '[') { depth++; started = true; }
      else if (c === '}' || c === ')' || c === ']') {
        depth--;
        if (isFn && started && depth === 0 && c === '}') return SRC.slice(m + 1, i + 1);
      }
      else if (!isFn && c === '=' && depth === 0) sawEq = true;
      else if (!isFn && c === ';' && depth === 0 && sawEq) return SRC.slice(m + 1, i + 1);
    }
  }
  throw new Error(name + ' が見つかりません');
};

// ════════ ① 幽霊の行（mergeSharedObjects） ════════
head('① 他の人が動かした予定の「前の時間」が残らないか');
const sandbox = {};
new Function('exports',
  ['SHARED_FRESH_MS', 'sharedRecTs', 'sharedRecFresh', 'SH_SEP', '_shMine', 'shMineMark', 'shMineHas', 'mergeSharedObjects']
    .map(grab).join(NL) + NL +
  'exports.mergeSharedObjects=mergeSharedObjects;exports.shMineMark=shMineMark;exports._shMine=_shMine;exports.SHARED_FRESH_MS=SHARED_FRESH_MS;')(sandbox);
const { mergeSharedObjects, shMineMark, _shMine, SHARED_FRESH_MS } = sandbox;

const KEY = STOR + 'sanda-sched';
const DK = '2026-10-6';
const NOW = Date.now();
// 三田店のPCが 11時に作って、48秒後に 13時へ動かした（本番データと同じ時間差）
const rowAt11 = { name: '小西　怜史', work: 'Q', at: NOW - 60000, id: NOW - 60000 };
const rowAt13 = { name: '小西　怜史', work: 'Q', at: NOW - 60000, id: NOW - 12000 };
const localOnMyPc = { [DK]: { '11:00': rowAt11 } };          // 本店のPCが持っている古い写し
const fromServer = { [DK]: { '13:00': rowAt13 } };           // サーバーの今の中身

for (const k in _shMine) delete _shMine[k];
const merged = mergeSharedObjects(localOnMyPc, fromServer, NOW, KEY);
t('自分が書いていない枠は、消えたら消えたままになる（幽霊を作らない）',
  !merged[DK]['11:00'] && !!merged[DK]['13:00'], Object.keys(merged[DK]));

// 自分で書いた分は、サーバーがまだ知らなくても残す（保存直後に消えないため）
for (const k in _shMine) delete _shMine[k];
shMineMark(KEY, { [DK]: {} }, { [DK]: { '15:00': { name: '自分の新規', at: NOW, id: NOW } } });
const mine = mergeSharedObjects(
  { [DK]: { '15:00': { name: '自分の新規', at: NOW, id: NOW } } }, { [DK]: {} }, NOW, KEY);
t('自分がさっき書いた枠は、サーバーがまだ知らなくても残る', !!mine[DK]['15:00'], Object.keys(mine[DK]));

// 時間がたった自分の書き込みは、もう守らない（サーバーが正）
for (const k in _shMine) delete _shMine[k];
shMineMark(KEY, { [DK]: {} }, { [DK]: { '15:00': { name: '自分の新規', at: NOW, id: NOW } } });
_shMine[KEY][DK + String.fromCharCode(0) + '15:00'] = NOW - SHARED_FRESH_MS - 1000;
const old = mergeSharedObjects(
  { [DK]: { '15:00': { name: '自分の新規', at: NOW, id: NOW } } }, { [DK]: {} }, NOW, KEY);
t('時間がたった自分の書き込みは守らない（サーバーが正）', !old[DK]['15:00'], Object.keys(old[DK]));

// 両方にある枠は、新しい方を採る（自分の編集がサーバーの古い写しに負けない）
for (const k in _shMine) delete _shMine[k];
const both = mergeSharedObjects(
  { [DK]: { '13:00': { name: '直した名前', at: NOW - 60000, id: NOW } } },
  { [DK]: { '13:00': { name: '古い名前', at: NOW - 60000, id: NOW - 30000 } } }, NOW, KEY);
t('両方にある枠は新しい方が残る', both[DK]['13:00'].name === '直した名前', both[DK]['13:00'].name);
const both2 = mergeSharedObjects(
  { [DK]: { '13:00': { name: '手元の古い', at: NOW - 60000, id: NOW - 30000 } } },
  { [DK]: { '13:00': { name: '他の人の新しい', at: NOW - 60000, id: NOW } } }, NOW, KEY);
t('他の人の新しい変更はちゃんと入る', both2[DK]['13:00'].name === '他の人の新しい', both2[DK]['13:00'].name);

// 他の人が消した日まるごとも復活させない
for (const k in _shMine) delete _shMine[k];
const delDay = mergeSharedObjects({ [DK]: { '09:00': rowAt11 } }, {}, NOW, KEY);
t('他の人が消した予定は日ごと消えたままになる', !(delDay[DK] && delDay[DK]['09:00']), delDay);

// 数値・配列は今までどおり（台数制限が空になる事故の再発防止）
t('数値はサーバー値をそのまま使う（台数制限が空にならない）',
  mergeSharedObjects({ '2026-10-6': 5 }, { '2026-10-6': 7 }, NOW, KEY)['2026-10-6'] === 7);
t('配列はサーバー値をそのまま使う',
  JSON.stringify(mergeSharedObjects({ a: [1, 2] }, { a: [3] }, NOW, KEY).a) === '[3]');

// ════════ 画面の検査 ════════
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
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

const now = new Date();
const TODAY = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const TOM = (() => { const d = new Date(now.getTime() + 86400000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })();
const YEST = (() => { const d = new Date(now.getTime() - 86400000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })();

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    // 作業日は今日、納車日は明日。入庫のチェックはまだ付いていない
    [STOR + 'honten-sched']: {
      // A：今日の予定（納車日なし）。ここで入庫チェックを押す
      [TODAY]: { '09:00': { name: '入庫テスト', carType: 'アルト', work: 'Q', content: 'オイル交換', store: 'honten', at: 1, id: 1 } },
      // B：昨日の予定で納車日が今日（入庫はもう済ませてある）。今日の表に「🏁 納車」の行として出る
      [YEST]: { '10:00': { name: '納車テスト', carType: 'ワゴンR', work: 'Q', content: 'タイヤ交換', arrived: true, deliveryDate: TODAY, deliveryTime: '13:00', store: 'honten', at: 2, id: 2 } },
    },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    // ★幸田さんは名簿が「幸田桂紀」、休日データは古い「幸田かつのり」（本番と同じ食い違い）
    [STOR + 'honten-staff-v2']: [
      { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
      { uid: 'h4', name: '幸田桂紀', myNumber: 4, badge: 'mechanic', store: 'honten' },
      { uid: 'h5', name: '魚住圭', myNumber: 5, badge: 'mechanic', store: 'honten' },
    ],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-dayoff']: { [TODAY]: ['魚住圭', '幸田かつのり'] },
    [STOR + 'sanda-dayoff']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);

  head('② スタッフの名前を変えても休日が消えないか');
  t('名簿に無い名前の休日も、スケジュールのスタッフ帯に出る', await seeText(page, '幸田かつのり', 8000),
    await page.evaluate(() => (document.body.innerText.match(/幸田[^\s]*/g) || []).slice(0, 5)));
  t('名簿に無いことが分かる印（⚠）が付く', await page.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(e => e.innerText.indexOf('幸田かつのり') >= 0 && e.offsetParent !== null);
    return !!el && el.innerText.indexOf('⚠') >= 0;
  }));
  t('名簿にある人の休日は今までどおり出る', await seeText(page, '魚住圭', 5000));

  head('③ 入庫のチェックが納車日の行に出ないか');
  // A：今日の予定（納車日なし）で入庫チェックを押す
  t('作業日の行で入庫チェックを押せる', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(x => x.innerText.indexOf('入庫テスト') >= 0);
    if (!tr) return false;
    tr.querySelector('td').click(); return true;
  }));
  await page.waitForTimeout(2500);
  const st1 = await page.evaluate(([k, dk]) => {
    const r = (((window.__fakeFb.get(k) || {})[dk]) || {})['09:00'] || {};
    return { arrived: !!r.arrived, delivered: !!r.delivered };
  }, [STOR + 'honten-sched', TODAY]);
  t('入庫チェックで arrived が付く', st1.arrived === true, st1);
  t('入庫チェックでは納車（delivered）は付かない', st1.delivered === false, st1);

  // B：昨日の予定の「🏁 納車」の行。入庫は済んでいるが、納車のチェックは外れていること
  const dl = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(x => x.innerText.indexOf('🏁 納車') >= 0 && x.innerText.indexOf('納車テスト') >= 0);
    if (!tr) return null;
    const td = tr.querySelector('td');
    return { text: td.innerText.trim(), checked: td.innerText.indexOf('✓') >= 0, title: td.getAttribute('title') || '' };
  });
  t('納車日の行が出る', !!dl, dl);
  t('入庫済みでも納車日の行のチェックは外れている', dl && dl.checked === false, dl);
  t('納車日の行の説明が「納車」になっている', !!dl && /納車/.test(dl.title) && dl.title.indexOf('入庫') < 0, dl && dl.title);

  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(x => x.innerText.indexOf('🏁 納車') >= 0 && x.innerText.indexOf('納車テスト') >= 0);
    if (tr) tr.querySelector('td').click();
  });
  await page.waitForTimeout(2500);
  const st2 = await page.evaluate(([k, dk]) => {
    const r = (((window.__fakeFb.get(k) || {})[dk]) || {})['10:00'] || {};
    return { arrived: !!r.arrived, delivered: !!r.delivered };
  }, [STOR + 'honten-sched', YEST]);
  t('納車日の行を押すと delivered が付く', st2.delivered === true, st2);
  t('そのとき入庫（arrived）は変わらない', st2.arrived === true, st2);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
