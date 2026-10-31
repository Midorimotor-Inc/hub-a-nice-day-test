// 「🔒 編集中：」の帯の検査（2026-10-31 現場報告）
//   報告：PC のスケジュール画面、休日スタッフの下に「編集中」という文字が出て、何かおかしい。
//   原因：releaseLock はキーを消すが、サーバー側には空の {} が残る（本番に97件たまっていた）。
//        帯の判定が `v.lockedBy!==currentUser.name` だけだったので、
//        lockedBy を持たない {} が「自分ではない＝誰かが編集中」に当てはまり、
//        中身の無い札つきで帯が出ていた。期限切れ（30秒）のロックも同じ。
//   ここで見ること：
//     ① 空の {} だけの日は帯を出さない
//     ② 期限切れ（LOCK_TTL=30秒より前）のロックだけの日も帯を出さない
//     ③ 生きているロック（他の人・30秒以内）はこれまでどおり名前つきで出す
//     ④ 自分のロックは出さない
//   実行: node lock_band_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8413, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 帯が出ているか／中に誰の名前が出ているか
const bandOf = (page) => page.evaluate(() => {
  const d = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null && /^🔒 編集中：/.test(e.innerText || '')).pop();   // 入れ子の一番内側を取る
  return d ? d.innerText.replace(/\s+/g, ' ').trim() : null;
});
const setLocks = async (page, v) => {
  await page.evaluate(([k, val]) => window.__fakeFb.set(k, val), [STOR + 'locks', v]);
  await page.waitForTimeout(1800);
};

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' },
      { uid: 'h8', name: '岡上秀一', myNumber: 8, badge: 'mechanic', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    // ★本番と同じ形：解放済みのロックが空の {} で残っている
    [STOR + 'locks']: { [`lock-sched-${DK}-10:30`]: {}, [`lock-sched-${DK}-13:00`]: {} },
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
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 10000));

  head('① 解放済み（空の {}）のロックだけの日は帯を出さない');
  t('★「🔒 編集中：」が出ていない', (await bandOf(page)) === null, await bandOf(page));
  t('画面に「編集中」の字が出ていない', !(await page.evaluate(() => document.body.innerText)).includes('編集中'));

  head('② 期限切れ（30秒より前）のロックだけの日も帯を出さない');
  await setLocks(page, { [`lock-sched-${DK}-10:00`]: { lockedBy: '岡上秀一', lockedAt: Date.now() - 5 * 60 * 1000 } });
  t('★帯を出さない', (await bandOf(page)) === null, await bandOf(page));

  head('③ 生きているロック（他の人・30秒以内）は名前つきで出す');
  await setLocks(page, { [`lock-sched-${DK}-11:00`]: { lockedBy: '岡上秀一', lockedAt: Date.now() } });
  const b3 = await bandOf(page);
  t('★帯が出る', !!b3, b3);
  t('★その人の名前が出る', !!b3 && b3.indexOf('岡上秀一') >= 0, b3);

  head('④ 自分のロックは出さない');
  await setLocks(page, { [`lock-sched-${DK}-11:30`]: { lockedBy: '江川京志', lockedAt: Date.now() } });
  t('★帯を出さない', (await bandOf(page)) === null, await bandOf(page));

  head('⑤ 空の {} と 生きているロックが混ざった時は、生きている分だけ出す');
  await setLocks(page, {
    [`lock-sched-${DK}-10:30`]: {}, [`lock-sched-${DK}-13:00`]: {},
    [`lock-sched-${DK}-14:00`]: { lockedBy: '岡上秀一', lockedAt: Date.now() },
  });
  const b5 = await bandOf(page);
  t('★帯が出る', !!b5, b5);
  t('★札は1つだけ（空の分は数えない）', await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null && /^🔒 編集中：/.test(e.innerText || '')).pop();   // 入れ子の一番内側を取る
    return d ? [...d.querySelectorAll('span')].filter(s => !/編集中/.test(s.innerText)).length === 1 : false;
  }), b5);

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
