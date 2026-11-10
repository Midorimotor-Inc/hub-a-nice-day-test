// 予約カードに保存される「代車名の文字」の検査（2026-11-10 ユーザー報告）
//   ■ 直した2つ
//   ① 代車を選んで保存しても、行の loaner（保存される文字）を帯と同じ場所で書いていなかった（PC版だけ）。
//      行の文字は「カードを開いている間の form の値」任せで、pendingLoanerId の useEffect が入れていた。
//      その useEffect は 車の名簿（allCars）が未読込だと何も書かず、代車を選んだ後に form が
//      作り直されると書いた名前が消える（新規は initialData が変わるたびにリセットされる）。
//      どちらでも **帯だけが書かれて行は空** になる。
//      画面はどこも getLoanerLabel で帯から引くので正しく見えるが、
//      **1日の印刷と紙の控えは保存された文字をそのまま刷る**ので代車の欄が空になる。
//      おまけに「スケジュールとズレ」にも出続ける（実例：戎さま 2026-11-29）。
//      ★見張りは ① の中身の検査（直す前のファイルで落ちる）。
//        ④ のふつうに選んで保存する経路は useEffect が書くので**直す前でも通る**＝あちらは後戻り防止。
//   ② 車両管理で車の名前を直すと、それより前に取った予約のカードに古い名前が残り
//      「車名ちがい」に出ていた（実例：4750 を「スペーシア　イエロー」→「スペーシア G イエロー」）。
//      **ナンバーが同じなら同じ車**なので、名前の書き方の違いではズレに出さない。
//   実行: node loaner_label_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8463, STOR = 'hub-v8-dev-';
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
const T = d(0), E = d(6), F = d(7);
// 本番と同じ形：同じ下4桁の車を、名前だけ直した状態で持つ
const CARS = [
  { id: 1, name: 'ハスラーオフブルー', num: '8178' },
  { id: 2, name: 'スペーシア G イエロー', num: '4750' },   // ← 名前を直した車
];

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: {
      // ② 車名を直しただけ（ナンバーは同じ 4750）＝ズレに出してはいけない
      [dk(E)]: { '10:00': { name: '名前　違子', carType: 'ハスラー', no: '1111', loaner: 'スペーシア　イエロー (4750)', loanerId: 2, store: 'honten' } },
      // ②-2 本物のズレ（カードは 8178・帯は 4750）＝今までどおり出す
      [dk(F)]: { '11:00': { name: '車　違男', carType: 'ソリオ', no: '2222', loaner: 'ハスラーオフブルー (8178)', loanerId: 1, store: 'honten' } },
    },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cars']: CARS, [STOR + 'sanda-cars']: [], [STOR + 'rentalcars']: [],
    [STOR + 'honten-lres']: {
      '2': {
        e1: { id: 7001, user: '名前　違子', fy: E.y, fm: E.m, fd: E.d, ty: E.y, tm: E.m, td: E.d, carName: 'スペーシア　イエロー', carNum: '4750', bookingKey: 'sched-' + dk(E) + '-10:00' },
        f1: { id: 7002, user: '車　違男', fy: F.y, fm: F.m, fd: F.d, ty: F.y, tm: F.m, td: F.d, carName: 'スペーシア G イエロー', carNum: '4750', bookingKey: 'sched-' + dk(F) + '-11:00' },
      }, '1': {}
    },
    [STOR + 'sanda-lres']: {}, [STOR + 'rres']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = [];
  page.on('dialog', async dd => { alerts.push(dd.message()); await dd.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(1200);
  const get = k => page.evaluate(x => window.__fakeFb.get(x), k);
  const SRC = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const MOB = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');

  // ── ① 作りの確認（中身）────────────────────────────────
  head('① 作りの確認（中身）');
  const branch = (SRC.split('if(pendingLoanerData){')[1] || '').split('// レンタカーが選択されている場合')[0];
  t('★代車を選んだ保存で、行の loaner に車名を書いている',
    /cleanData\.loaner\s*=\s*`\$\{_lu\.carName\}/.test(branch), branch.slice(-200));
  t('★行の loanerId も書いている', /cleanData\.loanerId\s*=\s*_lu\.carId/.test(branch));
  t('★車名が分からない時は触らない（空で上書きしない）', /if\(_lu\.carName\)\{/.test(branch));
  t('スマホ版は前からこう書いている（PC版とそろった）',
    /loaner:car\?`\$\{car\.name\} \(\$\{car\.num\}\)`:''/.test(MOB));
  t('★PC に ナンバーで見分ける道具（carLabelNum）がある', /const carLabelNum = /.test(SRC));
  t('★スマホにも同じ道具がある', /const carLabelNum = /.test(MOB));
  t('★比べ方（sameCarLabel）がナンバーを先に見る',
    /const na = carLabelNum\(a\), nb = carLabelNum\(b\);[\s\S]{0,80}if \(na && nb\) return na === nb;/.test(SRC));
  t('★スマホの比べ方も同じ',
    /const na = carLabelNum\(a\), nb = carLabelNum\(b\);[\s\S]{0,80}if \(na && nb\) return na === nb;/.test(MOB));

  // ── ② 比べ方そのもの（純関数）──────────────────────────
  head('② 代車名の比べ方（sameCarLabel）');
  const sc = (a, b) => page.evaluate(([x, y]) => (typeof sameCarLabel === 'function') ? sameCarLabel(x, y) : 'ない', [a, b]);
  t('★名前だけ違ってナンバーが同じなら「同じ車」',
    await sc('スペーシア　イエロー (4750)', 'スペーシア G イエロー (4750)') === true);
  t('★ナンバーが違えば「違う車」（本物のズレは見逃さない）',
    await sc('ハスラーオフブルー (8178)', 'スペーシア G イエロー (4750)') === false);
  t('カードが空なら「違う」（印刷が空になるので知らせる）',
    await sc('', 'ハスラーオフブルー (8178)') === false);
  t('レンタカーの鍵マークは今までどおり無視する',
    await sc('🔑 ノマド (3101)', 'ノマド (3101)') === true);
  t('ナンバーが片方にしか無い時は文字で比べる（昔の書き方）',
    await sc('ハスラー', 'ハスラー') === true && await sc('ハスラー', 'スペーシア') === false);

  // ── ③ 代車管理のズレの数 ──────────────────────────────
  head('③ 代車管理：車名を直しただけはズレに出さない');
  await clickText(page, '代車管理');
  await page.waitForTimeout(2200);
  const badge = await page.evaluate(() => (document.body.innerText.match(/スケジュール(と一致|とズレ[^\n]*)/) || ['（見つからない）'])[0]);
  t('代車管理が開く', await seeText(page, 'スペーシア', 8000));
  t('★ズレは1件だけ（名前ちがいは数えない）', /ズレ 1件/.test(badge), badge);
  await clickText(page, 'スケジュールとズレ');
  await page.waitForTimeout(1200);
  // ★一覧の中身だけを読む（画面ぜんぶを読むと、代車管理の帯の氏名まで拾ってしまう）
  const panel = await page.evaluate(() => {
    const box = [...document.querySelectorAll('div')].filter(e => e.offsetParent !== null
      && /スケジュールとのズレ/.test(e.innerText || '') && /見つかりました/.test(e.innerText || ''))
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    return box ? box.innerText : '（一覧が出ていない）';
  });
  t('ズレの一覧が開く', /スケジュールとのズレ/.test(panel), panel.slice(0, 120));
  t('★本物のズレ（別の車）は出る', /車　違男/.test(panel), panel.slice(0, 300));
  t('★名前の書き方だけの違いは出さない', !/名前　違子/.test(panel), panel.slice(0, 300));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '閉じる' && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(600);
  // ★ナビの「スケジュール」だけを押す（「スケジュールシステム テスト版」などに当たらないよう字数で絞る）
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);

  // ── ④ 代車を選んで保存すると、行にも車名が入る ───────────
  head('④ 代車を選んで保存すると、予約カードの行にも代車名が入る');
  const WHO = '代車　入子';
  // ★休業日（第2火曜など）だと予定を入れられないので、入れられる日まで送る。
  //   検査を流した日がいつでも落ちないようにするため、日付は画面の見出しから読む。
  const headDk = () => page.evaluate(() => {
    const m = document.body.innerText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    return m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : '';
  });
  //   日の移動は日付の札（data-datepick）→ カレンダーの日（data-day）で行う（CLAUDE.md の決まり）
  const goDay = async (o) => {
    const ymd = `${o.y}-${String(o.m + 1).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
    await page.evaluate(() => { const b = document.querySelector('[data-datepick]'); if (b) b.click(); });
    await page.waitForTimeout(500);
    const ok = await page.evaluate(x => { const b = document.querySelector(`[data-day="${x}"]`); if (b) { b.click(); return true; } return false; }, ymd);
    await page.waitForTimeout(900);
    return ok;
  };
  let PDK = '';
  for (let i = 2; i <= 6; i++) {
    const o = d(i);
    if (!(await goDay(o))) continue;
    if (!(await page.evaluate(() => /店休日（全員休み）/.test(document.body.innerText)))) { PDK = dk(o); break; }
  }
  if (!PDK) PDK = await headDk();
  t('予定を入れられる日を出せた（休業日ではない）', !!PDK && !(await page.evaluate(() => /店休日|休業日/.test(document.body.innerText))), { PDK });
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('15:00') === 0);
    if (!row) return false;
    const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
    (inner || row).click();
    return true;
  });
  await page.waitForTimeout(900);
  const dbg = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf('15:00') === 0);
    return { row: row ? (row.innerText || '').slice(0, 40) : 'なし', body: document.body.innerText.slice(0, 300) };
  });
  t('整備の予約カードが開く', opened && await page.evaluate(() => /予約カード/.test(document.body.innerText)), { opened, dbg });
  // 氏名の欄（案内の字で探す。本物のキー入力で入れる）
  let typedName = true;
  try {
    await page.fill('input[placeholder="お客様名"]', WHO, { timeout: 4000 });
    await page.fill('input[placeholder="例：プリウス"]', 'タント', { timeout: 4000 });
  } catch (e) { typedName = false; }
  await page.waitForTimeout(400);
  // 作業内容（鈑金＝月数を聞かれないもの）を選ぶ
  for (let i = 0; i < 3; i++) {
    if (await page.evaluate(() => !!document.querySelector('[data-wkid]'))) break;
    await page.evaluate(() => { const dd = document.querySelector('[data-kbkey="work"]'); if (dd) dd.click(); });
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => { const b = document.querySelector('[data-wkid="B"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('[data-wkdone]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  t('氏名を入れられた', typedName && await page.evaluate(w => [...document.querySelectorAll('input')].some(e => e.value === w), WHO));
  // 「代車・レンタカー」の 選択 を押す → 代車管理（選ぶ用）へ
  const toPick = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '選択' && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(2000);
  t('代車を選ぶ画面に入る', toPick && await page.evaluate(() => /予約カードに戻る/.test(document.body.innerText)), { toPick });
  // 今日の列 × ハスラーオフブルー(8178) の行 の空きマスを押す
  const pd = PDK.split('-').map(Number);
  const picked = await page.evaluate(([num, carName]) => {
    const th = document.querySelector(`th[data-ldaynum="${num}"]`);
    const row = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(carName) === 0);
    if (!th || !row) return null;
    const a = th.getBoundingClientRect(), b = row.getBoundingClientRect();
    return { x: Math.round(a.left + a.width / 2), y: Math.round(b.top + b.height / 2) };
  }, [pd[0] * 10000 + pd[1] * 100 + pd[2], 'ハスラーオフブルー']);
  t('今日のマスの場所が分かる', !!picked, picked);
  if (picked) {
    await page.mouse.move(picked.x, picked.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  t('確定の箱が出る', await page.evaluate(() => /日間/.test(document.body.innerText)));
  await page.evaluate(w => {
    const el = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /利用者名/.test(e.placeholder || ''));
    if (el && !el.value) { el.focus(); el.value = w; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, WHO);
  await page.waitForTimeout(300);
  await clickText(page, '確定');
  await page.waitForTimeout(1500);
  t('予約カードに戻る', await page.evaluate(() => /予約カード/.test(document.body.innerText)));
  t('カードに代車名が出ている（帯から引いている）',
    await page.evaluate(() => [...document.querySelectorAll('input')].some(e => /ハスラーオフブルー \(8178\)/.test(e.value || ''))));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|内容を保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2500);
  const sched = (await get(STOR + 'honten-sched')) || {};
  const day = sched[PDK] || {};
  const saved = Object.values(day).find(r => r && r.name === WHO) || {};
  t('整備の予約が保存された', !!saved.name, { day, alerts: alerts.slice(0, 2) });
  t('★★行の代車名が保存されている（印刷・紙の控えに出る）',
    saved.loaner === 'ハスラーオフブルー (8178)', { loaner: saved.loaner });
  t('★行の代車のid も保存されている', String(saved.loanerId) === '1', { loanerId: saved.loanerId });
  const lres = (await get(STOR + 'honten-lres')) || {};
  const bar = Object.values(lres['1'] || {}).find(r => r && r.user === WHO);
  t('代車管理の帯も入っている', !!bar, { bar });
  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
