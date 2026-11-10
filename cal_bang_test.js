// 車検カレンダーの「7台目の！」の検査（2026-10-29 ユーザー指示・A案）
//   ① 6台までで承認待ちも無い日には「！」を出さない（いままでと同じ見た目）
//   ② まだ承認されていない予約があれば 黄色の！
//   ③ 承認が済んでいれば 緑の！
//   ④ なぞると、6コマに出ていない分と、承認の状態が出る
//   ⑤ 6コマの見た目は変えていない（1日あたり6つのまま）
//   ⑥ ★【位置】と【承認】を混ぜない（2026-10-29 ユーザー報告の 10/11 の件）
//      あふれたかどうかは seq（予約を入れた順）で決まる＝並んでいる順とは違う。
//   実行: node cal_bang_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8373, STOR = 'hub-v8-dev-';
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
const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
// 同じ月の中に 6台の日／7台(未承認あり)の日／8台(すべて承認済み)の日 を作る
const dk = d => `${Y}-${M + 1}-${d}`;
const row = (n, course, extra) => Object.assign({ name: n, carType: 'アルト', no: '3503', course, store: 'honten', time: '09:00', bookingStatus: 'confirmed' }, extra || {});
const six = Array.from({ length: 6 }, (_, i) => row('六' + (i + 1), 2, { seq: 100 + i }));
const seven = six.concat([row('七番', 3, { seq: 200, pendingApproval: true })]);
const eight = six.concat([row('八番A', 3, { seq: 201, approved: true }), row('八番B', 3, { seq: 202, approved: true })]);
// ★2026-10-29 ユーザー報告の 10/11 を写したもの。
//   並び（配列）では 7番目＝小畠様だが、seq（予約を入れた順）では 小畠様は5番目＝枠の中。
//   あふれているのは みどりB様で、すでに承認済み。だから【緑】でなければならない。
const real1011 = [
  row('木庭', 2, { seq: 10 }), row('福島', 1, { seq: 11 }), row('橋口', 2, { seq: 12 }),
  row('田中', 1, { seq: 13 }),
  row('みどりA', 2, { seq: 100 }), row('みどりB', 2, { seq: 101, approved: true }),
  row('小畠', 2, { seq: 14 }),
];

// 候補日（同じ月の中で、先に来た「開いている日」を使う）
const SIX_DAYS = [5, 6], SEVEN_DAYS = [8, 9], EIGHT_DAYS = [12, 13], REAL_DAYS = [18, 19];

(async () => {
  // ★検査の日付を決め打ちにしないこと（2026-11-10 に直した）。
  //   休業日（祝日・第2火曜）に当たると6コマそのものが描かれず、「！」も出ないので落ちる。
  //   2026年11月の第2火曜が 11/10 で、8台の日を 10日 に固定していたため
  //   5件が長いあいだ不合格のままだった（製品側の不具合ではない）。
  //   → 候補日をいくつか置いて、実際に6コマが描かれた日を使う。
  const insp = {};
  SIX_DAYS.forEach(d => { insp[dk(d)] = six.map(r => Object.assign({}, r)); });
  SEVEN_DAYS.forEach(d => { insp[dk(d)] = seven.map(r => Object.assign({}, r)); });
  EIGHT_DAYS.forEach(d => { insp[dk(d)] = eight.map(r => Object.assign({}, r)); });
  REAL_DAYS.forEach(d => { insp[dk(d)] = real1011.map(r => Object.assign({}, r)); });
  const seed = {
    [STOR + 'insp']: insp,
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [], [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
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
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await clickText(page, 'カレンダー');
  await page.waitForTimeout(1500);

  // SHOT=<保存先.png> を付けると、この時点の見た目を撮る（「！」の位置・色の確認用）
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  // 日のマスを読む（日付の数字 → そのマスの ！ の種類）
  const cells = await page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('div')].forEach(d => {
      const b = d.querySelector(':scope > div > [data-calbang]');
      if (!b) return;
      const num = d.querySelector(':scope > div > span');
      if (!num) return;
      const n = Number(num.innerText.trim());
      if (!n) return;
      const cs = getComputedStyle(b), r = b.getBoundingClientRect();
      // 「！」は【6コマのグリッドの中】にあり、その真上に浮いている（6枠には重ねない）
      const grid = b.parentElement, gr = grid.getBoundingClientRect();
      out[n] = { kind: b.getAttribute('data-calbang'), title: b.getAttribute('title') || '',
        bg: cs.backgroundColor, bd: cs.borderTopWidth, w: Math.round(r.width), h: Math.round(r.height),
        // 丸の真ん中と6コマの真ん中が合っているか（左右のずれ）
        dx: Math.round((r.left + r.width / 2) - (gr.left + gr.width / 2)),
        // 丸の下の端と6コマの上の端のすきま（0以上＝重なっていない）
        gap: Math.round(gr.top - r.bottom),
        cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
    });
    return out;
  });
  const slots = await page.evaluate(() => {
    const g = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).gridTemplateColumns.split(' ').length === 3 && d.children.length >= 6);
    return g.length ? g[0].children.length : 0;
  });
  // 6コマが描かれた日＝開いている日。ここから候補日を選ぶ
  const openDays = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('div')].forEach(d => {
      const num = d.querySelector(':scope > div > span');
      if (!num) return;
      const n = Number(String(num.innerText || '').trim());
      if (!n) return;
      const g = [...d.querySelectorAll(':scope > div')].find(x => getComputedStyle(x).gridTemplateColumns.split(' ').length === 3 && x.children.length >= 6);
      if (g) out.push(n);
    });
    return out;
  });
  const pick = arr => arr.find(d => openDays.includes(d));
  const D6 = pick(SIX_DAYS), D7 = pick(SEVEN_DAYS), D8 = pick(EIGHT_DAYS), D11 = pick(REAL_DAYS);

  console.log(String.fromCharCode(10) + '■ ⓪ 休業日に当たっていない日を選べたか（開いている日: ' + openDays.join(',') + '）');
  t('6台の日を選べた', !!D6, SIX_DAYS);
  t('7台の日を選べた', !!D7, SEVEN_DAYS);
  t('8台の日を選べた', !!D8, EIGHT_DAYS);
  t('10/11 を写した日を選べた', !!D11, REAL_DAYS);

  console.log('\n■ ① 6台まで・承認待ちも無い日には出さない');
  t('6台の日（' + D6 + '日）に「！」が無い', !cells[D6], cells[D6]);

  console.log('\n■ ② まだ承認されていない予約があれば黄色');
  t('7台の日（' + D7 + '日）に「！」がある', !!cells[D7], Object.keys(cells));
  t('★黄色（未承認）になっている', !!cells[D7] && cells[D7].kind === 'wait', cells[D7] && cells[D7].kind);
  t('★色は蛍光の黄色（#fff200）', !!cells[D7] && /255, 242, 0/.test(cells[D7].bg), cells[D7] && cells[D7].bg);

  // ── 置き場所と大きさ（2026-10-30 ユーザー指示）──
  //   日付のとなりの 17px・白ふち付き では小さくて見落としていた。
  console.log(String.fromCharCode(10)+'■ ②-2 ★6枠の真ん中の真上に、大きく出す');
  t('★大きさは 26px', !!cells[D7] && cells[D7].w === 26 && cells[D7].h === 26, cells[D7]);
  t('★白いふちは付けない', !!cells[D7] && parseFloat(cells[D7].bd) === 0, cells[D7] && cells[D7].bd);
  t('★6コマのグリッドの中に置いてある', !!cells[D7] && cells[D7].cols === 3, cells[D7] && cells[D7].cols);
  t('★左右の真ん中に来ている（ずれ2px以内）', !!cells[D7] && Math.abs(cells[D7].dx) <= 2, cells[D7] && cells[D7].dx);
  t('★6枠には重ねない（すぐ上に浮かせる）', !!cells[D7] && cells[D7].gap >= 0 && cells[D7].gap <= 8, cells[D7] && cells[D7].gap);

  console.log('\n■ ③ 承認が済んでいれば緑');
  t('8台の日（' + D8 + '日）に「！」がある', !!cells[D8], cells[D8]);
  t('★緑（承認済み）になっている', !!cells[D8] && cells[D8].kind === 'ok', cells[D8] && cells[D8].kind);
  t('★色が緑', !!cells[D8] && /34, 197, 94/.test(cells[D8].bg), cells[D8] && cells[D8].bg);

  console.log('\n■ ④ なぞると中身が出る');
  const tp = (cells[D7] && cells[D7].title) || '';
  t('★台数が出る', /7台/.test(tp), tp);
  t('★6コマに出ていないことが出る', /6コマに出ていません/.test(tp), tp);
  t('★その人の氏名が出る', /七番 様/.test(tp), tp);
  t('★承認の状態が出る', /まだ承認されていません/.test(tp), tp);
  const tp2 = (cells[D8] && cells[D8].title) || '';
  t('★承認が済んだ日は「承認済み」と出る', /枠からあふれた分（承認済み）/.test(tp2) && !/まだ承認されていません/.test(tp2), tp2);
  t('★「承認は済んでいます」と締める', /承認は済んでいます/.test(tp2), tp2);

  console.log('\n■ ⑥ ★位置と承認を混ぜない（2026-10-29 ユーザー報告の 10/11）');
  t(D11 + '日に「！」が出る（7台入っている）', !!cells[D11], Object.keys(cells));
  t('★★緑になる（あふれた分は承認済み）', !!cells[D11] && cells[D11].kind === 'ok', cells[D11]);
  t('★★色が緑', !!cells[D11] && /34, 197, 94/.test(cells[D11].bg), cells[D11] && cells[D11].bg);
  const tp3 = (cells[D11] && cells[D11].title) || '';
  t('★6コマに出ていないのは 小畠様', /小畠 様（クイック）　6コマに出ていません/.test(tp3), tp3);
  t('★あふれて承認されたのは みどりB様', /みどりB 様（クイック）　枠からあふれた分（承認済み）/.test(tp3), tp3);
  t('★同じ名前を2回出さない（小畠様は1回だけ）', (tp3.match(/小畠 様/g)||[]).length === 1, tp3);
  t('★「まだ承認されていません」とは出さない', !/まだ承認されていません/.test(tp3), tp3);

  console.log('\n■ ⑤ 6コマの見た目は変えていない');
  t('★1日あたりのコマは6つのまま', slots === 6, slots);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
