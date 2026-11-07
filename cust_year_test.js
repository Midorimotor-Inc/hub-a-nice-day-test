// 顧客リストの予約が「1年前の日」に入ってしまう件の見張り（2026-11-07）
//
//   現場報告：「顧客リストの 2027.01 ファイルの1月28日満期の競様の車検を入力しても、
//              保存はできるのにスケジュールに反映しない。日付を変えても反映しない。」
//
//   本当に起きていたこと（本番の実データで裏取り済み）：
//     競様の入庫日は "2026-01-09"＝【2026年】1月。スケジュール（insp）にも 2026-1-9 に入っていた。
//     2027年1月を見ても出てこないのは当たり前で、しかも過去日なので翌朝の仕分けで
//     保管箱（insp-arch）へ移り、ますます見えなくなっていた。
//     もとは元ファイル（202701.xlsx）の入庫日の欄そのもの。担当者が「1/8」と打つと
//     エクセルがその時の年（2026）を付けるため、2027年1月のファイルに 2026-01-08 が入る。
//     同じことが 202701 の8件で起きていた（松○・今○・麻○・岩○・競○・東○・桂○・株○）。
//
//   歯止めは3つ（この検査で見張る）：
//     ① 取り込み … fixYear でファイルの年月に合わせて年を直し、直した件数を取り込み結果に出す
//     ② 保存　　 … 入庫日が過去の日なら「年が違っていませんか？」と確かめる
//     ③ カレンダー… 入庫日が空の時は【満了月】を開く（今月を開くと1年前の日を押してしまう）
//
//   実行: node cust_year_test.js
//        SHOT=<保存先.png> node cust_year_test.js  … その時の見た目を撮る
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8443, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };

// ═══ ① fixYear（純関数）────────────────────────────────
//   画面の関数をそのままファイルから取り出して当てる（写し間違いが起きないように）
console.log('\n■ ① 取り込みの fixYear（ファイルの年月に年を合わせる）');
{
  const src = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const i = src.indexOf('const fixYear=');
  const j = src.indexOf('\n};', i);
  t('customers.html に fixYear がある', i > 0 && j > i);
  if (i > 0 && j > i) {
    const fixYear = new Function(src.slice(i, j + 3) + ' return fixYear;')();
    const cases = [
      ['2026-01-08', 2027, 1, '2027-01-08', '★競様と同じ1年ズレ → 2027年に直す'],
      ['2026-01-28', 2027, 1, '2027-01-28', '★満期と同じ月の1年ズレも直す'],
      ['2025-01-05', 2027, 1, '2027-01-05', '2年ズレも直す'],
      ['2026-02-03', 2027, 1, '2027-02-03', '翌月でも1年ズレは直す'],
      ['2026-12-20', 2027, 1, '2026-12-20', '★前月入庫はふつう → 触らない'],
      ['2027-01-28', 2027, 1, '2027-01-28', '合っているものは触らない'],
      ['2027-08-01', 2027, 1, '2027-08-01', '★7ヶ月先＝年のズレとは言えない → 触らない'],
      ['2026-11-05', 2026, 11, '2026-11-05', 'そのファイルの月はそのまま'],
      ['__MD__01-08', 2027, 1, '__MD__01-08', '年が無い日付は fixMD の受け持ち → 触らない'],
      ['2026-1-8', 2027, 1, '2026-1-8', 'ゼロ詰めでない形は触らない'],
      ['', 2027, 1, '', '空はそのまま'],
      ['2026-01-08', 2027, 0, '2026-01-08', '★ファイル名から月が取れない時は触らない'],
    ];
    for (const [v, y, m, want, why] of cases) {
      const got = fixYear(v, y, m);
      t(why + '（' + (v || '空') + ' → ' + (got || '空') + '）', got === want, { got, want });
    }
  }
  // 取り込みが fixYear を通していること／直した件数を出していること（中身で見張る）
  t('★取り込みの pd が fixYear を通している', /const pd=\(v,who\)=>\{[\s\S]{0,200}fixYear\(raw,baseY,baseM\)/.test(src));
  t('★直した件数を数えている（yearFixes）', /yearFixes\.push\(/.test(src) && /yearFixed:yearFixes\.length/.test(src));
  t('★取り込み結果の文に出す（黙って直さない）', /年をファイルの年月に合わせて直しました/.test(src));
}

// ═══ ②③ 画面 ─────────────────────────────────────────
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 7];                 // 今日を 2026-11-07 に固定
// 2027年1月28日 満期のお客様（競様と同じ形。氏名は架空）
const CUST = { custId: 'F__1__年ずれ太郎', rowIdx: 1, expiry: '2027-01-28', name: '年ずれ太郎', no: 7777, carType: 'ワゴンＲ',
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '' };

const seed = {
  [STOR + 'insp']: {},
  [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: 1 }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: 1 },
  [STOR + 'cf-202701-chunk-0']: [CUST],
  [STOR + 'cust-updates']: [],
};

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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('年ずれ太郎'));

  const openCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /＋予約/.test(e.innerText)); if (b) b.click(); });
    await page.waitForTimeout(1200);
  };
  const openCal = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(e => /カレンダーを開く/.test(e.innerText));
      if (b) b.click();
    });
    await page.waitForTimeout(600);
  };
  const closeCal = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(e => /▲ 閉じる/.test(e.innerText));
      if (b) b.click();
    });
    await page.waitForTimeout(400);
  };
  const mon = () => page.evaluate(() => { const m = document.querySelector('[data-custmon]'); return m ? m.getAttribute('data-custmon') : null; });

  await openCard();
  t('予約カードが開く', await page.evaluate(() => !!document.querySelector('input[placeholder="担当者名"]')));

  console.log('\n■ ③ 入庫日のカレンダーは【満了月】から開く');
  await openCal();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  t('★満了（2027-01-28）の月が開く（今月＝2026-11 ではない）', (await mon()) === '2027-01', await mon());

  // 月を送っても、閉じて開き直したら満了月に戻る（部品は閉じても state が残るため）
  await page.evaluate(() => {
    const h = document.querySelector('[data-custmon]');
    const nx = h && h.parentElement ? h.parentElement.querySelectorAll('button')[1] : null;
    if (nx) nx.click();
  });
  await page.waitForTimeout(400);
  t('› で次の月に送れる', (await mon()) === '2027-02', await mon());
  await closeCal(); await openCal();
  t('★閉じて開き直すと、また満了月から（前に見た月を覚えていない）', (await mon()) === '2027-01', await mon());

  console.log('\n■ ② 入庫日が過去なら「年が違っていませんか？」と確かめる');
  // カレンダーで 2026年1月8日（＝1年前の日）を選ぶ
  for (let i = 0; i < 12; i++) {
    const m = await mon();
    if (m === '2026-01') break;
    await page.evaluate(() => {
      const h = document.querySelector('[data-custmon]');
      const pv = h && h.parentElement ? h.parentElement.querySelectorAll('button')[0] : null;
      if (pv) pv.click();
    });
    await page.waitForTimeout(150);
  }
  t('カレンダーを 2026年1月まで戻せる', (await mon()) === '2026-01', await mon());
  await page.evaluate(() => { const d = document.querySelector('[data-custday="2026-01-08"]'); if (d) d.click(); });
  await page.waitForTimeout(500);
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /^(20\d{2})年/.test(e.innerText.trim()));
    return document.body.innerText.includes('2026') ? '2026' : null;
  });
  t('1年前の日（2026-01-08）を選べてしまう（画面の作りは変えていない）', picked === '2026', picked);

  dialogs.length = 0;
  await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(e => e.innerText.trim() === '仮予約'); const b = bs[bs.length - 1]; if (b) b.click(); });
  await page.waitForTimeout(800);
  const msg = dialogs.join(' / ');
  t('★入庫日が過去なら確認が出る', /入庫日が過去の日です/.test(msg), msg);
  t('★「年が違っていませんか？」と書いてある', /年が違っていませんか/.test(msg), msg);
  t('★その方の満了日も出す（見比べられる）', /2027-01-28/.test(msg), msg);
  t('★「いいえ」なら保存しない（カードは開いたまま）',
    await page.evaluate(() => !!document.querySelector('input[placeholder="担当者名"]')));
  t('★スケジュール（insp）に1年前の予約は入っていない',
    await page.evaluate((stor) => {
      const v = window.__fakeFb.get(stor + 'insp') || {};
      return !Object.keys(v).some(k => /^2026-1-/.test(k));
    }, STOR));

  console.log('\n■ これから先の日なら、確認は出さない（じゃまをしない）');
  dialogs.length = 0;
  await openCal();
  for (let i = 0; i < 24; i++) {
    const m = await mon();
    if (m === '2027-01') break;
    await page.evaluate(() => {
      const h = document.querySelector('[data-custmon]');
      const nx = h && h.parentElement ? h.parentElement.querySelectorAll('button')[1] : null;
      if (nx) nx.click();
    });
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => { const d = document.querySelector('[data-custday="2027-01-20"]'); if (d) d.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(e => e.innerText.trim() === '仮予約'); const b = bs[bs.length - 1]; if (b) b.click(); });
  await page.waitForTimeout(1200);
  t('★先の日では確認を出さない', dialogs.length === 0, dialogs);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
