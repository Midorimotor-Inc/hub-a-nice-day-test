// スマホで予約を消した時に【別の予約の帯】を外さないかの検査（v3.134.4・2026-11-26・本番の現場報告）
//   同じ日に同じお名前の予約が2件あり、車の付いていない方を消したら、もう1件のレンタカーの帯が外れた。
//   PC版（delete_other_band_test.js）と同じ決まりをスマホの deleteCore にも置いてある。
//   ・車の無い予約を消しても、同じ日・同じお名前の別の予約の帯は残る（レンタカー＝氏名でさがす道／代車＝鍵が同じ字の道）
//   ・車を持っている予約を消せば、今までどおり帯が外れる
//   ★お名前はすべて架空。Firestore にはつながない。
//   実行: node mobile_del_band_test.js      （HTML=<別のファイル> で対象を差し替えられる）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const DIR = __dirname, PORT = 8545, STOR = 'hub-v8-dev-', NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
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
const TODAY = (now.getFullYear()) + '-' + (now.getMonth() + 1) + '-' + now.getDate();
const Y = now.getFullYear(), M0 = now.getMonth(), D = now.getDate();
const T1 = Date.now() - 300000;
const row = (name, carType, extra) => Object.assign({ name, staff: '江川京志', carType, no: '', work: 'B', qkind: [], wkmon: '', loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null, bookingStatus: 'new', store: 'honten', rcvAt: T1, rcvBy: '江川京志', at: T1, id: T1 }, extra || {});
const SAME = '同名　太郎', SAME2 = '同姓　次郎';
const sk = slot => 'sched-' + TODAY + '-' + slot;
(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [TODAY]: {
      '15:00': row(SAME, '旧ソリオ'), '15:00__1': row(SAME, '新ソリオ', { rentalLabel: '🔑 スペカス (8971)', rentalCarId: 'r1' }),
      '16:00': row(SAME2, '旧ワゴン'), '16:00__1': row(SAME2, '新ワゴン', { loaner: 'ハスラー (7074)', loanerId: 1 }),
    } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [{ id: 1, name: 'ハスラー', num: '7074' }], [STOR + 'sanda-cars']: [{ id: 9, name: 'アルト', num: '123' }],
    [STOR + 'rentalcars']: [{ id: 'r1', name: 'スペカス', num: '8971' }],
    // レンタカーの帯：鍵は新しい方の枠（氏名でさがす保険の道）／代車の帯：鍵が消す方の枠と同じ字
    [STOR + 'rres']: { r1: { '7001': { id: 7001, user: SAME, fy: Y, fm: M0, fd: D, ty: Y, tm: M0, td: D, color: '#2563eb', bookingKey: sk('15:00__1') } } },
    [STOR + 'honten-lres']: { '1': { k1: { id: 7002, user: SAME2, fy: Y, fm: M0, fd: D, ty: Y, tm: M0, td: D, color: '#059669', bookingKey: sk('16:00'), carName: 'ハスラー', carNum: '7074' } } },
    [STOR + 'sanda-lres']: { '9': {} },
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, (p === 'mobile.html' && process.env.HTML) ? process.env.HTML : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);
  t('スマホのスケジュールに整備が出る', await seeText(page, '旧ソリオ', 8000));
  const get = k => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), STOR + k);
  const bandIds = async k => { const l = (await get(k)) || {}; const out = []; Object.keys(l).forEach(c => Object.values(l[c] || {}).forEach(r => { if (r) out.push(r.id); })); return out; };
  const delBy = async (carText) => {
    await page.getByText(carText, { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const opened = await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /削除/.test(e.innerText) && e.offsetParent !== null));
    const ok = opened && await clickText(page, '削除');
    await page.waitForTimeout(6000);
    return ok;
  };

  console.log(NL + '■ ① レンタカー：車の無い方を消す（帯の鍵は別の枠＝氏名でさがす保険の道）');
  t('車の無い古い予約を削除できた', await delBy('旧ソリオ'));
  let day = ((await get('honten-sched')) || {})[TODAY] || {};
  t('古い予約だけ消える', !day['15:00'] && !!day['15:00__1'], Object.keys(day));
  t('★★もう1件のレンタカーの帯は残る', (await bandIds('rres')).includes(7001), await get('rres'));

  console.log(NL + '■ ② 代車：車の無い方を消す（帯の鍵が消す方の枠と同じ字）');
  t('車の無い古い予約を削除できた', await delBy('旧ワゴン'));
  day = ((await get('honten-sched')) || {})[TODAY] || {};
  t('古い予約だけ消える', !day['16:00'] && !!day['16:00__1'], Object.keys(day));
  t('★★もう1件の代車の帯は残る', (await bandIds('honten-lres')).includes(7002), await get('honten-lres'));

  console.log(NL + '■ ③ 車を持っている予約を消せば、今までどおり帯が外れる');
  t('レンタカーつきの予約を削除できた', await delBy('新ソリオ'));
  t('★レンタカーの帯が外れる', !(await bandIds('rres')).includes(7001), await get('rres'));
  t('代車つきの予約を削除できた', await delBy('新ワゴン'));
  t('★代車の帯が外れる（鍵は別の枠の字でも、氏名と車で見つける）', !(await bandIds('honten-lres')).includes(7002), await get('honten-lres'));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
