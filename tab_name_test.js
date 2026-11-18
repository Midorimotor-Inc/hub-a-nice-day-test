// 【タブの取り違え】の見張り（2026-11-18）
//
//  なぜ要るか：テスト版と本番は同じ住所（midorimotor-inc.github.io）でフォルダが違うだけ＝同一オリジン。
//  window.open の第2引数（タブの名前）が両環境で同じだと、本番側で押した時に
//  【テスト版で開いていたタブの中身だけが本番に差し替わる】。タブは増えないので気づけない。
//  2026-11-18、これでテスト版のつもりの操作が本番の予約に入った（平山さま・上田さま）。
//
//  ① 本物のブラウザで「名前が同じなら奪われる／環境ごとに分けたら奪われない」を再現する
//     （その場で作る小さなページだけを使う。Firestore にも Hub の実データにも一切つながらない）
//  ② 本物の3ファイルに守りが入っているかを、ファイルの中身で見張る
//
//  使い方: node tab_name_test.js
const fs = require('fs'), path = require('path'), http = require('http');
const MOD = path.join(process.env.LOCALAPPDATA, 'Temp', 'hub-verify', 'node_modules');
const { chromium } = require(path.join(MOD, 'playwright'));
const PORT = 8517;
const DIR = __dirname;

let ok = 0, ng = 0;
const T = (name, cond, extra) => {
  if (cond) { ok++; console.log('  ✔ ' + name); }
  else { ng++; console.log('  ✖ ' + name + (extra ? '　（' + extra + '）' : '')); }
};

// ══════════ ① 本物のブラウザで再現 ══════════
//  いまのアプリと同じ1行（window.open(location.pathname+'?dash=1', 名前)）を置いた小さなページ。
const page = (env, fixed) => {
  const isDev = env === 'test';
  const sfx = fixed ? (isDev ? '-dev' : '-main') : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${isDev ? '[テスト版] ' : ''}Hub a Nice Day</title></head>
<body style="background:${isDev ? '#EA580C' : '#1d4ed8'};color:#fff;font:16px sans-serif">
<h1 id="who">${isDev ? 'テスト版（オレンジ）' : '本番（青）'}</h1>
<button id="dash">ダッシュボード</button>
<button id="cust">顧客リスト</button>
<script>
  document.getElementById('dash').onclick=function(){
    window.open(location.pathname+'?dash=1','hub-dashboard${sfx}');
  };
  document.getElementById('cust').onclick=function(){
    window.open('./customers.html','hub-customers${sfx}');
  };
<` + `/script></body></html>`;
};

const serve = fixed => http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const env = u.indexOf('/hub-a-nice-day-test/') === 0 ? 'test'
            : u.indexOf('/hub-a-nice-day-main/') === 0 ? 'main' : null;
  if (!env) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page(env, fixed));
});

const run = async fixed => {
  const srv = serve(fixed);
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext();
  try {
    const A = await ctx.newPage();                    // テスト版のスケジュール
    await A.goto(`http://localhost:${PORT}/hub-a-nice-day-test/index_dev.html`);

    // テスト版からダッシュボードを開く
    // ★新しいタブを待つ処理は【押すより先に】仕掛けること（後だと取りこぼす）
    const [D] = await Promise.all([ctx.waitForEvent('page'), A.click('#dash')]);
    await D.waitForLoadState();
    const dBefore = D.url();

    // ふだんの使い方どおり、テスト版の画面から本番を開く（＝同じ仲間のタブになる）
    const [B] = await Promise.all([ctx.waitForEvent('page'),
      A.evaluate(() => { window.open('/hub-a-nice-day-main/index_main.html', '_blank'); })]);
    await B.waitForLoadState();

    await B.click('#dash');
    await D.waitForTimeout(900);
    const dAfter = D.url();

    // 顧客リストも同じことが起きるか
    const [L] = await Promise.all([ctx.waitForEvent('page'), A.click('#cust')]);
    await L.waitForLoadState();
    const lBefore = L.url(), nBefore = ctx.pages().length;
    await B.click('#cust');
    await L.waitForTimeout(900);
    const lAfter = L.url(), nAfter = ctx.pages().length;

    return { dBefore, dAfter, lBefore, lAfter, nBefore, nAfter };
  } finally { await b.close(); await new Promise(r => srv.close(r)); }
};

(async () => {
  console.log('');
  console.log('■ ① 本物のブラウザで「タブの奪い合い」を再現する');
  const same = await run(false);
  T('【名前が同じ】ダッシュボードのタブが本番に奪われる（＝これが事故の正体）',
    same.dBefore !== same.dAfter, '奪われなかった: ' + same.dAfter);
  T('【名前が同じ】顧客リストのタブも奪われる',
    same.lBefore !== same.lAfter, '奪われなかった: ' + same.lAfter);
  T('【名前が同じ】タブの数は増えない（＝気づけない）',
    same.nBefore === same.nAfter, same.nBefore + ' → ' + same.nAfter);

  const fixed = await run(true);
  T('【名前を環境ごとに分けた】ダッシュボードのタブは奪われない',
    fixed.dBefore === fixed.dAfter, fixed.dBefore + ' → ' + fixed.dAfter);
  T('【名前を環境ごとに分けた】顧客リストのタブも奪われない',
    fixed.lBefore === fixed.lAfter, fixed.lBefore + ' → ' + fixed.lAfter);
  T('【名前を環境ごとに分けた】本番の分は新しいタブで開く（数が増える）',
    fixed.nAfter > fixed.nBefore, fixed.nBefore + ' → ' + fixed.nAfter);

  // ══════════ ② 本物のファイルに守りが入っているか ══════════
  const idx = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const cus = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const mob = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const prt = fs.readFileSync(path.join(DIR, 'port_to_main.js'), 'utf8');

  console.log('');
  console.log('■ ② index_dev.html：タブの名前は環境ごと');
  T('HUB_TAB_SFX を STOR から作っている（付け替え忘れが起きない）',
    /const HUB_TAB_SFX\s*=\s*HUB_IS_TEST\s*\?\s*'-dev'\s*:\s*'-main'/.test(idx));
  T('HUB_IS_TEST を STOR から作っている', /const HUB_IS_TEST\s*=\s*\(STOR\s*!==\s*'hub-v8-'\)/.test(idx));
  T('HUB_TAB_DASH / HUB_TAB_CUST がある',
    idx.indexOf("const HUB_TAB_DASH = 'hub-dashboard' + HUB_TAB_SFX;") >= 0 &&
    idx.indexOf("const HUB_TAB_CUST = 'hub-customers' + HUB_TAB_SFX;") >= 0);
  // ★window.open の【2つめの引数】だけを見る。印刷の窓（'_blank'）は別もの。
  const opens = [...idx.matchAll(/window\.open\(\s*([^,)]+)\s*,\s*([^,)]+)/g)].map(m => m[2].trim());
  const badName = opens.filter(n => n !== "'_blank'" && n.indexOf('HUB_TAB_') < 0);
  T('名前をベタ書きして開いている所がもう無い（印刷の窓は除く）',
    badName.length === 0, badName.join(' / '));
  T('名前付きで開いているのは HUB_TAB_* の2か所だけ',
    opens.filter(n => n.indexOf('HUB_TAB_') === 0).length === 2, opens.join(' / '));
  console.log('');
  console.log('■ ② アドレスの ?dash=1 の印を消さない');

  // ★ここで見るのは「ダッシュボードの印を消す処理」だけ。
  //   ?hand= / ?inv= を消す replaceState は本人認証の別もので、残っていてよい。
  T('HUB_DASH_OPEN を見て印を消す処理が無い',
    !/HUB_DASH_OPEN[\s\S]{0,200}?history\.replaceState/.test(idx));
  T('消さない理由がコメントに残っている', idx.indexOf('?dash=1 を外さない') >= 0);

  console.log('');
  console.log('■ ② タイトルに [テスト版]。★印はいちばん【前】（タブは先頭しか見えない）');
  const titleOf = s => (s.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  T('index_dev のタイトルが [テスト版] で始まる', titleOf(idx).indexOf('[テスト版]') === 0, titleOf(idx));
  T('customers のタイトルが [テスト版] で始まる', titleOf(cus).indexOf('[テスト版]') === 0, titleOf(cus));
  T('mobile のタイトルが [テスト版] で始まる', titleOf(mob).indexOf('[テスト版]') === 0, titleOf(mob));

  console.log('');
  console.log('■ ② 顧客リストとスマホにも「⚠ テスト版」のバッジ');
  T('customers に HUB_IS_TEST がある', /const HUB_IS_TEST\s*=\s*\(STOR\s*!==\s*'hub-v8-'\)/.test(cus));
  T('mobile に HUB_IS_TEST がある', /const HUB_IS_TEST\s*=\s*\(STOR\s*!==\s*'hub-v8-'\)/.test(mob));
  T('customers のバッジは HUB_IS_TEST の時だけ出る',
    /\{HUB_IS_TEST&&<span data-testbadge="1"[\s\S]{0,400}?⚠ テスト版<\/span>\}/.test(cus));
  T('mobile のバッジは HUB_IS_TEST の時だけ出る',
    /\{HUB_IS_TEST&&<span data-testbadge="1"[\s\S]{0,400}?⚠ テスト版<\/span>\}/.test(mob));

  console.log('');
  console.log('■ ② port_to_main.js がタイトルを3つとも変換する');
  T('index のタイトル変換ルールが今の文字に合っている',
    prt.indexOf("['<title>[テスト版] Hub a Nice Day</title>', '<title>Hub a Nice Day</title>', 1]") >= 0);
  T('customers のタイトル変換ルールがある',
    prt.indexOf("['<title>[テスト版] 顧客リスト - Hub a Nice Day</title>', '<title>顧客リスト - Hub a Nice Day</title>', 1]") >= 0);
  T('mobile のタイトル変換ルールがある（CUST とは別の表に入っている）',
    prt.indexOf('const MOBILE_RULES') >= 0 &&
    prt.slice(prt.indexOf('const MOBILE_RULES')).indexOf("['<title>[テスト版] Hub a Nice Day</title>'") >= 0);
  T('残骸チェック（FORBIDDEN）に [テスト版] が入ったまま', prt.indexOf("'[テスト版]'") >= 0);

  console.log('');
  console.log('══════════════════════════════════');
  console.log((ng === 0 ? '✔ PASS' : '✖ FAIL') + '　合格 ' + ok + ' 件 / 不合格 ' + ng + ' 件');
  process.exit(ng === 0 ? 0 : 1);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
