// 2026-11-16 ★車検の日にちを変えて保存したあと、画面を【元の日】に留める（イ案）の検査
//   【なぜ】それまでは保存すると画面が移り先の日へ飛んでいた。「日にち変更」の帯は
//   元の日に残るので、飛んだ先には出ない＝「移したのに帯が出ない」と誤解されていた
//   （2026-11-16 ユーザー報告）。帯は正しく作られていたので、見せ方だけの話。
//   【イ案】保存しても元の日に留まり、できたばかりの帯がその場で見える。
//   緑のお知らせに「◯/◯ へ移しました」と出し、1クリックで移り先へ行ける。
//   実行: node cx_stay_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8509, STOR = 'hub-v8-dev-';
const MV_BG = 'rgb(220, 38, 38)';
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
// ★元の日は【本日】。スケジュールは必ず本日で開くので、日の移動も休業日の心配も要らない。
const N = new Date();
const T0 = { y: N.getFullYear(), m: N.getMonth() + 1, d: N.getDate() };
const DK0 = T0.y + '-' + T0.m + '-' + T0.d;
const MD = o => o.m + '/' + o.d;
// 移り先の候補（同じ月の中。休業日や月末に当たっても次の候補でやり直す）
const lastDay = new Date(T0.y, T0.m, 0).getDate();
const CAND = [T0.d + 2, T0.d + 3, T0.d + 4, T0.d + 5, T0.d - 2, T0.d - 3, T0.d - 4]
  .filter(x => x >= 1 && x <= lastDay && x !== T0.d);

const ROWS = [
  { name: '客1', carType: 'タント', no: '1111', course: 2, time: '09:00', store: 'honten', seq: 1, bookingStatus: 'confirmed', custId: 'C1' },
  { name: '客2', carType: 'ワゴンR', no: '2222', course: 2, time: '10:00', store: 'honten', seq: 2, bookingStatus: 'confirmed', custId: 'C2' },
  { name: '客3', carType: 'スイフト', no: '3333', course: 2, time: '11:00', store: 'honten', seq: 3, bookingStatus: 'confirmed', custId: 'C3' },
];

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK0]: ROWS }, [STOR + 'insp-arch']: {},
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
  const openByName = nm => page.evaluate(x => {
    const td = [...document.querySelectorAll('td')].find(e => e.offsetParent !== null && e.innerText.indexOf(x) >= 0 && getComputedStyle(e).cursor === 'pointer');
    if (td) { td.click(); return true; } return false;
  }, nm);
  const openCal = async () => { await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find(e => e.innerText && e.innerText.trim() === 'クリックで日付変更' && e.offsetParent !== null); if (s) s.click(); }); await page.waitForTimeout(600); };
  const pickDay = w => page.evaluate(x => {
    const box = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
    if (!box) return false;
    const grid = [...box.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
    if (!grid) return false;
    const cell = [...grid.children].find(c => c.innerText.trim() === String(x));
    if (!cell) return false; cell.click(); return true;
  }, w);
  const save = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /内容を保存|確定して登録/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); }); await page.waitForTimeout(4200); };
  const bands = () => page.evaluate(() => [...document.querySelectorAll('tr[data-cxband]')].map(r => ({
    kind: r.getAttribute('data-cxband'), txt: r.innerText.replace(/\s+/g, ' ').trim(),
    bg: getComputedStyle(r.querySelector('td')).backgroundColor })));
  const notice = () => page.evaluate(() => { const e = document.querySelector('[data-dcback]'); return e ? { txt: e.innerText.replace(/\s+/g, ' ').trim(), bd: getComputedStyle(e).borderColor } : null; });

  head('① 本日の車検3件が1日表示に出る');
  const day0 = await viewDay();
  t('画面は本日', day0.indexOf(T0.m + '月' + T0.d + '日') >= 0, day0);
  const before = await page.evaluate(() => document.body.innerText);
  t('3件そろっている', ['客1', '客2', '客3'].every(n => before.indexOf(n) >= 0));

  head('② 客2 の日にちを同じ月の別の日へ動かして保存する');
  t('予約カードが開く', await openByName('客2') && await seeText(page, '車検予約カード', 8000));
  let TD = null;
  for (const c of CAND) {
    await openCal();
    if (!await pickDay(c)) continue;
    await page.waitForTimeout(700);
    const lab = await page.evaluate(() => { const b = document.querySelector('[data-datepick]'); return b ? b.innerText.replace(/\s/g, '') : ''; });
    if (lab.indexOf(T0.m + '月' + c + '日') >= 0) { TD = c; break; }
  }
  t('移り先の日を選べた（候補から）', TD !== null, { CAND });
  if (TD === null) { console.log(NL + '移り先が選べなかったので中止します'); await browser.close(); server.close(); process.exit(1); }
  const DKT = T0.y + '-' + T0.m + '-' + TD, MDT = T0.m + '/' + TD;
  console.log('   （元の日 ' + MD(T0) + ' → 移り先 ' + MDT + '）');
  await save();

  head('③ ★保存のあと、画面は【元の日】のまま（移り先へ飛ばない）');
  const dayAfter = await viewDay();
  t('見ている日が本日のまま', dayAfter.indexOf(T0.m + '月' + T0.d + '日') >= 0, dayAfter);
  t('移り先の日になっていない', dayAfter.indexOf(T0.m + '月' + TD + '日') < 0, dayAfter);

  head('④ ★その画面に【日にち変更の帯】がその場で見える');
  const bs = await bands();
  t('帯が1本出ている', bs.length === 1, bs);
  t('種類が「日にち変更」', bs[0] && bs[0].kind === 'move', bs);
  t('濃い赤（#dc2626）', bs[0] && bs[0].bg === MV_BG, bs[0] && bs[0].bg);
  t('「日にち変更」と出ている', !!(bs[0] && bs[0].txt.indexOf('日にち変更') >= 0), bs);
  t('元の日 → 移り先 が出ている', !!(bs[0] && bs[0].txt.indexOf(MD(T0) + ' → ' + MDT) >= 0), bs);
  t('動かした人の名前が出ている', !!(bs[0] && bs[0].txt.indexOf('客2') >= 0), bs);
  t('元の日に生きている行は残っていない', await page.evaluate(() => {
    const live = [...document.querySelectorAll('tr')].filter(r => !r.getAttribute('data-cxband'));
    return !live.some(r => r.innerText.indexOf('客2') >= 0);
  }));

  head('⑤ ★緑のお知らせが出て、移り先の日が書いてある');
  const nt = await notice();
  t('お知らせが出ている', !!nt, nt);
  t('移り先の日が書いてある', !!(nt && nt.txt.indexOf(MDT) >= 0), nt);
  t('「記録」のことが書いてある', !!(nt && /記録|帯/.test(nt.txt)), nt);
  t('緑の枠（#047857）', !!(nt && nt.bd.indexOf('4, 120, 87') >= 0), nt && nt.bd);
  t('移り先へ行くボタンがある', await page.evaluate(() => !!document.querySelector('[data-dcbackgo]')));
  t('閉じる ✕ がある', await page.evaluate(() => !!document.querySelector('[data-dcbackx]')));

  head('⑥ ★ボタン1つで移り先へ行ける（そこに予約が入っている）');
  await page.evaluate(() => { const b = document.querySelector('[data-dcbackgo]'); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const dayT = await viewDay();
  t('移り先の日へ移れた', dayT.indexOf(T0.m + '月' + TD + '日') >= 0, dayT);
  t('移り先に 客2 が入っている', await page.evaluate(() => {
    const live = [...document.querySelectorAll('tr')].filter(r => !r.getAttribute('data-cxband'));
    return live.some(r => r.innerText.indexOf('客2') >= 0);
  }));
  t('移り先には帯が出ていない', (await bands()).length === 0);
  t('移り先ではお知らせも消えている', (await notice()) === null);

  head('⑦ ★ただの保存（日にちを変えない）では、お知らせを出さず画面も動かさない');
  // 元の日（本日）へ戻る。★帯はその日に残っているので、まだ見えていること
  await clickText(page, '本日に戻る');
  await page.waitForTimeout(1800);
  t('本日へ戻れた', (await viewDay()).indexOf(T0.m + '月' + T0.d + '日') >= 0, await viewDay());
  t('帯はその日に残ったまま見える', (await bands()).length === 1);
  t('客1 の予約カードが開く', await openByName('客1') && await seeText(page, '車検予約カード', 8000));
  await save();
  t('見ている日は変わらない（本日のまま）', (await viewDay()).indexOf(T0.m + '月' + T0.d + '日') >= 0, await viewDay());
  t('お知らせは出ない', (await notice()) === null);

  head('⑧ ファイルの中身の見張り');
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('お知らせの印 data-dcback がある', src.indexOf('data-dcback') >= 0);
  t('移り先へ行く印 data-dcbackgo がある', src.indexOf('data-dcbackgo') >= 0);
  t('保存のあと元の日へ戻す処理がある', /_dcIsDateChange\s*&&\s*_dcOrigDk/.test(src));
  t('お知らせの覚え書き setDcBack がある', src.indexOf('setDcBack') >= 0);

  head('⑨ 画面のエラー');
  t('実行時エラーなし', errs.length === 0, errs.slice(0, 3));

  console.log(NL + (fail === 0 ? '✅ PASS 成功 ' + pass + ' / 失敗 0' : '❌ 成功 ' + pass + ' / 失敗 ' + fail));
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
