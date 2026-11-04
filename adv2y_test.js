// マッハの「2年前予約」・連絡方法・予約確定＋フルナンバーの検査（v3.95.0・2026-11-04 ユーザー決定）
//   ①C案：予約カードは「2年前予約」を押した時だけ 連絡方法と予約確定が出る
//   ②C案：ナンバーは 地名／分類番号／かな／4桁 の4分割。Enter で次の枠へ移る
//   ③B案：スケジュール1日表示は 小さな札を並べる（🗓 2年前／📱 SMS or ☎ 電話／✅ 確定 or 未確定）
//   ★4桁（no）はこれまでどおり残すこと（顧客リストとの突き合わせ・重複さがし・車両管理の紐づけに使う）
//   ★bookingStatus（顧客リストの 仮予約／本予約／キャンセル）とは【別物】。さわらないこと。
//   実行: node adv2y_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8431, STOR = 'hub-v8-dev-';
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
const TODAY = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 予約カードの中を読む
const boxInfo = page => page.evaluate(() => {
  const box = document.querySelector('[data-adv2ybox]');
  if (!box || box.offsetParent === null) return null;
  const btn = box.querySelector('[data-adv2ybtn]');
  const sms = box.querySelector('[data-contact="sms"]');
  const tel = box.querySelector('[data-contact="tel"]');
  const fix = box.querySelector('[data-adv2yfix]');
  const st = box.querySelector('[data-adv2ystamp]');
  const need = box.querySelector('[data-adv2yneed]');
  const cs = e => e ? getComputedStyle(e) : null;
  const one = e => e ? { on: /✓/.test(e.innerText), border: cs(e).borderColor, bg: cs(e).backgroundColor, color: cs(e).color, dis: !!e.disabled, op: cs(e).opacity, text: e.innerText.replace(/\s+/g, ' ').trim() } : null;
  return { need: need ? String(need.innerText) : null, btn: one(btn), sms: one(sms), tel: one(tel), fix: one(fix), stamp: st ? st.innerText.replace(/\s+/g, ' ').trim() : null };
});
const plateInfo = page => page.evaluate(() => {
  const g = ['nochi', 'nobun', 'nokana', 'nofour'].map(k => document.querySelector('[data-' + k + ']'));
  if (g.some(e => !e)) return null;
  return g.map(e => ({ v: e.value, ph: e.placeholder, im: e.getAttribute('inputmode'), ty: e.type, x: Math.round(e.getBoundingClientRect().left), fw: getComputedStyle(e).fontWeight }));
});
const activeKey = page => page.evaluate(() => {
  const a = document.activeElement; if (!a) return null;
  for (const k of ['nochi', 'nobun', 'nokana', 'nofour']) if (a.hasAttribute('data-' + k)) return k;
  return a.placeholder || a.tagName;
});
const setVal = (page, sel, v) => page.evaluate(([s, x]) => {
  const el = document.querySelector(s); if (!el) return false;
  const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  st.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
}, [sel, v]);
// 車検の表の、その人の行の文字
const inspRowText = (page, name) => page.evaluate(nm => {
  const tr = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(nm) >= 0 && r.offsetParent !== null);
  return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
}, name);
const tagsOf = (page, name) => page.evaluate(nm => {
  const tr = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf(nm) >= 0 && r.offsetParent !== null);
  if (!tr) return null;
  const g = k => { const e = tr.querySelector('[data-' + k + ']'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; };
  return { y2: g('adv2y'), sms: tr.querySelector('[data-adv2yc="sms"]') ? 'SMS' : null, tel: tr.querySelector('[data-adv2yc="tel"]') ? '電話' : null, ok: g('adv2yfixed'), wait: g('adv2ywait') };
}, name);
const savedInsp = (page, name) => page.evaluate(([k, nm]) => {
  const d = window.__fakeFb.get(k) || {};
  for (const dk in d) for (const r of (d[dk] || [])) if (r && r.name === nm) return JSON.parse(JSON.stringify(r));
  return null;
}, [STOR + 'insp', name]);

const seed = {
  [STOR + 'insp']: { [TODAY]: [
    { name: '二年太郎', carType: 'スペーシア', no: '3182', noChi: '神戸', noBun: '582', noKana: 'は',
      course: 1, time: '09:00', store: 'honten', seq: 1, id: 1, bookingStatus: 'provisional',
      adv2y: true, contact: 'sms', fixed: false },
    { name: '確定花子', carType: 'タント', no: '1234', course: 2, time: '10:00', store: 'honten', seq: 2, id: 2,
      adv2y: true, contact: 'tel', fixed: true, fixedAt: Date.now(), fixedBy: '江川京志' },
    { name: '普通三郎', carType: 'ワゴンR', no: '5678', course: 3, time: '11:00', store: 'honten', seq: 3, id: 3 },
  ] },
  [STOR + 'honten-sched']: {}, [STOR + 'sanda-sched']: {},
  [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
  [STOR + 'sanda-staff-v2']: [],
};
const mkServer = () => http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
  fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
});
const route = ctx => {
  ctx.route('https://www.gstatic.com/firebasejs/**', r => {
    const u = r.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
};

(async () => {
  const server = mkServer();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  // ══════════ PC ══════════
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  route(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(2000);
  t('スケジュール画面が出ている', await seeText(page, 'タイムスケジュール', 12000));

  // ══ ③ スケジュール1日表示の札（B案）══════════════════════
  head('③ スケジュール1日表示の札（B案：小さな札を並べる）');
  const g1 = await tagsOf(page, '二年太郎');
  t('★「🗓 2年前」の札が出る', !!g1 && /2年前/.test(g1.y2 || ''), g1);
  t('★連絡方法が SMS の人は「📱 SMS」', !!g1 && g1.sms === 'SMS' && g1.tel === null, g1);
  t('★まだ確定していないので「未確定」', !!g1 && /未確定/.test(g1.wait || '') && g1.ok === null, g1);
  const g2 = await tagsOf(page, '確定花子');
  t('★電話の人は「☎ 電話」', !!g2 && g2.tel === '電話' && g2.sms === null, g2);
  t('★確定した人は「✅ 確定」（未確定は出ない）', !!g2 && /確定/.test(g2.ok || '') && g2.wait === null, g2);
  const g3 = await tagsOf(page, '普通三郎');
  t('★2年前予約でない人には札を出さない', !!g3 && !g3.y2 && !g3.sms && !g3.tel && !g3.ok && !g3.wait, g3);

  head('② フルナンバーの表示（あればフル・無ければ4桁）');
  const r1 = await inspRowText(page, '二年太郎');
  t('★フルナンバーで出る（ナンバー 神戸582は3182）', /ナンバー 神戸582は3182/.test(r1 || ''), r1);
  const r3 = await inspRowText(page, '普通三郎');
  t('★古い予約は4桁のまま（ナンバー 5678）', /ナンバー 5678/.test(r3 || ''), r3);

  // ══ ① 予約カード（C案）══════════════════════════════════
  head('① 予約カード：2年前予約を押した時だけ 連絡方法と予約確定が出る（C案）');
  await page.getByText('普通三郎', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('予約カードが開く', await page.evaluate(() => /予約カード|来店者氏名/.test(document.body.innerText)));
  let b = await boxInfo(page);
  t('★「2年前予約」の区画がある', !!b, b);
  t('★はじめは押されていない', !!b && b.btn && !b.btn.on, b && b.btn);
  t('★★押す前は「連絡方法」も「予約確定」も出ていない（C案）', !!b && !b.sms && !b.tel && !b.fix, b);
  await page.click('[data-adv2ybtn]'); await page.waitForTimeout(350);
  b = await boxInfo(page);
  t('★押すとチェックが付く', !!b && b.btn.on, b && b.btn);
  t('★押すと色が変わる（紫）', !!b && /109, 40, 217/.test(b.btn.border), b && b.btn.border);
  t('★★押すと「ショートメール／電話連絡」と「予約確定」が出る', !!b && !!b.sms && !!b.tel && !!b.fix, b);
  t('どちらの連絡方法もまだ選ばれていない', !!b && !b.sms.on && !b.tel.on, b);

  head('① ★連絡方法を選ぶまで「予約確定」は押せない（2026-11-04 ユーザー指示）');
  t('★「予約確定」は押せない（disabled）', !!b && b.fix.dis, b && b.fix);
  t('★うすく見える（押せないと分かる）', !!b && parseFloat(b.fix.op) < 0.7, b && b.fix.op);
  t('★「先にショートメールか電話連絡を選んでください」と出る', !!b && /ショートメール/.test(b.need || '') && /電話連絡/.test(b.need || ''), b && b.need);
  await page.evaluate(() => { const e = document.querySelector('[data-adv2yfix]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  b = await boxInfo(page);
  t('★押しても確定にならない', !!b && !b.fix.on && !b.stamp, b);

  await page.click('[data-contact="sms"]'); await page.waitForTimeout(300);
  b = await boxInfo(page);
  t('★連絡方法を選ぶと押せるようになる', !!b && !b.fix.dis, b && b.fix);
  t('★案内は消える', !!b && !b.need, b && b.need);
  b = await boxInfo(page);
  t('★ショートメールを押すとチェックが付いて色が変わる', !!b && b.sms.on && /8, 145, 178/.test(b.sms.border), b && b.sms);
  t('★電話の方は選ばれていない（どちらか一つ）', !!b && !b.tel.on, b && b.tel);
  await page.click('[data-contact="tel"]'); await page.waitForTimeout(300);
  b = await boxInfo(page);
  t('★電話を押すと電話に移る', !!b && b.tel.on && !b.sms.on, b);
  await page.click('[data-contact="sms"]'); await page.waitForTimeout(300);

  head('① 予約確定');
  t('まだ押していないので印は出ていない', !(await boxInfo(page)).stamp);
  await page.click('[data-adv2yfix]'); await page.waitForTimeout(350);
  b = await boxInfo(page);
  t('★「予約確定」にチェックが付く', !!b && b.fix.on, b && b.fix);
  t('★緑に変わる', !!b && /21, 128, 61/.test(b.fix.bg), b && b.fix.bg);
  t('★「SMSで予約確定」と出る', !!b && /SMSで予約確定/.test(b.stamp || ''), b && b.stamp);
  t('★いつ・誰が が残る（11/4 江川京志）', !!b && /江川京志/.test(b.stamp || ''), b && b.stamp);
  await page.click('[data-adv2ybtn]'); await page.waitForTimeout(350);
  b = await boxInfo(page);
  t('★2年前予約を外すと、連絡方法も予約確定も消える', !!b && !b.sms && !b.fix && !b.stamp, b);
  await page.click('[data-adv2ybtn]'); await page.waitForTimeout(300);
  await page.click('[data-contact="tel"]'); await page.waitForTimeout(250);
  await page.click('[data-adv2yfix]'); await page.waitForTimeout(250);
  b = await boxInfo(page);
  t('電話で確定にできた', !!b && b.fix.on, b && b.fix);
  await page.click('[data-contact="tel"]'); await page.waitForTimeout(300);
  b = await boxInfo(page);
  t('★連絡方法を外すと「予約確定」も外れる', !!b && !b.tel.on && !b.fix.on && !b.stamp, b);
  t('★また押せなくなり、案内が出る', !!b && b.fix.dis && !!b.need, b && b.fix);
  await page.click('[data-contact="tel"]'); await page.waitForTimeout(250);
  await page.click('[data-adv2yfix]'); await page.waitForTimeout(250);

  // ══ ② ナンバー4分割 ══════════════════════════════════════
  head('② ナンバーは4つに分かれている（地名／分類番号／かな／4桁）');
  const pf = await plateInfo(page);
  t('★4つの欄がある', !!pf && pf.length === 4, pf);
  t('★左から 地名・分類番号・かな・4桁 の順に並ぶ', !!pf && pf[0].x < pf[1].x && pf[1].x < pf[2].x && pf[2].x < pf[3].x, pf && pf.map(x => x.x));
  t('★4桁には元の値が入ったまま（5678）', !!pf && pf[3].v === '5678', pf && pf[3].v);
  t('★PC なので inputMode を付けない（日本語入力が解除されるため）', !!pf && pf.every(x => !x.im), pf && pf.map(x => x.im));
  t('★type=number でもない', !!pf && pf.every(x => x.ty !== 'number'), pf && pf.map(x => x.ty));
  t('★入れた字は太い（入っている枠と入っていない枠の差を出す・2026-11-04 ユーザー指示）',
    !!pf && pf.every(x => Number(x.fw) >= 700), pf && pf.map(x => x.fw));
  const phCss = page => page.evaluate(() => {
    let hit = null;
    for (const s of document.styleSheets) {
      let rr = []; try { rr = [...s.cssRules]; } catch (e) { continue; }
      for (const r of rr) if (r.selectorText && /data-nofour]::placeholder/.test(r.selectorText)) hit = r.style.color;
    }
    return hit;
  });
  const ph = await phCss(page);
  t('★まだ入れていない枠の案内は【うんとうすい】灰色', !!ph, ph);
  // 正規表現にバックスラッシュを書かない（この書き方の決まり）。rgb(221, 225, 230) のかっこの中を読む。
  const lum = c => { const p = String(c || '').split('('); if (p.length < 2) return 0; const a = p[1].split(')')[0].split(',').map(x => Number(x.trim())); return (a[0] + a[1] + a[2]) / 3; };
  t('★うすさの目安（200より明るい灰色）', lum(ph) >= 200, ph);

  head('② Enter で次の枠へ移る');
  await page.focus('[data-nochi]');
  await page.keyboard.type('神戸'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  t('★地名で Enter → 分類番号へ移る', (await activeKey(page)) === 'nobun', await activeKey(page));
  await page.keyboard.type('582'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  t('★分類番号で Enter → かなへ移る', (await activeKey(page)) === 'nokana', await activeKey(page));
  await page.keyboard.type('は'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  t('★かなで Enter → 4桁へ移る', (await activeKey(page)) === 'nofour', await activeKey(page));
  await setVal(page, '[data-nofour]', '９９９９'); await page.waitForTimeout(250);
  const pf2 = await plateInfo(page);
  t('★全角で打っても半角4桁になる', !!pf2 && pf2[3].v === '9999', pf2 && pf2[3].v);
  t('★打った内容が入っている（神戸／582／は）', !!pf2 && pf2[0].v === '神戸' && pf2[1].v === '582' && pf2[2].v === 'は', pf2 && pf2.map(x => x.v));

  // SHOT3＝開いた予約カードそのもの（見た目を見たい時に）
  if (process.env.SHOT3) { await page.screenshot({ path: process.env.SHOT3 }); console.log('   [shot] ' + process.env.SHOT3); }
  head('① 保存すると残る／bookingStatus はさわらない');
  await page.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find(e => /内容を保存する|確定して登録/.test(e.innerText) && e.offsetParent !== null); if (b2) b2.click(); });
  await page.waitForTimeout(2500);
  const sv = await savedInsp(page, '普通三郎');
  t('★adv2y が残る', !!sv && sv.adv2y === true, sv && sv.adv2y);
  t('★連絡方法（tel）が残る', !!sv && sv.contact === 'tel', sv && sv.contact);
  t('★予約確定（fixed）が残る', !!sv && sv.fixed === true, sv && sv.fixed);
  t('★押した人が残る', !!sv && sv.fixedBy === '江川京志', sv && sv.fixedBy);
  t('★4桁（no）はこれまでどおり残っている', !!sv && String(sv.no) === '9999', sv && sv.no);
  t('★フルナンバーは別に持つ（noChi／noBun／noKana）', !!sv && sv.noChi === '神戸' && sv.noBun === '582' && sv.noKana === 'は', sv && [sv.noChi, sv.noBun, sv.noKana]);
  // ★★bookingStatus（顧客リストの 仮予約／本予約／キャンセル）とは別物（2026-11-04 ユーザー決定）。
  //   スケジュールから保存すると本予約になるのは【元からの動き】なので、そこは変わらないことを見る。
  //   「2年前予約の区画が bookingStatus をさわっていない」のはファイルの中身で見張る
  //   （押した時に何が起きるかは画面からは読めないため）。
  t('★保存の結果はこれまでどおり（スケジュールからの保存＝本予約）', !!sv && sv.bookingStatus === 'confirmed', sv && sv.bookingStatus);
  const blockOf = (file, from, to) => { const s = fs.readFileSync(path.join(DIR, file), 'utf8'); const a = s.indexOf(from); const b2 = s.indexOf(to, a); return (a < 0 || b2 < 0) ? null : s.slice(a, b2); };
  const pcBlock = blockOf('index_dev.html', 'data-adv2ybox', '作業（整備）');
  const mbBlock = blockOf('mobile.html', 'data-adv2ybox', '入庫時間 *');
  t('★★PC の2年前予約の区画は bookingStatus をさわっていない', !!pcBlock && pcBlock.indexOf('bookingStatus') < 0, pcBlock && pcBlock.length);
  t('★★スマホの2年前予約の区画も bookingStatus をさわっていない', !!mbBlock && mbBlock.indexOf('bookingStatus') < 0, mbBlock && mbBlock.length);
  t('★表にも札が出る', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => (r.innerText || '').indexOf('普通三郎') >= 0 && r.offsetParent !== null);
    return !!(tr && tr.querySelector('[data-adv2y]') && tr.querySelector('[data-adv2yfixed]'));
  }));
  t('★表のナンバーもフルになる', /ナンバー 神戸582は9999/.test((await inspRowText(page, '普通三郎')) || ''), await inspRowText(page, '普通三郎'));
  t('PC で JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT }); console.log('   [shot] ' + process.env.SHOT); }
  await ctx.close();

  // ══════════ スマホ ══════════
  head('④ スマホ（mobile.html）も同じ');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mctx.addInitScript(signedInInit, [ME, STOR]);
  route(mctx);
  const mp = await mctx.newPage();
  const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  mp.on('dialog', async d => { await d.accept().catch(() => {}); });
  await mp.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(mp, '江川京志', 25000); await clickText(mp, '江川京志');
  await seeText(mp, 'カレンダー', 25000);
  await mp.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await mp.waitForTimeout(2000);
  const mt = await mp.evaluate(() => {
    const row = [...document.querySelectorAll('div')].reverse().find(e => /二年太郎/.test(e.innerText || '') && e.querySelector('[data-adv2y]'));
    if (!row) return null;
    return { y2: !!row.querySelector('[data-adv2y]'), sms: !!row.querySelector('[data-adv2yc="sms"]'), wait: !!row.querySelector('[data-adv2ywait]') };
  });
  t('★スマホのスケジュールにも札が出る', !!mt && mt.y2 && mt.sms && mt.wait, mt);
  await mp.getByText('確定花子', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await mp.waitForTimeout(1500);
  const mb = await boxInfo(mp);
  t('★スマホの予約カードにも区画がある', !!mb, mb);
  t('★すでに2年前予約なので、連絡方法と予約確定が出ている', !!mb && !!mb.tel && !!mb.fix, mb);
  t('★電話が選ばれている', !!mb && mb.tel.on && !mb.sms.on, mb);
  t('★確定の印が出ている', !!mb && /電話で予約確定/.test(mb.stamp || ''), mb && mb.stamp);
  t('★スマホは保存ボタンと名前が重ならない（返事あり と付ける）', !!mb && /返事あり/.test(mb.fix.text), mb && mb.fix.text);
  const mpf = await plateInfo(mp);
  t('★スマホのナンバーも4つに分かれている', !!mpf && mpf.length === 4, mpf);
  t('★4桁だけ数字キーパッド（地名・分類・かなは付けない）', !!mpf && !mpf[0].im && !mpf[1].im && !mpf[2].im && mpf[3].im === 'numeric', mpf && mpf.map(x => x.im));
  t('★入力欄は16px以上（iPhoneが勝手に拡大しない）', await mp.evaluate(() =>
    ['nochi', 'nobun', 'nokana', 'nofour'].every(k => { const e = document.querySelector('[data-' + k + ']'); return e && parseFloat(getComputedStyle(e).fontSize) >= 16; })));
  t('★スマホも入れた字は太い', !!mpf && mpf.every(x => Number(x.fw) >= 700), mpf && mpf.map(x => x.fw));
  const mph = await mp.evaluate(() => {
    let hit = null;
    for (const s of document.styleSheets) {
      let rr = []; try { rr = [...s.cssRules]; } catch (e) { continue; }
      for (const r of rr) if (r.selectorText && r.selectorText.indexOf('[data-nofour]::placeholder') >= 0) hit = r.style.color;
    }
    return hit;
  });
  t('★スマホの案内の字も同じうすさ', lum(mph) >= 200, mph);
  await mp.click('[data-adv2ybtn]'); await mp.waitForTimeout(350);
  const mb2 = await boxInfo(mp);
  t('★2年前予約を外すと連絡方法も確定も消える', !!mb2 && !mb2.tel && !mb2.fix, mb2);
  await mp.click('[data-adv2ybtn]'); await mp.waitForTimeout(350);
  const mb3 = await boxInfo(mp);
  t('★スマホも連絡方法を選ぶまで押せない', !!mb3 && mb3.fix && mb3.fix.dis, mb3 && mb3.fix);
  t('★スマホにも案内が出る', !!mb3 && /SMS/.test(mb3.need || '') && /電話/.test(mb3.need || ''), mb3 && mb3.need);
  await mp.click('[data-contact="sms"]'); await mp.waitForTimeout(300);
  const mb4 = await boxInfo(mp);
  t('★スマホも選べば押せる／案内は消える', !!mb4 && !mb4.fix.dis && !mb4.need, mb4 && mb4.fix);
  await mp.click('[data-adv2yfix]'); await mp.waitForTimeout(300);
  await mp.click('[data-contact="sms"]'); await mp.waitForTimeout(300);
  const mb5 = await boxInfo(mp);
  t('★スマホも連絡方法を外すと確定が外れる', !!mb5 && !mb5.fix.on && !mb5.stamp, mb5);
  t('スマホで JSエラーが出ていない', merrs.length === 0, merrs.slice(0, 3));
  if (process.env.SHOT2) { await mp.screenshot({ path: process.env.SHOT2 }); console.log('   [shot] ' + process.env.SHOT2); }

  await browser.close(); server.close();
  console.log(NL + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
