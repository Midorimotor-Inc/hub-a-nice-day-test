// ダッシュボード（車検 使用者の確認リスト）の検査
//   2026-10-29 整備からの依頼。モック mock_dashboard.html / mock_dashboard_shaken.html で確認ずみ
//   ① 上の並びの「🏠 ダッシュボード」から開く
//   ② 載るのは【終わった車検だけ】（車検日が本日まで／キャンセル・承認待ちは出さない）
//   ③ 顧客名（来店者）と車検証の使用者を別々に出す。同じ／名前が違う／未入力 を色分け
//   ④ 週ごとに分ける。チェックは1つ。誰がいつ押したかも残る
//   ⑤ 絞り込み（すべて・未確認だけ・チェック済み・名前が違うものだけ）
//   ⑥ 月送り（次の月は今月より先に行けない）
//   ⑦ 氏名を押すとその日のスケジュールが開く
//   実行: node dashboard_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8377, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

// 画面の日付を 2026-10-21（水）に固定する。10/25 の車検は「まだ終わっていない」ことになる
const FIX = [2026, 10, 21];
const ins = (nm, user, extra) => Object.assign(
  { name: nm, user, carType: 'アルト', no: '3503', course: 2, store: 'honten',
    time: '09:00', staff: '岡田', bookingStatus: 'confirmed' }, extra || {});

const seed = {
  [STOR + 'insp']: {
    // 第1週
    '2026-10-3': [
      ins('青木　一郎', '青木 一郎'),              // 全角／半角の空白ちがいだけ＝同じ人
      ins('法人太郎', '井上商事'),                  // 名義が違う
      ins('空欄花子', ''),                          // 未入力
    ],
    // 第2週
    '2026-10-8': [ins('上田　歩', '上田　歩')],
    // 第3週（キャンセルと承認待ちは出さない）
    // ★承認待ちの行を作るには【枠からあふれさせる】必要がある。枠内に収まっていると
    //   BLOCK-C が「承認は要らない」と判断して印を外してしまうため、7台入れてある。
    '2026-10-20': [
      ins('遠藤　咲', ''),
      ins('消した人', '', { bookingStatus: 'cancelled' }),
      ins('詰め一', '詰め一'), ins('詰め二', '詰め二'), ins('詰め三', '詰め三'),
      ins('詰め四', '詰め四'), ins('詰め五', '詰め五'),
      ins('承認待ち人', '', { pendingApproval: true }),
    ],
    // まだ終わっていない（本日より後）
    '2026-10-25': [ins('未来　翔', '未来　翔')],
    // 前の月
    '2026-9-5': [ins('九月　学', '')],
  },
  [STOR + "inspLimits"]: {},
  [STOR + "honten-sched"]: {}, [STOR + "sanda-sched"]: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [],
  [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const f = path.join(DIR, p);
    if (p.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f, 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return;
    }
    fs.readFile(f, (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(([me, stor, sd]) => {
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
    const st = {};
    st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
    st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 't', at: 1, last: Date.now() };
    for (const k in sd) st['kv/' + k] = { v: JSON.stringify(sd[k]), u: Date.now() };
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(stor + 'auth-devid', 'dev1');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
    localStorage.setItem(stor + 'auth-kind', 'own');
  }, [ME, STOR, seed]);
  await ctx.addInitScript(([y, m, d]) => {
    const DT = Date; const fixed = new DT(y, m - 1, d, 10, 0, 0);
    window.Date = class extends DT { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } };
  }, FIX);
  const FAKE = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
  await ctx.route('https://www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE : '' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const click = (x) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(s) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, x);
  const see = async (s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

  const login = async (q) => {
    await page.goto('http://localhost:' + PORT + '/index_dev.html' + (q || ''), { waitUntil: 'domcontentloaded' });
    await see(ME.name); await click(ME.name); await click('でログイン');
    await see('スケジュール'); await click('このまま使う');
    await page.waitForTimeout(2400);
  };
  await login();

  console.log('\n■ ① 入口');
  t('★ヘッダーのまん中に「🏠 ダッシュボード」のボタンがある', await page.evaluate(() => {
    const b = document.querySelector('[data-dashnav]'); return !!b && /ダッシュボード/.test(b.innerText);
  }));
  t('★★ほんとうに画面のまん中にある（左右の中身に引きずられない）', await page.evaluate(() => {
    const b = document.querySelector('[data-dashnav]'); if (!b) return false;
    const r = b.getBoundingClientRect();
    return Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) <= 6;
  }), await page.evaluate(() => { const b = document.querySelector('[data-dashnav]'); const r = b.getBoundingClientRect(); return { mid: (r.left + r.right) / 2, half: window.innerWidth / 2 }; }));
  // ★押すと別タブで開く（2026-10-29 ユーザー指示）。中身はこのアプリそのものを ?dash=1 で開くだけ。
  const [pop] = await Promise.all([
    ctx.waitForEvent('page'),
    page.evaluate(() => document.querySelector('[data-dashnav]').click()),
  ]);
  t('★押すと別タブが開く', !!pop);
  t('★そのタブは同じアプリを ?dash=1 で開いている', !!pop && /index_dev\.html\?dash=1$/.test(pop.url()), pop && pop.url());
  await pop.close();
  // この検査では同じタブの中で見たいので、?dash=1 で開き直す
  await login('?dash=1');
  t('★?dash=1 で開くと、最初からダッシュボードが出ている', await page.evaluate(() => !!document.querySelector('[data-dash]')));
  t('★アドレスから印が外れている（開き直しても出っぱなしにならない）',
    await page.evaluate(() => location.search === ''), await page.evaluate(() => location.search));
  // ★v3.79.1 から、まず入口の画面が出る（これから項目が増えるため）
  t('★まず入口の画面が出る（いきなりリストではない）', await page.evaluate(() =>
    !!document.querySelector('[data-dashtile="shaken"]') && !document.querySelector('[data-dashrow]')));
  t('★「車検済みチェック」のタイルがある', await page.evaluate(() =>
    /車検済みチェック/.test(document.querySelector('[data-dashtile="shaken"]').innerText)));
  t('★未確認の台数がタイルに出る', await page.evaluate(() =>
    /未確認 10/.test(document.querySelector('[data-dashtile="shaken"]').innerText)),
    await page.evaluate(() => document.querySelector('[data-dashtile="shaken"]').innerText.replace(/\n/g, ' / ')));
  t('★「これから」のタイルが3つ並ぶ', await page.evaluate(() => document.querySelectorAll('[data-dashsoon]').length === 3));
  await page.evaluate(() => document.querySelector('[data-dashtile="shaken"]').click());
  await page.waitForTimeout(800);
  t('★タイルを押すとチェックのリストが開く', await page.evaluate(() => !!document.querySelector('[data-dashrow]')));
  t('★見出しに「車検済みチェック」と出る', await page.evaluate(() => /車検済みチェック/.test(document.querySelector('[data-dash]').innerText)));
  t('★「← ダッシュボードに戻る」がある', await page.evaluate(() => !!document.querySelector('[data-dashback]')));

  // ── 見出しのボタンの並びと、マスの線（2026-10-30 ユーザー指示）──
  // SHOT=<保存先.png> を付けると、この時点の見た目を撮る（マスの線・見出しのボタン用）
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  const hdr = await page.evaluate(() => {
    const bk = document.querySelector('[data-dashback]'), cl = document.querySelector('[data-dashclose]');
    if (!bk || !cl) return null;
    const b = bk.getBoundingClientRect(), c = cl.getBoundingClientRect(), cs = getComputedStyle(cl);
    return { gap: c.left - b.right, sameRow: Math.abs(b.top - c.top) < 6,
      txt: cl.innerText.trim(), bg: cs.backgroundColor, w: Math.round(c.width), h: Math.round(c.height),
      backRight: b.right, closeRight: c.right };
  });
  t('★「戻る」は「閉じる」のすぐ左どなり', !!hdr && hdr.sameRow && hdr.gap >= 0 && hdr.gap < 30, hdr);
  t('★閉じるは ✕ だけ（字を出さない）', !!hdr && hdr.txt === '✕', hdr);
  t('★閉じるは赤いボタン', !!hdr && hdr.bg === 'rgb(220, 38, 38)', hdr);
  t('★閉じるは週間カレンダーと同じ 32×26', !!hdr && hdr.w === 32 && hdr.h === 26, hdr);
  const grid = await page.evaluate(() => {
    const td = document.querySelector('[data-dashrow] td'); if (!td) return null;
    const cs = getComputedStyle(td);
    return { top: cs.borderTopColor, left: cs.borderLeftColor, right: cs.borderRightColor, bottom: cs.borderBottomColor,
      w: cs.borderLeftWidth };
  });
  t('★マスの線は週間カレンダーと同じ濃さ（#64748b）', !!grid && grid.top === 'rgb(100, 116, 139)' && grid.left === 'rgb(100, 116, 139)', grid);
  t('★左右にも線が引いてある（ちゃんとマスになっている）', !!grid && grid.left === grid.right && parseFloat(grid.w) >= 1, grid);
  // 車種・ナンバー／担当 が薄い灰色だと読みにくい（2026-10-30 ユーザー指示）。顧客名と同じ黒さにそろえた。
  const ink = await page.evaluate(() => {
    const tr = document.querySelector('[data-dashrow]'); if (!tr) return null;
    const td = tr.querySelectorAll('td');
    const c = i => getComputedStyle(td[i]).color;
    return { name: c(1), car: c(3), staff: c(4) };
  });
  t('★車種・ナンバーは顧客名と同じ黒さ', !!ink && ink.car === ink.name, ink);
  t('★担当も顧客名と同じ黒さ', !!ink && ink.staff === ink.name, ink);
  t('★その黒さは薄い灰色（#64748b）ではない', !!ink && ink.car !== 'rgb(100, 116, 139)', ink);
  t('★いま見ているのは今月（2026年10月）', await page.evaluate(() => {
    const e = document.querySelector('[data-dashmon]'); return !!e && e.innerText.trim() === '2026年10月';
  }), await page.evaluate(() => { const e = document.querySelector('[data-dashmon]'); return e ? e.innerText : null; }));

  const list = () => page.evaluate(() => [...document.querySelectorAll('[data-dashrow]')].map(tr => ({
    row: tr.getAttribute('data-dashrow'), kind: tr.getAttribute('data-dashkind'),
    chk: tr.getAttribute('data-dashchk'), txt: tr.innerText.replace(/\n/g, ' / '),
  })));

  console.log('\n■ ② 載るのは終わった車検だけ');
  let rs = await list();
  t('★10台だけ出る（キャンセル・承認待ち・これからの分は出さない）', rs.length === 10, rs.map(x => x.txt));
  t('★キャンセルした分は出ない', !rs.some(x => /消した人/.test(x.txt)), rs.map(x => x.txt));
  t('★承認待ちの分は出ない', !rs.some(x => /承認待ち人/.test(x.txt)), rs.map(x => x.txt));
  t('★これからの車検（10/25）は出ない', !rs.some(x => /未来/.test(x.txt)), rs.map(x => x.txt));
  t('★当日（10/20 までの分）は出る', rs.some(x => /遠藤/.test(x.txt)), rs.map(x => x.txt));

  console.log('\n■ ③ 来店者と車検証の使用者を別々に出す');
  t('★空白のちがいだけなら「同じ」とみなす（青木　一郎）',
    (rs.find(x => /青木/.test(x.txt)) || {}).kind === 'same', rs.find(x => /青木/.test(x.txt)));
  t('★名義が違う人は「名前が違う」になる（法人太郎→井上商事）',
    (rs.find(x => /法人太郎/.test(x.txt)) || {}).kind === 'diff', rs.find(x => /法人太郎/.test(x.txt)));
  t('★使用者が空なら「未入力」になる（空欄花子）',
    (rs.find(x => /空欄花子/.test(x.txt)) || {}).kind === 'empty', rs.find(x => /空欄花子/.test(x.txt)));
  t('★「名前が違う」の札が出る', await page.evaluate(() => !!document.querySelector('[data-dashdiff]')));
  t('★「未入力」は押せる（予約カードを開く案内）', await page.evaluate(() => {
    const b = document.querySelector('[data-dashempty]');
    return !!b && b.innerText.trim() === '未入力' && /車検証の使用者/.test(b.getAttribute('title') || '');
  }));
  t('★名前が違う行・未入力の行はオレンジの地色', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => x.getAttribute('data-dashkind') === 'diff');
    return !!tr && /255, 247, 237/.test(getComputedStyle(tr).backgroundColor);
  }));
  t('★同じ人の行は白のまま', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => x.getAttribute('data-dashkind') === 'same');
    return !!tr && /255, 255, 255/.test(getComputedStyle(tr).backgroundColor);
  }));

  console.log('\n■ ④ 週ごとに分ける／チェック');
  const weeks = () => page.evaluate(() => [...document.querySelectorAll('[data-dashweek]')].map(e => e.getAttribute('data-dashweek')));
  t('★週ごとに分かれている（第1週・第2週・第3週）', (await weeks()).join(',') === '1,2,3', await weeks());
  t('★進み具合が出る（確認ずみ 0 / 10 台）', await page.evaluate(() => /確認ずみ\s*0\s*\/\s*10 台/.test(document.querySelector('[data-dashprog]').innerText)),
    await page.evaluate(() => document.querySelector('[data-dashprog]').innerText));
  // 1件チェックする
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /青木/.test(x.innerText));
    tr.querySelector('[data-dashmark]').click();
  });
  await page.waitForTimeout(900);
  rs = await list();
  t('★押すとチェックが入る', (rs.find(x => /青木/.test(x.txt)) || {}).chk === '1', rs.find(x => /青木/.test(x.txt)));
  t('★進み具合が 1 / 10 になる', await page.evaluate(() => /確認ずみ\s*1\s*\/\s*10 台/.test(document.querySelector('[data-dashprog]').innerText)),
    await page.evaluate(() => document.querySelector('[data-dashprog]').innerText));
  t('★誰がいつ押したかが出る（江川　10/21）', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /青木/.test(x.innerText));
    return /江川京志　10\/21/.test(tr.innerText);
  }), await page.evaluate(() => { const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /青木/.test(x.innerText)); return tr.innerText.replace(/\n/g, ' / '); }));
  t('★印が黄色になる', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /青木/.test(x.innerText));
    return /253, 230, 138/.test(getComputedStyle(tr.querySelector('[data-dashmark]')).backgroundColor);
  }));
  t('★保存されている（usrchk に入る）', await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    const d = st['kv/hub-v8-dev-usrchk']; if (!d) return false;
    const v = JSON.parse(d.v || '{}'); return !!(v['2026-10-3'] && Object.keys(v['2026-10-3']).length === 1);
  }), await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}'); const d = st['kv/hub-v8-dev-usrchk']; return d ? d.v : null; }));
  // もう一度押すと外れる
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /青木/.test(x.innerText));
    tr.querySelector('[data-dashmark]').click();
  });
  await page.waitForTimeout(900);
  rs = await list();
  t('★もう一度押すと外れる', (rs.find(x => /青木/.test(x.txt)) || {}).chk === '0', rs.find(x => /青木/.test(x.txt)));

  console.log('\n■ ⑤ 週まとめて確認ずみ');
  t('★「未確認 3 台」と週の見出しに出る（第1週）', await page.evaluate(() => {
    const e = document.querySelector('[data-dashwrest="1"]'); return !!e && /未確認 3 台/.test(e.innerText);
  }), await page.evaluate(() => { const e = document.querySelector('[data-dashwrest="1"]'); return e ? e.innerText : null; }));
  await page.evaluate(() => document.querySelector('[data-dashwall="1"]').click());
  await page.waitForTimeout(1000);
  t('★第1週の3台がまとめてチェックされる', await page.evaluate(() =>
    [...document.querySelectorAll('[data-dashweek="1"] [data-dashrow]')].every(tr => tr.getAttribute('data-dashchk') === '1')));
  t('★週の見出しが「この週は確認ずみ」に変わる', await page.evaluate(() => !!document.querySelector('[data-dashwdone="1"]')));
  t('★進み具合が 3 / 10 になる', await page.evaluate(() => /確認ずみ\s*3\s*\/\s*10 台/.test(document.querySelector('[data-dashprog]').innerText)),
    await page.evaluate(() => document.querySelector('[data-dashprog]').innerText));

  console.log('\n■ ⑥ 絞り込み');
  const nShown = () => page.evaluate(() => document.querySelectorAll('[data-dashrow]').length);
  await page.evaluate(() => document.querySelector('[data-dashfilt="todo"]').click());
  await page.waitForTimeout(500);
  t('★未確認だけ＝7台', await nShown() === 7, await nShown());
  await page.evaluate(() => document.querySelector('[data-dashfilt="done"]').click());
  await page.waitForTimeout(500);
  t('★チェック済み＝3台', await nShown() === 3, await nShown());
  await page.evaluate(() => document.querySelector('[data-dashfilt="diff"]').click());
  await page.waitForTimeout(500);
  t('★名前が違うものだけ＝3台（違う1＋未入力2）', await nShown() === 3, await nShown());
  await page.evaluate(() => document.querySelector('[data-dashfilt="all"]').click());
  await page.waitForTimeout(500);
  t('★すべて＝10台に戻る', await nShown() === 10, await nShown());

  console.log('\n■ ⑦ 月送り');
  t('★「次の月」は今月より先に行けない', await page.evaluate(() => !!document.querySelector('[data-dashnext]').disabled));
  await page.evaluate(() => document.querySelector('[data-dashprev]').click());
  await page.waitForTimeout(800);
  t('★前の月（2026年9月）に行ける', await page.evaluate(() => document.querySelector('[data-dashmon]').innerText.trim() === '2026年9月'),
    await page.evaluate(() => document.querySelector('[data-dashmon]').innerText));
  t('★9月の分が出る（九月　学）', await page.evaluate(() =>
    [...document.querySelectorAll('[data-dashrow]')].some(tr => /九月/.test(tr.innerText))));
  t('★9月はチェックの印を引きずらない', await page.evaluate(() =>
    [...document.querySelectorAll('[data-dashrow]')].every(tr => tr.getAttribute('data-dashchk') === '0')));
  await page.evaluate(() => document.querySelector('[data-dashnext]').click());
  await page.waitForTimeout(800);
  t('★10月に戻ると、付けた印はそのまま残っている', await page.evaluate(() =>
    [...document.querySelectorAll('[data-dashweek="1"] [data-dashrow]')].every(tr => tr.getAttribute('data-dashchk') === '1')));

  console.log('\n■ ⑦-2 ダッシュボードに戻る');
  await page.evaluate(() => document.querySelector('[data-dashback]').click());
  await page.waitForTimeout(700);
  t('★入口の画面に戻る', await page.evaluate(() =>
    !!document.querySelector('[data-dashtile="shaken"]') && !document.querySelector('[data-dashrow]')));
  t('★付けた印はタイルの数字に出る（未確認 7）', await page.evaluate(() =>
    /未確認 7/.test(document.querySelector('[data-dashtile="shaken"]').innerText)),
    await page.evaluate(() => document.querySelector('[data-dashtile="shaken"]').innerText.replace(/\n/g, ' / ')));
  await page.evaluate(() => document.querySelector('[data-dashtile="shaken"]').click());
  await page.waitForTimeout(700);

  console.log('\n■ ⑧ 氏名を押すとその日のスケジュールが開く');
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll('[data-dashrow]')].find(x => /遠藤/.test(x.innerText));
    tr.querySelector('[data-dashopen]').click();
  });
  await page.waitForTimeout(1200);
  t('★ダッシュボードが閉じる', await page.evaluate(() => !document.querySelector('[data-dash]')));
  t('★10/20 のスケジュールが開く', await page.evaluate(() => /10月20日/.test(document.body.innerText) || /10\/20/.test(document.body.innerText)));

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})();
