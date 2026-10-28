// 控えから Hub のデータを戻す（2026-10-28 ユーザー依頼）
//   ★既定は「下見」。--write を付けないかぎり1文字も書かない。
//   ★本番へ戻すには --prod-yes も要る（二重の歯止め）。
//   ★戻す直前に、いまの中身の控えを必ず取る（fb_backup.js を呼ぶ）。失敗したら戻さない。
//   ★書いたあと読み直して、狙ったとおりになっているか照合する。
//
//   node fb_restore.js --from last --days 2026-10-26..2026-11-01
//                                      … その1週間ぶんが、どう変わるか見るだけ
//   node fb_restore.js --from last --days 2026-10-26..2026-11-01 --write
//                                      … 実際に戻す（テスト版）
//   node fb_restore.js --from last --keys insp,honten-sched --write
//                                      … そのキーだけ丸ごと戻す
//   node fb_restore.js --from last --all --write
//                                      … 控えに入っているもの全部を戻す
//
//   --from <控え.json>  戻す元の控え。`last` でいちばん新しいものを自動で選ぶ。
//   --prod              本番の控えを使う（`--from last` の選び方にも効く）
//   --prod-yes          本番へ実際に書く合図（--write と両方そろって初めて書く）
//   --to-dev            本番の控えをテスト版へ戻す（向きは本番→テスト版の一方通行）
//   --no-pre            戻す前の控えを取らない（下見を繰り返す時だけ。本番では使えない）
//   --out <場所>        控えの置き場所（既定は下の OUT_DIR）
//
//   「戻す」の意味：
//     --days … その日の中身を、控えを取った時点の姿にそろえる。
//              控えに無くて今ある予約は消える（＝その時点に戻すのだから当然）。下見で件数を出す。
//     --keys / --all … そのキーを控えの値でまるごと置き換える。
//     どちらも「控えに入っていないキー」には一切触らない。
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));

const has = n => process.argv.indexOf(n) >= 0;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const OUT_DIR = arg('--out', 'C:/Users/A/Documents/Hub重要書類/hub-backup');
const WRITE = has('--write');
const PRODYES = has('--prod-yes');
const TODEV = has('--to-dev');
const NOPRE = has('--no-pre');
const WANT_PROD = has('--prod');
const ALL = has('--all');
const DAYS = arg('--days', '');
const KEYS = arg('--keys', '');

// ── 日付のそろえ方（Hub の日付キーはゼロ詰めなし＝2026-3-6 のこともある）──
const dkNorm = s => {
  const q = String(s || '').split('-');
  if (q.length !== 3) return '';
  const n = q.map(Number);
  if (!n[0] || !n[1] || !n[2]) return '';
  const two = x => (x < 10 ? '0' : '') + x;
  return n[0] + '-' + two(n[1]) + '-' + two(n[2]);
};

// ── キーの形。--days で日ごとに戻せるのはこの表に載っているものだけ ──
const shapeOf = base => {
  if (base === 'insp' || base === 'insp-arch' || base === 'inspLimits') return 'topday';
  if (/^(honten|sanda)-(sched|memo|dayoff|pleave|schedRestrictions)$/.test(base)) return 'topday';
  if (base === 'schedRestrictions') return 'topday';
  if (/^(honten|sanda)-offnote$/.test(base)) return 'daynamekey';   // "YYYY-M-D::氏名"
  if (base === 'custbk') return 'namedaykey';                       // "氏名::YYYY-M-D"
  if (base === 'mysched') return 'entrydk';                         // {id:{dk,...}}
  if (/^(honten|sanda)-lres$/.test(base) || base === 'rres') return 'period'; // 期間を持つ＝日で切れない
  return 'whole';
};

// そのキーの中の「枝」から日付を取り出す
const dayOfBranch = (shape, k, v) => {
  if (shape === 'topday') return dkNorm(k);
  if (shape === 'daynamekey') return dkNorm(String(k).split('::')[0]);
  if (shape === 'namedaykey') return dkNorm(String(k).split('::')[1]);
  if (shape === 'entrydk') return dkNorm(v && v.dk);
  return '';
};

// 中身が同じかどうかは、キーの並び順に左右されない形にそろえてから比べる
//   （JSON.stringify をそのまま比べると、入れ直しで並びが変わるだけで「変わった」になる）
const canon = o => {
  if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
};

// その枝の「件数」。fb_drill.js の数え方とそろえること
//   （訓練で「32件消えた／32件戻った」と見比べるので、片方が日の数だと話が合わなくなる）
const countBranch = (base, v) => {
  if (v === undefined || v === null) return 0;
  if (base === 'insp' || base === 'insp-arch') return Array.isArray(v) ? v.filter(r => r && r.name).length : 0;
  if (/-sched$/.test(base)) return typeof v === 'object' ? Object.values(v).filter(r => r && r.name).length : 0;
  if (/-memo$/.test(base)) return Array.isArray(v) ? v.filter(m => m && m.content).length : 0;
  if (/-(dayoff|pleave)$/.test(base)) return Array.isArray(v) ? v.length : 0;
  return 1;
};

const mb = n => (n / 1024 / 1024).toFixed(2) + 'MB';
const two = n => (n < 10 ? '0' : '') + n;
const stampNow = d => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
  + '_' + two(d.getHours()) + two(d.getMinutes());

// ── 控えを選ぶ ──
const pickFrom = () => {
  const from = arg('--from', '');
  if (!from) throw new Error('--from <控え.json> か --from last を指定してください');
  if (from !== 'last') return from;
  const tag = WANT_PROD ? 'prod' : 'dev';
  const mine = fs.readdirSync(OUT_DIR)
    .filter(f => f.indexOf('hub-backup-' + tag + '-') === 0 && f.endsWith('.json')).sort().reverse();
  if (!mine.length) throw new Error(OUT_DIR + ' に ' + tag + ' の控えがありません');
  return path.join(OUT_DIR, mine[0]);
};

(async () => {
  const started = new Date();
  const note = {
    at: started.toISOString(), write: WRITE, from: '', env: '', prefix: '',
    range: DAYS, keys: KEYS, all: ALL, ok: false, changed: 0, removed: 0, verified: 0, error: '',
  };

  try {
    if (!DAYS && !KEYS && !ALL) {
      throw new Error('戻す範囲を決めてください：--days 2026-10-26..2026-11-01 ／ --keys insp,honten-sched ／ --all');
    }

    // ── 控えを読む ──
    const file = pickFrom();
    note.from = file;
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = body.data || {};
    const srcPrefix = body.接頭辞 || '';
    if (srcPrefix !== 'hub-v8-' && srcPrefix !== 'hub-v8-dev-') {
      throw new Error('控えの接頭辞が分かりません（' + srcPrefix + '）');
    }
    const dstPrefix = TODEV ? 'hub-v8-dev-' : srcPrefix;
    const toProd = dstPrefix === 'hub-v8-';
    note.env = toProd ? '本番' : 'テスト版';
    note.prefix = dstPrefix;

    console.log('── 控えから戻します' + (WRITE ? '' : '（下見・1文字も書きません）') + ' ──');
    console.log('  控え　　' + file);
    console.log('  取った日　' + (body.作成日時_表示 || body.作成日時 || '不明') + '（' + (body.環境 || '?') + '・' + (body.項目数 || 0) + '件）');
    console.log('  戻す先　' + note.env + '（' + dstPrefix + '）');
    if (TODEV && srcPrefix === 'hub-v8-dev-') console.log('  （--to-dev は本番の控えを使う時の指定です。この控えはもともとテスト版なので何も変わりません）');

    // ── 歯止め：本番へ書くには合図がもう1つ要る ──
    if (WRITE && toProd && !PRODYES) {
      throw new Error('本番へ戻すには --prod-yes も付けてください（間違って本番を書き換えないための歯止め）');
    }
    if (NOPRE && WRITE && toProd) {
      throw new Error('本番では --no-pre は使えません（戻す前の控えは必ず取ります）');
    }

    // ── 範囲を決める ──
    let from = '', to = '';
    if (DAYS) {
      const q = String(DAYS).split('..');
      from = dkNorm(q[0]); to = dkNorm(q[1] || q[0]);
      if (!from || !to) throw new Error('--days の書き方は 2026-10-26..2026-11-01 です');
      if (from > to) { const t = from; from = to; to = t; }
      console.log('  戻す日　' + from + ' 〜 ' + to);
    }
    const wantKeys = KEYS ? String(KEYS).split(',').map(s => s.trim()).filter(Boolean) : [];
    if (wantKeys.length) console.log('  戻す項目　' + wantKeys.join('　'));

    // 控えに入っているキー（控え側の接頭辞を外した名前）
    const bases = Object.keys(data).map(id => id.slice(srcPrefix.length));
    const targets = ALL ? bases
      : wantKeys.length ? wantKeys.filter(b => {
        if (bases.indexOf(b) < 0) { console.log('  ⚠ ' + b + ' はこの控えに入っていません（とばします）'); return false; }
        return true;
      })
        : bases.filter(b => shapeOf(b) !== 'whole' && shapeOf(b) !== 'period');

    if (!targets.length) throw new Error('戻すものがありません');

    // ── つなぐ ──
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
    const db = admin.firestore();

    // ── 何がどう変わるか組み立てる（まだ書かない）──
    const plan = [];   // {base,id,next,addDays,delDays,sameAs}
    let nChanged = 0, nRemoved = 0, nExisting = 0;
    const skipped = [];

    for (const base of targets) {
      const id = dstPrefix + base;
      const shape = shapeOf(base);
      const srcRaw = data[srcPrefix + base];
      let src; try { src = JSON.parse(srcRaw); } catch (e) { skipped.push(base + '（控えの中身が読めません）'); continue; }

      const curSnap = await db.collection('kv').doc(id).get();
      if (curSnap.exists) nExisting++;   // いま何か入っているか（＝戻す前の控えで守るものがあるか）
      const curRaw = curSnap.exists ? (curSnap.data() || {}).v : undefined;
      let cur = null; try { cur = typeof curRaw === 'string' ? JSON.parse(curRaw) : null; } catch (e) { cur = null; }

      // --days（日ごとにそろえる）
      if (DAYS && !wantKeys.length && !ALL) {
        if (shape === 'whole') { skipped.push(base + '（日付で切れない形）'); continue; }
        if (shape === 'period') { skipped.push(base + '（期間を持つので日付で切れない。--keys ' + base + ' で丸ごと戻せます）'); continue; }
        if (!src || typeof src !== 'object' || Array.isArray(src)) { skipped.push(base + '（形がちがう）'); continue; }

        const next = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? JSON.parse(JSON.stringify(cur)) : {};
        const inR = d => d && d >= from && d <= to;
        // ① いま入っていて範囲内のものを、いったん外す（＝その時点の姿にそろえるため）
        const dropped = [];
        Object.keys(next).forEach(k => {
          if (inR(dayOfBranch(shape, k, next[k]))) { dropped.push(k); delete next[k]; }
        });
        // ② 控えの範囲内のものを入れる
        const added = [];
        Object.keys(src).forEach(k => {
          if (inR(dayOfBranch(shape, k, src[k]))) { next[k] = src[k]; added.push(k); }
        });
        // ③ 何がどう変わるかを「中身で」数える（並び順の違いは変化ではない）
        //    日の数ではなく件数で出す（訓練で消した件数と見比べるため）
        const goneK = dropped.filter(k => added.indexOf(k) < 0);
        const freshK = added.filter(k => dropped.indexOf(k) < 0);
        const diffK = added.filter(k => dropped.indexOf(k) >= 0
          && canon(src[k]) !== canon(cur && cur[k]));
        if (!goneK.length && !freshK.length && !diffK.length) continue;   // いまの中身が控えと同じ＝書かない
        const sum = (ks, pick) => ks.reduce((n, k) => n + countBranch(base, pick(k)), 0);
        plan.push({
          base, id, nextStr: JSON.stringify(next),
          diff: sum(diffK, k => src[k]), gone: sum(goneK, k => cur && cur[k]), fresh: sum(freshK, k => src[k]),
          days: goneK.length + freshK.length + diffK.length,
        });
        const p = plan[plan.length - 1];
        nChanged += p.diff + p.fresh; nRemoved += p.gone;
        continue;
      }

      // --keys / --all（まるごと置き換え）
      if (curSnap.exists && canon(src) === canon(cur)) continue;   // 中身が同じ＝書かない
      plan.push({ base, id, nextStr: JSON.stringify(src), whole: true, had: curSnap.exists });
      nChanged++;
    }

    note.changed = nChanged; note.removed = nRemoved;

    // ── 下見の表 ──
    console.log('');
    if (!plan.length) {
      console.log('  いまの中身は控えと同じでした。戻すものはありません。');
      note.ok = true;
      return;
    }
    console.log('  変わるもの　' + plan.length + ' 項目');
    plan.forEach(p => {
      if (p.whole) {
        console.log('   ・' + p.base + '　まるごと入れ替え（' + mb(Buffer.byteLength(p.nextStr, 'utf8')) + '）'
          + (p.had ? '' : '　※いま空っぽ'));
      } else {
        const bits = [];
        if (p.diff) bits.push('書き戻す ' + p.diff + '件');
        if (p.fresh) bits.push('足す ' + p.fresh + '件');
        if (p.gone) bits.push('消える ' + p.gone + '件');
        console.log('   ・' + p.base + '　' + (bits.length ? bits.join(' / ') : '変化なし')
          + '（' + p.days + ' 日ぶん）');
      }
    });
    if (nChanged || nRemoved) {
      console.log('  ──────────');
      console.log('  戻る合計　' + nChanged + ' 件' + (nRemoved ? '　／　消える合計　' + nRemoved + ' 件' : ''));
    }
    if (nRemoved) {
      console.log('');
      console.log('  ⚠ 「消える」は、控えを取ったあとに入った分です（' + nRemoved + ' 件）。');
      console.log('    その時点の姿にそろえるので消えます。残したい時は --days の範囲を狭めてください。');
    }
    if (skipped.length) {
      console.log('');
      console.log('  とばしたもの：');
      skipped.forEach(s => console.log('   ・' + s));
    }

    if (!WRITE) {
      console.log('');
      console.log('  下見なので、何も書いていません。実際に戻すには --write を付けてください'
        + (toProd ? '（本番なので --prod-yes も）' : '') + '。');
      note.ok = true;
      return;
    }

    // ── 戻す前に、いまの中身の控えを取る（これが無いと「戻しすぎ」を取り返せない）──
    if (NOPRE) {
      console.log('');
      console.log('  ⚠ --no-pre が付いているので、戻す前の控えを取りません。');
    } else if (!nExisting) {
      // ★全部消えた後は控えを取れない（控えを取る道具は0件をエラーにする）。
      //   そもそも失うものが無いので、ここは飛ばして先へ進む（2026-10-28 の全消去の予行演習で判明）
      console.log('');
      console.log('── いま空っぽなので、戻す前の控えは取りません（失うものがありません）──');
    } else {
      console.log('');
      console.log('── 念のため、いまの中身の控えを取ります ──');
      // ★戻す元の控え（命綱）が、この控え取りで上書きされていないことを必ず確かめる
      //   （2026-10-28 の訓練で実際に起きた。控えの名前が「分」までだったため同じ名前になった）
      const beforeStat = fs.statSync(file);
      try {
        execFileSync(process.execPath, [path.join(__dirname, 'fb_backup.js')].concat(toProd ? [] : ['--dev']),
          { stdio: 'inherit' });
      } catch (e) {
        throw new Error('戻す前の控えが取れなかったので、戻すのをやめました（' + String((e && e.message) || e) + '）');
      }
      const afterStat = fs.statSync(file);
      if (beforeStat.size !== afterStat.size || Number(beforeStat.mtimeMs) !== Number(afterStat.mtimeMs)) {
        throw new Error('戻す元の控え（' + path.basename(file) + '）が、いまの控え取りで書き換わりました。'
          + '上書きの恐れがあるので戻すのをやめました');
      }
    }

    // ── 書く（キーごとにトランザクション。他の画面の保存と競合しても壊さない）──
    console.log('');
    console.log('── 戻します ──');
    for (const p of plan) {
      const ref = db.collection('kv').doc(p.id);
      await db.runTransaction(async tx => {
        tx.set(ref, { v: p.nextStr, u: admin.firestore.FieldValue.serverTimestamp() });
      });
      console.log('  ✔ ' + p.base);
    }

    // ── 読み直して照合する ──
    let okN = 0, ngN = 0;
    for (const p of plan) {
      const s = await db.collection('kv').doc(p.id).get();
      const v = s.exists ? (s.data() || {}).v : '';
      if (v === p.nextStr) okN++; else { ngN++; console.log('  ✖ ' + p.base + ' が狙いどおりになっていません'); }
    }
    note.verified = okN;
    console.log('');
    console.log('  照合　' + okN + ' / ' + plan.length + ' 項目が狙いどおり' + (ngN ? '（' + ngN + ' 項目がちがいます）' : ''));
    if (ngN) throw new Error(ngN + ' 項目が狙いどおりになりませんでした');

    console.log('');
    console.log('  戻しました。画面は開いたままでも数秒で追いつきます（追いつかない時は Ctrl+Shift+R）。');
    note.ok = true;
  } catch (e) {
    note.error = String((e && e.message) || e);
    console.error('  ✖ ' + note.error);
  } finally {
    // 下見は記録を汚さない（控えを取る道具と同じ決まり）
    if (!WRITE) process.exit(note.ok ? 0 : 1);
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const tag = note.prefix === 'hub-v8-' ? 'prod' : 'dev';
      fs.writeFileSync(path.join(OUT_DIR, 'hub-restore-status-' + tag + '.json'), JSON.stringify(note, null, 1));
      fs.appendFileSync(path.join(OUT_DIR, 'hub-restore.log'),
        started.toLocaleString('ja-JP') + '\t' + (note.env || '?') + '\t' + (note.ok ? 'OK' : 'NG')
        + '\t戻した ' + note.verified + '項目\t変更 ' + note.changed + '件\t消えた ' + note.removed + '件'
        + '\t' + (note.range || note.keys || (note.all ? '全部' : ''))
        + '\t' + (note.error || path.basename(note.from)) + '\n');
    } catch (e) {}
    process.exit(note.ok ? 0 : 1);
  }
})();
