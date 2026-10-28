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
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const DST = 'hub-v8-dev-';   // ★ここは変えないこと。テスト版だけを触るための歯止め
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));

const has = n => process.argv.indexOf(n) >= 0;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const OUT_DIR = arg('--out', 'C:/Users/A/Documents/Hub重要書類/hub-backup');
const WRITE = has('--write');
const COUNT = has('--count');
const DAYS = arg('--days', '');

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
    if (!DAYS) throw new Error('--days 2026-11-09..2026-11-15 のように、日にちを決めてください');
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
