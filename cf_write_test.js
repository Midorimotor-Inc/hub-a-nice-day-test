// 顧客リストの予約が「スケジュールには入るのに、リストの行だけサーバーに書かれない」の検査
//   2026-11-16 ユーザー報告：
//     「顧客リストの仮予約の分で 202701 の加登さん、こちらがスケジュールには
//       2026年12月20日に、本予約で入っています。これはバグではありませんか。
//       入力した本人も、仮予約から、登録したというふうに聞いてます」
//   実データで裏も取れている（毎朝の控え26本を古い順に全部見た）：
//     ・顧客リストの行は 11/02 から今日までずっと「仮予約・入庫日なし」
//     ・スケジュールは 2026-12-20 に本予約（11/11 8:16:13・代車つき）
//     ・同じ秒に custbk と代車の貸出も作られている＝顧客リストの画面から「本予約」を押した形
//     ・同じ食い違いが本番に【21件】（2026-9-28〜11-15）
//   元凶：handleBookingSave の「書く前にサーバーの今の値を読む」が失敗した時、
//     手元の【すでに書き換えた】配列を「サーバーの値」として使っていた。
//     → 差分がゼロになり saveFileChunked が1本も書かずに true を返す
//     ＝「保存できた」と言いながら1文字も書かない（画面と手元の控えだけが本予約になる）。
//   ここで見ること：
//     ① ふつうの時は、スケジュールと顧客リストの両方がサーバーに入る
//     ② サーバーの今の値が読めない時、黙って「保存できた」にしない（案内を出す）
//     ③ その時の控え（未反映の予約）から再送すると、リストの行も直る
//     ④ 中身の見張り（手元の配列をサーバーの値の代わりに使っていない）
//     ⑤ 通知を当てる時、同じチャンクの【他の行】を手元の古い写しで上書きしない（2026-11-20）
//   実行: node cf_write_test.js
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8489, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);

const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 16];
// ★入庫日のカレンダーは【その方の満了月】で開く（baseMonth=customer.expiry）。
//   種データの満了日が 2027-01 なので、ここも 2027-01 の開いている日を使う。
//   本店は曜日の定休なし／2027年1月の第2火曜は 1/12 なので 1/20 は開いている。
const DK = '2027-01-20';
const DKN = '2027-01-20';

// 架空のお客様3人（リポジトリに本物の氏名を書かない）
const mk = (i, o) => Object.assign({
  custId: '202701__' + i + '__客' + i + '__' + (1000 + i), rowIdx: i, expiry: '2027-01-0' + ((i % 9) + 1),
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-10-18', dm1Book: '', dm2Date: '2026-10-25', dm2Book: '',
  dm1Sent: true, dm2Sent: true,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
// 客2 は「仮予約・入庫日なし」＝報告のあった形そのまま
const CUSTS = [mk(1), mk(2, { status: 'temp', course: 2, tokuten: '②', staff: '江川京志' }), mk(3)];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'insp-arch']: {}, [STOR + 'inspLimits']: {}, [STOR + 'insp-limits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [3], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'custbk']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// サーバー（にせ firebase）の顧客ファイルからその人の行を読む
const srvRow = (page, name) => page.evaluate(([stor, nm]) => {
  const c = window.__fakeFb.get(stor + 'cf-202701-chunk-0');
  const r = (c || []).find(x => x && x.name === nm);
  return r ? { status: r.status, entryDate: r.entryDate, bookingTime: r.bookingTime, course: r.course } : null;
}, [STOR, name]);
// サーバーのスケジュールにその人が居るか
const srvInsp = (page, name) => page.evaluate(([stor, nm]) => {
  const o = window.__fakeFb.get(stor + 'insp') || {};
  const out = [];
  Object.keys(o).forEach(dk => (o[dk] || []).forEach(r => { if (r && r.name === nm) out.push({ dk, st: r.bookingStatus }); }));
  return out;
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
  if(process.env.LOG)page.on('console',m=>{const x=m.text();if(/SYNC|RECONCILE|CF/.test(x))console.log('    [画面] '+x.slice(0,200));});
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(900);

  // その人の行の帯ボタンを押して予約カードを開く
  const openCard = async (nm) => page.evaluate((n) => {
    const tr = [...document.querySelectorAll('tbody tr')].find(x => ((x.children[1] || {}).innerText || '').indexOf(n) >= 0);
    if (!tr) return false;
    const b = tr.querySelector('[data-bandstatus]');
    if (!b) return false; b.click(); return true;
  }, nm);
  // カードを埋めて「✓ 本予約」を押す
  const fillAndConfirm = async (dk, time, course, tok) => {
    // カレンダーが畳まれていたら開く
    if (!(await page.$('[data-custmon]'))) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /カレンダーを開く/.test(x.innerText || '')); if (b) b.click(); });
      await page.waitForTimeout(300);
    }
    // 目当ての月まで送る（念のため最大24回）
    for (let i = 0; i < 24; i++) {
      if (await page.$('[data-custday="' + dk + '"]')) break;
      const cur = await page.evaluate(() => { const e = document.querySelector('[data-custmon]'); return e ? e.getAttribute('data-custmon') : null; });
      if (!cur) break;
      const want = dk.slice(0, 7);
      await page.evaluate((fwd) => {
        const box = document.querySelector('[data-custmon]').closest('div').parentElement;
        const bs = [...box.querySelectorAll('button')];
        (fwd ? bs[bs.length - 1] : bs[0]).click();
      }, want > cur);
      await page.waitForTimeout(200);
    }
    await page.waitForSelector('[data-custday="' + dk + '"]', { timeout: 8000 });
    await page.click('[data-custday="' + dk + '"]');
    await page.waitForTimeout(250);
    await page.click('[data-bmfield="time"]');
    await page.waitForTimeout(200);
    await page.click('[data-timeopt="' + time + '"]');
    await page.waitForTimeout(200);
    if (course) await page.evaluate((c) => { const g = document.querySelector('[data-bmfield="course"]'); const b = [...g.querySelectorAll('button')].find(x => x.innerText.indexOf(c) >= 0); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, course);
    if (tok) await page.evaluate((c) => { const g = document.querySelector('[data-bmfield="tokuten"]'); const b = [...g.querySelectorAll('button')].find(x => x.innerText.trim() === c); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, tok);
    await page.waitForTimeout(200);
    // ★カードの中の「✓ 本予約」を押す。行の帯のボタンにも「本予約」と出るので、
    //   「本予約」だけで探すとそちらを押してしまう。
    const r = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(保存中|✓ 本予約)/.test((x.innerText || '').trim()) && x.offsetParent !== null);
      if (b) { b.click(); return true; } return false;
    });
    await page.waitForTimeout(400);
    const err = await page.evaluate(() => { const e = [...document.querySelectorAll('div')].find(x => /本予約には/.test(x.innerText || '') && x.children.length === 0); return e ? e.innerText : null; });
    if (err) console.log('    （カードの赤字）' + err);
    return r;
  };

  head('① ふつうの時は、スケジュールと顧客リストの両方がサーバーに入る');
  t('客1 のカードが開く', await openCard('客1'));
  t('入力して「✓ 本予約」を押せた', await fillAndConfirm(DK, '10:00', 'クイック', '②'));
  await page.waitForTimeout(4000);
  let ins1 = await srvInsp(page, '客1');
  t('★スケジュール（サーバー）に本予約で入る', ins1.length === 1 && ins1[0].st === 'confirmed', ins1);
  let r1 = await srvRow(page, '客1');
  t('★顧客リスト（サーバー）も本予約になる', r1 && r1.status === 'confirm', r1);
  t('★顧客リスト（サーバー）に入庫日が入る', r1 && r1.entryDate === DKN, r1);
  t('案内（アラート）は出ない', dialogs.length === 0, dialogs);

  head('② サーバーの今の値が読めない時、黙って「保存できた」にしない');
  dialogs.length = 0;
  t('客2（仮予約）のカードが開く', await openCard('客2'));
  // ★ここから顧客ファイルの索引が読めなくなる（回線が一瞬切れた時の姿）
  await page.evaluate(() => { window.__fakeFbFailGet = [{ re: 'cf-202701-index' }]; });
  t('入力して「✓ 本予約」を押せた', await fillAndConfirm(DK, '11:00', null, null));
  // 3回やり直して案内を出すまで待つ
  await page.waitForTimeout(16000);
  let ins2 = await srvInsp(page, '客2');
  t('スケジュール（サーバー）には入っている', ins2.length === 1 && ins2[0].st === 'confirmed', ins2);
  let r2 = await srvRow(page, '客2');
  t('顧客リスト（サーバー）は書けていない＝仮予約のまま', r2 && r2.status === 'temp', r2);
  t('★★「リスト保存がサーバーに反映できませんでした」の案内が出る',
    dialogs.some(m => /リスト保存|反映できません/.test(m)), dialogs);
  const banner = await page.evaluate(() => ({
    all: /反映されていない予約/.test(document.body.innerText),
    only: !!document.querySelector('[data-pendfile]'),
  }));
  t('★★「サーバーに反映されていない予約」のバナーが出る', banner.all, banner);
  t('★★バナーに「顧客リストの行だけ未反映」と出る', banner.only, banner);

  head('③ 読めるように戻して再送すると、リストの行も直る');
  await page.evaluate(() => { window.__fakeFbFailGet = []; });
  const resent = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /再送/.test(x.innerText || '') && x.offsetParent !== null);
    if (b) { b.click(); return true; } return false;
  });
  t('「再送」のボタンがある', resent);
  await page.waitForTimeout(6000);
  r2 = await srvRow(page, '客2');
  t('★再送すると顧客リスト（サーバー）も本予約になる', r2 && r2.status === 'confirm', r2);
  t('★入庫日も入る', r2 && r2.entryDate === DKN, r2);

  head('⑤ 通知を当てる時、同じチャンクの【他の行】を手元の古い写しで上書きしない');
  // ★2026-11-20 に本番で5件見つかった「キャンセル⇄本予約が永久に往復する」の再現。
  //   顧客ファイルのチャンクは購読していない（fbLive は cust-updates と cf-index だけ）ので、
  //   開きっぱなしのタブが持つ行は何日でも古いまま。そこへ【別の人の】通知が1件届くと、
  //   チャンク（約100行）が手元の写しから丸ごと書き直され、他の人の行が巻き戻っていた。
  // 画面には見せずに、サーバーの 客3 だけを「キャンセル」に変える
  await page.evaluate((stor) => {
    const c = window.__fakeFb.get(stor + 'cf-202701-chunk-0') || [];
    window.__fakeFb.set(stor + 'cf-202701-chunk-0',
      c.map(x => (x && x.name === '客3') ? Object.assign({}, x, { status: 'cancel', entryDate: '', linkedInspDate: '' }) : x));
  }, STOR);
  let r3 = await srvRow(page, '客3');
  t('下ごしらえ：サーバーの 客3 はキャンセルになった', r3 && r3.status === 'cancel', r3);
  t('下ごしらえ：画面（手元）の 客3 はまだ古い（未予約のまま）',
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(x => ((x.children[1] || {}).innerText || '').indexOf('客3') >= 0);
      return !!tr && !/キャンセル/.test(tr.innerText || '');
    }));
  // スケジュール側から【客1】のキャンセル通知を1件積む（＝予約を消した時に出るもの）
  await page.evaluate((stor) => {
    window.__fakeFb.set(stor + 'cust-updates', [{
      custId: '202701__1__客1__1001', name: '客1', no: 1001,
      status: 'cancel', entryDate: '', linkedInspDate: '', ts: Date.now() + 1000,
    }]);
  }, STOR);
  await page.waitForTimeout(32000);
  r1 = await srvRow(page, '客1');
  t('★通知のとおり 客1 はキャンセルになる', r1 && r1.status === 'cancel', r1);
  t('★客1 の入庫日も空になる', r1 && !r1.entryDate, r1);
  r3 = await srvRow(page, '客3');
  t('★★客3 のキャンセルが巻き戻らない（他の行を古い写しで上書きしない）',
    r3 && r3.status === 'cancel', r3);
  let r2b = await srvRow(page, '客2');
  t('★客2 の本予約も巻き添えにならない', r2b && r2b.status === 'confirm', r2b);

  head('④ 中身の見張り');
  const SRC = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  t('★手元の配列をサーバーの値の代わりに使っていない（:changedFile.customers が無い）',
    SRC.indexOf(':changedFile.customers') < 0);
  t('★読めなかった時は書かない歯止めがある',
    /サーバーの今の値を読めない/.test(SRC));
  t('読む時は【サーバー】から読み直している（fresh）',
    SRC.indexOf("loadFileChunked(changedFile.name,true)") >= 0);
  t('★通知を当てる時も【サーバーの今の値＋通知の項目だけ】を書いている',
    SRC.indexOf('const _mf={...f,customers:_merged};') >= 0);
  t('★★通知を当てる時に手元の配列を丸ごと渡していない（saveFileChunked(f, が無い）',
    SRC.indexOf('await saveFileChunked(f,') < 0);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
