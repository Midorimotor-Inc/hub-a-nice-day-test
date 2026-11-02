// 本人認証の点検（2026-11-02）— ★読み取りだけ。1文字も書きません。
//   node fb_auth_check.js            … 本番を点検
//   node fb_auth_check.js --dev      … テスト版を点検（許可簿・Auth は共通なので結果は同じ）
//
// 何を見るか：
//   「合言葉の控え（Firestore の users/{uid}.pw）」と「本当の合言葉（Firebase Auth）」が
//   そろっているか。ズレている人は、管理者コンソール／スタッフ管理の「招待を送る」が
//   「送信に失敗しました」で止まり、PC の QR でスマホを登録することもできない
//   （どちらも控えの合言葉でサインインし直す作りなので）。
//   直し方は  node fb_seed_allowed.js --code <アドレス>  で6桁を出し直す。
//   ★ただし出し直すと、その人の他の端末（店の PC・スマホ）は入り直しになる。
//     現場が止まるので、業務時間中にまとめてやらないこと。
//
// 2026-11-02 の記録：13人ぶんの控えが 10/8 9:40:01 に一度に書き換えられていたが、
//   本当の合言葉は変わっていなかった（控えだけ書く道具を使ったため）。
//   そこから3週間、この13人は招待し直せない状態だった。
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
const sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const jp = v => { const n = Number(v) || 0; return n ? new Date(n).toLocaleString('ja-JP') : '-'; };
const pad = (s, n) => { s = String(s); while (s.length < n) s += ' '; return s; };

(async () => {
  const allowed = (await db.collection('meta').doc('allowed').get()).data() || {};
  const nameOf = {};
  Object.values(allowed).forEach(a => { if (a && a.email) nameOf[String(a.email).toLowerCase()] = (a.name || '') + (a.active === false ? '（無効）' : ''); });

  const copy = {};
  (await db.collection('users').get()).forEach(d => {
    const v = d.data() || {};
    if (v.email) copy[String(v.email).toLowerCase()] = { uid: d.id, pw: String(v.pw || ''), at: Math.max(Number(v.inviteAt) || 0, Number(v.at) || 0) };
  });

  const mails = Object.keys(copy);
  if (!mails.length) { console.log('控えが1件もありません'); return; }
  const tok = (await app.options.credential.getAccessToken()).access_token;
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + sa.project_id + '/accounts:lookup',
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mails }) });
  const j = await res.json();
  if (!res.ok) { console.error('Auth を読めません: ' + JSON.stringify(j).slice(0, 300)); process.exit(1); }

  const rows = (j.users || []).map(u => {
    const m = String(u.email || '').toLowerCase(), c = copy[m] || {};
    return { m, name: nameOf[m] || '', pw: c.pw, at: c.at || 0, pu: Number(u.passwordUpdatedAt) || 0, last: Number(u.lastLoginAt) || 0 };
  }).sort((a, b) => b.at - a.at);

  const bad = [];
  console.log('■ 合言葉の控えの点検（' + rows.length + '人）\n');
  for (const r of rows) {
    const ok = Math.abs(r.pu - r.at) < 120000;            // 2分以内なら同じ操作とみなす
    if (!ok) bad.push(r);
    console.log((ok ? '  ○ そろっている ' : '  ★ズレている   ') + pad(r.m, 31) + pad(r.name, 14)
      + ' 控え:' + pad(jp(r.at), 20) + ' 本物:' + pad(jp(r.pu), 20) + ' 最終ログイン:' + jp(r.last));
  }
  const noAuth = mails.filter(m => !rows.some(r => r.m === m));
  if (noAuth.length) console.log('\n■ 控えはあるが Auth にアカウントが無い: ' + noAuth.join(', '));

  console.log('\n■ まとめ：ズレ ' + bad.length + '人 / ' + rows.length + '人');
  if (!bad.length) { console.log('  問題なし。全員、招待し直し／QR の引き継ぎが使えます。'); return; }
  console.log('  この人たちは「招待を送る」が失敗し、PC の QR でも登録できません。直すには：');
  for (const r of bad) console.log('    node fb_seed_allowed.js --code ' + r.m + '   ← ' + (r.name || '') + ' に6桁を伝える');
  console.log('  ★出し直すとその人の他の端末は入り直しになります。業務時間中にまとめてやらないこと。');
})().then(() => process.exit(0), e => { console.error('ERR', e && e.message); process.exit(1); });
