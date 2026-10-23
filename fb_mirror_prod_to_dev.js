// 本番に保存されたら、そのままテスト版にも写し続ける（開発用・2026-10-23 ユーザー要望）
//   「本番で打ち込んで保存したら、そのままテスト版にもコピーされる形は取れませんか？
//    そしたら開発するときにやりやすいと思う」
//
//   ★向きは本番 → テスト版の一方通行。逆向きはこのスクリプトでは絶対にできない。
//     書き込み先が hub-v8-dev- で始まらない時は、その場で止める（二重の歯止め）。
//   ★アプリ（index_main.html など）には一切手を入れない。
//     本番の画面の動きも速さも変わらない＝現場で使っている方に影響が出ない。
//   ★このスクリプトが動いている間だけ写る。閉じれば止まる。開発する時だけ動かせばよい。
//
//   使い方：
//     node fb_mirror_prod_to_dev.js            … 下見（何が変わったかを出すだけ・書き込みなし）
//     node fb_mirror_prod_to_dev.js --write    … 実行（本番の変更をテスト版へ写し続ける）
//     node fb_mirror_prod_to_dev.js --write --once … いま違う分だけ写して終わる（常駐しない）
//   止め方： Ctrl+C
//
//   写さないもの（fb_copy_prod_to_dev.js と同じ）：
//     ・本人認証と端末（auth-*・handoff）… 環境ごとに分かれているもの
//     ・マイスケジュール myprv-*（個人の予定）
//     ・時点保存 snap*（テスト版のものをそのまま残す）
//     ・作業中の印（locks・list-pending・diag-*・gasping）
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();

const SRC = 'hub-v8-';        // 本番（読むだけ）
const DST = 'hub-v8-dev-';    // テスト版（書き先）
const WRITE = process.argv.indexOf('--write') >= 0;
const ONCE = process.argv.indexOf('--once') >= 0;

const SKIP = [
  /^myprv-/, /^auth-/, /^locks$/, /^list-pending$/, /^diag-/, /^gasping$/, /^handoff/, /^snap/,
];
const skip = base => SKIP.some(re => re.test(base));
const now = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
const kb = n => (n >= 1024 ? (n / 1024).toFixed(1) + 'KB' : n + 'B');

// ── 歯止め：向きを固定。書き先がテスト版でなければ何もしない ──
if (!DST.startsWith('hub-v8-dev-')) { console.error('書き先がテスト版ではありません。中止します。'); process.exit(1); }
if (SRC === DST) { console.error('読み元と書き先が同じです。中止します。'); process.exit(1); }
if (SRC.startsWith(DST)) { console.error('向きが逆です。中止します。'); process.exit(1); }

// その1件を写す。**書き先が DST で始まることを毎回確かめてから書く**
const mirror = async (base, data) => {
  const to = DST + base;
  if (!to.startsWith(DST)) { console.error('書き先がおかしいので飛ばします: ' + to); return false; }
  if (!WRITE) return false;
  await db.collection('kv').doc(to).set({
    v: (data && typeof data.v === 'string') ? data.v : JSON.stringify(data && data.v),
    u: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
};

(async () => {
  console.log('本番 → テスト版 の写し取り' + (WRITE ? '（実行）' : '（下見・書き込みはしません）'));
  console.log('  読み元 ' + SRC + '*　→　書き先 ' + DST + '*　（逆向きはできません）');

  // ① まず今の違いを揃える
  const snap = await db.collection('kv').get();
  const prod = new Map(), dev = new Map();
  snap.forEach(d => {
    const id = d.id;
    if (id.startsWith(DST)) { dev.set(id.slice(DST.length), d.data()); return; }
    if (!id.startsWith(SRC)) return;
    const base = id.slice(SRC.length);
    if (skip(base)) return;
    prod.set(base, d.data());
  });
  const vOf = x => (x && typeof x.v === 'string') ? x.v : '';
  const diff = [...prod.keys()].filter(b => vOf(prod.get(b)) !== vOf(dev.get(b)));
  console.log('  本番 ' + prod.size + ' 件のうち、テスト版と違うのは ' + diff.length + ' 件');
  let n = 0;
  for (const b of diff) {
    const ok = await mirror(b, prod.get(b));
    n += ok ? 1 : 0;
    console.log('   ' + (ok ? '✔ 写した' : '・写す対象') + ' ' + b + '  ' + kb(vOf(prod.get(b)).length));
  }
  if (!WRITE) { console.log('\n下見だけです。実際に写すには --write を付けてください。'); process.exit(0); }
  console.log('  → ' + n + ' 件そろえました');
  if (ONCE) { console.log('--once なのでここで終わります。'); process.exit(0); }

  // ② ここから先は「本番に保存されたら、そのつど写す」
  //    Firestore の onSnapshot で本番の kv を見張る。最初の1回ぶんは①で揃えたので読み飛ばす。
  console.log('\n見張りを始めました。本番で保存されるたびにテスト版へ写します。');
  console.log('止める時は Ctrl+C。この窓を閉じても止まります。\n');
  let first = true;
  db.collection('kv').onSnapshot(async (qs) => {
    if (first) { first = false; return; }
    for (const ch of qs.docChanges()) {
      const id = ch.doc.id;
      if (!id.startsWith(SRC) || id.startsWith(DST)) continue;
      const base = id.slice(SRC.length);
      if (skip(base)) continue;
      if (ch.type === 'removed') { console.log('  ' + now() + ' （本番で消えました：' + base + '）テスト版はそのままにします'); continue; }
      const data = ch.doc.data();
      const ok = await mirror(base, data);
      console.log('  ' + now() + (ok ? ' ✔ ' : ' ・ ') + base + '  ' + kb(vOf(data).length));
    }
  }, (e) => { console.error('見張りが止まりました：' + e); process.exit(1); });
})().catch(e => { console.error(e); process.exit(1); });
