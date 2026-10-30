// 「週間カレンダー（タイムスケジュール・週）の使い方」スライド用の画面写真を自動撮影し、
// 赤枠を付ける座標も一緒に記録する。
//
//   使い方: node capture_manual4_shots.js
//   出力先: ./manual4_shots/*.png と ./manual4_shots/index.json（{file, vw, vh, boxes:{名前:{x,y,w,h}}}）
//   つぎに: node build_manual4_pptx.js
//
// ★安全性：本物の Firebase には繋がない。DEV の Firestore（hub-v8-dev-*）をサービスアカウント鍵で
//   読み取り専用で集め、お客様の氏名・電話・住所を架空のものに置き換えてから、
//   にせの firebase（fake_firebase.js）に入れてブラウザに渡す。
//   見た目は本番（青ヘッダー）にしたいので index_main.html を起動し、キーを読み替えて流し込む。
//   （capture_manual2_shots.js と同じ作り）
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');
const OUT_DIR = path.join(__dirname, 'manual4_shots');
const PORT = 8158;
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
const DEV = 'hub-v8-dev-', PROD = 'hub-v8-';

// ── 氏名の匿名化（capture_manual2_shots.js と同じ規則）──
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
      else if (NOTE_KEYS.indexOf(k) >= 0 && typeof val === 'string' && val.trim()) o[k] = k === 'title' ? '打合せ' : (k === 'content' ? 'オイル交換' : '（メモ欄）');
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
    if (!(k === 'cf-index' || /^cf-.*-index$/.test(k) || k === 'vehicles' || /-cars$/.test(k) || k === 'rentalcars')) { try { v = JSON.stringify(scrub(JSON.parse(v))); } catch (e) {} }
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
  const boxOf = async (page, fn, arg) => {
    try {
      return await page.evaluate(([src, a]) => {
        const f = eval('(' + src + ')'); const el = f(a); if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };
      }, [fn.toString(), arg === undefined ? null : arg]);
    } catch (e) { return null; }
  };
  const sel = (s) => document.querySelector(s);
  const btn = (t) => [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && b.textContent.length < t.length + 12);
  const union = (...bs) => { const l = bs.filter(Boolean); if (!l.length) return null; const x1 = Math.min(...l.map(b => b.x)), y1 = Math.min(...l.map(b => b.y)), x2 = Math.max(...l.map(b => b.x + b.w)), y2 = Math.max(...l.map(b => b.y + b.h)); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const shoot = async (page, file, label, boxes) => {
    await page.screenshot({ path: path.join(OUT_DIR, file) });
    const clean = {}; Object.keys(boxes || {}).forEach(k => { if (boxes[k]) clean[k] = boxes[k]; });
    shots.push({ file, label, vw: VW, vh: VH, boxes: clean });
    console.log('  ✔ ' + file + '  ' + label + '  枠 ' + Object.keys(clean).join(','));
  };
  const click = async (page, s, wait) => { const ok = await page.evaluate(x => { const e = document.querySelector(x); if (e) { e.click(); return true; } return false; }, s); await page.waitForTimeout(wait || 1200); return ok; };
  const closeCard = async (page) => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(900);
  };
  const openWeek = async (page) => {
    await page.evaluate(() => { const b = document.querySelector('[data-weeknav]'); if (b) b.click(); });
    await page.waitForTimeout(2200);
  };

  const page = await context.newPage();
  page.on('dialog', async d => { await d.dismiss().catch(() => {}); });
  await page.goto('http://127.0.0.1:' + PORT + '/index_main.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('スケジュール') && !document.body.innerText.includes('担当者を選択'), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // ── 1. 開き方（スケジュール画面のナビ）──
  {
    const b = {};
    b.navWeek = await boxOf(page, sel, '[data-weeknav]');
    b.navSched = await boxOf(page, btn, 'スケジュール');
    b.navCal = await boxOf(page, btn, 'カレンダー');
    b.navGroup = await boxOf(page, () => { const e = document.querySelector('[data-weeknav]'); return e && e.parentElement; });
    await shoot(page, 'w1-open-sched.png', 'スケジュール画面（週間カレンダーの入口）', b);
  }

  // ── 2. 週間カレンダー（開いた直後＝畳んだ状態）──
  await openWeek(page);
  {
    const b = {};
    b.title = await boxOf(page, () => [...document.querySelectorAll('b')].find(e => /タイムスケジュール（週）/.test(e.textContent)));
    b.navPrev = await boxOf(page, sel, '[data-wnav="-1"]');
    b.navToday = await boxOf(page, sel, '[data-wnav="0"]');
    b.navNext = await boxOf(page, sel, '[data-wnav="1"]');
    b.navGroup = union(b.navPrev, b.navToday, b.navNext);
    b.find = await boxOf(page, sel, '[data-wfind]');
    b.fold = await boxOf(page, sel, '[data-wfold]');
    b.from = await boxOf(page, sel, '[data-wfrom]');
    b.fs = await boxOf(page, sel, '[data-wfs]');
    b.close = await boxOf(page, sel, '[data-wclose]');
    b.dayBtn = await boxOf(page, () => document.querySelectorAll('[data-wday]')[0]);
    b.dayCnt = await boxOf(page, () => document.querySelectorAll('[data-wdaycnt]')[0]);
    b.dayRow = await boxOf(page, () => { const e = document.querySelectorAll('[data-wday]')[0]; return e && e.closest('tr'); });
    b.inspAdd = await boxOf(page, () => document.querySelectorAll('[data-wiadd]')[0]);
    b.inspRow = await boxOf(page, () => { const e = document.querySelectorAll('[data-wins]')[0]; return e && e.closest('tr'); });
    b.inspBadge = await boxOf(page, () => document.querySelectorAll('[data-wcb]')[0]);
    b.staffRow = await boxOf(page, () => { const e = document.querySelectorAll('[data-wstf]')[0]; return e && e.closest('tr'); });
    b.foldPlus = await boxOf(page, () => document.querySelectorAll('[data-wfoldplus]')[0]);
    b.foldPlusRow = await boxOf(page, sel, '[data-wfoldadd]');
    b.today = await boxOf(page, sel, '[data-wtoday="1"]');
    b.ent = await boxOf(page, () => document.querySelectorAll('[data-went]')[0]);
    await shoot(page, 'w2-week-folded.png', '週間カレンダー（開いた直後＝畳んだ状態）', b);
  }

  // ── 3. 「▼ 開く」で時間の行を全部出す ──
  await click(page, '[data-wfold]', 1500);
  {
    const b = {};
    b.fold = await boxOf(page, sel, '[data-wfold]');
    b.timeCol = await boxOf(page, () => { const rows = [...document.querySelectorAll('tr')].filter(r => /^\d{2}:\d{2}/.test(r.textContent.trim())); if (!rows.length) return null;
      const a = rows[0].children[0].getBoundingClientRect(), z = rows[rows.length - 1].children[0].getBoundingClientRect();
      const d = document.createElement('div'); return { getBoundingClientRect: () => ({ left: a.left, top: a.top, width: a.width, height: z.bottom - a.top }) }; });
    b.addCell = await boxOf(page, () => document.querySelectorAll('[data-wadd]')[8]);
    b.ent = await boxOf(page, () => document.querySelectorAll('[data-went]')[0]);
    b.foot = await boxOf(page, sel, '[data-wfoot]');
    await shoot(page, 'w3-week-open.png', '週間カレンダー（▼ 開く＝時間の行を全部出す）', b);
  }
  await click(page, '[data-wfold]', 1500);   // 畳んだ状態に戻す

  // ── 4. 車検の「＋」→ 車検予約カード ──
  {
    const ok = await click(page, '[data-wiadd]', 2200);
    const fieldOf = (t) => { const l = [...document.querySelectorAll('label')].find(l => l.offsetParent !== null && l.textContent.trim().replace(/\s/g, '').startsWith(t)); return l && l.parentElement; };
    const b = {};
    b.head = await boxOf(page, () => document.querySelector('.booking-modal-inner') && document.querySelector('.booking-modal-inner').firstElementChild);
    b.name = await boxOf(page, () => { const d = [...document.querySelectorAll('div')].find(e => e.offsetParent !== null && /^来店者氏名/.test(e.textContent.trim()) && e.textContent.trim().length < 12); return d && d.parentElement; });
    b.staff = await boxOf(page, fieldOf, '担当');
    b.course = await boxOf(page, fieldOf, 'コース');
    b.time = await boxOf(page, fieldOf, '入庫時間');
    b.save = await boxOf(page, btn, '確定して登録');
    await shoot(page, 'w4-insp-card.png', '車検の＋から開いた予約カード', b);
    if (ok) await closeCard(page);
  }

  // ── 5. 畳んだ表の「＋ 予定」→ 一般（整備）の予約カード（時間はカードの中で選ぶ）──
  {
    const ok = await click(page, '[data-wfoldplus]', 2200);
    const fieldOf = (t) => { const l = [...document.querySelectorAll('label')].find(l => l.offsetParent !== null && l.textContent.trim().replace(/\s/g, '').startsWith(t)); return l && l.parentElement; };
    const b = {};
    b.head = await boxOf(page, () => document.querySelector('.booking-modal-inner') && document.querySelector('.booking-modal-inner').firstElementChild);
    b.slot = await boxOf(page, fieldOf, '時間');
    b.name = await boxOf(page, fieldOf, '氏名');
    b.staff = await boxOf(page, fieldOf, '担当');
    b.work = await boxOf(page, fieldOf, '作業内容');
    b.save = await boxOf(page, btn, '予約確定');
    await shoot(page, 'w5-sched-card.png', '＋ 予定 から開いた一般（整備）の予約カード', b);
    // 時間帯のポップを開いた所も撮る
    await page.evaluate(() => { const e = document.querySelector('[data-kbkey="slot"]'); if (e) e.click(); });
    await page.waitForTimeout(700);
    const b2 = {};
    b2.slot = await boxOf(page, fieldOf, '時間');
    b2.pop = await boxOf(page, sel, '[data-popgrid="slot"]');
    b2.am = await boxOf(page, sel, '[data-slotid="午前"]');
    b2.undec = await boxOf(page, sel, '[data-slotid="未定"]');
    await shoot(page, 'w5b-sched-slot.png', '時間帯のポップ（全部ならぶ）', b2);
    if (ok) await closeCard(page);
  }

  // ── 6. 空き検索の帯（車検）──
  await click(page, '[data-wfind]', 1400);
  {
    const b = {};
    b.find = await boxOf(page, sel, '[data-wfind]');
    b.bar = await boxOf(page, sel, '[data-wfindbar]');
    b.kindInsp = await boxOf(page, sel, '[data-wkind="insp"]');
    b.kindSched = await boxOf(page, sel, '[data-wkind="sched"]');
    b.course1 = await boxOf(page, sel, '[data-wcourse="1"]');
    b.course2 = await boxOf(page, sel, '[data-wcourse="2"]');
    b.course3 = await boxOf(page, sel, '[data-wcourse="3"]');
    b.courseGroup = union(b.course1, b.course2, b.course3);
    b.go = await boxOf(page, sel, '[data-wgo]');
    b.clr = await boxOf(page, sel, '[data-wclr]');
    b.hint = await boxOf(page, () => { const e = document.querySelector('[data-wgo]'); const p = e && e.previousElementSibling; return (p && /枠|台/.test(p.textContent)) ? p : null; });
    await shoot(page, 'w6-find-insp-bar.png', '空き検索の帯（車検）', b);
  }

  // ── 7. 車検の空き検索を実行 ──
  await click(page, '[data-wgo]', 1800);
  {
    const b = {};
    b.bar = await boxOf(page, sel, '[data-wfindbar]');
    b.res = await boxOf(page, sel, '[data-wres]');
    b.lab = await boxOf(page, () => document.querySelectorAll('[data-wdaylab]')[0]);
    b.inspCell = await boxOf(page, () => { const e = document.querySelectorAll('[data-wdaylab]')[0]; return e && e.closest('td'); });
    b.dim = await boxOf(page, () => { const t = [...document.querySelectorAll('[data-wdim="1"]')].find(x => x.tagName === 'TH'); return t; });
    b.clr = await boxOf(page, sel, '[data-wclr]');
    await shoot(page, 'w7-find-insp-run.png', '車検の空き検索（結果）', b);
  }

  // ── 8. 整備（一般）の空き検索 ──
  await click(page, '[data-wkind="sched"]', 1200);
  {
    const b = {};
    b.bar = await boxOf(page, sel, '[data-wfindbar]');
    b.kindSched = await boxOf(page, sel, '[data-wkind="sched"]');
    b.min30 = await boxOf(page, sel, '[data-wmin="30"]');
    b.min60 = await boxOf(page, sel, '[data-wmin="60"]');
    b.min90 = await boxOf(page, sel, '[data-wmin="90"]');
    b.min120 = await boxOf(page, sel, '[data-wmin="120"]');
    b.minGroup = union(b.min30, b.min60, b.min90, b.min120);
    b.go = await boxOf(page, sel, '[data-wgo]');
    await shoot(page, 'w8-find-sched-bar.png', '空き検索の帯（整備）', b);
  }
  await click(page, '[data-wmin="60"]', 800);
  await click(page, '[data-wgo]', 2000);
  {
    const b = {};
    b.bar = await boxOf(page, sel, '[data-wfindbar]');
    b.res = await boxOf(page, sel, '[data-wres]');
    b.go = await boxOf(page, sel, '[data-wgo]');
    b.clr = await boxOf(page, sel, '[data-wclr]');
    b.blk = await boxOf(page, () => {
      const amber = c => String(c || '').replace(/ /g, '').indexOf('245,158,11') >= 0;
      const rows = [...document.querySelectorAll('tr')];
      for (const tr of rows) {
        for (let i = 1; i < tr.children.length; i++) {
          const td = tr.children[i];
          if (!amber(getComputedStyle(td).borderTopColor)) continue;
          // 同じ列を下へたどって、底の線が出るまでを1つの塊とみなす
          let a = td.getBoundingClientRect(), bot = a.bottom, r = rows.indexOf(tr);
          for (let j = r; j < rows.length; j++) {
            const c2 = rows[j].children[i]; if (!c2) break;
            const cs = getComputedStyle(c2);
            if (!amber(cs.borderLeftColor) && !amber(cs.borderTopColor) && !amber(cs.borderBottomColor)) break;
            bot = c2.getBoundingClientRect().bottom;
            if (amber(cs.borderBottomColor)) break;
          }
          return { getBoundingClientRect: () => ({ left: a.left, top: a.top, width: a.width, height: bot - a.top }) };
        }
      }
      return null;
    });
    await shoot(page, 'w9-find-sched-run.png', '整備の空き検索（結果）', b);
  }
  await click(page, '[data-wclr]', 1200);

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(shots, null, 1), 'utf8');
  console.log('\n撮影 ' + shots.length + ' 枚 → ' + OUT_DIR);
  console.log('つぎに: node build_manual4_pptx.js');
  await context.close(); await browser.close(); server.close();
  process.exit(0);
})().catch(e => { console.error('撮影が止まりました:', e); process.exit(1); });
