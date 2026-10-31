// Hub の中身を「まるごと1本のファイル」に控える（2026-10-28 ユーザー依頼）
//   ★読むだけ。Firestore には一切書き込まない（歯止めは下の guard）。
//   ★アプリ（index_dev.html など）には一切触らない。外側で動く独立した仕組み。
//
//   node fb_backup.js              … 本番の控えを取る
//   node fb_backup.js --dev        … テスト版の控えを取る
//   node fb_backup.js --dry        … 下見（中身を数えるだけ・ファイルは書かない）
//   node fb_backup.js --out <場所> … 保存先を変える（既定は下の OUT_DIR）
//   node fb_backup.js --keep 30    … 何本残すか（既定30本。古いものから消す）
//
//   なぜ要るか：
//     Hub の中の「時点保存」は “開いている画面” が作るので、誰も開かなければ作られない
//     （2026-09-30 から2週間止まっていた前科がある）。こちらは画面と無関係に毎朝動き、
//     Firebase ごと何かあっても PC の中にファイルが残る＝最後の砦。
//
//   控えに入れないもの（意図的）：
//     ・myprv-*     … 個人のマイスケジュール（本人しか読めないもの）
//     ・auth-* / handoff … 端末の登録・引き継ぎの印（ファイルに残すとかえって危ない）
//     ・locks / list-pending / diag-* / gasping … 作業中の印・調査の記録
//     ・snap*       … Hub の中の時点保存（この控えが同じ役目をする）
const fs = require('fs'), path = require('path'), cp = require('child_process');

const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
// ── 復旧の部品（firebase-admin）の居場所 ──
//   ★Temp は Windows の掃除で消える場所なので、消えない所から先に探す
//     （2026-10-28：Temp だけを見ていたため、掃除された日に復旧できなくなる状態だった）
//   USB や共有PCへ一式を移した時も、道具のとなりに node_modules を置けばそのまま動く
const MOD = (() => {
  const cand = [
    process.env.HUB_FB_MOD,                                               // ① 場所を指定された時
    path.join(__dirname, 'node_modules'),                                 // ② 道具のとなり（USBの一式）
    path.join(__dirname, '..', '復旧道具', 'node_modules'),                 // ③ 道具の隣のフォルダ
    'C:/Users/A/Documents/Hub重要書類/復旧道具/node_modules',               // ④ このPCの決まった場所
    path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules'), // ⑤ 最後の頼み（消えうる）
  ].filter(Boolean);
  for (const c of cand) {
    try { if (fs.existsSync(path.join(c, 'firebase-admin'))) return c; } catch (e) {}
  }
  console.error('✖ 復旧の部品（firebase-admin）が見つかりません。探した場所：');
  cand.forEach(c => console.error('    ' + c));
  console.error('  → Hub重要書類\\復旧道具\\node_modules があるか確かめてください。');
  process.exit(1);
})();
const admin = require(path.join(MOD, 'firebase-admin'));

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const DEV = process.argv.indexOf('--dev') >= 0;
const DRY = process.argv.indexOf('--dry') >= 0;
// --daily：その日の控えがもう取れていれば何もしない（毎朝のタスク専用）
//   ★ノートPCは夜スリープするので「8時ちょうど」には取れない日がある。
//     そこで「毎朝8時」と「PCを使い始めた時」の2つから呼び、先に取れた方だけを生かす。
//     手で取る時・訓練の控え・戻す前の控えには付けないこと（必ず取る必要があるため）。
const DAILY = process.argv.indexOf('--daily') >= 0;
// 紙の控え（オフラインで見て印刷する1枚のHTML）も作り直すか。--nopaper で止められる
const NOPAPER = process.argv.indexOf('--nopaper') >= 0;
const PREFIX = DEV ? 'hub-v8-dev-' : 'hub-v8-';
const ENVNAME = DEV ? 'テスト版' : '本番';
const OUT_DIR = arg('--out', 'C:/Users/A/Documents/Hub重要書類/hub-backup');
const KEEP = Math.max(1, Number(arg('--keep', '30')) || 30);

const SKIP = [/^myprv-/, /^auth-/, /^handoff/, /^locks$/, /^list-pending$/, /^diag-/, /^gasping$/, /^snap/];

// ── 写し先（Google ドライブの同期フォルダ）──
//   ★PCの控えが「主」、ここは「写し」。Drive が無くても控えは取れる（写しだけ飛ばす）
//   ★写すのは控えのファイルだけ。鍵（firebase-admin.json）は入れない
const MIRROR = (() => {
  const d = arg('--also', 'G:/マイドライブ/Hub控え');
  if (d === 'off') return '';
  // 親（マイドライブ）があるときだけ使う。無ければ写さない（エラーにしない）
  try { if (fs.existsSync(path.dirname(d))) return d; } catch (e) {}
  return '';
})();
const skip = base => SKIP.some(re => re.test(base));

// 日付（その土地の時刻で YYYY-MM-DD / YYYY-MM-DD_HHMMSS）
//   ★秒まで入れること。分までだと、同じ分に2回取った時に前の控えを上書きしてしまう
//     （2026-10-28 の避難訓練で実際に踏んだ：「消す前の控え」を、その14秒後の
//      「戻す前の控え」が同じ名前で上書きし、戻す元にしていた命綱が消えた）
const two = n => (n < 10 ? '0' : '') + n;
const stamp = (d, withTime) => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
  + (withTime ? '_' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) : '');

const mb = n => (n / 1024 / 1024).toFixed(2) + 'MB';

(async () => {
  const started = new Date();
  const note = { env: ENVNAME, at: started.toISOString(), ok: false, keys: 0, bytes: 0, file: '', error: '' };

  // ── その日の控えがもう取れていれば、何もしないで終わる（--daily の時だけ）──
  if (DAILY) {
    try {
      const tag0 = DEV ? 'dev' : 'prod';
      const head = 'hub-backup-' + tag0 + '-' + stamp(started, false);
      const got = fs.readdirSync(OUT_DIR).some(f => f.indexOf(head) === 0 && f.endsWith('.json'));
      if (got) {
        console.log('今日（' + stamp(started, false) + '）の' + ENVNAME + 'の控えは、もう取れています。何もしません。');
        process.exit(0);
      }
    } catch (e) { /* 置き場所がまだ無い時などは、そのまま取りにいく */ }
  }

  try {
    // ── 歯止め：この道具は読むだけ。書き込みの入口を塞いでおく ──
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
    const db = admin.firestore();
    for (const m of ['set', 'update', 'delete', 'create']) {
      admin.firestore.DocumentReference.prototype[m] = function () {
        throw new Error('この道具は読むだけです（' + m + ' は使えません）');
      };
    }

    console.log('── ' + ENVNAME + ' の控えを取ります' + (DRY ? '（下見・ファイルは書きません）' : '') + ' ──');

    // ── 読む（Admin SDK なので、まとめ読みがそのまま使える）──
    const snap = await db.collection('kv').get();
    const data = {}; let keys = 0, bytes = 0, broken = 0;
    const skipped = [];
    snap.forEach(doc => {
      const id = doc.id;
      if (id.indexOf(PREFIX) !== 0) return;                       // 別の環境のもの
      if (!DEV && id.indexOf('hub-v8-dev-') === 0) return;        // 本番の控えにテスト版を混ぜない
      const base = id.slice(PREFIX.length);
      if (skip(base)) { skipped.push(base); return; }
      const v = (doc.data() || {}).v;
      if (typeof v !== 'string') return;
      try { JSON.parse(v); } catch (e) { broken++; }              // 読めない値があれば数えて知らせる
      data[id] = v; keys++; bytes += Buffer.byteLength(v, 'utf8');
    });

    // ── 中身のあらまし（人が見て「ちゃんと入っている」と分かるように）──
    const cnt = (key, how) => { try { return how(JSON.parse(data[PREFIX + key] || 'null')); } catch (e) { return 0; } };
    const rows = o => o ? Object.keys(o).reduce((n, d) => n + (Array.isArray(o[d]) ? o[d].filter(r => r && r.name).length : 0), 0) : 0;
    const slots = o => o ? Object.keys(o).reduce((n, d) => n + Object.keys(o[d] || {}).filter(k => (o[d][k] || {}).name).length, 0) : 0;
    const summary = {
      車検の予約: cnt('insp', rows) + cnt('insp-arch', rows),
      整備の予定: cnt('honten-sched', slots) + cnt('sanda-sched', slots),
      代車の貸出: cnt('honten-lres', o => o ? Object.keys(o).reduce((n, c) => n + Object.keys(o[c] || {}).length, 0) : 0)
        + cnt('sanda-lres', o => o ? Object.keys(o).reduce((n, c) => n + Object.keys(o[c] || {}).length, 0) : 0),
      レンタカーの貸出: cnt('rres', o => o ? Object.keys(o).reduce((n, c) => n + Object.keys(o[c] || {}).length, 0) : 0),
      // cf-index は [{name,count},...] の配列（本番で確認・2026-10-28）
      顧客ファイル: cnt('cf-index', o => (Array.isArray(o) ? o.length : 0)),
      顧客ファイルの行: cnt('cf-index', o => (Array.isArray(o) ? o.reduce((n, f) => n + (Number(f && f.count) || 0), 0) : 0)),
      車両管理: cnt('vehicles-v2', o => (Array.isArray(o) ? o.length : 0)),
      共有スケジュール: cnt('mysched', o => (o ? Object.keys(o).length : 0)),
    };

    console.log('  読んだ項目　' + keys + ' 件 / ' + mb(bytes));
    Object.keys(summary).forEach(k => console.log('  ' + k + '　' + summary[k] + ' 件'));
    if (broken) console.log('  ⚠ 中身が読めない項目が ' + broken + ' 件ありました（控えにはそのまま入れています）');
    if (!keys) throw new Error('1件も読めませんでした（鍵か環境の指定が違う可能性）');

    if (DRY) { console.log('下見なので、ファイルは書きませんでした。'); return; }

    // ── 書く（控えのファイル。顧客名や電話が入るのでリポジトリの外）──
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tag = DEV ? 'dev' : 'prod';
    // ★すでにある控えには絶対に上書きしない（念のための二重の歯止め）
    let file = path.join(OUT_DIR, 'hub-backup-' + tag + '-' + stamp(started, true) + '.json');
    for (let i = 2; fs.existsSync(file) && i < 100; i++) {
      file = path.join(OUT_DIR, 'hub-backup-' + tag + '-' + stamp(started, true) + '-' + i + '.json');
    }
    if (fs.existsSync(file)) throw new Error('同じ名前の控えが多すぎます（上書きを避けるため中止）');
    const body = {
      これは何: 'Hub a Nice Day の控え（まるごと）。戻す時は node fb_restore.js を使う。',
      環境: ENVNAME, 接頭辞: PREFIX,
      作成日時: started.toISOString(), 作成日時_表示: started.toLocaleString('ja-JP'),
      項目数: keys, 大きさ: bytes, あらまし: summary,
      入れていないもの: SKIP.map(String),
      data,
    };
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(body));
    fs.renameSync(tmp, file);     // 途中で止まっても中途半端なファイルが残らない

    // ── 書けたものを読み直して確かめる（壊れた控えを「取れた」と言わないため）──
    const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Object.keys(back.data || {}).length !== keys) throw new Error('書いた控えを読み直したら件数が合いません');

    console.log('  ✔ ' + file + '（' + mb(fs.statSync(file).size) + '）');

    // ── 古い控えを片づける（新しい方から KEEP 本だけ残す）──
    const mine = fs.readdirSync(OUT_DIR).filter(f => f.indexOf('hub-backup-' + tag + '-') === 0 && f.endsWith('.json')).sort().reverse();
    mine.slice(KEEP).forEach(f => { try { fs.unlinkSync(path.join(OUT_DIR, f)); console.log('  （古い控えを1本片づけました：' + f + '）'); } catch (e) {} });
    console.log('  残っている控え　' + Math.min(mine.length, KEEP) + ' 本（最大 ' + KEEP + ' 本）');

    // ── 写しを Google ドライブへ（主の控えは上で書けている。ここで失敗しても控えは残る）──
    if (MIRROR) {
      try {
        fs.mkdirSync(MIRROR, { recursive: true });
        const to = path.join(MIRROR, path.basename(file));
        const t2 = to + '.tmp';
        fs.copyFileSync(file, t2);
        fs.renameSync(t2, to);                 // 途中で止まっても半端な写しが残らない
        if (fs.statSync(to).size !== fs.statSync(file).size) throw new Error('写しの大きさが合いません');
        console.log('  ✔ 写しを置きました　' + to);
        // 写し先も同じ本数だけ残す
        const m2 = fs.readdirSync(MIRROR).filter(f => f.indexOf('hub-backup-' + tag + '-') === 0 && f.endsWith('.json')).sort().reverse();
        m2.slice(KEEP).forEach(f => { try { fs.unlinkSync(path.join(MIRROR, f)); } catch (e) {} });
        note.mirror = to;
      } catch (e) {
        // ★黙って飛ばさない。記録に残して画面にも出す（これが2週間気づけなかった原因だった）
        note.mirrorError = String((e && e.message) || e);
        console.log('  ⚠ 写しを置けませんでした（控え自体は取れています）：' + note.mirrorError);
      }
    } else {
      note.mirrorError = '写し先がありません（Google ドライブが見つからない）';
      console.log('  ⚠ 写し先が見つからないので、写しは置いていません');
    }

    note.ok = true; note.keys = keys; note.bytes = bytes; note.file = file; note.あらまし = summary;

    // ── ついでに「紙の控え」も作り直す（ネットが無くても見て印刷できる1枚のHTML）──
    //    ★ここで転んでも控え（JSON）はもう取れている。紙の方は次の朝また作られる。
    if (!NOPAPER) {
      try {
        const args = [path.join(__dirname, 'hub_paper.js'), '--file', file].concat(DEV ? ['--dev'] : []);
        const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8' });
        const line = String(r.stdout || '').split('\n').filter(x => x.indexOf('紙の控えを作りました') >= 0)[0] || '';
        if (r.status === 0) { note.paper = true; console.log('  ✔ ' + (line.trim() || '紙の控えも作り直しました')); }
        else { note.paperError = (String(r.stderr || '').trim() || ('終了コード ' + r.status)).slice(0, 300); console.log('  ⚠ 紙の控えは作れませんでした（JSONの控えは取れています）：' + note.paperError); }
      } catch (e) { note.paperError = String((e && e.message) || e); console.log('  ⚠ 紙の控えは作れませんでした（JSONの控えは取れています）：' + note.paperError); }
    }
  } catch (e) {
    note.error = String((e && e.message) || e);
    console.error('  ✖ 控えを取れませんでした：' + note.error);
  } finally {
    // ── 結果を必ず残す（失敗を握りつぶさない。これが2週間気づけなかった原因だった）──
    //    ただし下見（--dry）は控えを取っていないので、記録も「最後の控え」も書き換えない
    if (DRY) process.exit(0);
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const tag = DEV ? 'dev' : 'prod';
      fs.writeFileSync(path.join(OUT_DIR, 'hub-backup-status-' + tag + '.json'), JSON.stringify(note, null, 1));
      fs.appendFileSync(path.join(OUT_DIR, 'hub-backup.log'),
        started.toLocaleString('ja-JP') + '\t' + ENVNAME + '\t' + (note.ok ? 'OK' : 'NG')
        + '\t' + note.keys + '件\t' + mb(note.bytes) + '\t' + (note.error || path.basename(note.file))
        + '\t写し:' + (note.mirror ? 'OK' : ('NG ' + (note.mirrorError || '')))
        + '\t紙:' + (note.paper ? 'OK' : (NOPAPER ? '—' : ('NG ' + (note.paperError || '')))) + '\n');
    } catch (e) {}
    process.exit(note.ok ? 0 : 1);
  }
})();
