// 取扱説明書（2026-09 改訂版・基本操作／便利操作）用のスクリーンショットを自動撮影し、
// 各ボタンの位置（赤枠を付ける座標）も一緒に記録する。
//
//   使い方: node capture_manual2_shots.js
//   出力先: ./manual2_shots/*.png と ./manual2_shots/index.json（{file, vw, vh, boxes:{名前:{x,y,w,h}}}）
//
// ★安全性：本物の Firebase には繋がない。DEV の Firestore（hub-v8-dev-*）をサービスアカウント鍵で
//   読み取り専用で集め、氏名を架空名に置き換えてから、にせの firebase（fake_firebase.js）に入れて
//   ブラウザに渡す。見た目は本番（青ヘッダー）にしたいので index_main.html を起動し、
//   キーを hub-v8-dev- → hub-v8- に読み替えて流し込む。
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const OUT_DIR = path.join(__dirname, 'manual2_shots');
const PORT = 8156;
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
const DEV = 'hub-v8-dev-', PROD = 'hub-v8-';

// ── 氏名の匿名化（capture_manual_shots.js と同じ規則）──
const SEI = ['山田','佐藤','鈴木','高橋','田中','伊藤','渡辺','中村','小林','加藤','吉田','山本','松本','井上','木村','清水','斉藤','山口','森田','池田','橋本','石川','原田','岡田','長谷川','近藤','村上','遠藤','青木','坂本'];
const MEI = ['太郎','花子','一郎','美咲','健二','良子','翔','さくら','大輔','明美','隆','千夏','浩二','真理','拓也','由美','誠','あかり','徹','香織'];
const nameMap = new Map(); let fakeIdx = 0;
const staffNames = new Set();
function fakeName(real) {
  const k = String(real || '').trim(); if (!k) return real;
  if (staffNames.has(k)) return real;
  if (!nameMap.has(k)) { nameMap.set(k, SEI[fakeIdx % SEI.length] + '　' + MEI[Math.floor(fakeIdx / SEI.length) % MEI.length]); fakeIdx++; }
  return nameMap.get(k);
}
const NAME_KEYS = ['name', '氏名', 'お名前', '顧客名', 'custName', 'user', 'finalUser', 'owner'];
const NOTE_KEYS = ['note', 'memo', 'remark', '備考', 'メモ', 'content', 'title'];
const TEL_KEYS = ['tel', 'phone', 'phoneHome', 'phoneMobile', 'addr', 'address', '電話', '電話番号', '住所'];
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (NAME_KEYS.indexOf(k) >= 0 && typeof val === 'string') o[k] = fakeName(val);
      else if (NOTE_KEYS.indexOf(k) >= 0 && typeof val === 'string' && val.trim()) o[k] = k === 'title' ? '打合せ' : '（メモ欄）';
      else if (TEL_KEYS.indexOf(k) >= 0) o[k] = typeof val === 'string' && val ? (k.indexOf('addr') >= 0 || k === '住所' ? '三田市〇〇1-2-3' : '000-0000-0000') : val;
      else o[k] = scrub(val);
    }
    return o;
  }
  if (typeof v === 'string') { const t = v.trim(); if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { return JSON.stringify(scrub(JSON.parse(t))); } catch (e) { return v; } } }
  return v;
}

async function loadDevStore() {
  const admin = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const q = await db.collection('kv').get();
  const raw = {};
  q.forEach(d => { if (d.id.indexOf(DEV) === 0) raw[d.id.slice(DEV.length)] = d.data().v; });
  for (const st of ['honten', 'sanda']) { try { (JSON.parse(raw[st + '-staff-v2'] || '[]') || []).forEach(s => s && s.name && staffNames.add(String(s.name).trim())); } catch (e) {} }
  const store = {};
  for (const k of Object.keys(raw)) {
    if (k.indexOf('mysec-') === 0) continue;      // 暗号化書庫は載せない
    let v = raw[k];
    if (!(k === 'cf-index' || /^cf-.*-index$/.test(k) || k === 'vehicles' || /-cars$/.test(k) || k === 'rentalcars')) { try { v = JSON.stringify(scrub(JSON.parse(v))); } catch (e) {} }   // 索引の name はファイル名なので置き換えない
    store['kv/' + PROD + k] = { v, u: Date.now() };
  }
  store['meta/allowed'] = { 'egawa@midori-m,com': { email: 'egawa@midori-m.com', name: '江川京志', store: 'honten', uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  store['devices/dev-manual'] = { env: PROD, e: 'egawa@midori-m.com', n: '江川京志', names: ['江川京志'], s: 'honten', k: 'shared', l: '説明書', ua: 'manual', at: 1, last: Date.now() };
  return store;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = http.createServer((req, res) => {
    const f = path.join(MAIN_DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(data); });
  });
  await new Promise(r => server.listen(PORT, r));
  console.log('DEV Firestore を読み取り中（読み取り専用・氏名は架空名へ）...');
  const store = await loadDevStore();
  console.log('  kv ' + Object.keys(store).filter(k => k.indexOf('kv/') === 0).length + ' 件・スタッフ名 ' + staffNames.size + ' 件は実名・置き換えた氏名 ' + nameMap.size + ' 件');

  const VW = 1500, VH = 950;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
  await context.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: route.request().method() === 'POST' ? 'ok' : 'null' }));
  await context.addInitScript(([st, stor]) => {
    if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem('__fakeFbUser', JSON.stringify({ email: 'egawa@midori-m.com', uid: 'uid_egawa' }));
    localStorage.setItem(stor + 'auth-devid', 'dev-manual');
    localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: '江川京志', store: 'honten', email: 'egawa@midori-m.com', isAdmin: true }, { uid: 'h1', name: '見取大介', store: 'honten', email: '' }]));
    localStorage.setItem(stor + 'auth-kind', 'shared');
    sessionStorage.setItem(stor + 'fs-pref2', 'off');   // 撮影中に全画面へ入らない
    sessionStorage.setItem('hub_currentUser', JSON.stringify({ uid: 'h1', name: '見取大介', myNumber: 1, id: 1, badge: 'inspector', store: { id: 'honten', name: '本店', color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8' } }));
  }, [store, PROD]);

  const shots = [];
  // 要素の位置を CSS px で記録する。finder はページ内で評価される関数（文字列）
  const boxOf = async (page, fn, arg) => {
    try {
      return await page.evaluate(([src, a]) => {
        const f = eval('(' + src + ')'); const el = f(a); if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };
      }, [fn.toString(), arg === undefined ? null : arg]);
    } catch (e) { return null; }
  };
  const btn = (t) => [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && b.textContent.length < t.length + 12);
  const union = (...bs) => { const l = bs.filter(Boolean); if (!l.length) return null; const x1 = Math.min(...l.map(b => b.x)), y1 = Math.min(...l.map(b => b.y)), x2 = Math.max(...l.map(b => b.x + b.w)), y2 = Math.max(...l.map(b => b.y + b.h)); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const shoot = async (page, file, label, boxes) => {
    await page.screenshot({ path: path.join(OUT_DIR, file) });
    const clean = {}; Object.keys(boxes || {}).forEach(k => { if (boxes[k]) clean[k] = boxes[k]; });
    shots.push({ file, label, vw: VW, vh: VH, boxes: clean });
    console.log('  ✔ ' + file + '  ' + label + '  枠 ' + Object.keys(clean).join(','));
  };
  const nav = async (page, label) => {
    const ok = await page.evaluate(t => { const b = [...document.querySelectorAll('button,div')].find(x => x.textContent.includes(t) && x.offsetParent !== null && x.textContent.trim().length <= t.length + 4); if (b) { b.click(); return true; } return false; }, label);
    await page.waitForTimeout(2500); return ok;
  };

  const page = await context.newPage();
  page.on('dialog', async d => { await d.dismiss().catch(() => {}); });
  await page.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // ── 1. スケジュール画面（基本：直接予約） ──
  {
    const b = {};
    b.navCal = await boxOf(page, btn, 'カレンダー');
    b.navSched = await boxOf(page, btn, 'スケジュール');
    b.navLoaner = await boxOf(page, btn, '代車管理');
    b.navCars = await boxOf(page, btn, '車両管理');
    b.navSearch = await boxOf(page, btn, '検索');
    b.navCust = await boxOf(page, btn, '顧客リスト');
    b.storeH = await boxOf(page, btn, '本店');
    b.storeS = await boxOf(page, btn, '三田店');
    b.version = await boxOf(page, () => [...document.querySelectorAll('span,div')].find(e => /^v\d+\.\d+$/.test(e.textContent.trim())));
    b.gas = await boxOf(page, () => [...document.querySelectorAll('span')].find(e => e.offsetParent !== null && /GAS接続/.test(e.textContent) && e.textContent.length < 12));
    b.inspAdd = await boxOf(page, () => { const t = document.querySelectorAll('table')[0]; return t && [...t.querySelectorAll('tr')].find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null); });
    b.schedAdd = await boxOf(page, () => { const t = document.querySelectorAll('table')[1]; return t && [...t.querySelectorAll('tr')].find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null); });
    b.restrict = await boxOf(page, btn, '入庫制限');
    b.print = await boxOf(page, btn, '印刷');
    b.collapse = await boxOf(page, btn, '畳む');
    b.dateNav = await boxOf(page, () => { const d = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /^\d+月\d+日/.test(x.textContent.trim()) && x.textContent.length < 14); return d && d.parentElement.parentElement; });
    b.staffBar = await boxOf(page, () => [...document.querySelectorAll('span')].find(x => x.textContent.trim() === '本日') && [...document.querySelectorAll('span')].find(x => x.textContent.trim() === '本日').closest('div').parentElement);
    b.dayOff = await boxOf(page, () => { const s = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === '🏖'); return s && s.parentElement; });
    b.fullscreen = await boxOf(page, () => document.querySelector('button[data-fs-toggle]'));
    b.navGroup = union(b.navCal, b.navSched, b.navLoaner, b.navCars, b.navSearch, b.navCust);
    b.storeGroup = union(b.storeH, b.storeS);
    b.userMenu = await boxOf(page, () => { const e = [...document.querySelectorAll('span,div,button')].find(x => x.textContent.trim() === '見取大介' && x.offsetParent !== null && x.closest('header,[class*=head]')); return e; });
    await shoot(page, 'b1-schedule.png', 'スケジュール画面（全体）', b);
  }
  // ── 2. 車検予約カード（直接予約・便利：代車・事前入庫・納車日） ──
  {
    await page.evaluate(() => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tr')].find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null); if (row) { const c = [...row.querySelectorAll('td')].find(x => x.textContent.includes('クリックして追加')); (c || row).click(); } });
    await page.waitForTimeout(2500);
    const fieldOf = (t) => { const l = [...document.querySelectorAll('label')].find(l => l.offsetParent !== null && l.textContent.trim().replace(/s/g, '').startsWith(t)); return l && l.parentElement; };
    const b = {};
    b.name = await boxOf(page, fieldOf, '氏名');
    b.staff = await boxOf(page, fieldOf, '担当');
    b.car = await boxOf(page, fieldOf, '車種');
    b.phone = await boxOf(page, fieldOf, '電話');
    b.address = await boxOf(page, fieldOf, '住所');
    b.course = await boxOf(page, fieldOf, 'コース');
    b.loaner = await boxOf(page, fieldOf, '代車');
    b.loanerBtn = await boxOf(page, btn, '選択');
    b.tokuten = await boxOf(page, fieldOf, '特典');
    b.time = await boxOf(page, fieldOf, '入庫時間');
    b.entry = await boxOf(page, fieldOf, '入庫日');
    b.delivery = await boxOf(page, fieldOf, '納車日');
    b.note = await boxOf(page, fieldOf, '備考');
    b.quick = await boxOf(page, btn, 'クイック編集');
    b.save = await boxOf(page, btn, '保存');
    b.close = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '' && x.querySelector('svg') && x.closest('.booking-modal-inner,[class*=modal]')));
    await shoot(page, 'b2-insp-card.png', '車検予約カード', b);
    // 下の方（納車日・備考・保存）はスクロールが要ることがある
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '保存'); if (b) b.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    const b2 = {};
    b2.entry = await boxOf(page, fieldOf, '入庫日'); b2.delivery = await boxOf(page, fieldOf, '納車日'); b2.note = await boxOf(page, fieldOf, '備考');
    b2.quick = await boxOf(page, btn, 'クイック編集'); b2.save = await boxOf(page, btn, '保存'); b2.del = await boxOf(page, btn, '削除');
    await shoot(page, 'b2b-insp-card-bottom.png', '車検予約カード（下半分）', b2);
    { const cb = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.querySelector('svg') && x.textContent.trim() === '' && x.getBoundingClientRect().top < 80 && x.getBoundingClientRect().left < 700)); if (cb) await page.mouse.click(cb.x + cb.w / 2, cb.y + cb.h / 2); else await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(900); }
  }
  // ── 3. タイムスケジュールの予約カード ──
  {
    await page.evaluate(() => { const t = document.querySelectorAll('table')[1]; const row = t && [...t.querySelectorAll('tr')].find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null); if (row) { const c = [...row.querySelectorAll('td')].find(x => x.textContent.includes('クリックして追加')); (c || row).click(); } });
    await page.waitForTimeout(2500);
    const fieldOf = (t) => { const l = [...document.querySelectorAll('label')].find(l => l.offsetParent !== null && l.textContent.trim().replace(/s/g, '').startsWith(t)); return l && l.parentElement; };
    const b = {};
    b.name = await boxOf(page, fieldOf, '氏名'); b.car = await boxOf(page, fieldOf, '車種'); b.phone = await boxOf(page, fieldOf, '電話');
    b.work = await boxOf(page, fieldOf, '作業'); b.loaner = await boxOf(page, fieldOf, '代車'); b.shimi = await boxOf(page, fieldOf, '指');
    b.content = await boxOf(page, fieldOf, '内容'); b.save = await boxOf(page, btn, '保存');
    await shoot(page, 'b3-sched-card.png', 'タイムスケジュールの予約カード', b);
    { const cb = await boxOf(page, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.querySelector('svg') && x.textContent.trim() === '' && x.getBoundingClientRect().top < 80 && x.getBoundingClientRect().left < 700)); if (cb) await page.mouse.click(cb.x + cb.w / 2, cb.y + cb.h / 2); else await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(900); }
  }
  // ── 4. カレンダー画面 ──
  {
    await nav(page, 'カレンダー');
    const b = {};
    b.toggleInsp = await boxOf(page, btn, '車検'); b.toggleOff = await boxOf(page, btn, '休日'); b.toggleMy = await boxOf(page, btn, '予定');
    b.gear = await boxOf(page, btn, '設定');
    b.toggleGroup = union(b.toggleInsp, b.toggleOff, b.toggleMy);
    b.monthNav = await boxOf(page, () => [...document.querySelectorAll('span,div')].find(x => /^\d{4}年\d{1,2}月$/.test(x.textContent.trim()) && x.offsetParent !== null));
    b.dayCell = await boxOf(page, () => { const d = new Date().getDate(); const cells = [...document.querySelectorAll('div')].filter(el => el.style && el.style.minHeight && el.textContent.trim().startsWith(String(d + 1 <= 28 ? d + 1 : d))); return cells[0]; });
    await shoot(page, 'b4-calendar.png', 'カレンダー画面', b);
    // 歯車を開く
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('設定') && x.textContent.length < 6); if (b) b.click(); });
    await page.waitForTimeout(600);
    const b2 = {}; b2.limit = await boxOf(page, btn, '台数制限設定'); b2.staffOff = await boxOf(page, btn, 'スタッフ休日設定'); b2.gear = await boxOf(page, btn, '設定'); b2.toggleOff = await boxOf(page, btn, '休日'); b2.toggleMy = await boxOf(page, btn, '予定'); b2.toggleInsp = await boxOf(page, btn, '車検');
    await shoot(page, 'b4b-calendar-gear.png', 'カレンダーの設定メニュー', b2);
    await page.keyboard.press('Escape').catch(() => {}); await page.evaluate(() => document.body.click()); await page.waitForTimeout(500);
  }
  await page.close();

  // ── 5. 顧客リスト ──
  {
    const pc = await context.newPage();
    pc.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await pc.goto('http://127.0.0.1:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
    await pc.waitForFunction(() => document.querySelectorAll('tbody tr').length > 2, null, { timeout: 40000 }).catch(() => {});
    await pc.waitForTimeout(2000);
    const b = {};
    b.search = await boxOf(pc, () => document.querySelector('input[placeholder*="検索"]'));
    for (const [k, t] of [['fAll', 'すべて'], ['fNone', '未予約'], ['fTemp', '仮予約'], ['fConf', '本予約'], ['fCancel', 'キャンセル'], ['fFirst', '初回']]) b[k] = await boxOf(pc, btn, t);
    b.fGroup = union(b.fAll, b.fNone, b.fTemp, b.fConf, b.fCancel, b.fFirst);
    b.sync = await boxOf(pc, btn, 'スケジュール同期チェック');
    b.import = await boxOf(pc, btn, 'Excelインポート');
    b.book = await boxOf(pc, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋予約'));
    b.files = await boxOf(pc, () => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /^\d{6}/.test(x.textContent.trim())); return b; });
    b.stats = await boxOf(pc, () => { const e = [...document.querySelectorAll('div')].find(x => x.textContent.trim() === '総件数'); return e && e.parentElement.parentElement; });
    b.back = await boxOf(pc, btn, 'スケジュールに戻る');
    await shoot(pc, 'b5-customers.png', '顧客リスト', b);
    await pc.close();
  }

  // ── 6. 検索（🔍）／入庫制限／入庫済み☑／代車の選択（管理表）／代車管理／車両管理 ──
  {
    const page2 = await context.newPage();
    page2.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await page2.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
    await page2.waitForTimeout(2500);
    const rowWithTime = () => { const t = document.querySelectorAll('table')[0]; return t && [...t.querySelectorAll('tr')].find(r => r.offsetParent !== null && r.querySelector('td') && /\d{1,2}:\d{2}/.test(r.querySelector('td').textContent) && r.querySelectorAll('td')[1] && r.querySelectorAll('td')[1].textContent.trim().length > 1); };
    // 入庫済み☑：車検の行の時刻欄（クリックで✓）。今日に予約が無ければ次の日へ進めて探す（最大14日）
    for (let i = 0; i < 14; i++) {
      const has = await page2.evaluate(() => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tbody tr')].find(r => r.offsetParent !== null && r.querySelectorAll('td')[1] && !r.querySelectorAll('td')[1].textContent.includes('クリックして追加') && r.querySelectorAll('td')[1].textContent.trim().length > 1); return !!row; });
      if (has) break;
      await page2.evaluate(() => { const d = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /^\d+月\d+日/.test(x.textContent.trim()) && x.textContent.length < 14); let n = d && d.nextElementSibling; if (!(n && n.tagName === 'BUTTON')) n = d && d.parentElement && d.parentElement.nextElementSibling; if (n && n.tagName === 'BUTTON') n.click(); });
      await page2.waitForTimeout(700);
    }
    {
      const b = {};
      b.timeCell = await boxOf(page2, () => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tbody tr')].find(r => r.offsetParent !== null && r.querySelectorAll('td')[1] && !r.querySelectorAll('td')[1].textContent.includes('クリックして追加') && r.querySelectorAll('td')[1].textContent.trim().length > 1); if (!row) return null; const tds = [...row.querySelectorAll('td')]; return tds.find(td => /^s*d{1,2}:d{2}/.test(td.textContent) || td.textContent.trim() === '✓') || tds[6]; });
      b.loanerCell = await boxOf(page2, () => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tbody tr')].find(r => r.offsetParent !== null && r.querySelectorAll('td')[1] && !r.querySelectorAll('td')[1].textContent.includes('クリックして追加') && r.querySelectorAll('td')[1].textContent.trim().length > 1); return row && row.querySelectorAll('td')[4]; });
      b.dateNav = await boxOf(page2, () => { const d = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /^\d+月\d+日/.test(x.textContent.trim()) && x.textContent.length < 14); return d && d.parentElement; });
      b.nameCell = await boxOf(page2, () => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tbody tr')].find(r => r.offsetParent !== null && r.querySelectorAll('td')[1] && !r.querySelectorAll('td')[1].textContent.includes('クリックして追加') && r.querySelectorAll('td')[1].textContent.trim().length > 1); return row && row.querySelectorAll('td')[1]; });
      b.restrict = await boxOf(page2, btn, '入庫制限'); b.print = await boxOf(page2, btn, '印刷'); b.collapse = await boxOf(page2, btn, '畳む'); b.navSearch = await boxOf(page2, btn, '検索');
      await shoot(page2, 'c1-schedule-row.png', 'スケジュール：予約の行', b);
    }
    // 入庫制限モーダル
    await page2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('入庫制限')); if (b) b.click(); });
    await page2.waitForTimeout(1200);
    {
      const b = {};
      b.inputs = await boxOf(page2, () => { const ins = [...document.querySelectorAll('input[type="time"],select')].filter(x => x.offsetParent !== null); if (!ins.length) return null; const el = ins[0].closest('div'); return el && el.parentElement; });
      b.save = await boxOf(page2, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /保存|設定する|確定/.test(x.textContent) && x.textContent.length < 14 && x.closest('.modal-box')));
      b.title = await boxOf(page2, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('🚫 入庫制限設定') && x.textContent.length < 20));
      await shoot(page2, 'c2-restrict.png', '入庫制限設定', b);
    }
    await page2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '戻る' && x.closest('.modal-box')); if (b) b.click(); }); await page2.waitForTimeout(600);
    // 🔍 検索
    await nav(page2, '検索');
    await page2.waitForTimeout(800);
    {
      const b = {};
      b.input = await boxOf(page2, () => document.querySelector('input[data-searchq]'));
      b.tabs = await boxOf(page2, () => { const t = [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && /^(全て|車検|整備|顧客)/.test(x.textContent.trim()) && x.textContent.length < 8); if (!t.length) return null; const r = t.map(e => e.getBoundingClientRect()); const x1 = Math.min(...r.map(q => q.left)), y1 = Math.min(...r.map(q => q.top)), x2 = Math.max(...r.map(q => q.right)), y2 = Math.max(...r.map(q => q.bottom)); return { getBoundingClientRect: () => ({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 }) }; });
      await page2.fill('input[data-searchq]', '山田').catch(() => {});
      await page2.waitForTimeout(1500);
      await shoot(page2, 'c3-find.png', '検索', b);
    }
    await page2.keyboard.press('Escape').catch(() => {}); await page2.waitForTimeout(600);
    await page2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '×'); if (b) b.click(); }); await page2.waitForTimeout(400);
    // 代車の選択：予約カードの「選択」→ 管理表（選択モード）
    await nav(page2, 'スケジュール');
    await page2.evaluate(() => { const t = document.querySelectorAll('table')[0]; const row = t && [...t.querySelectorAll('tr')].find(r => r.textContent.includes('クリックして追加') && r.offsetParent !== null); if (row) { const c = [...row.querySelectorAll('td')].find(x => x.textContent.includes('クリックして追加')); (c || row).click(); } });
    await page2.waitForTimeout(2000);
    await page2.fill('input[placeholder="お客様名"]', '山田　太郎').catch(() => {});
    await page2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '選択'); if (b) b.click(); });
    await page2.waitForTimeout(2500);
    {
      const b = {};
      b.carName = await boxOf(page2, () => { const t = [...document.querySelectorAll('table')].find(x => x.offsetParent !== null); return t && t.querySelectorAll('tbody tr td')[0]; });
      b.dateHead = await boxOf(page2, () => { const t = [...document.querySelectorAll('table')].find(x => x.offsetParent !== null); return t && [...t.querySelectorAll('thead th')].find(th => th.getBoundingClientRect().left > 200 && th.getBoundingClientRect().left < 400); });
      b.banner = await boxOf(page2, () => [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.includes('空きセルをクリック') && x.textContent.length < 60));
      b.back = await boxOf(page2, btn, '予約カードに戻る');
      b.firstCell = await boxOf(page2, () => { const t = [...document.querySelectorAll('table')].find(x => x.offsetParent !== null); const tr = t && t.querySelector('tbody tr'); return tr && [...tr.querySelectorAll('td')].find(td => td.getBoundingClientRect().left > 300 && td.getBoundingClientRect().left < 420); });
      await shoot(page2, 'c4-loaner-pick.png', '代車の選択（管理表）', b);
    }
    await page2.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
    await page2.waitForTimeout(2000);
    // 代車管理
    await nav(page2, '代車管理');
    {
      const b = {};
      b.optimize = await boxOf(page2, btn, '最適化'); b.undo = await boxOf(page2, btn, '戻す'); b.tire = await boxOf(page2, btn, 'タイヤ'); b.location = await boxOf(page2, btn, '所在地');
      b.settings = await boxOf(page2, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.title === '代車・レンタカー設定'));
      b.dateHead = await boxOf(page2, () => { const t = [...document.querySelectorAll('table')].find(x => x.offsetParent !== null); return t && t.querySelectorAll('thead th')[5]; });
      b.carName = await boxOf(page2, () => { const t = [...document.querySelectorAll('table')].find(x => x.offsetParent !== null); return t && t.querySelectorAll('tbody tr td')[0]; });
      b.back = await boxOf(page2, btn, 'スケジュールに戻る');
      await shoot(page2, 'c5-loaner.png', '代車管理', b);
    }
    // 車両管理
    await nav(page2, '車両管理');
    {
      const b = {};
      b.alert = await boxOf(page2, () => [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /台アラート/.test(x.textContent)));
      b.filter = await boxOf(page2, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '全て'));
      b.row = await boxOf(page2, () => [...document.querySelectorAll('div')].filter(el => el.offsetParent !== null && /[·・] ?(レンタカー|その他|代車)/.test(el.textContent) && el.style && el.style.cursor === 'pointer' && el.getBoundingClientRect().width > 150 && el.getBoundingClientRect().width < 600 && el.getBoundingClientRect().height < 160 && el.getBoundingClientRect().height > 30)[0]);
      b.importBtn = await boxOf(page2, btn, '車検証ファイル読込'); b.addBtn = await boxOf(page2, btn, '手動追加'); b.onlyAlert = await boxOf(page2, btn, 'アラートのみ');
      b.banner = await boxOf(page2, () => { const s = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && x.textContent.trim() === '⚠️ アラート'); return s && s.parentElement; });
      await shoot(page2, 'c6-vehicles.png', '車両管理', b);
      if (b.row) await page2.mouse.click(b.row.x + b.row.w / 2, b.row.y + b.row.h / 2);   // 実クリック（onClick が親に付いている）
      await page2.waitForTimeout(1200);
      const b2 = {};
      b2.add = await boxOf(page2, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋ 追加' || (x.offsetParent !== null && x.textContent.trim() === '+ 追加')));
      b2.done = await boxOf(page2, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /完了/.test(x.textContent) && x.textContent.length < 6));
      b2.edit = await boxOf(page2, btn, '編集'); b2.del = await boxOf(page2, btn, '削除');
      b2.card = await boxOf(page2, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.includes('予定日：') && x.textContent.length < 60); let c = e; for (let i = 0; i < 4 && c; i++) { if (c.getBoundingClientRect().width > 600) break; c = c.parentElement; } return c; });
      b2.head = await boxOf(page2, () => { const e = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && x.textContent.includes('登録日：')); let c = e; for (let i = 0; i < 4 && c; i++) { if (c.getBoundingClientRect().width > 600) break; c = c.parentElement; } return c; });
      await shoot(page2, 'c6b-vehicle-edit.png', '車両管理：点検日の編集', b2);
      await page2.keyboard.press('Escape').catch(() => {});
    }
    await page2.close();
  }
  // ── 7. カレンダーの便利機能：スタッフ休日設定／台数制限／My予定 ──
  {
    const page3 = await context.newPage();
    page3.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await page3.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
    await page3.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
    await page3.waitForTimeout(2000);
    await nav(page3, 'カレンダー');
    const openGear = async (label) => { await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('設定') && x.textContent.length < 6); if (b) b.click(); }); await page3.waitForTimeout(500); await page3.evaluate(l => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes(l)); if (b) b.click(); }, label); await page3.waitForTimeout(1500); };
    const groupOf = (texts) => { const a = [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && texts.some(t => x.textContent.includes(t)) && x.closest('.modal-box')); if (a.length < 2) return null; const r = a.map(e => e.getBoundingClientRect()); return { getBoundingClientRect: () => ({ left: Math.min(...r.map(q => q.left)), top: Math.min(...r.map(q => q.top)), width: Math.max(...r.map(q => q.right)) - Math.min(...r.map(q => q.left)), height: Math.max(...r.map(q => q.bottom)) - Math.min(...r.map(q => q.top)) }) }; };
    await openGear('スタッフ休日設定');
    {
      const b = {};
      b.all = await boxOf(page3, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '全員表示'));
      b.me = await boxOf(page3, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '見取大介' && x.closest('.modal-box')));
      b.type = await boxOf(page3, groupOf, ['🏖 休日', '📋 有給']);
      b.cell = await boxOf(page3, () => { const m = document.querySelector('.modal-box'); const d = new Date().getDate(); const cells = m ? [...m.querySelectorAll('div')].filter(el => el.style && el.style.minHeight === '82px' && el.textContent.trim().startsWith(String(d))) : []; return cells[0]; });
      b.month = await boxOf(page3, () => [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /^\d{4}年\d{1,2}月$/.test(x.textContent.trim()) && x.closest('.modal-box')));
      b.summary = await boxOf(page3, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('📊') && x.textContent.length < 30 && x.closest('.modal-box')); return e && e.parentElement; });
      b.mhol = await boxOf(page3, () => { const e = [...document.querySelectorAll('span')].find(x => x.offsetParent !== null && /月の休日$/.test(x.textContent.trim()) && x.closest('.modal-box')); return e && e.parentElement; });
      b.close = await boxOf(page3, btn, '確定して閉じる');
      await shoot(page3, 'c7-staff-cal.png', 'スタッフ休日設定', b);
    }
    await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('確定して閉じる')); if (b) b.click(); }); await page3.waitForTimeout(800);
    await openGear('台数制限設定');
    {
      const b = {};
      b.date = await boxOf(page3, () => [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent !== null));
      b.count = await boxOf(page3, () => { const l = [...document.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.includes('最大台数')); return l && l.parentElement; });
      b.ok = await boxOf(page3, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✓ 確定'));
      b.list = await boxOf(page3, () => { const e = [...document.querySelectorAll('div')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith('📋 台数制限設定一覧') && x.textContent.length < 40); return e && e.parentElement; });
      await shoot(page3, 'c8-limit.png', '車検台数制限', b);
    }
    await page3.mouse.click(8, 500); await page3.waitForTimeout(700); await page3.keyboard.press('Escape').catch(() => {}); await page3.waitForTimeout(500);   // 背景クリックで閉じる
    // My予定：予定ビュー → 今日をクリック → 追加フォーム
    await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('予定') && x.textContent.length < 5); if (b) b.click(); });
    await page3.waitForTimeout(800);
    await page3.evaluate(() => { const d = new Date().getDate(); const cells = [...document.querySelectorAll('div')].filter(el => el.style && el.style.cursor === 'pointer' && el.style.minHeight === '110px' && el.textContent.trim().startsWith(String(d))); if (cells[0]) cells[0].click(); });
    await page3.waitForTimeout(800);
    await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.includes('＋ 予定を追加')); if (b) b.click(); });
    await page3.waitForTimeout(500);
    {
      const b = {};
      b.title = await boxOf(page3, () => document.querySelector('input[placeholder*="件名"]'));
      b.time = await boxOf(page3, () => [...document.querySelectorAll('input[type="time"]')].find(x => x.offsetParent !== null && x.closest('.modal-box')));
      b.memo = await boxOf(page3, () => [...document.querySelectorAll('textarea')].find(x => x.offsetParent !== null && x.closest('.modal-box')));
      b.kind = await boxOf(page3, groupOf, ['👥 公開', '🔒 シークレット']);
      b.add = await boxOf(page3, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '追加' && x.closest('.modal-box')));
      b.secret = await boxOf(page3, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '準備する'));
      await shoot(page3, 'c9-mysched.png', 'My予定', b);
    }
    await page3.close();
  }
  // ── 8. 顧客リストから予約（＋予約 → リストの予約カード）──
  {
    const pc = await context.newPage();
    pc.on('dialog', async d => { await d.dismiss().catch(() => {}); });
    await pc.goto('http://127.0.0.1:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
    await pc.waitForFunction(() => document.querySelectorAll('tbody tr').length > 2, null, { timeout: 40000 }).catch(() => {});
    await pc.waitForTimeout(2000);
    await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '未予約'); if (b) b.click(); });
    await pc.waitForTimeout(800);
    {
      const b = {};
      b.book = await boxOf(pc, () => [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋予約'));
      b.row = await boxOf(pc, () => { const bt = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋予約'); return bt && bt.closest('tr'); });
      b.fNone = await boxOf(pc, btn, '未予約');
      await shoot(pc, 'c10-list-row.png', '顧客リスト：未予約の行', b);
    }
    await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '＋予約'); if (b) b.click(); });
    await pc.waitForTimeout(1500);
    {
      // モーダルの範囲（「キャンセル」ボタンの幅600px超の先祖）の中だけを探す。ページ側に window.__M を置く
      await pc.evaluate(() => { window.__M = () => { const c = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✓ 本予約'); let e = c; for (let i = 0; i < 10 && e; i++) { if (e.getBoundingClientRect().width > 700 && e.getBoundingClientRect().height > 400) return e; e = e.parentElement; } return document.body; }; });
      const lab = (t) => { const m = window.__M(); const l = [...m.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.trim().startsWith(t)); if (!l) return null; const p = l.parentElement; return (p && p.getBoundingClientRect().width < 500 && p.getBoundingClientRect().height < 200) ? p : (l.nextElementSibling || l); };
      const b = {};
      b.modal = await boxOf(pc, () => window.__M());
      b.date = await boxOf(pc, () => { const m = window.__M(); const e = [...m.querySelectorAll('div')].find(x => x.offsetParent !== null && /入庫日/.test(x.textContent) && x.textContent.length < 40); return e; });
      b.time = await boxOf(pc, lab, '入庫時間'); b.store = await boxOf(pc, lab, '店舗'); b.staff = await boxOf(pc, lab, '担当'); b.course = await boxOf(pc, lab, '車検コース'); b.tokuten = await boxOf(pc, lab, '特典'); b.note = await boxOf(pc, lab, '備考');
      b.loaner = await boxOf(pc, () => { const m = window.__M(); const l = [...m.querySelectorAll('label')].find(x => x.offsetParent !== null && x.textContent.includes('代車')); if (!l) return null; const p = l.parentElement; return (p && p.getBoundingClientRect().width < 500) ? p : (l.nextElementSibling || l); });
      b.temp = await boxOf(pc, () => { const m = window.__M(); return [...m.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '仮予約'); });
      b.confirm = await boxOf(pc, () => { const m = window.__M(); return [...m.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === '✓ 本予約'); });
      b.cancel = await boxOf(pc, () => { const m = window.__M(); return [...m.querySelectorAll('button')].find(x => x.offsetParent !== null && x.textContent.trim() === 'キャンセル'); });
      await shoot(pc, 'c11-list-modal.png', '顧客リスト：予約カード', b);
    }
    await pc.close();
  }

  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(shots, null, 2), 'utf8');
  console.log('\n撮影 ' + shots.length + ' 枚 → ' + OUT_DIR + '（置き換えた氏名 ' + nameMap.size + ' 件）');
})();
