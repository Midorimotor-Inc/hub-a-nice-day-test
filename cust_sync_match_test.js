// スケジュール→顧客リストの通知（cust-updates）の宛先照合の検査（2026-11-17）
//   ★ねらいは「別人のリストを書き換えないこと」。
//   本番には「苗字だけ・ナンバー空」で入っている車検予約が13件あり、
//   同姓の別人（古川3人・高橋2人・上田3人）が実在する。それまでの照合は
//   「通知のナンバーが空なら氏名だけで一致」としていたので、古川さんの予約を
//   1件キャンセルすると古川さん3人全員のリストが書き換わっていた。
//   customers.html の中の純関数をそのまま取り出して確かめる（ブラウザを開かない）。
//   実行: node cust_sync_match_test.js
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'customers.html'), 'utf8');
const SRC_PC = fs.readFileSync(path.join(__dirname, 'index_dev.html'), 'utf8');
const SRC_MB = fs.readFileSync(path.join(__dirname, 'mobile.html'), 'utf8');
let pass = 0, fail = 0;
const NL = String.fromCharCode(10);
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(NL + '■ ' + s);

// 「const 名前 = …;」を1つ取り出す（中かっこの対応を数えて終わりを見つける）
const grab = (name, src) => {
  const S = src || SRC;
  const m = S.indexOf(NL + 'const ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  let i = m + 1, depth = 0, started = false;
  for (; i < S.length; i++) {
    const c = S[i];
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0 && started) return S.slice(m + 1, i + 1);
  }
  throw new Error(name + ' の終わりが分かりません');
};
const code = ['updNm', 'updNo', 'updCar', 'updRank', 'updResolve'].map(n => grab(n)).join(NL)
  + NL + grab('_resObj', SRC_PC) + NL + grab('resBksForBooking', SRC_PC);
const box = {};
new Function('exports', code + NL + 'exports.updRank=updRank;exports.updResolve=updResolve;exports.updNm=updNm;exports.resBksForBooking=resBksForBooking;')(box);
const { updRank, updResolve, updNm, resBksForBooking } = box;

// ── にせの顧客リスト（同姓の別人がいる形。本番と同じ作り）──
const FUR1 = { custId: '202611__12__古川__0', name: '古川', no: '', carType: 'ワゴンR', expiry: '2026-11-20' };
const FUR2 = { custId: '202611__48__古川__3310', name: '古川', no: '3310', carType: 'ハスラー', expiry: '2026-11-28' };
const FUR3 = { custId: '202612__7__古川__5902', name: '古川', no: '5902', carType: 'スペーシア', expiry: '2026-12-03' };
const SATO = { custId: '202611__90__佐藤健太__1234', name: '佐藤　健太', no: '1234', carType: 'タント', expiry: '2026-11-15' };
const KONDO = { custId: '202611__91__近藤__7777', name: '近藤', no: '7777', carType: 'アルト', expiry: '2026-11-18' };
const FILES = [{ name: '202611', customers: [FUR1, FUR2, FUR3, SATO, KONDO] }];

head('① 同姓の別人に書かない（これが今回の本題）');
{
  // スケジュールで「古川」だけ・ナンバー空の予約をキャンセルした時の通知
  const u = { custId: '', name: '古川', no: '', status: 'cancel', ts: 1 };
  const r = updResolve(u, FILES);
  t('ナンバー空・同姓3人 → 取り合い（amb）になる', r.amb === true, r);
  t('ナンバー空・同姓3人 → 誰にも書かない（hits が0件）', r.hits.length === 0, r);
}
{
  // 車種が分かれば1人に決まる
  const u = { custId: '', name: '古川', no: '', carType: 'ハスラー', status: 'cancel', ts: 2 };
  const r = updResolve(u, FILES);
  t('車種が分かれば1人に決まる', r.amb === false && r.hits.length === 1, r);
  t('決まった相手が正しい（ハスラーの古川さん）', r.hits[0] === FUR2, r.hits[0] && r.hits[0].custId);
}
{
  const u = { custId: '', name: '古川', no: '', carType: 'ジムニー', ts: 3 };
  const r = updResolve(u, FILES);
  t('車種がどの古川さんとも違えば誰にも書かない', r.rank === 0 && r.hits.length === 0, r);
}

head('② 強い照合はそのまま通る');
t('custId が一致 → いちばん強い(3)', updRank({ custId: FUR3.custId, name: 'まったく別の名前' }, FUR3) === 3);
t('氏名＋ナンバーが一致 → 2', updRank({ name: '古川', no: '3310' }, FUR2) === 2);
t('氏名は同じでもナンバーが違えば 0', updRank({ name: '古川', no: '3310' }, FUR3) === 0);
t('通知にナンバーがありリストに無い → 0（確かめられない）', updRank({ name: '古川', no: '3310' }, FUR1) === 0);
t('氏名が部分一致でも 0（古川 ≠ 古川商店）', updRank({ name: '古川' }, { name: '古川商店', no: '' }) === 0);
t('氏名が違えば 0', updRank({ name: '高橋', no: '3310' }, FUR2) === 0);

head('③ 氏名の書き方の違いは吸収する');
t('半角スペースの違いを吸収（佐藤 健太 ＝ 佐藤　健太）', updRank({ name: '佐藤 健太', no: '1234' }, SATO) === 2);
t('「様」付きでも同じ人（近藤様 ＝ 近藤）', updRank({ name: '近藤様', no: '7777' }, KONDO) === 2);
t('updNm は半角スペースを外す', updNm('佐藤 健太') === '佐藤健太', updNm('佐藤 健太'));
t('updNm は英小文字の s を消さない', updNm('sato') === 'sato', updNm('sato'));

head('④ 同じ人が複数の月ファイルに居る時は両方に当てる');
{
  const dup = { custId: FUR3.custId, name: '古川', no: '5902', carType: 'スペーシア', expiry: '2026-12-03' };
  const files2 = [FILES[0], { name: '202612', customers: [dup] }];
  const r = updResolve({ custId: FUR3.custId, name: '古川', no: '5902' }, files2);
  t('custId が同じ行は何本でも当てる', r.rank === 3 && r.hits.length === 2, r);
}

head('⑤ 顧客リスト側の作り（ファイルの中身で見張る）');
t('照合は updResolve を通している（氏名だけの find を残していない）',
  /const matchesCust=u=>updResolve\(/.test(SRC) &&
  !/const findUpd=\(c\)=>fresh\.find\(u=>/.test(SRC));
t('宛先は通知ごとに先に決める（_assign）', /const _assign=new Map\(\)/.test(SRC) && /const findUpd=\(c\)=>_assign\.get\(c\);/.test(SRC));
t('取り合いの通知は当てずに画面へ回す', /if\(_r\.amb\)\{ambNow\.push\(u\);return;\}/.test(SRC));
t('取り合いの通知を出す帯がある（data-ambupd）', /data-ambupd/.test(SRC));
t('車種は照合に使うだけでリストには書かない（2か所）',
  (SRC.match(/carType:_____,\.\.\./g) || []).length === 2,
  (SRC.match(/carType:_____,\.\.\./g) || []).length);
t('読み返しの確認も同じ照合（updRank）', /chk\.customers\.find\(x=>updRank\(u,x\)>=2\)/.test(SRC));

head('⑥ 同期チェックの氏名・車種の正規化（半角スペースが外れること）');
t("customers.html の syncNm が /[\\s　]/ になっている", /const syncNm=s=>String\(s==null\?'':s\)\.replace\(\/\[\\s　\]\/g,''\)/.test(SRC));
t("customers.html の syncCar が /[\\s　]/ になっている", /const syncCar=s=>String\(s==null\?'':s\)\.replace\(\/\[\\s　\]\/g,''\)/.test(SRC));
t('どのファイルにも壊れた /[s　]/ が残っていない',
  !/\[s　\]/.test(SRC) && !/\[s　\]/.test(SRC_PC) && !/\[s　\]/.test(SRC_MB));

head('⑦ スケジュール側：通知に氏名・ナンバー・車種を必ず付ける');
t('日にち変更・保存の通知に氏名とナンバーを渡している', /\},_mName,_mNo\);/.test(SRC_PC));
t('custId が無い手入力の予約にも通知を出す', /if\(custId\|\|_mName\)\{/.test(SRC_PC));
t('日にち変更の通知に車種を付けている', /carType:clean\.carType\|\|existingRow\?\.carType\|\|''/.test(SRC_PC));
t('キャンセルの通知にも車種を付けている', /linkedInspDate:'',carType:cancelledRow\?\.carType\|\|''\}/.test(SRC_PC));

head('⑧ 通知キューは「足すだけ」「消す分だけ」をトランザクションで');
t("スケジュール側は writeVerified で積む", /const _ok=await writeVerified\(STOR\+'cust-updates',/.test(SRC_PC));
t("スケジュール側に sSet\(STOR+'cust-updates' が残っていない", !/sSet\(STOR\+'cust-updates'/.test(SRC_PC));
t('顧客リストの後片付けも writeVerified（消す分だけ）',
  /const _dropTs=new Set\(/.test(SRC) && /await writeVerified\(STOR\+'cust-updates',/.test(SRC));
t("顧客リストに丸ごと書き戻す sSet\(STOR+'cust-updates' が残っていない", !/sSet\(STOR\+'cust-updates'/.test(SRC));
t('スマホは custUpdPush（fbTxn で足すだけ）を使う',
  /const custUpdPush = async \(upd\) => \{/.test(SRC_MB) &&
  (SRC_MB.match(/await custUpdPush\(_upd\);/g) || []).length === 2);
t('スマホに古い書き戻しが残っていない',
  (SRC_MB.match(/sSet\(STOR\+'cust-updates'/g) || []).length === 1,   // custUpdPush の中の GAS 用の控えだけ
  (SRC_MB.match(/sSet\(STOR\+'cust-updates'/g) || []).length);
t('通知の保持期間が60日でそろっている（7日で消えない）',
  /_keepFrom=Date\.now\(\)-60\*24\*3600\*1000/.test(SRC_PC) &&
  /keepFrom=Date\.now\(\)-60\*24\*3600\*1000/.test(SRC_MB) &&
  /_weekAgo=Date\.now\(\)-60\*24\*3600\*1000/.test(SRC));

head('⑨ キャンセル・削除で代車の帯を必ず外す（行番号がずれていても）');
{
  const band = (bk, user) => ({ bookingKey: bk, user, carName: 'ハスラー', carNum: '3310' });
  // 代車の表は {車ID:{キー:予約}} の形
  const lres = { 7: { '2026-11-20': band('insp-2026-11-20-2', '砂原 米彦') } };
  t('bookingKey が一致 → その鍵を外す',
    JSON.stringify(resBksForBooking(lres, 'insp-2026-11-20-2', '砂原 米彦')) === JSON.stringify(['insp-2026-11-20-2']));
  t('★行番号がずれていても、同じ日・同じ氏名で見つける',
    JSON.stringify(resBksForBooking(lres, 'insp-2026-11-20-5', '砂原 米彦')) === JSON.stringify(['insp-2026-11-20-2']),
    resBksForBooking(lres, 'insp-2026-11-20-5', '砂原 米彦'));
  t('氏名が違えば拾わない（別人の代車を外さない）',
    resBksForBooking(lres, 'insp-2026-11-20-5', '岩本').length === 0);
  t('別の日の帯は拾わない',
    resBksForBooking(lres, 'insp-2026-11-21-2', '砂原 米彦').length === 0);
  t('氏名が分からない時は拾わない（行番号だけで消さない）',
    resBksForBooking(lres, 'insp-2026-11-20-5', '').length === 0);
  // 同じ日に同じ氏名の帯が2本＝どちらの予約の分か決められない
  const lres2 = { 7: { '2026-11-20': band('insp-2026-11-20-2', '砂原 米彦') },
                  9: { '2026-11-20': band('insp-2026-11-20-4', '砂原 米彦') } };
  t('★同じ日に同じ氏名の帯が2本あれば何も触らない',
    resBksForBooking(lres2, 'insp-2026-11-20-9', '砂原 米彦').length === 0,
    resBksForBooking(lres2, 'insp-2026-11-20-9', '砂原 米彦'));
  t('2本あっても鍵が完全一致ならその1本だけ外す',
    JSON.stringify(resBksForBooking(lres2, 'insp-2026-11-20-4', '砂原 米彦')) === JSON.stringify(['insp-2026-11-20-4']));
  // 月をまたぐ続きの帯は同じ bookingKey を持つ＝1本として数える
  const lres3 = { 7: { '2026-11-28': band('insp-2026-11-28-1', '吉村 隆允'), '2026-12-01': band('insp-2026-11-28-1', '吉村 隆允') } };
  t('月またぎの続きの帯（同じ鍵）は1本として外せる',
    JSON.stringify(resBksForBooking(lres3, 'insp-2026-11-28-7', '吉村 隆允')) === JSON.stringify(['insp-2026-11-28-1']));
  t('整備（sched）の枠名がずれていても氏名で見つける',
    JSON.stringify(resBksForBooking({ 3: { x: band('sched-2026-11-20-11:00', '相原') } }, 'sched-2026-11-20-13:00', '相原')) === JSON.stringify(['sched-2026-11-20-11:00']));
}
t('キャンセル・削除は resBksForBooking を通している',
  /const _bks=resBksForBooking\(base,bk,_bkName\)/.test(SRC_PC) &&
  !/base=>resHasBk\(base,bk\)\?removeResByBk\(base,\[bk\]\):undefined,/.test(SRC_PC));
t('氏名は inspData／schedData のその行から取っている', /const _bkName=\(modalType==='insp'/.test(SRC_PC));
t('useCallback の依存に schedData を足してある（古い値を掴まない）',
  /setSchedData,schedData,persistLres/.test(SRC_PC));

console.log(NL + '結果: ' + pass + '件 合格 / ' + fail + '件 不合格');
process.exit(fail ? 1 : 0);
