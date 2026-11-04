// クイックメニューは車検と一般整備で【別々】の検査（2026-11-04 ユーザー指示）
//   それまで setItems / setGroups を両方で使い回していたので、片方を直すともう片方も変わった。
//   ① PC：一般整備のカードの ⚡ には【一般の定型文】だけが出る
//   ② PC：車検のカードの ⚡ には【車検の定型文】だけが出る
//   ③ PC：車検の方で足しても inspItems にだけ入り、setItems は変わらない
//   ④ PC：一般の方で足しても setItems にだけ入り、inspItems は変わらない
//   ⑤ スマホ：①〜④と同じ
//   ⑥ ファイルの中身の見張り（キーが2組ある・isInsp で出し分けている・時点保存の表に入っている）
//   実行: node quick_split_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8435, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email, isAdmin: true }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// ★一般整備の定型文と車検の定型文を【まったく違う字】にしておく。
//   どちらかに相手の字が出たら、それは連動している＝不合格。
const GEN_LABEL = '一般オイル', GEN_TEXT = '一般のエンジンオイル交換', GEN_GROUP = '一般の区画';
const INS_LABEL = '車検ワイパー', INS_TEXT = '車検のワイパー交換', INS_GROUP = '車検の区画';

const seed = {
  [STOR + 'insp']: { [DK]: [{ name: '車検花子', carType: 'ヴィッツ', no: '5555', course: 2, staff: '江川京志', store: 'honten', seq: 1, time: '10:00' }] },
  [STOR + 'honten-sched']: { [DK]: { '13:00': { name: '整備太郎', work: 'Q', staff: '江川京志', id: 1, carType: 'アルト', store: 'honten' } } },
  [STOR + 'sanda-sched']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'inspLimits']: {},
  [STOR + 'setItems']: [{ id: 'g_1', g: 'gGEN', label: GEN_LABEL, text: GEN_TEXT }],
  [STOR + 'setGroups']: [{ id: 'gGEN', name: GEN_GROUP, col: '#0891b2' }],
  [STOR + 'inspItems']: [{ id: 'i_1', g: 'gINS', label: INS_LABEL, text: INS_TEXT }],
  [STOR + 'inspGroups']: [{ id: 'gINS', name: INS_GROUP, col: '#9333ea' }],
};

const serve = () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  const mkCtx = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(signedInInit, [ME, STOR]);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
    });
    await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    return ctx;
  };

  // ══════════════ PC ══════════════
  const ctx = await mkCtx({ width: 1500, height: 980 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept('あたらしい区画').catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  const closeCard = async () => {
    await page.evaluate(() => { const m = document.querySelector('.booking-modal-inner'); const b = m && [...m.querySelectorAll('button')].find(e => /^✕|×/.test(e.innerText.trim()) && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(600);
  };
  const openCard = async (nm) => {
    await page.evaluate(x => { const td = [...document.querySelectorAll('td')].find(e => e.innerText.indexOf(x) >= 0); if (td) td.click(); }, nm);
    await page.waitForTimeout(900);
    return page.evaluate(() => !!document.querySelector('.booking-modal-inner'));
  };
  const openQm = async () => {
    await page.evaluate(() => { const b = document.querySelector('[data-quickmenu]'); if (b) b.click(); });
    await page.waitForTimeout(600);
    return page.evaluate(() => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).zIndex === '4800'));
  };
  const qmRead = () => page.evaluate(() => {
    const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).zIndex === '4800');
    if (!ov) return null;
    return {
      items: [...ov.querySelectorAll('[data-qi]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
      groups: [...ov.querySelectorAll('[data-qg]')].map(e => (e.querySelector('span') || {}).innerText || ''),
    };
  });
  const qmAdd = async (label, text) => {
    await page.evaluate(() => { const b = document.querySelector('[data-qmedit]'); if (b) b.click(); });
    await page.waitForTimeout(400);
    const ok = await page.evaluate(([l, x]) => {
      const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).zIndex === '4800');
      if (!ov) return false;
      const box = [...ov.querySelectorAll('div')].find(d => /新しいバッジを足す/.test(d.innerText || ''));
      if (!box) return false;
      const ins = [...box.querySelectorAll('input')];
      if (ins.length < 2) return false;
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(ins[0], l); set(ins[1], x);
      return true;
    }, [label, text]);
    if (!ok) return false;
    await page.waitForTimeout(250);
    await page.evaluate(() => { const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).zIndex === '4800'); const b = ov && [...ov.querySelectorAll('button')].find(e => /＋ 追加する/.test(e.innerText)); if (b) b.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).zIndex === '4800'); const b = ov && [...ov.querySelectorAll('button')].find(e => /保存して閉じる/.test(e.innerText)); if (b) b.click(); });
    await page.waitForTimeout(1200);
    return true;
  };
  const kv = (k) => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), STOR + k);
  const labels = a => (Array.isArray(a) ? a.map(x => x && x.label) : a);

  head('① PC：一般整備のカードの ⚡ には【一般の定型文】だけ');
  t('整備の予約カードが開く', await openCard('整備太郎'));
  t('⚡ クイックメニューのボタンがある', await page.evaluate(() => !!document.querySelector('[data-quickmenu]')));
  t('クイックメニューが開く', await openQm());
  const g1 = await qmRead();
  t('★一般の定型文が出る', !!g1 && g1.items.some(x => x.indexOf(GEN_LABEL) >= 0), g1);
  t('★車検の定型文は出ない（連動していない）', !!g1 && !g1.items.some(x => x.indexOf(INS_LABEL) >= 0), g1);
  t('★区画も一般の分だけ', !!g1 && g1.groups.join(',').indexOf(GEN_GROUP) >= 0 && g1.groups.join(',').indexOf(INS_GROUP) < 0, g1 && g1.groups);

  head('② PC：車検のカードの ⚡ には【車検の定型文】だけ');
  await page.evaluate(() => { const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).zIndex === '4800'); const b = ov && [...ov.querySelectorAll('button')].find(e => /やめる/.test(e.innerText)); if (b) b.click(); });
  await page.waitForTimeout(400); await closeCard();
  t('車検の予約カードが開く', await openCard('車検花子'));
  t('クイックメニューが開く', await openQm());
  const i1 = await qmRead();
  t('★車検の定型文が出る', !!i1 && i1.items.some(x => x.indexOf(INS_LABEL) >= 0), i1);
  t('★一般の定型文は出ない（連動していない）', !!i1 && !i1.items.some(x => x.indexOf(GEN_LABEL) >= 0), i1);
  t('★区画も車検の分だけ', !!i1 && i1.groups.join(',').indexOf(INS_GROUP) >= 0 && i1.groups.join(',').indexOf(GEN_GROUP) < 0, i1 && i1.groups);

  head('③ PC：車検の方で足しても inspItems にだけ入る');
  t('足して保存できた', await qmAdd('車検だけの新顔', '車検だけの新顔です'));
  const ii = await kv('inspItems'), si = await kv('setItems');
  t('★inspItems に入る', Array.isArray(ii) && ii.some(x => x && x.label === '車検だけの新顔'), labels(ii));
  t('★setItems は変わらない', Array.isArray(si) && si.length === 1 && si[0].label === GEN_LABEL, labels(si));

  head('④ PC：一般の方で足しても setItems にだけ入る');
  await closeCard();
  t('整備の予約カードが開く', await openCard('整備太郎'));
  t('クイックメニューが開く', await openQm());
  const g2 = await qmRead();
  t('★車検で足した分は一般には出ない', !!g2 && !g2.items.some(x => x.indexOf('車検だけの新顔') >= 0), g2);
  t('足して保存できた', await qmAdd('一般だけの新顔', '一般だけの新顔です'));
  const si2 = await kv('setItems'), ii2 = await kv('inspItems');
  t('★setItems に入る', Array.isArray(si2) && si2.some(x => x && x.label === '一般だけの新顔'), labels(si2));
  t('★inspItems に「一般だけの新顔」は入らない', Array.isArray(ii2) && !ii2.some(x => x && x.label === '一般だけの新顔'), labels(ii2));
  t('★inspItems の中身はそのまま（車検だけの新顔が残る）', Array.isArray(ii2) && ii2.some(x => x && x.label === '車検だけの新顔'), labels(ii2));
  t('PC：JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await ctx.close();

  // ══════════════ スマホ ══════════════
  head('⑤ スマホ：車検の【備考】と一般整備の【内容】で別々');
  const mctx = await mkCtx({ width: 390, height: 844 });
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  mp.on('dialog', async d => { await d.accept('あたらしい区画').catch(() => {}); });
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 20000); await clickText(mp, '江川京志'); await clickText(mp, 'でログイン');
  await seeText(mp, 'スケジュール', 20000);
  await mp.waitForTimeout(1600);
  // 下タブの「スケジュール」は button ではなく div（CLAUDE.md の注意）
  await mp.evaluate(() => { const d = [...document.querySelectorAll('div')].find(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d) d.click(); });
  await mp.waitForTimeout(1500);

  const mOpenQm = async () => {
    await mp.evaluate(() => { const b = document.querySelector('button[data-quickmenu]'); if (b) b.click(); });
    await mp.waitForTimeout(700);
    return mp.evaluate(() => !!document.querySelector('[data-quickmenusheet]'));
  };
  const mQmRead = () => mp.evaluate(() => {
    const x = document.querySelector('[data-quickmenusheet]'); if (!x) return null;
    return { items: [...x.querySelectorAll('[data-qi]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()), txt: x.innerText };
  });
  const mCloseQm = async () => {
    await mp.evaluate(() => { const x = document.querySelector('[data-quickmenusheet]'); const b = x && [...x.querySelectorAll('button')].find(e => /とじる|やめる/.test(e.innerText)); if (b) b.click(); });
    await mp.waitForTimeout(500);
  };
  const mCloseCard = async () => {
    await mp.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /^✕|×|とじる/.test(e.innerText.trim()) && e.offsetParent !== null); if (b) b.click(); });
    await mp.waitForTimeout(700);
  };
  const goTab = (pg, label) => pg.evaluate(x => {
    const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === x && e.offsetParent !== null);
    const target = d.length ? d[d.length - 1].parentElement : null;
    if (target) { target.click(); return true; }
    return false;
  }, label);
  t('スマホ：スケジュールのタブに移れた', await goTab(mp, 'スケジュール'));
  await mp.waitForTimeout(1800);
  // ── 整備（内容）のカード ──
  t('スマホ：整備の予約カードを押せた', await mp.getByText('整備太郎', { exact: false }).last().click({ timeout: 8000 }).then(() => true).catch(() => false));
  await mp.waitForTimeout(1000);
  t('スマホ：整備の編集画面が開く', await seeText(mp, '作業内容', 10000));
  t('スマホ：クイックメニューが開く（整備）', await mOpenQm());
  const mg = await mQmRead();
  t('★スマホ・整備：一般の定型文が出る', !!mg && mg.items.some(x => x.indexOf(GEN_LABEL) >= 0), mg && mg.items);
  t('★スマホ・整備：車検の定型文は出ない', !!mg && !mg.items.some(x => x.indexOf(INS_LABEL) >= 0), mg && mg.items);
  await mCloseQm(); await mCloseCard();
  // ── 車検（備考）のカード ──
  await mp.waitForTimeout(1200);
  await clickText(mp, '＋ 車検を追加');
  t('スマホ：車検の予約画面が開く', await seeText(mp, '代車', 10000));
  t('スマホ：クイックメニューが開く（車検）', await mOpenQm());
  const mi = await mQmRead();
  t('★スマホ・車検：車検の定型文が出る', !!mi && mi.items.some(x => x.indexOf(INS_LABEL) >= 0), mi && mi.items);
  t('★スマホ・車検：一般の定型文は出ない', !!mi && !mi.items.some(x => x.indexOf(GEN_LABEL) >= 0), mi && mi.items);
  await mCloseQm();
  t('スマホ：JSエラーなし', merrs.length === 0, merrs.slice(0, 3));
  await mctx.close();

  // ══════════════ ファイルの中身の見張り ══════════════
  head('⑥ ファイルの中身（1つに戻していないか）');
  const ix = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const mb = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('PC：inspItems のキーを持っている', /useShared\(STOR\+'inspItems'/.test(ix));
  t('PC：inspGroups のキーを持っている', /useShared\(STOR\+'inspGroups'/.test(ix));
  t('PC：クイックメニューを isInsp で出し分けている', /items=\{\(isInsp\?inspItems:setItems\)/.test(ix));
  t('PC：保存先も isInsp で出し分けている', /isInsp\?onSaveQuickInsp:onSaveQuick/.test(ix));
  t('スマホ：inspItems / inspGroups を読んでいる', /STOR\+'inspItems'/.test(mb) && /STOR\+'inspGroups'/.test(mb));
  t('スマホ：シートを isInsp で出し分けている', /isInsp\?inspQuickItems:quickItems/.test(mb));
  t('スマホ：保存先も isInsp で出し分けている', /isInsp\?onSaveQuickInsp:onSaveQuick/.test(mb));
  t('時点保存の表（PC）に inspItems / inspGroups が入っている', /'setGroups','inspItems','inspGroups'/.test(ix));
  t('時点保存の表（スマホ）にも入っている', /'setGroups','inspItems','inspGroups'/.test(mb));
  t('写す道具（fb_split_quickmenu.js）がある', fs.existsSync(path.join(DIR, 'fb_split_quickmenu.js')));

  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
