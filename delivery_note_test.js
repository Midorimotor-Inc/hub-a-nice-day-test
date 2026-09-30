// ①納車日の自動記入 ②納車行の「入庫分」表示 ③三田店ではマッハ車検を出さない の検査（2026-09-29）。
//   ①：翌日以降の納車を設定して保存すると、入庫日の予約の備考に「【10/5 納車】」が入る。
//       当日納車に戻すと自動で消える。手で書いた文章は残る。
//   ②：納車日のタイムスケジュールに「MM/DD 入庫分 → 納車」と出る（以前は「MM/DD 予定」）。
//   ③：三田店の画面で車検を取る時、コースに「マッハ車検」が出ない（本店では出る）。
//   実行: node delivery_note_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8217, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s, root) => page.evaluate(([x, r]) => { const sc = r ? document.querySelector(r) : document; if (!sc) return false; const b = [...sc.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, [s, root || null]);
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
const nx = new Date(Y, M, D + 1);
const pv = new Date(Y, M, D - 1);
const DK_P = pv.getFullYear() + '-' + (pv.getMonth() + 1) + '-' + pv.getDate();
const DK_N = `${nx.getFullYear()}-${nx.getMonth() + 1}-${nx.getDate()}`;
const IN_N = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`;
const MD_N = `${nx.getMonth() + 1}/${nx.getDate()}`;

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [{ name: '原村', carType: 'シエンタ', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed', note: '' }] },
    [STOR + 'honten-sched']: { [DK]: { '10:00': { id: 11, name: '相原', carType: 'ワゴンR', work: 'オイル', content: '' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
    [STOR + 'sanda-staff-v2']: [{ uid: 's10', name: '藤原昭人', myNumber: 10, badge: 'inspector', store: 'sanda' }],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, (process.env.SRC && p === 'index_dev.html') ? process.env.SRC : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
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
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000);
  await clickText(page, 'このまま使う');   // 全画面の案内が出ていたら閉じる
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  t('その日の車検が出ている', await seeText(page, '原村', 15000));

  // ── ① 車検：翌日納車にすると備考へ自動で入る ──
  console.log('\n■ ① 納車日を備考へ自動で書く（車検）');
  await page.click('td:has-text("原村")', { timeout: 8000 }).catch(() => {});
  const openedCard = await seeText(page, '車検予約カード', 8000);
  t('予約カードが開く', openedCard, await page.evaluate(() => ({ text: document.body.innerText.slice(0, 260), modals: document.querySelectorAll('.booking-modal-inner').length })));
  // 納車日は専用のカレンダーで選ぶ（input[type=date] ではない）
  const pickDelivery = async (day, nextMonth) => page.evaluate(([d, nm]) => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const btn = [...box.querySelectorAll('button')].find(b => b.innerText.includes('納車日を設定する'));
    if (btn) btn.click();
    return true;
  }, [day, nextMonth]).then(async ok => {
    if (!ok) return false;
    await new Promise(r => setTimeout(r, 400));
    // 月をまたぐ時は先に「›」で翌月へ送り、描き直しを待ってから日を押す
    if (nextMonth) {
      await page.evaluate(() => {
        const box = document.querySelector('.booking-modal-inner'); if (!box) return;
        const pick = [...box.querySelectorAll('div')].find(e => e.style && e.style.zIndex === '9999'); if (!pick) return;
        const nx = [...pick.querySelectorAll('button')].find(b => b.innerText.trim() === '›'); if (nx) nx.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }
    return page.evaluate(d => {
      const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
      const pick = [...box.querySelectorAll('div')].find(e => e.style && e.style.zIndex === '9999');
      if (!pick) return false;
      const cells = [...pick.querySelectorAll('div')].filter(e => e.innerText.trim() === String(d) && e.style && e.style.cursor === 'pointer');
      const c = cells[cells.length - 1];
      if (!c) return false;
      c.click(); return true;
    }, day);
  });
  t('納車日を「翌日」に設定できた', await pickDelivery(nx.getDate(), nx.getMonth() !== M));
  await page.waitForTimeout(400);
  const btns = await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); return box ? [...box.querySelectorAll('button')].map(b => b.innerText.replace(/s+/g, ' ').trim()).filter(Boolean).slice(-8) : []; });
  const clickedSave = await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); if (!box) return false; const b = [...box.querySelectorAll('button')].find(x => /確定|保存/.test(x.innerText)); if (b) { b.click(); return b.innerText.replace(/s+/g,' ').trim(); } return false; });
  t('保存ボタンを押せた', !!clickedSave, { clickedSave, btns });
  await page.waitForTimeout(1500);
  t('車検の備考に「' + MD_N + ' 納車」が自動で入る', await page.waitForFunction(([k, dk, md]) => {
    const rows = (window.__fakeFb.get(k + 'insp') || {})[dk] || [];
    return rows.some(r => r && r.name === '原村' && String(r.note || '').indexOf('【' + md + ' 納車】') === 0);
  }, [STOR, DK, MD_N], { timeout: 15000 }).then(() => true).catch(() => false), await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).map(r => r && r.note), [STOR, DK]));

  // ② 納車日の側に「入庫分 → 納車」と出る（前の日に入庫して、今日が納車日の整備で確認）
  console.log('\n■ ②「MM/DD 入庫分 → 納車」の表示（整備）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.evaluate(([k, dkPrev, dkToday]) => {
    const v = window.__fakeFb.get(k + 'honten-sched') || {};
    const next = Object.assign({}, v);
    next[dkPrev] = Object.assign({}, v[dkPrev], { '10:00': { id: 21, name: '上野', carType: 'アルト', work: '点検', content: '', deliveryDate: dkToday, deliveryTime: '16:00' } });
    window.__fakeFb.set(k + 'honten-sched', next);
  }, [STOR, DK_P, DK]);
  await page.waitForTimeout(2500);
  const label = await page.evaluate(() => { const m = document.body.innerText.match(/\d+\/\d+ (入庫分|予定)/); return m ? m[0] : ''; });
  t('「入庫分」と出る（以前の「予定」ではない）', /入庫分/.test(label), { label, text: await page.evaluate(() => document.body.innerText.slice(0, 400)) });

  // ③ 三田店ではマッハ車検を出さない
  console.log('\n■ ③ 三田店ではマッハ車検を出さない');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '三田店'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  await page.click('td:has-text("クリックして追加")', { timeout: 8000 }).catch(() => {});
  const okSanda = await seeText(page, '車検予約カード', 8000);
  const sandaCourses = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return [];
    return [...box.querySelectorAll('button')].map(b => b.innerText.replace(/\s/g, '')).filter(x => /車検$/.test(x));
  });
  t('三田店の予約カードにマッハ車検が無い', okSanda && sandaCourses.length > 0 && !sandaCourses.some(x => x.includes('マッハ')), { sandaCourses, okSanda, text: await page.evaluate(() => document.body.innerText.slice(0, 200)) });
  t('クイック・レギュラーは出る', sandaCourses.some(x => x.includes('クイック')) && sandaCourses.some(x => x.includes('レギュラー')), sandaCourses);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('✕') || e.getAttribute('aria-label') === 'close'); if (b) b.click(); });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '本店'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.click('td:has-text("クリックして追加")', { timeout: 8000 }).catch(() => {});
  await seeText(page, '車検予約カード', 8000);
  const hontenCourses = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return [];
    return [...box.querySelectorAll('button')].map(b => b.innerText.replace(/\s/g, '')).filter(x => /車検$/.test(x));
  });
  t('本店ではマッハ車検が出る', hontenCourses.some(x => x.includes('マッハ')), hontenCourses);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-delivery-note.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
