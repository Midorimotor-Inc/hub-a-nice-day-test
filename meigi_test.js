// 車検の「名義ちがいの！」と、検査員のチェックの検査（v3.107.0・2026-11-09 ユーザー決定）
//   見本は mock_meigi_check.html。決めごと：
//     ① ！の大きさは 20px（MEIGI_SZ）
//     ② 車検証の使用者が【未入力】の行には！を出さない
//     ③ ボタンの字は「✓ 名義を確認」→ 押したあと「✓ 確認済み」
//   ・！はスケジュール1日表示の【お名前の左横】。黄＝未確認／緑＝確認済み
//   ・チェックは予約そのものには書かず usrchk に残す（ダッシュボードと同じ印）
//   ・整備のカードには出さない
//   実行: node meigi_test.js        見た目も撮る: SHOT=<保存先.png> node meigi_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8459, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log('\n■ ' + s);
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
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

// 一覧の行ごとに「！」の様子を読む
const bangs = page => page.evaluate(() => {
  const out = {};
  // 車検の行は td の中に data-entrynm（お名前）がある
  document.querySelectorAll('[data-entrynm]').forEach(nm => {
    const box = nm.parentElement; if (!box) return;
    const name = (nm.innerText || '').replace(/\s|　/g, '').replace(/様$/, '');
    const b = box.querySelector('[data-meigi]');
    let o = { bang: b ? b.getAttribute('data-meigi') : null };
    if (b) {
      const s = getComputedStyle(b);
      o.w = Math.round(b.getBoundingClientRect().width);
      o.bg = s.backgroundColor;
      // ！はお名前より左にあること
      o.left = b.getBoundingClientRect().left < nm.getBoundingClientRect().left;
      o.tip = b.getAttribute('title') || '';
    }
    out[name] = o;
  });
  return out;
});

// 予約カードの様子
const card = page => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  if (!box) return null;
  const btn = box.querySelector('[data-meigichk]');
  const warn = box.querySelector('[data-meigiwarn]');
  const us = box.querySelector('[data-userfld]');
  const nm = box.querySelector('input[placeholder="お客様名"]');
  return {
    open: true,
    btn: btn ? btn.getAttribute('data-meigichk') : null,
    btnText: btn ? btn.innerText.trim() : null,
    btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
    warn: warn ? warn.getAttribute('data-meigiwarn') : null,
    warnText: warn ? warn.innerText.replace(/\s+/g, ' ') : null,
    userVal: us ? us.value : null, nameVal: nm ? nm.value : null,
    // 見出しの行がはみ出していないか（入力欄の右はしを越えない）
    fit: (() => {
      const lab = btn ? btn.parentElement : null;
      if (!lab || !us) return null;
      return Math.round(lab.getBoundingClientRect().right) <= Math.round(us.getBoundingClientRect().right) + 2;
    })(),
  };
});
const closeCard = page => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
  const b = [...box.querySelectorAll('button')].find(x => x.innerText.trim() === '✕' || /閉じる|キャンセル/.test(x.innerText));
  if (b) { b.click(); return true; }
  return false;
});

(async () => {
  // seq を入れてある＝行の印は seq（dashRowKey と同じ）
  const rows = [
    { name: '田中一郎', user: '田中花子', carType: 'ハスラー', no: '3310', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed' },
    { name: '佐藤健太', user: '佐藤　健太', carType: 'スペーシア', no: '1182', course: 1, store: 'honten', seq: 2, time: '10:00', bookingStatus: 'confirmed' },
    { name: '山本三郎', user: '', carType: 'ワゴンR', no: '778', course: 2, store: 'honten', seq: 3, time: '11:00', bookingStatus: 'confirmed' },
    { name: '両澤ちよう', user: '両澤まさる', carType: 'ジムニー', no: '4411', course: 2, store: 'honten', seq: 4, time: '13:00', bookingStatus: 'confirmed' },
  ];
  const seed = {
    [STOR + 'insp']: { [DK]: rows },
    // ★両澤様（seq 4）だけ、すでに確認済みの印が入っている
    [STOR + 'usrchk']: { [DK]: { '4': { by: '見取大介', at: Date.now() - 3600000 } } },
    [STOR + 'honten-sched']: { [DK]: { '14:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'Q', content: '', store: 'honten' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [], [STOR + 'cf-index']: [],
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
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  // ★React の「更新が止まらない」は console.error に出る＝pageerror では拾えない
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { const x = m.text(); if (m.type() === 'error' && x.indexOf('BABEL') < 0) errs.push(x.slice(0, 180)); });
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の車検が出ている', await seeText(page, '田中一郎', 15000));

  head('① スケジュール1日表示の「！」');
  const b1 = await bangs(page);
  t('★名義がちがう行に ！ が出る（田中様）', b1['田中一郎'] && b1['田中一郎'].bang === 'todo', b1['田中一郎']);
  t('★未確認は蛍光の黄色（#fff200）', b1['田中一郎'] && b1['田中一郎'].bg === 'rgb(255, 242, 0)', b1['田中一郎']);
  t('★大きさは 20px（ユーザー決定①）', b1['田中一郎'] && b1['田中一郎'].w === 20, b1['田中一郎']);
  t('★お名前の【左横】に出る', b1['田中一郎'] && b1['田中一郎'].left === true, b1['田中一郎']);
  t('★なぞると理由が出る', b1['田中一郎'] && /お名前が違います/.test(b1['田中一郎'].tip), b1['田中一郎']);
  t('★名義が同じ行には出ない（全角スペースの違いは同じ人とみなす）', b1['佐藤健太'] && b1['佐藤健太'].bang === null, b1['佐藤健太']);
  t('★使用者が【未入力】の行には出さない（ユーザー決定②）', b1['山本三郎'] && b1['山本三郎'].bang === null, b1['山本三郎']);
  t('★確認済みの行は緑（両澤様）', b1['両澤ちよう'] && b1['両澤ちよう'].bang === 'done', b1['両澤ちよう']);
  t('★確認済みの色は #22c55e', b1['両澤ちよう'] && b1['両澤ちよう'].bg === 'rgb(34, 197, 94)', b1['両澤ちよう']);
  t('★確認済みは「誰が・いつ」がなぞると出る', b1['両澤ちよう'] && /見取大介/.test(b1['両澤ちよう'].tip), b1['両澤ちよう']);
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('  📷 ' + process.env.SHOT); }
  t('ここまでエラーなし', errs.length === 0, errs.slice(0, 3));

  head('② 予約カードのチェックボタン');
  await page.click('td:has-text("田中一郎")', { timeout: 8000 }).catch(() => {});
  t('車検予約カードが開く', await seeText(page, '車検予約カード', 8000));
  let c = await card(page);
  t('★「✓ 名義を確認」のボタンがある（ユーザー決定③）', !!c && c.btnText === '✓ 名義を確認', c);
  t('★ボタンは未確認の黄色', !!c && c.btnBg === 'rgb(255, 242, 0)', c && c.btnBg);
  t('★見出しの行が入力欄の幅からはみ出していない', !!c && c.fit === true, c);
  t('★黄色い知らせの箱が出る', !!c && c.warn === 'todo', c);
  t('★知らせに「車検証の使用者」と「来店者」の両方の名前が出る',
    !!c && /田中花子/.test(c.warnText) && /田中一郎/.test(c.warnText), c && c.warnText);
  if (process.env.SHOT2) { await page.screenshot({ path: process.env.SHOT2 }); console.log('  📷 ' + process.env.SHOT2); }

  head('③ 押すと緑になる／もう一度押すと取り消せる');
  await page.evaluate(() => { const b = document.querySelector('[data-meigichk]'); if (b) b.click(); });
  await page.waitForTimeout(700);
  c = await card(page);
  t('★ボタンが「✓ 確認済み」になる', !!c && c.btnText === '✓ 確認済み', c);
  t('★知らせの箱が緑になる', !!c && c.warn === 'done', c);
  t('★誰が押したかが出る', !!c && /江川京志/.test(c.warnText), c && c.warnText);
  await closeCard(page);
  await page.waitForTimeout(700);
  let b2 = await bangs(page);
  t('★一覧の ！ も緑に変わる', b2['田中一郎'] && b2['田中一郎'].bang === 'done', b2['田中一郎']);
  t('★ほかの行は変わらない（両澤様は緑のまま・佐藤様と山本様は出ない）',
    b2['両澤ちよう'] && b2['両澤ちよう'].bang === 'done' && b2['佐藤健太'].bang === null && b2['山本三郎'].bang === null, b2);
  // もう一度押して取り消す
  await page.click('td:has-text("田中一郎")', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('[data-meigichk]'); if (b) b.click(); });
  await page.waitForTimeout(700);
  c = await card(page);
  t('★もう一度押すと「✓ 名義を確認」に戻る', !!c && c.btnText === '✓ 名義を確認', c);
  await closeCard(page);
  await page.waitForTimeout(700);
  b2 = await bangs(page);
  t('★一覧の ！ も黄色に戻る', b2['田中一郎'] && b2['田中一郎'].bang === 'todo', b2['田中一郎']);

  head('④ 「同じ」を押すと、その場で知らせが消える');
  await page.click('td:has-text("田中一郎")', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('[data-userSame]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  c = await card(page);
  t('★使用者に来店者氏名が入る', !!c && c.userVal === '田中一郎', c);
  t('★チェックボタンが消える', !!c && c.btn === null, c);
  t('★知らせの箱も消える', !!c && c.warn === null, c);
  await closeCard(page);
  await page.waitForTimeout(600);

  head('⑤ 使用者が未入力の予約／整備のカードには出さない');
  await page.click('td:has-text("山本三郎")', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  c = await card(page);
  t('★使用者が未入力の予約にはボタンを出さない', !!c && c.btn === null, c);
  t('★知らせの箱も出さない（ユーザー決定②）', !!c && c.warn === null, c);
  await closeCard(page);
  await page.waitForTimeout(600);
  await page.click('td:has-text("相原")', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  c = await card(page);
  t('★整備（一般予約カード）には名義の知らせを出さない', !!c && c.btn === null && c.warn === null, c);
  await closeCard(page);
  await page.waitForTimeout(400);
  t('ここまでエラーなし', errs.length === 0, errs.slice(0, 3));

  head('⑥ ファイルの中身の見張り');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const has = x => SRC.indexOf(x) >= 0;
  t('★！の大きさは MEIGI_SZ ひとつで決めている（20px）', /const MEIGI_SZ=20/.test(SRC));
  t('★色は定数を通す（CALBANG_YEL と MEIGI_OK）', has('background:done?MEIGI_OK:CALBANG_YEL'));
  t("★使用者が未入力なら 'empty'＝！を出さない（ユーザー決定②）", has("if(!u)return 'empty';") && has("if(meigiKind(row)!=='diff')return null;"));
  t('★氏名の見比べは dashNorm（空白を外す）を使う', has('const n=dashNorm(r.name), u=dashNorm(r.user);'));
  t('★チェックは予約そのものに書かない（usrchk の setUserChecked を使う）',
    has('onSetChecked={setUserChecked}') && !has('setForm({...form,meigiChecked'));
  t('★印の鍵はダッシュボードと同じ dashRowKey', has('dashRowKey(initialData,(modalIdxProp??initialData._idx??0))'));
  t('★印の鍵は【保存されている行】から作る（打っている途中の form では作らない）',
    has('const meigiKey=(isInsp&&!isNew&&initialData&&initialData.name)'));
  t('★InspRow に置いたのは出すだけの部品（MeigiBang）', has('<MeigiBang row={row} done={meigiDone}'));
  t('★整備のカードには出さない', has("{isInsp&&meigiK==='diff'&&("));
  t('エラーは1件も出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log('\n━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
