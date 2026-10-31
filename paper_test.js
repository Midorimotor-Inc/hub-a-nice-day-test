// hub_paper.js（毎朝の控え → 紙の控え1枚）の検査。
//   ・にせの控え（架空の氏名・電話）を作って hub_paper.js にかけ、できた HTML を調べる
//   ・**外から何も読み込まない**ことを確かめる（回線が死んでいても開ける＝ここが肝）
//   ・予定表／代車管理表／お客様／車両台帳／休日表／受付メモ の6つが出て、印刷の形になっているか
//   実行: node paper_test.js
//   ★本番の控えは読まない（お客様の実データを検査に使わないため）。
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);

const pad = n => String(n).padStart(2, '0');
const now = new Date();
const dk = (plus) => { const x = new Date(now); x.setDate(x.getDate() + plus); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
const lo = (s) => { const a = s.split('-'); return +a[0] + '-' + +a[1] + '-' + +a[2]; };
const TD = dk(0), D1 = dk(1), FAR = dk(46), OLD = dk(-30);

// ── にせの控え（毎朝の fb_backup.js が出すものと同じ形）──
const S = (o) => JSON.stringify(o);
const fake = {
  これは何: '検査用のにせの控え', 環境: 'テスト版', 接頭辞: 'hub-v8-dev-',
  作成日時: now.getTime(), 作成日時_表示: now.toLocaleString('ja-JP'), 項目数: 0,
  data: {
    'hub-v8-dev-insp': S({
      [TD]: [
        { name: '甲野一郎', carType: 'アルト', no: 1111, course: 2, store: 'honten', staff: '見取大介', phone: '090-0000-0001', time: '09:00', loaner: 'ハスラー青 (8178)', note: '' },
        { name: '乙野二郎', carType: 'ワゴンR', no: 2222, course: 1, store: 'sanda', staff: '岡上秀一', phone: '090-0000-0002', time: '10:00', note: '' }
      ],
      [FAR]: [{ name: '丙野三郎', carType: 'スペーシア', no: 3333, course: 3, store: 'honten', staff: '江川京志', phone: '090-0000-0003', time: '13:00', note: '遠い先の予約' }],
      [OLD]: [{ name: '古野四郎', carType: 'タント', no: 4444, course: 2, store: 'honten', staff: '江川京志', phone: '', time: '09:00', note: '' }]
    }),
    'hub-v8-dev-honten-sched': S({ [lo(TD)]: { '09:30': { name: '丁野五郎', staff: '見取大介', carType: 'プロボックス', work: 'Q', content: 'エンジンオイル交換', phone: '090-0000-0005' } } }),
    'hub-v8-dev-sanda-sched': S({ [lo(D1)]: { '14:00': { name: '戊野六郎', staff: '幸田', carType: 'ハスラー', work: '納', content: '納車', phone: '' } } }),
    'hub-v8-dev-honten-cars': S([{ id: 1, name: 'ハスラー青', num: '8178', store: 'honten' }, { id: 2, name: 'アルト白', num: '7033', store: 'honten' }]),
    'hub-v8-dev-sanda-cars': S([{ id: 11, name: 'スペーシア黄', num: '4750', store: 'sanda' }]),
    'hub-v8-dev-honten-lres': S({
      1: { [lo(TD)]: { id: 1, fy: +TD.slice(0, 4), fm: +TD.slice(5, 7), fd: +TD.slice(8, 10), ty: +D1.slice(0, 4), tm: +D1.slice(5, 7), td: +D1.slice(8, 10), user: '甲野一郎', carName: 'ハスラー青', carNum: '8178', bookingKey: 'insp-' + lo(TD) + '-0' } }
    }),
    'hub-v8-dev-sanda-lres': S({}),
    'hub-v8-dev-rentalcars': S([{ id: 'r1', name: 'レンタ・パール', num: '1741' }]),
    'hub-v8-dev-rres': S({ r1: { rr1: { id: 'rr1', carId: 'r1', user: '己野七郎', fy: +TD.slice(0, 4), fm: +TD.slice(5, 7), fd: +TD.slice(8, 10), ty: +TD.slice(0, 4), tm: +TD.slice(5, 7), td: +TD.slice(8, 10) } } }),
    'hub-v8-dev-honten-dayoff': S({ [lo(TD)]: ['岡上秀一'] }),
    'hub-v8-dev-honten-pleave': S({ [lo(TD)]: ['江川京志'], [lo(D1)]: ['江川京志'] }),
    'hub-v8-dev-sanda-dayoff': S({}), 'hub-v8-dev-sanda-pleave': S({}),
    'hub-v8-dev-honten-memo': S({ [lo(TD)]: [{ content: 'きょうの申し送り' }] }),
    'hub-v8-dev-sanda-memo': S({}),
    'hub-v8-dev-honten-staff-v2': S([{ uid: 'h1', name: '見取大介' }, { uid: 'h2', name: '岡上秀一' }, { uid: 'h7', name: '江川京志' }]),
    'hub-v8-dev-sanda-staff-v2': S([{ uid: 's1', name: '幸田' }]),
    'hub-v8-dev-honten-cdate': S(['2026-01-01']), 'hub-v8-dev-honten-cdow': S([]),
    'hub-v8-dev-sanda-cdate': S([]), 'hub-v8-dev-sanda-cdow-v2': S([3]),
    // 検索用の索引（細かい方が無い控えのための予備）
    'hub-v8-dev-cf-search-index': S({ built: now.getTime(), total: 3, chunks: 1, files: ['202611', '202612'] }),
    'hub-v8-dev-cf-search-chunk-0': S([
      { n: '庚野八郎', c: 'ヴォクシー', no: 604, p: '090-0000-0008', a: '三田市あ1-1', e: '2026-11-03', f: '202611' },
      { n: '辛野九郎', c: 'ソリオ', no: 9582, p: '090-0000-0009', a: '三田市い2-2', e: '2026-11-04', f: '202611' },
      { n: '壬野十郎', c: 'ワゴンR', no: 9556, p: '090-0000-0010', a: '神戸市う3-3', e: '2026-12-05', f: '202612' }
    ]),
    // 細かい方（1件の用紙はこちらを使う）
    'hub-v8-dev-cf-index': S([{ name: '202611', count: 2 }, { name: '202612', count: 2 }]),
    'hub-v8-dev-cf-202611-index': S({ name: '202611', total: 2, chunks: 1 }),
    'hub-v8-dev-cf-202611-chunk-0': S([
      { custId: '202611__1__庚野八郎__604', rowIdx: 1, expiry: '2026-11-03', name: '庚野八郎', no: 604, carType: 'ヴォクシー', phoneHome: '079-000-0008', phoneMobile: '090-0000-0008', address: '三田市あ1-1', dm1Date: '2026-08-01', dm1Book: '', dm2Date: '2026-08-20', dm2Book: '', entryDate: '', tokuten: '①', course: 2, store: 'honten', staff: '見取大介', note: '', status: 'confirm', bookingTime: '09:00', linkedInspDate: '' },
      { custId: '202611__2__辛野九郎__9582', rowIdx: 2, expiry: '2026-11-04', name: '辛野九郎', no: 9582, carType: 'ソリオ', phoneHome: '', phoneMobile: '090-0000-0009', address: '三田市い2-2', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-', course: null, store: '', staff: '', note: '乗換えの相談あり', status: 'none', bookingTime: '', linkedInspDate: '' }
    ]),
    'hub-v8-dev-cf-202612-index': S({ name: '202612', total: 2, chunks: 1 }),
    'hub-v8-dev-cf-202612-chunk-0': S([
      { custId: '202612__3__壬野十郎__9556', rowIdx: 3, expiry: '2026-12-05', name: '壬野十郎', no: 9556, carType: 'ワゴンR', phoneHome: '', phoneMobile: '090-0000-0010', address: '神戸市う3-3', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '-', course: null, store: 'sanda', staff: '幸田', note: '', status: 'temp', bookingTime: '', linkedInspDate: '' },
      { custId: '202612__4__甲野一郎__1111', rowIdx: 4, expiry: '2026-12-20', name: '甲野一郎', no: 1111, carType: 'アルト', phoneHome: '', phoneMobile: '090-0000-0001', address: '三田市え4-4', dm1Date: '', dm1Book: '', dm2Date: '', dm2Book: '', entryDate: '', tokuten: '②', course: 2, store: 'honten', staff: '見取大介', note: '', status: 'confirm', bookingTime: '09:00', linkedInspDate: TD }
    ]),
    'hub-v8-dev-vehicles-v2': S([
      { id: 'v1', group: 'factory', name: 'ハスラー青', num: '神戸582は8178', plate4: '8178', purpose: 'loaner', purposeRaw: '代車', store: 'honten', maker: 'スズキ', expiry: '2027-02-17', expiryRaw: 'R09.02.17', tire: 'summer', nav: 'MDV-L405', firstReg: '2022-02', inspections: { m6: { dueAt: '2026-12-18' } } },
      { id: 'v2', group: 'rental', name: 'レンタ・パール', num: '神戸505わ1741', plate4: '1741', purpose: 'rental', purposeRaw: 'レンタカー', store: 'honten', maker: 'スズキ', expiry: '2026-11-30', expiryRaw: 'R08.11.30', tire: 'winter' },
      { id: 'v3', group: 'factory', name: '消した車', num: '神戸000あ0000', purpose: 'other', archived: true }
    ]),
    'hub-v8-dev-mholidays': S({ [+TD.slice(0, 4) + '-' + +TD.slice(5, 7)]: 9 })
  }
};
fake.項目数 = Object.keys(fake.data).length;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-paper-'));
const SRCDIR = path.join(TMP, 'src'), OUTDIR = path.join(TMP, 'out');
fs.mkdirSync(SRCDIR); fs.mkdirSync(OUTDIR);
const srcFile = path.join(SRCDIR, 'hub-backup-dev-2026-01-01_000000.json');
fs.writeFileSync(srcFile, JSON.stringify(fake));

(async () => {
  head('道具を動かす');
  let out = '';
  try {
    out = cp.execFileSync(process.execPath, [path.join(__dirname, 'hub_paper.js'), '--dev', '--file', srcFile, '--out', OUTDIR, '--also', 'off'], { encoding: 'utf8' });
    t('hub_paper.js が最後まで走る', true);
  } catch (e) { t('hub_paper.js が最後まで走る', false, String(e.stdout || e.message)); }
  const made = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.html'));
  t('紙の控えが1個できる', made.length === 1, made);
  if (!made.length) { console.log(NL + '合計: ' + pass + ' 合格 / ' + fail + ' 不合格'); process.exit(1); }
  const file = path.join(OUTDIR, made[0]);
  const html = fs.readFileSync(file, 'utf8');

  head('外から何も読み込まないこと（回線が死んでいても開ける）');
  t('<link> で外を読まない', !/<link[^>]+href=["']?https?:/i.test(html));
  t('<script src> で外を読まない', !/<script[^>]+src=/i.test(html));
  t('<img> を使わない', !/<img/i.test(html));
  t('url( ) で外を読まない', !/url\(\s*["']?https?:/i.test(html));
  t('doctype と文字の決まりがある', /^<!doctype html>/i.test(html) && /charset=["']?utf-8/i.test(html));
  t('[hidden] が効くようにしてある', html.indexOf('[hidden]{display:none!important}') >= 0);
  t('印刷の紙が A4 で決まっている', /@page\{size:A4 portrait/.test(html) && /@page land\{size:A4 landscape/.test(html));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const outside = [];
  page.on('request', r => { if (!/^file:/.test(r.url())) outside.push(r.url()); });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await page.waitForTimeout(400);

  head('開いたときの様子');
  t('画面の中で止まっていない（JSのエラーなし）', errs.length === 0, errs);
  t('外へ1回も取りに行かない', outside.length === 0, outside);
  t('見出しが出る', (await page.innerText('body')).indexOf('紙の控え') >= 0);
  t('6つのタブがある', (await page.$$eval('.tb', a => a.length)) === 6);

  head('① 予定表');
  let txt = await page.innerText('#t1');
  t('きょうの日付の紙が出ている', txt.indexOf('車検（入庫予定）') >= 0 && txt.indexOf('整備（タイムスケジュール）') >= 0);
  t('車検の予約が名前で出る（様が付く）', txt.indexOf('甲野一郎 様') >= 0, txt.slice(0, 200));
  t('整備の予約が出る', txt.indexOf('丁野五郎 様') >= 0 && txt.indexOf('エンジンオイル交換') >= 0);
  t('三田店の予約が本店の紙に混ざらない', txt.indexOf('乙野二郎') < 0);
  t('代車の貸出が出る', txt.indexOf('ハスラー青') >= 0 && txt.indexOf('レンタ・パール') >= 0);
  t('空いている代車が出る', txt.indexOf('空いている代車') >= 0 && txt.indexOf('アルト白') >= 0);
  t('備考と休日が出る', txt.indexOf('きょうの申し送り') >= 0 && txt.indexOf('岡上秀一') >= 0);
  t('30日前の予約は入れない', (await page.$$eval('#days .day', a => a.map(x => x.getAttribute('data-dk')))).indexOf(OLD) < 0);
  t('遠い先の予約も選べる', (await page.$$eval('#days .day', a => a.map(x => x.getAttribute('data-dk')))).indexOf(FAR) >= 0);
  await page.selectOption('#dsel', FAR); await page.waitForTimeout(150);
  t('遠い先の日に切り替わる', (await page.innerText('#t1')).indexOf('丙野三郎 様') >= 0);
  await page.selectOption('#dsel', TD); await page.waitForTimeout(150);
  await page.click('#p2'); await page.waitForTimeout(150);
  t('「この日＋次の日」で紙が2枚になる', (await page.$$eval('#sheets .sheet', a => a.length)) === 2);
  await page.selectOption('#dstore', 'sanda'); await page.waitForTimeout(200);
  txt = await page.innerText('#t1');
  t('三田店に切り替えると三田店の予約が出る', txt.indexOf('乙野二郎 様') >= 0 || txt.indexOf('三田店') >= 0);
  await page.selectOption('#dsel', D1); await page.waitForTimeout(150);
  t('三田店の整備も出る', (await page.innerText('#t1')).indexOf('戊野六郎 様') >= 0);
  t('水曜が休業日として出る', (await page.$$eval('#days .day.closed', a => a.length)) > 0);

  head('② 代車管理表');
  await page.click('.tb[data-t="t2"]'); await page.waitForTimeout(250);
  t('代車管理表のタブが開く', !(await page.$eval('#t2', e => e.hidden)));
  t('月間の表が出る', (await page.$$eval('#t2 table.grid', a => a.length)) === 1);
  t('車が行になっている', (await page.$$eval('#t2 table.grid tbody tr', a => a.length)) === 2);
  t('貸出のマスが日数ぶんつながる', (await page.$$eval('#t2 td.on', a => a.map(x => x.getAttribute('colspan')))).some(x => +x >= 1));
  t('貸出先の名前がマスに出る', (await page.innerText('#t2')).indexOf('甲野一郎') >= 0);
  t('その月の貸出一覧も出る', (await page.innerText('#t2')).indexOf('貸出の一覧') >= 0 && (await page.innerText('#t2')).indexOf('もとの予約') >= 0);
  t('横置きで刷る印が付いている', (await page.$$eval('#t2 .sheet.land', a => a.length)) === 1);
  await page.selectOption('#lstore', 'rental'); await page.waitForTimeout(200);
  t('レンタカーに切り替わる', (await page.innerText('#t2')).indexOf('己野七郎') >= 0);

  head('③ お客様');
  await page.click('.tb[data-t="t3"]'); await page.waitForTimeout(250);
  txt = await page.innerText('#t3');
  t('お客様の一覧が出る', txt.indexOf('庚野八郎') >= 0 && txt.indexOf('壬野十郎') >= 0);
  t('細かい方から読めている（予約の状態・店が出る）', txt.indexOf('本予約') >= 0 && txt.indexOf('三田店') >= 0, txt.slice(0,200));
  t('件数が出る', txt.indexOf('全4件') >= 0, txt.slice(0, 120));
  t('車検満了の早い順に並ぶ', (await page.$$eval('#cout tbody tr td:first-child', a => a.map(x => x.innerText)))[0] === '2026-11-03');
  await page.selectOption('#cfile', '202612'); await page.waitForTimeout(200);
  txt = await page.innerText('#t3');
  t('満了の月でしぼれる', txt.indexOf('壬野十郎') >= 0 && txt.indexOf('甲野一郎') >= 0 && txt.indexOf('庚野八郎') < 0);
  await page.selectOption('#cfile', ''); await page.fill('#cq', '9582'); await page.waitForTimeout(200);
  txt = await page.innerText('#t3');
  t('ナンバーでさがせる', txt.indexOf('辛野九郎') >= 0 && txt.indexOf('庚野八郎') < 0);
  await page.fill('#cq', '三田市'); await page.waitForTimeout(200);
  t('住所でもさがせる', (await page.$$eval('#cout tbody tr', a => a.length)) === 3);
  await page.fill('#cq', '');

  head('③-2 お客様 1件だけの用紙（何千件の中から呼び出して1枚刷る）');
  await page.fill('#cq', '9556'); await page.waitForTimeout(200);
  t('1件にしぼれる', (await page.$$eval('#cout tbody tr', a => a.length)) === 1);
  await page.click('#cout tbody tr.pick1'); await page.waitForTimeout(200);
  txt = await page.innerText('#cout');
  t('その1件の用紙になる', txt.indexOf('壬野十郎 様') >= 0 && (await page.$$eval('#cout table.kv', a => a.length)) === 1);
  t('電話・住所が出る', txt.indexOf('090-0000-0010') >= 0 && txt.indexOf('神戸市う3-3') >= 0);
  t('車検満了と車が出る', txt.indexOf('2026-12-05') >= 0 && txt.indexOf('ワゴンR') >= 0);
  t('窓口メモの枠が出る', txt.indexOf('窓口メモ') >= 0);
  t('印刷のボタンが「この1件」に変わる', (await page.innerText('#p4')).indexOf('この1件') >= 0);
  t('1件の用紙は紙1枚ぶん（.sheet が1つ）', (await page.$$eval('#cout .sheet', a => a.length)) === 1);
  await page.click('#cback'); await page.waitForTimeout(200);
  t('一覧にもどれる', (await page.$$eval('#cout table.kv', a => a.length)) === 0 && (await page.$eval('#cback', e => e.hidden)));
  await page.fill('#cq', '甲野'); await page.waitForTimeout(200);
  await page.click('#cout tbody tr.pick1'); await page.waitForTimeout(200);
  txt = await page.innerText('#cout');
  t('その方の予定も用紙に出る', txt.indexOf('この方の予定') >= 0 && txt.indexOf('車検（クイック）') >= 0, txt.slice(0, 300));
  t('担当や代車も予定に出る', txt.indexOf('ハスラー青') >= 0 && txt.indexOf('見取大介') >= 0);
  await page.click('#cback'); await page.fill('#cq', ''); await page.waitForTimeout(150);

  head('④ 車両台帳');
  await page.click('.tb[data-t="t4"]'); await page.waitForTimeout(250);
  txt = await page.innerText('#t4');
  t('車両が出る', txt.indexOf('ハスラー青') >= 0 && txt.indexOf('神戸582は8178') >= 0);
  t('消した車は出さない', txt.indexOf('消した車') < 0);
  t('車検満了が元の書き方で出る', txt.indexOf('R09.02.17') >= 0);
  t('次の点検が出る', txt.indexOf('2026-12-18') >= 0);
  t('車検満了の早い順に並ぶ', (await page.$$eval('#vout tbody tr td:first-child', a => a.map(x => x.innerText)))[0] === 'R08.11.30');
  await page.selectOption('#vg', 'レンタカー'); await page.waitForTimeout(200);
  t('レンタカーだけにしぼれる', (await page.$$eval('#vout tbody tr', a => a.length)) === 1);
  await page.selectOption('#vg', '');

  head('⑤ 休日表');
  await page.click('.tb[data-t="t5"]'); await page.waitForTimeout(250);
  txt = await page.innerText('#t5');
  t('休日表が出る', txt.indexOf('スタッフ休日表') >= 0);
  t('スタッフが行になっている', (await page.$$eval('#oout tbody tr', a => a.length)) === 3);
  t('公休が「休」で出る', (await page.$$eval('#oout td.o', a => a.length)) === 1);
  t('有給が「有」で出る', (await page.$$eval('#oout td.y', a => a.length)) === 1);
  t('その月の公休日数が出る', txt.indexOf('公休日数は 9日') >= 0, txt.slice(0, 160));

  head('⑥ 受付メモ用紙');
  await page.click('.tb[data-t="t6"]'); await page.waitForTimeout(250);
  txt = await page.innerText('#t6');
  t('手書き用の紙が出る', txt.indexOf('オフライン受付メモ') >= 0);
  t('書く行がある', (await page.$$eval('#t6 table.blank tbody tr', a => a.length)) === 16);
  t('シュレッダーの注意が出る', txt.indexOf('シュレッダー') >= 0);

  head('印刷のとき');
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);
  t('選ぶところは印刷に出ない', (await page.$$eval('.noprint', a => a.every(x => getComputedStyle(x).display === 'none'))));
  t('いま見ていないタブは印刷に出ない', (await page.$eval('#t1', e => e.hidden)) && !(await page.$eval('#t6', e => e.hidden)));
  await page.emulateMedia({ media: 'screen' });

  head('古い写しのとき');
  const old = JSON.parse(JSON.stringify(fake));
  old.作成日時 = now.getTime() - 5 * 86400000;
  const f2 = path.join(SRCDIR, 'hub-backup-dev-2026-01-02_000000.json');
  fs.writeFileSync(f2, JSON.stringify(old));
  cp.execFileSync(process.execPath, [path.join(__dirname, 'hub_paper.js'), '--dev', '--file', f2, '--out', OUTDIR, '--also', 'off'], { encoding: 'utf8' });
  const made2 = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.html')).sort();
  const oldFile = path.join(OUTDIR, made2[0]);
  await page.goto('file:///' + oldFile.replace(/\\/g, '/'));
  await page.waitForTimeout(300);
  t('3日以上前の写しは赤く出る', (await page.innerText('#stamp')).indexOf('古いです') >= 0);

  await browser.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(NL + '合計: ' + pass + ' 合格 / ' + fail + ' 不合格');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
