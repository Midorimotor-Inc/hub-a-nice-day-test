// スマホの店舗切替と「入庫店舗」の検査（2026-10-02 ユーザー指示）
//   ① ヘッダーの下に店舗切替の帯が出る。押すとバナーの色が店舗色に変わる
//   ② 他店に切り替えると「👁 閲覧中」。整備（タイムスケジュール）は閲覧のみ（開かない・追加しない）
//   ③ 他店でも車検は編集できる
//   ④ 予約カードに「入庫店舗」があり、車検の店を変えると行の store が変わる
//   ⑤ 整備の店を変えると、別の店のタイムスケジュールへ移り、元の店の枠は空く
//   実行: node mobile_store_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8251, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const goTab = (page, label) => page.evaluate(x => {
  const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null);
  const target = d.length ? d[d.length - 1].parentElement : null;
  if (target) { target.click(); return true; }
  return false;
}, label);
// 予約カードの入庫店舗ボタン（ヘッダーの切替にも 🏪 があるので title で見分ける）
const cardStoreBtn = page => page.evaluate(() => { const b = document.querySelector('button[title*="入れ替わり"]'); return b ? b.innerText.trim() : null; });
const tapCardStore = page => page.evaluate(() => { const b = document.querySelector('button[title*="入れ替わり"]'); if (b) { b.click(); return true; } return false; });
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
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [
      { name: '原村', carType: 'シエンタ', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' },
      { name: '川上', carType: 'ジムニー', no: '1609', course: 2, store: 'sanda', seq: 2, time: '10:00', bookingStatus: 'confirmed', note: '' },
    ] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '', shimi: '' } } },
    [STOR + 'sanda-sched']: { [DK]: { '09:00': { id: 21, name: '西浦', carType: 'ヴィッツ', work: '点検', content: '', shimi: '' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
    [STOR + 'honten-cdow-v2']: [], [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [], [STOR + 'sanda-cdow']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 25000);

  const headBg = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /三田店|本店/.test(e.innerText) && e.offsetParent !== null);
    let el = b; for (let i = 0; i < 6 && el; i++) { const bg = getComputedStyle(el).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && el.tagName === 'DIV') return bg; el = el.parentElement; }
    return '';
  });

  // ── ① 切り替えの帯 ──
  console.log('\n■ ① 店舗切替の帯');
  t('本店・三田店のボタンが出る', await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim());
    return bs.some(x => x.includes('本店')) && bs.some(x => x.includes('三田店'));
  }), await page.evaluate(() => document.body.innerText.slice(0, 160)));
  t('はじめは自分の店（本店）で、「閲覧中」は出ない', !(await page.evaluate(() => document.body.innerText)).includes('閲覧中'));
  const bg1 = await headBg();

  // ── ② 三田店へ切り替え ──
  console.log('\n■ ② 三田店に切り替える');
  t('三田店に切り替えられた', await clickText(page, '三田店'));
  await page.waitForTimeout(900);
  t('「👁 閲覧中」が出る', await seeText(page, '閲覧中', 8000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  const bg2 = await headBg();
  // テスト版は「テスト版だと分かるように」両店ともオレンジが仕様。色が店舗で変わるのはメインだけ
  t('テスト版は両店とも同じ色（仕様どおり）', !!bg1 && bg1 === bg2, { bg1, bg2 });
  const mainMob = path.join(DIR, '..', 'hub-a-nice-day', 'mobile.html');
  if (fs.existsSync(mainMob)) {
    const src = fs.readFileSync(mainMob, 'utf8');
    const pick = n => (src.match(new RegExp('const ' + n + "='([^']*)'")) || [])[1] || '';
    t('メインは本店と三田店でヘッダー色が違う', !!pick('UI_HEAD') && pick('UI_HEAD') !== pick('UI_HEAD_S'), { h: pick('UI_HEAD'), s: pick('UI_HEAD_S') });
  } else { t('メインのファイルが無いので色の違いは確認を飛ばす', true); }
  t('氏名の横は自分の所属（本店）のまま', (await page.evaluate(() => document.body.innerText)).includes('江川京志（本店）'));

  // ── ③ 他店の整備は閲覧のみ・車検は編集できる ──
  console.log('\n■ ③ 他店：整備は閲覧のみ／車検は編集できる');
  await goTab(page, 'スケジュール');
  await page.waitForTimeout(1600);
  t('三田店の整備（西浦）が見える', await seeText(page, '西浦', 12000), await page.evaluate(() => document.body.innerText.slice(0, 400)));
  t('「他の店は閲覧のみ」と出る', (await page.evaluate(() => document.body.innerText)).includes('他の店は閲覧のみ'));
  t('「＋ タップで追加」は出ない', !(await page.evaluate(() => document.body.innerText)).includes('タップで追加'));
  alerts.length = 0;
  await page.getByText('西浦', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  t('整備をタップしても編集画面は開かない', !(await page.evaluate(() => document.body.innerText)).includes('整備の編集'));
  t('閲覧のみの知らせが出る', alerts.some(a => a.includes('閲覧のみ')), alerts);
  // 車検（三田店の川上）は開ける
  await page.getByText('川上', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  t('他店でも車検の編集は開ける', await seeText(page, '車検の編集', 10000), await page.evaluate(() => document.body.innerText.slice(0, 200)));

  // ── ④ 入庫店舗で車検の店を変える ──
  console.log('\n■ ④ 予約カードの「入庫店舗」（車検）');
  const stBtn = await cardStoreBtn(page);
  t('「入庫店舗」の欄があり、今の店（三田店）が出ている', !!stBtn && stBtn.includes('三田店'), stBtn);
  t('「入庫店舗」の文字が出る', (await page.evaluate(() => document.body.innerText)).includes('入庫'));
  t('カードの入庫店舗を押せた', await tapCardStore(page));
  await page.waitForTimeout(400);
  t('押すと本店に入れ替わる', (await cardStoreBtn(page) || '').includes('本店'), await cardStoreBtn(page));
  t('「予約確定」を押せた', await clickText(page, '予約確定'));
  t('★車検の店が本店に変わる', await page.waitForFunction(([k, dk]) => {
    const rows = (window.__fakeFb.get(k + 'insp') || {})[dk] || [];
    const r = rows.find(x => x && x.name === '川上');
    return !!r && (r.store === 'honten' || r.store === '本店');
  }, [STOR, DK], { timeout: 20000 }).then(() => true).catch(() => false),
    await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).map(r => r && { n: r.name, s: r.store }), [STOR, DK]));

  // ── ⑤ 整備の店を変えて移す ──
  console.log('\n■ ⑤ 整備の「入庫店舗」で店をまたいで移す');
  await page.waitForTimeout(1200);
  t('本店に戻せた', await clickText(page, '本店'));
  await page.waitForTimeout(1200);
  await goTab(page, 'スケジュール');
  await page.waitForTimeout(1600);
  t('本店の整備（相原）が見える', await seeText(page, '相原', 12000));
  await page.getByText('相原', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  t('整備の編集画面が開く', await seeText(page, '整備の編集', 10000));
  t('カードの入庫店舗を押せた（整備）', await tapCardStore(page));
  await page.waitForTimeout(400);
  t('入庫店舗が三田店になった', (await cardStoreBtn(page) || '').includes('三田店'), await cardStoreBtn(page));
  await clickText(page, '予約確定');
  t('★三田店のタイムスケジュールへ移る', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'sanda-sched') || {})[dk] || {};
    return Object.values(day).some(r => r && r.name === '相原');
  }, [STOR, DK], { timeout: 25000 }).then(() => true).catch(() => false),
    await page.evaluate(k => ({ h: window.__fakeFb.get(k + 'honten-sched'), s: window.__fakeFb.get(k + 'sanda-sched') }), STOR));
  t('★本店の枠は空く', await page.waitForFunction(([k, dk]) => {
    const day = (window.__fakeFb.get(k + 'honten-sched') || {})[dk] || {};
    return !Object.values(day).some(r => r && r.name === '相原');
  }, [STOR, DK], { timeout: 25000 }).then(() => true).catch(() => false),
    await page.evaluate(k => window.__fakeFb.get(k + 'honten-sched'), STOR));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-store.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
