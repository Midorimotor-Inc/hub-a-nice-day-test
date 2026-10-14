// DEV→本番 移植スクリプト
// 使い方:  node port_to_main.js              ← 3ファイル全部
//          node port_to_main.js mobile       ← 対象を絞る（index / customers / mobile を空白区切りで指定可）
//
// index_dev.html → ../hub-a-nice-day/index_main.html
// customers.html → ../hub-a-nice-day/customers.html
// mobile.html    → ../hub-a-nice-day/mobile.html
// をコピーし、環境固有の差分（STOR・タイトル・DEVバッジ・配色）を本番用に変換する。
//
// ★安全装置: 各置換ルールは「DEV側に必ず存在するはず」のパターン。1件もマッチしない
//   ルールがあれば、DEV側のコードが変わってパターンが古くなった合図なので中断する
//   （黙って移植して配色やSTORが混ざる事故を防ぐ）。最後にDEVマーカー残骸も全チェック。
const fs = require('fs');
const path = require('path');

const DEV_DIR = __dirname;
const MAIN_DIR = path.resolve(__dirname, '..', 'hub-a-nice-day');

// [検索文字列, 置換文字列, 期待最少件数] — 文字列は完全一致（正規表現ではない）
const INDEX_RULES = [
  // 接続先データの分離（最重要）
  ["const STOR = 'hub-v8-dev-';", "const STOR = 'hub-v8-';", 1],
  // 2026-09-18：本番も Firestore＋Firebase Auth（BACKEND='firebase'・AUTH_REQUIRED=true）。変換ルールは無し。
  //   本番のデータは fb_migrate.js --prod --write で写してから移植する（GAS 側はその時点で控えになる）。
  // タイトル
  ['<title>Hub a Nice Day [テスト版]</title>', '<title>Hub a Nice Day</title>', 1],
  // PWA の設定ファイル名（テスト版 manifest_dev.json ／ メイン manifest.json）
  ['<link rel="manifest" href="manifest_dev.json" />', '<link rel="manifest" href="manifest.json" />', 1],
  // 環境識別の配色: 全体背景・ログイン画面（オレンジ→青）
  ['linear-gradient(140deg,#7c2d12,#EA580C,#f97316)', 'linear-gradient(140deg,#1e3a8a,#1d4ed8,#2563eb)', 3],
  // ヘッダーの帯の色（A案・2026-10-14）。店を切り替えると帯ごと店の色になる。
  //   テスト版は両店ともオレンジ／メインは 本店＝青・三田店＝赤。色はこの2つの定数だけを通すこと。
  ["const UI_HEAD='#EA580C';", "const UI_HEAD='linear-gradient(135deg,#1e3a8a,#1d4ed8)';", 1],
  ["const UI_HEAD_S=UI_HEAD;", "const UI_HEAD_S='linear-gradient(135deg,#7f1d1d,#dc2626)';", 1],
  // ヘッダーロゴ文字色
  ["gap:7,fontSize:16,fontWeight:800,color:'#9a3412'", "gap:7,fontSize:16,fontWeight:800,color:'white'", 1],
  // 戻るボタン（DEVグレー→本番グリーン）※代車管理の BACK_S は2026-09-12からDEVも緑なので変換しない
  ["<button onClick={onClose} style={{padding:'11px 14px',background:'#f3f4f6',border:'none',borderRadius:9,fontWeight:600,cursor:'pointer',fontSize:12}}>戻る</button>",
   "<button onClick={onClose} style={{padding:'11px 14px',background:'#16a34a',border:'none',borderRadius:9,fontWeight:700,cursor:'pointer',fontSize:12,color:'white'}}>戻る</button>", 2],
];
// 正規表現ルール（DEVバッジspan・キャッシュバスト）
const INDEX_REGEX_RULES = [
  [/\s*<span style=\{\{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FFF7ED',color:'#9A3412',border:'2px solid #EA580C',flexShrink:0\}\}>⚠ スケジュールシステム テスト版<\/span>/g, '', 1, 'テスト版バッジspan'],
  [/\s*\{\/\* ===== DEV版警告バナー ===== \*\/\}/g, '', 0, 'DEVバナーコメント'],
  [/force-deploy-\d+/g, 'force-deploy-' + Date.now(), 1, 'force-deployタイムスタンプ'],
  // 自動アップデート検知のビルド識別子をデプロイ毎に更新（旧タブが新版を検知してバナー表示）
  [/__APP_BUILD='build-\d+'/, "__APP_BUILD='build-" + Date.now() + "'", 1, 'APP_BUILDタイムスタンプ'],
];
const CUST_RULES = [
  ["const STOR='hub-v8-dev-';", "const STOR='hub-v8-';", 1],
  ['<link rel="manifest" href="manifest_dev.json"/>', '<link rel="manifest" href="manifest.json"/>', 1],
];
const CUST_REGEX_RULES = [
  // 自動アップデート検知のビルド識別子をデプロイ毎に更新
  [/__APP_BUILD='build-\d+'/, "__APP_BUILD='build-" + Date.now() + "'", 1, 'APP_BUILDタイムスタンプ'],
];
// mobile.html の環境固有差分：STOR と 配色（2026-09-25 追加。テスト版＝オレンジ／メイン＝青。PC と同じ見分け方）
const MOBILE_RULES = [
  ["const STOR='hub-v8-dev-';", "const STOR='hub-v8-';", 1],
  // テスト版はべた塗りの明るいオレンジ（2026-09-25。グラデーションだと三田店の赤と見間違えるため）
  ["const UI_BG='#FF9500';", "const UI_BG='linear-gradient(160deg,#1e1b4b,#3730a3 60%,#6d28d9)';", 1],
  ["const UI_HEAD='#FF9500';", "const UI_HEAD='linear-gradient(135deg,#1e1b4b,#1d4ed8)';", 1],
  ["const UI_TAB='#F97316';", "const UI_TAB='linear-gradient(180deg,#1e1b4b,#1e293b)';", 1],
  ["const UI_ACC='#b45309';", "const UI_ACC='#1d4ed8';", 1],
  // 三田店（メインだけ赤。テスト版は両店ともオレンジ＝テスト版と分かるように）
  ["const UI_BG_S=UI_BG;", "const UI_BG_S='linear-gradient(160deg,#450a0a,#dc2626 60%,#ef4444)';", 1],
  ["const UI_HEAD_S=UI_HEAD;", "const UI_HEAD_S='linear-gradient(135deg,#7f1d1d,#dc2626)';", 1],
  ["const UI_TAB_S=UI_TAB;", "const UI_TAB_S='linear-gradient(180deg,#7f1d1d,#450a0a)';", 1],
  ["const UI_ACC_S=UI_ACC;", "const UI_ACC_S='#b91c1c';", 1],
];
const MOBILE_REGEX_RULES = [
  // 自動アップデート検知のビルド識別子をデプロイ毎に更新（旧タブ/旧PWAが新版を検知してバナー表示）
  [/__APP_BUILD='build-\d+'/, "__APP_BUILD='build-" + Date.now() + "'", 1, 'APP_BUILDタイムスタンプ'],
];
// 変換後にあってはならない文字列（残骸チェック）
const FORBIDDEN = ['hub-v8-dev', '[DEV]', '[テスト版]', 'テスト版（DEV）', 'スケジュールシステム テスト版', 'DEV版警告バナー',
  'linear-gradient(140deg,#7c2d12', "const UI_HEAD='#EA580C'",
  // mobile.html の配色（この4つの定義だけ。同じ色を使う modal は本番にもあるので、const の形で見る）
  "const UI_BG='#FF9500'", "const UI_HEAD='#FF9500'", "const UI_TAB='#F97316'", "const UI_ACC='#b45309'",
  'const UI_BG_S=UI_BG;', 'const UI_HEAD_S=UI_HEAD;', 'const UI_TAB_S=UI_TAB;', 'const UI_ACC_S=UI_ACC;'];

let failed = false;
const countOf = (s, needle) => s.split(needle).length - 1;

function port(srcName, dstName, rules, regexRules) {
  const src = path.join(DEV_DIR, srcName);
  const dst = path.join(MAIN_DIR, dstName);
  let s = fs.readFileSync(src, 'utf8');
  console.log(`\n=== ${srcName} → ${dstName} ===`);
  for (const [from, to, min] of rules) {
    const c = countOf(s, from);
    if (c < min) {
      console.error(`  ✖ パターン未検出(${c}/${min}): ${from.slice(0, 60)}...`);
      console.error('    → DEV側のコードが変わった可能性。このルールを更新してから再実行。');
      failed = true; continue;
    }
    s = s.split(from).join(to);
    console.log(`  ✔ 置換 ${c}件: ${from.slice(0, 50)}...`);
  }
  for (const [re, to, min, label] of (regexRules || [])) {
    const c = (s.match(re) || []).length;
    if (c < min) {
      console.error(`  ✖ パターン未検出(${c}/${min}): ${label}`);
      failed = true; continue;
    }
    s = s.replace(re, to);
    console.log(`  ✔ 置換 ${c}件: ${label}`);
  }
  for (const bad of FORBIDDEN) {
    const c = countOf(s, bad);
    if (c > 0) { console.error(`  ✖ DEV残骸 ${c}件: ${bad}`); failed = true; }
  }
  if (!failed) {
    fs.writeFileSync(dst, s);
    console.log(`  → 書き込み完了: ${dst}`);
  }
}

if (!fs.existsSync(MAIN_DIR)) { console.error('本番リポジトリが見つかりません: ' + MAIN_DIR); process.exit(1); }

const TARGETS = ['index', 'customers', 'mobile'];
const want = process.argv.slice(2);
const bad = want.filter(t => !TARGETS.includes(t));
if (bad.length) { console.error(`不明な対象: ${bad.join(', ')}（指定可能: ${TARGETS.join(' / ')}）`); process.exit(1); }
const on = t => want.length === 0 || want.includes(t);
if (want.length) console.log(`※ 対象を限定して移植します: ${want.join(', ')}（他のファイルは本番の現行版のまま）`);

if (on('index'))     port('index_dev.html', 'index_main.html', INDEX_RULES, INDEX_REGEX_RULES);
if (on('customers')) port('customers.html', 'customers.html', CUST_RULES, CUST_REGEX_RULES);
if (on('mobile'))    port('mobile.html', 'mobile.html', MOBILE_RULES, MOBILE_REGEX_RULES);
// Firebase の公開設定（環境で同じ）。本番サイトにも必ず置く（無いと GAS 版として動いてしまう）
fs.copyFileSync(path.join(DEV_DIR, 'firebase_config.js'), path.join(MAIN_DIR, 'firebase_config.js'));
console.log('\n=== firebase_config.js → コピー ===');

if (failed) {
  console.error('\n★中断: 上記の✖を解消してから再実行してください（本番ファイルは書き込み済みのものだけ更新）。');
  process.exit(1);
}
console.log('\n★完了。次の手順:');
console.log('  1. node smoke_main.js  ← 本番実データで全画面スモーク（必須・PASSするまでpush禁止）');
console.log('  2. cd ../hub-a-nice-day && git diff で確認 → commit & push');
