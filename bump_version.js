// バージョン一括更新ツール（システム全体で1バージョンを保証する）
// index_dev.html(APP_VERSION) / mobile.html(MOBILE_VERSION) / customers.html(APP_VERSION) を必ず同値にする。
//   使い方:
//     node bump_version.js         → 直し（3桁の右端 +1。例 3.114.0 → 3.114.1）
//     node bump_version.js --feat  → 新機能（3桁の真ん中 +1。例 3.114.1 → 3.115.0）
//     node bump_version.js 1.40    → 指定値に統一
//     node bump_version.js --check → 3ファイルが揃っているか確認のみ（揃っていなければ exit 1）
//     node bump_version.js --stamp → バージョンは変えず __APP_BUILD だけ打ち直す
// ※本番(index_main.html)は port_to_main.js が DEV の値ごとコピーするので、ここでは触らない。
const fs=require('fs');
const files=[
  {f:'index_dev.html', re:/const APP_VERSION = '([\d.]+)'/,  tpl:v=>`const APP_VERSION = '${v}'`},
  {f:'mobile.html',    re:/const MOBILE_VERSION='([\d.]+)'/, tpl:v=>`const MOBILE_VERSION='${v}'`},
  {f:'customers.html', re:/const APP_VERSION='([\d.]+)'/,    tpl:v=>`const APP_VERSION='${v}'`},
];
// ★__APP_BUILD は「開きっぱなしのタブに更新を知らせる」ための唯一の目印。
//   これまで打ち直していたのは port_to_main.js（本番デプロイ）だけで、DEVは
//   build-1781580000000 のまま固定だった。＝DEVのタブには「新しいバージョンがあります」が
//   一度も出ず、利用者が手で強制リロードするまで旧コードのまま動き続ける
//   （2026-08-24、v1.79を出した直後のテストが旧コードのタブで行われていた）。
//   バージョンを上げる時は必ずここも打ち直す。
const stampBuild=()=>{
  const build='build-'+Date.now();
  files.forEach(x=>{
    const t=fs.readFileSync(x.f,'utf8');
    if(!/__APP_BUILD='build-\d+'/.test(t)){
      console.error(`✖ ${x.f}: __APP_BUILD が見つかりません`);process.exit(1);
    }
    fs.writeFileSync(x.f, t.replace(/__APP_BUILD='build-\d+'/, "__APP_BUILD='"+build+"'"));
  });
  console.log(`✔ __APP_BUILD を ${build} に更新（開いたままのタブに更新バナーが出る）`);
};

const cur=files.map(x=>{
  const m=fs.readFileSync(x.f,'utf8').match(x.re);
  if(!m)throw new Error(`${x.f}: バージョン定義が見つかりません`);
  return m[1];
});
if(new Set(cur).size!==1){
  console.error('✖ バージョンが揃っていません:', files.map((x,i)=>`${x.f}=${cur[i]}`).join(' / '));
  console.error('  → 手動で揃えてから再実行してください。');
  process.exit(1);
}
if(process.argv[2]==='--check'){ console.log(`✔ 全ファイル一致: v${cur[0]}`); process.exit(0); }
if(process.argv[2]==='--stamp'){ stampBuild(); process.exit(0); }
// ★★2026-10-06 からバージョンは【3桁】（新機能＝真ん中+1／直し＝右端+1）。
//   引数なしの「+0.01」は2桁時代の名残で、3桁だと **3.114.0 → 3.12** のように壊れる
//   （2026-11-13 に実際に踏んだ）。3桁のときは 引数なし＝【右端+1（直し）】、
//   新機能は `node bump_version.js --feat`（真ん中+1・右端は0に戻す）。
const bumpAuto=(v,feat)=>{
  const p=String(v).split('.');
  if(p.length>=3){
    const a=p[0],b=p[1],c=p[2];
    return feat ? [a,String(Number(b)+1),'0'].join('.') : [a,b,String(Number(c)+1)].join('.');
  }
  return (parseFloat(v)+0.01).toFixed(2);   // 2桁時代の控え
};
const arg=process.argv[2];
const feat=(arg==='--feat');
const next=(!arg||feat)?bumpAuto(cur[0],feat):arg;
files.forEach(x=>{
  const s=fs.readFileSync(x.f,'utf8');
  fs.writeFileSync(x.f, s.replace(x.re, x.tpl(next)));
});
stampBuild();
console.log(`✔ v${cur[0]} → v${next}（index_dev / mobile / customers を統一）`);
