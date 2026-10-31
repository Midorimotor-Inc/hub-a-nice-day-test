// hub_paper.js ── 毎朝の控え（JSON）から「紙の控え」（1枚のHTML）を作る
//
//   使い方：
//     node hub_paper.js                 … いちばん新しい本番の控えから作る
//     node hub_paper.js --dev           … テスト版の控えから作る
//     node hub_paper.js --file <JSON>   … 使う控えを指定する
//     node hub_paper.js --out <場所>    … 出す場所を変える（既定は下の OUT_DIR）
//
//   出すもの：Hub控え-YYYY-MM-DD.html（1個だけ・外から何も読み込まない）
//     ・ネットが無くてもダブルクリックで開ける（Node も要らない。開くのはブラウザだけ）
//     ・中は 予定表／代車管理表／顧客／車両／休日 の5つ。どこからでも見て印刷できる
//
//   ★ここで作る HTML にはお客様の氏名・電話が入る。リポジトリにも OneDrive にも置かないこと。
//   ★Firestore には一切つながらない（毎朝の JSON を読むだけ）。鍵も要らない。

const fs = require('fs');
const path = require('path');

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const DEV = process.argv.indexOf('--dev') >= 0;
const SRC_DIR = arg('--src', 'C:/Users/A/Documents/Hub重要書類/hub-backup');
const OUT_DIR = arg('--out', 'C:/Users/A/Documents/Hub重要書類/Hub控え');
const MIRROR = (() => {
  const d = arg('--also', 'G:/マイドライブ/Hub控え');
  if (d === 'off') return '';
  try { if (fs.existsSync(path.dirname(d))) return d; } catch (e) {}
  return '';
})();
const KEEP = Math.max(1, Number(arg('--keep', '7')) || 7);

// ── 使う控えを決める（指定が無ければ、いちばん新しいもの）──
const pickSrc = () => {
  const f = arg('--file', '');
  if (f) return f;
  const head = 'hub-backup-' + (DEV ? 'dev' : 'prod') + '-';
  const list = fs.readdirSync(SRC_DIR).filter(x => x.indexOf(head) === 0 && x.endsWith('.json')).sort();
  if (!list.length) { console.error('✖ ' + SRC_DIR + ' に ' + head + '*.json が見つかりません'); process.exit(1); }
  return path.join(SRC_DIR, list[list.length - 1]);
};

const SRC = pickSrc();
const book = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const RAW = book.data || {};
const PREFIX = book.接頭辞 || (DEV ? 'hub-v8-dev-' : 'hub-v8-');
const ENVNAME = book.環境 || (DEV ? 'テスト版' : '本番');

const P = (key) => {
  const v = RAW[PREFIX + key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return v; }
};

// ── 日付の道具 ───────────────────────────────────────────
//   ★Hub の中では日付キーが2通りある（insp は 2026-11-15 と 2026-12-7 が混在、
//     sched/dayoff/memo は 2026-10-2 のような0なし）。どちらでも拾えるようにする。
const pad = n => String(n).padStart(2, '0');
const toYmd = (dk) => { const a = String(dk).split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; };
const norm = (dk) => { const t = toYmd(dk); return t.y + '-' + pad(t.m) + '-' + pad(t.d); };
const loose = (dk) => { const t = toYmd(dk); return t.y + '-' + t.m + '-' + t.d; };
const okDk = (dk) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(dk));
const pick2 = (obj, dk) => { if (!obj) return undefined; const a = obj[norm(dk)]; return a !== undefined ? a : obj[loose(dk)]; };
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dowOf = (dk) => { const t = toYmd(dk); return new Date(t.y, t.m - 1, t.d).getDay(); };
const label = (dk) => { const t = toYmd(dk); return t.y + '年' + t.m + '月' + t.d + '日（' + DOW[dowOf(dk)] + '）'; };
const short = (dk) => { const t = toYmd(dk); return t.m + '/' + t.d + '（' + DOW[dowOf(dk)] + '）'; };
const addDays = (dk, n) => { const t = toYmd(dk); const d = new Date(t.y, t.m - 1, t.d + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const madeAt = new Date(book.作成日時 || Date.now());
const madeDk = madeAt.getFullYear() + '-' + pad(madeAt.getMonth() + 1) + '-' + pad(madeAt.getDate());
const stamp = book.作成日時_表示 || madeAt.toLocaleString('ja-JP');

const COURSES = { 1: 'マッハ', 2: 'クイック', 3: 'レギュラー' };
const WORKS = { Q: 'クイック整備・修理', '⑫': '12ヶ月点検', M12: 'メンパ12ヶ月', M6: 'メンパ6ヶ月', N1: '新車1ヶ月', N6: '新車6ヶ月', B: '鈑金塗装', R: 'リコール', 商: '商談', 保: '保険', 試: '試乗', 納: '納車', 他: 'その他' };
const STORES = [{ id: 'honten', name: '本店' }, { id: 'sanda', name: '三田店' }];
const sama = (n) => { const s = String(n == null ? '' : n).trim(); return (!s || /様|さん|御中|店$|社$|会社/.test(s)) ? s : s + ' 様'; };

// ── ① 予定表（日ごと）─────────────────────────────────
const insp = P('insp') || {};
const inspArch = P('insp-arch') || {};
const sched = {}, lres = {}, cars = {}, dayoff = {}, pleave = {}, memo = {}, closed = {}, staff = {};
STORES.forEach(s => {
  sched[s.id] = P(s.id + '-sched') || {};
  lres[s.id] = P(s.id + '-lres') || {};
  cars[s.id] = P(s.id + '-cars') || [];
  dayoff[s.id] = P(s.id + '-dayoff') || {};
  pleave[s.id] = P(s.id + '-pleave') || {};
  memo[s.id] = P(s.id + '-memo') || {};
  staff[s.id] = (P(s.id + '-staff-v2') || P(s.id + '-staff') || []).filter(x => x && x.name).map(x => x.name);
  closed[s.id] = { dates: (P(s.id + '-cdate') || []).map(norm), dow: (P(s.id + '-cdow-v2') || P(s.id + '-cdow') || []).map(Number) };
});
const rentalCars = P('rentalcars') || [];
const rres = P('rres') || {};

const isClosed = (sid, dk) => closed[sid].dates.indexOf(norm(dk)) >= 0 || closed[sid].dow.indexOf(dowOf(dk)) >= 0;

// 代車・レンタカーの貸出（期間 → 日ごとに展開できる形にそろえる）
const loanRows = (sid) => {
  const out = [];
  const byId = {};
  (sid === 'rental' ? rentalCars : cars[sid]).forEach(c => { byId[String(c.id)] = c; });
  const src = sid === 'rental' ? rres : lres[sid];
  Object.keys(src || {}).forEach(carId => {
    const book = src[carId] || {};
    Object.keys(book).forEach(k => {
      const r = book[k];
      if (!r || !r.fy) return;
      const c = byId[String(carId)] || byId[String(r.carId)] || {};
      const f = r.fy + '-' + pad(r.fm) + '-' + pad(r.fd);
      const t = (r.ty || r.fy) + '-' + pad(r.tm || r.fm) + '-' + pad(r.td || r.fd);
      out.push({
        carId: String(carId), car: r.carName || c.name || '（不明）', num: String(r.carNum || c.num || ''),
        user: r.user || '', f: f, t: (t < f ? f : t), kind: sid === 'rental' ? 'レンタカー' : '代車',
        key: r.bookingKey || ''
      });
    });
  });
  return out.sort((a, b) => cmp(a.f, b.f) || cmp(a.car, b.car));
};
const LOANS = { honten: loanRows('honten'), sanda: loanRows('sanda'), rental: loanRows('rental') };

// どの日を入れるか：控えを作った日の7日前から。予定のある日はすべて。先の30日はカラでも入れる
const dayKeys = (sid) => {
  const from = addDays(madeDk, -7);
  const set = {};
  const add = dk => { if (okDk(dk) && norm(dk) >= from) set[norm(dk)] = 1; };
  Object.keys(insp).forEach(dk => { if ((insp[dk] || []).some(r => (r.store || 'honten') === sid)) add(dk); });
  Object.keys(sched[sid]).forEach(add);
  Object.keys(memo[sid]).forEach(dk => { if ((pick2(memo[sid], dk) || []).length) add(dk); });
  Object.keys(dayoff[sid]).forEach(dk => { if ((pick2(dayoff[sid], dk) || []).length) add(dk); });
  LOANS[sid].concat(LOANS.rental).forEach(r => { if (r.t >= from) { add(r.f); add(r.t); } });
  for (let i = -7; i <= 30; i++) add(addDays(madeDk, i));
  return Object.keys(set).sort();
};

const dayOf = (sid, dk) => {
  const il = (pick2(insp, dk) || []).filter(r => (r.store || 'honten') === sid)
    .sort((a, b) => cmp(a.time || a.bookingTime || 'zz', b.time || b.bookingTime || 'zz'))
    .map(r => ({
      time: r.time || r.bookingTime || '', name: sama(r.name), carType: r.carType || '', no: String(r.no || ''),
      course: COURSES[r.course] || '', phone: r.phone || '', loaner: r.loaner || r.rentalLabel || '',
      staff: r.staff || '', note: [r.note, r.entryDate ? '前日入庫 ' + r.entryDate : '', r.deliveryDate ? '納車 ' + r.deliveryDate + ' ' + (r.deliveryTime || '') : ''].filter(Boolean).join(' / ')
    }));
  const sd = pick2(sched[sid], dk) || {};
  const sl = Object.keys(sd).sort().map(k => {
    const r = sd[k] || {};
    return {
      time: k.split('__')[0], name: sama(r.name), carType: r.carType || '', no: String(r.no || ''),
      phone: r.phone || '', work: WORKS[r.work] || r.work || '', content: r.content || '',
      loaner: r.loaner || r.rentalLabel || '', staff: r.staff || ''
    };
  });
  const lent = LOANS[sid].concat(LOANS.rental).filter(r => r.f <= norm(dk) && norm(dk) <= r.t)
    .map(r => ({ car: r.car, num: r.num, user: sama(r.user), span: short(r.f) + '〜' + short(r.t), kind: r.kind }));
  const used = {};
  LOANS[sid].filter(r => r.f <= norm(dk) && norm(dk) <= r.t).forEach(r => { used[r.carId] = 1; });
  const free = cars[sid].filter(c => !used[String(c.id)]).map(c => c.name + ' ' + c.num);
  const mm = (pick2(memo[sid], dk) || []).map(x => (typeof x === 'string' ? x : (x && x.content) || '')).filter(Boolean);
  const off = (pick2(dayoff[sid], dk) || []).slice();
  const paid = (pick2(pleave[sid], dk) || []).slice();
  return {
    dk: norm(dk), label: label(dk), short: short(dk), closed: isClosed(sid, dk),
    insp: il, sched: sl, loan: lent, free: free, memo: mm,
    off: off.map(n => (paid.indexOf(n) >= 0 ? n + '（有給）' : n)).concat(paid.filter(n => off.indexOf(n) < 0).map(n => n + '（有給）'))
  };
};

const DAYS = {};
STORES.forEach(s => { DAYS[s.id] = dayKeys(s.id).map(dk => dayOf(s.id, dk)); });

// ── ② 顧客（満了月ごと）───────────────────────────────
//   ★細かい方（cf-<満了月>-chunk-N）を先に読む。1件を呼び出して紙にする時、
//     検索用の索引（cf-search-*）だけでは氏名・車・電話しか無くて足りないため。
const CUSTF = (P('cf-index') || []).map(x => ({ name: x.name, count: x.count })).sort((a, b) => cmp(a.name, b.name));
const STATUS = { none: '未予約', temp: '仮予約', confirm: '本予約', cancel: 'キャンセル', new_car: '初回車検' };
let CUST = [];
CUSTF.forEach(f => {
  const idx = P('cf-' + f.name + '-index');
  const n = Number(idx && idx.chunks) || 0;
  for (let i = 0; i < n; i++) {
    const a = P('cf-' + f.name + '-chunk-' + i);
    if (!Array.isArray(a)) continue;
    a.forEach(r => CUST.push({
      i: r.custId || '', n: r.name || '', c: r.carType || '', no: String(r.no == null ? '' : r.no),
      e: r.expiry || '', f: f.name,
      p: r.phoneMobile || r.phoneHome || '', ph: r.phoneHome || '', pm: r.phoneMobile || '',
      a: r.address || '',
      st: r.store === 'sanda' ? '三田店' : r.store === 'honten' ? '本店' : '',
      sf: r.staff || '', co: COURSES[r.course] || '', tk: (r.tokuten && r.tokuten !== '-') ? r.tokuten : '',
      sta: STATUS[r.status] || '', d1: r.dm1Date || '', d1b: r.dm1Book || '', d2: r.dm2Date || '', d2b: r.dm2Book || '',
      en: r.entryDate || '', bt: r.bookingTime || '', li: r.linkedInspDate || '', nt: r.note || ''
    }));
  }
});
// 細かい方が無い控えのときは、検索用の索引で間に合わせる（中身は少ない）
if (!CUST.length) {
  const si = P('cf-search-index') || { chunks: 0 };
  for (let i = 0; i < Number(si.chunks || 0); i++) {
    const a = P('cf-search-chunk-' + i);
    if (Array.isArray(a)) a.forEach(c => CUST.push({
      i: c.i || '', n: c.n || '', c: c.c || '', no: String(c.no == null ? '' : c.no), e: c.e || '', f: c.f || '',
      p: c.p || '', ph: '', pm: c.p || '', a: c.a || '', st: '', sf: '', co: '', tk: '', sta: '',
      d1: '', d1b: '', d2: '', d2b: '', en: '', bt: '', li: '', nt: ''
    }));
  }
}
CUST.sort((a, b) => cmp(a.e, b.e) || cmp(a.n, b.n));

// ── ③ 車両台帳 ───────────────────────────────────────
const PURPOSE = { loaner: '代車', rental: 'レンタカー', exhibit: '展示車', company: '社用車', other: 'その他' };
const VEH = (P('vehicles-v2') || []).filter(v => v && !v.archived).map(v => {
  const ins = v.inspections || {};
  const next = Object.keys(ins).map(k => ins[k]).filter(x => x && x.dueAt && !x.doneAt)
    .sort((a, b) => cmp(a.dueAt, b.dueAt))[0];
  return {
    group: v.group === 'rental' ? 'レンタカー' : '工場', purpose: PURPOSE[v.purpose] || v.purposeRaw || '',
    store: v.store === 'sanda' ? '三田店' : v.store === 'honten' ? '本店' : '',
    name: v.name || '', num: v.num || '', plate4: v.plate4 || '', maker: v.maker || '',
    expiry: v.expiryRaw || v.expiry || '', expiryKey: v.expiry || '', tire: v.tire === 'summer' ? '夏' : v.tire === 'winter' ? '冬' : '',
    nav: v.nav || '', supplier: v.supplier || '', user: v.user || '', firstReg: v.firstReg || '',
    next: next ? (next.name || '') + ' ' + (next.dueAt || '') : '', note: v.note || ''
  };
}).sort((a, b) => cmp(a.expiryKey || 'zzzz', b.expiryKey || 'zzzz'));

// ── ④ 代車管理表（月ごとのグリッド）用に、月の一覧を作る ───────
const months = (() => {
  const set = {};
  ['honten', 'sanda', 'rental'].forEach(k => LOANS[k].forEach(r => {
    const a = toYmd(r.f), b = toYmd(r.t);
    for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m++) { if (m > 12) { m = 1; y++; } set[y + '-' + pad(m)] = 1; }
  }));
  set[madeDk.slice(0, 7)] = 1;
  return Object.keys(set).sort();
})();

const CARS = {
  honten: cars.honten.map(c => ({ id: String(c.id), name: c.name, num: String(c.num || '') })),
  sanda: cars.sanda.map(c => ({ id: String(c.id), name: c.name, num: String(c.num || '') })),
  rental: rentalCars.map(c => ({ id: String(c.id), name: c.name, num: String(c.num || '') }))
};

// ── ⑤ 休日表 ────────────────────────────────────────
const OFF = {};
STORES.forEach(s => {
  const o = {};
  Object.keys(dayoff[s.id]).forEach(dk => { if (okDk(dk)) { o[norm(dk)] = o[norm(dk)] || { off: [], paid: [] }; o[norm(dk)].off = (dayoff[s.id][dk] || []).slice(); } });
  Object.keys(pleave[s.id]).forEach(dk => { if (okDk(dk)) { o[norm(dk)] = o[norm(dk)] || { off: [], paid: [] }; o[norm(dk)].paid = (pleave[s.id][dk] || []).slice(); } });
  OFF[s.id] = o;
});
const offMonths = (() => {
  const set = {};
  STORES.forEach(s => Object.keys(OFF[s.id]).forEach(dk => { set[dk.slice(0, 7)] = 1; }));
  set[madeDk.slice(0, 7)] = 1;
  return Object.keys(set).sort();
})();

// ── 出すデータ（この1個だけが HTML に埋まる）──────────────
const DATA = {
  env: ENVNAME, stamp: stamp, madeDk: madeDk, src: path.basename(SRC),
  stores: STORES, days: DAYS, cars: CARS, loans: LOANS, months: months,
  cust: CUST, custFiles: CUSTF, veh: VEH, off: OFF, offMonths: offMonths,
  staff: staff, mholidays: P('mholidays') || {}
};

// ══════════════════════════════════════════════════════
//  ここから下は、できる HTML の中身
// ══════════════════════════════════════════════════════
const CSS = [
  ":root{--ink:#1b2129;--ink2:#475569;--ink3:#94a3b8;--line:#cbd5e1;--blue:#1d4ed8;--bg:#f1f5f9}",
  "*{box-sizing:border-box;margin:0;padding:0}",
  "[hidden]{display:none!important}",
  "body{font-family:-apple-system,'Yu Gothic','Hiragino Sans',Meiryo,sans-serif;color:var(--ink);background:var(--bg);font-size:13px;line-height:1.6}",
  ".wrap{max-width:1180px;margin:0 auto;padding:14px 16px 60px}",
  ".top{background:#fff;border:2px solid var(--blue);border-radius:12px;padding:12px 14px;margin-bottom:12px}",
  ".top h1{font-size:17px;font-weight:900}.top .sub{font-size:12px;color:var(--ink2);margin-top:4px}",
  ".stamp{display:inline-block;background:#eff6ff;color:var(--blue);border:1px solid #bfdbfe;border-radius:8px;padding:3px 9px;font-weight:800;font-size:12px;margin-top:7px}",
  ".stamp.old{background:#fef2f2;color:#b91c1c;border-color:#fecaca}",
  ".warn{margin-top:9px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:12px;color:#b45309}",
  ".tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}",
  ".tb{font:inherit;font-size:13px;font-weight:800;padding:8px 14px;border-radius:9px 9px 0 0;border:1.5px solid var(--line);border-bottom:none;background:#fff;color:var(--ink2);cursor:pointer}",
  ".tb.on{background:var(--blue);border-color:var(--blue);color:#fff}",
  ".pick{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin-bottom:12px}",
  ".pick .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pick label{font-weight:800;font-size:12.5px}",
  "input[type=search],select{font:inherit;font-size:14px;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:#fff}",
  "input[type=search]{min-width:230px}",
  ".days{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;max-height:116px;overflow:auto}",
  ".day{border:1px solid var(--line);background:#fff;border-radius:7px;padding:4px 8px;font-size:12px;cursor:pointer;white-space:nowrap}",
  ".day.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:800}",
  ".day .n{color:var(--ink3);margin-left:5px;font-size:11px}.day.on .n{color:#c7d8ff}",
  ".day.closed{background:#f8fafc;color:var(--ink3)}",
  ".btn{font:inherit;font-weight:800;font-size:13px;padding:8px 15px;border-radius:9px;border:none;cursor:pointer;background:var(--blue);color:#fff}",
  ".btn.ghost{background:#fff;color:var(--ink2);border:1.5px solid var(--line)}",
  ".sheet{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:12px}",
  ".sheet h2{font-size:19px;font-weight:900;border-bottom:3px solid var(--ink);padding-bottom:6px;margin-bottom:4px}",
  ".sheet .meta{font-size:12px;color:var(--ink2);margin-bottom:12px}",
  "h3{font-size:13.5px;font-weight:900;margin:16px 0 6px;padding-left:8px;border-left:4px solid var(--blue)}",
  "h3.r{border-left-color:#dc2626}h3.g{border-left-color:#047857}h3.a{border-left-color:#b45309}",
  "table{width:100%;border-collapse:collapse}",
  "th,td{border:1px solid var(--line);padding:5px 6px;font-size:12px;vertical-align:top}",
  "th{background:#f1f5f9;font-weight:800;font-size:11.5px;white-space:nowrap}",
  "thead{display:table-header-group}tr{break-inside:avoid}",
  "td.c{text-align:center;white-space:nowrap}",
  ".tel{font-variant-numeric:tabular-nums;white-space:nowrap}",
  ".chk{display:inline-block;width:13px;height:13px;border:1.5px solid #64748b;border-radius:3px}",
  ".tag{display:inline-block;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:800;background:#f1f5f9;color:#475569}",
  ".none{color:var(--ink3);font-size:12px;padding:6px 2px}",
  ".memo{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:12px}",
  ".blank td{height:30px}.blank th{font-size:11px}",
  // お客様1件の用紙
  ".pick1{cursor:pointer}.pick1:hover td{background:#eff6ff}",
  ".kv th{width:118px;text-align:left;background:#f8fafc}",
  ".kv td{font-size:13.5px}",
  // 代車管理表（月間グリッド）
  ".grid{table-layout:fixed}",
  ".grid th,.grid td{padding:2px 1px;font-size:10.5px;text-align:center;overflow:hidden;white-space:nowrap}",
  ".grid th.car,.grid td.car{text-align:left;width:120px;font-size:11px;white-space:normal}",
  ".grid td.on{background:#dbeafe;font-weight:800;color:#1e3a8a}",
  ".grid th.sun,.grid td.sun{background:#fff1f2}.grid th.sat,.grid td.sat{background:#eff6ff}",
  ".grid td.on.sun,.grid td.on.sat{background:#dbeafe}",
  // 休日表
  ".offg td.o{background:#fee2e2;font-weight:800;color:#991b1b}",
  ".offg td.y{background:#fef3c7;font-weight:800;color:#92400e}",
  "@page{size:A4 portrait;margin:11mm 10mm}",
  "@page land{size:A4 landscape;margin:8mm 8mm}",
  "@media print{",
  "body{background:#fff;font-size:11px}.wrap{max-width:none;padding:0}",
  ".noprint{display:none!important}",
  ".sheet{border:none;border-radius:0;padding:0;margin:0}",
  ".sheet+.sheet{break-before:page}",
  "th,td{font-size:10px;padding:3px 4px}.sheet h2{font-size:15px}h3{margin:10px 0 4px}",
  ".land{page:land}",
  ".grid th,.grid td{font-size:8.5px;padding:1px 0}",
  "}"
].join("");

// 画面の中で動く仕掛け（外の部品は一切使わない）
const JS = `
var D = window.HUBDATA;
var E = function(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
var $ = function(id){ return document.getElementById(id); };
var DOW = ['日','月','火','水','木','金','土'];
var pad = function(n){ return (n<10?'0':'')+n; };

/* ─── タブ ─────────────────────────────── */
var TABS = ['t1','t2','t3','t4','t5','t6'];
function tab(id){
  TABS.forEach(function(t){ $(t).hidden = (t!==id); });
  [].slice.call(document.querySelectorAll('.tb')).forEach(function(b){
    b.className = (b.getAttribute('data-t')===id) ? 'tb on' : 'tb';
  });
  window.scrollTo(0,0);
}
[].slice.call(document.querySelectorAll('.tb')).forEach(function(b){
  b.onclick = function(){ tab(b.getAttribute('data-t')); };
});

/* ─── ① 予定表 ──────────────────────────── */
var curStore = 'honten', curDk = '';
function days(){ return D.days[curStore] || []; }
function dayBy(dk){ var a=days(); for(var i=0;i<a.length;i++) if(a[i].dk===dk) return a[i]; return null; }

function tbl(rows, cols){
  if(!rows.length) return '<div class=none>（ありません）</div>';
  var h = '<table><thead><tr>' + cols.map(function(c){
    return '<th'+(c.w?" style='width:"+c.w+"px'":'')+'>'+c.t+'</th>'; }).join('') + '</tr></thead><tbody>';
  h += rows.map(function(r){
    return '<tr>' + cols.map(function(c){
      if(c.chk) return '<td class=c><span class=chk></span></td>';
      return '<td'+(c.c?' class=c':(c.tel?' class=tel':''))+'>'+E(c.v(r))+'</td>';
    }).join('') + '</tr>';
  }).join('');
  return h + '</tbody></table>';
}

function daySheet(d){
  var store = curStore==='honten' ? '本店' : '三田店';
  var h = '<div class=sheet>';
  h += '<h2>'+E(d.label)+'　'+E(store)+(d.closed?" <span style='color:#b45309'>【休業日】</span>":'')+'</h2>';
  h += '<div class=meta>車検 '+d.insp.length+'台 ／ 整備 '+d.sched.length+'件 ／ 代車の貸出 '+d.loan.length+'台　|　この写しは '+E(D.stamp)+' 時点</div>';
  h += '<h3 class=r>🚗 車検（入庫予定）</h3>';
  h += tbl(d.insp, [{t:'入庫',w:52,c:1,v:function(r){return r.time||'未定';}},{t:'済',w:34,chk:1},
    {t:'氏名',v:function(r){return r.name;}},{t:'車種',v:function(r){return r.carType;}},{t:'ナンバー',w:60,c:1,v:function(r){return r.no;}},
    {t:'コース',w:70,c:1,v:function(r){return r.course;}},{t:'電話',w:104,tel:1,v:function(r){return r.phone;}},
    {t:'代車',w:110,v:function(r){return r.loaner;}},{t:'担当',w:58,c:1,v:function(r){return r.staff;}},{t:'備考',v:function(r){return r.note;}}]);
  h += '<h3>⏰ 整備（タイムスケジュール）</h3>';
  h += tbl(d.sched, [{t:'時間',w:52,c:1,v:function(r){return r.time;}},{t:'済',w:34,chk:1},
    {t:'氏名',v:function(r){return r.name;}},{t:'車種',v:function(r){return r.carType;}},{t:'ナンバー',w:60,c:1,v:function(r){return r.no;}},
    {t:'電話',w:104,tel:1,v:function(r){return r.phone;}},{t:'区分',w:90,v:function(r){return r.work;}},
    {t:'内容',v:function(r){return r.content;}},{t:'代車',w:100,v:function(r){return r.loaner;}},{t:'担当',w:58,c:1,v:function(r){return r.staff;}}]);
  h += '<h3 class=g>🚙 代車・レンタカー（この日に貸している分）</h3>';
  h += tbl(d.loan, [{t:'車',w:130,v:function(r){return r.car;}},{t:'ナンバー',w:60,c:1,v:function(r){return r.num;}},
    {t:'貸出先',v:function(r){return r.user;}},{t:'期間',w:150,c:1,v:function(r){return r.span;}},{t:'区分',w:76,c:1,v:function(r){return r.kind;}}]);
  if(d.free.length) h += "<div style='margin-top:6px;font-size:12px;color:#475569'><b>空いている代車：</b>"+E(d.free.join(' ／ '))+'</div>';
  h += '<h3 class=a>📝 備考・スタッフ休日</h3>';
  if(d.memo.length || d.off.length){
    h += '<div class=memo>';
    if(d.memo.length) h += '<b>備考：</b>'+d.memo.map(E).join('<br>')+(d.off.length?'<br>':'');
    if(d.off.length) h += '<b>休日：</b>'+d.off.map(function(x){return '<span class=tag>'+E(x)+'</span>';}).join(' ');
    h += '</div>';
  } else h += '<div class=none>（ありません）</div>';
  return h + '</div>';
}

function drawDays(){
  var a = days(), box = $('days'), sel = $('dsel');
  box.innerHTML = ''; sel.innerHTML = '';
  a.forEach(function(d){
    var o = document.createElement('option');
    o.value = d.dk; o.textContent = d.label + (d.dk===D.madeDk?'　本日':'');
    sel.appendChild(o);
    var b = document.createElement('span');
    b.className = d.closed ? 'day closed' : 'day';
    b.setAttribute('data-dk', d.dk);
    b.innerHTML = E(d.short) + '<span class=n>' + (d.closed ? '休' : (d.insp.length+d.sched.length)) + '</span>';
    b.onclick = function(){ showDay(d.dk); };
    box.appendChild(b);
  });
  var first = dayBy(D.madeDk) ? D.madeDk : (a.length ? a[0].dk : '');
  if(first) showDay(first);
}
function showDay(dk, also){
  curDk = dk; $('dsel').value = dk;
  [].slice.call($('days').children).forEach(function(b){
    var d = dayBy(b.getAttribute('data-dk'));
    b.className = (b.getAttribute('data-dk')===dk) ? ((d&&d.closed?'day closed':'day')+' on') : (d&&d.closed?'day closed':'day');
  });
  var list = [dayBy(dk)];
  if(also){ var a=days(); for(var i=0;i<a.length;i++) if(a[i].dk===dk && a[i+1]) list.push(a[i+1]); }
  $('sheets').innerHTML = list.filter(Boolean).map(daySheet).join('');
}
$('dsel').onchange = function(){ showDay(this.value); };
$('dstore').onchange = function(){ curStore = this.value; drawDays(); };
$('p1').onclick = function(){ showDay(curDk); print(); };
$('p2').onclick = function(){ showDay(curDk, true); print(); };

/* ─── ② 代車管理表 ───────────────────────── */
function lgrid(){
  var who = $('lstore').value, ym = $('lmonth').value;
  var y = +ym.split('-')[0], m = +ym.split('-')[1];
  var last = new Date(y, m, 0).getDate();
  var cars = D.cars[who] || [], res = D.loans[who] || [];
  var head = '<tr><th class=car>車（ナンバー）</th>';
  for(var i=1;i<=last;i++){
    var w = new Date(y,m-1,i).getDay();
    head += '<th class="'+(w===0?'sun':w===6?'sat':'')+'">'+i+'<br>'+DOW[w]+'</th>';
  }
  head += '</tr>';
  var body = cars.map(function(c){
    var mine = res.filter(function(r){ return r.carId===c.id; });
    var row = '<td class=car>'+E(c.name)+'<br><span style="color:#64748b">'+E(c.num)+'</span></td>';
    var day = 1;
    while(day<=last){
      var dk = y+'-'+pad(m)+'-'+pad(day);
      var hit = null;
      for(var i=0;i<mine.length;i++) if(mine[i].f<=dk && dk<=mine[i].t){ hit = mine[i]; break; }
      var w = new Date(y,m-1,day).getDay(), cls = (w===0?' sun':w===6?' sat':'');
      if(hit){
        var end = day;
        while(end<last){ var nx = y+'-'+pad(m)+'-'+pad(end+1); if(nx<=hit.t) end++; else break; }
        var n = end-day+1;
        row += '<td class="on'+cls+'" colspan='+n+'>'+E(hit.user||'貸出')+'</td>';
        day = end+1;
      } else { row += '<td class="'+cls.trim()+'"></td>'; day++; }
    }
    return '<tr>'+row+'</tr>';
  }).join('');
  var inM = res.filter(function(r){ return r.f.slice(0,7)<=ym && ym<=r.t.slice(0,7); })
    .sort(function(a,b){ return a.f<b.f?-1:a.f>b.f?1:0; });
  var name = who==='honten'?'本店の代車':who==='sanda'?'三田店の代車':'レンタカー';
  var h = '<div class="sheet land"><h2>'+E(name)+'　'+y+'年'+m+'月　代車管理表</h2>';
  h += '<div class=meta>この写しは '+E(D.stamp)+' 時点　|　青いマスが貸出中（名前は貸出先）</div>';
  h += cars.length ? '<table class=grid><thead>'+head+'</thead><tbody>'+body+'</tbody></table>' : '<div class=none>（車がありません）</div>';
  h += '</div><div class="sheet"><h2>'+E(name)+'　'+y+'年'+m+'月　貸出の一覧</h2>';
  h += tbl(inM, [{t:'車',w:140,v:function(r){return r.car;}},{t:'ナンバー',w:62,c:1,v:function(r){return r.num;}},
    {t:'貸出先',v:function(r){return r.user;}},
    {t:'開始',w:84,c:1,v:function(r){return r.f;}},{t:'返却',w:84,c:1,v:function(r){return r.t;}},
    {t:'日数',w:48,c:1,v:function(r){ return Math.round((new Date(r.t.replace(/-/g,'/'))-new Date(r.f.replace(/-/g,'/')))/86400000)+1; }},
    {t:'区分',w:76,c:1,v:function(r){return r.kind;}},{t:'もとの予約',w:150,v:function(r){return r.key;}}]);
  h += '</div>';
  $('lout').innerHTML = h;
}
$('lstore').onchange = lgrid; $('lmonth').onchange = lgrid;
$('p3').onclick = function(){ print(); };

/* ─── ③ 顧客 ───────────────────────────── */
var bare = function(s){ return String(s||'').replace(/[\\s　]/g,'').replace(/様$/,''); };

function cust(){
  $('cback').hidden = true; $('p4').textContent = '🖨 いま出ている分を印刷';
  var f = $('cfile').value, q = ($('cq').value||'').trim(), all = $('call').checked;
  var hit = [];
  for(var i=0;i<D.cust.length;i++){
    var c = D.cust[i];
    if(f && c.f!==f) continue;
    if(q && (c.n+' '+c.c+' '+c.no+' '+c.p+' '+c.a+' '+c.nt).indexOf(q)<0) continue;
    hit.push(i);
  }
  var cut = all ? hit : hit.slice(0,300);
  $('cn').textContent = '全'+D.cust.length+'件のうち '+hit.length+'件'
    + (cut.length<hit.length ? '（はじめの'+cut.length+'件だけ出しています。「全部出す」にチェックすると全件）' : '')
    + '　／　行をクリックすると、その1件だけの用紙になります';
  var ttl = (f? f.slice(0,4)+'年'+(+f.slice(4))+'月 車検満了のお客様' : 'お客様一覧') + (q? '　「'+q+'」' : '');
  var rows = cut.map(function(k){
    var c = D.cust[k];
    return '<tr class=pick1 data-k='+k+'>'
      + '<td class=c>'+E(c.e)+'</td><td>'+E(c.n)+'</td><td>'+E(c.c)+'</td><td class=c>'+E(c.no)+'</td>'
      + '<td class=tel>'+E(c.p)+'</td><td class=c>'+E(c.sta)+'</td><td class=c>'+E(c.st)+'</td>'
      + '<td>'+E(c.a||c.nt)+'</td><td class=c><span class=chk></span></td></tr>';
  }).join('');
  $('cout').innerHTML = '<div class=sheet><h2>'+E(ttl)+'</h2>'
    + '<div class=meta>'+cut.length+'件　|　この写しは '+E(D.stamp)+' 時点</div>'
    + (cut.length
      ? '<table><thead><tr><th style="width:82px">車検満了</th><th style="width:130px">氏名</th>'
        + '<th style="width:110px">車種</th><th style="width:58px">ナンバー</th><th style="width:104px">電話</th>'
        + '<th style="width:62px">予約</th><th style="width:52px">店</th><th>住所・備考</th><th style="width:30px">済</th>'
        + '</tr></thead><tbody>'+rows+'</tbody></table>'
      : '<div class=none>（見つかりません）</div>')
    + '</div>';
  [].slice.call(document.querySelectorAll('#cout tr.pick1')).forEach(function(tr){
    tr.onclick = function(){ card(+tr.getAttribute('data-k')); };
  });
}

/* その1件だけの用紙（何千件の中から呼び出して、これを1枚刷る） */
function card(k){
  var c = D.cust[k];
  $('cback').hidden = false; $('p4').textContent = '🖨 この1件を印刷';
  var key = bare(c.n), plan = [];
  ['honten','sanda'].forEach(function(sid){
    var sname = sid==='honten'?'本店':'三田店';
    (D.days[sid]||[]).forEach(function(d){
      d.insp.forEach(function(r){ if(key && bare(r.name)===key)
        plan.push({d:d.label, s:sname, k:'車検'+(r.course?'（'+r.course+'）':''), t:r.time||'未定',
          m:[r.loaner?'代車 '+r.loaner:'', r.note].filter(Boolean).join(' / '), w:r.staff}); });
      d.sched.forEach(function(r){ if(key && bare(r.name)===key)
        plan.push({d:d.label, s:sname, k:r.work||'整備', t:r.time, m:r.content, w:r.staff}); });
    });
  });
  var kv = function(t,v){ return v ? '<tr><th>'+t+'</th><td>'+E(v)+'</td></tr>' : ''; };
  var h = '<div class=sheet><h2>'+E(c.n)+' 様</h2>'
    + '<div class=meta>お客様の用紙　|　この写しは '+E(D.stamp)+' 時点</div>'
    + '<table class=kv>'
    + kv('車検満了', c.e) + kv('車種', c.c) + kv('ナンバー', c.no)
    + kv('携帯', c.pm) + kv('自宅', c.ph) + kv('住所', c.a)
    + kv('予約の状態', c.sta) + kv('コース', c.co) + kv('特典', c.tk)
    + kv('お店', c.st) + kv('担当', c.sf)
    + kv('入庫予定', [c.en, c.bt].filter(Boolean).join(' ')) + kv('車検の予定日', c.li)
    + kv('DM 1回目', [c.d1, c.d1b].filter(Boolean).join('　'))
    + kv('DM 2回目', [c.d2, c.d2b].filter(Boolean).join('　'))
    + kv('備考', c.nt) + kv('お客様番号', c.i)
    + '</table>'
    + '<h3>📅 この方の予定（この写しに入っている範囲）</h3>'
    + tbl(plan, [{t:'日',w:150,v:function(r){return r.d;}},{t:'店',w:56,c:1,v:function(r){return r.s;}},
      {t:'区分',w:110,v:function(r){return r.k;}},{t:'時間',w:52,c:1,v:function(r){return r.t;}},
      {t:'内容',v:function(r){return r.m;}},{t:'担当',w:62,c:1,v:function(r){return r.w;}}])
    + '<h3 class=a>✍ 窓口メモ（手書き用）</h3>'
    + '<table class=blank><tbody><tr><td></td></tr><tr><td></td></tr><tr><td></td></tr><tr><td></td></tr></tbody></table>'
    + '</div>';
  $('cout').innerHTML = h;
  window.scrollTo(0,0);
}
$('cback').onclick = cust;
$('cfile').onchange = cust; $('cq').oninput = cust; $('call').onchange = cust;
$('p4').onclick = function(){ print(); };

/* ─── ④ 車両台帳 ─────────────────────────── */
function veh(){
  var g = $('vg').value, p = $('vp').value, q = ($('vq').value||'').trim();
  var hit = D.veh.filter(function(v){
    if(g && v.group!==g) return false;
    if(p && v.purpose!==p) return false;
    if(q && (v.name+' '+v.num+' '+v.maker+' '+v.user+' '+v.note).indexOf(q)<0) return false;
    return true;
  });
  $('vn').textContent = '全'+D.veh.length+'台のうち '+hit.length+'台';
  $('vout').innerHTML = '<div class="sheet land"><h2>車両台帳'+(g?'（'+E(g)+'）':'')+(p?'　'+E(p):'')+'</h2>'
    + '<div class=meta>'+hit.length+'台　車検満了の早い順　|　この写しは '+E(D.stamp)+' 時点</div>'
    + tbl(hit, [{t:'車検満了',w:70,c:1,v:function(v){return v.expiry;}},{t:'区分',w:60,c:1,v:function(v){return v.purpose;}},
      {t:'置き場',w:50,c:1,v:function(v){return v.store;}},{t:'車名',w:150,v:function(v){return v.name;}},
      {t:'ナンバー',w:120,v:function(v){return v.num;}},{t:'メーカー',w:60,c:1,v:function(v){return v.maker;}},
      {t:'初度登録',w:60,c:1,v:function(v){return v.firstReg;}},{t:'タイヤ',w:40,c:1,v:function(v){return v.tire;}},
      {t:'ナビ',w:70,v:function(v){return v.nav;}},{t:'使用者',w:80,v:function(v){return v.user;}},
      {t:'次の点検',w:110,v:function(v){return v.next;}},{t:'備考',v:function(v){return v.note;}}])
    + '</div>';
}
$('vg').onchange = veh; $('vp').onchange = veh; $('vq').oninput = veh;
$('p5').onclick = function(){ print(); };

/* ─── ⑤ 休日表 ─────────────────────────── */
function offg(){
  var sid = $('ostore').value, ym = $('omonth').value;
  var y = +ym.split('-')[0], m = +ym.split('-')[1];
  var last = new Date(y, m, 0).getDate();
  var names = (D.staff[sid]||[]).slice();
  var book = D.off[sid] || {};
  for(var i=1;i<=last;i++){
    var o = book[y+'-'+pad(m)+'-'+pad(i)];
    if(o) (o.off||[]).concat(o.paid||[]).forEach(function(n){ if(names.indexOf(n)<0) names.push(n); });
  }
  var head = '<tr><th class=car>スタッフ</th>';
  for(var i=1;i<=last;i++){ var w=new Date(y,m-1,i).getDay(); head += '<th class="'+(w===0?'sun':w===6?'sat':'')+'">'+i+'<br>'+DOW[w]+'</th>'; }
  head += '<th style="width:44px">休</th><th style="width:44px">有</th></tr>';
  var body = names.map(function(n){
    var row = '<td class=car>'+E(n)+'</td>', c1=0, c2=0;
    for(var i=1;i<=last;i++){
      var o = book[y+'-'+pad(m)+'-'+pad(i)] || {};
      var w = new Date(y,m-1,i).getDay(), base = (w===0?'sun':w===6?'sat':'');
      var paid = (o.paid||[]).indexOf(n)>=0, off = (o.off||[]).indexOf(n)>=0;
      if(paid){ c2++; row += '<td class="y '+base+'">有</td>'; }
      else if(off){ c1++; row += '<td class="o '+base+'">休</td>'; }
      else row += '<td class="'+base+'"></td>';
    }
    return '<tr>'+row+'<td>'+c1+'</td><td>'+c2+'</td></tr>';
  }).join('');
  var mh = D.mholidays[y+'-'+m];
  $('oout').innerHTML = '<div class="sheet land"><h2>'+(sid==='honten'?'本店':'三田店')+'　'+y+'年'+m+'月　スタッフ休日表</h2>'
    + '<div class=meta>休＝公休　有＝有給'+(mh?'　|　この月の公休日数は '+mh+'日':'')+'　|　この写しは '+E(D.stamp)+' 時点</div>'
    + (names.length ? '<table class="grid offg"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>' : '<div class=none>（スタッフがいません）</div>')
    + '</div>';
}
$('ostore').onchange = offg; $('omonth').onchange = offg;
$('p6').onclick = function(){ print(); };

/* ─── 立ち上げ ───────────────────────────── */
(function(){
  D.months.forEach(function(ym){
    var o=document.createElement('option'); o.value=ym;
    o.textContent = ym.slice(0,4)+'年'+(+ym.slice(5))+'月'; $('lmonth').appendChild(o);
  });
  var nowYm = D.madeDk.slice(0,7);
  $('lmonth').value = D.months.indexOf(nowYm)>=0 ? nowYm : D.months[D.months.length-1];
  D.offMonths.forEach(function(ym){
    var o=document.createElement('option'); o.value=ym;
    o.textContent = ym.slice(0,4)+'年'+(+ym.slice(5))+'月'; $('omonth').appendChild(o);
  });
  $('omonth').value = D.offMonths.indexOf(nowYm)>=0 ? nowYm : D.offMonths[D.offMonths.length-1];
  D.custFiles.forEach(function(f){
    var o=document.createElement('option'); o.value=f.name;
    o.textContent = f.name.slice(0,4)+'年'+(+f.name.slice(4))+'月（'+f.count+'件）'; $('cfile').appendChild(o);
  });
  var ps = {}; D.veh.forEach(function(v){ if(v.purpose) ps[v.purpose]=1; });
  Object.keys(ps).forEach(function(p){ var o=document.createElement('option'); o.value=p; o.textContent=p; $('vp').appendChild(o); });
  var st = $('stamp'), made = new Date(D.madeDk.replace(/-/g,'/'));
  if((Date.now()-made.getTime())/86400000 > 2){ st.className='stamp old'; st.textContent='⚠ '+st.textContent+'　← この写しは古いです'; }
  drawDays(); lgrid(); cust(); veh(); offg(); tab('t1');
})();
`;

const blankRows = (n) => Array.from({ length: n }, () => "<tr>" + "<td></td>".repeat(10) + "<td class=c><span class=chk></span></td></tr>").join("");

const HTML = '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
  + '<title>Hub控え ' + madeDk + '（' + ENVNAME + '）</title>\n<style>' + CSS + '</style>\n</head>\n<body>\n<div class="wrap">\n'
  + '<div class="top noprint"><h1>Hub a Nice Day ／ 紙の控え（オフライン）</h1>'
  + '<div class="sub">ネットが使えない時用の写しです。この1ファイルに <b>予定表・代車管理表・お客様・車両・休日</b> が全部入っています。見たいところを選んで印刷してください。</div>'
  + '<span class="stamp" id="stamp">📅 この写しをつくった時刻：' + stamp + '（' + ENVNAME + '）</span>'
  + '<div class="warn"><b>ここに書き込んでも、システムには反映されません。</b>'
  + 'ネットが止まっている間に受けた予約は、「受付メモ用紙」を印刷して手書きし、戻ってから Hub に入力してください。</div></div>\n'
  + '<div class="tabs noprint">'
  + '<button class="tb on" data-t="t1">📅 予定表</button>'
  + '<button class="tb" data-t="t2">🚙 代車管理表</button>'
  + '<button class="tb" data-t="t3">👤 お客様</button>'
  + '<button class="tb" data-t="t4">🚗 車両台帳</button>'
  + '<button class="tb" data-t="t5">🏖 休日表</button>'
  + '<button class="tb" data-t="t6">✍ 受付メモ用紙</button></div>\n'

  // ① 予定表
  + '<div id="t1"><div class="pick noprint"><div class="row">'
  + '<label for="dstore">お店</label><select id="dstore"><option value="honten">本店</option><option value="sanda">三田店</option></select>'
  + '<label for="dsel">日にち</label><select id="dsel"></select>'
  + '<button class="btn" id="p1">🖨 この日を印刷</button>'
  + '<button class="btn ghost" id="p2">🖨 この日＋次の日</button></div>'
  + '<div class="days" id="days"></div></div><div id="sheets"></div></div>\n'

  // ② 代車管理表
  + '<div id="t2" hidden><div class="pick noprint"><div class="row">'
  + '<label for="lstore">どれ</label><select id="lstore"><option value="honten">本店の代車</option><option value="sanda">三田店の代車</option><option value="rental">レンタカー</option></select>'
  + '<label for="lmonth">月</label><select id="lmonth"></select>'
  + '<button class="btn" id="p3">🖨 この月を印刷（横置き）</button></div></div><div id="lout"></div></div>\n'

  // ③ お客様
  + '<div id="t3" hidden><div class="pick noprint"><div class="row">'
  + '<label for="cfile">車検満了の月</label><select id="cfile"><option value="">ぜんぶ</option></select>'
  + '<label for="cq">さがす</label><input id="cq" type="search" placeholder="氏名・車種・ナンバー・電話・住所">'
  + '<label><input type="checkbox" id="call"> 全部出す</label>'
  + '<button class="btn ghost" id="cback" hidden>← 一覧にもどる</button>'
  + '<button class="btn" id="p4">🖨 いま出ている分を印刷</button></div>'
  + '<div id="cn" style="font-size:12px;color:#64748b;margin-top:6px"></div></div><div id="cout"></div></div>\n'

  // ④ 車両台帳
  + '<div id="t4" hidden><div class="pick noprint"><div class="row">'
  + '<label for="vg">どこの</label><select id="vg"><option value="">ぜんぶ</option><option value="工場">工場</option><option value="レンタカー">レンタカー</option></select>'
  + '<label for="vp">区分</label><select id="vp"><option value="">ぜんぶ</option></select>'
  + '<label for="vq">さがす</label><input id="vq" type="search" placeholder="車名・ナンバー・メーカー">'
  + '<button class="btn" id="p5">🖨 いま出ている分を印刷（横置き）</button></div>'
  + '<div id="vn" style="font-size:12px;color:#64748b;margin-top:6px"></div></div><div id="vout"></div></div>\n'

  // ⑤ 休日表
  + '<div id="t5" hidden><div class="pick noprint"><div class="row">'
  + '<label for="ostore">お店</label><select id="ostore"><option value="honten">本店</option><option value="sanda">三田店</option></select>'
  + '<label for="omonth">月</label><select id="omonth"></select>'
  + '<button class="btn" id="p6">🖨 この月を印刷（横置き）</button></div></div><div id="oout"></div></div>\n'

  // ⑥ 受付メモ用紙
  + '<div id="t6" hidden><div class="pick noprint"><div class="row">'
  + '<button class="btn" onclick="print()">🖨 受付メモ用紙を印刷</button>'
  + '<span style="font-size:12px;color:#64748b">ネットが止まっている間に受けた予約を手書きする紙です</span></div></div>'
  + '<div class="sheet"><h2>オフライン受付メモ</h2>'
  + '<div class="meta">ネットが止まっている間に受けた予約を手書きしてください。<br>'
  + '戻ったら上の行から順に Hub へ入力し、入力できた行の「入力済」に ✓ を付けてください。'
  + 'この用紙は入力後1週間ほど保管してから、シュレッダーで破棄してください（電話番号が入ります）。</div>'
  + '<table class="blank"><thead><tr>'
  + ['受けた日', '受けた人', 'お客様の氏名', '電話', '車種', 'ナンバー', '区分', '希望の日時', '代車', '内容・ご要望', '入力済']
      .map(t => '<th>' + t + '</th>').join('') + '</tr></thead><tbody>'
  + blankRows(16) + '</tbody></table></div></div>\n'

  + '</div>\n<script>window.HUBDATA=' + JSON.stringify(DATA).replace(/</g, '\\u003c') + ';</scr' + 'ipt>\n'
  + '<scr' + 'ipt>' + JS + '</scr' + 'ipt>\n</body>\n</html>\n';

// ── 書き出す ────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
const name = 'Hub控え-' + (DEV ? 'テスト版-' : '') + madeDk + '.html';
const out = path.join(OUT_DIR, name);
fs.writeFileSync(out, HTML, 'utf8');

const kb = Math.round(fs.statSync(out).size / 1024);
console.log('■ もとの控え：' + path.basename(SRC) + '（' + ENVNAME + '・' + stamp + '）');
console.log('■ 紙の控えを作りました：' + out + '（' + kb + 'KB）');
console.log('   予定表 本店' + DAYS.honten.length + '日 ／ 三田店' + DAYS.sanda.length + '日'
  + '　代車 本店' + CARS.honten.length + '台・三田' + CARS.sanda.length + '台・レンタカー' + CARS.rental.length + '台'
  + '　お客様' + CUST.length + '件　車両' + VEH.length + '台');

// 古い紙の控えを片づける（同じ環境のものだけ）
try {
  const head = 'Hub控え-' + (DEV ? 'テスト版-' : '');
  const mine = fs.readdirSync(OUT_DIR)
    .filter(f => f.indexOf(head) === 0 && f.endsWith('.html') && (DEV || f.indexOf('テスト版') < 0))
    .sort().reverse();
  mine.slice(KEEP).forEach(f => { try { fs.unlinkSync(path.join(OUT_DIR, f)); console.log('   （古い紙の控えを片づけました：' + f + '）'); } catch (e) {} });
} catch (e) {}

// Google ドライブへ写し（あれば）
if (MIRROR) {
  try {
    fs.mkdirSync(MIRROR, { recursive: true });
    fs.copyFileSync(out, path.join(MIRROR, name));
    console.log('■ ドライブにも写しました：' + path.join(MIRROR, name));
  } catch (e) { console.log('△ ドライブへの写しは今回できませんでした（' + e.message + '）。PCの控えは取れています'); }
} else {
  console.log('△ ドライブ（' + 'G:/マイドライブ' + '）が見えないので、写しは飛ばしました');
}
