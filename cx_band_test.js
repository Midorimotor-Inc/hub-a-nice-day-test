// 2026-11-16 ユーザー決定「キャンセル／日にち変更の帯」を見張る検査
//   ① キャンセル＝A案（1行・薄い赤 #fee2e2）。「キャンセル」＋取り消した日＋担当者＋お名前（取り消し線）
//   ② 日にち変更＝ウ案（1行・濃い赤 #dc2626 に白ぬき）。「日にち変更」＋【元の日 → 移った日】＋担当者
//   ③ 車検カレンダーのマスには出さない（1日表示だけ）
//   ★帯は 1〜6番の【下】に番号なしで並ぶ。台数にも6コマにも数えない。
//   ★予約カードの「🗑 予約を取り消す」で、予約が【消えずに帯になる】こと。
//   ★顧客リストでキャンセルにしたら、スケジュールの予約も帯になること（リスト→スケジュール）。
//   実行: node cx_band_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8493, STOR = 'hub-v8-dev-';
const CX_BG = 'rgb(254, 226, 226)';   // #fee2e2
const MV_BG = 'rgb(220, 38, 38)';     // #dc2626
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

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
  try { sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: me.uid, name: me.name, store: { id: me.store }, role: me.role, email: me.email })); } catch (e) {}
};
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

const N = new Date();
const d = (plus) => { const x = new Date(N); x.setDate(x.getDate() + plus); return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() }; };
const dk = (o) => o.y + '-' + o.m + '-' + o.d;
const T0 = d(0), TO = d(34);                      // 今日／移り先の日
const DK0 = dk(T0), DKTO = dk(TO);
const MD = (o) => o.m + '/' + o.d;

// ① 生きている予約2件 ② すでに帯のキャンセル1件 ③ すでに帯の日にち変更1件
const ROWS = [
  { name: '客1', carType: 'タント', no: '1111', course: 2, time: '09:00', store: 'honten', seq: 1, bookingStatus: 'confirmed', custId: 'C1' },
  { name: '客2', carType: 'ワゴンR', no: '2222', course: 2, time: '11:00', store: 'honten', seq: 2, bookingStatus: 'confirmed', custId: 'C2' },
  { name: '客3', carType: 'スイフト', no: '3333', course: 2, time: '10:30', store: 'honten', seq: 3, bookingStatus: 'cancelled', custId: 'C3', note: '都合が悪くなった', cxAt: DK0, cxBy: '魚住', cxFrom: DK0, cxTo: '' },
  { name: '客4', carType: 'フィット', no: '4444', course: 2, time: '09:30', store: 'honten', seq: 4, bookingStatus: 'cancelled', custId: 'C4', cxAt: DK0, cxBy: '見取', cxFrom: DK0, cxTo: DKTO },
];

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK0]: ROWS },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: [], [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {}, [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
    [STOR + 'cf-index']: [{ name: '202701', count: 1 }],
    [STOR + 'cf-202701-index']: { name: '202701', chunks: 1, total: 1 },
    [STOR + 'cf-202701-chunk-0']: [{ custId: 'C2', name: '客2', no: '2222', carType: 'ワゴンR', expiry: '2027-01-20', status: 'confirm', entryDate: DK0.split('-')[0] + '-' + String(T0.m).padStart(2, '0') + '-' + String(T0.d).padStart(2, '0'), linkedInspDate: '', course: 2, store: 'honten', note: '' }],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;').replace(/const AUTH_REQUIRED=(true|false);/, 'const AUTH_REQUIRED=false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', dd => dd.accept());

  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.waitForTimeout(900);
  const toDay = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.indexOf('スケジュール') >= 0 && e.offsetParent !== null && e.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
    await page.waitForTimeout(1600);
  };
  await toDay();

  // ── ① 帯が出る／番号なし／1〜6番の下 ─────────────────────────────
  head('① 帯が1日表示に出る（番号なし・1〜6番の下）');
  const band = await page.evaluate(() => {
    const all = [...document.querySelectorAll('table tbody tr')];
    const cx = [...document.querySelectorAll('tr[data-cxband]')];
    const info = cx.map(r => {
      const td0 = r.querySelector('td'), td1 = r.querySelectorAll('td')[1];
      return {
        kind: r.getAttribute('data-cxband'),
        mark: td0 ? td0.innerText.replace(/\s/g, '') : '',
        bg: td0 ? getComputedStyle(td0).backgroundColor : '',
        fg: getComputedStyle(r.querySelector('[data-cxtitle]')).color,
        title: r.querySelector('[data-cxtitle]') ? r.querySelector('[data-cxtitle]').innerText : '',
        date: r.querySelector('[data-cxdate]') ? r.querySelector('[data-cxdate]').innerText.replace(/\s/g, '') : '',
        by: r.querySelector('[data-cxby]') ? r.querySelector('[data-cxby]').innerText.replace(/\s/g, '') : '',
        nm: r.querySelector('[data-cxnm]') ? r.querySelector('[data-cxnm]').innerText.replace(/\s/g, '') : '',
        strike: r.querySelector('[data-cxnm]') ? getComputedStyle(r.querySelector('[data-cxnm]')).textDecorationLine : '',
        cols: td1 ? td1.getAttribute('colspan') : '',
        at: all.indexOf(r), h: r.getBoundingClientRect().height,
        txt: r.innerText.replace(/\s/g, ''),
      };
    });
    // 生きている行（番号が付いている行）の位置
    const live = all.filter(r => !r.hasAttribute('data-cxband') && /客[12]/.test(r.innerText)).map(r => all.indexOf(r));
    const rowH = all.filter(r => !r.hasAttribute('data-cxband') && /客1/.test(r.innerText)).map(r => r.getBoundingClientRect().height)[0] || 0;
    return { info, live, rowH };
  });
  t('キャンセルの帯が1つ出る', band.info.filter(x => x.kind === 'cancel').length === 1, band.info);
  t('日にち変更の帯が1つ出る', band.info.filter(x => x.kind === 'move').length === 1, band.info);
  const cxB = band.info.find(x => x.kind === 'cancel') || {}, mvB = band.info.find(x => x.kind === 'move') || {};
  t('★帯は1〜6番の【下】にある', band.live.length === 2 && cxB.at > Math.max(...band.live) && mvB.at > Math.max(...band.live), { live: band.live, cx: cxB.at, mv: mvB.at });
  t('★番号は付いていない（✕ / ⇄ だけ）', cxB.mark === '✕' && mvB.mark === '⇄', [cxB.mark, mvB.mark]);
  t('★1行型（残りの7列をまとめている）', cxB.cols === '7' && mvB.cols === '7', [cxB.cols, mvB.cols]);
  t('★行の高さがふつうの行とほぼ同じ（印刷の1枚が崩れない）', band.rowH > 0 && cxB.h <= band.rowH + 12 && mvB.h <= band.rowH + 12, { rowH: band.rowH, cx: cxB.h, mv: mvB.h });

  head('② キャンセルの帯＝A案（薄い赤・取り消した日・担当者・取り消し線）');
  t('★地色が #fee2e2', cxB.bg === CX_BG, cxB.bg);
  t('「キャンセル」と大きく出る', /キャンセル/.test(cxB.title || ''), cxB.title);
  t('★取り消した日が出る', (cxB.date||'').indexOf(MD(T0) + 'に取消') >= 0, cxB.date);
  t('★担当者が出る', (cxB.by||'').indexOf('魚住') >= 0, cxB.by);
  t('お名前に「様」が付く', /客1様|客3様/.test(cxB.nm||'') || (cxB.nm||'').indexOf('客3') >= 0, cxB.nm);
  t('★お名前に取り消し線', /line-through/.test(cxB.strike || ''), cxB.strike);
  t('入庫時間と備考も出る', (cxB.txt||'').indexOf('10:30') >= 0 && (cxB.txt||'').indexOf('都合が悪くなった') >= 0, cxB.txt);

  head('③ 日にち変更の帯＝ウ案（濃い赤に白ぬき・元の日 → 移った日・担当者）');
  t('★地色が #dc2626（濃い赤）', mvB.bg === MV_BG, mvB.bg);
  t('★文字が白ぬき', mvB.fg === 'rgb(255, 255, 255)', mvB.fg);
  t('「日にち変更」と大きく出る', /日にち変更/.test(mvB.title || ''), mvB.title);
  t('★元の日 → 移った日 の形で出る', mvB.date === MD(T0) + '→' + MD(TO), { got: mvB.date, want: MD(T0) + '→' + MD(TO) });
  t('★担当者が出る', (mvB.by||'').indexOf('見取') >= 0, mvB.by);

  head('④ 台数にも6コマにも数えない（台数ロジックは触っていない）');
  const cnt = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].map(e => (e.innerText || '').replace(/s/g, '')).find(s => s.indexOf('車検') >= 0) || '';
    const live = [...document.querySelectorAll('table tbody tr')].filter(r => !r.hasAttribute('data-cxband') && /客[0-9]/.test(r.innerText)).length;
    return { h, live };
  });
  t('★番号が付く行は生きている2件だけ', cnt.live === 2, cnt);
  // 車検カレンダー（③ C案＝マスには出さない）
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === 'カレンダー' || /^📅?\s*カレンダー$/.test((e.innerText || '').trim())); if (b) b.click(); });
  await page.waitForTimeout(1500);
  const cal = await page.evaluate(() => document.body.innerText);
  t('★車検カレンダーのマスに帯の人は出さない（C案）', cal.indexOf('客3') < 0 && cal.indexOf('客4') < 0);
  t('★カレンダーのマスに帯の印（⇄）も出さない', cal.indexOf('⇄') < 0);

  // ── ⑤ 予約カードの「予約キャンセル」で、消えずに帯になる ───────────
  head('⑤ 予約カードの「🗑 予約を取り消す」で、消えずに帯になる');
  await toDay();
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('tr')].find(x => !x.hasAttribute('data-cxband') && x.innerText.indexOf('客1') >= 0);
    if (r) { const tds = [...r.querySelectorAll('td')]; const td = tds.find(c => getComputedStyle(c).cursor === 'pointer' && c.innerText.indexOf('客1') >= 0) || tds.find(c => c.innerText.indexOf('客1') >= 0); if (td) td.click(); }
  });
  await page.waitForTimeout(1200);
  t('予約カードが開く', await seeText(page, '予約を取り消す', 8000));
  await clickText(page, '予約を取り消す');
  await page.waitForTimeout(2500);
  await toDay();
  const after = await page.evaluate(() => {
    const cx = [...document.querySelectorAll('tr[data-cxband]')].map(r => ({ kind: r.getAttribute('data-cxband'), txt: r.innerText.replace(/\s/g, ''), by: r.querySelector('[data-cxby]') ? r.querySelector('[data-cxby]').innerText : '' }));
    const live = [...document.querySelectorAll('table tbody tr')].filter(r => !r.hasAttribute('data-cxband') && /客1/.test(r.innerText)).length;
    return { cx, live };
  });
  t('★客1 が帯になった（消えていない）', after.cx.some(x => x.kind === 'cancel' && x.txt.indexOf('客1') >= 0), after.cx);
  t('★客1 の生きている行は無くなった', after.live === 0, after);
  t('★取り消した人は「サインインしている人」', after.cx.some(x => x.txt.indexOf('客1') >= 0 && x.by.indexOf('江川京志') >= 0), after.cx);
  const srv = await page.evaluate((s) => { try { return window.__fakeFb.get(s + 'insp'); } catch (e) { return null; } }, STOR);
  const srow = srv ? [].concat(...Object.values(srv).filter(Array.isArray)).find(r => r && r.name === '客1') : null;
  t('★サーバーにも帯として残っている（行が消えていない）', !!srow && srow.bookingStatus === 'cancelled' && !!srow.cxAt, srow);
  t('★顧客リストへは cancel の知らせが積まれる', await page.evaluate((s) => {
    let q = null; try { q = window.__fakeFb.get(s + 'cust-updates'); } catch (e) {}
    return Array.isArray(q) && q.some(u => u && u.custId === 'C1' && u.status === 'cancel');
  }, STOR));
  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));

  // ── ⑥ 顧客リストでキャンセル → スケジュールも帯になる ───────────────
  head('⑥ 顧客リストでキャンセル → スケジュールの予約も帯になる');
  const cpage = await ctx.newPage();
  const cerrs = []; cpage.on('pageerror', e => cerrs.push(String(e)));
  cpage.on('dialog', dd => dd.accept());
  const clog = []; cpage.on('console', m => { const s = m.text(); if (s.indexOf('[CX]') >= 0 || m.type() === 'error') clog.push(s); });
  await cpage.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  const opened = await seeText(cpage, '客2', 30000);
  t('顧客リストが開く', opened);
  if (opened) {
    await cpage.waitForTimeout(1200);
    await cpage.evaluate(() => { const b = document.querySelector('[data-bandedit]'); if (b) b.click(); });
    await cpage.waitForTimeout(600);
    const okBand = await cpage.evaluate(() => { const b = document.querySelector('[data-bandpick="cancel"]'); if (b) { b.click(); return true; } return false; });
    t('帯の窓でキャンセルを選べる', okBand);
    await cpage.waitForTimeout(500);
    await cpage.evaluate(() => { const b = document.querySelector('[data-bandyes]'); if (b) b.click(); });
    await cpage.waitForTimeout(3000);
    const ins = await cpage.evaluate((s) => { try { return window.__fakeFb.get(s + 'insp'); } catch (e) { return null; } }, STOR);
    const r2 = ins ? [].concat(...Object.values(ins).filter(Array.isArray)).find(r => r && r.name === '客2') : null;
    t('★スケジュール側の客2 が帯になった（行は消えていない）', !!r2 && r2.bookingStatus === 'cancelled' && !!r2.cxAt, r2);
    t('★帯を付けた人が残る', !!r2 && r2.cxBy === '江川京志', r2 && r2.cxBy);
    const lst = await cpage.evaluate((s) => { try { return (window.__fakeFb.get(s + 'cf-202701-chunk-0') || [])[0]; } catch (e) { return null; } }, STOR);
    t('★リスト側も赤（キャンセル）になる', !!lst && lst.status === 'cancel', lst);
    t('リスト側のJSエラーなし', cerrs.length === 0, cerrs.slice(0, 3));
    if (clog.length) console.log('    （リストの言い分）' + clog.slice(0, 4).join(' / '));
  }

  // ── ⑦ 中身の見張り ────────────────────────────────────────────
  head('⑦ 中身の見張り（台数・紙・控えから帯を外しているか）');
  const SI = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const SC = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const SM = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const SP = fs.readFileSync(path.join(DIR, 'hub_paper.js'), 'utf8');
  t('★帯の行は「空き」として使い回さない', SI.indexOf('!cxIsTrace(r)&&(!r||!r.name') >= 0);
  t('★オフライン予定表の控えから帯を外している', SI.indexOf("const inspAll=(inspData[dk]||[]).filter(r=>r&&r.name&&r.bookingStatus!=='cancelled')") >= 0);
  t('★対応可能チェック（枠別の台数）から帯を外している', SI.indexOf("!r.pendingApproval&&r.bookingStatus!=='cancelled'&&(r.store===vsId") >= 0);
  t('★紙の控えから帯を外している', SP.indexOf("r && r.name && r.bookingStatus !== 'cancelled'") >= 0);
  t('★印刷は生きている予約と帯を分けている', SI.indexOf('const liveInsp = sortedInsp.filter') >= 0 && SI.indexOf('const cxInsp   = sortedInsp.filter(cxIsTrace)') >= 0);
  t('★印刷の詰め判定に帯も数える（1日が1枚）', SI.indexOf('(liveInsp.length+cxInsp.length)>=7') >= 0);
  t('★3ファイルとも同じ道具を置いている', [SI, SC, SM].every(s => s.indexOf('const cxIsTrace=') >= 0 && s.indexOf('const cxPatch=') >= 0));
  t('★リストのキャンセルがスケジュールへ届く道がある', SC.indexOf('const markBookingRows=') >= 0 && SC.indexOf("if(status==='cancel'&&cxSchedRef.current)") >= 0);
  t('★リストの確認の文を本当の動きに直している', SC.indexOf('「キャンセル」の帯になって元の日に残ります') >= 0 && SC.indexOf('スケジュールに入っている予約は消えません') < 0);
  t('★スマホの取り消しも帯にする', SM.indexOf('cxMark(_r,{dk:req.dk,by:_cxBy})') >= 0);
  t('★スマホの日にち変更も元の日に帯を残す', SM.indexOf('cxMark(_or,{dk:req.dk,to:tDk,by:_opName})') >= 0);
  t('★台数ロジック（6コマ）は触っていない', SI.indexOf("const irows=(inspData[dkk]||[]).filter(r=>r&&r.name&&r.bookingStatus!=='cancelled')") >= 0);

  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '全' + pass + '件 PASS' : pass + '件 PASS / ' + fail + '件 不合格'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
