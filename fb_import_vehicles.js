// エクセル「代車・レンタカーデータ貸出表.xlsx」を新しい車両管理へ取り込む（2026-10-05 ユーザー依頼）
//   node fb_import_vehicles.js                 … 下見（何台どう入るか見るだけ）
//   node fb_import_vehicles.js --write --dev   … テスト版へ書き込む（本番へは --dev を外す。まずはテスト版だけ）
//
//   ・赤い網掛け（FF0000）の車＝売却済みなど → archived:true（アーカイブ箱）
//   ・赤以外の塗り色＝車体色 → colorHex に引き継ぐ
//   ・「工場代車」と「鈑金レンタカー」の2つの固まりを group で分ける（表を切り離して出すため）
//   ・レンタカーの区画は列が1つずれている（ナビ値段が無い）ので吸収する
//   ・「展示車 三田」のように目的と所在地が混ざっているので分ける。八多・北神・ハ多は本店に寄せる
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const XLSX = require(path.join(MOD, 'xlsx'));
const admin = require(path.join(MOD, 'firebase-admin'));
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const SRC = process.env.HUB_VEH_XLSX || 'C:/Users/A/Downloads/代車・レンタカーデータ貸出表.xlsx';
const WRITE = process.argv.indexOf('--write') >= 0;
const DEV = process.argv.indexOf('--dev') >= 0;
const STOR = DEV ? 'hub-v8-dev-' : 'hub-v8-';

// ── 色（車体色）：エクセルの塗り色 → 画面で出す色 ──
const THEME_HEX = { 0: '#ffffff', 1: '#000000', 2: '#eeece1', 3: '#1f497d', 4: '#4f81bd', 5: '#c0504d', 6: '#9bbb59', 7: '#8064a2', 8: '#4bacc6', 9: '#f79646' };
const fillHex = f => !f ? '' : (f.startsWith('theme') ? (THEME_HEX[Number(f.slice(5))] || '') : ('#' + f));

// ── 目的（エクセルの「目的」欄はいろいろな書き方が混ざっている）──
const purposeOf = (txt, group) => {
  const t = String(txt || '');
  if (group === 'rental') return 'rental';
  if (/社用/.test(t)) return 'company';
  if (/展示/.test(t)) return 'exhibit';
  if (/代車/.test(t)) return 'loaner';
  if (/業販|出品|商品/.test(t)) return 'other';
  return t.trim() ? 'other' : 'loaner';
};
// 所在地：八多・北神・ハ多 は本店。三田だけ三田店
const storeOf = (...txts) => {
  const t = txts.map(x => String(x || '')).join(' ');
  if (/三田/.test(t)) return 'sanda';
  return 'honten';
};
const userOf = txt => { const m = String(txt || '').match(/社用車\s*(.+?)\s*使用中/); return m ? m[1].trim() : ''; };
// R表記（R10.02.20 / R09.5.14 / Ｒ10.７.28）→ 2028-02-20
const jp2iso = (s) => {
  const t = String(s || '').replace(/[Ｒｒ]/g, 'R').replace(/[０-９]/g, c => '０１２３４５６７８９'.indexOf(c)).replace(/[．／]/g, '.');
  const m = t.match(/R\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?:\s*[.\-\/]\s*(\d{1,2}))?/);
  if (!m) return '';
  const y = 2018 + Number(m[1]);            // 令和1年=2019 → R10=2028
  const mo = String(Number(m[2])).padStart(2, '0');
  const d = m[3] ? String(Number(m[3])).padStart(2, '0') : '';
  return d ? `${y}-${mo}-${d}` : `${y}-${mo}`;
};
// 1か月・6か月の実施日（3/3/22 や 2026/2/29 や「やり忘れ」）
//   ★先の日付（今日より後）は「予定」であって実施済みではない（2026-10-05 ユーザー指摘）
const TODAY = new Date().toISOString().slice(0, 10);
const asDone = (iso) => iso > TODAY ? { doneAt: '', planAt: iso, note: '' } : { doneAt: iso, note: '' };
const doneOf = (s) => {
  const t = String(s || '').trim();
  if (!t || /やり忘れ|無し|貨物/.test(t)) return { doneAt: '', note: t };
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return asDone(`${y}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`); }
  m = t.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
  if (m) return asDone(`${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`);
  return { doneAt: '', note: t };
};
// メーカー（スズキ車かどうかで点検アラートの有無が変わる）。車名と仕入先から推測し、画面で直せる
const SUZUKI_RE = /ハスラー|スペーシア|スペカス|スぺカス|アルト|ラパン|ワゴン|ジムニ|ソリオ|バンディット|スイフト|スイスポ|エブリィ|クロスビー|スマイル|ギア|シエラ|ノマド|キャリイ|エスクード/;
const TOYOTA_RE = /ヴォクシー|ノア|ライズ|アクア|プリウス|ハイエース|カローラ|ヤリス|シエンタ|フォレスター/;
const makerOf = (name, supplier) => {
  const t = String(name || '');
  if (SUZUKI_RE.test(t)) return 'スズキ';
  if (TOYOTA_RE.test(t)) return /フォレスター/.test(t) ? 'スバル' : 'トヨタ';
  const sp = String(supplier || '');
  if (/自販兵庫|スズキ/.test(sp)) return 'スズキ';
  if (/ネッツ|トヨペット/.test(sp)) return 'トヨタ';
  return '';
};
const plate4 = num => { const m = String(num || '').match(/(\d{1,4})(?!.*\d)/); return m ? m[1] : ''; };
// 4ナンバー（貨物）かどうか：分類番号の頭が4
const is4 = num => /[^\d](4\d{2}|4\d|4)[あ-ん]/.test(String(num || '')) || /\s?4\d{2}[あ-ん]/.test(String(num || ''));

(async () => {
  const wb = XLSX.readFile(SRC, { cellStyles: true, bookFiles: true });
  const getf = n => { const f = wb.files[n]; return f.asNodeBuffer ? f.asNodeBuffer().toString('utf8') : String(f.content || ''); };
  // 塗り色を拾う
  const styles = getf('xl/styles.xml');
  const fills = ((styles.match(/<fills[\s\S]*?<\/fills>/) || [''])[0].match(/<fill>[\s\S]*?<\/fill>/g) || []).map(x => {
    if (!/patternType="solid"/.test(x)) return '';
    const m = x.match(/<fgColor([^/]*)\/>/); if (!m) return '';
    const rgb = (m[1].match(/rgb="([0-9A-Fa-f]{6,8})"/) || [])[1];
    const th = (m[1].match(/theme="(\d+)"/) || [])[1];
    return rgb ? rgb.slice(-6) : (th != null ? 'theme' + th : '');
  });
  const xfs = ((styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf [^>]*?\/?>/g) || []).map(x => Number((x.match(/fillId="(\d+)"/) || [])[1] || 0));
  const sheet = getf('xl/worksheets/sheet1.xml');
  const cellFill = {};
  (sheet.match(/<c [^>]*>/g) || []).forEach(c => {
    const r = (c.match(/r="([A-Z]+\d+)"/) || [])[1]; const s = Number((c.match(/ s="(\d+)"/) || [])[1] || 0);
    if (r) cellFill[r] = fills[xfs[s]] || '';
  });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: '', raw: false });

  const out = [];
  let group = 'factory';
  rows.forEach((r, i) => {
    const a = String(r[0] || '').trim();
    if (/鈑金レンタカー|レンタカー/.test(a)) group = 'rental';
    else if (/工場代車/.test(a)) group = 'factory';
    const name = String(r[2] || '').trim();
    if (!name || name === '車名' || /常時\d+台/.test(name)) return;
    const at = (c) => cellFill[XLSX.utils.encode_col(c) + (i + 1)] || '';
    // レンタカーの区画は「ナビ値段」が無く、以降が1つ左へずれる
    const shift = group === 'rental' ? -1 : 0;
    // ★レンタカーの区画でずれるのは 7〜11 だけ。12（1か月）・13（6か月）は同じ位置（2026-10-05 修正）
    const col = n => String(r[n + ((n >= 7 && n <= 11) ? shift : 0)] || '').trim();
    const navYen = group === 'rental' ? '' : String(r[7] || '').trim();
    const expiryRaw = col(8), supplier = col(9), firstRaw = col(10), extra = col(11);
    const m1 = doneOf(col(12)), m6 = doneOf(col(13));
    const purposeTxt = String(r[5] || '').trim();
    const fillName = at(2);
    const archived = fillName === 'FF0000';
    const num = String(r[3] || '').trim();
    out.push({
      id: 'v' + (i + 1) + '_' + plate4(num),
      group, name, num, plate4: plate4(num),
      colorHex: archived ? '' : fillHex(fillName),
      purpose: purposeOf(purposeTxt, group),
      purposeRaw: purposeTxt,
      user: userOf(purposeTxt),
      store: storeOf(purposeTxt, extra),
      tire: 'summer',                       // ★読み込み時は全部「夏」でそろえる（2026-10-05 ユーザー指示）
      insurance: String(r[4] || '').trim() === '○',
      nav: col(6), navYen,
      supplier,
      firstReg: jp2iso(firstRaw) || firstRaw,
      expiry: jp2iso(expiryRaw) || '',
      expiryRaw,
      maker: makerOf(name, supplier), model: '', cargo4: is4(num),
      usedNew: false,
      // ★レンタカーは現在すべて点検済み（日付は分からないので「済」だけ付ける。2026-10-05 ユーザー指示）
      inspections: group === 'rental'
        ? { m1: { done: true, doneAt: m1.doneAt || '' }, m6: { done: true, doneAt: m6.doneAt || '' }, m12: [{ done: true, doneAt: '' }] }
        : { m1, m6, m12: [] },
      docs: [],
      note: [extra && !/三田|八多|北神|ハ多/.test(extra) ? extra : '', m1.note, m6.note].filter(Boolean).join(' / '),
      archived, archivedAt: archived ? '2026-10-05' : '',
      row: i + 1,
      createdAt: new Date().toISOString(),
    });
  });

  const live = out.filter(v => !v.archived), arch = out.filter(v => v.archived);
  const cnt = (arr, k) => { const o = {}; arr.forEach(v => { o[v[k]] = (o[v[k]] || 0) + 1; }); return o; };
  console.log('読み込み: ' + out.length + '台（現役 ' + live.length + ' / アーカイブ ' + arch.length + '）');
  console.log('  固まり: ' + JSON.stringify(cnt(out, 'group')));
  console.log('  目的（現役）: ' + JSON.stringify(cnt(live, 'purpose')));
  console.log('  所在地（現役）: ' + JSON.stringify(cnt(live, 'store')));
  console.log('  車検満了を読めた: ' + live.filter(v => v.expiry).length + ' / ' + live.length);
  console.log('  使用者が入った社用車: ' + live.filter(v => v.user).map(v => v.user).join(', '));
  console.log('--- 現役の例 ---');
  live.slice(0, 5).forEach(v => console.log('  ' + [v.group, v.name, v.num, v.purpose, v.store, v.tire, v.expiry, v.firstReg, v.colorHex, v.insurance ? '保険○' : '保険×'].join(' | ')));

  if (!WRITE) { console.log(String.fromCharCode(10) + '※ 下見です。書き込むには --write（テスト版は --dev も）'); process.exit(0); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
  const db = admin.firestore();
  const key = STOR + 'vehicles-v2';
  const before = await db.collection('kv').doc(key).get();
  if (before.exists) {
    const f = 'C:/Users/A/Documents/Hub重要書類/vehicles-v2-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    fs.writeFileSync(f, before.data().v || '[]');
    console.log('今の中身を控えに保存: ' + f);
  }
  await db.collection('kv').doc(key).set({ v: JSON.stringify(out), u: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log('書き込みました: ' + key + '（' + out.length + '台）');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
