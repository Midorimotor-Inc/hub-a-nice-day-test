// 代車・レンタカーの帯を消した時、予約カードの代車名を「正しく」消すかの検査（2026-10-14）
//   それまでの欠陥：
//   ① 氏名を確かめず行番号だけで消していた → 行がずれていると**別人の代車名を消す**
//   ② 車検（insp-）にしか効かず、整備（sched-）はカードに名前が残った
//   ③ レンタカーは消す処理そのものが無かった
//   実行: node loaner_delete_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8341, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
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
const now = new Date();
const d = (p) => { const x = new Date(now); x.setDate(x.getDate() + p); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() }; };
const dk = (o) => `${o.y}-${o.m + 1}-${o.d}`;
const A = d(6), B = d(7), C = d(8);
const CARS = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];

(async () => {
  // 車検は「行がずれている」状態を作る：帯の bookingKey は 行0 を指すが、実際の本人は 行1 にいる
  const seed = {
    [STOR + 'insp']: {
      [dk(A)]: [
        { name: '別人　太郎', carType: 'アルト', no: '1111', time: '09:00', course: 2, store: 'honten', seq: 1, id: 1, loaner: 'スペーシア (8967)', loanerId: 2 },
        { name: '消井　削子', carType: 'ワゴンR', no: '2222', time: '10:00', course: 2, store: 'honten', seq: 2, id: 2, loaner: 'ハスラー (7074)', loanerId: 1 },
      ],
    },
    [STOR + 'honten-sched']: { [dk(B)]: { '09:00': { name: '整備　整子', carType: 'タント', no: '3333', loaner: 'ハスラー (7074)', loanerId: 1 } } },
    [STOR + 'sanda-sched']: { [dk(C)]: { '11:00': { name: '貸車　借男', carType: 'ソリオ', no: '4444', rentalLabel: '🔑 ノマド (3101)', rentalCarId: 101 } } },
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': {
        // ★帯は「行0」を指しているが、本人は 行1 にいる（予約を足して行がずれた状態）
        r1: { id: 5001, user: '消井　削子', fy: A.y, fm: A.m, fd: A.d, ty: A.y, tm: A.m, td: A.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'insp-' + dk(A) + '-0' },
        r2: { id: 5002, user: '整備　整子', fy: B.y, fm: B.m, fd: B.d, ty: B.y, tm: B.m, td: B.d, carName: 'ハスラー', carNum: '7074', bookingKey: 'sched-' + dk(B) + '-09:00' },
      }, '2': {}
    },
    [STOR + 'sanda-lres']: {},
    [STOR + 'rres']: { '101': { q1: { id: 5003, user: '貸車　借男', fy: C.y, fm: C.m, fd: C.d, ty: C.y, tm: C.m, td: C.d, carName: 'ノマド', carNum: '3101', bookingKey: 'sched-' + dk(C) + '-11:00' } } },
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
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
  page.on('dialog', async dd => { await dd.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(900);

  const get = k => page.evaluate(x => window.__fakeFb.get(x), k);
  // 画面を使わず、本体の削除処理を直接呼ぶ（代車管理の 🗑 と同じ道）
  const delLoaner = (cid, rid) => page.evaluate(([c, r]) => window.__hubTestDeleteLoaner && window.__hubTestDeleteLoaner(c, r), [cid, rid]);

  head('① 作りの確認（中身）');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const fn = (SRC.split('const clearCarLabelOnDelete=useCallback((res,isRental)=>{')[1] || '').split(NL + '  },[persistInsp,setSchedDataH,setSchedDataS]);')[0];
  t('帯を消した時にカードを消す処理がある', !!fn);
  t('★氏名が一致する行にだけ書く', fn.indexOf('r.name===who') > 0 && fn.indexOf('rows.findIndex') > 0, fn.slice(0, 80));
  t('★整備（sched-）にも効く', fn.indexOf("m[1]==='insp'") > 0 && fn.indexOf('setSchedDataH') > 0);
  t('★整備は両店を見る', fn.indexOf("'honten',setSchedDataH") > 0 && fn.indexOf("'sanda',setSchedDataS") > 0);
  t('★レンタカーの削除でもカードを消す', SRC.indexOf('clearCarLabelOnDelete(rec,true)') > 0);
  t('代車の削除ではレンタカー名を触らない（取り違え防止）',
    fn.indexOf("isRental?{rentalLabel:'',rentalCarId:null}:{loaner:'',loanerId:null}") > 0);

  head('② 代車管理の画面から消してみる');
  await clickText(page, '代車管理');
  await page.waitForTimeout(1800);
  t('代車管理が開く', await seeText(page, 'ハスラー', 8000));
  // 帯をクリック → 削除
  const clicked = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('div')].find(e => /消井/.test(e.innerText || '') && e.offsetParent !== null && e.getBoundingClientRect().height < 60);
    if (!cell) return false; cell.click(); return true;
  });
  await page.waitForTimeout(800);
  const delOk = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /削除|🗑/.test(e.innerText) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(2500);
  const insp = await get(STOR + 'insp');
  const rows = (insp || {})[dk(A)] || [];
  const other = rows.find(r => r && r.name === '別人　太郎') || {};
  const mine = rows.find(r => r && r.name === '消井　削子') || {};
  t('帯のクリックと削除ができた', clicked && delOk, { clicked, delOk });
  t('★別人（行0）の代車名を消していない', other.loaner === 'スペーシア (8967)', { 別人: other.loaner });
  t('★本人（行1）の代車名が消える', !mine.loaner && !mine.loanerId, { 本人: mine.loaner });
  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
