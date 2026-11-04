// 管理者コンソール：「この方が使う端末 → 共有端末」が保存できるかの検査（2026-11-02 現場報告）
//   報告：「共有端末にチェックを入れ変更ボタンを押しても変更できません」。
//   原因：共有端末の名簿（${STOR}auth-devnames）が空だと、選ぶ一覧そのものが出ず、
//        「変更する」を押した所で pick が空 → toast を出して黙って引き返していた。
//        本番にはこのキーが無かった（テスト版にだけ共有PC1・共有Pad があった）＝本番では必ず行き止まり。
//   直し：一覧が空でも「＋ 一覧にない（新しく登録する）…」でその場で名前を決められるようにし、
//        保存の前に auth-devnames へ足してから devPlan を書く。
//   ここで見ること：
//     ① 名簿が空でも、共有端末にチェックを入れると名前の欄が出る
//     ② 名前を入れて「変更する」で devPlan が保存される（★直す前はここが保存されない）
//     ③ 同じ名前が auth-devnames にも入る（次からは一覧から選べる）
//     ④ 開き直した時、いま割り当てられている端末が選ばれている（先頭へ移らない）
//     ⑤ 名前を空のまま押した時は、何を入れるのか画面で知らせる
//   実行: node admin_devplan_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8429, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(String.fromCharCode(10) + '■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ME = { email: 'egawa@midori-m.com', fbuid: 'uid_egawa', uid: 'h7', name: '江川京志', store: 'honten', role: 'admin' };

const signedInInit = ([me]) => {
  localStorage.setItem('__fakeFbUser', JSON.stringify({ email: me.email, uid: me.fbuid }));
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  st['meta/allowed'] = {
    [me.email.replace(/\./g, ',')]: { email: me.email, name: me.name, store: me.store, uid: me.uid, role: me.role, active: true, kind: 'staff' },
    ['tikurin@midori-m,com']: { email: 'tikurin@midori-m.com', name: '竹林直行', store: 'honten', uid: 'h3', role: 'staff', active: true, kind: 'staff' },
  };
  localStorage.setItem('__fakeFbStore', JSON.stringify(st));
};

// ダイアログの中の値を読む／書く
const dlg = (page, fn, arg) => page.evaluate(fn, arg);
const val = (page, id) => page.evaluate(x => { const e = document.getElementById(x); return e ? e.value : null; }, id);
const shown = (page, id) => page.evaluate(x => { const e = document.getElementById(x); return !!e && !e.hidden && e.offsetParent !== null; }, id);
const clickOk = page => page.evaluate(() => { const b = document.querySelector('[data-dlg="ok"]'); if (b) { b.click(); return true; } return false; });
const openEdit = async (page, uid) => {
  await page.evaluate(x => { const b = document.querySelector('[data-edit="' + x + '"]'); if (b) b.click(); }, uid);
  await page.waitForTimeout(400);
};
const readKey = (page, key) => page.evaluate(k => {
  const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  const d = st['kv/' + k];
  if (d === undefined) return '(キーが無い)';
  try { return JSON.parse(typeof d === 'string' ? d : d.v); } catch (e) { return d; }
}, key);

(async () => {
  // ★auth-devnames は【わざと入れない】＝本番と同じ「名簿が空」の状態を作る
  const seed = {
    [STOR + 'honten-staff-v2']: [
      { uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten', sysUse: true, loginEmail: ME.email },
      { uid: 'h3', name: '竹林直行', myNumber: 3, badge: 'mechanic', store: 'honten', sysUse: true, loginEmail: 'tikurin@midori-m.com' },
      { uid: 'h5', name: '魚住圭', myNumber: 5, badge: 'mechanic', store: 'honten', sysUse: true, loginEmail: 'uozumi@midori-m.com' },
    ],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'auth-devices']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(signedInInit, [ME]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/admin.html', { waitUntil: 'domcontentloaded' });

  head('コンソールに入れる（サインインが残っている状態）');
  t('スタッフの一覧が出る', await seeText(page, '竹林直行', 20000));

  head('① 共有端末の名簿が空でも、名前の欄が出る');
  t('★名簿は空（本番と同じ状態）', (await readKey(page, STOR + 'auth-devnames')) === '(キーが無い)');
  await openEdit(page, 'h3');
  t('設定の画面が開く', await seeText(page, '使う端末', 8000));
  await page.evaluate(() => { const c = document.getElementById('planshared'); if (c) { c.checked = true; c.onchange(); } });
  await page.waitForTimeout(200);
  t('★共有端末の区画が出る', await shown(page, 'sharedwrap'));
  t('★「＋ 一覧にない」が選ばれている', (await val(page, 'planname')) === '__new__', await val(page, 'planname'));
  t('★名前を入れる欄が出る', await shown(page, 'plannewwrap'));
  t('置いてある店舗も選べる', await shown(page, 'plannewstore'));

  head('⑤ 名前を空のまま押した時');
  await clickOk(page);
  await page.waitForTimeout(400);
  t('★何を入れるのか知らせる', await seeText(page, '共有端末の名前を入れて', 4000));
  t('★保存しない（名簿はまだ空）', (await readKey(page, STOR + 'auth-devnames')) === '(キーが無い)');

  head('② 名前を入れて「変更する」で保存される');
  await page.evaluate(() => { const i = document.getElementById('plannewname'); if (i) i.value = '本店PC2'; });
  await clickOk(page);
  await page.waitForTimeout(1500);
  const staff = await readKey(page, STOR + 'honten-staff-v2');
  const tiku = (staff instanceof Array) ? staff.filter(s => s && s.uid === 'h3')[0] : null;
  t('★竹林さんに devPlan が入る', !!tiku && (tiku.devPlan instanceof Array), tiku);
  t('★共有端末の名前が入っている', !!tiku && (tiku.devPlan || []).indexOf('本店PC2') >= 0, tiku && tiku.devPlan);
  t('個人端末も残っている', !!tiku && (tiku.devPlan || []).indexOf('own') >= 0, tiku && tiku.devPlan);
  t('ほかの人は巻き添えにしない', (staff instanceof Array) && staff.filter(s => s && s.uid === 'h5')[0].devPlan === undefined);

  head('③ 同じ名前が共有端末の名簿にも入る');
  const dn = await readKey(page, STOR + 'auth-devnames');
  t('★名簿に入っている', (dn instanceof Array) && dn.some(d => d && d.name === '本店PC2'), dn);
  t('置いてある店舗も残る', (dn instanceof Array) && (dn.filter(d => d && d.name === '本店PC2')[0] || {}).store === 'honten', dn);

  head('④ 開き直すと、いま割り当てられている端末が選ばれている');
  await page.waitForTimeout(600);
  await openEdit(page, 'h3');
  t('設定の画面が開く', await seeText(page, '使う端末', 8000));
  t('★共有端末のチェックが入っている', await page.evaluate(() => { const c = document.getElementById('planshared'); return !!c && c.checked; }));
  t('★その端末が選ばれている（先頭へ移らない）', (await val(page, 'planname')) === '本店PC2', await val(page, 'planname'));
  t('名前の欄は畳まれている', !(await shown(page, 'plannewwrap')));
  await page.evaluate(() => { const b = document.querySelector('[data-dlg="cancel"]'); if (b) b.click(); });

  head('画面のエラー');
  t('実行時エラーが出ていない', errs.length === 0, errs.slice(0, 3));

  console.log(String.fromCharCode(10) + '合計: ' + pass + ' 合格 / ' + fail + ' 不合格');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e && e.message); process.exit(1); });
