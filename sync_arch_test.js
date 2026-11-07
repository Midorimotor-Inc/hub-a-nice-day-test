// 同期チェックの直し4つの検査（2026-11-07・本番で102件の誤検出が出たのを直した時に作った）
//   ① 保管箱（insp-arch）に入っている予約を「漏れ」にしない
//   ② スケジュールに手打ちされた行（氏名が短い・会社名の略）も同じ人として拾う。
//      ただしナンバーも車種も合わない別人は拾わない
//   ③ 別の日に予約がある人は数えない（日にち変更のあとの古い控え）
//   ④ 「スケジュールに追加する」は、別の日に予約がある人と保管箱の日には書かない
//   実行: node sync_arch_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }
const DIR = __dirname, PORT = 8449, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const seeText = async (page, s, ms = 15000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', uid: 'uid_egawa', name: '江川京志', store: 'honten' };
const signedInInit = ([me, stor]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.uid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = { [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: 'h7', role: 'admin', active: true, kind: 'staff' } };
  st['devices/dev-test'] = { env: stor, e: me.email, n: me.name, names: [me.name], s: me.store, k: 'shared', l: 'テストPC', ua: 'test', at: 1, last: Date.now() };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
  localStorage.setItem(stor + 'auth-devid', 'dev-test');
  localStorage.setItem(stor + 'auth-mine', JSON.stringify([{ uid: 'h7', name: me.name, store: me.store, email: me.email, isAdmin: true }]));
  localStorage.setItem(stor + 'auth-kind', 'shared');
};
// 本予約・入庫日ありの顧客
const cust = (i, name, entryDate, carType, no) => ({ custId: 'c' + i, rowIdx: i, expiry: '2026-11-20', name, no, carType,
  phoneHome: '', phoneMobile: '', address: '', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '',
  entryDate, tokuten: '-', course: 2, store: 'honten', staff: '', note: '', status: 'confirm', bookingTime: '09:00', linkedInspDate: '' });
// スケジュールの1行
const row = (name, carType, no, custId) => ({ name, carType, no: no || '', course: 2, store: 'honten', staff: '', tokuten: '-', note: '',
  bookingStatus: 'confirmed', custId: custId || undefined, time: '09:00', seq: 1700000000000, bookingKey: '' });
const seed = {
  [STOR + 'cf-index']: [{ name: '202610', count: 8 }],
  [STOR + 'cf-202610-index']: { name: '202610', chunks: 1, total: 8 },
  [STOR + 'cf-202610-chunk-0']: [
    cust(1, '保管　太郎', '2026-10-05', 'ハスラー', 1111),
    cust(2, '白石　一朗', '2026-10-28', 'エブリィ', 1001),
    cust(3, '有限会社　藤原資材', '2026-10-29', 'キャリィ', 1222),
    cust(4, '消えた　次郎', '2026-10-30', 'ワゴンＲ', 1333),
    cust(5, '動いた　三郎', '2026-10-30', 'スペーシア', 1444),
    cust(6, '佐藤　一郎', '2026-10-28', 'ハスラー', 2222),
    cust(7, '控え　四郎', '2026-10-27', 'タント', 4444),  // ③ custbk だけ古い日(10/26)に残っている
    cust(8, '欠け　五郎', '2026-10-05', 'アルト', 5555),
  ],
  [STOR + 'cust-updates']: [],
  [STOR + 'insp']: {
    '2026-10-28': [row('白石', 'エブリイ', ''), row('佐藤', 'ワゴンＲ', 3333)],
    '2026-10-29': [row('藤原資材', 'キャリィ', '')],
    '2026-10-31': [row('動いた　三郎', 'スペーシア', 1444, 'c5')],
    '2026-10-27': [row('控え　四郎', 'タント', 4444, 'c7')],
  },
  [STOR + 'insp-arch']: {
    '2026-10-5': [row('保管　太郎', 'ハスラー', 1111, 'c1'), row('ほかの　予約', 'ソリオ', 9999, 'cz')],
  },
  [STOR + 'custbk']: {
    '控え　四郎::2026-10-26': { dk: '2026-10-26', status: 'confirmed', formData: { custId: 'c7', name: '控え　四郎', no: 4444, carType: 'タント', course: 2, store: 'honten', time: '09:00' } },
  },
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
};
(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (err, d) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const body = (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + '\n(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();' : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/customers.html', { waitUntil: 'domcontentloaded' });
  t('顧客リストが開く', await seeText(page, '顧客リスト', 25000));
  await page.waitForTimeout(1800);
  const readDlg = async () => page.evaluate(() => {
    const h = [...document.querySelectorAll('div')].find(d => /件の反映漏れを検出|問題ありません|追加しました|保存が確認できません|足す分はありません/.test(d.innerText) && d.children.length === 0);
    if (!h) return '';
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && box.parentElement; i++) { if (getComputedStyle(box).position === 'fixed') break; box = box.parentElement; }
    return box ? box.innerText : '';
  });
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('スケジュール同期チェック')); if (b) { b.click(); return true; } return false; });
  t('「スケジュール同期チェック」を押せた', clicked);
  t('結果が出る', await seeText(page, '反映漏れ', 30000) || await seeText(page, '問題ありません', 30000));
  await page.waitForTimeout(900);
  const dlg = await readDlg();
  t('ダイアログの中身を読めた', !!dlg, dlg.slice(0, 160));

  console.log('■ ① 保管箱（insp-arch）を見る');
  t('保管箱にある予約は「漏れ」に出さない', !/保管　太郎/.test(dlg), dlg.slice(0, 600));
  t('「保管箱も見ています」と画面に書いてある', /保管箱/.test(dlg), (dlg.match(/.{0,20}保管箱.{0,30}/) || [''])[0]);

  console.log('■ ② 手打ちの行も拾う（ただし別人は拾わない）');
  t('手打ち「白石」＝「白石　一朗」として扱う（出さない）', !/白石/.test(dlg), dlg.slice(0, 600));
  t('手打ち「藤原資材」＝「有限会社　藤原資材」として扱う（出さない）', !/藤原/.test(dlg), dlg.slice(0, 600));
  t('★別人（手打ち「佐藤」＝車もナンバーも違う）はきちんと漏れに出す', /佐藤/.test(dlg), dlg.slice(0, 600));

  console.log('■ ③ 別の日に予約がある分');
  t('custbk の残り（別の日に予約あり）は数えない', !/控え/.test(dlg), dlg.slice(0, 600));
  t('入庫日がずれている人は理由つきで出る', /動いた/.test(dlg) && /別の日/.test(dlg), (dlg.match(/.{0,16}別の日.{0,24}/) || [''])[0]);

  console.log('■ 本物の漏れ');
  t('本物の漏れ（予約が無い）は出る', /消えた/.test(dlg), dlg.slice(0, 600));
  t('保管箱の日の漏れも出る', /欠け/.test(dlg), dlg.slice(0, 600));
  t('件数は4件（消えた・動いた・佐藤・欠け）', /4件の反映漏れ/.test(dlg), (dlg.match(/\d+件の反映漏れ/) || [''])[0]);
  const whys = await page.evaluate(() => [...document.querySelectorAll('[data-syncwhy]')].map(e => e.innerText));
  t('「なぜ出ているか」の列が出る', whys.length === 4, whys);
  t('理由に「予約がありません」と「別の日」が並ぶ', whys.some(w => /予約がありません/.test(w)) && whys.some(w => /別の日/.test(w)), whys);

  console.log('■ ④ 「スケジュールに追加する」の歯止め');
  const fixed = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('スケジュールに追加')); if (b) { b.click(); return true; } return false; });
  t('「スケジュールに追加する」を押せた', fixed);
  await page.waitForTimeout(7000);
  const after = await page.evaluate(k => window.__fakeFb.get(k + 'insp'), STOR);
  const names = dk => ((after && after[dk]) || []).filter(r => r && r.name).map(r => r.name).join('・');
  t('本物の漏れ（消えた　次郎）は追加された', /消えた/.test(names('2026-10-30')), names('2026-10-30'));
  t('★別の日に予約がある人（動いた　三郎）は追加しない（二重予約にしない）', !/動いた/.test(names('2026-10-30')), names('2026-10-30'));
  t('★保管箱の日（10/5）には1行も書かない', !(after && after['2026-10-5']), after && Object.keys(after));
  const arch = await page.evaluate(k => window.__fakeFb.get(k + 'insp-arch'), STOR);
  t('保管箱の10/5の予約は2件のまま', ((arch && arch['2026-10-5']) || []).length === 2, arch && arch['2026-10-5'] && arch['2026-10-5'].map(r => r.name));
  const dlg2 = await readDlg();
  t('自動で直さなかった分を画面に出す', /自動では直さなかった分/.test(dlg2), dlg2.slice(0, 400));
  t('見送った理由に「保管箱の日なので手で入れてください」が出る', /保管箱の日なので手で入れて/.test(dlg2), (dlg2.match(/.{0,20}保管箱の日.{0,30}/) || [''])[0]);

  t('JSエラーなし', errs.length === 0, errs.slice(0, 3));
  await page.screenshot({ path: path.join(DIR, 'smoke-sync-arch.png') });
  await ctx.close(); await browser.close(); server.close();
  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('検査が止まりました:', e); process.exit(1); });
