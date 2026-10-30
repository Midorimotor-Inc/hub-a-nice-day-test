// 「週間カレンダーの使い方」を URL で見られる1枚のHTMLにする（2026-10）。
//   素材: manual4_web/deck.json と manual4_web/img/*.png
//         （どちらも build_manual4_pptx.js が書き出す。文章は PPTX と同じ出どころ＝ずれない）
//   実行: node build_manual4_pptx.js → node build_manual4_web.js
//   出力: manual4_web/index.html（Artifact として公開する。img は files で一緒に出す）
const path = require('path'), fs = require('fs');
const DIR = path.join(__dirname, 'manual4_web');
const deck = JSON.parse(fs.readFileSync(path.join(DIR, 'deck.json'), 'utf8'));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = v => (v * 100).toFixed(3) + '%';

const HEAD = `<title>週間カレンダーの使い方</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&display=swap">
<style>
/* 並べ方：上に細い操作の帯、その下に1ページぶん。写真は白い台に乗せ、赤枠は写真の上に割合で重ねる */
:root{
  --navy:#12233f; --navy-2:#1e3a66; --blue:#1d4ed8; --blue-l:#e8effc;
  --orange:#ea580c; --orange-l:#fdede2; --green:#15803d; --green-l:#e6f3ea;
  --mark:#e11d48; --ink:#1b2735; --muted:#5b6b7c; --line:#d8e0ea;
  --paper:#ffffff; --soft:#f4f7fb; --bg:#eef2f8; --shadow:0 2px 10px rgba(18,35,63,.14);
  --f-disp:'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;
  --f-body:'Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --navy:#0b1628; --navy-2:#1a2e52; --blue:#7aa6ff; --blue-l:#17233c;
  --orange:#fb8a4c; --orange-l:#33210f; --green:#5dc98a; --green-l:#13291c;
  --mark:#ff6b8a; --ink:#e7edf6; --muted:#9fb0c4; --line:#2b3a52;
  --paper:#141d2c; --soft:#192233; --bg:#0d1420; --shadow:0 2px 12px rgba(0,0,0,.5);
  color-scheme:dark;
}}
:root[data-theme="dark"]{
  --navy:#0b1628; --navy-2:#1a2e52; --blue:#7aa6ff; --blue-l:#17233c;
  --orange:#fb8a4c; --orange-l:#33210f; --green:#5dc98a; --green-l:#13291c;
  --mark:#ff6b8a; --ink:#e7edf6; --muted:#9fb0c4; --line:#2b3a52;
  --paper:#141d2c; --soft:#192233; --bg:#0d1420; --shadow:0 2px 12px rgba(0,0,0,.5);
  color-scheme:dark;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);line-height:1.7;margin:0}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--navy)}
h1,h2,h3{font-family:var(--f-disp);text-wrap:balance;margin:0}
.wrap{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));max-width:1180px;margin:0 auto}

/* 上の帯 */
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:9;background:var(--navy);color:#fff;box-shadow:var(--shadow)}
.bar .wrap{display:flex;align-items:center;gap:8px;padding-block:9px;min-height:54px}
.bar .nm{font-family:var(--f-disp);font-weight:700;font-size:15px;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .nm small{display:block;font-weight:500;font-size:11px;color:#9fc2ff;letter-spacing:.3px}
.bar .sp{flex:1;min-width:8px}
.btn{font-family:var(--f-body);font-size:13px;font-weight:700;color:#fff;background:var(--navy-2);border:1px solid #37558c;border-radius:9px;padding:7px 12px;cursor:pointer;white-space:nowrap}
.btn:hover{background:#2a4679}
.btn:disabled{opacity:.35;cursor:default}
.btn:focus-visible,li>button:focus-visible{outline:3px solid #ffb27a;outline-offset:2px}
.cnt{font-variant-numeric:tabular-nums;font-size:13px;color:#c6d4e8;min-width:58px;text-align:center}

/* 1ページぶん */
main{padding-block:18px 28px}
.sl{background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.sl>.pad{padding:clamp(16px,2.4vw,24px)}
.kick{display:inline-block;font-size:11.5px;font-weight:700;color:#fff;border-radius:999px;padding:3px 12px;letter-spacing:.5px}
.ttl{font-size:clamp(20px,3.2vw,29px);font-weight:900;margin-top:8px}
.sub{color:var(--muted);font-size:13.5px;margin-top:6px}
.shotwrap{display:grid;gap:16px;margin-top:16px}
.shotwrap.side{grid-template-columns:minmax(0,1.22fr) minmax(250px,.78fr);align-items:start}
@media (max-width:780px){.shotwrap.side{grid-template-columns:1fr}}
.shot{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 14px 14px;min-width:0}
.shot .in{position:relative;width:100%}
.shot img{display:block;width:100%;max-width:100%;border-radius:3px}
.fr{position:absolute;border:3px solid var(--mark);border-radius:3px;pointer-events:none}
.bg{position:absolute;width:25px;height:25px;border-radius:50%;background:var(--mark);color:#fff;font-family:var(--f-disp);font-weight:900;font-size:13.5px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.4);pointer-events:none}
.mask{position:absolute;background:#fff;color:#1b2735;font-size:12px;display:flex;align-items:center;padding-left:6px;overflow:hidden}
.cards{display:grid;gap:10px;min-width:0}
.shotwrap:not(.side) .cards{grid-template-columns:repeat(auto-fit,minmax(252px,1fr))}
.card{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0}
.card h3{font-size:14.5px;font-weight:700;display:flex;align-items:flex-start;gap:8px}
.card h3 i{flex:0 0 auto;width:23px;height:23px;border-radius:50%;background:var(--mark);color:#fff;font-style:normal;font-size:12.5px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:2px}
.card p{margin:6px 0 0;font-size:12.8px;color:var(--muted);white-space:pre-line}
.note{margin-top:14px;background:var(--blue-l);border-left:4px solid var(--blue);border-radius:0 8px 8px 0;padding:10px 13px;font-size:12.8px}

/* 文字だけのページ */
.blocks{display:grid;gap:12px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(288px,1fr))}
.blk{background:var(--soft);border:1px solid var(--line);border-left-width:4px;border-left-color:var(--blue);border-radius:0 10px 10px 0;padding:13px 15px;min-width:0}
.blk.warn{background:var(--orange-l);border-left-color:var(--orange)}
.blk.ok{background:var(--green-l);border-left-color:var(--green)}
.blk h3{font-size:15px;font-weight:700;display:flex;align-items:flex-start;gap:9px}
.blk h3 i{flex:0 0 auto;width:25px;height:25px;border-radius:50%;background:var(--blue);color:#fff;font-style:normal;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:1px}
.blk.warn h3 i{background:var(--orange)}
.blk.ok h3 i{background:var(--green)}
.blk p{margin:7px 0 0;font-size:13px;white-space:pre-line}

/* 表紙・中表紙 */
.dark{background:var(--navy);border-color:var(--navy);color:#fff}
.dark>.pad{padding:clamp(22px,5vw,52px)}
.dark .eyebrow{font-size:12.5px;font-weight:700;color:#f2a97c;letter-spacing:3px;margin:0}
.dark h2{font-size:clamp(25px,4.8vw,39px);font-weight:900;margin-top:8px}
.dark .lead{color:#c6d4e8;font-size:14px;margin-top:10px}
.chips{display:grid;gap:9px;margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(255px,1fr))}
.chip{background:var(--navy-2);border:1px solid #2f5590;border-radius:9px;padding:10px 14px;font-size:13px}
.cover h1{font-size:clamp(27px,5.6vw,43px);font-weight:900}
.cover h2{color:#9fc2ff;margin-top:4px}
.cover .tag{display:inline-block;margin-top:18px;background:var(--navy-2);border:1px solid #2f5590;border-radius:999px;padding:6px 16px;font-size:12.5px;color:#c6d4e8}
.cover .foot2{margin-top:26px;font-size:11.5px;color:#90a4bf}
.toc{display:grid;gap:12px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(268px,1fr))}
.toccol{border:1.5px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
.toccol h3{font-size:18px;font-weight:900;margin-bottom:9px}
.toccol ol{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.toccol li{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--ink)}
.toccol li b{flex:0 0 auto;width:22px;height:22px;border-radius:50%;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:2px}

/* 下の送りボタン */
.foot{display:flex;gap:10px;align-items:center;margin-top:16px}
.foot .btn{background:var(--blue);border-color:var(--blue);font-size:14px;padding:11px 14px}
.foot .btn:hover{filter:brightness(1.08)}
.foot .mid{flex:1;text-align:center;font-size:12.5px;color:var(--muted);min-width:0}

/* 目次 */
#idx{position:fixed;inset:0;z-index:20;background:rgba(10,18,32,.6);display:flex;justify-content:flex-end}
#idx .panel{background:var(--paper);width:min(430px,92vw);height:100%;overflow-y:auto;padding:16px;padding-top:calc(16px + env(safe-area-inset-top,0px));padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));box-shadow:var(--shadow)}
#idx h2{font-size:17px;font-weight:900;margin-bottom:10px}
#idx ol{list-style:none;margin:0;padding:0;display:grid;gap:3px}
#idx li button{all:unset;display:flex;gap:10px;align-items:baseline;cursor:pointer;width:100%;padding:9px 10px;border-radius:9px;font-size:13.5px;color:var(--ink)}
#idx li button:hover{background:var(--soft)}
#idx li button[aria-current="true"]{background:var(--blue-l);font-weight:700}
#idx li button span{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px;min-width:26px}
@media (prefers-reduced-motion:no-preference){.sl{animation:slin .22s ease both}@keyframes slin{from{opacity:0;transform:translateY(6px)}}}
</style>`;

function badgeStyle(r) {
  // 番号は枠の真上（PPTX と同じ考え方）。横に長い枠は左の端の上（真ん中だと表の中で浮く）
  const wide = r.w > 0.25;
  const left = wide ? Math.max(0, r.x) : Math.max(0, Math.min(r.x + r.w / 2, 1));
  return 'left:' + pct(left) + ';top:' + pct(Math.max(r.y, 0)) + ';transform:translate(' + (wide ? '2px' : '-50%') + ',-118%)';
}
function head(s) {
  const c = !s.kicker ? null : s.kicker.t === '見る' ? 'var(--blue)' : s.kicker.t === '予約' ? 'var(--green)' : 'var(--orange)';
  return (s.kicker ? '<span class="kick" style="background:' + c + '">' + esc(s.kicker.t) + '</span>' : '') +
    '<h2 class="ttl">' + esc(s.title) + '</h2>' + (s.sub ? '<p class="sub">' + esc(s.sub) + '</p>' : '');
}
function shotSlide(s) {
  const side = s.ratio < 1.7 && !s.below;      // 縦長の写真だけ、説明を右の列に置く
  const frames = s.items.map(it =>
    '<div class="fr" style="left:' + pct(it.rect.x) + ';top:' + pct(it.rect.y) + ';width:' + pct(it.rect.w) + ';height:' + pct(it.rect.h) + '"></div>' +
    '<div class="bg" style="' + badgeStyle(it.rect) + '">' + it.n + '</div>').join('');
  const masks = (s.masks || []).map(m =>
    '<div class="mask" style="left:' + pct(m.rect.x) + ';top:' + pct(m.rect.y) + ';width:' + pct(m.rect.w) + ';height:' + pct(m.rect.h) + '">' + esc(m.text) + '</div>').join('');
  const cards = s.items.map(it =>
    '<div class="card"><h3><i>' + it.n + '</i>' + esc(it.t) + '</h3>' + (it.d ? '<p>' + esc(it.d) + '</p>' : '') + '</div>').join('');
  return '<div class="pad">' + head(s) +
    '<div class="shotwrap' + (side ? ' side' : '') + '"><div class="shot"><div class="in" style="aspect-ratio:' + s.ratio.toFixed(4) + '">' +
    '<img src="img/' + esc(s.img) + '" alt="' + esc(s.title) + '（画面写真）">' + masks + frames +
    '</div></div><div class="cards">' + cards + '</div></div>' +
    (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</div>';
}
function textSlide(s) {
  const blocks = s.blocks.map(b =>
    '<div class="blk' + (b.tone === 'warn' ? ' warn' : b.tone === 'ok' ? ' ok' : '') + '">' +
    '<h3>' + (b.n != null ? '<i>' + b.n + '</i>' : '') + esc(b.t) + '</h3>' +
    (b.d ? '<p>' + esc(b.d) + '</p>' : '') + '</div>').join('');
  return '<div class="pad">' + head(s) + '<div class="blocks">' + blocks + '</div>' +
    (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</div>';
}
function sectionSlide(s) {
  return '<div class="pad"><p class="eyebrow">第 ' + s.no + ' 部</p><h2>' + esc(s.title) + '</h2>' +
    (s.lead ? '<p class="lead">' + esc(s.lead) + '</p>' : '') +
    '<div class="chips">' + s.items.map(i => '<div class="chip">' + esc(i) + '</div>').join('') + '</div></div>';
}
function coverSlide(s) {
  return '<div class="pad cover"><h1>' + esc(s.title) + '</h1><h2>' + esc(s.sub) + '</h2>' +
    '<p class="lead">' + esc(s.lead) + '</p><span class="tag">' + esc(s.tag) + '</span>' +
    '<p class="foot2">' + esc(s.foot) + '　／　お客様のお名前・電話・住所は架空のものに置き換えてあります</p></div>';
}
function tocSlide(s) {
  const cols = s.cols.map(c => {
    const col = c.c === '1D4ED8' ? 'var(--blue)' : c.c === '15803D' ? 'var(--green)' : 'var(--orange)';
    const bg = c.c === '1D4ED8' ? 'var(--blue-l)' : c.c === '15803D' ? 'var(--green-l)' : 'var(--orange-l)';
    return '<div class="toccol" style="border-color:' + col + ';background:' + bg + '"><h3 style="color:' + col + '">' + esc(c.t) + '</h3><ol>' +
      c.items.map((it, j) => '<li><b style="background:' + col + '">' + (j + 1) + '</b>' + esc(it) + '</li>').join('') + '</ol></div>';
  }).join('');
  return '<div class="pad"><h2 class="ttl">' + esc(s.title) + '</h2><p class="sub">' + esc(s.sub) + '</p>' +
    '<div class="toc">' + cols + '</div></div>';
}

const body = deck.slides.map((s, i) => {
  const inner = s.kind === 'shot' ? shotSlide(s) : s.kind === 'text' ? textSlide(s)
    : s.kind === 'section' ? sectionSlide(s) : s.kind === 'cover' ? coverSlide(s) : tocSlide(s);
  const dark = (s.kind === 'section' || s.kind === 'cover');
  return '  <section class="sl' + (dark ? ' dark' : '') + '" id="s' + (i + 1) + '"' + (i ? ' hidden' : '') + '>' + inner + '</section>';
}).join('\n');

const names = deck.slides.map(s => s.kind === 'section' ? '第' + s.no + '部　' + s.title : (s.title || ''));
const N = deck.slides.length;

const html = HEAD + `
<header class="bar"><div class="wrap">
  <div class="nm">週間カレンダーの使い方<small>Hub a Nice Day　緑モータース</small></div>
  <div class="sp"></div>
  <button class="btn" id="prev" aria-label="前のページ">‹</button>
  <span class="cnt" id="cnt" aria-live="polite"></span>
  <button class="btn" id="next" aria-label="次のページ">›</button>
  <button class="btn" id="open">☰ 目次</button>
</div></header>
<main><div class="wrap">
${body}
  <div class="foot">
    <button class="btn" id="prev2">‹ 前のページ</button>
    <span class="mid" id="mid"></span>
    <button class="btn" id="next2">次のページ ›</button>
  </div>
</div></main>
<div id="idx" hidden><div class="panel" role="dialog" aria-label="目次">
  <h2>目次（全 ${N} ページ）</h2>
  <ol id="idxlist"></ol>
  <div style="margin-top:14px"><button class="btn" id="close" style="background:var(--blue);border-color:var(--blue)">とじる</button></div>
</div></div>
<script id="names" type="application/json">${JSON.stringify(names).replace(/</g, '\\u003c')}</script>
<script>
(function(){
  var N = ${N}, names = JSON.parse(document.getElementById('names').textContent), cur = 1;
  var list = document.getElementById('idxlist');
  names.forEach(function(nm, i){
    var li = document.createElement('li'), b = document.createElement('button');
    var sp = document.createElement('span'); sp.textContent = (i + 1);
    b.appendChild(sp); b.appendChild(document.createTextNode(nm));
    b.onclick = function(){ go(i + 1); hideIdx(); };
    li.appendChild(b); list.appendChild(li);
  });
  function show(n){
    for (var i = 1; i <= N; i++){ var el = document.getElementById('s' + i); if (el) el.hidden = (i !== n); }
    cur = n;
    document.getElementById('cnt').textContent = n + ' / ' + N;
    document.getElementById('mid').textContent = names[n - 1] || '';
    document.getElementById('prev').disabled = document.getElementById('prev2').disabled = (n === 1);
    document.getElementById('next').disabled = document.getElementById('next2').disabled = (n === N);
    var bs = list.querySelectorAll('button');
    for (var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-current', (j + 1 === n) ? 'true' : 'false');
  }
  function go(n){
    show(Math.max(1, Math.min(N, n)));
    try { history.replaceState(null, '', '#s' + cur); } catch(e) {}
    window.scrollTo(0, 0);
  }
  function hideIdx(){ document.getElementById('idx').hidden = true; }
  document.getElementById('prev').onclick = document.getElementById('prev2').onclick = function(){ go(cur - 1); };
  document.getElementById('next').onclick = document.getElementById('next2').onclick = function(){ go(cur + 1); };
  document.getElementById('open').onclick = function(){ document.getElementById('idx').hidden = false; };
  document.getElementById('close').onclick = hideIdx;
  document.getElementById('idx').onclick = function(e){ if (e.target === this) hideIdx(); };
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ hideIdx(); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown'){ go(cur + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp'){ go(cur - 1); e.preventDefault(); }
  });
  function fromHash(){
    var m = (location.hash || '').match(/^#s(\\d+)$/);
    return m ? Math.max(1, Math.min(N, parseInt(m[1], 10))) : 1;
  }
  // ページ番号つきのリンク（#s11）で開いた時・同じページの中で飛ばされた時の両方に合わせる
  window.addEventListener('hashchange', function(){ show(fromHash()); window.scrollTo(0, 0); });
  show(fromHash());
})();
</` + `script>
`;

fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log('出力: ' + path.join(DIR, 'index.html') + '　（' + N + ' ページ・' + Math.round(html.length / 1024) + 'KB）');
