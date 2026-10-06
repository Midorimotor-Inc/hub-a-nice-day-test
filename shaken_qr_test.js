// スマホの「🛠 機能」→ 車検証のQR読み取り → 車両管理へ登録 の検査（2026-10-05 ユーザー依頼）
//   ① 読み解く部分（純関数）を mobile.html から取り出して動かす
//   ② 画面：機能ボタン → メニュー → 読み取り画面（撮る／写真から選ぶ）
//   ③ 手で入れて登録 → vehicles-v2 に正しい形で入るか／足りない欄は断るか
//   ④ PC：登録した車が一覧に出て、📄 から車検証の写真を開けるか
//   実行: node shaken_qr_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8297, STOR = 'hub-v8-dev-';
const SRC_M = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
const SRC_PC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const NL = String.fromCharCode(10);

// ソースから「const 名前 = …;」を1つ取り出す（中かっこの対応を数えて終わりを見つける）
const grab = (name, src) => {
  const S = src || SRC_M;
  const m = S.indexOf(NL + 'const ' + name);
  if (m < 0) throw new Error(name + ' が見つかりません');
  let i = m + 1, depth = 0, sawEq = false;
  for (; i < S.length; i++) {
    const c = S[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === '=' && depth === 0) sawEq = true;
    else if (c === ';' && depth === 0 && sawEq) return S.slice(m + 1, i + 1);   // = のあとの「深さ0の ;」で終わり
  }
  throw new Error(name + ' の終わりが分かりません');
};

// ════════ ① 読み解く部分（純関数） ════════
head('① 車検証の2次元コードを読み解く');
const names = ['SHK_ERA', 'shkIso', 'SHK_HK', 'SHK_ZK', 'shkNorm', 'shkDate', 'SHK_MAKERS', 'SHK_PLATE_RE', 'shkPlate', 'shkVin', 'shkModel', 'shkClass', 'shkJoinPlate', 'OCR_LABELS', 'ocrFixVin', 'shakenOcrParse', 'shakenParse', 'vehPlate4', 'vehAddMonths', 'vehBase'];
const sandbox = {};
new Function('exports', names.map(n => grab(n)).join(NL) + NL +
  names.map(n => 'exports.' + n + '=' + n + ';').join('')) (sandbox);
const { shkDate, shakenParse, vehPlate4, vehBase } = sandbox;

t('和暦（文字）を西暦にできる', shkDate('令和7年9月16日') === '2025-09-16', shkDate('令和7年9月16日'));
t('和暦（年月だけ）も読める', shkDate('令和7年9月') === '2025-09', shkDate('令和7年9月'));
t('平成も読める', shkDate('平成30年3月1日') === '2018-03-01', shkDate('平成30年3月1日'));
t('元号コード付き7桁（5=令和）を読める', shkDate('5070916') === '2025-09-16', shkDate('5070916'));
t('元号コード付き5桁は年月になる', shkDate('50709') === '2025-09', shkDate('50709'));
t('西暦8桁も読める', shkDate('20250916') === '2025-09-16', shkDate('20250916'));
t('日付でない文字は空を返す', shkDate('MK53S-123456') === '' && shkDate('') === '', [shkDate('MK53S-123456')]);
t('ありえない月は日付にしない', shkDate('5079916') === '', shkDate('5079916'));

// 様式どおりに並んだ3つのコード
const QR = [
  '1/神戸58Aか3503/2/MK53S-123456/R06A',
  '2/18014/0001',
  '3/5100916/50709/1/乗用/自家用/箱型/スズキ/5AA-MK53S/4',
];
const p = shakenParse(QR);
t('ナンバーを拾える', p.plate === '神戸58Aか3503', p.plate);
t('車台番号を拾える', p.vin === 'MK53S-123456', p.vin);
t('車検満了日を拾える', p.expiry === '2028-09-16', p.expiry);
t('初度登録（年月）を拾える', p.firstReg === '2025-09', p.firstReg);
t('メーカーを拾える', p.maker === 'スズキ', p.maker);
t('型式を拾える', p.model === '5AA-MK53S', p.model);
t('分類番号5ナンバーなので4ナンバー貨物にしない', p.cargo4 === false, [p.classNo, p.cargo4]);
t('読み取った項目を全部ならべて持っている', p.fields.length >= 12, p.fields.length);

// 並びが様式どおりでない時でも、形から拾えるか
const p2 = shakenParse(['神戸48Aか1234/MK53S-999999/5AA-MK53S/スズキ/5100916/50709']);
t('並びが違っても ナンバー・車台番号・型式・メーカーを形から拾える',
  p2.plate === '神戸48Aか1234' && p2.vin === 'MK53S-999999' && p2.model === '5AA-MK53S' && p2.maker === 'スズキ',
  [p2.plate, p2.vin, p2.model, p2.maker]);
t('並びが違っても 満了日と初度登録を拾える', p2.expiry === '2028-09-16' && p2.firstReg === '2025-09', [p2.expiry, p2.firstReg]);
t('分類番号が4なら4ナンバー貨物になる', p2.cargo4 === true, [p2.classNo, p2.cargo4]);

const p3 = shakenParse([]);
t('何も読めなくても落ちない（空の結果を返す）', p3 && p3.plate === '' && p3.fields.length === 0 && Array.isArray(p3.raw), p3 && p3.fields.length);
t('満了日が年月までしか無い時は空にする（日まで要るため）', shakenParse(['3/50709//']).expiry === '', shakenParse(['3/50709//']).expiry);

t('ナンバー下4桁を取り出せる', vehPlate4('神戸58Aか3503') === '3503', vehPlate4('神戸58Aか3503'));
t('登録日が空でも車検満了日から逆算できる（乗用新車＝−3年）',
  vehBase({ expiry: '2028-09-16', firstReg: '2025-09' }) === '2025-09-16', vehBase({ expiry: '2028-09-16', firstReg: '2025-09' }));
t('4ナンバー貨物は−2年で逆算する',
  vehBase({ expiry: '2028-09-16', firstReg: '2026-09', cargo4: true }) === '2026-09-16', vehBase({ expiry: '2028-09-16', firstReg: '2026-09', cargo4: true }));

head('①-2 並びや文字づかいが違っても拾えるか（2026-10-05 の報告への直し）');
const { shkNorm, shkJoinPlate } = sandbox;
t('半角カナを全角にそろえる（ｽｽﾞｷ→スズキ）', shkNorm('ｽｽﾞｷ') === 'スズキ', shkNorm('ｽｽﾞｷ'));
t('半濁点つきも直せる（ﾊﾟｰﾙ→パール）', shkNorm('ﾊﾟ') === 'パ', shkNorm('ﾊﾟ'));
t('全角の数字・英字を半角にそろえる', shkNorm('５８Ａ') === '58A', shkNorm('５８Ａ'));
t('全角の空白をつめる', shkNorm('神戸\u300058') === '神戸 58', JSON.stringify(shkNorm('神戸\u300058')));

// 半角カナ＋全角数字で入っていた場合
const h = shakenParse(['1/神戸５８Ａか３５０３/2/MK53S-123456/R06A', '3/5100916/50709/1/乗用/自家用/箱型/ｽｽﾞｷ/5AA-MK53S/4']);
t('全角数字のナンバーでも拾える', h.plate === '神戸58Aか3503', h.plate);
t('半角カナのメーカーでも拾える', h.maker === 'スズキ', h.maker);

// 区切りが「/」でなく「,」の場合
const c = shakenParse(['1,神戸58Aか3503,2,MK53S-123456,R06A']);
t('区切りがカンマでも項目に分けられる', c.plate === '神戸58Aか3503' && c.vin === 'MK53S-123456', [c.plate, c.vin]);

// 区切りが無く、1本の長い文字列の場合（全文から探す）
const n = shakenParse(['神戸58Aか3503 MK53S-123456 5AA-MK53S スズキ 令和7年9月 令和10年9月16日']);
t('区切りが無くても全文からナンバーを拾える', n.plate === '神戸58Aか3503', n.plate);
t('区切りが無くても車台番号・型式・メーカーを拾える',
  n.vin === 'MK53S-123456' && n.model === '5AA-MK53S' && n.maker === 'スズキ', [n.vin, n.model, n.maker]);
t('区切りが無くても満了日と初度登録を拾える', n.expiry === '2028-09-16' && n.firstReg === '2025-09', [n.expiry, n.firstReg]);

// ナンバーが「地名／分類番号／かな／一連番号」に分かれている場合
t('分かれたナンバーをつなげる', shkJoinPlate(['神戸', '58A', 'か', '3503']) === '神戸58Aか3503', shkJoinPlate(['神戸', '58A', 'か', '3503']));
const sp = shakenParse(['1/神戸/58A/か/3503/MK53S-123456']);
t('分かれて入っていてもナンバーになる', sp.plate === '神戸58Aか3503', sp.plate);

// 元号の頭文字つきの日付
t('R07.09.16 を読める', sandbox.shkDate('R07.09.16') === '2025-09-16', sandbox.shkDate('R07.09.16'));
t('R0709（年月）を読める', sandbox.shkDate('R07.09') === '2025-09', sandbox.shkDate('R07.09'));
t('H30-3-1 を読める', sandbox.shkDate('H30-3-1') === '2018-03-01', sandbox.shkDate('H30-3-1'));

t('まったく関係ない文字列からは何も拾わない', (() => {
  const x = shakenParse(['https://example.com/abc']);
  return x.plate === '' && x.vin === '' && x.expiry === '' && x.maker === '';
})(), shakenParse(['https://example.com/abc']));

head('①-3 自動車検査証記録事項を「文字」から読む（OCR）');
const { shakenOcrParse, ocrFixVin } = sandbox;
// 写真から読んだ文字（よくある並び）。項目名のうしろに値が来る
const REC = [
  '自動車検査証記録事項',
  '自動車登録番号又は車両番号  神戸 580 あ 3503',
  '登録年月日/交付年月日  令和 7年 9月16日',
  '初度登録年月  令和 7年 9月',
  '自動車の種別  普通      用途  乗用',
  '車名  スズキ',
  '型式  5AA-MK53S',
  '車台番号  MK53S-123456',
  '原動機の型式  R06A',
  '型式指定番号  18014      類別区分番号  0001',
  '有効期間の満了する日  令和10年 9月16日',
].join(NL);
const r = shakenOcrParse(REC);
t('ナンバーを読める', r.plate === '神戸580あ3503', r.plate);
t('初度登録年月を読める', r.firstReg === '2025-09', r.firstReg);
t('有効期間の満了する日を読める', r.expiry === '2028-09-16', r.expiry);
t('車台番号を読める', r.vin === 'MK53S-123456', r.vin);
t('メーカー（車名）を読める', r.maker === 'スズキ', r.maker);
t('型式を読める（型式指定番号と取り違えない）', r.model === '5AA-MK53S', r.model);
t('文字から読んだ印が付く', r.via === 'ocr', r.via);

// 項目名の次の行に値が来る形（表組みの写真でよくある）
const REC2 = ['車台番号', 'MK53S-654321', '有効期間の満了する日', '令和10年3月1日', '初度検査年月', '令和4年3月'].join(NL);
const r2 = shakenOcrParse(REC2);
t('値が次の行にあっても読める（車台番号）', r2.vin === 'MK53S-654321', r2.vin);
t('値が次の行にあっても読める（満了日）', r2.expiry === '2028-03-01', r2.expiry);
t('「初度検査年月」（軽自動車の言い方）も読める', r2.firstReg === '2022-03', r2.firstReg);

// まぎらわしい字の直し（車台番号の「−」より後ろは数字だけ）
t('車台番号のうしろの O を 0 に直す', ocrFixVin('MK53S-1234O6') === 'MK53S-123406', ocrFixVin('MK53S-1234O6'));
t('車台番号のうしろの S・I・B も数字に直す', ocrFixVin('ZVW30-S1IB00') === 'ZVW30-511800', ocrFixVin('ZVW30-S1IB00'));
t('車台番号の前半（型式の部分）は直さない', ocrFixVin('S321V-0012345') === 'S321V-0012345', ocrFixVin('S321V-0012345'));
t('全角のハイフンでも直せる', ocrFixVin('MK53S−123456') === 'MK53S-123456', ocrFixVin('MK53S−123456'));

// 項目名が読めなかった時は、全文から形で探す
const r3 = shakenOcrParse('神戸580あ3503 MK53S-123456 令和7年9月 令和10年9月16日 スズキ');
t('項目名が読めなくても形から拾う',
  r3.plate === '神戸580あ3503' && r3.vin === 'MK53S-123456' && r3.expiry === '2028-09-16' && r3.firstReg === '2025-09',
  [r3.plate, r3.vin, r3.expiry, r3.firstReg]);

t('読めなかった時も落ちない', (() => { const x = shakenOcrParse(''); return x && x.plate === '' && x.via === 'ocr'; })());
t('4ナンバー貨物は分類番号から分かる', shakenOcrParse('自動車登録番号又は車両番号  神戸 480 あ 1234').cargo4 === true,
  shakenOcrParse('自動車登録番号又は車両番号  神戸 480 あ 1234').cargo4);

// ════════ ソースの決まりごと ════════
head('② 作りの決まり');
// ★cdnjs には jsQR が無い（404）。jsdelivr を先に、控えを unpkg に（2026-10-05 に実際に確認）
t('jsQR は CDN から読み込む（iPhone 用）', SRC_M.indexOf('jsdelivr.net/npm/jsqr@') > 0 && SRC_M.indexOf('unpkg.com/jsqr@') > 0 && SRC_M.indexOf('cdnjs.cloudflare.com/ajax/libs/jsQR') < 0);
t('読めたQRを捨てない（data が空でも binaryData から拾う）', SRC_M.indexOf('data が空でも binaryData から拾う') > 0);
t('見つけた所を白く塗って同じ1枚から何個でも拾う', SRC_M.indexOf('見つけた所を消して、次を探す') > 0);
t('Android は端末の BarcodeDetector を先に使う', SRC_M.indexOf('BarcodeDetector') > 0);
t('車検証の写真は Firestore に分割して入れる', SRC_M.indexOf("vehdoc-") > 0 && SRC_M.indexOf('VEHDOC_CHUNK') > 0);
t('1ドキュメントの文字数は 1MB より小さい', /VEHDOC_CHUNK\s*=\s*(\d+)/.test(SRC_M) && Number(SRC_M.match(/VEHDOC_CHUNK\s*=\s*(\d+)/)[1]) < 900000,
  (SRC_M.match(/VEHDOC_CHUNK\s*=\s*(\d+)/) || [])[1]);
t('PC は分割された写真を繋ぎ直して開ける', SRC_PC.indexOf('vehDocLoad') > 0 && SRC_PC.indexOf('VehDocModal') > 0);
t('PC の「次の段階で入れます」の断り書きは消えている', SRC_PC.indexOf('読み込みは次の段階で入れます') < 0);
t('入力欄は16px以上（iPhoneの自動拡大よけ）',
  !/ShakenScanSheet[\s\S]{0,20000}?fontSize:1[0-5][,.}]/.test(SRC_M.slice(SRC_M.indexOf('const INP={width:\'100%\',padding:\'10px 11px\''), SRC_M.indexOf('const INP={width:\'100%\',padding:\'10px 11px\'') + 200)) &&
  SRC_M.indexOf("const INP={width:'100%',padding:'10px 11px',border:'1.5px solid #d1d5db',borderRadius:10,fontSize:16") > 0);
t('文字読み取りは端末の中だけで動く（外へ送らない）', SRC_M.indexOf('tesseract.js') > 0 && SRC_M.indexOf('端末の中だけで動く') > 0);
t('文字読み取りは必要な時だけ読み込む（毎回取らない）', SRC_M.indexOf('const ocrLoad=') > 0 && SRC_M.indexOf('_tessP') > 0);
// ★読み取りは PDF だけ（2026-10-06 ユーザー指示）。
//   文字が入っていない PDF のときだけ、中で QR → 文字読み取り の順に試す
t('文字が入っていないPDFは QR → 文字読み取り に進む',
  SRC_M.indexOf('文字が入っていないPDFのようです') > 0 && SRC_M.indexOf('PDFのすみずみからQRを探しています') > 0);
t('文字から読んだ時は写真を並べて見比べさせる', SRC_M.indexOf('かならず写真と見比べてください') > 0);
t('進み具合（％）を出す', SRC_M.indexOf('prog+') > 0);
t('読めなかった時も結果の画面に進み、理由を赤帯で出す', SRC_M.indexOf('QRを読み取れませんでした。') > 0 && SRC_M.indexOf('欄に入れられなかった項目があります') > 0);
t('足りない時は中身をコピーできる', SRC_M.indexOf('📋 中身をコピー') > 0 && SRC_M.indexOf('navigator.clipboard.writeText') > 0);
t('読み取れたQRの全文をそのまま見せる', SRC_M.indexOf('】全文') > 0);
t('文字をそろえてから見分ける（半角カナ・全角数字）', SRC_M.indexOf('const shkNorm=') > 0);
t('3ファイルのバージョンが揃っている', (() => {
  const a = (SRC_PC.match(/const APP_VERSION = '([\d.]+)'/) || [])[1];
  const b = (fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8').match(/const APP_VERSION='([\d.]+)'/) || [])[1];
  const c = (SRC_M.match(/const MOBILE_VERSION='([\d.]+)'/) || [])[1];
  return a && a === b && b === c;
})(), [(SRC_PC.match(/const APP_VERSION = '([\d.]+)'/) || [])[1], (SRC_M.match(/const MOBILE_VERSION='([\d.]+)'/) || [])[1]]);

// ════════ 画面 ════════
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
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const fillLabeled = (page, label, value) => page.evaluate(([lb, v]) => {
  const d = [...document.querySelectorAll('div')].find(e => e.innerText.trim() === lb && e.children.length === 0);
  if (!d) return false;
  let el = d.nextElementSibling;
  if (el && el.tagName !== 'INPUT') el = el.querySelector('input');
  if (!el || el.tagName !== 'INPUT') return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, [label, value]);

(async () => {
  const seed = {
    [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'vehicles-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const routeFake = ctx => {
    ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    ctx.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.jsQR=function(){return null;};' }));
  };

  // ──────── スマホ ────────
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  routeFake(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  await page.waitForTimeout(800);

  head('③ スマホ：入口と読み取り画面');
  t('店舗の帯に「🛠 機能」ボタンが出る', await seeText(page, '機能', 8000));
  // 店舗ボタンより右にあること（帯の右端）
  const pos = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '🛠 機能' && e.offsetParent !== null);
    const st = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('三田店') >= 0 && e.offsetParent !== null);
    if (!btn || !st) return null;
    const a = btn.getBoundingClientRect(), b = st.getBoundingClientRect();
    return { btnL: Math.round(a.left), stR: Math.round(b.right), gap: Math.round(a.left - b.right), w: window.innerWidth, btnR: Math.round(a.right) };
  });
  t('店舗の並びから離れた右端にある', !!pos && pos.gap > 40 && pos.btnR > pos.w - 30, pos);

  await clickText(page, '🛠 機能');
  await page.waitForTimeout(400);
  t('メニューが出る（車検証を読み取る）', await seeText(page, '車検証を読み取る', 5000));
  // ★『今後の予定』は薄くでも出さない（2026-10-05 ユーザー指示）。決まったものだけを並べる
  t('まだ決まっていない機能は出さない', await page.evaluate(() => {
    const txt = document.body.innerText;
    return !/見積書|タイヤの入れ替え|置き場所|（今後）/.test(txt);
  }), await page.evaluate(() => (document.body.innerText.match(/見積書|タイヤの入れ替え|置き場所|（今後）/g) || [])));
  t('メニューに並ぶのは車検証の読み取りだけ', await page.evaluate(() => {
    const sheet = [...document.querySelectorAll('div')].find(e => e.innerText.indexOf('🛠 機能') === 0 && e.offsetParent !== null);
    if (!sheet) return false;
    return [...sheet.querySelectorAll('button')].filter(b => b.innerText.trim() && b.innerText.indexOf('✕') < 0).length === 1;
  }));

  await clickText(page, '車検証を読み取る');
  await page.waitForTimeout(400);
  t('読み取りの入口は「PDFから読み取る」だけ', await seeText(page, 'PDFから読み取る', 5000));
  t('カメラ・写真からの読み取りは出さない', await page.evaluate(() => {
    const txt = document.body.innerText;
    return txt.indexOf('その場で撮る') < 0 && txt.indexOf('写真から選ぶ') < 0 && txt.indexOf('文字から読み取る') < 0;
  }), await page.evaluate(() => (document.body.innerText.match(/その場で撮る|写真から選ぶ|文字から読み取る/g) || [])));
  t('手で入れる道は残っている', await seeText(page, '読み取らずに手で入れる', 3000));
  t('車種名は車検証に無いことを先に知らせている', await seeText(page, '車種名とグレードは車検証に載っていない', 3000));
  t('ファイルの入口はPDF用の1つだけ（カメラ起動の入口は無い）',
    await page.evaluate(() => {
      const f = [...document.querySelectorAll('input[type=file]')];
      return f.length === 1 && (f[0].getAttribute('accept') || '') === 'application/pdf' && !f[0].hasAttribute('capture');
    }), await page.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(x => x.getAttribute('accept') + '|' + (x.hasAttribute('capture') ? 'cam' : '-'))));

  head('④ スマホ：手で入れて車両管理に登録する');
  await clickText(page, '読み取らずに手で入れる');
  await page.waitForTimeout(400);
  t('登録の画面になる', await seeText(page, '車両管理に登録', 5000));

  // 足りないまま登録を押すと断られる
  await clickText(page, '車両管理に登録');
  await page.waitForTimeout(400);
  t('足りない欄があると赤帯で断る（登録しない）', await seeText(page, '入れてください', 4000));
  t('断られた時点ではまだ1台も入っていない',
    await page.evaluate(k => { const v = window.__fakeFb.get(k); return !v || v.length === 0; }, STOR + 'vehicles-v2'));

  await fillLabeled(page, '車名（グレード・色まで）*', 'スペーシア X パール');
  await fillLabeled(page, 'ナンバー（FULL）*', '神戸58Aか3503');
  await fillLabeled(page, '初度登録*', '2025-09');
  await fillLabeled(page, '車検満了日*', '2028-09-16');
  await fillLabeled(page, 'メーカー', 'スズキ');
  await page.evaluate(() => {   // ボディ色（パール/白）を選ぶ
    const b = [...document.querySelectorAll('button[title]')].find(e => e.title === 'パール/白');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await clickText(page, '車両管理に登録');
  t('登録できたと知らせる', await seeText(page, '車両管理に登録しました', 12000));

  const rec = await page.evaluate(k => { const v = window.__fakeFb.get(k); return Array.isArray(v) ? v[v.length - 1] : null; }, STOR + 'vehicles-v2');
  t('vehicles-v2 に1台入った', !!rec, rec);
  t('車名・ナンバーがそのまま入る', rec && rec.name === 'スペーシア X パール' && rec.num === '神戸58Aか3503', rec && [rec.name, rec.num]);
  t('ナンバー下4桁（代車管理との照合用）が入る', rec && rec.plate4 === '3503', rec && rec.plate4);
  t('登録日は車検満了日から逆算して入る', rec && rec.regDate === '2025-09-16', rec && rec.regDate);
  t('見ている店舗が初期値になる', rec && rec.store === 'honten', rec && rec.store);
  t('点検の入れ物は PC と同じ形', rec && rec.inspections && rec.inspections.m1 && Array.isArray(rec.inspections.m12), rec && rec.inspections);
  t('取り込み時のタイヤは夏', rec && rec.tire === 'summer', rec && rec.tire);
  t('目的＝代車なら group は factory', rec && rec.purpose === 'loaner' && rec.group === 'factory', rec && [rec.purpose, rec.group]);
  t('スマホから入れた印が残る', rec && rec.addedFrom === 'mobile-qr' && rec.addedBy === '江川京志', rec && [rec.addedFrom, rec.addedBy]);
  t('スズキなので1か月・6か月・12か月の対象になる', rec && /スズキ/.test(rec.maker || ''), rec && rec.maker);

  // 写真を付けた時に分割保存されるか（カメラは使えないので、保存の部品だけを直に動かす）
  const docOk = await page.evaluate(async (stor) => {
    const dummy = 'data:image/jpeg;base64,' + 'A'.repeat(900000);   // 2つに割れる長さ
    const r = await window.__hubVehDocSave('testdoc', dummy);
    const idx = window.__fakeFb.get(stor + 'vehdoc-testdoc-index');
    const c0 = window.__fakeFb.get(stor + 'vehdoc-testdoc-chunk-0');
    const c1 = window.__fakeFb.get(stor + 'vehdoc-testdoc-chunk-1');
    return { chunks: r && r.chunks, idx, len0: (c0 || '').length, len1: (c1 || '').length, joined: ((c0 || '') + (c1 || '')) === dummy };
  }, STOR).catch(e => ({ err: String(e) }));
  t('大きい写真は2つに分けて入る', docOk && docOk.chunks === 2 && docOk.len1 > 0, docOk);
  t('分けた写真を繋ぐと元に戻る', docOk && docOk.joined === true, docOk && docOk.joined);
  t('1つあたりが Firestore の上限（1MB）より小さい', docOk && docOk.len0 < 900000, docOk && docOk.len0);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  // ──────── PC ────────
  head('⑤ PC：登録した車が一覧に出て、📄 から車検証を開ける');
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx2.addInitScript(signedInInit, [ME, STOR]);
  // スマホで入れた1台＋車検証の写真（小さい1枚）を最初から入れておく
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const seed2 = Object.assign({}, seed, {
    [STOR + 'vehicles-v2']: [{
      id: 'vTest', group: 'factory', name: 'スペーシア X パール', num: '神戸58Aか3503', plate4: '3503',
      maker: 'スズキ', model: '5AA-MK53S', vin: 'MK53S-123456', cargo4: false, usedNew: false,
      colorHex: '#f8fafc', purpose: 'loaner', user: '', store: 'honten', tire: 'summer', insurance: true,
      nav: '', navYen: '', supplier: '', regDate: '2025-09-16', firstReg: '2025-09', expiry: '2028-09-16',
      note: '', inspections: { m1: { doneAt: '' }, m6: { doneAt: '' }, m12: [] },
      docs: [{ id: 'd1', name: '車検証（スマホで撮影）', kind: 'shaken', chunks: 1, at: '2026-10-05T00:00:00.000Z', by: '江川京志' }],
      archived: false, addedFrom: 'mobile-qr', createdAt: '2026-10-05T00:00:00.000Z',
    }],
    [STOR + 'vehdoc-d1-index']: { id: 'd1', chunks: 1, type: 'image/jpeg', size: PNG.length, at: '2026-10-05T00:00:00.000Z' },
    [STOR + 'vehdoc-d1-chunk-0']: PNG,
  });
  ctx2.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed2) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx2.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const pc = await ctx2.newPage();
  const errs2 = []; pc.on('pageerror', e => errs2.push(String(e)));
  await pc.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(pc, '江川京志', 25000); await clickText(pc, '江川京志'); await clickText(pc, 'でログイン');
  await seeText(pc, 'スケジュール', 25000);
  await clickText(pc, 'このまま使う');
  await pc.waitForTimeout(600);
  await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('車両管理') && el.offsetParent !== null); if (b) b.click(); });
  await pc.waitForTimeout(1500);
  t('スマホから入れた車が一覧に出る', await seeText(pc, 'スペーシア X パール', 10000));

  await pc.evaluate(() => { const td = [...document.querySelectorAll('td')].find(e => e.innerText.indexOf('スペーシア X パール') >= 0); if (td) td.click(); });
  await pc.waitForTimeout(700);
  t('詳細に車検証の行が出る', await seeText(pc, '車検証（スマホで撮影）', 6000));
  await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('車検証（スマホで撮影）') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await pc.waitForTimeout(1200);
  const img = await pc.evaluate(() => {
    const i = [...document.querySelectorAll('img')].find(e => e.alt === '車検証' && e.offsetParent !== null);
    return i ? { ok: true, src: String(i.src).slice(0, 22) } : { ok: false };
  });
  t('📄 を押すと車検証の写真が開く', img.ok === true && img.src.indexOf('data:image') === 0, img);

  head('⑥ PC：写真の情報が見える／🗑 で消せる');
  t('撮った日・撮った人・大きさ・分割数が出る',
    (await seeText(pc, '撮った日', 4000)) && (await seeText(pc, '撮った人', 2000)) &&
    (await seeText(pc, '大きさ', 2000)) && (await seeText(pc, '分けて保存', 2000)));
  t('撮った人の名前が出る', await seeText(pc, '江川京志', 3000));
  t('⬇ 保存（ダウンロード）もできる',
    await pc.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(e => e.innerText.indexOf('保存') >= 0 && e.offsetParent !== null);
      return !!a && String(a.getAttribute('download') || '').length > 0 && String(a.href).indexOf('data:image') === 0;
    }));
  // 🗑 削除（確認は自動で OK にする）
  pc.once('dialog', d => d.accept());
  await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.indexOf('🗑 削除') >= 0 && e.offsetParent !== null); if (b) b.click(); });
  await pc.waitForTimeout(1500);
  const after = await pc.evaluate(stor => ({
    idx: window.__fakeFb.get(stor + 'vehdoc-d1-index'),
    c0: window.__fakeFb.get(stor + 'vehdoc-d1-chunk-0'),
    docs: ((window.__fakeFb.get(stor + 'vehicles-v2') || []).find(x => x && x.id === 'vTest') || {}).docs,
  }), STOR);
  t('写真の本体（chunk）が消える', after.c0 === null || after.c0 === undefined, after.c0 === null ? 'null' : typeof after.c0);
  t('写真の見出し（index）も消える', after.idx === null || after.idx === undefined, after.idx);
  t('車両の docs からも外れる', Array.isArray(after.docs) && after.docs.length === 0, after.docs);
  t('車両そのものは消えない', await seeText(pc, 'スペーシア X パール', 4000));
  t('消した後は「まだ入っていません」に戻る', await seeText(pc, 'まだ入っていません', 4000));

  t('PC でもエラーは出ていない', errs2.length === 0, errs2.slice(0, 3));

  await browser.close();
  server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
