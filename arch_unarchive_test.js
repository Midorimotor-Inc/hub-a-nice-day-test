// 保管箱（insp-arch）からの「引き戻し」の実物を確かめる検査（2026-11-09）
//   arch_merge_test.js は純関数とファイルの中身だけを見ている。
//   こちらは【本物のブラウザ＋にせ firebase】で hubUnarchiveDay のトランザクションを動かす。
//   見るところ：
//     ① 保管箱にしか無い日も、画面にちゃんと出る（合体の表示）
//     ② 引き戻すと insp にその日の全行が入り、保管箱からその日が消える
//     ③ 1件も失わない／位置も bookingKey も変わらない
//     ④ もう一度呼んでも増えない・壊れない（何もしない）
//     ⑤ insp と保管箱の両方に同じ日がある時は「足す」（新しい行は末尾・bookingKey は新しい番号）
//     ⑥ 他の日の保管箱には触らない
//   実行: node arch_unarchive_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8461, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(NL + '■ ' + s);
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

// 日付（14日より前＝保管箱に入る日）
const back = n => { const x = new Date(); x.setDate(x.getDate() - n); return x; };
const dkOf = x => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
const inOf = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const A = back(20), B = back(40);
const A_DK = dkOf(A), A_IN = inOf(A), B_DK = dkOf(B);

// 本番 2026-9-26 で消えた3件と同じ形（custId を持たない手打ちの行）
const row = (name, carType, no, course, idx, seq) => ({
  name, carType, no, course, store: 'honten', staff: '', tokuten: '-', note: '',
  time: '09:00', bookingStatus: 'confirmed', seq, bookingKey: `insp-${A_DK}-${idx}`,
});
const ORIG = [
  row('寺本　明', 'エヴリィ', 4411, 2, 0, 1790131880840),
  row('玉井　久美', 'バンディット', 5522, 3, 1, 1790131880841),
  row('吉岡　太一', 'ワゴンR', 6633, 1, 2, 1790131880842),
];

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'insp-arch']: {
      [A_DK]: ORIG.map(r => ({ ...r })),
      [B_DK]: [{ ...row('山根　愛美', 'アルト', 7744, 2, 0, 1790131880800), bookingKey: `insp-${B_DK}-0` }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  const readKv = k => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), k);

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  const goDay = async (v) => {
    const want = v.slice(0, 7);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-datepick]')].find(e => e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(220);
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : null; });
      if (!cur || cur === want) break;
      await page.click(cur < want ? '[data-mnav="next"]' : '[data-mnav="prev"]');
      await page.waitForTimeout(90);
    }
    const day = await page.$(`[data-day="${v}"]`);
    if (!day) return false;
    await day.click();
    await page.waitForTimeout(400);
    return true;
  };

  // ════════ ① 保管箱にしか無い日も画面に出る ════════
  head('① 保管箱（insp-arch）にしか無い日も画面に出る');
  t('その日へ移れた', await goDay(A_IN));
  await page.waitForTimeout(900);
  const txt1 = await page.evaluate(() => document.body.innerText);
  t('寺本さまが出ている', /寺本/.test(txt1), txt1.slice(0, 300));
  t('玉井さまが出ている', /玉井/.test(txt1));
  t('吉岡さまが出ている', /吉岡/.test(txt1));

  // ════════ ② 引き戻しの実物（トランザクション） ════════
  head('② hubUnarchiveDay（insp と insp-arch を1つのトランザクションで書く）');
  const reach = await page.evaluate(() => typeof hubUnarchiveDay);
  t('画面から引き戻しの処理が呼べる', reach === 'function', reach);
  if (reach !== 'function') {
    console.log(NL + '  ※ hubUnarchiveDay に届かないため、以降の検査は走らせられません');
  } else {
    const ret1 = await page.evaluate(dk => hubUnarchiveDay(dk), A_DK);
    await page.waitForTimeout(800);
    t('引き戻した（true が返る）', ret1 === true, ret1);
    const insp1 = await readKv(STOR + 'insp');
    const arch1 = await readKv(STOR + 'insp-arch');
    const got = ((insp1 || {})[A_DK] || []).filter(r => r && r.name);
    t('insp にその日の3件が入った', got.length === 3, got.map(r => r.name));
    t('保管箱からその日が消えた', !(arch1 || {})[A_DK], Object.keys(arch1 || {}));
    t('1件も失っていない（氏名がそろう）', ORIG.every(o => got.some(g => g.name === o.name)), got.map(r => r.name));
    t('位置が変わっていない', ((insp1 || {})[A_DK] || []).slice(0, 3).every((r, i) => r && r.name === ORIG[i].name), ((insp1 || {})[A_DK] || []).map(r => r && r.name));
    t('代車の紐付け（bookingKey）がそのまま', got.every((r, i) => r.bookingKey === `insp-${A_DK}-${i}`), got.map(r => r.bookingKey));
    t('コース・ナンバーもそのまま', got.every((r, i) => String(r.course) === String(ORIG[i].course) && String(r.no) === String(ORIG[i].no)), got.map(r => [r.course, r.no]));

    head('③ もう一度呼んでも何も起きない');
    const ret2 = await page.evaluate(dk => hubUnarchiveDay(dk), A_DK);
    await page.waitForTimeout(500);
    const insp2 = await readKv(STOR + 'insp');
    t('保管箱に無い日は false（何もしない）', ret2 === false, ret2);
    t('件数は増えも減りもしない', ((insp2 || {})[A_DK] || []).filter(r => r && r.name).length === 3, ((insp2 || {})[A_DK] || []).length);

    head('④ 他の日の保管箱には触らない');
    const arch2 = await readKv(STOR + 'insp-arch');
    const other = ((arch2 || {})[B_DK] || []).filter(r => r && r.name);
    t('別の日（40日前）の1件はそのまま', other.length === 1 && other[0].name === '山根　愛美', other.map(r => r.name));

    head('⑤ insp と保管箱の両方に同じ日がある時は「足す」');
    // わざと両方に置く（古い版のタブが insp に1件だけ書いた状態を作る）
    await page.evaluate(([k1, k2, dk, orig, add]) => {
      window.__fakeFb.set(k2, { [dk]: orig });
      window.__fakeFb.set(k1, { [dk]: [add] });
    }, [STOR + 'insp', STOR + 'insp-arch', A_DK, ORIG.map(r => ({ ...r })), { ...row('吉岡　健', 'バンディット', 7777, 1, 0, 1794107665631) }]);
    await page.waitForTimeout(400);
    const ret3 = await page.evaluate(dk => hubUnarchiveDay(dk), A_DK);
    await page.waitForTimeout(800);
    const insp3 = await readKv(STOR + 'insp');
    const arch3 = await readKv(STOR + 'insp-arch');
    const all = ((insp3 || {})[A_DK] || []).filter(r => r && r.name);
    t('引き戻した（true が返る）', ret3 === true, ret3);
    t('4件になる（元3件＋足した1件）', all.length === 4, all.map(r => r.name));
    t('元の3件が1件も消えない', ORIG.every(o => all.some(g => g.name === o.name)), all.map(r => r.name));
    t('足した1件も残る', all.some(r => r.name === '吉岡　健'), all.map(r => r.name));
    t('元の3件は位置も中身もそのまま', ((insp3 || {})[A_DK] || []).slice(0, 3).every((r, i) => r && r.name === ORIG[i].name && r.bookingKey === `insp-${A_DK}-${i}`));
    t('足した行の bookingKey が新しい番号になる', (((insp3 || {})[A_DK] || [])[3] || {}).bookingKey === `insp-${A_DK}-3`, (((insp3 || {})[A_DK] || [])[3] || {}).bookingKey);
    t('保管箱からその日が消えた', !(arch3 || {})[A_DK], Object.keys(arch3 || {}));

    head('⑥ 引き戻したあとも画面に全員出る');
    await goDay(A_IN);
    await page.waitForTimeout(1200);
    const txt2 = await page.evaluate(() => document.body.innerText);
    t('寺本さまが出ている', /寺本/.test(txt2), txt2.slice(0, 300));
    t('玉井さまが出ている', /玉井/.test(txt2));
    t('吉岡さまが2人とも出ている', (txt2.match(/吉岡/g) || []).length >= 2, (txt2.match(/吉岡/g) || []).length);
  }

  head('⑦ JSエラー');
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  await browser.close();
  server.close();
  console.log(NL + `=== ${pass} 件合格 / ${fail} 件不合格 ===`);
  process.exit(fail ? 1 : 0);
})();
