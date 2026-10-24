// 一般整備の予約カードで「時間」を変えられるかの検査（2026-10-24 ユーザー要望）
//   「一般予約カードの時間変更機能を付けて。午前入庫なども時間が決まったら変更できるように」
//   ① 既にある予定を開くと「時間帯」の欄に今の時間が出る
//   ② 午前入庫 → 10:00 に変えて保存すると、午前の枠が空いて 10:00 に移る
//   ③ 10:00 → 入庫時間未定 に戻せる
//   ④ 同じ時刻に先客がいても止めない（空きサブ枠 09:00__1 へ入る）
//   実行: node sched_time_move_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8364, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const now = new Date(), Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
const DK = `${Y}-${M + 1}-${D}`;

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [] },
    [STOR + 'honten-sched']: { [DK]: {
      '午前': { id: 1, at: 1, name: '午前さん', carType: 'アルト', work: 'Q', content: '', store: 'honten' },
      '09:00': { id: 2, at: 2, name: '先客さん', carType: 'タント', work: 'Q', content: '', store: 'honten' },
    } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
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
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(2000);

  // タイムスケジュールの行をクリックして予約カードを開く
  // カードが開いたままだと次の行を押せないので、必ず閉じてから開く
  const openByName = async (nm) => {
    await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); if (box) { const b = [...box.querySelectorAll('button')].find(x => /閉じる|キャンセル|✕/.test(x.innerText)); if (b) b.click(); } });
    await page.waitForTimeout(600);
    return page.evaluate(x => {
      const td = [...document.querySelectorAll('td')].find(e => e.innerText.trim().indexOf(x) === 0 && e.closest('tr'));
      const tr = td && td.closest('tr');
      if (tr) { tr.click(); return true; }
      return false;
    }, nm);
  };
  const slotField = () => page.evaluate(() => {
    const el = document.querySelector('.booking-modal-inner [data-kbkey="slot"]');
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  // ★一覧は押したあとに描かれる（React）。開く→待つ→選ぶ の順にすること
  const pickSlot = async (v) => {
    await page.evaluate(() => { const el = document.querySelector('.booking-modal-inner [data-kbkey="slot"]'); if (el) el.click(); });
    await page.waitForTimeout(400);
    return page.evaluate(x => {
      const it = document.querySelector('.booking-modal-inner [data-slotid="' + x + '"]');
      if (!it) return false;
      it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return true;
    }, v);
  };
  const save = () => page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = box && [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) { b.click(); return true; } return false; });
  const sched = () => page.evaluate(k => {
    const raw = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}')['kv/' + k];
    const v = raw ? JSON.parse(raw.v) : {};
    return v;
  }, STOR + 'honten-sched');

  // ── ① カードを開くと今の時間が出る ──
  console.log('\n■ ① 既にある予定を開くと「時間帯」に今の時間が出る');
  t('午前の予定をクリックで開けた', await openByName('午前さん'));
  await page.waitForTimeout(900);
  const f0 = await slotField();
  t('★「時間帯」の欄がある', f0 !== null, f0);
  t('★いまの時間（午前入庫）が出ている', !!f0 && /午前入庫/.test(f0), f0);
  t('「変更する場合は選択」と案内が出る', await page.evaluate(() => /変更する場合は選択/.test(document.querySelector('.booking-modal-inner').innerText)));

  // ── ② 午前入庫 → 10:00 ──
  console.log('\n■ ② 午前入庫 → 10:00 に変える');
  t('時間の一覧から 10:00 を選べた', await pickSlot('10:00'));
  await page.waitForTimeout(400);
  t('欄が 10:00 になった', /10:00/.test(await slotField() || ''), await slotField());
  t('保存できた', await save());
  await page.waitForTimeout(1800);
  const s1 = await sched();
  const day1 = s1[DK] || {};
  t('★10:00 に移っている', !!(day1['10:00'] && day1['10:00'].name === '午前さん'), Object.keys(day1).map(k => k + ':' + (day1[k] && day1[k].name)));
  t('★元の「午前」の枠は空いた', !(day1['午前'] && day1['午前'].name), Object.keys(day1).map(k => k + ':' + (day1[k] && day1[k].name)));
  t('ほかの予定は巻き添えにしない（09:00 の先客）', !!(day1['09:00'] && day1['09:00'].name === '先客さん'), Object.keys(day1).map(k => k + ':' + (day1[k] && day1[k].name)));
  t('車種・作業は引き継ぐ', !!(day1['10:00'] && day1['10:00'].carType === 'アルト' && day1['10:00'].work === 'Q'), day1['10:00']);

  // ── ③ 10:00 → 入庫時間未定 に戻す ──
  console.log('\n■ ③ 時間が分からなくなったら「未定」にも戻せる');
  t('10:00 の予定を開けた', await openByName('午前さん'));
  await page.waitForTimeout(900);
  t('時間の一覧から 未定 を選べた', await pickSlot('未定'));
  await page.waitForTimeout(300);
  t('保存できた', await save());
  await page.waitForTimeout(1800);
  const s2 = await sched(); const day2 = s2[DK] || {};
  t('★「未定」の枠に移っている', !!(day2['未定'] && day2['未定'].name === '午前さん'), Object.keys(day2).map(k => k + ':' + (day2[k] && day2[k].name)));
  t('★10:00 は空いた', !(day2['10:00'] && day2['10:00'].name), Object.keys(day2).map(k => k + ':' + (day2[k] && day2[k].name)));

  // ── ④ 先客のいる時刻へ移す ──
  console.log('\n■ ④ 先客のいる時刻へ移しても止めない（同時刻に複数OK）');
  t('未定の予定を開けた', await openByName('午前さん'));
  await page.waitForTimeout(900);
  t('時間の一覧から 09:00 を選べた', await pickSlot('09:00'));
  await page.waitForTimeout(300);
  t('保存できた', await save());
  await page.waitForTimeout(1800);
  const s3 = await sched(); const day3 = s3[DK] || {};
  const at9 = Object.keys(day3).filter(k => k.indexOf('09:00') === 0 && day3[k] && day3[k].name);
  t('★09:00 に2件入る（先客さん＋午前さん）', at9.length === 2, at9.map(k => k + ':' + day3[k].name));
  t('★先客さんはそのまま 09:00', !!(day3['09:00'] && day3['09:00'].name === '先客さん'), day3['09:00']);
  t('★移した分は空きのサブ枠（09:00__1）へ', !!(day3['09:00__1'] && day3['09:00__1'].name === '午前さん'), day3['09:00__1']);
  t('「枠が埋まっている」で止めない', !alerts.some(x => /埋ま/.test(x)), alerts);

  // 見た目を目で見たい時： SHOT=<保存先.png> node sched_time_move_test.js
  if (process.env.SHOT) {
    await openByName('午前さん');
    await page.waitForTimeout(900);
    const box = await page.$('.booking-modal-inner');
    if (box) await box.screenshot({ path: process.env.SHOT });
  }
  t('JSエラーなし', errs.length === 0, errs.slice(0, 2));
  console.log('\n──────── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────────');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
