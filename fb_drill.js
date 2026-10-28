// 避難訓練の道具（2026-10-28 ユーザー依頼）
//   ★テスト版しか触れない。本番の接頭辞（hub-v8-）には構造的に書けない作りにしてある
//     （書き先の接頭辞を引数で受け取らず、下の DST に決め打ちしている）。
//   ★既定は下見。--write を付けないかぎり1文字も消さない。
//   ★消す前に必ず控えを取る（fb_backup.js --dev）。取れなかったら消さない。
//   ★消したあと、控えから戻す命令をそのまま画面に出す。
//
//   node fb_drill.js --count --days 2026-11-09..2026-11-15
//        … その週にいま何件入っているか数えるだけ（①と④で使う）
//   node fb_drill.js --days 2026-11-09..2026-11-15
//        … 何が消えるか見るだけ
//   node fb_drill.js --days 2026-11-09..2026-11-15 --write
//        … わざと消す（控えを取ってから）
//
//   ★「全部消えた」を再現する（店長への実演はこちらが本番に近い）
//   node fb_drill.js --everything --count
//        … テスト版の kv に何項目あるか数えるだけ
//   node fb_drill.js --everything
//        … 何が消えるか見るだけ
//   node fb_drill.js --everything --write
//        … テスト版の kv をまるごと消す（控えを取ってから）
//   node fb_drill.js --restore-extra <hub-drill-extra-dev-….json>
//        … 控えに入らない数項目（auth-devices・myprv-・locks など）を戻す
//
//   kv の外（devices・meta・users・snaps）は触らない＝**誰もログアウトしない**。
//   kv を全部消しても、控え（fb_backup.js）＋この道具で全部戻せることを確かめてある。
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const DST = 'hub-v8-dev-';   // ★ここは変えないこと。テスト版だけを触るための歯止め
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

const has = n => process.argv.indexOf(n) >= 0;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const OUT_DIR = arg('--out', 'C:/Users/A/Documents/Hub重要書類/hub-backup');
const WRITE = has('--write');
const COUNT = has('--count');
const DAYS = arg('--days', '');
const EVERY = has('--everything');
const REXTRA = arg('--restore-extra', '');

// 控えに入らないもの（fb_backup.js の SKIP と同じ。ここだけは別に控える）
const SKIP = [/^myprv-/, /^auth-/, /^handoff/, /^locks$/, /^list-pending$/, /^diag-/, /^gasping$/, /^snap/];

const two = n => (n < 10 ? '0' : '') + n;
const dkNorm = s => {
  const q = String(s || '').split('-');
  if (q.length !== 3) return '';
  const n = q.map(Number);
  if (!n[0] || !n[1] || !n[2]) return '';
  return n[0] + '-' + two(n[1]) + '-' + two(n[2]);
};

// 消す対象（日付で持っているものだけ。代車・レンタカーは期間を持つので訓練では触らない）
const SHAPES = [
  { base: 'insp', shape: 'topday', name: '車検の予約' },
  { base: 'honten-sched', shape: 'topday', name: '整備の予定（本店）' },
  { base: 'sanda-sched', shape: 'topday', name: '整備の予定（三田店）' },
  { base: 'honten-memo', shape: 'topday', name: '備考・メモ（本店）' },
  { base: 'sanda-memo', shape: 'topday', name: '備考・メモ（三田店）' },
  { base: 'custbk', shape: 'namedaykey', name: '顧客リスト発の仮予約' },
];

const dayOfBranch = (shape, k) => {
  if (shape === 'topday') return dkNorm(k);
  if (shape === 'namedaykey') return dkNorm(String(k).split('::')[1]);
  return '';
};
// その枝の「件数」（人が数えて分かる数にそろえる）
const countBranch = (base, v) => {
  if (base === 'insp') return Array.isArray(v) ? v.filter(r => r && r.name).length : 0;
  if (/-sched$/.test(base)) return v ? Object.values(v).filter(r => r && r.name).length : 0;
  if (/-memo$/.test(base)) return Array.isArray(v) ? v.filter(m => m && m.content).length : 0;
  return 1;   // custbk は1件＝1件
};

(async () => {
  try {
    if (!DAYS && !EVERY && !REXTRA) {
      throw new Error('--days 2026-11-09..2026-11-15（1週間ぶん）か --everything（全部）か --restore-extra <ファイル> を指定してください');
    }

    // ── 「全部消えた」の再現／控えに入らない数項目の戻し ──
    if (EVERY || REXTRA) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
      const db = admin.firestore();

      // 控えに入らない数項目を戻す
      if (REXTRA) {
        // `last` ＝いちばん新しい訓練用の控えを自動で選ぶ（デスクトップのボタンから使う）
        let exPath = REXTRA;
        if (REXTRA === 'last') {
          const mine = fs.readdirSync(OUT_DIR)
            .filter(f => f.indexOf('hub-drill-extra-dev-') === 0 && f.endsWith('.json')).sort().reverse();
          if (!mine.length) {
            console.log('訓練用の控え（hub-drill-extra-dev-*.json）がありません。');
            console.log('控えに入らない数項目（auth-devices・locks など）は戻せませんが、');
            console.log('どれも中身がほとんど無いものなので、予約や顧客のデータには影響しません。');
            process.exit(0);
          }
          exPath = path.join(OUT_DIR, mine[0]);
          console.log('いちばん新しい訓練用の控えを使います：' + path.basename(exPath));
        }
        const ex = JSON.parse(fs.readFileSync(exPath, 'utf8'));
        if (ex.接頭辞 !== DST) throw new Error('この控えはテスト版のものではありません（' + ex.接頭辞 + '）');
        const ids = Object.keys(ex.data || {});
        console.log('── 控えに入らない数項目を戻します（' + ids.length + ' 項目）──');
        for (const id of ids) {
          if (id.indexOf(DST) !== 0) throw new Error('書き先がテスト版ではありません：' + id);
          await db.collection('kv').doc(id).set({ v: ex.data[id], u: admin.firestore.FieldValue.serverTimestamp() });
          console.log('  ✔ ' + id.slice(DST.length));
        }
        console.log('  戻しました。');
        process.exit(0);
      }

      // いまテスト版の kv に何があるか
      const snap = await db.collection('kv').get();
      const mine = [], extra = [];
      snap.forEach(d => {
        if (d.id.indexOf(DST) !== 0) return;                  // ★本番（hub-v8-）は触らない
        const base = d.id.slice(DST.length);
        const v = String((d.data() || {}).v || '');
        (SKIP.some(r => r.test(base)) ? extra : mine).push({ id: d.id, base, v, kb: Buffer.byteLength(v, 'utf8') / 1024 });
      });
      const all = mine.concat(extra);
      const kb = all.reduce((n, x) => n + x.kb, 0);

      if (COUNT) {
        console.log('── テスト版の kv にいま入っているもの ──');
        console.log('  控えに入っている　' + mine.length + ' 項目');
        console.log('  控えに入っていない　' + extra.length + ' 項目　→ ' + extra.map(x => x.base).join(' '));
        console.log('  ──────────');
        console.log('  合計　' + all.length + ' 項目 / ' + (kb / 1024).toFixed(2) + 'MB');
        process.exit(0);
      }

      console.log('── 避難訓練：テスト版の kv をまるごと消します'
        + (WRITE ? '' : '（下見・1文字も消しません）') + ' ──');
      console.log('  対象　' + DST + '*　' + all.length + ' 項目 / ' + (kb / 1024).toFixed(2) + 'MB');
      console.log('  ★本番（hub-v8-）には触りません。kv の外（devices・meta・users・snaps）も触りません');
      console.log('   　＝誰もログアウトしません。Hub の中の時点保存も残ります');
      if (!all.length) { console.log('  何も入っていません。訓練になりません。'); process.exit(0); }

      if (!WRITE) {
        console.log('');
        console.log('  消えるもの（主なもの）：');
        mine.slice().sort((a, b) => b.kb - a.kb).slice(0, 10)
          .forEach(x => console.log('   ・' + x.base + '　' + x.kb.toFixed(0) + 'KB'));
        console.log('   …ほか ' + Math.max(0, mine.length - 10) + ' 項目');
        console.log('');
        console.log('  下見なので、何も消していません。実際に消すには --write を付けてください。');
        process.exit(0);
      }

      // ① 控えを取る（107項目ぶん）
      console.log('');
      console.log('── まず、消す前の控えを取ります ──');
      try {
        execFileSync(process.execPath, [path.join(__dirname, 'fb_backup.js'), '--dev'], { stdio: 'inherit' });
      } catch (e) {
        throw new Error('控えが取れなかったので、消すのをやめました（' + String((e && e.message) || e) + '）');
      }
      const st = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'hub-backup-status-dev.json'), 'utf8'));
      if (!st.ok || !st.file) throw new Error('控えの記録が「取れた」になっていません。消すのをやめました');

      // ② 控えに入らない数項目も、訓練用に別に控える（これが無いと戻せない）
      const two2 = n => (n < 10 ? '0' : '') + n;
      const d0 = new Date();
      const exName = 'hub-drill-extra-dev-' + d0.getFullYear() + '-' + two2(d0.getMonth() + 1) + '-' + two2(d0.getDate())
        + '_' + two2(d0.getHours()) + two2(d0.getMinutes()) + two2(d0.getSeconds()) + '.json';
      const exFile = path.join(OUT_DIR, exName);
      const exData = {};
      extra.forEach(x => { exData[x.id] = x.v; });
      fs.writeFileSync(exFile, JSON.stringify({
        これは何: '避難訓練用。控え（fb_backup.js）に入れていない数項目の控え。戻すのは fb_drill.js --restore-extra',
        接頭辞: DST, 作成日時_表示: d0.toLocaleString('ja-JP'), 項目数: extra.length, data: exData,
      }, null, 1));
      console.log('  ✔ 控えに入らない ' + extra.length + ' 項目も別に控えました：' + exFile);

      // ③ 消す（本物の消え方に近づけて、書き換えではなく行ごと消す）
      console.log('');
      console.log('── 消します ──');
      let done = 0;
      for (let i = 0; i < all.length; i += 300) {
        const b = db.batch();
        all.slice(i, i + 300).forEach(x => b.delete(db.collection('kv').doc(x.id)));
        await b.commit();
        done += Math.min(300, all.length - i);
        console.log('  ✖ ' + done + ' / ' + all.length + ' 項目');
      }

      // ④ ほんとうに空になったか確かめる
      const after = await db.collection('kv').get();
      let left = 0; after.forEach(d => { if (d.id.indexOf(DST) === 0) left++; });
      console.log('');
      console.log('  テスト版の kv に残っているもの　' + left + ' 項目'
        + (left ? '　⚠ 消しきれていません' : '　＝まるごと消えました'));

      console.log('');
      console.log('── 戻すには、この2つをこの順で実行してください ──');
      console.log('');
      console.log('  node fb_restore.js --from "' + st.file + '" --all --write');
      console.log('  node fb_drill.js --restore-extra "' + exFile + '"');
      console.log('');
      console.log('  （--from last ではなく、上の控えを名指しすること）');
      try {
        fs.writeFileSync(path.join(OUT_DIR, 'hub-drill-last.json'),
          JSON.stringify({ at: d0.toISOString(), mode: 'everything', deleted: all.length, safeFile: st.file, exFile }, null, 1));
      } catch (e) {}
      process.exit(0);
    }
    const q = String(DAYS).split('..');
    let from = dkNorm(q[0]), to = dkNorm(q[1] || q[0]);
    if (!from || !to) throw new Error('--days の書き方は 2026-11-09..2026-11-15 です');
    if (from > to) { const t = from; from = to; to = t; }

    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
    const db = admin.firestore();

    const read = async base => {
      const s = await db.collection('kv').doc(DST + base).get();
      if (!s.exists) return null;
      try { return JSON.parse((s.data() || {}).v || 'null'); } catch (e) { return null; }
    };

    // ── 数えるだけ ──
    if (COUNT) {
      console.log('── テスト版　' + from + ' 〜 ' + to + ' に入っている分 ──');
      let total = 0;
      for (const s of SHAPES) {
        const cur = await read(s.base);
        if (!cur || typeof cur !== 'object') continue;
        let n = 0;
        Object.keys(cur).forEach(k => {
          const d = dayOfBranch(s.shape, k);
          if (d && d >= from && d <= to) n += countBranch(s.base, cur[k]);
        });
        if (n) { console.log('  ' + s.name + '　' + n + ' 件'); total += n; }
      }
      console.log('  ──────────');
      console.log('  合計　' + total + ' 件');
      process.exit(0);
    }

    console.log('── 避難訓練：わざと消します' + (WRITE ? '' : '（下見・1文字も消しません）') + ' ──');
    console.log('  対象　テスト版（' + DST + '）　' + from + ' 〜 ' + to);

    // ── 何が消えるか組み立てる ──
    const plan = []; let total = 0;
    for (const s of SHAPES) {
      const cur = await read(s.base);
      if (!cur || typeof cur !== 'object' || Array.isArray(cur)) continue;
      const next = JSON.parse(JSON.stringify(cur));
      let n = 0, days = 0;
      Object.keys(next).forEach(k => {
        const d = dayOfBranch(s.shape, k);
        if (d && d >= from && d <= to) { n += countBranch(s.base, next[k]); days++; delete next[k]; }
      });
      if (!days) continue;
      plan.push({ base: s.base, name: s.name, nextStr: JSON.stringify(next), n, days });
      total += n;
    }

    if (!plan.length) { console.log('  この期間には何も入っていません。訓練になりません。'); process.exit(0); }

    console.log('');
    plan.forEach(p => console.log('  ・' + p.name + '　' + p.n + ' 件（' + p.days + ' 日ぶん）'));
    console.log('  ──────────');
    console.log('  消える合計　' + total + ' 件');

    if (!WRITE) {
      console.log('');
      console.log('  下見なので、何も消していません。実際に消すには --write を付けてください。');
      process.exit(0);
    }

    // ── 消す前に控えを取る（これが訓練の肝。取れなかったら消さない）──
    console.log('');
    console.log('── まず、消す前の控えを取ります ──');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'fb_backup.js'), '--dev'], { stdio: 'inherit' });
    } catch (e) {
      throw new Error('控えが取れなかったので、消すのをやめました（' + String((e && e.message) || e) + '）');
    }
    const st = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'hub-backup-status-dev.json'), 'utf8'));
    if (!st.ok || !st.file) throw new Error('控えの記録が「取れた」になっていません。消すのをやめました');
    const safeFile = st.file;

    // ── 消す ──
    console.log('');
    console.log('── 消します ──');
    for (const p of plan) {
      await db.runTransaction(async tx => {
        tx.set(db.collection('kv').doc(DST + p.base),
          { v: p.nextStr, u: admin.firestore.FieldValue.serverTimestamp() });
      });
      console.log('  ✖ ' + p.name + ' を消しました（' + p.n + ' 件）');
    }

    console.log('');
    console.log('  合計 ' + total + ' 件を消しました。テスト版の画面を開くと、この週が空になっています。');
    console.log('');
    console.log('── 戻すには、この命令をそのまま実行してください ──');
    console.log('');
    console.log('  node fb_restore.js --from "' + safeFile + '" --days ' + from + '..' + to + ' --write');
    console.log('');
    console.log('  （--from last ではなく、上の控えを名指しすること。');
    console.log('    「消したあと」の控えがいちばん新しいので、last だと空の状態を戻してしまいます）');
    try {
      fs.writeFileSync(path.join(OUT_DIR, 'hub-drill-last.json'),
        JSON.stringify({ at: new Date().toISOString(), from, to, deleted: total, safeFile }, null, 1));
    } catch (e) {}
    process.exit(0);
  } catch (e) {
    console.error('  ✖ ' + String((e && e.message) || e));
    process.exit(1);
  }
})();
