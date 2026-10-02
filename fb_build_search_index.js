// 横断検索の索引（cf-search-index / cf-search-chunk-i）を作る（2026-10-02）
//   本番には一度も作られておらず、スマホの検索が顧客ファイルから0件になっていた。
//   中身は customers.html の cfxBuild / cfxRow と同じ形（月の新しい順・2500行ずつ）。
//   node fb_build_search_index.js          … 今の索引と月ファイルを見るだけ
//   node fb_build_search_index.js --write  … 索引を作り直す（--dev でテスト版）
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const WRITE = process.argv.indexOf('--write') >= 0;
const STOR = process.argv.indexOf('--dev') >= 0 ? 'hub-v8-dev-' : 'hub-v8-';
const CFX_CHUNK = 2500;

const read = async k => { const d = await db.collection('kv').doc(k).get(); return d.exists ? JSON.parse(d.data().v || 'null') : null; };
const write = async (k, v) => db.collection('kv').doc(k).set({ v: JSON.stringify(v), u: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
// customers.html の cfxRow と同じ
const cfxRow = (c, fileName) => ({
  n: String(c.name || ''), c: String(c.carType || ''), no: (c.no == null ? '' : c.no),
  p: [c.phoneMobile, c.phoneHome].map(v => String(v || '').trim()).filter(Boolean).join('/'),
  a: String(c.address || ''),   // 住所（2026-10-02 に追加。PC も索引から住所を見るため）
  e: String(c.expiry || ''), f: String(fileName || ''), i: String(c.custId || ''),
});

(async () => {
  const cur = await read(STOR + 'cf-search-index');
  console.log('今の索引: ' + (cur ? JSON.stringify(cur) : '★ありません'));
  const files = (await read(STOR + 'cf-index')) || [];
  console.log('月ファイル: ' + files.map(f => f.name + '(' + f.count + ')').join(', '));

  // 月ファイルを全部読む（新しい月から）
  const loaded = [];
  for (const f of [...files].sort((a, b) => String(b.name).localeCompare(String(a.name)))) {
    const fi = await read(STOR + 'cf-' + f.name + '-index');
    if (!fi || !fi.chunks) { console.log('  ' + f.name + '：索引が読めません（飛ばします）'); continue; }
    const customers = [];
    for (let i = 0; i < fi.chunks; i++) {
      const c = await read(STOR + 'cf-' + f.name + '-chunk-' + i);
      if (Array.isArray(c)) c.forEach(r => { if (r && r.name) customers.push(r); });
    }
    loaded.push({ name: f.name, customers });
    console.log('  ' + f.name + ' … ' + customers.length + '件');
  }

  const rows = [];
  loaded.forEach(f => f.customers.forEach(c => rows.push(cfxRow(c, f.name))));
  const chunks = [];
  for (let i = 0; i < rows.length; i += CFX_CHUNK) chunks.push(rows.slice(i, i + CFX_CHUNK));
  const meta = { built: Date.now(), total: rows.length, chunks: chunks.length, files: loaded.map(f => f.name) };
  console.log('作る索引: ' + rows.length + '行 / ' + chunks.length + 'かたまり');

  if (!WRITE) { console.log('（まだ書いていません。--write で作り直します）'); process.exit(0); }
  for (let i = 0; i < chunks.length; i++) { await write(STOR + 'cf-search-chunk-' + i, chunks[i]); console.log('  書き込み: chunk-' + i + '（' + chunks[i].length + '行）'); }
  // 前より少ないかたまり数になった時、余った古いかたまりを片付ける
  if (cur && cur.chunks > chunks.length) {
    for (let i = chunks.length; i < cur.chunks; i++) { await write(STOR + 'cf-search-chunk-' + i, null); console.log('  片付け: chunk-' + i); }
  }
  await write(STOR + 'cf-search-index', meta);
  console.log('★索引を作りました: ' + JSON.stringify(meta));
  process.exit(0);
})().catch(e => { console.error('できませんでした:', e.message); process.exit(1); });
