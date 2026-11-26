// 予約を消した時に【別の予約の帯】を外さないかの検査（v3.134.4・2026-11-26・本番の現場報告）
//   起きたこと：同じ日に同じお名前の予約が2件あり、レンタカーの付いていない古い方を消したら、
//   もう1件のレンタカーの帯が外れた（カードに車名は残り、代車管理から帯だけ消えた）。
//   見張る形：
//     ① 車の無い予約を消しても、同じ日・同じお名前の別の予約の帯は残る
//        （帯の鍵が別の枠を指している時＝氏名でさがす保険／消した予約の枠と同じ字の時、の両方）
//        レンタカーと代車の両方で見る。車を持っている方を消した時は、今までどおり帯が外れる。
//     ② 今までどおり外れるもの：鍵がずれた帯（その予約が車を持っている）／鍵がぴったりの帯
//     ③ 他店の【別のお客様】が同じ鍵でレンタカーの帯を持っていても外さない
//     ④ 新しく入れたレンタカーの帯の鍵は【実際に置いた枠】を指す（先客の枠を指さない）
//        → そのあと先客を消しても帯が残る（本番で起きた順番そのまま）
//     ⑤ 作りの見張り（ファイルの中身。スマホも）
//   ★お名前はすべて架空。Firestore にはつながない（fake_firebase.js）。日付は決め打ちにしない。
//   実行: node delete_other_band_test.js      （HTML=<別のファイル> で対象を差し替えられる）
const fs = require('fs'), path = require('path'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8543, STOR = 'hub-v8-dev-';
const HTML = process.env.HTML || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);
const FAKE_RAW = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');

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
const CARS_H = [{ id: 1, name: 'ハスラー', num: '7074' }, { id: 2, name: 'スペーシア', num: '8967' }];
const CARS_S = [{ id: 9, name: 'アルト', num: '123' }];
const RENT = [{ id: 'r1', name: 'スペカス', num: '8971' }, { id: 'r2', name: 'ライズ', num: '3928' }];
const baseSeed = () => ({
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }], [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: CARS_H, [STOR + 'sanda-cars']: CARS_S, [STOR + 'rentalcars']: RENT,
  [STOR + 'honten-lres']: { '1': {}, '2': {} }, [STOR + 'sanda-lres']: { '9': {} }, [STOR + 'rres']: { r1: {}, r2: {} },
});
const dk = o => `${o.y}-${o.m + 1}-${o.d}`;
const inp = o => o.y + '-' + String(o.m + 1).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
const lband = (id, user, o, carName, carNum, bk) => ({ id, user, fy: o.y, fm: o.m, fd: o.d, ty: o.y, tm: o.m, td: o.d, color: '#059669', bookingKey: bk, carName, carNum });
// レンタカーの帯は車名を持たない形もある（スマホで作った帯）。本番と同じく持たせない。
const rband = (id, user, o, bk) => ({ id, user, fy: o.y, fm: o.m, fd: o.d, ty: o.y, tm: o.m, td: o.d, color: '#2563eb', bookingKey: bk });
const T1 = Date.now() - 300000;
const SAME = '同名　太郎', OTHER = '別人　花子';
const row = (name, carType, extra) => Object.assign({ name, staff: '江川京志', carType, no: '', work: 'B', qkind: [], wkmon: '', loaner: '', loanerId: null, rentalLabel: '', rentalCarId: null, bookingStatus: 'new', store: 'honten', rcvAt: T1, rcvBy: '江川京志', at: T1, id: T1 }, extra || {});
const R1 = { rentalLabel: '🔑 スペカス (8971)', rentalCarId: 'r1' };
const R2 = { rentalLabel: '🔑 ライズ (3928)', rentalCarId: 'r2' };
const L1 = { loaner: 'ハスラー (7074)', loanerId: 1 };

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p === 'index_dev.html' ? HTML : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const boot = async (seed) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await ctx.addInitScript(signedInInit, [ME, STOR]);
    ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_RAW + extra : '' });
    });
    ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const alerts = []; page.on('dialog', async dd => { alerts.push(dd.message()); await dd.accept().catch(() => {}); });
    await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 25000);
    await page.waitForTimeout(1200);
    const get = k => page.evaluate(x => JSON.parse(JSON.stringify(window.__fakeFb.get(x) || null)), k);
    const goDay = async (v) => {
      const want = v.slice(0, 7);
      await page.evaluate(() => { const b = [...document.querySelectorAll('[data-datepick]')].find(e => e.offsetParent !== null); if (b) b.click(); });
      await page.waitForTimeout(250);
      for (let i = 0; i < 40; i++) {
        const cur = await page.evaluate(() => { const e = document.querySelector('[data-mon]'); return e ? e.getAttribute('data-mon') : null; });
        if (!cur || cur === want) break;
        await page.click(cur < want ? '[data-mnav="next"]' : '[data-mnav="prev"]'); await page.waitForTimeout(90);
      }
      const day = await page.$('[data-day="' + v + '"]'); if (!day) return false;
      await day.click(); await page.waitForTimeout(600); return true;
    };
    // 同じお名前が2件並ぶので、車種の字で行を選ぶ（押すのはお名前のマス）
    const openRow = async (carText, who) => {
      await page.evaluate(([c, w]) => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(c) >= 0 && r.innerText.indexOf(w) >= 0); if (!tr) return; const td = [...tr.querySelectorAll('td')].find(x => x.innerText.indexOf(w) >= 0); (td || tr).click(); }, [carText, who]);
      await page.waitForTimeout(1000);
      return seeText(page, '予約カード', 6000);
    };
    const del = async () => { const ok = await clickText(page, '🗑 削除'); await page.waitForTimeout(3500); return ok; };
    const bands = async (key) => { const l = (await get(key)) || {}; const out = []; Object.keys(l).forEach(c => Object.values(l[c] || {}).forEach(r => { if (r) out.push({ car: c, ...r }); })); return out; };
    return { ctx, page, errs, alerts, get, goDay, openRow, del, bands };
  };

  // ── 検査に使う日を決める（来月の中から、休業日でない日を3つ）
  const now = new Date(); const NY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), NM = (now.getMonth() + 1) % 12;
  let DAYS = [];
  {
    const s = await boot(baseSeed());
    for (const d of [15, 16, 17, 18, 19, 20, 21, 22, 24, 25]) {
      const o = { y: NY, m: NM, d };
      if (!(await s.goDay(inp(o)))) continue;
      if (await s.page.evaluate(() => /店休日（全員休み）|休業日/.test(document.body.innerText))) continue;
      DAYS.push(o); if (DAYS.length >= 3) break;
    }
    await s.ctx.close();
  }
  head('⓪ 検査に使う日');
  t('休業日でない日を3つ選べた', DAYS.length === 3, DAYS.map(dk));
  if (DAYS.length < 3) { await browser.close(); server.close(); process.exit(1); }
  const [B, C, D] = DAYS;
  const sk = (o, slot) => 'sched-' + dk(o) + '-' + slot;

  // ────────────────────────────────────────────────────────
  head('① 車の無い予約を消しても、同じ日・同じお名前の別の予約の帯は残る');
  {
    // 日B：レンタカー・帯の鍵は【新しい方の枠】（鍵が合わない時の保険の道）
    // 日C：代車・帯の鍵が【消す方の枠と同じ字】（鍵がぴったりの道）
    // 日D：レンタカー・帯の鍵が【消す方の枠と同じ字】（本番で起きたと見られる形）
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = {
      [dk(B)]: { '未定': row(SAME, '旧ソリオ'), '未定__1': row(SAME, '新ソリオ', R1) },
      [dk(C)]: { '09:00': row(SAME, '旧ワゴン'), '09:00__1': row(SAME, '新ワゴン', L1) },
      [dk(D)]: { '未定': row(SAME, '旧タント'), '未定__1': row(SAME, '新タント', R2) },
    };
    seed[STOR + 'rres'] = { r1: { '7001': rband(7001, SAME, B, sk(B, '未定__1')) }, r2: { '7003': rband(7003, SAME, D, sk(D, '未定')) } };
    seed[STOR + 'honten-lres'] = { '1': { k1: lband(7002, SAME, C, 'ハスラー', '7074', sk(C, '09:00')) }, '2': {} };
    const s = await boot(seed);

    await s.goDay(inp(B));
    t('日B：車の無い古い予約のカードが開く', await s.openRow('旧ソリオ', SAME));
    t('日B：削除できる', await s.del());
    let sc = (await s.get(STOR + 'honten-sched')) || {};
    t('日B：古い予約だけ消える', !(sc[dk(B)] || {})['未定'] && !!(sc[dk(B)] || {})['未定__1'], Object.keys(sc[dk(B)] || {}));
    t('★★日B：もう1件のレンタカーの帯は残る（氏名でさがす保険が働かない）', (await s.bands(STOR + 'rres')).some(x => x.id === 7001), await s.bands(STOR + 'rres'));

    await s.goDay(inp(C));
    t('日C：車の無い古い予約のカードが開く', await s.openRow('旧ワゴン', SAME));
    t('日C：削除できる', await s.del());
    sc = (await s.get(STOR + 'honten-sched')) || {};
    t('日C：古い予約だけ消える', !(sc[dk(C)] || {})['09:00'] && !!(sc[dk(C)] || {})['09:00__1'], Object.keys(sc[dk(C)] || {}));
    t('★★日C：鍵が同じ字でも、もう1件の代車の帯は残る', (await s.bands(STOR + 'honten-lres')).some(x => x.id === 7002), await s.bands(STOR + 'honten-lres'));

    await s.goDay(inp(D));
    t('日D：車の無い古い予約のカードが開く', await s.openRow('旧タント', SAME));
    t('日D：削除できる', await s.del());
    t('★★日D：鍵が同じ字でも、もう1件のレンタカーの帯は残る', (await s.bands(STOR + 'rres')).some(x => x.id === 7003), await s.bands(STOR + 'rres'));

    // 車を持っている方を消した時は、今までどおり帯が外れる
    await s.goDay(inp(B));
    t('日B：レンタカーつきの予約のカードが開く', await s.openRow('新ソリオ', SAME));
    await s.del();
    t('★日B：車を持っている予約を消せば、その帯は外れる', !(await s.bands(STOR + 'rres')).some(x => x.id === 7001), await s.bands(STOR + 'rres'));
    await s.goDay(inp(C));
    t('日C：代車つきの予約のカードが開く', await s.openRow('新ワゴン', SAME));
    await s.del();
    t('★日C：車を持っている予約を消せば、その帯は外れる（鍵は別の枠の字）', !(await s.bands(STOR + 'honten-lres')).some(x => x.id === 7002), await s.bands(STOR + 'honten-lres'));
    t('画面のエラーなし', s.errs.length === 0, s.errs.slice(0, 2));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('② 今までどおり外れるもの ／ ③ 他店の別のお客様の帯は外さない');
  {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = {
      // 鍵がずれたレンタカーの帯（その予約が車を持っている＝保険で外す）
      [dk(B)]: { '13:00': row(SAME, 'ずれソリオ', R1) },
      // 鍵がぴったりの代車の帯／車を持たない予約（他店に同じ鍵の帯がある）
      [dk(C)]: { '09:00': row(SAME, 'ぴったりワゴン', L1), '11:00': row(SAME, '車なしミラ') },
      // カードの車名が空（ズレ）でも、鍵がぴったりで他に持ち主がいなければ外す＝帯だけ残さない
      [dk(D)]: { '10:00': row(SAME, '空欄タント') },
    };
    seed[STOR + 'sanda-sched'] = { [dk(C)]: { '11:00': row(OTHER, '三田アルト', Object.assign({ store: 'sanda' }, R2)) } };
    seed[STOR + 'rres'] = {
      r1: { '8001': rband(8001, SAME, B, sk(B, '午前')), '8004': rband(8004, SAME, D, sk(D, '10:00')) },
      r2: { '8003': rband(8003, OTHER, C, sk(C, '11:00')) },
    };
    seed[STOR + 'honten-lres'] = { '1': { k1: lband(8002, SAME, C, 'ハスラー', '7074', sk(C, '09:00')) }, '2': {} };
    const s = await boot(seed);

    await s.goDay(inp(B));
    t('日B：カードが開く', await s.openRow('ずれソリオ', SAME));
    await s.del();
    t('★鍵がずれていても、車を持っている予約の帯は外れる（2026-11-17 の守りを保つ）', !(await s.bands(STOR + 'rres')).some(x => x.id === 8001), await s.bands(STOR + 'rres'));

    await s.goDay(inp(C));
    t('日C：代車つきのカードが開く', await s.openRow('ぴったりワゴン', SAME));
    await s.del();
    t('★鍵がぴったりの代車の帯は外れる', !(await s.bands(STOR + 'honten-lres')).some(x => x.id === 8002), await s.bands(STOR + 'honten-lres'));
    t('日C：車なしのカードが開く', await s.openRow('車なしミラ', SAME));
    await s.del();
    t('★★他店の【別のお客様】が同じ鍵で持つレンタカーの帯は残る', (await s.bands(STOR + 'rres')).some(x => x.id === 8003), await s.bands(STOR + 'rres'));

    await s.goDay(inp(D));
    t('日D：カードが開く', await s.openRow('空欄タント', SAME));
    await s.del();
    t('★カードの車名が空でも、鍵がぴったりで他に持ち主がいない帯は外れる（帯だけ残さない）', !(await s.bands(STOR + 'rres')).some(x => x.id === 8004), await s.bands(STOR + 'rres'));
    t('画面のエラーなし', s.errs.length === 0, s.errs.slice(0, 2));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('④ 新しく入れたレンタカーの帯の鍵は【実際に置いた枠】を指す → 先客を消しても残る');
  {
    // 09:00 に同じお名前の先客（車なし）。そこへレンタカーつきの予約を新しく入れる＝09:00__1 に置かれる
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row(SAME, '先客ソリオ') } };
    const s = await boot(seed);
    const page = s.page;
    await s.goDay(inp(B));
    await clickText(page, '▲ 畳む'); await page.waitForTimeout(600);
    t('「＋ 予定を追加」でカードが開く', (await clickText(page, '＋ 予定を追加')) && await seeText(page, '一般予約カード', 8000));
    await page.waitForTimeout(900);
    // お名前・車種
    await page.evaluate(([w]) => {
      const box = document.querySelector('.booking-modal-inner');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const inps = [...box.querySelectorAll('input')];
      setter.call(inps[0], w); inps[0].dispatchEvent(new Event('input', { bubbles: true }));
      const car = inps[2] || inps[1];
      if (car) { setter.call(car, '新規ソリオ'); car.dispatchEvent(new Event('input', { bubbles: true })); }
    }, [SAME]);
    // 作業
    await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const el = document.querySelector('[data-wkid="他"]') || document.querySelector('[data-wkid]'); if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(400);
    // 時間＝09:00（先客がいる時間）
    await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); const d = b && b.querySelector('[data-kbkey="slot"]'); if (d) d.click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const el = document.querySelector('[data-slotid="09:00"]'); if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(400);
    // レンタカーを選ぶ（ピッカーのレンタカーの表・その日の列）
    const toPick = await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = [...box.querySelectorAll('button')].find(e => e.innerText.trim() === '選択' && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
    await page.waitForTimeout(2000);
    const pos = await page.evaluate(([num, cn]) => {
      const th = document.querySelector('th[data-rdaynum="' + num + '"]');
      if (!th) return null;
      const tb = th.closest('table');
      const tr = [...tb.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(cn) >= 0);
      if (!tr) return null;
      tr.scrollIntoView({ block: 'center' });
      const a = th.getBoundingClientRect(), b = tr.getBoundingClientRect();
      return { x: Math.round(a.left + a.width / 2), y: Math.round(b.top + b.height / 2) };
    }, [B.y * 10000 + (B.m + 1) * 100 + B.d, 'スペカス']);
    if (pos) { await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(800); }
    await page.evaluate(w => { const el = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /利用者名/.test(e.placeholder || '')); if (el && !el.value) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, w); el.dispatchEvent(new Event('input', { bubbles: true })); } }, SAME);
    await page.waitForTimeout(300);
    const conf = await clickText(page, '確定'); await page.waitForTimeout(1500);
    t('レンタカーを選べた（検査の前提）', toPick && !!pos && conf && await page.evaluate(() => { const b = document.querySelector('.booking-modal-inner'); return !!b && [...b.querySelectorAll('input')].some(e => /スペカス/.test(e.value || '')) || /スペカス/.test((b && b.innerText) || ''); }), { toPick, pos, conf });
    await page.evaluate(() => { const box = document.querySelector('.booking-modal-inner'); const b = box && [...box.querySelectorAll('button')].find(x => /予約確定|内容を保存|確定して登録/.test(x.innerText) && x.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(4000);
    const day = ((await s.get(STOR + 'honten-sched')) || {})[dk(B)] || {};
    const newSlot = Object.keys(day).find(k => day[k] && day[k].carType === '新規ソリオ');
    t('新しい予約は 09:00__1 に置かれる（先客は 09:00 のまま）', newSlot === '09:00__1' && !!day['09:00'] && day['09:00'].carType === '先客ソリオ', { slots: Object.keys(day), alerts: s.alerts.slice(0, 2) });
    t('新しい予約のカードにレンタカー名が入る', !!newSlot && /スペカス/.test(day[newSlot].rentalLabel || ''), newSlot && day[newSlot]);
    let bs = await s.bands(STOR + 'rres');
    t('レンタカーの帯が1本できる', bs.length === 1, bs);
    t('★★帯の鍵は【実際に置いた枠】（09:00__1）を指す', bs.length === 1 && bs[0].bookingKey === sk(B, '09:00__1'), bs.map(x => x.bookingKey));
    // 本番で起きた順番：このあと先客（車なし）を消す
    await clickText(page, '▼'); await page.waitForTimeout(300);
    const opened = await s.openRow('先客ソリオ', SAME);
    t('先客のカードが開く', opened);
    await s.del();
    const day2 = ((await s.get(STOR + 'honten-sched')) || {})[dk(B)] || {};
    t('先客だけ消える', !day2['09:00'] && !!day2['09:00__1'], Object.keys(day2));
    bs = await s.bands(STOR + 'rres');
    t('★★先客を消しても、新しい予約のレンタカーの帯は残る', bs.length === 1 && bs[0].user === SAME, bs);
    t('画面のエラーなし', s.errs.length === 0, s.errs.slice(0, 2));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('⑤ 作りの見張り（ファイルの中身）');
  {
    const SRC = fs.readFileSync(path.join(DIR, HTML), 'utf8');
    const MOB = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
    const delBody = SRC.slice(SRC.indexOf('const handleDeleteModal=useCallback('), SRC.indexOf('const handleDeleteModal=useCallback(') + 9000);
    t('★PC：削除は帯を1本ずつ見て決める（resPickForDelete）', delBody.indexOf('resPickForDelete(base,bk,_bkName,_pkL(_st))') > 0 && delBody.indexOf('resPickForDelete(base,bk,_bkName,_pkR)') > 0);
    t('★PC：鍵だけで外す形（resBksForBooking＋removeResByBk）に戻っていない', delBody.indexOf('resBksForBooking(') < 0 && delBody.indexOf('removeResByBk(base,_bks)') < 0);
    t('★PC：保険は「消した予約が車を持っていた時だけ」', SRC.indexOf('if (!opt.hadCar) return [];') > 0 && delBody.indexOf("hadCar:!!(_delRow&&String((kind==='rental'?_delRow.rentalLabel:_delRow.loaner)||'').trim())") > 0);
    t('★PC：同じ日・同じお名前の別の予約は、車検と両店の整備から集める', delBody.indexOf("[['honten',schedDataH],['sanda',schedDataS]].forEach") > 0 && delBody.indexOf('(inspData[modalDk]||[]).forEach') > 0);
    t('★PC：依存配列に両店の整備と車の一覧を足してある（古い値を掴まない）', /inspLimits,schedDataH,schedDataS,dynLoanerListH,dynLoanerListS,dynRentalCars\]\);/.test(SRC));
    t('★PC：レンタカーの帯の鍵を実際に置いた枠に合わせる', SRC.indexOf('_rrRef.rec.bookingKey=_scNewBk;') > 0 && SRC.indexOf('_rrRef.rm=modalIsNew?[_scNewBk]:[_scOldBk,_scNewBk];') > 0);
    t('★PC：レンタカーの古い帯は氏名の合うものだけ外す', SRC.indexOf('putResRec(removeResByBkUser(base,_rrRef.rm,_rmNames),_rCar,String(_rRec.id),_rRec)') > 0 && SRC.indexOf('putResRec(removeResByBk(base,[_rBk]),_rCar') < 0);
    const mdel = MOB.slice(MOB.indexOf('const deleteCore=async(req)=>{'), MOB.indexOf('const handleDelete=useCallback('));
    t('★スマホ：保険は「消した予約が車を持っていた時だけ」', mdel.indexOf('else if(hadCar&&u&&who&&String(r.bookingKey).indexOf(dayPre)===0)near.push([cid,k,r]);') > 0);
    t('★スマホ：同じお名前の別の予約の帯は外さない', mdel.indexOf('if(r.bookingKey===bk){ if(!notMine(cid,r))exact.push([cid,k]); }') > 0 && mdel.indexOf('delSame.some(o=>rowHolds(o,kind,cid,r,cars))') > 0);
    t('★スマホ：代車・他店の代車・レンタカーで別々に決める', mdel.indexOf("targetsOf('rental',rentalCars)") > 0 && mdel.indexOf("targetsOf('loaner',vsId==='honten'?loanerCarsS:loanerCarsH)") > 0);
  }

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log(fail ? ('✖ 失敗 ' + fail + ' / 成功 ' + pass) : ('✅ PASS  成功 ' + pass + ' / 失敗 0'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
