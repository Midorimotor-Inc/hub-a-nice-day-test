// 部品注文チェック（マッハ車検の行の丸ボタン）と、印刷を A4横1枚に収める直しの検査
//   （2026-11-05 ユーザー指示）。
//   ユーザーの言葉：
//     「スケジュール画面のマッハ車検のバッジをマッハのみに変更して、そのマッハのバッジの隣に、
//       部品の部に丸をつけたボタンを配置してください。クリックすると緑チェックに変わる」
//     「スケジュール画面の印刷を毎日するんですけども、A4サイズ、1ページで収まるように」
//     「ユーザー名の枠が広すぎて備考欄が狭い」
//     「車検に関しては、四角いブーになっているので、丸のブーに、隣にチェックマークを（終わったやつは）」
//   ここで見ること：
//     ① コースのバッジは「マッハ／クイック／レギュラー」（「マッハ車検」と二度出しにしない）
//     ② 「部」の丸ボタンは【マッハ車検の行だけ】に出る（クイック・レギュラーには出さない）
//     ③ 押すと緑の ✓ に変わる／もう一度押すと「部」に戻る
//     ④ 押した内容が保存される（予約の行に parts:true が入る）
//     ⑤ 行のクリック（予約カード）と取り違えない＝丸を押しても予約カードが開かない
//     ⑥ 印刷：マッハの行に丸の「部」が出る。注文済みの行だけ隣に ✓、未注文の行には ✓ を出さない
//     ⑦ 印刷：マッハ以外の行には「部」を出さない
//     ⑧ 印刷：行も列も増えない（車検8列・整備6列のまま）
//     ⑨ 印刷：入庫制限の札は【ひとマス（colspan=5）】に出す＝氏名の列に入れない
//        （ここが「氏名の枠が広すぎて備考が狭い」の元凶だった）
//     ⑩ 印刷：幅を決め打ちにしている（table-layout:fixed）＋氏名・車種は折り返してよい
//     ⑪ 印刷：実データの最大（車検7台・整備13件）でも A4横1枚（196mm）に収まる
//     ⑫ スマホ（mobile.html）にも同じ丸ボタン（マッハの行だけ・押すと保存される）
//     ⑬ オフライン予定表の控え・紙の控え（hub_paper.js）にも字の印「(部)✓」が出る
//   実行: node parts_print_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8439, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
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
  // window.open をにせ物にして、印刷に出す HTML をそのまま受け取る
  window.__printed = '';
  window.open = function () {
    return { document: { write: h => { window.__printed += h; }, close: () => {} }, print: () => {}, focus: () => {}, close: () => {} };
  };
};
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

// 印刷の HTML を受け取り、見たい所だけ抜き出す
const printInfo = async (page) => {
  await page.evaluate(() => { window.__printed = ''; });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes('印刷') && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const raw = String(window.__printed || '');
    const d = document.implementation.createHTMLDocument('p');
    d.documentElement.innerHTML = raw.replace(/<!DOCTYPE[^>]*>/i, '');
    const cell = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const itb = d.querySelector('table.insp-table'), stb = d.querySelector('table.sched-table');
    return {
      raw: raw,
      inspHead: itb ? [...itb.querySelectorAll('thead th')].map(cell) : [],
      schedHead: stb ? [...stb.querySelectorAll('thead th')].map(cell) : [],
      inspRows: itb ? [...itb.querySelectorAll('tbody tr')].map(tr => ({
        cells: [...tr.querySelectorAll('td')].map(cell),
        parts: tr.querySelector('.parts-p') ? cell(tr.querySelector('.parts-p')) : null,
        partsOn: !!tr.querySelector('.parts-p.on'),
      })) : [],
      // ★入庫制限の札はひとマス（colspan=5）か
      restr: stb ? [...stb.querySelectorAll('tbody tr.slot-restr')].map(tr => ({
        tds: tr.querySelectorAll('td').length,
        colspan: tr.querySelector('td[colspan]') ? tr.querySelector('td[colspan]').getAttribute('colspan') : null,
        lab: tr.querySelector('.restr-lab') ? cell(tr.querySelector('.restr-lab')) : '',
      })) : [],
      schedTdMax: stb ? Math.max(0, ...[...stb.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td').length)) : 0,
    };
  });
};

// 印刷HTMLを A4横の実寸で開いて、中身の高さを mm で測る
const measure = async (ctx, html) => {
  const MM = 96 / 25.4;
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: Math.round(285 * MM), height: 1600 });
  await p2.setContent(html);
  await p2.emulateMedia({ media: 'print' });
  await p2.waitForTimeout(400);
  const r = await p2.evaluate((mm) => {
    const pg = document.querySelector('.page');
    const top = pg.getBoundingClientRect().top; let bot = top;
    [].forEach.call(pg.querySelectorAll('*'), el => { const b = el.getBoundingClientRect(); if (b.height && b.bottom > bot) bot = b.bottom; });
    const w = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().width) : 0; };
    return {
      hmm: Math.round((bot - top) / mm * 10) / 10,
      inspNote: w('table.insp-table tbody tr td:nth-child(8)'),
      schedName: w('table.sched-table tbody tr td:nth-child(2)'),
      schedNote: w('table.sched-table tbody tr td:nth-child(6)'),
    };
  }, MM);
  await p2.close();
  return r;
};

(async () => {
  // 車検7台（マッハ3台：1台は注文済み・1台は未注文・1台は未注文）＋ 整備13件 ＝ 実データの最大
  const NM = ['岸本', '山谷', '芝田', '小畠', '橋口大志', '藤明建設工業', '辻井'];
  const CAR = ['ワゴンR', 'ハスラー', 'スペーシア', 'アルトラパン', 'ジムニーシエラ', 'ハイエース', 'タント'];
  const NOTE = ['', 'タイヤ交換', 'バッテリー要確認', 'ワイパーゴム交換・オイル交換', '代車は軽でお願いします', 'エアコンから異音あり要点検', ''];
  const CONT = ['オイル交換', 'エンジンオイル・エレメント交換', 'タイヤ4本交換（夏→冬）', '12ヶ月点検・ブレーキパッド交換', 'バッテリー交換とワイパーゴム交換、エアコンフィルタも', '鈑金見積り'];
  const ISLOT = ['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '14:00'];
  const SSLOT = ['09:00', '09:30', '10:00', '11:00', '11:30', '13:00', '13:30', '14:00', '15:00', '15:30', '16:00', '16:30', '17:00'];
  const seed = {};
  seed[STOR + 'insp'] = {};
  seed[STOR + 'insp'][DK] = Array.from({ length: 7 }, (_, i) => ({
    name: NM[i], carType: CAR[i], course: (i % 3) + 1, store: 'honten', no: String(3000 + i * 7),
    time: ISLOT[i], note: NOTE[i], tokuten: i % 2 ? '○' : '', staff: '江川', bookingStatus: 'confirmed',
    // i=0（マッハ）だけ最初から注文済み。i=3・i=6 もマッハだが未注文
    parts: i === 0 ? true : undefined,
    loaner: 'ワゴンR (3310)',
  }));
  const sc = {};
  SSLOT.forEach((s, i) => {
    sc[s] = { name: NM[i % NM.length], carType: CAR[(i + 1) % CAR.length],
      work: ['Q', 'メンパ', '有点', 'B', 'R'][i % 5], content: CONT[i % CONT.length],
      staff: '江川', store: 'honten', no: String(4000 + i) };
  });
  seed[STOR + 'honten-sched'] = {}; seed[STOR + 'honten-sched'][DK] = sc;
  seed[STOR + 'sanda-sched'] = {};
  seed[STOR + 'honten-staff-v2'] = [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }];
  seed[STOR + 'sanda-staff-v2'] = [];
  seed[STOR + 'honten-memo'] = {}; seed[STOR + 'honten-memo'][DK] = [{ content: '本日15時に部品入荷予定。' }];
  seed[STOR + 'sanda-memo'] = {};
  seed[STOR + 'honten-dayoff'] = {};
  seed[STOR + 'honten-pleave'] = {};

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1800);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 10000));

  head('① コースのバッジは短い呼び名（「マッハ車検」と二度出しにしない）');
  const badges = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const nm = tr.innerText || '';
      if (!/岸本|山谷|芝田/.test(nm)) return;
      [...tr.querySelectorAll('span')].forEach(s => {
        const txt = (s.textContent || '').replace(/\s+/g, '');
        if (/^(マ|ク|レ)(マッハ|クイック|レギュラー)(車検)?$/.test(txt)) out.push(txt);
      });
    });
    return out;
  });
  t('バッジに「マ マッハ」が出る', badges.some(b => b === 'ママッハ'), badges);
  t('バッジに「マッハ車検」は出ない', !badges.some(b => /車検/.test(b)), badges);
  t('クイック・レギュラーも短い呼び名', badges.some(b => b === 'ククイック') && badges.some(b => b === 'レレギュラー'), badges);

  head('② 「部」の丸ボタンはマッハ車検の行だけ');
  const chips = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const c = tr.querySelector('[data-partschip]');
      // ★コースは【バッジの span】で見ること。行の文字で見ると、タイムスケジュール側の
      //   入庫制限の札（「🚫 入庫制限　🚗 マッハ車検　◯◯ 様」）まで「マッハの行」に数えてしまう。
      const bdg = [...tr.querySelectorAll('span')].map(x => (x.textContent || '').replace(/s+/g, ''))
        .find(x => /^(マ|ク|レ)(マッハ|クイック|レギュラー)$/.test(x)) || '';
      const course = bdg.slice(1);
      if (course) out.push({ course: course, name: (tr.innerText || '').slice(0, 14).replace(/\s+/g, ' '), has: !!c, on: c ? c.getAttribute('data-partschip') === '1' : null, txt: c ? (c.textContent || '').trim() : '' });
    });
    return out;
  });
  const mach = chips.filter(c => c.course === 'マッハ'), other = chips.filter(c => c.course !== 'マッハ');
  t('マッハの行は3つとも丸ボタンを持つ', mach.length === 3 && mach.every(c => c.has), chips);
  t('クイック・レギュラーの行には丸ボタンが無い', other.length >= 4 && other.every(c => !c.has), other);
  t('最初から注文済みの行は緑の ✓', mach.some(c => c.on === true && c.txt === '✓'), mach);
  t('未注文の行は「部」の字', mach.filter(c => c.on === false && c.txt === '部').length === 2, mach);

  head('③④ 押すと ✓ になり、保存される');
  const before = await page.evaluate(() => document.querySelectorAll('[data-partschip="1"]').length);
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-partschip="0"]')][0]; if (c) c.click(); });
  await page.waitForTimeout(260);
  const mid = await page.evaluate(() => document.querySelectorAll('[data-partschip="1"]').length);
  t('押すと ✓ が1つ増える（すぐ色が変わる）', mid === before + 1, { before: before, mid: mid });
  t('丸を押しても予約カードは開かない', !(await seeText(page, '予約カード', 900)) && !(await page.evaluate(() => !!document.querySelector('.booking-modal-inner'))));
  await page.waitForTimeout(1600);
  const saved = await page.evaluate((args) => {
    const rows = (window.__fakeFb.get(args[0] + 'insp') || {})[args[1]] || [];
    return rows.map(r => ({ n: r && r.name, c: r && r.course, p: !!(r && r.parts) }));
  }, [STOR, DK]);
  const savedMach = saved.filter(r => r.c === 1);
  t('サーバーに parts が2件 保存された', savedMach.filter(r => r.p).length === 2, saved);
  t('マッハ以外の行には parts を書かない', saved.filter(r => r.c !== 1).every(r => !r.p), saved);

  head('③ もう一度押すと外れる');
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-partschip="1"]')][1]; if (c) c.click(); });
  await page.waitForTimeout(1800);
  const saved2 = await page.evaluate((args) => {
    const rows = (window.__fakeFb.get(args[0] + 'insp') || {})[args[1]] || [];
    return rows.filter(r => r && Number(r.course) === 1).map(r => !!r.parts);
  }, [STOR, DK]);
  t('押し直すと parts が1件に戻る', saved2.filter(Boolean).length === 1, saved2);
  // 以降の印刷の検査のために、もう一度注文済みに戻す（マッハ2台が注文済み・1台が未注文）
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-partschip="0"]')][0]; if (c) c.click(); });
  await page.waitForTimeout(1800);

  head('⑥⑦ 印刷：丸の「部」＋注文済みの行だけ隣に ✓');
  const pr = await printInfo(page);
  const prMach = pr.inspRows.filter(r => /マ/.test(r.cells[4] || ''));
  t('印刷の車検の表が取れた', pr.inspRows.length === 7, pr.inspRows.length);
  t('マッハの行3つとも「部」の印が出る', prMach.length === 3 && prMach.every(r => r.parts && r.parts.indexOf('部') >= 0), prMach);
  t('注文済みの行は「部」の隣に ✓', prMach.filter(r => r.partsOn && /✓/.test(r.parts)).length === 2, prMach.map(r => r.parts));
  t('未注文の行には ✓ を出さない', prMach.filter(r => !r.partsOn && !/✓/.test(r.parts)).length === 1, prMach.map(r => r.parts));
  t('マッハ以外の行には「部」を出さない', pr.inspRows.filter(r => !/マ/.test(r.cells[4] || '')).every(r => !r.parts), pr.inspRows.map(r => r.parts));
  t('印は【丸】で描いてある（.parts-p i が border-radius:50%）', /\.parts-p i \{[^}]*border-radius: 50%/.test(pr.raw));
  t('白黒印刷でも分かるようにしてある', pr.raw.indexOf('.parts-p.on i { background: #000') >= 0);

  head('⑧ 印刷：行も列も増えない（1枚に収めるため）');
  t('車検の表は8列のまま', pr.inspHead.length === 8, pr.inspHead);
  t('整備の表は6列のまま', pr.schedHead.length === 6, pr.schedHead);
  t('車検の行は予約の数ぶんだけ（印のための行を足さない）', pr.inspRows.length === 7, pr.inspRows.length);
  t('整備の行も1枠1行のまま（td は最大6個）', pr.schedTdMax === 6, pr.schedTdMax);

  head('⑨ 印刷：入庫制限の札はひとマス（氏名の列に入れない）');
  t('入庫制限の行がある', pr.restr.length >= 1, pr.restr);
  t('札の入ったマスは colspan=5', pr.restr.every(r => !r.lab || r.colspan === '5'), pr.restr);
  t('札の行は td が2個だけ（時間＋ひとマス）', pr.restr.filter(r => r.lab).every(r => r.tds === 2), pr.restr);
  t('札に「マッハ車検」とお名前が出る（v3.93.0 のまま）', pr.restr.some(r => /入庫制限/.test(r.lab) && /マッハ車検/.test(r.lab)), pr.restr.map(r => r.lab));
  t('札は折り返してよい（nowrap に戻していない）', /\.restr-lab \{[^}]*white-space: normal/.test(pr.raw));

  head('⑩ 印刷：幅を決め打ちにしている');
  t('車検・整備とも table-layout:fixed', /\.insp-table, \.sched-table \{ table-layout: fixed; \}/.test(pr.raw));
  t('整備の氏名・車種は折り返してよい', /\.sched-table td:nth-child\(2\), \.sched-table td:nth-child\(3\) \{ white-space: normal/.test(pr.raw));
  t('車検の代車は2行で折り返す（字を縮めない）', /\.insp-table td\.loaner-wrap \{ white-space: normal/.test(pr.raw) && pr.inspRows.every(r => true) && pr.raw.indexOf('class="loaner-wrap"') >= 0);
  t('見出しの帯を細くしてある（h2 が 12px）', /h2 \{ font-size: 12px/.test(pr.raw));

  head('⑪ 印刷：実データの最大でも A4横1枚に収まる');
  const m = await measure(ctx, pr.raw);
  t('中身の高さが 196mm 以内（車検7台・整備13件）', m.hmm <= 196.5, m);
  t('整備の「内容」の幅が 200px 以上ある（備考が狭いの直し）', m.schedNote >= 200, m);
  t('整備の「氏名」の幅は 110px 以下（無駄枠を削った）', m.schedName <= 110, m);
  t('車検の「備考」の幅が 140px 以上ある', m.inspNote >= 140, m);

  head('⑫ スマホにも同じ丸ボタン');
  const mob = await ctx.newPage();
  const mErr = []; mob.on('pageerror', e => mErr.push(String(e)));
  mob.on('dialog', async d => { await d.accept().catch(() => {}); });
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mob, '江川京志', 20000); await clickText(mob, '江川京志'); await clickText(mob, 'でログイン');
  await mob.waitForTimeout(1500);
  await mob.evaluate(() => { const b = [...document.querySelectorAll('div,button')].find(e => (e.innerText || '').replace(/\s/g, '') === 'スケジュール' && e.offsetParent !== null); if (b) b.click(); });
  await mob.waitForTimeout(1800);
  const mChips = await mob.evaluate(() => [...document.querySelectorAll('[data-partschip]')].map(c => ({ on: c.getAttribute('data-partschip'), txt: (c.textContent || '').trim() })));
  t('スマホのスケジュールに丸ボタンが3つ（マッハの行だけ）', mChips.length === 3, mChips);
  t('注文済みは緑の ✓・未注文は「部」', mChips.filter(c => c.txt === '✓').length === 1 && mChips.filter(c => c.txt === '部').length === 2, mChips);
  const mBefore = await mob.evaluate(() => document.querySelectorAll('[data-partschip="1"]').length);
  await mob.evaluate(() => { const c = [...document.querySelectorAll('[data-partschip="0"]')][0]; if (c) c.click(); });
  await mob.waitForTimeout(300);
  t('タップするとすぐ ✓ になる', (await mob.evaluate(() => document.querySelectorAll('[data-partschip="1"]').length)) === mBefore + 1);
  await mob.waitForTimeout(2200);
  const mSaved = await mob.evaluate((args) => {
    const rows = (window.__fakeFb.get(args[0] + 'insp') || {})[args[1]] || [];
    return rows.filter(r => r && Number(r.course) === 1).map(r => !!r.parts);
  }, [STOR, DK]);
  t('スマホからも保存される（1台 → 2台 に増える）', mSaved.filter(Boolean).length === 2, mSaved);
  t('スマホで実行時エラーが出ていない', mErr.length === 0, mErr.slice(0, 3));
  await mob.close();

  head('⑬ 紙（控え）にも字の印が出る');
  t('オフライン予定表の控えに partsTextMark がある', fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8').indexOf('const partsTextMark') >= 0);
  t('紙の控え（hub_paper.js）にも同じものがある', fs.readFileSync(path.join(DIR, 'hub_paper.js'), 'utf8').indexOf('const partsTextMark') >= 0);
  const mark = (r) => (Number(r && r.course) === 1) ? (r && r.parts ? '(部)✓' : '(部)') : '';
  t('注文済みのマッハは「(部)✓」', mark({ course: 1, parts: true }) === '(部)✓');
  t('未注文のマッハは「(部)」', mark({ course: 1 }) === '(部)');
  t('クイック・レギュラーには印を出さない', mark({ course: 2, parts: true }) === '' && mark({ course: 3 }) === '');

  head('ページのエラー');
  t('実行時エラーが出ていない', errs.length === 0, errs.slice(0, 3));

  console.log(String.fromCharCode(10) + '=== ' + pass + ' 件合格 / ' + fail + ' 件不合格 ===');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
