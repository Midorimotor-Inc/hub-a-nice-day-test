// 2026-11-16 ★帯から「再予約」／帯の日付タップで移り先へジャンプ／同じ日に再予約した帯の印 の検査
//   【ご依頼（2026-11-16 ユーザー）】
//     ①ア案 取り消し・キャンセルの帯に「↻ 再予約」を置き、押すとその中身が入った予約カードが開く
//     ②イ案 日にち変更の帯の「11/20 → 11/27」の【日付の所だけ】を押すと、移り先の日へジャンプ
//     ③イ案 キャンセルのあと同じ日に再予約されたら、帯に「✓ 再予約済み」の印を付けて薄く残す
//   実行: node cx_rebook_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8515, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

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
  try { sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: me.uid, name: me.name, store: { id: me.store }, role: me.role, email: me.email })); } catch (e) {}
};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

// ★見る日は【本日】（スケジュールは必ず本日で開く＝日の移動も休業日の心配も要らない）
const N = new Date();
const T0 = { y: N.getFullYear(), m: N.getMonth() + 1, d: N.getDate() };
const DK0 = T0.y + '-' + T0.m + '-' + T0.d;
const lastDay = new Date(T0.y, T0.m, 0).getDate();
// 日にち変更の「移り先」は同じ月の中（休業日でもよい＝ジャンプできるかだけを見る）
const TD = [T0.d + 3, T0.d + 2, T0.d + 4, T0.d - 3, T0.d - 2].filter(x => x >= 1 && x <= lastDay && x !== T0.d)[0];
const DKT = T0.y + '-' + T0.m + '-' + TD;
const MD0 = T0.m + '/' + T0.d, MDT = T0.m + '/' + TD;

const ROWS = [
  // 生きている行
  { name: '客1', carType: 'タント', no: '1111', course: 2, time: '09:00', store: 'honten', seq: 101, bookingStatus: 'confirmed', custId: 'C1' },
  { name: '客2', carType: 'ワゴンR', no: '2222', course: 2, time: '10:00', store: 'honten', seq: 102, bookingStatus: 'confirmed', custId: 'C2' },
  // ③ 同じ日に再予約された人の帯（客1）＝「✓ 再予約済み」の印が付いて薄くなる
  { name: '客1', carType: 'タント', no: '1111', course: 2, time: '14:00', store: 'honten', seq: 1, bookingStatus: 'cancelled', custId: 'C1', cxAt: DK0, cxBy: '江川京志' },
  // ① 再予約の対象になる帯（客3）＝生きている行は無い
  { name: '客3', carType: 'スイフト', no: '3333', course: 3, time: '11:00', store: 'honten', seq: 2, bookingStatus: 'cancelled', custId: 'C3', cxAt: DK0, cxBy: '江川京志', note: 'オイル交換も希望', phone: '090-0000-0000' },
  // ② 日にち変更の帯（客4）＝日付を押すと移り先へジャンプ
  { name: '客4', carType: 'ジムニー', no: '4444', course: 1, time: '10:00', store: 'honten', seq: 3, bookingStatus: 'cancelled', custId: 'C4', cxAt: DK0, cxBy: '江川京志', cxFrom: DK0, cxTo: DKT },
];

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK0]: ROWS, [DKT]: [] }, [STOR + 'insp-arch']: {},
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;').replace(/const AUTH_REQUIRED=(true|false);/, 'const AUTH_REQUIRED=false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);

  // 道具
  const viewDay = () => page.evaluate(() => { const e = document.querySelector('[data-datepick]'); return e ? e.innerText.replace(/\s/g, '') : ''; });
  const bandOf = nm => page.evaluate(x => {
    const r = [...document.querySelectorAll('tr[data-cxband]')].find(e => e.innerText.indexOf(x) >= 0);
    if (!r) return null;
    const td = r.querySelector('td');
    return {
      kind: r.getAttribute('data-cxband'),
      txt: r.innerText.replace(/\s+/g, ' ').trim(),
      bg: getComputedStyle(td).backgroundColor,
      op: Number(getComputedStyle(td).opacity),
      re: !!r.querySelector('[data-cxre]'),
      redone: (r.querySelector('[data-cxredone]') || {}).innerText || '',
      jump: !!r.querySelector('[data-cxjump]'),
      jumpDeco: r.querySelector('[data-cxjump]') ? getComputedStyle(r.querySelector('[data-cxjump]')).textDecorationLine : '',
      drop: !!r.querySelector('[data-cxdrop]'),
    };
  }, nm);
  const clickIn = (nm, sel) => page.evaluate(([x, s]) => {
    const r = [...document.querySelectorAll('tr[data-cxband]')].find(e => e.innerText.indexOf(x) >= 0);
    if (!r) return false; const b = r.querySelector(s); if (!b) return false; b.click(); return true;
  }, [nm, sel]);
  const modalInputs = () => page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner') || document.querySelector('.slide-in');
    if (!box) return null;
    return [...box.querySelectorAll('input,textarea')].map(i => String(i.value || '')).filter(v => v !== '');
  });
  const save = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /内容を保存|確定して登録/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); }); await page.waitForTimeout(4200); };
  const liveNames = () => page.evaluate(() => [...document.querySelectorAll('tr')]
    .filter(r => !r.hasAttribute('data-cxband'))
    .map(r => r.innerText.replace(/\s+/g, ' ')).join(' | '));

  console.log('   （見る日 ' + MD0 + ' ／ 日にち変更の移り先 ' + MDT + '）');

  head('① 3本の帯が1日表示に出る');
  t('画面は本日', (await viewDay()).indexOf(T0.m + '月' + T0.d + '日') >= 0, await viewDay());
  const b3 = await bandOf('客3'), b1 = await bandOf('客1'), b4 = await bandOf('客4');
  t('客3 のキャンセル帯がある', !!b3 && b3.kind === 'cancel', b3);
  t('客1 のキャンセル帯がある', !!b1 && b1.kind === 'cancel', b1);
  t('客4 の日にち変更帯がある', !!b4 && b4.kind === 'move', b4);

  head('② ①ア案：キャンセルの帯に「↻ 再予約」が出る');
  t('客3 の帯に 再予約 ボタンがある', !!b3 && b3.re === true, b3);
  t('🗑 記録を消す も残っている', !!b3 && b3.drop === true, b3);
  t('★日にち変更の帯には 再予約 を出さない', !!b4 && b4.re === false, b4);
  t('★すでに再予約された帯（客1）には 再予約 を出さない', !!b1 && b1.re === false, b1);

  head('③ ①ア案：押すと その中身が入った予約カードが開く');
  t('ボタンを押せた', await clickIn('客3', '[data-cxre]'));
  await page.waitForTimeout(1200);
  t('車検予約カードが開く', await seeText(page, '車検予約カード', 8000));
  const vals = await modalInputs();
  t('お名前が入っている', !!vals && vals.indexOf('客3') >= 0, vals);
  t('車種が入っている', !!vals && vals.indexOf('スイフト') >= 0, vals);
  t('ナンバー4桁が入っている', !!vals && vals.indexOf('3333') >= 0, vals);
  t('備考も引き継いでいる', !!vals && vals.some(v => v.indexOf('オイル交換') >= 0), vals);
  t('★再予約だと分かる案内が出る', await page.evaluate(() => !!document.querySelector('[data-cxreribbon]')));
  t('★キャンセルの印は引き継がない（カードに「キャンセル」と出ない）',
    await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner') || document.querySelector('.slide-in'); return b ? b.innerText.indexOf('キャンセルです') < 0 : false; }));

  head('④ ①ア案：保存すると生きている行が増え、帯は残る');
  await save();
  const after = await liveNames();
  t('客3 の生きている行ができた', after.indexOf('客3') >= 0, after.slice(0, 200));
  const b3b = await bandOf('客3');
  t('★帯は消えていない（記録が残る）', !!b3b, b3b);
  t('★帯に「再予約済み」の印が付いた', !!b3b && b3b.redone.indexOf('再予約済み') >= 0, b3b);
  t('★印が付いた帯の 再予約 ボタンは消える', !!b3b && b3b.re === false, b3b);

  head('⑤ ③イ案：再予約済みの帯は薄く残る（客1）');
  const b1b = await bandOf('客1');
  t('「✓ 再予約済み」が出ている', !!b1b && b1b.redone.indexOf('再予約済み') >= 0, b1b);
  t('再予約した入庫時間が出ている（09:00）', !!b1b && b1b.redone.indexOf('09:00') >= 0, b1b);
  t('★薄くなっている（opacity 1 未満）', !!b1b && b1b.op < 1, b1b);
  t('★消えてはいない（キャンセルの記録が読める）', !!b1b && b1b.txt.indexOf('キャンセル') >= 0, b1b);
  t('★日にち変更の帯は薄くしない', !!b4 && b4.op === 1, b4);

  head('⑥ ②イ案：日にち変更の帯の【日付の所だけ】を押すと移り先へジャンプ');
  t('日付が押せる印になっている', !!b4 && b4.jump === true, b4);
  t('点線の下線が付いている', !!b4 && /underline/.test(b4.jumpDeco), b4);
  t('★キャンセルの帯には ジャンプ を付けない', !!b3b && b3b.jump === false, b3b);
  t('帯そのもの（文字の所）を押しても日は変わらない',
    await page.evaluate(x => { const r = [...document.querySelectorAll('tr[data-cxband]')].find(e => e.innerText.indexOf(x) >= 0); if (!r) return false; const s = r.querySelector('[data-cxtitle]'); if (!s) return false; s.click(); return true; }, '客4'));
  await page.waitForTimeout(900);
  t('まだ本日のまま', (await viewDay()).indexOf(T0.m + '月' + T0.d + '日') >= 0, await viewDay());
  t('日付を押せた', await clickIn('客4', '[data-cxjump]'));
  await page.waitForTimeout(1200);
  t('★移り先の日へ移った', (await viewDay()).indexOf(T0.m + '月' + TD + '日') >= 0, await viewDay());
  t('移り先には帯が無い', await page.evaluate(() => document.querySelectorAll('tr[data-cxband]').length) === 0);

  head('⑦ ファイルの中身');
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('data-cxre がある', src.indexOf('data-cxre=') >= 0);
  t('data-cxjump がある', src.indexOf('data-cxjump=') >= 0);
  t('data-cxredone がある', src.indexOf('data-cxredone=') >= 0);
  t('data-cxreribbon がある', src.indexOf('data-cxreribbon=') >= 0);
  t('再予約のまとめ役（handleReBookCx）がある', /handleReBookCx/.test(src));
  t('★再予約で引き継ぐ項目を白名簿で決めている', /CX_REBOOK_KEEP/.test(src));
  t('★帯を消す処理（handleDropCxBand）は残っている', /handleDropCxBand/.test(src));

  head('⑧ エラー');
  const real = errs.filter(e => !/ResizeObserver|Non-Error/.test(e));
  t('JSエラーなし', real.length === 0, real.slice(0, 2));

  console.log(NL + '──── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────');
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})();
