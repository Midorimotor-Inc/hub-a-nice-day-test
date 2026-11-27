// 代車：スケジュールに代車があるのに代車管理に貸出が無い → 自動で貸出を作る（v3.138.0・2026-11-27 ユーザー決定）
//   ユーザーの言葉：「基準は予約カード（＝スケジュール側）。予約カードに代車をつけていて、
//   代車管理にはないという場合は、代車管理の方を直す」。
//   見るのは：
//     ① 代車管理を開いておくと、貸出が自動でできる（車検・整備・レンタカー）／カードは書き換えない
//     ② その車がふさがっていたら作らない（alert も出さない・ズレの知らせは残る・理由を出す）
//     ③ 保存した直後の予約は待つ（カード→帯の順に書く保存の途中を拾わない）
//     ④ 逆向き（帯があるのにカードが空）・帯だけ残っている分には自動で触らない
//     ⑤ サーバーにもう帯がある時は二重に作らない／サーバーのカードから代車名が消えていたら作らない
//     ⑥ 黙って直さない（何を作ったかを画面に出す・記録を残す。記録にお名前は入れない）
//     ⑦ ★納車日が無くて「いつまで貸すか」が分からない予約（整備・レンタカー）には作らない（v3.138.1）
//        ユーザーの言葉：「1日だけにしてしまうと、空いているものと勘違いされ、そこに予定を入れられる。すごくまずい」。
//        手で押した時は「1日だけになる」と先にたずねる／納車日を入れたら自動で作る
//   ★名前はすべて架空。実行: node loaner_autofix_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8548, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 320)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' } };
  st['devices/dev1'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'own', l: '端末', ua: 't', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev1');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: me.uid, name: me.name, store: me.store, email: me.email }]));
  localStorage.setItem(stor + 'auth-kind', 'own');
};
// ★日付は決め打ちにしない。来月の日を使う（どの月にも必ずある 28 日まで）。
const NX = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 1); })();
const DD = (day) => ({ y: NX.getFullYear(), m: NX.getMonth(), d: day });
const dk = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const inp = (o) => o.y + '-' + String(o.m + 1).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
const Z = DD(3), A = DD(5), A2 = DD(7), B = DD(9), C = DD(12), E = DD(16), F = DD(19), G0 = DD(22), G = DD(23), H = DD(26);
const O = DD(14), F2 = DD(21), G2 = DD(24), P = DD(27), P2 = DD(28);   // v3.138.1：納車日なし（O・P）／納車日（F2・G2・P2）
const CARS = [{ id: 1, name: 'ハスラーオフブルー', num: '8178' }, { id: 2, name: 'スペーシア', num: '4750' }, { id: 3, name: 'アルト', num: '5555' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];
const bar = (id, user, from, to, car, bk) => ({ id, user, fy: from.y, fm: from.m, fd: from.d, ty: to.y, tm: to.m, td: to.d, carName: car.name, carNum: car.num, bookingKey: bk });
const N = { dup: '二重　九郎', auto: '自動　一郎', busy: '塞ぎ　二郎', first: '先客　三郎', fresh: '直後　三子', rev: '逆向き　四郎', rent: 'レンタ　五郎', ghost: '幽霊　六郎', sched: '整備　七郎', quiet: '静か　八郎', open: '期限なし　十郎', ropen: '長期　十一郎' };

(async () => {
  const insp0 = {
    // ⑤ サーバーにはもう帯がある（画面にはまだ届いていない）＝二重に作らない。★いちばん先に見回りが当たるよう先頭に置く
    [dk(Z)]: [{ name: N.dup, carType: 'ラパン', no: '9999', time: '09:00', course: 2, store: 'honten', seq: 109, id: 109, loaner: 'ハスラーオフブルー (8178)', loanerId: 1 }],
    // ① 代車つきの車検・帯なし（納車は2日後）＝作る
    [dk(A)]: [{ name: N.auto, carType: 'スペーシア', no: '1353', time: '09:00', course: 2, store: 'honten', seq: 101, id: 101, loaner: 'ハスラーオフブルー (8178)', loanerId: 1, deliveryDate: inp(A2) }],
    // ② その車がふさがっている＝作らない
    [dk(B)]: [{ name: N.busy, carType: 'アルト', no: '2222', time: '10:00', course: 2, store: 'honten', seq: 102, id: 102, loaner: 'スペーシア (4750)', loanerId: 2 }],
    // ③ 保存した直後（id を後で「いま」にする）＝待ってから作る
    [dk(C)]: [{ name: N.fresh, carType: 'ワゴンR', no: '3333', time: '11:00', course: 2, store: 'honten', seq: 103, id: 103, loaner: 'アルト (5555)', loanerId: 3 }],
    // ④ 逆向き：帯はあるのにカードが空＝自動では触らない
    [dk(E)]: [{ name: N.rev, carType: 'ジムニー', no: '4444', time: '09:00', course: 2, store: 'honten', seq: 104, id: 104 }],
    // ① レンタカー・帯なし（納車日あり）＝作る
    [dk(F)]: [{ name: N.rent, carType: 'ソリオ', no: '5151', time: '09:00', course: 2, store: 'honten', seq: 105, id: 105, rentalLabel: '🔑 ノマド (3101)', rentalCarId: 101, deliveryDate: inp(F2) }],
    // ⑦ レンタカー・帯なし・★納車日なし＝作らない（車検でも、レンタカーはいつまで貸すか分からない）
    [dk(P)]: [{ name: N.ropen, carType: 'クロスビー', no: '7171', time: '09:00', course: 2, store: 'honten', seq: 110, id: 110, rentalLabel: '🔑 ノマド (3101)', rentalCarId: 101 }],
    // ⑤ サーバーのカードからは代車名が消えている（画面の写しが古い）＝作らない
    [dk(H)]: [{ name: N.quiet, carType: 'エブリイ', no: '6161', time: '09:00', course: 2, store: 'honten', seq: 108, id: 108, loaner: 'アルト (5555)', loanerId: 3 }],
  };
  const lres0 = {
    '1': { k4: bar(5004, N.rev, E, E, CARS[0], 'insp-' + dk(E) + '-0') },
    '2': {
      k3: bar(5003, N.first, B, B, CARS[1], ''),
      // ④ スケジュールに予約が無いのに残っている貸出＝自動では触らない
      k6: bar(5006, N.ghost, G0, G0, CARS[1], 'insp-' + dk(G0) + '-0'),
    },
  };
  const seed = {
    [STOR + 'insp']: insp0,
    // ① 整備（タイムスケジュール）・帯なし（納車日あり）＝作る
    // ⑦ 整備・帯なし・★納車日なし（鈑金でいつ返るか分からない）＝作らない
    [STOR + 'honten-sched']: {
      [dk(G)]: { '10:00': { name: N.sched, carType: 'キャリイ', work: 'Q', content: '', store: 'honten', id: 107, loaner: 'アルト (5555)', loanerId: 3, deliveryDate: inp(G2) } },
      [dk(O)]: { '11:00': { name: N.open, carType: 'ハイゼット', work: 'B', content: '鈑金', store: 'honten', id: 111, loaner: 'スペーシア (4750)', loanerId: 2 } },
    },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: lres0,
    [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
    [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [], [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
  };
  // ★待ち時間だけ短くして動かす（決まりそのものは変えない）
  const fast = s => {
    const rep = (a, b) => { if (s.indexOf(a) < 0) throw new Error('定数が見つからない：' + a); s = s.replace(a, b); };
    rep('const LOANER_AUTOFIX_SEEN  = 20000;', 'const LOANER_AUTOFIX_SEEN  = 1500;');
    rep('const LOANER_AUTOFIX_WAIT  = 180000;', 'const LOANER_AUTOFIX_WAIT  = 12000;');
    rep('const LOANER_AUTOFIX_TICK  = 5000;', 'const LOANER_AUTOFIX_TICK  = 400;');
    return s;
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fast(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;'))); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const dialogs = []; let dlgAccept = true;
  page.on('dialog', async d => { dialogs.push(d.message()); await (dlgAccept ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(1200);

  const get = k => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), k);
  const allBars = (res) => Object.keys(res || {}).reduce((a, cid) => a.concat(Object.values(res[cid] || {}).filter(Boolean).map(r => Object.assign({ _car: cid }, r))), []);
  const barsFor = (res, who) => allBars(res).filter(r => r.user === who);
  const syncBtn = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /スケジュールと(一致|ズレ)/.test(e.innerText || '') && e.offsetParent !== null); return b ? b.innerText.replace(/\s+/g, '') : null; });

  // ────────────────────────────────────────────────────────
  head('① 作りの見張り（ファイルの中身）');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const MOB = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  t('★待ち時間の定数がある（見えていた時間・保存からの時間）', /const LOANER_AUTOFIX_SEEN  = 20000;/.test(SRC) && /const LOANER_AUTOFIX_WAIT  = 180000;/.test(SRC));
  t('★自動で動くのは「貸出が無い」（type:bar）だけ', SRC.indexOf("bars=(afIssues.current||[]).filter(x=>x.type==='bar')") > 0);
  t('★自動で「直す」（カードを書き換える）・「消す」を呼ぶ道は無い', !/afCall[\s\S]{0,2000}onFixSync\(/.test(SRC.slice(SRC.indexOf('const afKey='), SRC.indexOf('const afKey=') + 3200)) && !/onDropSync\(/.test(SRC.slice(SRC.indexOf('const afKey='), SRC.indexOf('const afKey=') + 3200)));
  t('★作る前にサーバーの予約カードを読み直す（手元の写しを信じない）', /const autoMakeLoanerBand=useCallback\(async\(it0\)=>\{[\s\S]{0,240}await sGet\(/.test(SRC));
  t('★保存した直後は待つ（hubRowStamp）', SRC.indexOf('if(last&&Date.now()-last<LOANER_AUTOFIX_WAIT)return {r:\'wait\'};') > 0);
  t('★書く直前にサーバーの代車の表をもう一度見る（_stop）', SRC.indexOf('persistRres(base=>_stop(base)?undefined:putResRec(') > 0 && SRC.indexOf('persistLresOf(store,base=>_stop(base)?undefined:putResRec(') > 0);
  t('★自動の時は alert を出さない', SRC.indexOf('if(auto){ _o.alert=false;') > 0 && SRC.indexOf("if(!auto)alert('⚠ 貸出を作れません'") > 0);
  t('★代車を選ぶ途中（pickMode）では動かさない', /useEffect\(\(\)=>\{\s*if\(pickMode\)return;\s*let dead=false;/.test(SRC));
  t('★手で押す「貸出を作る」は残してある', SRC.indexOf('data-syncmake') > 0);
  t('★スマホは知らせるだけ（PC で作られると案内する）', MOB.indexOf('data-autofixpc') > 0 && MOB.indexOf('makeLoanerBand') < 0);
  t('★納車日が無い整備・レンタカーは「期間が分からない」と見分ける', SRC.indexOf("const loanerSpanUnknown=(rowKind,kind,del)=>!_normDkStr(del)&&(rowKind==='sched'||kind==='rental');") > 0);
  t('★自動の時は、期間が分からなければ作らない（見回り・サーバーの読み直し・書く所の3か所）',
    SRC.indexOf('if(loanerSpanUnknown(x.rowKind,x.kind,x.del))return false;') > 0
    && SRC.indexOf("if(loanerSpanUnknown(it.rowKind,it.kind,row.deliveryDate))return {r:'noend'};") > 0
    && SRC.indexOf("if(auto)return 'noend';") > 0);
  t('★スマホにも「納車日が無いので自動では作られない」と出す', MOB.indexOf('data-autofixnoend') > 0);

  // ────────────────────────────────────────────────────────
  head('② 下ごしらえ：直後の予約の時刻を「いま」にする／サーバーだけを変える');
  // ③ 用：直後　三子 の id を「いま」にする（画面にも届ける）
  await page.evaluate(([k, d, who]) => {
    const v = JSON.parse(JSON.stringify(window.__fakeFb.get(k) || {}));
    (v[d] || []).forEach(r => { if (r && r.name === who) r.id = Date.now(); });
    window.__fakeFb.set(k, v);
  }, [STOR + 'insp', dk(C), N.fresh]);
  await page.waitForTimeout(900);
  // ⑤ 用：サーバーだけ変える（画面には知らせない）
  //    ・静か　八郎 のカードから代車名を消す　・二重　九郎 の帯をサーバーにだけ置く
  await page.evaluate(([ki, dH, wq, kl, rec]) => {
    const v = JSON.parse(JSON.stringify(window.__fakeFb.get(ki) || {}));
    (v[dH] || []).forEach(r => { if (r && r.name === wq) { delete r.loaner; delete r.loanerId; } });
    window.__fakeFb.setQuiet(ki, v);
    const l = JSON.parse(JSON.stringify(window.__fakeFb.get(kl) || {}));
    l['1'] = Object.assign({}, l['1'] || {}, { kq: rec });
    window.__fakeFb.setQuiet(kl, l);
  }, [STOR + 'insp', dk(H), N.quiet, STOR + 'honten-lres', bar(7001, N.dup, Z, Z, CARS[0], 'insp-' + dk(Z) + '-0')]);
  t('サーバーの 二重 の帯は1本（画面には無い）', barsFor(await get(STOR + 'honten-lres'), N.dup).length === 1);

  // ────────────────────────────────────────────────────────
  head('③ 代車管理を開く → 開いた直後はズレが出ている');
  await clickText(page, '代車管理');
  await page.waitForTimeout(700);
  const s0 = await syncBtn();
  t('開いた直後は「ズレ」が出る（まだ触っていない）', /ズレ\d+件/.test(s0 || ''), s0);
  t('開いた直後はまだ貸出を作っていない', barsFor(await get(STOR + 'honten-lres'), N.auto).length === 0);

  // ────────────────────────────────────────────────────────
  head('④ しばらく待つ → 貸出が自動でできる（保存の直後の分はまだ）');
  await page.waitForTimeout(6000);
  let L = await get(STOR + 'honten-lres'), R = await get(STOR + 'rres'), I = await get(STOR + 'insp');
  const mA = barsFor(L, N.auto);
  t('★車検：貸出ができた（1本だけ）', mA.length === 1, mA);
  t('★正しい車・正しい紐付け', mA.length === 1 && mA[0]._car === '1' && mA[0].carNum === '8178' && mA[0].bookingKey === 'insp-' + dk(A) + '-0', mA[0]);
  t('★期間はスケジュールどおり（入庫日〜納車日）', mA.length === 1 && mA[0].fd === A.d && mA[0].td === A2.d && mA[0].fm === A.m, mA[0]);
  const mS = barsFor(L, N.sched);
  t('★整備：貸出ができた（紐付けは枠の名前）', mS.length === 1 && mS[0]._car === '3' && mS[0].bookingKey === 'sched-' + dk(G) + '-10:00' && mS[0].fd === G.d, mS);
  t('★整備：期間は納車日まで', mS.length === 1 && mS[0].fd === G.d && mS[0].td === G2.d, mS);
  const mR = barsFor(R, N.rent);
  t('★レンタカー：貸出ができた（レンタカーの表に）', mR.length === 1 && mR[0]._car === '101' && mR[0].bookingKey === 'insp-' + dk(F) + '-0', mR);
  t('★レンタカー：期間は納車日まで', mR.length === 1 && mR[0].fd === F.d && mR[0].td === F2.d, mR);
  t('★★納車日の無い整備には作らない（1日だけの帯を作らない）', barsFor(L, N.open).length === 0, barsFor(L, N.open));
  t('★★納車日の無いレンタカーには作らない', barsFor(R, N.ropen).length === 0, barsFor(R, N.ropen));
  t('★予約カードは書き換えていない', ((I[dk(A)] || [])[0] || {}).loaner === 'ハスラーオフブルー (8178)' && ((I[dk(F)] || [])[0] || {}).rentalLabel === '🔑 ノマド (3101)');
  t('★ふさがっている車には作らない', barsFor(L, N.busy).length === 0, barsFor(L, N.busy));
  t('★先客の貸出はそのまま', barsFor(L, N.first).length === 1 && barsFor(L, N.first)[0].id === 5003);
  t('★保存した直後の予約は、まだ作らない', barsFor(L, N.fresh).length === 0, barsFor(L, N.fresh));
  t('★alert は1つも出していない', dialogs.length === 0, dialogs);

  // ────────────────────────────────────────────────────────
  head('⑤ 逆向き・片方だけ残った分・サーバーと食い違う分には触らない');
  t('★逆向き：カードは空のまま（自動で入れない）', !((I[dk(E)] || [])[0] || {}).loaner, (I[dk(E)] || [])[0]);
  t('★逆向き：帯も消さない', barsFor(L, N.rev).length === 1 && barsFor(L, N.rev)[0].id === 5004);
  t('★予約の無い貸出も消さない', barsFor(L, N.ghost).length === 1 && barsFor(L, N.ghost)[0].id === 5006);
  t('★サーバーにもう帯がある予約には二重に作らない', barsFor(L, N.dup).length === 1 && barsFor(L, N.dup)[0].id === 7001, barsFor(L, N.dup));
  t('★サーバーのカードから代車名が消えていたら作らない', barsFor(L, N.quiet).length === 0, barsFor(L, N.quiet));

  // ────────────────────────────────────────────────────────
  head('⑥ 黙って直さない：何を作ったかを画面に出す／記録を残す');
  const log1 = await page.evaluate(() => { const e = document.querySelector('[data-autofixlog]'); return e ? { txt: e.innerText, rows: e.querySelectorAll('[data-autofixrow]').length } : null; });
  t('★知らせの帯が出る', !!log1 && /自動で作りました/.test(log1.txt), log1);
  t('★作った3件が並ぶ（お名前に様・車名つき）', !!log1 && log1.rows === 3 && log1.txt.indexOf(N.auto + ' 様') >= 0 && /ハスラーオフブルー \(8178\)/.test(log1.txt) && /ノマド/.test(log1.txt), log1);

  // ────────────────────────────────────────────────────────
  head('⑦ さらに待つ → 保存の直後だった予約にも貸出ができる');
  await page.waitForTimeout(13000);
  L = await get(STOR + 'honten-lres'); R = await get(STOR + 'rres');
  const mF = barsFor(L, N.fresh);
  t('★待ったあとで貸出ができた（1本だけ）', mF.length === 1 && mF[0]._car === '3' && mF[0].fd === C.d, mF);
  t('★何度見回っても二重に作らない', barsFor(L, N.auto).length === 1 && barsFor(L, N.sched).length === 1 && barsFor(R, N.rent).length === 1 && barsFor(L, N.dup).length === 1);
  t('★ふさがっている車・食い違う分は、待っても作らない', barsFor(L, N.busy).length === 0 && barsFor(L, N.quiet).length === 0);
  t('★★納車日の無い整備・レンタカーは、待っても作らない', barsFor(L, N.open).length === 0 && barsFor(R, N.ropen).length === 0);
  const diag = await get(STOR + 'diag-loanerfix');
  t('★記録が残る（作った4件）', Array.isArray(diag) && diag.length === 4 && diag.every(d => d.bk && d.car && d.ver), diag);
  t('★記録にお名前は入れない', Array.isArray(diag) && !Object.values(N).some(n => JSON.stringify(diag).indexOf(n) >= 0));
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2, fullPage: false });   // 知らせの帯が出ている所

  // ────────────────────────────────────────────────────────
  head('⑧ 残ったズレは今までどおり知らせる（理由つき）');
  const s1 = await syncBtn();
  t('ズレの件数が減っている', /ズレ\d+件/.test(s1 || '') && Number((s1.match(/ズレ(\d+)件/) || [])[1]) < Number((s0.match(/ズレ(\d+)件/) || [])[1]), [s0, s1]);
  await clickText(page, 'スケジュールとズレ'); await page.waitForTimeout(800);
  const list = await page.evaluate(() => { const e = document.querySelector('[data-synclist]'); return e ? { txt: e.innerText, no: [...e.querySelectorAll('[data-autofixno]')].map(x => x.innerText), noend: [...e.querySelectorAll('[data-autofixnoend]')].map(x => x.innerText), make: e.querySelectorAll('[data-syncmake]').length } : null; });
  t('★★納車日が無い2件は一覧に残り、理由（納車日が入っていない）を出す', !!list && list.noend.length === 2 && list.noend.every(x => /納車日が入っていない/.test(x) && /納車日を入れると、自動で作ります/.test(x)) && list.txt.indexOf(N.open) >= 0 && list.txt.indexOf(N.ropen) >= 0, list && list.noend);
  t('★作れなかった理由を出す（ふさがっている）', !!list && list.no.some(x => /ふさがっています/.test(x)), list && list.no);
  t('★作った人は一覧から消えている', !!list && list.txt.indexOf(N.auto) < 0 && list.txt.indexOf(N.rent) < 0 && list.txt.indexOf(N.sched) < 0 && list.txt.indexOf(N.fresh) < 0, list && list.txt.slice(0, 200));
  t('★逆向き・予約の無い貸出は、今までどおり一覧に出る', !!list && list.txt.indexOf(N.rev) >= 0 && list.txt.indexOf(N.ghost) >= 0);
  t('★手で押す「貸出を作る」も残っている', !!list && list.make >= 1, list && list.make);
  t('alert は最後まで1つも出していない', dialogs.length === 0, dialogs);
  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

  // ────────────────────────────────────────────────────────
  head('⑨ 納車日が無い予約：手で押した時は「1日だけになる」と先にたずねる');
  const pressMake = who => page.evaluate(w => {
    const b = [...document.querySelectorAll('[data-synclist] [data-syncmake]')].find(x => { let p = x; for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (p && (p.innerText || '').indexOf(w) >= 0 && p.querySelectorAll('[data-syncmake]').length === 1) return true; } return false; });
    if (b) { b.click(); return true; } return false;
  }, who);
  dlgAccept = false;
  t('「貸出を作る」を押せた', await pressMake(N.open));
  await page.waitForTimeout(900);
  t('★たずねる（1日だけの貸出になる・翌日から空いて見える）', dialogs.length === 1 && /1日だけの貸出になります/.test(dialogs[0]) && /空いている車に見えて/.test(dialogs[0]) && /右端を引いて/.test(dialogs[0]), dialogs);
  t('★「いいえ」なら作らない', barsFor(await get(STOR + 'honten-lres'), N.open).length === 0);
  dlgAccept = true;
  await pressMake(N.open);
  await page.waitForTimeout(1500);
  const mO = barsFor(await get(STOR + 'honten-lres'), N.open);
  t('★「はい」なら作る（人が選んだ時だけ・1日）', dialogs.length === 2 && mO.length === 1 && mO[0]._car === '2' && mO[0].fd === O.d && mO[0].td === O.d, mO);

  // ────────────────────────────────────────────────────────
  head('⑩ 予約カードに納車日を入れると、自動で作る（その日まで）');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '閉じる' && e.offsetParent !== null); if (b) b.click(); });
  await page.evaluate(([k, d, who, del]) => {
    const v = JSON.parse(JSON.stringify(window.__fakeFb.get(k) || {}));
    (v[d] || []).forEach(r => { if (r && r.name === who) r.deliveryDate = del; });
    window.__fakeFb.set(k, v);
  }, [STOR + 'insp', dk(P), N.ropen, inp(P2)]);
  await page.waitForTimeout(6000);
  const mP = barsFor(await get(STOR + 'rres'), N.ropen);
  t('★納車日を入れたら貸出ができた（入庫日〜納車日）', mP.length === 1 && mP[0]._car === '101' && mP[0].fd === P.d && mP[0].td === P2.d, mP);
  t('この間に alert・確認は増えていない', dialogs.length === 2, dialogs);
  t('画面のエラーは最後まで出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
