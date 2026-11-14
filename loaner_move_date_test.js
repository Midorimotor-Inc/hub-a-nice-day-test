// 【重大】車検の日にちを変えた時、代車の帯を《消さずに一緒に動かす》かの検査（v3.117.0・2026-11-14）
//   それまでの不具合：PC で車検の日にちを変えると、代車の帯だけが消え、予約カードの代車名は残っていた。
//   ＝「カードに代車名があるのに代車管理に貸出が無い」＝代車が要るお客様の車が1台もおさえられていない。
//   本番の実データで確認（2026-11-23 の予約・12/23 から変更）。スマホは最初から動かす作りで PC だけ抜けていた。
//   見るのは4つ：
//     ① 日にちを変えると帯も同じ日数ぶんずれて付いてくる／元の日の帯は残らない／カードの代車名は消えない
//     ② 移した先でその車がふさがっていたら、1文字も書かずに保存を止める
//     ③ 帯があるのにカードの代車名が空なら、日にち変更の時に入れ直す（逆向きのズレも消す）
//     ④ ズレの画面の「＋ 代車管理に貸出を作る」で、本当に帯ができる
//   実行: node loaner_move_date_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8481, STOR = 'hub-v8-dev-';
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
// ★日付は決め打ちにしない（休業日・月末に当たると検査が落ちる）。
//   来月の 5 日・9 日・12 日・16 日を使う（どの月にも必ずある／カレンダーの月移動が要らない）。
const NX = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 1); })();
const DD = (day) => ({ y: NX.getFullYear(), m: NX.getMonth(), d: day });
const dk = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;
const A = DD(5), B = DD(9), C = DD(12), E = DD(16);   // A→B へ動かす。C は「ふさがっている」用、E は帯だけの人
const CARS = [{ id: 1, name: 'ハスラーオフブルー', num: '8178' }, { id: 2, name: 'スペーシア', num: '4750' }];
const RCARS = [{ id: 101, name: 'ノマド', num: '3101' }];
const bar = (id, user, from, to, car, bk) => ({ id, user, fy: from.y, fm: from.m, fd: from.d, ty: to.y, tm: to.m, td: to.d, carName: car.name, carNum: car.num, bookingKey: bk });

(async () => {
  const seed = {
    [STOR + 'insp']: {
      // ① 代車つきの車検（A 日・行0）
      [dk(A)]: [{ name: '移動　太郎', carType: 'スペーシア', no: '1353', time: '09:00', course: 2, store: 'honten', seq: 101, id: 101, loaner: 'ハスラーオフブルー (8178)', loanerId: 1 }],
      // ② 移した先がふさがっている方（C 日・行0）。車2の帯が B 日に居る
      [dk(C)]: [{ name: '塞がり　花子', carType: 'アルト', no: '2222', time: '10:00', course: 2, store: 'honten', seq: 102, id: 102, loaner: 'スペーシア (4750)', loanerId: 2 }],
      // ③ 帯はあるのにカードの代車名が空（E 日・行0）
      [dk(E)]: [{ name: '空名　次郎', carType: 'ワゴンR', no: '3333', time: '11:00', course: 2, store: 'honten', seq: 103, id: 103 }],
    },
    [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: RCARS,
    [STOR + 'honten-lres']: {
      '1': { k1: bar(5001, '移動　太郎', A, A, CARS[0], 'insp-' + dk(A) + '-0') },
      // 車2は B 日がふさがっている（別の人）＝ C→B へ動かそうとすると止まるはず
      '2': {
        k2: bar(5002, '塞がり　花子', C, C, CARS[1], 'insp-' + dk(C) + '-0'),
        k3: bar(5003, '先客　三郎', B, B, CARS[1], ''),
        k4: bar(5004, '空名　次郎', E, E, CARS[1], 'insp-' + dk(E) + '-0'),
      },
    },
    [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
    [STOR + 'honten-cdow']: [], [STOR + 'honten-cdate']: [], [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [],
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
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(1200);

  const get = k => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), k);
  const inp = (o) => o.y + '-' + String(o.m + 1).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
  const goDay = async (v) => {
    const want = v.slice(0, 7);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-datepick]')].find(e => e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(250);
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : null; });
      if (!cur || cur === want) break;
      await page.click(cur < want ? '[data-mnav="next"]' : '[data-mnav="prev"]');
      await page.waitForTimeout(90);
    }
    const day = await page.$('[data-day="' + v + '"]');
    if (!day) return false;
    await day.click(); await page.waitForTimeout(500);
    return true;
  };
  // ★車検の行は tr ではなく【氏名の td】に開く仕掛けが付いている（InspRow）。tr.click() では開かない。
  const openRow = async (who) => {
    await page.evaluate(x => {
      const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(x) >= 0);
      if (!tr) return;
      const td = [...tr.querySelectorAll('td')].find(c => c.innerText.indexOf(x) >= 0);
      (td || tr).click();
    }, who);
    await page.waitForTimeout(1000);
    return seeText(page, '予約カード', 6000);
  };
  const pickDay = async (day) => {
    await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find(e => e.innerText && e.innerText.trim() === 'クリックで日付変更' && e.offsetParent !== null); if (s) s.click(); });
    await page.waitForTimeout(400);
    const ok = await page.evaluate(x => {
      const box = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '9999' && /年\d+月/.test(e.innerText || ''));
      if (!box) return false;
      const grid = [...box.querySelectorAll('div')].filter(e => getComputedStyle(e).display === 'grid' && e.children.length > 20)[0];
      if (!grid) return false;
      const cell = [...grid.children].find(c => c.innerText.trim() === String(x));
      if (!cell) return false; cell.click(); return true;
    }, day);
    await page.waitForTimeout(500);
    return ok;
  };
  const save = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|内容を保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(2600);
  };
  // ★★カードは必ずこれで閉じること（2026-11-14）。開いたまま次の予約を開くと、
  //   「日にち変更の元の日」が前の予約のまま残り、別人の代車の帯を動かしてしまう。
  //   『✕』を字で探すやり方は、ヘッダーの ✕ など別のボタンを押してしまう。
  const closeCard = async () => {
    for (let i = 0; i < 6; i++) {
      const gone = await page.evaluate(() => !document.body.innerText.includes('予約カード'));
      if (gone) return true;
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル' && e.offsetParent !== null); if (b) b.click(); });
      await page.waitForTimeout(500);
    }
    return await page.evaluate(() => !document.body.innerText.includes('予約カード'));
  };
  const barsOf = (lres, cid) => Object.values((lres || {})[cid] || {}).filter(Boolean);

  // ────────────────────────────────────────────────────────
  head('① 作りの確認（ファイルの中身）');
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('★日にち変更で帯を「動かす」道がある（_mvLo）', SRC.indexOf('let _mvLo=null;') > 0);
  t('★動かす前に重なりを見て、止める道がある', SRC.indexOf('日にちを変えられません（代車が空いていません）') > 0);
  t('★帯を見つけるのは bookingKey だけでなく氏名でも（_lrMatch）', /_mvFind[\s\S]{0,400}_lrMatch\(r,_mvIdent\)/.test(SRC));
  t('★両店の代車の表を見る', /for\(const _st of \['honten','sanda'\]\)/.test(SRC));
  t('★店を指定して書く道具がある（persistLresOf）', SRC.indexOf('const persistLresOf = useCallback(') > 0);
  t('★消すのは「動かせない時」だけ（else if）', SRC.indexOf('}else if(_delBk||_delIdent){') > 0);
  t('★レンタカーは bookingKey だけ付け替える', /_isDcForDel&&!_hadRentalForBk&&!pendRentalDrop/.test(SRC));
  t('★日にちの足し引きは dkToDays（toNum を使わない）', SRC.indexOf('const dkToDays = (dk) =>') > 0);
  t('★ズレの画面に「貸出を作る」がある', SRC.indexOf('data-syncmake') > 0 && SRC.indexOf('const makeLoanerBand=useCallback(') > 0);
  t('★危ない方には赤で知らせる', SRC.indexOf('data-syncdanger') > 0);

  // ────────────────────────────────────────────────────────
  head('② 日にちを変えると、代車の帯も一緒に動く');
  t('A 日を開ける', await goDay(inp(A)));
  t('代車つきの予約カードが開く', await openRow('移動'));
  t('A→B へ日にちを選べる', await pickDay(B.d));
  await save();
  const l1 = await get(STOR + 'honten-lres');
  const i1 = await get(STOR + 'insp');
  const b1 = barsOf(l1, '1');
  const movedBar = b1.find(r => r.user === '移動　太郎');
  t('★帯が1本のまま（増えも減りもしない）', b1.length === 1, b1.map(r => r.user));
  t('★帯が B 日へずれた', !!movedBar && movedBar.fd === B.d && movedBar.td === B.d && movedBar.fm === B.m, movedBar);
  t('★帯の紐付けが新しい日の行を指す', !!movedBar && movedBar.bookingKey === 'insp-' + dk(B) + '-0', movedBar && movedBar.bookingKey);
  t('★元の日（A）の帯は残らない', !b1.some(r => r.fd === A.d && r.user === '移動　太郎'), b1);
  const rowB = ((i1 || {})[dk(B)] || []).find(r => r && r.name === '移動　太郎') || {};
  t('★予約が B 日へ移った', !!rowB.name, (i1 || {})[dk(B)]);
  t('★カードの代車名は消えていない', rowB.loaner === 'ハスラーオフブルー (8178)', rowB.loaner);
  t('★A 日の予約は消えた', !((i1 || {})[dk(A)] || []).some(r => r && r.name === '移動　太郎'), (i1 || {})[dk(A)]);
  t('★「期間が一致しません」を聞かれない（一緒に動くので）', !dialogs.some(m => /期間がスケジュールと一致/.test(m)), dialogs);

  head('③ 代車管理が「ズレなし」になる');
  await clickText(page, '代車管理');
  await page.waitForTimeout(2000);
  const syncTxt = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /スケジュールと(一致|ズレ)/.test(e.innerText || '') && e.offsetParent !== null);
    return b ? b.innerText.replace(/\s+/g, '') : null;
  });
  // ★種データには ⑤ 用の『帯はあるのにカードの代車名が空』（空名　次郎）を仕込んであるので、
  //   ズレは 1件 出るのが正しい。見るのは【移した人（移動　太郎）が一覧に出ないこと】。
  if (syncTxt !== '✓スケジュールと一致') { await clickText(page, 'スケジュールとズレ'); await page.waitForTimeout(800); }
  const syncList = await page.evaluate(() => { const e = document.querySelector('[data-synclist]'); return e ? e.innerText : ''; });
  t('★移した人の分でズレが出ない', !/移動　太郎/.test(syncList), syncTxt);
  t('★ズレは ⑤ 用に仕込んだ1件だけ', /ズレ1件/.test(syncTxt || '') || syncTxt === '✓スケジュールと一致', syncTxt);
  await clickText(page, 'スケジュールに戻る');
  await page.waitForTimeout(1200);

  // ────────────────────────────────────────────────────────
  head('④ 移した先がふさがっていたら、1文字も書かずに止める');
  dialogs.length = 0;
  t('C 日を開ける', await goDay(inp(C)));
  t('予約カードが開く', await openRow('塞がり'));
  t('C→B へ日にちを選べる', await pickDay(B.d));
  await save();
  const l2 = await get(STOR + 'honten-lres');
  const i2 = await get(STOR + 'insp');
  t('★「代車が空いていません」と出る', dialogs.some(m => /日にちを変えられません/.test(m)), dialogs);
  t('★先客の名前と車名を出す', dialogs.some(m => /先客　三郎/.test(m)) && dialogs.some(m => /スペーシア \(4750\)/.test(m)), dialogs);
  t('★予約は動いていない（C 日のまま）', ((i2 || {})[dk(C)] || []).some(r => r && r.name === '塞がり　花子'), (i2 || {})[dk(C)]);
  t('★B 日に増えていない', !((i2 || {})[dk(B)] || []).some(r => r && r.name === '塞がり　花子'), (i2 || {})[dk(B)]);
  t('★帯も動いていない', barsOf(l2, '2').some(r => r.user === '塞がり　花子' && r.fd === C.d), barsOf(l2, '2'));
  t('★先客の帯はそのまま', barsOf(l2, '2').some(r => r.user === '先客　三郎' && r.fd === B.d), barsOf(l2, '2'));
  t('★止めたあとカードを閉じられる', await closeCard());

  // ────────────────────────────────────────────────────────
  head('⑤ 帯はあるのにカードの代車名が空 → 日にち変更で入れ直す');
  dialogs.length = 0;
  t('E 日を開ける', await goDay(inp(E)));
  t('予約カードが開く', await openRow('空名'));
  // E(16) → 15 日へ（1日前。車2は 15 日が空いている）
  t('日にちを選べる', await pickDay(E.d - 1));
  await save();
  const l3 = await get(STOR + 'honten-lres');
  const i3 = await get(STOR + 'insp');
  const dkPrev = E.y + '-' + (E.m + 1) + '-' + (E.d - 1);
  const rowP = ((i3 || {})[dkPrev] || []).find(r => r && r.name === '空名　次郎') || {};
  t('★カードの代車名が入った', rowP.loaner === 'スペーシア (4750)', rowP.loaner);
  t('★帯も新しい日へずれた', barsOf(l3, '2').some(r => r.user === '空名　次郎' && r.fd === E.d - 1), barsOf(l3, '2'));

  // ────────────────────────────────────────────────────────
  head('⑥ ズレの画面の「＋ 貸出を作る」で帯ができる');
  // カードだけに代車名がある状態をわざと作る（帯を消す）
  await page.evaluate(([k, cid, rid]) => {
    const v = JSON.parse(JSON.stringify(window.__fakeFb.get(k) || {}));
    Object.keys(v[cid] || {}).forEach(x => { if (v[cid][x] && v[cid][x].id === rid) delete v[cid][x]; });
    window.__fakeFb.set(k, v);
  }, [STOR + 'honten-lres', '1', 5001]);
  await page.waitForTimeout(1600);
  await clickText(page, '代車管理');
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /スケジュールとズレ/.test(e.innerText || '') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(900);
  t('★ズレの一覧が開く', await seeText(page, 'スケジュールとのズレ', 6000));
  t('★危ないことを赤で知らせる', await page.evaluate(() => !!document.querySelector('[data-syncdanger]')));
  const mk = await page.evaluate(() => { const b = document.querySelector('[data-syncmake]'); if (!b) return null; const s = b.innerText; b.click(); return s; });
  t('★「貸出を作る」ボタンがある', !!mk, mk);
  await page.waitForTimeout(2600);
  const l4 = await get(STOR + 'honten-lres');
  const made = barsOf(l4, '1').find(r => r.user === '移動　太郎');
  t('★帯ができた', !!made, barsOf(l4, '1'));
  t('★正しい日・正しい車で', !!made && made.fd === B.d && made.carNum === '8178', made);
  t('★紐付けも正しい', !!made && made.bookingKey === 'insp-' + dk(B) + '-0', made && made.bookingKey);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
