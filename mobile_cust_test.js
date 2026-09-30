// 顧客の「横断検索（索引）」と、スマホの顧客タブ・リストからの予約の検査（v2.98）。
// にせの firebase を使い、本物には繋がない。
//   ・PC（customers.html）：🗂 索引を作り直す → cf-search-index / chunk ができる
//     「全月から探す」で別の月の人を引き当て、その月のタブに切り替わる
//   ・スマホ（mobile.html）：顧客タブは「探す」から始まる。索引で24ヶ月ぶんを横断、
//     電話の下4桁でも引ける。同じ人は1件にまとめ「前回」を出す。
//     タップするとその月のファイルだけ読んで詳細（電話は tel: で発信）。
//   ・予約：本予約は insp／顧客ファイル／custbk の3つが揃う。仮予約は insp に載せない。
//   ・休業日・台数制限の日は予約できない。
//   実行: node mobile_cust_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8177, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const clickTab = (page, s) => page.evaluate(x => { const d = [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && e.style && e.style.borderRadius.indexOf('10px 10px') === 0 && e.innerText.includes(x)); if (d) { d.click(); return true; } return false; }, s);
const clickRow = (page, name) => page.evaluate(n => { const r = [...document.querySelectorAll('div')].find(e => e.innerText && e.innerText.startsWith(n) && e.style && e.style.borderBottom); if (r) { r.click(); return true; } return false; }, name);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const EGAWA = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([k, me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = Object.assign(st['meta/allowed'] || {}, { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } });
  st['devices/dev-' + me.uid] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: 'テスト機', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-' + me.uid);
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
// 予約する日は「来月の10日から、休業日でない最初の日」。休業日は「来月の11日」。
//   10日に固定していると、その日が第2火曜（会社の休業日・アプリに元から入っている決まり）に
//   当たった月に落ちるため（2026年11月10日がそれ）。
const now = new Date();
const isSecondTue = (y, m, d) => { const dt = new Date(y, m, d); return dt.getDay() === 2 && d >= 8 && d <= 14; };
const pickBookDay = () => {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  for (let d = 10; d <= 25; d++) {
    if (d === 11) continue;                   // 検査で休業日にする日
    if (isSecondTue(y, m, d)) continue;       // 第2火曜は会社の休業日
    return new Date(y, m, d);
  }
  return new Date(y, m, 10);
};
const B = pickBookDay();
const BDK = `${B.getFullYear()}-${B.getMonth() + 1}-${B.getDate()}`;
const BIN = `${B.getFullYear()}-${String(B.getMonth() + 1).padStart(2, '0')}-${String(B.getDate()).padStart(2, '0')}`;
const CLOSED = new Date(now.getFullYear(), now.getMonth() + 1, 11);
const CLOSED_DK = `${CLOSED.getFullYear()}-${CLOSED.getMonth() + 1}-${CLOSED.getDate()}`;
const CLOSED_IN = `${CLOSED.getFullYear()}-${String(CLOSED.getMonth() + 1).padStart(2, '0')}-11`;
const cust = (i, o) => Object.assign({
  custId: 'c' + i, rowIdx: i, expiry: '2026-11-30', name: '', no: 1000 + i, carType: '', phoneHome: '', phoneMobile: '',
  address: '三田市けやき台1-2-3', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-',
  course: null, store: 'honten', staff: '', note: '', status: '', bookingTime: '', linkedInspDate: '',
}, o);

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p === 'mobile.html' || p === 'customers.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  // 202610＝今回のDM／202410＝2年前の同じ人（鎌田さん）が載っている月
  const seed = {
    [STOR + 'insp']: { [BDK]: [{ name: '先客さん', carType: 'タント', course: 2, store: 'honten', seq: 1, time: '09:00', bookingStatus: 'confirmed' }] },
    [STOR + 'honten-sched']: { [BDK]: { '10:00': { name: '整備太郎', carType: 'ヴィッツ', work: 'オイル', content: 'オイル交換' } } },
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdate']: [CLOSED_DK], [STOR + 'honten-cdow']: [],
    [STOR + 'cf-index']: [{ name: '202610', count: 3 }, { name: '202410', count: 1 }],
    [STOR + 'cf-202610-index']: { name: '202610', total: 3, chunks: 1 },
    [STOR + 'cf-202610-chunk-0']: [
      cust(1, { name: '井上花子', carType: 'ハスラー', phoneMobile: '090-1111-2222' }),
      cust(2, { name: '椿三十郎', carType: 'ジムニー', phoneHome: '079-555-6666', status: 'confirm', entryDate: BDK, bookingTime: '11:00' }),
      cust(3, { name: '鎌田五郎', carType: 'アルト', no: 1187, phoneMobile: '090-3333-1234' }),
    ],
    [STOR + 'cf-202410-index']: { name: '202410', total: 1, chunks: 1 },
    [STOR + 'cf-202410-chunk-0']: [cust(9, { name: '鎌田五郎', carType: 'アルト', no: 1187, phoneMobile: '090-3333-1234', status: 'confirm', entryDate: '2024-10-20' })],
  };
  // スマホの検査では「PC で索引を作ったあと」の状態から始める
  const cfx = r => ({ n: r.name, c: r.carType, no: (r.no == null ? '' : r.no), p: [r.phoneMobile, r.phoneHome].filter(Boolean).join('/'), e: r.expiry || '', f: r.f, i: r.custId });
  const seedMobile = Object.assign({}, seed, {
    [STOR + 'cf-search-index']: { built: Date.now(), total: 4, chunks: 1, files: ['202610', '202410'] },
    [STOR + 'cf-search-chunk-0']: [
      ...seed[STOR + 'cf-202610-chunk-0'].map(r => cfx(Object.assign({}, r, { f: '202610' }))),
      ...seed[STOR + 'cf-202410-chunk-0'].map(r => cfx(Object.assign({}, r, { f: '202410' }))),
    ],
  });
  const routeFakeFbWith = (ctx, data) => ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(data) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  const routeGas = ctx => ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('[BABEL]') < 0 && m.text().indexOf('deoptimised') < 0) errs.push(m.text().slice(0, 200)); }); page.on('dialog', async d => { await d.accept().catch(() => {}); }); return errs; };
  const kv = (page, k) => page.evaluate(k => window.__fakeFb.get(k), k);

  // ══ 1. PC：索引を作る ══
  console.log('\n■ PC（顧客リスト）：索引');
  let pcErrs = [];
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
    await routeFakeFbWith(ctx, seed); await routeGas(ctx);
    const page = await ctx.newPage(); pcErrs = watch(page);
    await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
    t('顧客リストが開く（2ヶ月ぶん）', await seeText(page, '202610', 25000) && await seeText(page, '202410', 10000));
    t('索引がまだ無いと知らせる', await seeText(page, '索引がまだありません', 8000), await page.evaluate(() => document.body.innerText.slice(0, 300)));
    await clickText(page, '索引を作り直す');
    t('索引ができる（cf-search-index）', await page.waitForFunction(k => { const m = window.__fakeFb.get(k + 'cf-search-index'); return m && m.total === 4 && m.chunks === 1; }, STOR, { timeout: 20000 }).then(() => true).catch(() => false), await kv(page, STOR + 'cf-search-index'));
    t('索引の中身は氏名・車種・No・電話・満了日・月だけ（予約状況は入れない）', await page.evaluate(k => {
      const a = window.__fakeFb.get(k + 'cf-search-chunk-0') || [];
      const r = a.find(x => x.n === '井上花子');
      return !!r && r.c === 'ハスラー' && r.p === '090-1111-2222' && r.f === '202610' && !('status' in r) && !('entryDate' in r);
    }, STOR), await kv(page, STOR + 'cf-search-chunk-0'));
    await page.fill('input[placeholder*="電話は下4桁"]', '1234');
    t('全月から探す：電話の下4桁で出る', await seeText(page, '鎌田五郎', 8000));
    t('同じ人は1件にまとめ、前回の月も出す', await page.evaluate(() => { const t = document.body.innerText; return t.includes('202610') && t.includes('前回 202410'); }), await page.evaluate(() => document.body.innerText.slice(-400)));
    await page.evaluate(() => { const r = [...document.querySelectorAll('div')].find(e => e.innerText && e.innerText.startsWith('鎌田五郎') && e.style && e.style.cursor === 'pointer'); if (r) r.click(); });
    t('クリックするとその月（202610）に切り替わり、その人で絞り込まれる', await page.waitForFunction(() => { const i = [...document.querySelectorAll('input')].find(e => (e.placeholder || '').includes('氏名・ナンバー')); return !!i && i.value === '鎌田五郎'; }, null, { timeout: 8000 }).then(() => true).catch(() => false));
    t('PC：画面のエラーなし', pcErrs.length === 0, pcErrs.slice(0, 3));
    await page.screenshot({ path: path.join(DIR, 'smoke-cust-pc-index.png') });
    await ctx.close();
  }

  // ══ 2. スマホ ══
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(signedInInit, [0, EGAWA, STOR]);
  await routeFakeFbWith(ctx, seedMobile); await routeGas(ctx);
  const page = await ctx.newPage(); const errs = watch(page);
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 20000);

  console.log('\n■ スマホ：顧客タブ＝まず探す');
  t('下のタブに「顧客」がある（代車と休日の間）', await clickTab(page, '顧客') && await page.evaluate(() => { const tabs = [...document.querySelectorAll('div')].filter(e => e.style && e.style.borderRadius.indexOf('10px 10px') === 0).map(e => e.innerText.replace(/\s/g, '')).join(','); return tabs.indexOf('代車') < tabs.indexOf('顧客') && tabs.indexOf('顧客') < tabs.indexOf('休日'); }));
  t('「探す」から始まる', await page.waitForFunction(() => !![...document.querySelectorAll('input')].find(e => (e.placeholder || '').includes('氏名・電話')), null, { timeout: 10000 }).then(() => true).catch(() => false));
  t('何ヶ月ぶん・何件から探すかが出る', await seeText(page, '2ヶ月ぶん・4件から探します', 10000), await page.evaluate(() => document.body.innerText.slice(0, 400)));
  await page.fill('input[placeholder*="氏名・電話"]', '1234');
  t('電話の下4桁で出る', await seeText(page, '鎌田五郎', 8000));
  t('同じ人は1件にまとめ、今回の月と前回を出す', await page.evaluate(() => { const t = document.body.innerText; return (t.match(/鎌田五郎/g) || []).length === 1 && t.includes('202610') && t.includes('前回 202410'); }), await page.evaluate(() => document.body.innerText.slice(0, 500)));
  await page.fill('input[placeholder*="氏名・電話"]', 'ハスラー');
  t('車種でも出る', await seeText(page, '井上花子', 8000));
  await clickRow(page, '井上花子');
  t('タップするとその月だけ読んで詳細が出る', await seeText(page, '満了日', 10000) && await seeText(page, '今回のDM', 3000));
  t('電話はタップで発信（tel:）', await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(e => (e.getAttribute('href') || '').startsWith('tel:')); return !!a && a.getAttribute('href') === 'tel:09011112222'; }));
  await page.screenshot({ path: path.join(DIR, 'smoke-cust-find.png') });

  console.log('\n■ スマホ：月ごと（DM）も今までどおり');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('✕')); if (b) b.click(); });
  await clickText(page, '月ごと（DM）');
  t('月のチップが出る', await seeText(page, '202410', 8000));
  t('その月の人が出る（読み込みはその1本だけ）', await seeText(page, '椿三十郎', 25000), await page.evaluate(() => document.body.innerText.slice(0, 400)));
  t('予約済みの人に印が付く', await page.evaluate(() => { const t = document.body.innerText; return t.includes('予約済'); }));
  await clickText(page, '未予約');
  t('「未予約」で絞ると予約済みの人は消える', await page.waitForFunction(() => !document.body.innerText.includes('椿三十郎') && document.body.innerText.includes('井上花子'), null, { timeout: 8000 }).then(() => true).catch(() => false));
  await clickText(page, 'すべて');
  await page.screenshot({ path: path.join(DIR, 'smoke-cust-month.png') });

  console.log('\n■ 予約できない日');
  await clickRow(page, '井上花子');
  await seeText(page, '満了日', 8000);
  await clickText(page, 'この方を予約する');
  await page.fill('input[type="date"]', CLOSED_IN);
  t('休業日を選ぶと知らせが出て、ボタンが押せない', await seeText(page, '休業日です', 6000) && await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('本予約')); return !!b && b.disabled; }));

  console.log('\n■ 仮予約');
  await page.fill('input[type="date"]', BIN);
  await clickText(page, '仮予約だけ入れる');
  t('顧客ファイルが「仮予約」になる', await page.waitForFunction(k => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c1'); return c && c.status === 'temp'; }, STOR, { timeout: 15000 }).then(() => true).catch(() => false), await kv(page, STOR + 'cf-202610-chunk-0'));
  t('予約枠（custbk）に仮予約として残る', await page.waitForFunction(([k, dk]) => { const e = (window.__fakeFb.get(k + 'custbk') || {})['井上花子::' + dk]; return e && e.status === 'provisional'; }, [STOR, BDK], { timeout: 10000 }).then(() => true).catch(() => false));
  t('スケジュール（insp）には載らない', await page.evaluate(([k, dk]) => !((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '井上花子'), [STOR, BDK]));

  console.log('\n■ 本予約');
  await clickTab(page, '顧客');
  await clickText(page, '月ごと（DM）');
  await seeText(page, '井上花子', 10000);
  await clickRow(page, '井上花子');
  await seeText(page, '満了日', 8000);
  await clickText(page, '予約を入れ直す') || await clickText(page, 'この方を予約する');
  await page.fill('input[type="date"]', BIN);
  await clickText(page, '本予約');
  t('いつもの車検の入力画面が、名前・車種入りで開く', await seeText(page, '井上花子', 8000) && await page.evaluate(() => !![...document.querySelectorAll('input')].find(e => e.value === 'ハスラー')));
  await clickText(page, 'クイック車検');
  await page.evaluate(() => { const sel = [...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === '13:30')); if (sel) { const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; setter.call(sel, '13:30'); sel.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(300);
  await clickText(page, '予約確定');
  await page.waitForTimeout(800);
  const modalText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  t('スケジュール（insp）に入る', await page.waitForFunction(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '井上花子' && r.bookingStatus === 'confirmed'), [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false), modalText);
  t('先客さんの予約は消えていない', await page.evaluate(([k, dk]) => ((window.__fakeFb.get(k + 'insp') || {})[dk] || []).some(r => r && r.name === '先客さん'), [STOR, BDK]));
  t('顧客ファイルが「予約済」になり、入庫日が入る', await page.waitForFunction(([k, dk]) => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c1'); return c && c.status === 'confirm' && c.entryDate === dk; }, [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false), await kv(page, STOR + 'cf-202610-chunk-0'));
  t('同じチャンクの他の人（椿さん）は壊れていない', await page.evaluate(k => { const c = (window.__fakeFb.get(k + 'cf-202610-chunk-0') || []).find(x => x.custId === 'c2'); return !!c && c.name === '椿三十郎' && c.status === 'confirm'; }, STOR));
  t('予約枠（custbk）が本予約になる', await page.waitForFunction(([k, dk]) => { const e = (window.__fakeFb.get(k + 'custbk') || {})['井上花子::' + dk]; return e && e.status === 'confirmed'; }, [STOR, BDK], { timeout: 20000 }).then(() => true).catch(() => false));
  t('索引は予約では書き換わらない（月ファイルが正）', await page.evaluate(k => { const m = window.__fakeFb.get(k + 'cf-search-index'); return m && m.total === 4; }, STOR));

  console.log('\n■ 検索（🔍）も索引から');
  await clickText(page, '🔍');
  await seeText(page, '氏名・車種・顧客No・電話', 8000);
  await page.fill('input[placeholder*="セリエ"]', '1234');
  t('🔍 検索の「顧客」も24ヶ月ぶんの索引から出る', await seeText(page, '鎌田五郎', 10000), await page.evaluate(() => document.body.innerText.slice(0, 400)));
  await page.fill('input[placeholder*="セリエ"]', '先客');
  t('車検の予約も今までどおり出る', await seeText(page, '先客さん', 8000));

  t('スマホ：画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-mobile-cust.png') });
  await ctx.close();
  await browser.close(); server.close();
  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  成功 ${pass} / 失敗 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
