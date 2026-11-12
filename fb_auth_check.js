// 本人認証の点検（2026-11-02 作成 → 2026-11-13 作り直し）— ★読み取りだけ。控えも合言葉も1文字も書きません。
//   node fb_auth_check.js            … 点検する
//   node fb_auth_check.js --dev      … 同じ（許可簿・Auth はテスト版と本番で共通なので結果は同じ）
//
// 何を見るか：
//   「合言葉の控え（Firestore の users/{uid}.pw）」が【今も本当に通るか】。
//   通らない人は、管理者コンソール／スタッフ管理の「招待を送る」が
//   「送信に失敗しました」で止まり、PC の QR でスマホを登録することもできない
//   （どちらも控えの合言葉でサインインし直す作りなので）。
//
// ★★【2026-11-13 に作り直した理由】それまでは時刻を比べるだけだった
//   （Math.abs(passwordUpdatedAt - users.at) < 120000）。これは当てにならない：
//   ・竹林さんは「○ そろっている」と出るのに、どの6桁でも通らなかった（2026-11-04）。
//   ・逆に 2026-11-13 の実地試験では、「★ズレている」と出ていた13人全員の6桁が実際には通った
//     （控えを書いた時刻だけが 2026-10-8 9:40:01 に書き換わっていて、合言葉は元から合っていた）。
//     ＝ 12人を招待し直す必要はまったく無かった。時刻の食い違いは「ズレ」ではない。
//   → いまは accounts:signInWithPassword に控えの6桁を実際に投げて確かめる。
//   ★この判定を時刻の比較に戻さないこと。
//
// ★注意：サインインを試すので、その人の「最終ログイン」の時刻が【今】になる。
//   そのため試す前の値を先に読んで、表にはそれを出している（表の時刻は試験前の値）。
//   合言葉・控え・端末台帳・許可簿は何も変わらない（サインインの券は受け取らずに捨てている）。
//
// ★admin.auth().getUserByEmail() は passwordHash を返さないので「合言葉を持っているか」は分からない。
//   listUsers() だけが分かる（2026-11-04 の竹林さんの件でこれに気づいた）。
//
// 直し方：
//   ・控えが通らない … node fb_seed_allowed.js --code <アドレス>  で6桁を出し直す
//     ★出し直すとその人の他の端末（店の PC・スマホ）は入り直しになる。業務時間中にまとめてやらないこと。
//   ・合言葉そのものが無い（メールのリンクで入って消えた＝v3.94.2 の件）… 同じく --code で作り直す。
//     v3.94.2 以降は、本人がリンクで入った直後にアプリが自動で入れ直すので新たには起きない。
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
const CFG = require(path.join(__dirname, 'firebase_config.js'));
const sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const jp = v => { const n = Number(v) || 0; return n ? new Date(n).toLocaleString('ja-JP') : '-'; };
const iso = s => s ? new Date(s).toLocaleString('ja-JP') : '-';
const pad = (s, n) => { s = String(s == null ? '' : s); while (s.length < n) s += ' '; return s; };

// 控えの6桁で実際にサインインしてみる（券は受け取らない＝returnSecureToken:false）
const trySignIn = async (email, pw) => {
  if (!pw) return { ok: false, why: '控えが空' };
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CFG.apiKey,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: String(pw), returnSecureToken: false })
      });
    const j = await r.json();
    if (r.ok) return { ok: true };
    return { ok: false, why: (j && j.error && j.error.message) || ('HTTP ' + r.status) };
  } catch (e) { return { ok: false, why: '通信できません ' + (e && e.message) }; }
};

(async () => {
  const allowed = (await db.collection('meta').doc('allowed').get()).data() || {};
  const info = {};
  Object.values(allowed).forEach(a => {
    if (a && a.email) info[String(a.email).toLowerCase()] = { name: a.name || '', store: a.store || '', active: a.active !== false };
  });

  const copy = {};
  (await db.collection('users').get()).forEach(d => {
    const v = d.data() || {};
    if (v.email) copy[String(v.email).toLowerCase()] = {
      uid: d.id, pw: String(v.pw || ''),
      at: Math.max(Number(v.inviteAt) || 0, Number(v.at) || 0),
      fixedAt: Number(v.fixedAt) || 0
    };
  });

  // ★ 試す前に Auth を読む（試すと最終ログインが今に変わるため）
  const auth = {};
  let tok;
  do {
    const r = await admin.auth().listUsers(1000, tok);
    r.users.forEach(u => { if (u.email) auth[String(u.email).toLowerCase()] = u; });
    tok = r.pageToken;
  } while (tok);

  const mails = Array.from(new Set(Object.keys(info).concat(Object.keys(copy)))).sort();
  if (!mails.length) { console.log('控えが1件もありません'); return; }

  const rows = [];
  for (const m of mails) {
    const c = copy[m] || {}, u = auth[m] || null, i = info[m] || null;
    const r = !u ? { ok: false, why: '' }
      : (u.passwordHash ? await trySignIn(m, c.pw) : { ok: false, why: '合言葉そのものが無い' });
    rows.push({
      m: m, name: i ? i.name : '', store: i ? i.store : '', active: i ? i.active : null, inAllowed: !!i,
      uid: c.uid || (u && u.uid) || '', pw: c.pw, len: (c.pw || '').length,
      at: c.at, fixedAt: c.fixedAt,
      inAuth: !!u, hasPw: !!(u && u.passwordHash),
      last: u ? (u.metadata.lastSignInTime || '') : '',
      ok: r.ok, why: r.why || ''
    });
  }

  const good = rows.filter(r => r.ok);
  const nopw = rows.filter(r => !r.ok && r.inAuth && !r.hasPw);
  const bad = rows.filter(r => !r.ok && r.inAuth && r.hasPw);
  const noacc = rows.filter(r => !r.inAuth);
  const stray = rows.filter(r => !r.inAllowed);

  const line = r => '  ' + pad(r.m, 32) + pad(r.name, 12) + pad(r.store, 8)
    + (r.active === false ? '(無効) ' : '       ')
    + '控え:' + pad(r.pw ? (r.len === 6 ? r.pw : '長い(' + r.len + '文字)') : '(なし)', 14)
    + ' 控えを書いた:' + pad(jp(r.at), 20)
    + ' 最終ログイン(試験前):' + pad(iso(r.last), 20)
    + (r.fixedAt ? ' 端末が直した:' + jp(r.fixedAt) : '')
    + (r.why ? '  → ' + r.why : '');

  console.log('■ 控えの6桁が【今も本当に通るか】を1人ずつ試した（' + rows.length + '人）');
  console.log('  ※ サインインを試すだけ。合言葉も控えも書き換えていません。');
  console.log('  ※ 試したので、この後に見る「最終ログイン」は今の時刻になります（上の表は試験前の値）。');
  console.log('');
  console.log('● 通った（招待し直し・QR の引き継ぎが使える）… ' + good.length + '人');
  good.forEach(r => console.log(line(r)));

  if (bad.length) {
    console.log('');
    console.log('★ 通らなかった（控えがズレている）… ' + bad.length + '人');
    bad.forEach(r => console.log(line(r)));
  }
  if (nopw.length) {
    console.log('');
    console.log('▲ Auth に合言葉そのものが無い（メールのリンクで入って消えた＝v3.94.2 の件）… ' + nopw.length + '人');
    nopw.forEach(r => console.log(line(r)));
  }
  if (noacc.length) {
    console.log('');
    console.log('― 控えや許可簿にあるが Auth にアカウントが無い … ' + noacc.length + '人');
    noacc.forEach(r => console.log(line(r)));
  }
  if (stray.length) {
    console.log('');
    console.log('⚠ 許可簿（meta/allowed）に無い行 … ' + stray.length + '件');
    console.log('  （この人はログインできません。打ち間違いで作られた残骸の可能性）');
    stray.forEach(r => console.log('  ' + pad(r.m, 32) + ' uid=' + r.uid));
  }

  console.log('');
  console.log('■ まとめ：通る ' + good.length + ' / ズレ ' + bad.length + ' / 合言葉なし ' + nopw.length
    + ' / Auth に無い ' + noacc.length + '（' + rows.length + '人中）');
  const fix = bad.concat(nopw);
  if (!fix.length) { console.log('  問題なし。全員、招待し直し／QR の引き継ぎが使えます。'); return; }
  console.log('  この人たちは「招待を送る」が失敗し、PC の QR でも登録できません。直すには：');
  fix.forEach(r => console.log('    node fb_seed_allowed.js --code ' + r.m + '   ← ' + (r.name || '') + ' に6桁を伝える'));
  console.log('  ★出し直すとその人の他の端末は入り直しになります。業務時間中にまとめてやらないこと。');
})().then(() => process.exit(0), e => { console.error('ERR', e && e.stack || e); process.exit(1); });
