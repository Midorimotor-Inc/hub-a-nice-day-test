// 時点保存の「キーの集め方」に取りこぼしが無いか、実データで確かめる。2026-10-14
//   画面と同じ集め方（まとめ読みを使わない）を Node で再現し、実際の kv と突き合わせる。
//   **読み取りだけ**。 実行: node fb_snap_keycheck.js [--dev]
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const STOR = process.argv.includes('--dev') ? 'hub-v8-dev-' : 'hub-v8-';
const NL = String.fromCharCode(10);

// ★画面側（index_dev.html / mobile.html）の SNAP_KEYS_COMMON / SNAP_KEYS_STORE と同じに保つこと
const SNAP_KEYS_COMMON = ['insp','insp-arch','custbk','rres','rentalcars','tiredata','rentaloc',
  'vehicles','vehicles-v2','inspLimits','mholidays','mysched','setItems','memoItems',
  'cf-index','cf-search-index','override-open','desktops-honten','desktops-sanda',
  'notify-emails','auth-devnames','schedRestrictions','gasping','custStatus','desktops'];
const SNAP_KEYS_STORE = ['sched','memo','lres','dayoff','pleave','offnote','cdow','cdow-v2','cdate',
  'staff-v2','cars','schedRestrictions'];

const readJson = async k => { const s = await db.collection('kv').doc(k).get(); if (!s.exists) return null;
  const v = (s.data() || {}).v; try { return (typeof v === 'string' && v && v !== 'null') ? JSON.parse(v) : null; } catch (e) { return null; } };

(async () => {
  const set = {};
  const skip = k => (STOR === 'hub-v8-' && k.indexOf('hub-v8-dev-') === 0) || k.indexOf(STOR + 'myprv-') === 0
    || k === STOR + 'snap-index' || k === STOR + 'auth-codes' || k.indexOf('__chunk') >= 0
    || k.indexOf(STOR + 'diag-') === 0;
  const add = k => { k = String(k || ''); if (!k || k.indexOf(STOR) !== 0 || skip(k)) return; set[k] = 1; };
  SNAP_KEYS_COMMON.forEach(b => add(STOR + b));
  ['honten', 'sanda'].forEach(st => SNAP_KEYS_STORE.forEach(b => add(STOR + st + '-' + b)));
  const cfi = await readJson(STOR + 'cf-index');
  for (const f of (Array.isArray(cfi) ? cfi : [])) {
    const nm = (f && f.name) || f; if (!nm) continue;
    add(STOR + 'cf-' + nm + '-index');
    const fi = await readJson(STOR + 'cf-' + nm + '-index');
    const n = Math.max(1, Number(fi && fi.chunks) || 1);
    for (let i = 0; i < n; i++) add(STOR + 'cf-' + nm + '-chunk-' + i);
  }
  const si = await readJson(STOR + 'cf-search-index');
  for (let i = 0; i < (Number(si && si.chunks) || 0); i++) add(STOR + 'cf-search-chunk-' + i);
  const vl = await readJson(STOR + 'vehicles-v2');
  (Array.isArray(vl) ? vl : []).forEach(v => ((v && Array.isArray(v.docs)) ? v.docs : []).forEach(dd => {
    if (!dd || !dd.id) return;
    add(STOR + 'vehdoc-' + dd.id + '-index');
    for (let i = 0; i < (Number(dd.chunks) || 0); i++) add(STOR + 'vehdoc-' + dd.id + '-chunk-' + i);
  }));
  // ③ 前回の控えに入っていたキー
  const idx = (await db.collection('snapidx').doc(STOR).get()).data() || {};
  const list = (idx.list || []).filter(x => x.ready !== false).sort((a, b) => b.ts - a.ts);
  if (list.length) { const sub = await db.collection('snaps').doc(list[0].file).collection('kv').get(); sub.forEach(d => add(d.id)); }

  // 実際にある kv と突き合わせる
  const q = await db.collection('kv').get();
  const real = [];
  q.forEach(d => { const k = d.id; if (k.indexOf(STOR) !== 0) return;
    if (STOR === 'hub-v8-' && k.indexOf('hub-v8-dev-') === 0) return;
    const v = (d.data() || {}).v; if (typeof v === 'string' && v && v !== 'null') real.push(k); });

  const got = Object.keys(set);
  // 参照されていないもの（控えに入れなくてよい）を分けて数える
  //   ・vehdoc-* … 車両管理の docs から外れた車検証の写真（どの車にも紐づいていない）
  //   ・cf-* … cf-index に載っていない顧客ファイル（各画面が下ろす対象のゴミ）
  const liveCf = (Array.isArray(cfi) ? cfi : []).map(f => (f && f.name) || f).filter(Boolean);
  const orphan = k => (k.indexOf(STOR + 'vehdoc-') === 0)
    || (k.indexOf(STOR + 'cf-') === 0 && !liveCf.some(nm => k.indexOf(STOR + 'cf-' + nm) === 0) && k !== STOR + 'cf-index' && k.indexOf(STOR + 'cf-search') !== 0);
  const loose = real.filter(k => !set[k] && !skip(k) && orphan(k));
  const missing = real.filter(k => !set[k] && !skip(k) && !orphan(k));
  const skipped = real.filter(k => skip(k));
  const ghost = got.filter(k => real.indexOf(k) < 0);
  console.log('■ ' + (STOR === 'hub-v8-' ? '本番' : 'テスト版'));
  console.log('  実際にある kv      : ' + real.length + '件');
  console.log('  集められるキー      : ' + got.length + '件（うち実在 ' + (got.length - ghost.length) + '）');
  console.log('  わざと入れない      : ' + skipped.length + '件' + (skipped.length ? '（' + skipped.slice(0, 5).join(', ') + '…）' : ''));
  console.log('');
  if (missing.length) { console.log('  ✖ 取りこぼし ' + missing.length + '件:'); missing.forEach(k => console.log('      ' + k)); }
  else console.log('  ✔ 取りこぼしなし');
  if (loose.length) { console.log('  （参照されていない ' + loose.length + '件＝どこからも辿れないので入れない）'); loose.forEach(k => console.log('      ' + k)); }
  if (ghost.length) console.log('  （空振り ' + ghost.length + '件＝まだ作られていないキー。読んで無ければ飛ばすので害はない）');
  process.exit(missing.length ? 1 : 0);
})();
