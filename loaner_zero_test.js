// 代車管理とスケジュールを【ズレさせない】ための検査（v3.130.0・2026-11-25 ユーザー決定）
//   ユーザーの言葉：「代車を選んでいるのであれば、日にちを変えたとしても、ズレが出ないように。
//   常にズレは0件でないといけない」。
//   本番で実際に起きた形を、そのままの順番で再現して見張る：
//     ① 整備の日にちを変えると、代車の帯も一緒に動く（選び直さなくてよい）
//     ② 日にちを変えて代車を選び直しても、古い帯が元の日に残らない（★通信の遅れを真似て確かめる）
//     ③ 「↶ 戻す」は帯と一緒にカードの代車名も戻し、他の端末が足した貸出を消さない
//     ④ 判定：行番号がずれた所に別のお客様が入ってもズレに出さない／キャンセルの行を数えない／本物は見逃さない
//     ⑤ 他店の車を貸している予約を消すと、その店の代車表からも帯が外れる
//     ⑥ 作りの見張り（ファイルの中身）
//   ★お名前はすべて架空。Firestore にはつながない（fake_firebase.js）。
//   ★にせの firebase は書き込みが一瞬で終わるので、そのままでは【順番の入れ替わり】が出ない。
//     ②は runTransaction に遅れと衝突やり直しを足した版で動かす（LAG）。ここを外すと②は見張りにならない。
//   実行: node loaner_zero_test.js      （HTML=<別のファイル> で対象を差し替えられる）
const fs = require('fs'), path = require('path'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8539, STOR = 'hub-v8-dev-';
const HTML = process.env.HTML || 'index_dev.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

// ── にせの firebase（遅れつき）：runTransaction に 30〜250ms の遅れと、衝突した時のやり直しを足す
const FAKE_RAW = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const FAKE_LAG = (() => {
  const A = FAKE_RAW.indexOf('    runTransaction: async fn => {'), B = FAKE_RAW.indexOf('  }; };', A);
  if (A < 0 || B < 0) throw new Error('fake_firebase.js の形が変わった（runTransaction が見つからない）');
  const TX = [
    '    runTransaction: async fn => {',
    '      stats.txns++;',
    '      const lag = () => new Promise(r => setTimeout(r, 30 + Math.floor(Math.random() * 220)));',
    '      for (let n = 0; n < 8; n++) {',
    '        const reads = [], writes = [];',
    '        const t = { get: async ref => { stats.reads++; if (!canRead(ref.__col, ref.__id)) throw denied(); await lag(); reads.push([key(ref.__col, ref.__id), JSON.stringify(store[key(ref.__col, ref.__id)] || null)]); return snapOf(ref.__col, ref.__id); },',
    '                    set: (ref, d, opts) => { if (!canWrite(ref.__col, ref.__id)) throw denied(); writes.push([ref, d, opts]); } };',
    '        const r = await fn(t); await lag();',
    '        if (reads.every(([k, v]) => JSON.stringify(store[k] || null) === v)) { writes.forEach(([ref, d, opts]) => writeDoc(ref.__col, ref.__id, d, opts)); return r; }',
    '      }',
    '      throw new Error("tx retry over");',
    '    },',
  ].join(NL) + NL;
  return FAKE_RAW.slice(0, A) + TX + FAKE_RAW.slice(B);
})();

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
const baseSeed = () => ({
  [STOR + 'insp']: {}, [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, store: 'honten' }], [STOR + 'sanda-staff-v2']: [],
  [STOR + 'honten-cars']: CARS_H, [STOR + 'sanda-cars']: CARS_S, [STOR + 'rentalcars']: [],
  [STOR + 'honten-lres']: { '1': {}, '2': {} }, [STOR + 'sanda-lres']: { '9': {} }, [STOR + 'rres']: {},
});
const dk = o => `${o.y}-${o.m + 1}-${o.d}`;
const inp = o => o.y + '-' + String(o.m + 1).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
const band = (id, user, o, carName, carNum, bk, o2) => ({ id, user, fy: o.y, fm: o.m, fd: o.d, ty: (o2 || o).y, tm: (o2 || o).m, td: (o2 || o).d, color: '#059669', bookingKey: bk, carName, carNum });

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p === 'index_dev.html' ? HTML : p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, dd) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(dd); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  // 1場面＝1つの新しいブラウザ（にせの保存先は場面ごとにまっさら）
  const boot = async (seed, lag) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await ctx.addInitScript(signedInInit, [ME, STOR]);
    ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      const u = route.request().url();
      const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? (lag ? FAKE_LAG : FAKE_RAW) + extra : '' });
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
    const openRow = async (who) => {
      await page.evaluate(x => { const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(x) >= 0); if (!tr) return; const td = [...tr.querySelectorAll('td')].find(c => c.innerText.indexOf(x) >= 0); (td || tr).click(); }, who);
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
        const cell = [...grid.children].find(c => c.innerText.trim() === String(x)); if (!cell) return false; cell.click(); return true;
      }, day);
      await page.waitForTimeout(700); return ok;
    };
    const pickLoaner = async (o, carName, who) => {
      const toPick = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '選択' && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
      await page.waitForTimeout(2000);
      const pos = await page.evaluate(([num, cn]) => {
        const th = document.querySelector(`th[data-ldaynum="${num}"]`);
        const row = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(cn) === 0);
        if (!th || !row) return null;
        const a = th.getBoundingClientRect(), b = row.getBoundingClientRect();
        return { x: Math.round(a.left + a.width / 2), y: Math.round(b.top + b.height / 2) };
      }, [o.y * 10000 + (o.m + 1) * 100 + o.d, carName]);
      if (pos) { await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(800); }
      await page.evaluate(w => { const el = [...document.querySelectorAll('input')].find(e => e.offsetParent !== null && /利用者名/.test(e.placeholder || '')); if (el && !el.value) { el.focus(); el.value = w; el.dispatchEvent(new Event('input', { bubbles: true })); } }, who);
      await page.waitForTimeout(300);
      const conf = await clickText(page, '確定'); await page.waitForTimeout(1500);
      return toPick && !!pos && conf && await page.evaluate(() => /予約カード/.test(document.body.innerText));
    };
    const save = async (ms) => {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|内容を保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
      await page.waitForTimeout(ms || 3000);
    };
    const badge = async () => {
      await clickText(page, '代車管理'); await page.waitForTimeout(1800);
      return page.evaluate(() => { const m = document.body.innerText.match(/(⚠ スケジュールとズレ \d+件|✓ スケジュールと一致)/); return m ? m[1] : ''; });
    };
    const bands = async (key) => { const l = (await get(key)) || {}; const out = []; Object.keys(l).forEach(c => Object.values(l[c] || {}).forEach(r => { if (r) out.push({ car: c, ...r }); })); return out; };
    return { ctx, page, errs, alerts, get, goDay, openRow, pickDay, pickLoaner, save, badge, bands };
  };

  // ── 検査に使う日を決める（来月の中から、休業日でない日を3つ）。日付を決め打ちにしない。
  const now = new Date(); const NY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), NM = (now.getMonth() + 1) % 12;
  let DAYS = [];
  {
    const s = await boot(baseSeed(), false);
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
  const T1 = Date.now() - 300000;
  const WHO = '日替　移子';
  const row0 = (extra) => Object.assign({ name: WHO, staff: '江川京志', carType: 'タント', no: '', work: 'B', qkind: [], wkmon: '', loaner: 'ハスラー (7074)', loanerId: 1, rentalLabel: '', rentalCarId: null, bookingStatus: 'new', store: 'honten', rcvAt: T1, rcvBy: '江川京志', at: T1, id: T1 }, extra || {});

  // ────────────────────────────────────────────────────────
  head('① 整備の日にちを変えると、代車の帯も一緒に動く（選び直さない）');
  {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row0() } };
    // 2日貸し（B〜B+1日）にして、長さが保たれるかも見る
    const B2 = { y: B.y, m: B.m, d: B.d + 1 };
    seed[STOR + 'honten-lres'] = { '1': { k1: band(T1, WHO, B, 'ハスラー', '7074', 'sched-' + dk(B) + '-09:00', B2) }, '2': {} };
    const s = await boot(seed, true);
    await s.goDay(inp(B));
    t('予約カードが開く', await s.openRow(WHO));
    t('日にちを変えられる', await s.pickDay(C.d));
    t('★日にちを変えても、カードに今の代車が出たまま', await s.page.evaluate(() => [...document.querySelectorAll('input')].some(e => e.offsetParent !== null && /ハスラー \(7074\)/.test(e.value || ''))));
    t('★「一緒に移ります」の案内が出る', await s.page.evaluate(() => !!document.querySelector('[data-loanerfollow]')));
    await s.save(7000);
    const sched = (await s.get(STOR + 'honten-sched')) || {};
    const r = ((sched[dk(C)] || {})['09:00']) || {};
    const bs = await s.bands(STOR + 'honten-lres');
    t('予約は新しい日に移る', r.name === WHO && !((sched[dk(B)] || {})['09:00']), { r: r.name });
    t('★行の代車名はそのまま', r.loaner === 'ハスラー (7074)' && String(r.loanerId) === '1', { loaner: r.loaner, id: r.loanerId });
    t('★帯は1本だけ（増えない）', bs.length === 1, bs.map(x => x.bookingKey));
    t('★同じ帯が動いた（id がそのまま）', bs[0] && bs[0].id === T1, bs[0] && bs[0].id);
    t('★帯の日にちが新しい日になる', bs[0] && bs[0].fd === C.d && bs[0].fm === C.m, bs[0] && [bs[0].fm + 1, bs[0].fd]);
    t('★貸出の長さが変わらない（2日のまま）', bs[0] && (bs[0].td - bs[0].fd === 1 || bs[0].tm !== bs[0].fm), bs[0] && [bs[0].fd, bs[0].td]);
    t('★帯の紐付けが新しい日・同じ枠', bs[0] && bs[0].bookingKey === 'sched-' + dk(C) + '-09:00', bs[0] && bs[0].bookingKey);
    t('★代車管理は「スケジュールと一致」', (await s.badge()) === '✓ スケジュールと一致');
    t('画面のエラーなし', s.errs.length === 0, s.errs.slice(0, 2));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('①-2 移した先でその車がふさがっていたら、保存そのものを止める');
  {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row0() } };
    seed[STOR + 'honten-lres'] = { '1': { k1: band(T1, WHO, B, 'ハスラー', '7074', 'sched-' + dk(B) + '-09:00'), k2: band(777, '先客　有子', C, 'ハスラー', '7074', '') }, '2': {} };
    const s = await boot(seed, false);
    await s.goDay(inp(B)); await s.openRow(WHO); await s.pickDay(C.d); await s.save(2500);
    const sched = (await s.get(STOR + 'honten-sched')) || {};
    t('★「日にちを変えられません」と出る', s.alerts.some(a => /日にちを変えられません/.test(a)), s.alerts.slice(0, 2).map(a => a.slice(0, 40)));
    t('★予約は元の日のまま（1文字も書かない）', ((sched[dk(B)] || {})['09:00'] || {}).name === WHO && !((sched[dk(C)] || {})['09:00']));
    const bs = await s.bands(STOR + 'honten-lres');
    t('★帯も元のまま', bs.length === 2 && bs.some(x => x.id === T1 && x.fd === B.d));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('② 日にちを変えて代車を選び直しても、古い帯が元の日に残らない（通信の遅れつき×4回）');
  for (let n = 1; n <= 4; n++) {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row0() } };
    seed[STOR + 'honten-lres'] = { '1': { k1: band(T1, WHO, B, 'ハスラー', '7074', 'sched-' + dk(B) + '-09:00') }, '2': {} };
    const s = await boot(seed, true);
    await s.goDay(inp(B)); await s.openRow(WHO); await s.pickDay(C.d);
    const picked = await s.pickLoaner(C, 'スペーシア', WHO);       // 別の車に選び直す
    await s.save(9000);
    const sched = (await s.get(STOR + 'honten-sched')) || {};
    const r = ((sched[dk(C)] || {})['09:00']) || {};
    const bs = await s.bands(STOR + 'honten-lres');
    t(n + '回目：選び直せた', picked);
    t(n + '回目：★帯は1本だけ（古い帯が残らない）', bs.length === 1, bs.map(x => x.car + ':' + x.fd + ':' + x.bookingKey));
    t(n + '回目：★残った帯は選び直した車・新しい日', bs[0] && String(bs[0].car) === '2' && bs[0].fd === C.d && bs[0].bookingKey === 'sched-' + dk(C) + '-09:00', bs[0] && [bs[0].car, bs[0].fd, bs[0].bookingKey]);
    t(n + '回目：★行の代車名も選び直した車', r.loaner === 'スペーシア (8967)', { loaner: r.loaner });
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('③ 「↶ 戻す」：帯と一緒にカードの代車名も戻す／他の端末が足した貸出を消さない');
  {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row0() } };
    seed[STOR + 'honten-lres'] = { '1': { k1: band(T1, WHO, B, 'ハスラー', '7074', 'sched-' + dk(B) + '-09:00') }, '2': {} };
    const s = await boot(seed, false);
    await s.goDay(inp(B));
    await clickText(s.page, '代車管理'); await s.page.waitForTimeout(1800);
    const clicked = await s.page.evaluate(() => { const cell = [...document.querySelectorAll('div')].find(e => /日替/.test(e.innerText || '') && e.offsetParent !== null && e.getBoundingClientRect().height < 60); if (!cell) return false; cell.click(); return true; });
    await s.page.waitForTimeout(800);
    const delOk = await s.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /🗑 削除/.test(e.innerText) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; });
    await s.page.waitForTimeout(2500);
    let r = (((await s.get(STOR + 'honten-sched')) || {})[dk(B)] || {})['09:00'] || {};
    t('帯を消せた（カードの代車名も消える）', clicked && delOk && !r.loaner && (await s.bands(STOR + 'honten-lres')).length === 0, { clicked, delOk, loaner: r.loaner });
    // ここで「別の端末」が別の車に貸出を足した、という場面
    await s.page.evaluate(([k, C]) => { const l = window.__fakeFb.get(k) || {}; l['2'] = { ...(l['2'] || {}), x9: { id: 9009, user: '他端末　足子', fy: C.y, fm: C.m, fd: C.d, ty: C.y, tm: C.m, td: C.d, carName: 'スペーシア', carNum: '8967' } }; window.__fakeFb.set(k, l); }, [STOR + 'honten-lres', C]);
    await s.page.waitForTimeout(1500);
    t('「↶ 戻す」を押せた', await clickText(s.page, '↶ 戻す'));
    await s.page.waitForTimeout(3000);
    r = (((await s.get(STOR + 'honten-sched')) || {})[dk(B)] || {})['09:00'] || {};
    const bs = await s.bands(STOR + 'honten-lres');
    t('★帯が戻る（同じ帯）', bs.some(x => x.id === T1 && String(x.car) === '1'), bs.map(x => x.id));
    t('★カードの代車名も戻る', r.loaner === 'ハスラー (7074)' && String(r.loanerId) === '1', { loaner: r.loaner, id: r.loanerId });
    t('★★他の端末が足した貸出は消えない', bs.some(x => x.id === 9009), bs.map(x => x.user));
    t('★代車管理は「スケジュールと一致」', await s.page.evaluate(() => /✓ スケジュールと一致/.test(document.body.innerText)));
    t('画面のエラーなし', s.errs.length === 0, s.errs.slice(0, 2));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('④ 判定：見かけのズレを出さない／本物は見逃さない');
  {
    const seed = baseSeed();
    seed[STOR + 'insp'] = {
      // 帯は「行0」を指しているが、本人は 行3。行0 には【別のお客様】が入っている（本番 2027/1/9 と同じ形）
      [dk(B)]: [
        { name: '別人　太郎', carType: 'ラパン', no: '8892', time: '09:00', course: 2, store: 'sanda', seq: 5, bookingStatus: 'confirmed', loaner: '', loanerId: null },
        { name: '二番　次郎', carType: 'アルト', no: '1', time: '09:00', course: 2, store: 'honten', seq: 2, bookingStatus: 'confirmed', loaner: '', loanerId: null },
        { name: '三番　三郎', carType: 'アルト', no: '2', time: '10:00', course: 1, store: 'honten', seq: 3, bookingStatus: 'confirmed', loaner: '', loanerId: null },
        { name: '本人　四子', carType: 'シビック', no: '', time: '09:00', course: 2, store: 'sanda', seq: 4, bookingStatus: 'confirmed', loaner: 'アルト (123)', loanerId: 9 },
      ],
      // キャンセルの帯の行（代車名は記録として残る・貸出は外れている）
      [dk(C)]: [
        { name: '取消　済子', carType: 'スペーシア', no: '1101', time: '09:00', course: 2, store: 'sanda', seq: 6, bookingStatus: 'cancelled', loaner: 'ハスラー (7074)', loanerId: 1, cxAt: '2026-11-19', cxBy: '江川京志', cxFrom: dk(C), cxTo: '' },
      ],
    };
    seed[STOR + 'sanda-lres'] = { '9': { k1: band(5001, '本人　四子', B, 'アルト', '123', 'insp-' + dk(B) + '-0') } };
    const s = await boot(seed, false);
    t('★行番号がずれた所に別人がいても／キャンセルの行があっても「スケジュールと一致」', (await s.badge()) === '✓ スケジュールと一致', await s.page.evaluate(() => (document.body.innerText.match(/スケジュールと[^\n]{0,12}/) || [''])[0]));
    await s.ctx.close();
    // 本物のズレ（カードに代車名・帯なし）は今までどおり1件出る
    const seed2 = baseSeed();
    seed2[STOR + 'insp'] = { [dk(B)]: [{ name: '本物　ずれ子', carType: 'アルト', no: '3', time: '09:00', course: 2, store: 'honten', seq: 1, bookingStatus: 'confirmed', loaner: 'ハスラー (7074)', loanerId: 1 }] };
    const s2 = await boot(seed2, false);
    t('★本物のズレ（カードに代車名・貸出なし）は見逃さない', (await s2.badge()) === '⚠ スケジュールとズレ 1件');
    await s2.ctx.close();
    // キャンセルされた予約に帯だけ残っている＝「貸出だけ残る」として出す
    const seed3 = baseSeed();
    seed3[STOR + 'insp'] = { [dk(C)]: [{ name: '取消　済子', carType: 'スペーシア', no: '1101', time: '09:00', course: 2, store: 'honten', seq: 6, bookingStatus: 'cancelled', loaner: 'ハスラー (7074)', loanerId: 1, cxAt: '2026-11-19', cxBy: '江川京志', cxFrom: dk(C), cxTo: '' }] };
    seed3[STOR + 'honten-lres'] = { '1': { k1: band(5002, '取消　済子', C, 'ハスラー', '7074', 'insp-' + dk(C) + '-0') }, '2': {} };
    const s3 = await boot(seed3, false);
    t('★キャンセルした予約に貸出だけ残っていれば知らせる', (await s3.badge()) === '⚠ スケジュールとズレ 1件');
    await s3.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('⑤ 他店の車を貸している予約を消すと、その店の代車表からも帯が外れる');
  {
    const seed = baseSeed();
    seed[STOR + 'honten-sched'] = { [dk(B)]: { '09:00': row0({ loaner: 'アルト (123)', loanerId: 9 }) } };
    // 帯は三田店の代車表にある。三田店の 09:00 には【別のお客様】が同じ鍵で帯を持っている（外してはいけない）
    seed[STOR + 'sanda-sched'] = { [dk(B)]: { '09:00': { name: '三田　別子', carType: 'ミラ', work: 'B', loaner: 'アルト (123)', loanerId: 9, store: 'sanda', at: 5, id: 5 } } };
    seed[STOR + 'sanda-cars'] = [{ id: 9, name: 'アルト', num: '123' }, { id: 10, name: 'ワゴンR', num: '456' }];
    seed[STOR + 'sanda-lres'] = { '10': { k1: band(T1, WHO, B, 'ワゴンR', '456', 'sched-' + dk(B) + '-09:00') }, '9': { k2: band(6002, '三田　別子', B, 'アルト', '123', 'sched-' + dk(B) + '-09:00') } };
    const s = await boot(seed, true);
    await s.goDay(inp(B));
    t('予約カードが開く', await s.openRow(WHO));
    await clickText(s.page, '🗑 削除'); await s.page.waitForTimeout(6000);
    const sched = (await s.get(STOR + 'honten-sched')) || {};
    const bs = await s.bands(STOR + 'sanda-lres');
    t('予約が消える', !((sched[dk(B)] || {})['09:00']), s.alerts.slice(0, 1).map(a => a.slice(0, 30)));
    t('★三田店の代車表から、この予約の帯が外れる', !bs.some(x => x.id === T1), bs.map(x => x.user));
    t('★★同じ鍵を持つ【別のお客様】の帯は残る', bs.some(x => x.id === 6002), bs.map(x => x.user));
    await s.ctx.close();
  }

  // ────────────────────────────────────────────────────────
  head('⑥ 作りの見張り（ファイルの中身）');
  {
    const SRC = fs.readFileSync(path.join(DIR, HTML), 'utf8');
    const MOB = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
    //   （説明のコメントに同じ字が出てくるので、後ろの「,back=>」まで見て本物の呼び出しだけを数える）
    t('★代車表を丸ごと書き戻す形が無い（()=>snap）', SRC.indexOf('persistLres(()=>snap,back=>') < 0 && SRC.indexOf('persistLres(()=>newLoanerRes,back=>') < 0 && SRC.indexOf('persistRres(()=>next,back=>') < 0);
    t('★「↶ 戻す」は差分で覚える（prevState を使わない）', SRC.indexOf('prevState:loanerRes') < 0 && SRC.indexOf('prevRental:rentalResData') < 0 && SRC.indexOf("resApplyDiff(base,e.diff,'before')") > 0);
    t('★戻す先がふさがっていたら戻さない', SRC.indexOf("resDiffClash(cur,e.diff,'before')") > 0);
    t('★整備の入庫制限は、帯を書く【前】に見る', SRC.indexOf('カードは開いたまま・代車の帯も書かない') > 0 && SRC.indexOf('カードは開いたまま・代車の帯も書かない') < SRC.indexOf('const _hadLoanerForBk=!!pendingLoanerData;'));
    t('★選び直した帯は、古い帯と同じ1回の書き込みで入れ替える', SRC.indexOf('removeResByBkUser(base,[_lu.bk,_pldBk,..._luRef.extra],_rmNames,_luRec.id)') > 0);
    t('★整備の帯の鍵は、実際に置いた枠に合わせる', SRC.indexOf('_luRef.lu.bk=_scNewBk; _luRef.rec.bookingKey=_scNewBk;') > 0);
    t('★予約の削除は両店の代車表を見る', /\['honten','sanda'\]\.forEach\(_st=>\{\s*if\(_st!==vsId&&!_resNm\(_bkName\)\)return;/.test(SRC));
    t('★同じ予約の帯が残っていれば、カードの代車名を消さない', SRC.indexOf('if(still)return;') > 0);
    t('★判定：車検も氏名を確かめる（PC）', SRC.indexOf("if(live(row)&&(!who||row.name===who))return {kind:'insp'") > 0);
    t('★判定：キャンセルの行を数えない（PC）', /const rev=\(dk,at,row,kind\)=>\{[\s\S]{0,400}if\(row\.bookingStatus==='cancelled'\)return;/.test(SRC));
    t('★判定：車検も氏名を確かめる（スマホ）', MOB.indexOf("if(live(row)&&(!who||row.name===who))return{kind:'insp'") > 0);
    t('★判定：キャンセルの行を数えない（スマホ）', /const rev=\(dk,at,row,kind\)=>\{[\s\S]{0,300}if\(row\.bookingStatus==='cancelled'\)return;/.test(MOB));
    t('★スマホ：日にちを変えても貸出の長さを保つ', MOB.indexOf('いまの貸出の【長さ】を保ったまま動かす') > 0);
    t('★スマホ：予約の削除は両店の代車表を見る', MOB.indexOf("const othKey=storKey('lres',vsId==='honten'?'sanda':'honten');") > 0);
  }

  await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log(fail ? ('✖ 失敗 ' + fail + ' / 成功 ' + pass) : ('✅ PASS  成功 ' + pass + ' / 失敗 0'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
