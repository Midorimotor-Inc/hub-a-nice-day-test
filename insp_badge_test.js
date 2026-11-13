// 点検のバッジ（M1／M6／M12・有12・無1／無6）と、作業内容の大きな窓の検査
//   2026-11-04 ユーザー決定：
//     ・作業内容のポップは【クイックメニューと同じ大きさの窓】（A案）
//     ・並べ方は 点検／整備・修理／その他
//     ・点検は【月数を選ばないと閉じられない】。逃げ道は「やめる（元に戻す）」だけ
//     ・有料点検は12ヶ月しかないので【自動で 有12】＝そのまま閉じる
//     ・週間カレンダーもスケジュール画面も【バッジだけ】。となりに作業名は出さない
//     ・昔の予約（M12 など）は書き換えない＝保存されている字のまま出る
//   実行: node insp_badge_test.js      （Firebase には繋がず、にせの firebase を使う）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8433, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = (s) => console.log('\n■ ' + s);
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

const FIX = [2026, 10, 21];
const TODAY = '2026-10-21';

const seed = {
  [STOR + 'insp']: {},
  [STOR + 'honten-sched']: {
    [TODAY]: {
      '09:00': { name: '整備太郎', carType: 'アルト', no: '3503', work: 'Q', content: 'オイル交換', staff: '江川京志', store: 'honten' },
      '10:00': { name: '点検次郎', carType: 'ワゴンR', no: '1111', work: 'メンパ', wkmon: '6', staff: '江川京志', store: 'honten' },
      '11:00': { name: '点検三郎', carType: 'スペーシア', no: '2222', work: '有点', wkmon: '12', staff: '江川京志', store: 'honten' },
      '13:00': { name: '点検四郎', carType: 'ハスラー', no: '3333', work: '無点', wkmon: '1', staff: '江川京志', store: 'honten' },
      '14:00': { name: '昔五郎', carType: 'ジムニー', no: '4444', work: 'M12', staff: '江川京志', store: 'honten' },
    },
  },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'office', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'inspLimits']: {},
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
  const rowText = (nm) => page.evaluate(n => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(n) >= 0); return tr ? tr.innerText.replace(/\s+/g, ' ') : ''; }, nm);
  const openCard = async (nm) => {
    await page.evaluate(n => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(n) >= 0); if (tr) tr.click(); }, nm);
    await page.waitForTimeout(900);
  };
  const closeCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(700);
  };
  const openWorkPop = async () => {
    await page.evaluate(() => { const e = document.querySelector('[data-kbkey="work"]'); if (e) e.click(); });
    await page.waitForTimeout(450);
  };
  const tap = (sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }, sel);
  const popOpen = () => page.evaluate(() => !!document.querySelector('[data-wkmodal]'));
  const workFld = () => page.evaluate(() => { const e = document.querySelector('[data-kbkey="work"]'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await see(ME.name); await click(ME.name); await click('でログイン');
  await see('スケジュール'); await click('このまま使う');
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('スケジュール') && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  // ───────────────────────────────────────────────
  head('① 1日表示のバッジ（バッジだけ・説明文は出さない）');
  const r2 = await rowText('点検次郎');
  t('メンパ6ヶ月は「M6」と出る', /M6/.test(r2), r2);
  t('★となりに作業名（メンパ）を出さない', !/メンパ/.test(r2), r2);
  const r3 = await rowText('点検三郎');
  t('有料点検は「有12」と出る', /有12/.test(r3), r3);
  t('★となりに作業名（有料点検）を出さない', !/有料点検/.test(r3), r3);
  const r4 = await rowText('点検四郎');
  t('無料点検1ヶ月は「無1」と出る', /無1/.test(r4), r4);
  t('★となりに作業名（無料点検）を出さない', !/無料点検/.test(r4), r4);
  const r5 = await rowText('昔五郎');
  t('★昔の予約（M12）は保存されている字のまま', /M12/.test(r5), r5);

  // ───────────────────────────────────────────────
  head('② 作業内容は大きな窓で開く（点検／整備・修理／その他）');
  await openCard('整備太郎');
  t('整備の予約カードが開く', await page.evaluate(() => !!document.querySelector('.booking-modal-inner')));
  await openWorkPop();
  const wm = await page.evaluate(() => {
    const ov = document.querySelector('[data-wkmodal]'); if (!ov) return null;
    const box = ov.querySelector('.modal-box'), chips = [...ov.querySelectorAll('[data-wkid]')];
    const qm = document.querySelector('[data-quickmenu]');
    return {
      w: Math.round(box.getBoundingClientRect().width),
      grps: [...ov.querySelectorAll('[data-wkgrp]')].map(e => e.getAttribute('data-wkgrp')),
      ids: chips.map(e => e.getAttribute('data-wkid')),
      fs: chips.length ? parseFloat(getComputedStyle(chips[0]).fontSize) : 0,
      z: parseInt(getComputedStyle(ov).zIndex, 10) || 0,
      mon: !!ov.querySelector('[data-wkmonrow]'),
    };
  });
  t('大きな窓が出る', !!wm, wm);
  t('★幅は760px以上（クイックメニューと同じ大きさ）', !!wm && wm.w >= 760, wm && wm.w);
  t('★区画は 点検／整備・修理／その他', !!wm && wm.grps.join('/') === '点検/整備・修理/その他', wm && wm.grps);
  t('★11項目ぜんぶ出る', !!wm && wm.ids.length === 11, wm && wm.ids.length);
  t('★点検は メンパ→無料点検→有料点検 の順（2026-11-04 ユーザー指示）', !!wm && wm.ids.slice(0, 3).join(',') === 'メンパ,無点,有点', wm && wm.ids.slice(0, 3));
  t('★字は15px以上', !!wm && wm.fs >= 15, wm && wm.fs);
  t('★予約カードより前に出る（zIndex 1000超）', !!wm && wm.z > 1000, wm && wm.z);
  t('点検を選ぶ前は月数の段を出さない', !!wm && wm.mon === false, wm && wm.mon);

  // ───────────────────────────────────────────────
  head('③ メンパ＝月数を選ばないと閉じられない');
  await tap('[data-wkid="メンパ"]'); await page.waitForTimeout(350);
  t('月数の段が出る', await page.evaluate(() => !!document.querySelector('[data-wkmonrow]')));
  // ★置き場所は【点検の区画のすぐ下】＝整備・修理の区画より上（2026-11-04 ユーザー指示）。
  //   いちばん下に戻さないこと。縁も太く（4px以上）。
  const mrow = await page.evaluate(() => {
    const r = document.querySelector('[data-wkmonrow]'); if (!r) return null;
    const g = [...document.querySelectorAll('[data-wkgrp]')];
    const y = (e) => e.getBoundingClientRect().top;
    const cs = getComputedStyle(r);
    return {
      afterInsp: y(r) > y(g[0]),
      beforeSeibi: y(r) < y(g[1]),
      beforeEtc: y(r) < y(g[2]),
      bw: parseFloat(cs.borderTopWidth),
      ring: cs.boxShadow !== 'none',
    };
  });
  t('★点検の区画より下に出る', !!mrow && mrow.afterInsp, mrow);
  t('★整備・修理の区画より【上】に割って入る', !!mrow && mrow.beforeSeibi, mrow);
  t('★その他の区画より上', !!mrow && mrow.beforeEtc, mrow);
  t('★縁は4px以上（目立たせる）', !!mrow && mrow.bw >= 4, mrow && mrow.bw);
  t('★まわりに輪がある', !!mrow && mrow.ring, mrow);
  t('★選んでも窓は閉じない', await popOpen());
  const mons = await page.evaluate(() => [...document.querySelectorAll('[data-wkmon]')].map(e => e.getAttribute('data-wkmon')));
  t('★月数は 1・6・12 の3つ', mons.join(',') === '1,6,12', mons);
  await page.evaluate(() => { const b = document.querySelector('[data-wkclose]'); if (b) b.click(); });
  await page.waitForTimeout(350);
  t('★✕ では閉じない', await popOpen());
  t('★わけを赤帯で出す', await page.evaluate(() => !!document.querySelector('[data-wkwarn]')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  t('★Escape でも閉じない', await popOpen());
  await page.evaluate(() => { const b = document.querySelector('[data-wkdone]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  t('★「これで決める」でも閉じない', await popOpen());
  await tap('[data-wkmon="6"]'); await page.waitForTimeout(400);
  t('★月数を選ぶと閉じる', !(await popOpen()));
  t('★欄は「メンパ（6ヶ月）」', /メンパ（6ヶ月）/.test(await workFld()), await workFld());

  // ───────────────────────────────────────────────
  head('④ 有料点検は自動で 有12（そのまま閉じる）');
  await openWorkPop();
  await tap('[data-wkid="有点"]'); await page.waitForTimeout(450);
  t('★そのまま閉じる（月数を聞かない）', !(await popOpen()));
  t('★欄は「有料点検（12ヶ月）」', /有料点検（12ヶ月）/.test(await workFld()), await workFld());

  // ───────────────────────────────────────────────
  head('⑤ 「やめる（元に戻す）」で開いた時の値に戻る');
  await openWorkPop();
  await tap('[data-wkid="メンパ"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('[data-wkgiveup]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  t('★閉じる', !(await popOpen()));
  t('★欄は「有料点検（12ヶ月）」に戻る', /有料点検（12ヶ月）/.test(await workFld()), await workFld());

  // ───────────────────────────────────────────────
  head('⑥ 無料点検は 1・6 の2つだけ／選んで保存するとバッジになる');
  await openWorkPop();
  await tap('[data-wkid="無点"]'); await page.waitForTimeout(350);
  const mons2 = await page.evaluate(() => [...document.querySelectorAll('[data-wkmon]')].map(e => e.getAttribute('data-wkmon')));
  t('★月数は 1・6 の2つ', mons2.join(',') === '1,6', mons2);
  await tap('[data-wkmon="6"]'); await page.waitForTimeout(400);
  t('★欄は「無料点検（6ヶ月）」', /無料点検（6ヶ月）/.test(await workFld()), await workFld());
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /内容を保存する|確定して登録|予約確定/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2600);
  const r1 = await rowText('整備太郎');
  t('★保存すると1日表示が「無6」になる', /無6/.test(r1), r1);
  t('★となりに作業名を出さない', !/無料点検/.test(r1), r1);

  // ───────────────────────────────────────────────
  head('⑦ 週間カレンダーもバッジだけ');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('週間カレンダー') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  // ★週表の整備のバッジは data-wwork（検査が読んでいるので消さないこと）
  const wk = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-wwork]')];
    const rows = [...document.querySelectorAll('[data-wtip]')].map(e => e.innerText.replace(/\s+/g, ' '));
    return { badges: b.map(e => e.innerText.trim()), open: !!document.querySelector('[data-wfold]'), rows: rows };
  });
  t('週表が開く', wk.open);
  t('★「M6」が出る', wk.badges.indexOf('M6') >= 0, wk.badges);
  t('★「有12」が出る', wk.badges.indexOf('有12') >= 0, wk.badges);
  t('★「無1」が出る', wk.badges.indexOf('無1') >= 0, wk.badges);
  t('★昔の予約は「M12」のまま', wk.badges.indexOf('M12') >= 0, wk.badges);
  t('★バッジに作業名を入れない', wk.badges.every(x => !/メンパ|有料点検|無料点検/.test(x)), wk.badges);
  t('★お名前のとなりにも作業名を出さない', wk.rows.every(x => !/メンパ|有料点検|無料点検/.test(x)), wk.rows);

  t('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

  // ───────────────────────────────────────────────
  head('⑧ ファイルの中身の見張り');
  const ix = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const mb = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const hp = fs.readFileSync(path.join(DIR, 'hub_paper.js'), 'utf8');
  for (const [nm, src] of [['スケジュール', ix], ['スマホ', mb]]) {
    t(nm + '：★主作業は設定から読む（WORK_REG）', (src.indexOf('let WORK_REG = {') >= 0 || src.indexOf('let WORK_REG={') >= 0) && src.indexOf('const workSubOf') >= 0);
    t(nm + '：workBadgeText がある', src.indexOf('const workBadgeText') >= 0);
    t(nm + '：★月数が1つだけの作業は自動で決める（決め打ちにしない）', src.indexOf('mons.length === 1') >= 0 || src.indexOf('mons.length===1') >= 0);
    t(nm + '：★「有点なら12」の決め打ちが無い', src.indexOf("(id === '有点') ? '12'") < 0 && src.indexOf("(id==='有点')?'12'") < 0);
    t(nm + '：★バッジは 見分け字＋月数', src.indexOf('return m ? (b + m) : b') >= 0 || src.indexOf('return m?(b+m):b') >= 0);
  }
  t('スケジュール：blankSched に wkmon がある', /blankSched *= *\(\) *=> *\(\{[^)]*wkmon:''/.test(ix));
  t('スマホ：整備の初期値に wkmon がある', mb.indexOf("qkind:[],wkmon:''") >= 0);
  t('スマホ：★月数を選ばないと保存できない', mb.indexOf('workSubOf(form.work)&&!workMonOf(form)') >= 0);
  t('スマホ：月数の段がある', mb.indexOf('data-wkmonrow') >= 0);
  t('紙の控え：点検の月数まで出す', hp.indexOf('workNameP') >= 0 && /WORK_SUB_OLD_P/.test(hp));
  t('紙の控え：★主作業は控えの workItems から引く', /WORK_ITEMS_P/.test(hp) && hp.indexOf("P('workItems')") >= 0);
  for (const [nm, src] of [['スケジュール', ix], ['スマホ', mb]]) {
    const iM = src.indexOf("{id:'メンパ'"), iN = src.indexOf("{id:'無点'"), iY = src.indexOf("{id:'有点'");
    t(nm + '：★点検の並びは メンパ→無点→有点', iM > 0 && iM < iN && iN < iY);
    const tight = src.split(' ').join('');   // 並びの字下げは無視して見る
    t(nm + '：3つとも 点検のグループ（g1）', tight.indexOf("{id:'メンパ',g:'g1'") >= 0 && tight.indexOf("{id:'無点',g:'g1'") >= 0 && tight.indexOf("{id:'有点',g:'g1'") >= 0);
  }
  t('スマホ：★車検の備考にも ⚡ クイックメニュー', /isInsp\?'note':'content'/.test(mb) && (mb.match(/data-quickmenu/g) || []).length >= 2);
  t('スマホ：区画の見出しを出せる（data-pkhdr）', mb.indexOf('data-pkhdr') >= 0);
  t('スマホ：作業内容も区画入り', mb.indexOf('workGroups().reduce') >= 0);
  t('★小さい並び（popgrid work）はもう無い', ix.indexOf('data-popgrid="work"') < 0);
  t('★data-wkid は残してある（既存の検査が押している）', ix.indexOf('data-wkid={w.id}') >= 0);

  console.log('\n────────────────────────────');
  console.log('  合格 ' + pass + ' 件 / 不合格 ' + fail + ' 件');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
