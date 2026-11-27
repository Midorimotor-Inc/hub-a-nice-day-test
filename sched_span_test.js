const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'index_dev.html'),'utf8');
const m=src.match(/const toNum      = \(y,m,d\)[\s\S]*?\nconst spanDays = \(from,to\)=>\{[\s\S]*?\n\};/);
if(!m){console.error('抽出できません');process.exit(1);}
const ctx={};vm.createContext(ctx);vm.runInContext(m[0]+String.fromCharCode(10)+"this.schedSpan=schedSpan;this.spanDays=spanDays;",ctx);
const {schedSpan,spanDays}=ctx;
const ok=[],ng=[];
const t=(n,c,e)=>{(c?ok:ng).push(n+(c?'':'  ← '+JSON.stringify(e)));};
const span=(o)=>{const s=schedSpan(o);return {...s,days:spanDays(s.from,s.to)};};
const INSP='2026-8-25';

// クイック車検（当日）
let s=span({inspDk:INSP,entryDate:'',deliveryDate:'',course:2});
t('クイック・設定なし=1日',s.days===1&&s.from===20260825&&s.to===20260825,s);
s=span({inspDk:INSP,entryDate:'2026-8-24',deliveryDate:'',course:2});
t('クイック・前日入庫=2日',s.days===2&&s.from===20260824&&s.to===20260825,s);

// レギュラー車検（1泊2日が既定）
s=span({inspDk:INSP,entryDate:'',deliveryDate:'',course:3});
t('レギュラー・設定なし=2日(8/25〜8/26)',s.days===2&&s.from===20260825&&s.to===20260826,s);
s=span({inspDk:INSP,entryDate:'2026-8-24',deliveryDate:'',course:3});
t('レギュラー・前日入庫=3日(8/24〜8/26)',s.days===3&&s.from===20260824&&s.to===20260826,s);
s=span({inspDk:INSP,entryDate:'2026-8-23',deliveryDate:'',course:3});
t('レギュラー・2日前入庫=4日(8/23〜8/26)',s.days===4&&s.from===20260823&&s.to===20260826,s);

// 納車日を明示した場合はそれが優先
s=span({inspDk:INSP,entryDate:'',deliveryDate:'2026-8-27',course:3});
t('レギュラー・納車日8/27=3日',s.days===3&&s.to===20260827,s);
s=span({inspDk:INSP,entryDate:'2026-8-24',deliveryDate:'2026-8-27',course:3});
t('レギュラー・前日入庫+納車8/27=4日',s.days===4&&s.from===20260824&&s.to===20260827,s);
s=span({inspDk:INSP,entryDate:'',deliveryDate:'2026-8-25',course:3});
t('レギュラー・納車日を当日に指定=1日',s.days===1&&s.to===20260825,s);
s=span({inspDk:INSP,entryDate:'2026-8-24',deliveryDate:'2026-8-24',course:2});
t('クイック・前日入庫かつ前日納車=1日',s.days===1&&s.to===20260824,s);

// 月またぎ
s=span({inspDk:'2026-8-31',entryDate:'',deliveryDate:'',course:3});
t('レギュラー・月末は翌月1日へ',s.to===20260901,s);
s=span({inspDk:'2026-9-1',entryDate:'2026-8-31',deliveryDate:'',course:3});
t('月をまたぐ前日入庫=3日',s.days===3&&s.from===20260831&&s.to===20260902,s);

// courseが文字列/未設定
s=span({inspDk:INSP,entryDate:'',deliveryDate:'',course:'3'});
t('courseが文字列の"3"でもレギュラー扱い',s.days===2,s);
s=span({inspDk:INSP,entryDate:'',deliveryDate:'',course:null});
t('course未設定は当日',s.days===1,s);

console.log('PASS '+ok.length+'件');ok.forEach(n=>console.log('  ✔ '+n));
if(ng.length){console.log('FAIL '+ng.length+'件');ng.forEach(n=>console.log('  ✖ '+n));process.exit(1);}
