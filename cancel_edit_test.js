// キャンセル（赤帯）の行の「✎ 編集」でコメントを書く検査（2026-11-02 ユーザー指示）
//   「顧客リストの赤い帯（キャンセル分）に、なぜキャンセルしたかのコメントを入れたい。
//     いまの『復活』ボタンを『編集』という名目に変えて、押すと同じ予約カードが開く。
//     赤帯と同じ色の背景にして、備考欄に記入できるように」
//   決めごと（モックで確認・2026-11-02）：
//     ・コメント記入欄は【A案＝欄だけ白地＋黒い字】（薄い赤の上に白い字は読めないため）
//     ・「↩ 復活」（未予約に戻す）は廃止。また予約が入ったら「再予約」で取り直す
//   ここで見ること：
//     ① 赤帯の行のボタンが「✎ 編集」／「↩ 復活」はもう無い／「再予約」は残っている
//     ② 押すと予約カードが【赤い背景】で開き、キャンセルだと分かる帯が出る
//     ③ 備考欄は白地＋黒い字。予約の中身（入庫日・時間・コース・代車）は触れない
//     ④ 下のボタンは「コメントを保存」だけ（仮予約・本予約は出さない）
//     ⑤ 保存するとコメントだけが書かれ、状態は 'cancel' のまま（予約には戻らない）
//     ⑥ 「再予約」は今までどおり ふつうの（青い）カード
//   実行: node cancel_edit_test.js
//        SHOT=<保存先.png> node cancel_edit_test.js  … その時の見た目を撮る
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8425, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const RED = 'rgb(254, 202, 202)';        // #fecaca＝一覧の赤い行と同じ色
const WHITE = 'rgb(255, 255, 255)';
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const FIX = [2026, 11, 2];

const mk = (i, o) => Object.assign({
  custId: 'F__' + i + '__客' + i, rowIdx: i, expiry: '2027-01-1' + (i % 9),
  name: '客' + i, no: 1000 + i, carType: '車' + i,
  phoneHome: '', phoneMobile: '', address: '',
  dm1Date: '2026-11-12', dm1Book: '', dm2Date: '', dm2Book: '',
  dm1Sent: true, dm2Sent: true,
  entryDate: '', tokuten: '-', course: null, store: 'honten', staff: '', note: '', status: 'none',
  bookingTime: '', linkedInspDate: '',
}, o || {});
const CUSTS = [
  mk(1),                                        // ふつうの行（未予約）
  mk(2, { status: 'cancel' }),                  // ★赤帯＝キャンセル
  mk(3, { status: 'cancel', note: '前の書き込み' }),
];

const seed = {
  [STOR + 'insp']: {}, [STOR + 'inspLimits']: {},
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cf-index']: [{ name: '202701', count: CUSTS.length }],
  [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: CUSTS.length },
  [STOR + 'cf-202701-chunk-0']: CUSTS,
  [STOR + 'cust-updates']: [],
};

// その氏名の行の、いちばん左のボタンの字
const rowBtns = (page, name) => page.evaluate((nm) => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf(nm) >= 0);
  if (!tr) return null;
  return { btns: [...tr.querySelectorAll('button')].map(b => (b.innerText || '').trim()),
    bg: getComputedStyle(tr).backgroundColor, cls: tr.className,
    hasEdit: !!tr.querySelector('[data-cxedit]') };
}, name);
const clickRowBtn = (page, name, label) => page.evaluate(([nm, lb]) => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => ((r.children[1] || {}).innerText || '').indexOf(nm) >= 0);
  if (!tr) return false;
  const b = [...tr.querySelectorAll('button')].find(e => (e.innerText || '').indexOf(lb) >= 0);
  if (b) { b.click(); return true; } return false;
}, [name, label]);

// 開いているカードの様子
const cardInfo = (page) => page.evaluate(() => {
  const sc = document.getElementById('booking-modal-scroll');
  if (!sc) return null;
  const note = document.querySelector('textarea[data-cxnote]') || sc.querySelector('textarea');
  const ns = note ? getComputedStyle(note) : null;
  const grid = sc.querySelector('div[style*="grid"]');
  const foot = sc.parentElement ? sc.parentElement.lastElementChild : null;
  return {
    bg: getComputedStyle(sc).backgroundColor,
    ribbon: !!sc.querySelector('[data-cxribbon]'),
    noteMark: !!document.querySelector('textarea[data-cxnote]'),
    noteBg: ns ? ns.backgroundColor : '', noteColor: ns ? ns.color : '',
    noteVal: note ? note.value : null,
    gridOff: grid ? getComputedStyle(grid).pointerEvents : '',
    foot: foot ? [...foot.querySelectorAll('button')].map(b => (b.innerText || '').trim()) : [],
    headBg: sc.parentElement ? getComputedStyle(sc.parentElement.firstElementChild).backgroundImage : '',
  };
});

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
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const see = async (s, ms = 25000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
  t('顧客リストが開く', await see('客1'));
  await page.waitForTimeout(700);

  head('① 赤帯の行のボタンは「✎ 編集」（「↩ 復活」は廃止）');
  const r2 = await rowBtns(page, '客2');
  t('★キャンセルの行に「✎ 編集」が出る', !!r2 && r2.btns.some(x => x.indexOf('編集') >= 0), r2);
  t('★「復活」はもう画面に無い', !(await page.evaluate(() => document.body.innerText)).includes('復活'));
  t('★「再予約」は残っている', !!r2 && r2.btns.some(x => x.indexOf('再予約') >= 0), r2);
  t('その行は赤帯（#fecaca）', !!r2 && r2.bg === RED, r2 && r2.bg);
  t('印（data-cxedit）が付いている', !!r2 && r2.hasEdit, r2);
  const r1 = await rowBtns(page, '客1');
  t('ふつうの行は今までどおり「＋予約」', !!r1 && r1.btns.some(x => x.indexOf('＋予約') >= 0), r1);
  t('ふつうの行に「編集」は出さない', !!r1 && !r1.hasEdit, r1);

  head('② 「✎ 編集」で開くカードは赤い背景');
  t('ボタンを押せた', await clickRowBtn(page, '客2', '編集'));
  await page.waitForTimeout(900);
  const c = await cardInfo(page);
  t('カードが開いた', !!c, c);
  t('★背景が赤帯と同じ #fecaca', !!c && c.bg === RED, c && c.bg);
  t('★キャンセルだと分かる帯が出る', !!c && c.ribbon, c);
  t('見出しも赤になっている', !!c && c.headBg.indexOf('127, 29, 29') >= 0, c && c.headBg);

  head('③ 備考は白地＋黒い字（A案）／予約の中身は触れない');
  t('★備考欄の背景は白', !!c && c.noteBg === WHITE, c && c.noteBg);
  t('★備考の字は白ではない（読める）', !!c && c.noteColor !== WHITE, c && c.noteColor);
  t('備考欄に印（data-cxnote）が付いている', !!c && c.noteMark, c);
  t('★入庫日・時間などの区画は押せない', !!c && c.gridOff === 'none', c && c.gridOff);

  head('④ 下のボタンは「コメントを保存」だけ');
  t('★「コメントを保存」が出る', !!c && c.foot.some(x => x.indexOf('コメントを保存') >= 0), c && c.foot);
  t('★「本予約」は出さない', !!c && !c.foot.some(x => x.indexOf('本予約') >= 0), c && c.foot);
  t('★「仮予約」は出さない', !!c && !c.foot.some(x => x.indexOf('仮予約') >= 0), c && c.foot);
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }

  head('⑤ 保存するとコメントだけ書かれ、キャンセルのまま');
  await page.fill('textarea[data-cxnote]', '他店で車検を済ませたため');
  await page.evaluate(() => { const b = document.querySelector('[data-cxsave]'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(k => {
    const v = window.__fakeFb.get(k) || [];
    const r = v.find(x => x && x.name === '客2');
    return r ? { note: r.note, status: r.status, entryDate: r.entryDate } : null;
  }, STOR + 'cf-202701-chunk-0');
  t('★コメントが保存された', !!saved && saved.note === '他店で車検を済ませたため', saved);
  t('★状態は cancel のまま（予約に戻らない）', !!saved && saved.status === 'cancel', saved);
  t('入庫日は空のまま', !!saved && !saved.entryDate, saved);
  t('カードが閉じた', await page.evaluate(() => !document.getElementById('booking-modal-scroll')));
  t('一覧の備考にコメントが出る', await see('他店で車検を済ませたため', 8000));
  t('その行はまだ赤帯', (await rowBtns(page, '客2')).bg === RED);

  head('⑥ 「再予約」は今までどおり ふつうのカード');
  t('「再予約」を押せた', await clickRowBtn(page, '客2', '再予約'));
  await page.waitForTimeout(900);
  const c2 = await cardInfo(page);
  t('★背景は赤くない', !!c2 && c2.bg !== RED, c2 && c2.bg);
  t('★キャンセルの帯は出ない', !!c2 && !c2.ribbon, c2);
  t('★「本予約」が出る', !!c2 && c2.foot.some(x => x.indexOf('本予約') >= 0), c2 && c2.foot);
  t('★入庫日などを触れる', !!c2 && c2.gridOff !== 'none', c2 && c2.gridOff);

  head('⑦ もう一度「✎ 編集」を開くと、書いたコメントが入っている');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === 'キャンセル'); if (b) b.click(); });
  await page.waitForTimeout(700);
  await clickRowBtn(page, '客2', '編集');
  await page.waitForTimeout(900);
  const c3 = await cardInfo(page);
  t('★前に書いたコメントが出ている', !!c3 && c3.noteVal === '他店で車検を済ませたため', c3 && c3.noteVal);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
