// 「開いたままの画面から、その日の予定が丸ごと消える」問題の検査（2026-09-28 ユーザー報告）。
//   10/4 のタイムスケジュールが全部消え、リロードで復活した。データは無事で、画面に当てる値の選び方の問題。
//   ① 回線が不安定な時に届く「手元の控え（fromCache）」の古い写しは、画面に当てない
//   ② サーバー由来でも「中身が大きく減る」値は、直接読み直して確かめてから当てる
//      ・サーバーには残っていた（古い写しだった）→ 当てない
//      ・サーバーでも本当に消えていた（誰かが消した）→ 当てる
//   実行: node stale_snapshot_test.js        修正前を見る: SRC=<古いファイル> node stale_snapshot_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8209, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const goneText = async (page, s, ms = 6000) => { try { await page.waitForFunction(x => !document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;
// その日に整備の予定を6件（10/4 の再現）
const NAMES = ['相原', '井本', '上野', '江口', '大川', '春日'];
const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'];
const fullDay = () => { const o = {}; SLOTS.forEach((sl, i) => { o[sl] = { id: 1000 + i, name: NAMES[i], carType: 'ワゴンR', work: 'オイル', content: '点検' }; }); return o; };

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [DK]: fullDay() },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, (process.env.SRC && p === 'index_dev.html') ? process.env.SRC : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { errs.push('dialog:' + d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  // 今日のスケジュールを開く
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の整備予定が6件出ている', await seeText(page, NAMES[0], 15000) && await seeText(page, NAMES[5], 5000));

  console.log('\n■ ① 回線が不安定な時の「手元の控え（古い写し）」');
  await page.evaluate(([k, dk]) => window.__fakeFb.emit(k + 'honten-sched', { [dk]: {} }, { fromCache: true }), [STOR, DK]);
  await page.waitForTimeout(2500);
  t('古い写しが届いても予定は消えない', await page.evaluate(n => document.body.innerText.includes(n), NAMES[0]) && await page.evaluate(n => document.body.innerText.includes(n), NAMES[5]));

  console.log('\n■ ② サーバー由来でも「大きく減る値」は読み直して確かめる');
  // サーバーには6件そのまま。減った値だけが届いた場合＝当ててはいけない
  await page.evaluate(([k, dk]) => window.__fakeFb.emit(k + 'honten-sched', { [dk]: {} }), [STOR, DK]);
  await page.waitForTimeout(3000);
  t('サーバーに残っていれば消えない（古い写しを捨てる）', await page.evaluate(n => document.body.innerText.includes(n), NAMES[0]));
  t('確かめた記録が残る（poll-anomaly）', await page.evaluate(k => { try { const a = JSON.parse(localStorage.getItem(k + 'poll-anomaly') || '[]'); return a.some(x => x.kind === 'loss'); } catch (e) { return false; } }, STOR), await page.evaluate(k => localStorage.getItem(k + 'poll-anomaly'), STOR));

  console.log('\n■ ③ 本当に消えた時は、ちゃんと画面からも消える');
  // 他の端末が実際に3件消した（サーバーの中身も変える）
  await page.evaluate(([k, dk]) => {
    const cur = window.__fakeFb.get(k + 'honten-sched') || {};
    const day = Object.assign({}, cur[dk]);
    ['13:00', '14:00', '15:00'].forEach(s => delete day[s]);
    window.__fakeFb.set(k + 'honten-sched', Object.assign({}, cur, { [dk]: day }));
  }, [STOR, DK]);
  t('サーバーで消えた3件は画面からも消える', await goneText(page, NAMES[5], 12000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
  t('残りの3件はそのまま出ている', await page.evaluate(n => document.body.innerText.includes(n), NAMES[0]));

  console.log('\n■ ④ それでも消えた時：自動で取り直して戻す（見張り）');
  // 購読も保存も通さず、画面の手元だけを空にする（原因不明の消え方を作る）
  await page.evaluate(([k, dk]) => { window.__hubLastWriteTs = 0; window.__fakeFb.emit(k + 'honten-sched', {}, { fromCache: false }); }, [STOR, DK]);
  await page.waitForTimeout(1200);
  t('消えても自動で戻る', await seeText(page, NAMES[0], 20000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('黄色い帯で知らせる', await seeText(page, '取り直して元に戻しました', 10000), await page.evaluate(() => document.body.innerText.slice(0, 200)));
  t('サーバーにも記録が残る（diag-display）', await page.waitForFunction(k => { const a = window.__fakeFb.get(k + 'diag-display'); return Array.isArray(a) && a.some(x => x && x.kind === 'sched'); }, STOR, { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(k => window.__fakeFb.get(k + 'diag-display'), STOR));

  console.log('\n■ ⑤ ふだんの更新（1件増える）はすぐ反映される');
  await page.evaluate(([k, dk]) => {
    const cur = window.__fakeFb.get(k + 'honten-sched') || {};
    const day = Object.assign({}, cur[dk], { '16:00': { id: 2001, name: '木下', carType: 'タント', work: '点検', content: '12ヶ月' } });
    window.__fakeFb.set(k + 'honten-sched', Object.assign({}, cur, { [dk]: day }));
  }, [STOR, DK]);
  t('他の端末が入れた予定はすぐ出る', await seeText(page, '木下', 12000));
  t('JSエラー・alert なし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-stale.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
