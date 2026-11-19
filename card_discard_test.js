// 予約カードを「保存しないで閉じた」時に、打ちかけを持ち越さないかの検査（v3.125.1・2026-11-19 現場報告）
//   報告：「姓だけの所にフルネームを入れて、保存しないで画面を消したのに、保存されています」。
//   実際はサーバーには1文字も書かれていなかったが、カードを開き直すと打ちかけがそのまま出ていた
//   ＝保存できたように見える（そのまま保存を押すと本当に書かれる）。
//   ★ただし「消してはいけない場面」が2つある。両方とも見張ること：
//     ② 代車・レンタカーを選びに行って戻った時（カードは一度閉じている）
//     ③ 入庫制限で弾かれた時の開き直し
//   実行: node card_discard_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8521, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 15000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const seed = {
  [STOR + 'insp']: { [DK]: [
    { name: '速水', carType: 'スペーシア', no: '8833', course: 1, time: '09:00', store: 'honten', seq: 1, id: 1 },
    { name: '日野 次郎', carType: 'タント', no: '1234', phone: '090-2222-3333', course: 2, time: '13:00', store: 'honten', seq: 2, id: 2 },
  ] },
  [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
  // ★入庫制限：09:00〜11:00（解除は無し）＝③で弾かれる時に使う
  'honten-schedRestrictions': { [DK]: { ranges: [{ startTime: '09:00', endTime: '11:00' }], exemptWorks: [] } },
};

// カードの中を読む
const cardInfo = page => page.evaluate(() => {
  const box = document.querySelector('.booking-modal-inner');
  const g = ph => { const e = [...document.querySelectorAll('input')].find(x => (x.placeholder || '') === ph); return e ? e.value : null; };
  const pl = document.querySelector('[data-plate]');
  return { open: !!(box && box.offsetParent !== null), name: g('お客様名'), car: g('例：プリウス'),
    plate: pl ? pl.value : null, phone: g('090-0000-0000') };
});
const setPh = (page, ph, v) => page.evaluate(([p, x]) => {
  const el = [...document.querySelectorAll('input')].find(e => (e.placeholder || '') === p && e.offsetParent !== null);
  if (!el) return false;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
}, [ph, v]);
const setSel = (page, sel, v) => page.evaluate(([s, x]) => {
  const el = document.querySelector(s); if (!el) return false;
  const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  st.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
}, [sel, v]);
const openCard = async (page, nm) => {
  await page.evaluate(x => {
    const tr = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(x) >= 0 && r.offsetParent !== null);
    if (!tr) return false;
    const td = [...tr.querySelectorAll('td')].find(c => (c.innerText || '').indexOf(x) >= 0);
    (td || tr).click(); return true;
  }, nm);
  await page.waitForTimeout(1300);
};
const closeCard = async page => {
  await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const b = [...box.querySelectorAll('button')].find(e => e.offsetParent !== null && e.querySelector('svg') && Math.round(e.getBoundingClientRect().width) === 32);
    if (b) { b.click(); return true; }
    const c = [...box.querySelectorAll('button')].find(e => e.innerText.trim() === 'キャンセル'); if (c) { c.click(); return true; }
    return false;
  });
  await page.waitForTimeout(1200);
};
const savedName = (page, nm) => page.evaluate(([k, x]) => {
  const d = window.__fakeFb.get(k) || {};
  for (const dk in d) for (const r of (d[dk] || [])) if (r && r.name === x) return JSON.parse(JSON.stringify(r));
  return null;
}, [STOR + 'insp', nm]);

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => {
    const u = r.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const alerts = []; page.on('dialog', async d => { alerts.push(String(d.message())); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(2000);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 12000));

  // ══ ① 保存しないで閉じたら、打ちかけは残らない ══════════════
  head('① 保存しないで閉じたら、打ちかけは残らない（現場報告の本体）');
  await openCard(page, '速水');
  let c = await cardInfo(page);
  t('カードが開く', c.open, c);
  t('保存されている姓だけが出ている', c.name === '速水', c);
  await setPh(page, 'お客様名', '速水 俊之');
  await setSel(page, '[data-plate]', '姫路 300 あ 1111');
  await setPh(page, '090-0000-0000', '090-9999-8888');
  await page.waitForTimeout(400);
  c = await cardInfo(page);
  t('打った字は画面に出る', c.name === '速水 俊之' && /姫路/.test(c.plate || ''), c);
  await closeCard(page);
  t('カードが閉じた', !(await cardInfo(page)).open);
  t('★★サーバーには書かれていない（姓だけのまま）', !!(await savedName(page, '速水')) && !(await savedName(page, '速水 俊之')));
  const row = await page.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf('速水') >= 0 && r.offsetParent !== null); return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null; });
  t('表の行も元のまま（ナンバー 8833）', /8833/.test(row || '') && !/姫路/.test(row || ''), row);
  await openCard(page, '速水');
  c = await cardInfo(page);
  t('★★開き直すと【保存されている中身】に戻っている（お名前）', c.name === '速水', c);
  t('★★ナンバーも元の4桁に戻っている', c.plate === '8833', c);
  t('★★電話も元のまま（空）', !c.phone, c);
  await closeCard(page);

  // ══ ② 別の予約を開いた時に、前の打ちかけが混ざらない ══════════
  head('② 別の予約を開いた時に、前の打ちかけが混ざらない');
  await openCard(page, '速水');
  await setPh(page, 'お客様名', 'まざらない 太郎');
  await page.waitForTimeout(300);
  await closeCard(page);
  await openCard(page, '日野');
  c = await cardInfo(page);
  t('★日野さんのカードには日野さんの名前が出る', c.name === '日野 次郎', c);
  t('★電話もその人のもの', /2222/.test(c.phone || ''), c);
  await closeCard(page);

  // ══ ③ 代車を選びに行って戻った時は、打ちかけが残る ══════════
  head('③ ★代車を選びに行って戻った時は、打ちかけを消してはいけない');
  await openCard(page, '速水');
  await setPh(page, 'お客様名', '代車 行太郎');
  await setPh(page, '例：プリウス', 'ハスラー');
  await page.waitForTimeout(300);
  const wentPicker = await page.evaluate(() => {
    const box = document.querySelector('.booking-modal-inner'); if (!box) return false;
    const b = [...box.querySelectorAll('button')].find(e => e.innerText.trim() === '選択' && e.offsetParent !== null);
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(1500);
  t('代車管理（選ぶ画面）へ移った', wentPicker && await page.evaluate(() => !document.querySelector('.booking-modal-inner')), wentPicker);
  await clickText(page, "予約カードに戻る");
  await page.waitForTimeout(1500);
  c = await cardInfo(page);
  t('★カードが戻ってくる', c.open, c);
  t('★★打ちかけのお名前が残っている', c.name === '代車 行太郎', c);
  t('★★打ちかけの車種も残っている', c.car === 'ハスラー', c);
  await closeCard(page);
  t('閉じたあと開き直すと、やはり元に戻っている', (await (async () => { await openCard(page, '速水'); const x = await cardInfo(page); await closeCard(page); return x; })()).name === '速水');

  // ══ ④ 入庫制限で弾かれた時も、打ちかけが残る ══════════════
  head('④ ★入庫制限で弾かれた時も、打ちかけを消してはいけない');
  alerts.length = 0;
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('10:00') === 0);
    if (!row) return false;
    const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
    (inner || row).click(); return true;
  });
  await page.waitForTimeout(1000);
  await setPh(page, 'お客様名', 'せいび 太郎');
  await setPh(page, '例：プリウス', 'ワゴンR');
  await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').includes('クイック'));
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(2000);
  t('「入庫制限中です」と断られる', alerts.some(a => /入庫制限中/.test(a)), alerts);
  c = await cardInfo(page);
  t('★カードは開いたまま', c.open, c);
  t('★★打った名前が消えていない', c.name === 'せいび 太郎', c);
  t('★★打った車種も消えていない', c.car === 'ワゴンR', c);
  await closeCard(page);

  // ══ ⑤ 画面の作りの見張り ══════════════════════════════
  head('⑤ 作りの見張り（この合図を外すと再発する）');
  const src = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  t('★カードを開いた回数（openSeq）を覚えている（prevSeqRef）', src.indexOf('prevSeqRef') >= 0);
  t('★「同じ予約か」の判定に openSeq を混ぜている', /const sameOpen=openSeq===prevSeqRef\.current/.test(src));
  t('★form を作り直す効果の依存に openSeq が入っている', /\},\[isOpen,initialData,isNew,currentUser,openSeq\]\);/.test(src));
  t('★人がカードを開く所で openSeq が増える（3か所）', (src.split('setModalOpenSeq(q=>q+1)').length - 1) >= 3, src.split('setModalOpenSeq(q=>q+1)').length - 1);

  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
