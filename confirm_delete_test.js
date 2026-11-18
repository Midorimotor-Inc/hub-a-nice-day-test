// 予約カードの「取り消し」に確認の問いが出るかの検査（2026-11-18 ユーザー指示）
//   ユーザーの言葉：「すべての予約カードの、取り消しボタンに、本当に取り消しますかの、問いをつけてください。
//                    ちょっと間違いでそのボタンを押しそうで怖いです。」
//   ★見張ること
//     ① PC の車検カードの「🗑 予約を取り消す」で問いが出る。文面に【誰の・いつの・何が】が入る
//     ② 「いいえ」なら予約はそのまま残る（1文字も書かない）
//     ③ 「はい」なら今までどおり取り消される（車検＝キャンセルの帯／整備＝表から消える）
//     ④ PC の整備カードの「🗑 削除」も同じ
//     ⑤ スマホの予約カードも同じ（文面にお名前と日付が入る）
//   実行: node confirm_delete_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8519, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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

const N = new Date();
const TODAY = N.getFullYear() + '-' + (N.getMonth() + 1) + '-' + N.getDate();
const MD = (N.getMonth() + 1) + '月' + N.getDate() + '日';

const INSP_ROWS = [
  { name: '車検　太郎', carType: 'タント', no: '1111', course: 2, time: '09:00', store: 'honten', seq: 1, id: 1, bookingStatus: 'confirmed', custId: 'C1' },
  { name: '残る　花子', carType: 'ワゴンR', no: '2222', course: 2, time: '11:00', store: 'honten', seq: 2, id: 2, bookingStatus: 'confirmed', custId: 'C2' },
];
const SCHED_DAY = { '10:00': { name: '整備　次郎', carType: 'アルト', no: '3333', work: 'Q', qkind: [], store: 'honten', id: 11, content: 'オイル交換' } };

const seed = () => ({
  [STOR + 'insp']: { [TODAY]: JSON.parse(JSON.stringify(INSP_ROWS)) },
  [STOR + 'honten-sched']: { [TODAY]: JSON.parse(JSON.stringify(SCHED_DAY)) }, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  [STOR + 'cust-updates']: [], [STOR + 'custbk']: {},
});

const mkServer = () => http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;').replace(/const AUTH_REQUIRED=(true|false);/, 'const AUTH_REQUIRED=false;')); return; }
  fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
});

(async () => {
  const server = mkServer();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const route = (ctx) => {
    const s = seed();
    ctx.route('https://www.gstatic.com/firebasejs/**', rt => {
      const u = rt.request().url();
      const extra = NL + '(function(){ const s=' + JSON.stringify(s) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      return rt.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
    });
    ctx.route('https://script.google.com/**', rt => rt.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  };

  // ───────────────── PC ─────────────────
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  route(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  let asked = [], mode = 'dismiss';
  page.on('dialog', async d => { asked.push(d.message()); if (mode === 'accept') { await d.accept().catch(() => {}); } else { await d.dismiss().catch(() => {}); } });

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.waitForTimeout(900);
  const toDay = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
    await page.waitForTimeout(1600);
  };
  await toDay();
  const liveInsp = async () => page.evaluate(k => {
    const d = window.__fakeFb.get(k + 'insp') || {};
    const out = {}; Object.keys(d).forEach(dk => { out[dk] = (d[dk] || []).filter(r => r && r.name).map(r => r.name + '/' + (r.bookingStatus || '')); });
    return out;
  }, STOR);
  const openRow = async (who) => {
    await page.evaluate(nm => {
      const r = [...document.querySelectorAll('tr')].find(x => !x.hasAttribute('data-cxband') && x.innerText.indexOf(nm) >= 0);
      if (r) { const tds = [...r.querySelectorAll('td')]; const td = tds.find(c => getComputedStyle(c).cursor === 'pointer' && c.innerText.indexOf(nm) >= 0) || tds.find(c => c.innerText.indexOf(nm) >= 0); if (td) td.click(); }
    }, who);
    await page.waitForTimeout(1300);
  };
  const closeCard = async () => { await clickText(page, '✕'); await page.waitForTimeout(600); await toDay(); };

  // ── ① 車検カード：問いが出る／文面 ─────────────────────────────
  head('① PC の車検カード「🗑 予約を取り消す」で問いが出る');
  t('スケジュールに車検が出る', await seeText(page, '車検　太郎', 8000));
  await openRow('車検　太郎');
  t('予約カードが開く', await seeText(page, '予約を取り消す', 8000));
  asked = []; mode = 'dismiss';
  await clickText(page, '予約を取り消す');
  await page.waitForTimeout(1200);
  const m1 = asked.join(NL);
  t('★問いが出る（確認なしで消えない）', asked.length === 1, asked);
  t('★文面にお名前が入る（様つき）', /車検[ 　]*太郎[ 　]*様/.test(m1), m1);
  t('★文面に日付が入る', m1.indexOf(MD) >= 0, m1);
  t('★文面に入庫時間が入る', m1.indexOf('09:00') >= 0, m1);
  t('★「車検予約を取り消します」と書いてある', m1.indexOf('車検予約を取り消します') >= 0, m1);
  t('★キャンセルの帯として残ることを書いてある', m1.indexOf('キャンセル') >= 0 && m1.indexOf('残り') >= 0, m1);
  t('★代車・レンタカーも外れることを書いてある', m1.indexOf('代車') >= 0, m1);
  t('★顧客リストも変わることを書いてある', m1.indexOf('顧客リスト') >= 0, m1);

  head('② 「いいえ」なら予約はそのまま残る');
  const afterNo = await liveInsp();
  t('★車検　太郎 は【本予約のまま】残っている', (afterNo[TODAY] || []).some(x => x.indexOf('車検　太郎/confirmed') === 0), afterNo);
  t('★キャンセルの帯も作られていない', !(afterNo[TODAY] || []).some(x => /cancelled/.test(x)), afterNo);
  t('カードは開いたまま（押し間違いから戻れる）', await seeText(page, '予約を取り消す', 4000));

  head('③ 「はい」なら今までどおり取り消される（車検＝キャンセルの帯）');
  asked = []; mode = 'accept';
  await clickText(page, '予約を取り消す');
  await page.waitForTimeout(3000);
  await toDay();
  const afterYes = await liveInsp();
  t('問いは出た', asked.length >= 1, asked);
  t('★車検　太郎 はキャンセルの帯になった', (afterYes[TODAY] || []).some(x => x.indexOf('車検　太郎/cancelled') === 0), afterYes);
  t('ほかの人の予約は残る', (afterYes[TODAY] || []).some(x => x.indexOf('残る　花子/confirmed') === 0), afterYes);

  // ── ④ 整備カード ────────────────────────────────────────────
  head('④ PC の整備カード「🗑 削除」も同じ');
  const liveSched = async () => page.evaluate(k => {
    const d = window.__fakeFb.get(k + 'honten-sched') || {};
    const out = {}; Object.keys(d).forEach(dk => { out[dk] = Object.keys(d[dk] || {}).map(s => s + ':' + ((d[dk][s] || {}).name || '')); });
    return out;
  }, STOR);
  t('タイムスケジュールに整備が出る', await seeText(page, '整備　次郎', 8000));
  await openRow('整備　次郎');
  const cardOpen = await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /🗑 削除/.test(e.innerText) && e.offsetParent !== null));
  t('整備の予約カードが開く', cardOpen);
  asked = []; mode = 'dismiss';
  await clickText(page, '🗑 削除');
  await page.waitForTimeout(1200);
  const m2 = asked.join(NL);
  t('★問いが出る', asked.length === 1, asked);
  t('★文面にお名前が入る（様つき）', /整備[ 　]*次郎[ 　]*様/.test(m2), m2);
  t('★文面に日付が入る', m2.indexOf(MD) >= 0, m2);
  t('★文面に時間が入る', m2.indexOf('10:00') >= 0, m2);
  t('★「予定を削除します」と書いてある', m2.indexOf('予定を削除します') >= 0, m2);
  t('★元に戻せないことを書いてある', m2.indexOf('元には戻せません') >= 0, m2);
  t('★代車・レンタカーも外れることを書いてある', m2.indexOf('代車') >= 0, m2);
  const schedNo = await liveSched();
  t('★「いいえ」なら整備の予定は残っている', (schedNo[TODAY] || []).some(x => x.indexOf('整備　次郎') > 0), schedNo);
  asked = []; mode = 'accept';
  await clickText(page, '🗑 削除');
  await page.waitForTimeout(3000);
  const schedYes = await liveSched();
  t('★「はい」なら今までどおり消える', !(schedYes[TODAY] || []).some(x => x.indexOf('整備　次郎') > 0), schedYes);
  t('画面のエラーは無い', errs.length === 0, errs.slice(0, 3));
  await ctx.close();

  // ───────────────── スマホ ─────────────────
  head('⑤ スマホの予約カードも同じ');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mctx.addInitScript(signedInInit, [ME, STOR]);
  route(mctx);
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  let masked = [], mmode = 'dismiss';
  mp.on('dialog', async d => { masked.push(d.message()); if (mmode === 'accept') { await d.accept().catch(() => {}); } else { await d.dismiss().catch(() => {}); } });
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 25000); await clickText(mp, '江川京志');
  await seeText(mp, 'カレンダー', 25000);
  await mp.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await mp.waitForTimeout(1800);
  t('スマホのスケジュールに車検が出る', await seeText(mp, '車検', 8000));
  await mp.getByText('車検　太郎', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await mp.waitForTimeout(1300);
  t('予約カードが開く', await mp.evaluate(() => [...document.querySelectorAll('button')].some(e => /削除/.test(e.innerText) && e.offsetParent !== null)));
  masked = []; mmode = 'dismiss';
  await clickText(mp, '削除');
  await mp.waitForTimeout(1200);
  const m3 = masked.join(NL);
  t('★問いが出る', masked.length === 1, masked);
  t('★文面にお名前が入る（様つき）', /車検[ 　]*太郎[ 　]*様/.test(m3), m3);
  t('★文面に日付が入る', m3.indexOf((N.getMonth() + 1) + '月' + N.getDate() + '日') >= 0, m3);
  t('★「車検予約を取り消します」と書いてある', m3.indexOf('車検予約を取り消します') >= 0, m3);
  const mLive = await mp.evaluate(k => {
    const d = window.__fakeFb.get(k + 'insp') || {};
    return [].concat(...Object.values(d).filter(Array.isArray)).filter(r => r && r.name).map(r => r.name + '/' + (r.bookingStatus || ''));
  }, STOR);
  t('★「いいえ」なら予約はそのまま残る', mLive.some(x => x.indexOf('車検　太郎/confirmed') === 0), mLive);
  masked = []; mmode = 'accept';
  await clickText(mp, '削除');
  await mp.waitForTimeout(6000);
  const mAfter = await mp.evaluate(k => {
    const d = window.__fakeFb.get(k + 'insp') || {};
    return [].concat(...Object.values(d).filter(Array.isArray)).filter(r => r && r.name).map(r => r.name + '/' + (r.bookingStatus || ''));
  }, STOR);
  t('★「はい」なら今までどおり取り消される（帯になる）', mAfter.some(x => x.indexOf('車検　太郎/cancelled') === 0), mAfter);
  t('スマホの画面のエラーは無い', merrs.length === 0, merrs.slice(0, 3));
  await mctx.close();

  // ── ⑥ ファイルの中身（見張り）────────────────────────────────
  head('⑥ ファイルの中身：取り消しは必ず confirm を通す');
  const pc = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const mb = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const fn = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; return src.slice(i, i + 1600); };
  // ★予約カードの handleDelete を取り出す（スタッフ管理にも同じ名前の関数があるので、
  //   予約カードの handleSaveAs より後ろを見ること）
  const bmAt = pc.indexOf('const handleSaveAs=(status)=>{');
  const pcDel = bmAt < 0 ? '' : fn(pc.slice(bmAt), 'const handleDelete=()=>{');
  const mbDel = fn(mb, 'const doDelete=()=>{');
  t('index_dev：予約カードの取り消しに window.confirm がある', /window\.confirm/.test(pcDel), pcDel.slice(0, 120));
  t('index_dev：確認せずに onDelete を呼ぶ形に戻っていない', !/const handleDelete=\(\)=>\{onDelete\(\);\};/.test(pc));
  t('index_dev：文面に cardLabel（その予約の日）を使っている', /cardLabel/.test(pcDel), pcDel.slice(0, 200));
  t('index_dev：文面に dateLabel（見ている日）を使っていない', !/dateLabel/.test(pcDel));
  t('mobile：予約カードの取り消しに window.confirm がある', /window\.confirm/.test(mbDel));
  t('mobile：文面にお名前（sama）と日付が入る', /sama\(/.test(mbDel) && /mode\.dk/.test(mbDel));

  await browser.close(); server.close();
  console.log(NL + '合計 ' + (pass + fail) + ' 件：✔ ' + pass + ' / ✖ ' + fail);
  process.exit(fail ? 1 : 0);
})();
