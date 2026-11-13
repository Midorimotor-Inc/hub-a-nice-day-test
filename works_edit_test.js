// 主作業の設定（画面から足せる・直せる）の検査（v3.114.0・2026-11-13 ユーザー決定＝B案「表で一覧」）
//   ① 入口＝ダッシュボードの「設定・道具」→ 🔧 主作業の設定（管理者だけ）
//   ② 表の形（並び▲▼・バッジ・色・名前・グループ・月数・マッハで止める・場所を分ける・いまの予定・使う）
//   ③ ★内部の見分け字（id）は変えられない＝読み取り専用で「変えられません」と出す
//   ④ ★消すボタンは無い。「表示中／隠し中」で切り替える（昔の予定の表示はそのまま残る）
//   ⑤ 名前・バッジを直して保存すると、予約カードの作業内容と 1日表示のバッジに出る
//   ⑥ 足した作業が選べるようになる／隠した作業は選べなくなる
//   ⑦ 「こう出ます」（予約カード・バッジ・マッハで止まる作業と解除の一覧）
//   ⑧ ファイルの中身の見張り（保存先の2つのキー・スマホは読むだけ・控えのキー・紙の控え）
//   実行: node works_edit_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8479, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
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
};
const now = new Date();
const DK = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

(async () => {
  // ★種データに workItems / workGroups は入れない＝既定（11項目・3グループ）で始まる。
  //   入れてしまうと「保存した分が次に開いた時も残るか」が見られない（毎回の読み込みで種が上書きする）。
  const seed = {
    [STOR + 'insp']: {},
    [STOR + 'honten-sched']: { [DK]: {
      // メンパ（6ヶ月）＝名前とバッジを直した時に出方が変わるか見る。いまの予定「1件」の数にもなる
      '09:00': { name: 'めんぱ太郎', work: 'メンパ', wkmon: '6', staff: '江川京志', id: 1, carType: 'アルト' },
      // 試乗＝隠した後も、すでに入っている予定のバッジは残るか見る
      '10:00': { name: 'しじょう次郎', work: '試', staff: '江川京志', id: 2, carType: 'ワゴンR' },
    } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = String.fromCharCode(10) + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k.indexOf("hub-v8")===0?k:("' + STOR + '"+k), s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const asked = [];
  page.on('dialog', async d => { asked.push(d.message()); await d.accept('').catch(() => {}); });

  const login = async (query) => {
    await page.goto('http://localhost:' + PORT + '/index_dev.html' + (query || ''), { waitUntil: 'domcontentloaded' });
    await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
    await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
    await page.waitForTimeout(900);
  };
  const toSchedule = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
    await page.waitForTimeout(1500);
  };
  const openEdit = async () => {
    await page.evaluate(() => { const d = document.querySelector('[data-dashtool="works"]'); if (d) d.click(); });
    await page.waitForTimeout(700);
    return page.evaluate(() => !!document.querySelector('[data-wedit]'));
  };
  const setVal = (sel, v) => page.evaluate(([s, val]) => {
    const el = document.querySelector(s); if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
  }, [sel, v]);
  const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
  const txt = (sel) => page.evaluate(s => { const el = document.querySelector(s); return el ? el.innerText : null; }, sel);

  // ─────────────────────────────────────────────────────────
  head('① 入口＝ダッシュボードの「設定・道具」');
  await login('?dash=1');   // ★同じタブの中でダッシュボードを開く（別タブを待たずに済む）
  t('ダッシュボードが出ている', await page.evaluate(() => !!document.querySelector('[data-dash]')));
  t('★「🔧 主作業の設定」のタイルがある', await page.evaluate(() => {
    const d = document.querySelector('[data-dashtool="works"]');
    return !!d && d.innerText.indexOf('主作業の設定') >= 0;
  }), await txt('[data-dashtool="works"]'));
  t('★押すと設定の画面が開く', await openEdit());

  head('② 表の形（B案）');
  t('表がある', await page.evaluate(() => !!document.querySelector('[data-wedittable]')));
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-weditrow]')].map(r => r.getAttribute('data-weditrow')));
  t('★はじめは 11 項目', rows.length === 11, rows);
  t('★並びは Q → メンパ → 無点 → 有点（点検は メンパ→無料→有料）',
    rows[0] === 'Q' && rows[1] === 'メンパ' && rows[2] === '無点' && rows[3] === '有点', rows.slice(0, 4));
  const ths = await page.evaluate(() => [...document.querySelectorAll('[data-wedittable] th')].map(e => e.innerText.replace(/\s/g, '')));
  for (const h of ['並び', 'バッジ', '色', '名前', 'グループ', '月数を聞く', 'マッハで止める', '場所を分ける', 'いまの予定', '表示']) {
    t('列「' + h + '」がある', ths.some(x => x.indexOf(h) >= 0), ths);
  }
  t('▲▼ で並べ替えられる', await page.evaluate(() => !!document.querySelector('[data-weditup="Q"]') && !!document.querySelector('[data-weditdown="Q"]')));
  t('★「いまの予定」に メンパ 1件 と出る', /1件/.test(await txt('[data-weditused="メンパ"]') || ''), await txt('[data-weditused="メンパ"]'));
  t('★試乗も いまの予定 1件（隠しても消さない作業）', /1件/.test(await txt('[data-weditused="試"]') || ''), await txt('[data-weditused="試"]'));
  t('使っていない作業は 0件', /0件/.test(await txt('[data-weditused="保"]') || ''), await txt('[data-weditused="保"]'));

  head('③ 内部の見分け字（id）は変えられない');
  t('★「変えられません」と出る', await page.evaluate(() => {
    const r = document.querySelector('[data-weditrow="メンパ"]');
    return !!r && r.innerText.indexOf('変えられません') >= 0;
  }), await txt('[data-weditrow="メンパ"]'));
  t('★id を直す入力欄は無い', await page.evaluate(() => !document.querySelector('[data-weditid]')));

  head('④ 消すボタンは無い（表示中／隠し中 で切り替える）');
  t('★作業を消すボタンは無い', await page.evaluate(() => !document.querySelector('[data-weditdel]')));
  t('★「表示中／隠し中」のボタンがある（2026-11-13 ユーザー決定＝②案）', await page.evaluate(() => {
    const b = document.querySelector('[data-wedithide="試"]'); return !!b && /表示中|隠し中/.test(b.innerText);
  }));
  t('★入庫制限が壊れないことを画面で言っている', await page.evaluate(() => {
    const d = document.querySelector('[data-wedit]'); return !!d && d.innerText.indexOf('入庫制限は壊れません') >= 0;
  }));

  head('⑤ 名前とバッジを直す／足す／隠す → 保存');
  await setVal('[data-weditname="メンパ"]', 'メンテナンスパック');
  await setVal('[data-weditbadge="メンパ"]', 'MP');
  await page.waitForTimeout(250);
  t('名前が書き換わった', await page.evaluate(() => document.querySelector('[data-weditname="メンパ"]').value === 'メンテナンスパック'));
  t('バッジが書き換わった', await page.evaluate(() => document.querySelector('[data-weditbadge="メンパ"]').value === 'MP'));
  t('★月数は 1／6／12 が選ばれている（メンパ）', await page.evaluate(() => {
    const on = ['1', '6', '12'].every(m => {
      const e = document.querySelector('[data-weditmon="メンパ/' + m + '"]');
      return !!e && getComputedStyle(e).color === 'rgb(255, 255, 255)';   // 選ばれている時は白抜き
    });
    return on;
  }));
  await setVal('[data-weditnewname]', 'タイヤ交換');
  await setVal('[data-weditnewbadge]', 'タ');
  await click('[data-weditadd]');
  await page.waitForTimeout(350);
  const rows2 = await page.evaluate(() => [...document.querySelectorAll('[data-weditrow]')].length);
  t('★「＋ 足す」で 12 項目になった', rows2 === 12, rows2);
  t('足した案内が出る', /足しました/.test(await txt('[data-weditmsg]') || ''), await txt('[data-weditmsg]'));
  const askedBefore = asked.length;
  await click('[data-wedithide="試"]');
  await page.waitForTimeout(400);
  t('★隠す時は たずねる', asked.length > askedBefore && /隠します/.test(asked[asked.length - 1] || ''), asked[asked.length - 1]);
  t('隠した行はうすく出る', await page.evaluate(() => {
    const r = document.querySelector('[data-weditrow="試"]'); return !!r && Number(getComputedStyle(r).opacity) < 0.6;
  }));

  head('⑥ こう出ます（プレビュー）');
  t('予約カードの見え方が出る', await page.evaluate(() => {
    const d = document.querySelector('[data-weditpv1]'); return !!d && d.innerText.indexOf('メンテナンスパック') >= 0 && d.innerText.indexOf('タイヤ交換') >= 0;
  }), await txt('[data-weditpv1]'));
  t('★隠した作業はプレビューに出ない', await page.evaluate(() => {
    const d = document.querySelector('[data-weditpv1]'); return !!d && d.innerText.indexOf('試乗') < 0;
  }));
  t('バッジの見え方が出る（MP6 など）', /MP6/.test(await txt('[data-weditpv2]') || ''), await txt('[data-weditpv2]'));
  t('マッハで止まる作業と解除の一覧が出る', await page.evaluate(() => {
    const d = document.querySelector('[data-weditpv3]');
    return !!d && d.innerText.indexOf('マッハ車検の入庫から1時間は受けない作業') >= 0 && d.innerText.indexOf('解除できる作業') >= 0;
  }), await txt('[data-weditpv3]'));
  t('★ピット作業・リフト作業が解除の一覧に出る', /ピット作業/.test(await txt('[data-weditpv3]') || '') && /リフト作業/.test(await txt('[data-weditpv3]') || ''));

  head('⑦ 保存すると全員の画面に出る');
  await click('[data-weditsave]');
  await page.waitForTimeout(1800);
  t('保存すると画面が閉じる', await page.evaluate(() => !document.querySelector('[data-wedit]')));
  const wi = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'workItems');
  const wg = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'workGroups');
  t('★workItems（配列）に保存される', Array.isArray(wi) && wi.length === 12, wi && wi.length);
  t('★workGroups（配列）に保存される', Array.isArray(wg) && wg.length === 3, wg && wg.length);
  const mp = (wi || []).find(x => x && x.id === 'メンパ');
  t('★見分け字は メンパ のまま（名前だけ変わる）', !!mp && mp.name === 'メンテナンスパック' && mp.badge === 'MP', mp);
  t('★足した作業も入っている', (wi || []).some(x => x && x.name === 'タイヤ交換'));
  t('★隠した作業は消さずに hide を立てる', (wi || []).some(x => x && x.id === '試' && x.hide === true));

  // ── 開き直しても残っているか ──
  await login('');
  await toSchedule();
  t('★開き直しても名前が残っている（1日表示に出る）', await seeText(page, 'めんぱ太郎', 8000));
  const badges = await page.evaluate(() => [...document.querySelectorAll('span')].map(e => e.innerText).filter(x => x && x.length <= 4));
  t('★1日表示のバッジが MP6 になっている', badges.indexOf('MP6') >= 0, badges.filter(x => /MP|M6|試/.test(x)).slice(0, 10));
  t('★隠した作業でも、すでに入っている予定のバッジは残る', badges.indexOf('試') >= 0, badges.filter(x => x === '試'));

  head('⑧ 予約カードの作業内容に出る');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('13:00') === 0);
    if (!row) return false;
    const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
    (inner || row).click(); return true;
  });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) {
    if (await page.evaluate(() => !!document.querySelector('[data-wkid]'))) break;
    await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(450);
  }
  const picks = await page.evaluate(() => [...document.querySelectorAll('[data-wkid]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  t('作業内容の窓が開く', picks.length > 0, picks.length);
  t('★直した名前で出る', picks.some(x => x.indexOf('メンテナンスパック') >= 0), picks);
  t('★足した作業が選べる', picks.some(x => x.indexOf('タイヤ交換') >= 0));
  t('★隠した作業は選べない', !picks.some(x => x.indexOf('試乗') >= 0), picks);
  t('★項目の数は 11（12 のうち 1つを隠した）', picks.length === 11, picks.length);

  head('⑨ ★設定で月数を足すと、予約カードでも聞かれる（2026-11-13 現場報告）');
  // 報告：「有料点検に 6ヶ月 を設定したのに、一般の予約カードから入れると選べない」。
  // 原因は applyWorkPick の「有点なら12」の決め打ち。★月数は【設定の mon】だけで決めること。
  await login('?dash=1');
  await openEdit();
  await click('[data-weditmon="有点/6"]');
  await page.waitForTimeout(300);
  t('設定で 有料点検に 6ヶ月 を足せる', await page.evaluate(() => {
    const e = document.querySelector('[data-weditmon="有点/6"]');
    return !!e && getComputedStyle(e).color === 'rgb(255, 255, 255)';
  }));
  await click('[data-weditsave]');
  await page.waitForTimeout(1800);
  const yu = await page.evaluate(k => {
    const a = window.__fakeFb.get(k) || []; const w = a.find(x => x && x.id === '有点');
    return w ? JSON.parse(JSON.stringify(w.mon || [])) : null;
  }, STOR + 'workItems');
  t('★workItems の 有点 に 6 と 12 が入る', Array.isArray(yu) && yu.indexOf('6') >= 0 && yu.indexOf('12') >= 0, yu);

  await login('');
  await toSchedule();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('14:00') === 0);
    if (!row) return false;
    const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
    (inner || row).click(); return true;
  });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) {
    if (await page.evaluate(() => !!document.querySelector('[data-wkid]'))) break;
    await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').indexOf('有料点検') >= 0);
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  t('★有料点検を押しても窓は閉じない（月数を聞く）', await page.evaluate(() => !!document.querySelector('[data-wkmodal]')));
  const mons = await page.evaluate(() => [...document.querySelectorAll('[data-wkmon]')].map(e => e.getAttribute('data-wkmon')));
  t('★6ヶ月 と 12ヶ月 の両方が出る', mons.indexOf('6') >= 0 && mons.indexOf('12') >= 0, mons);
  // ★月数の札は onMouseDown で決まる作り＝click() では効かない
  await page.evaluate(() => { const e=document.querySelector('[data-wkmon="6"]'); if(e)e.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); });
  await page.waitForTimeout(600);
  t('★6ヶ月 を選ぶと窓が閉じる', await page.evaluate(() => !document.querySelector('[data-wkmodal]')));
  t('★カードの作業内容が「有料点検（6ヶ月）」になる', await page.evaluate(() => {
    const d = document.querySelector('[data-kbkey="work"]'); return !!d && d.innerText.indexOf('6ヶ月') >= 0;
  }), await txt('[data-kbkey="work"]'));
  // ★月数が1つだけの作業（はじめの形の無料点検は 1／6 の2つなので、ここは 納車＝月数なし）は聞かない
  await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').indexOf('納車') >= 0);
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  t('★月数が無い作業は聞かずに閉じる（納車）', await page.evaluate(() => !document.querySelector('[data-wkmodal]')));

  head('⑩ ★月数を聞くのは「点検」のグループだけ（2026-11-13 ユーザー指示）');
  // ユーザーの言葉：「点検項目以外は何ヶ月というのはいりません」
  await login('?dash=1');
  await openEdit();
  t('点検の作業には月数の札が出る', await page.evaluate(() => !!document.querySelector('[data-weditmon="メンパ/1"]')));
  t('★点検いがいの作業には出ない（鈑金塗装）', await page.evaluate(() => {
    return !document.querySelector('[data-weditmon="B/1"]') && !!document.querySelector('[data-weditnomon="B"]');
  }));
  t('★その他の作業にも出ない（納車）', await page.evaluate(() => !!document.querySelector('[data-weditnomon="納"]')));
  t('グループの帯に 🗓 の切り替えがある', await page.evaluate(() => !!document.querySelector('[data-weditgmon="g1"]')));
  await click('[data-weditgmon="g1"]');
  await page.waitForTimeout(300);
  t('★🗓 を外すと点検からも月数の札が消える', await page.evaluate(() => {
    return !document.querySelector('[data-weditmon="メンパ/1"]') && !!document.querySelector('[data-weditnomon="メンパ"]');
  }));
  await click('[data-weditgmon="g1"]');
  await page.waitForTimeout(300);
  t('★🗓 を入れ直すと戻る', await page.evaluate(() => !!document.querySelector('[data-weditmon="メンパ/1"]')));
  await click('[data-weditclose]');
  await page.waitForTimeout(500);

  head('⑪ ★点検でもリフト作業・ピット作業をえらべる（任意）');
  // ユーザーの言葉：「その点検でもピット作業とリフト作業を選択できるようにしたい。これは任意でいい」
  await login('');
  await toSchedule();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf('15:00') === 0);
    if (!row) return false;
    const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
    (inner || row).click(); return true;
  });
  await page.waitForTimeout(800);
  t('★はじめは「どこで作業する」は出ていない', await page.evaluate(() => !document.querySelector('[data-qkrow]')));
  for (let i = 0; i < 3; i++) {
    if (await page.evaluate(() => !!document.querySelector('[data-wkid]'))) break;
    await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').indexOf('メンテナンスパック') >= 0);
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => { const e = document.querySelector('[data-wkmon="6"]'); if (e) e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(600);
  t('★点検（メンパ）でも「どこで作業する」が出る', await page.evaluate(() => !!document.querySelector('[data-qkrow]')));
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].map(e => e.getAttribute('data-qkind')));
  t('★リフト作業・ピット作業の2つ', kinds.join(',') === 'lift,pit', kinds);
  t('★はじめは どちらもえらんでいない（任意）', await page.evaluate(() =>
    [...document.querySelectorAll('[data-qkind]')].every(e => e.innerText.indexOf('✓') < 0)));
  await page.evaluate(() => { const b = document.querySelector('[data-qkind="pit"]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  t('★ピット作業をえらべる', await page.evaluate(() =>
    [...document.querySelectorAll('[data-qkind]')].filter(e => e.innerText.indexOf('✓') >= 0).length === 1));
  // 「場所を分ける」が入っていない作業に変えると消える
  await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').indexOf('鈑金塗装') >= 0);
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  t('★「場所を分ける」が入っていない作業では出ない（鈑金塗装）', await page.evaluate(() => !document.querySelector('[data-qkrow]')));

  head('⑫ ★予約カードの中でそのまま直せる（B案・2026-11-13 ユーザー決定）');
  // ユーザーの言葉：「ダッシュボードで開かずに、クイックメニューのように予約カードの中で編集できるように」
  await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
  await page.waitForTimeout(550);
  t('作業内容の窓が開いている', await page.evaluate(() => !!document.querySelector('[data-wkmodal]')));
  t('★窓の中に「✎ 編集」がある', await page.evaluate(() => !!document.querySelector('[data-wkedit]')));
  await click('[data-wkedit]');
  await page.waitForTimeout(450);
  t('★押すと札が編集の行に変わる', await page.evaluate(() =>
    document.querySelectorAll('[data-wkerow]').length >= 10 && !document.querySelector('[data-wkid]')),
    await page.evaluate(() => document.querySelectorAll('[data-wkerow]').length));
  t('★隠し中の作業も出る（ここから戻せる）', await page.evaluate(() => !!document.querySelector('[data-wkerow="試"]')));
  t('★ボタンの字は 表示中／隠し中（②案）', await page.evaluate(() => {
    const a = document.querySelector('[data-wkehide="B"]'), b = document.querySelector('[data-wkehide="試"]');
    return !!a && !!b && a.innerText.indexOf('表示中') >= 0 && b.innerText.indexOf('隠し中') >= 0;
  }), await page.evaluate(() => {
    const a = document.querySelector('[data-wkehide="B"]'), b = document.querySelector('[data-wkehide="試"]');
    return [a ? a.innerText : null, b ? b.innerText : null];
  }));
  t('★月数は 🗓 の区画だけ（鈑金塗装は —）', await page.evaluate(() =>
    !!document.querySelector('[data-wkemon="メンパ/1"]') && !!document.querySelector('[data-wkenomon="B"]')));
  t('★マッハ・場所・グループは窓に入れない（それは表の方で）', await page.evaluate(() => {
    const d = document.querySelector('[data-wkmodal]');
    return !!d && !d.querySelector('[data-weditmach]') && !d.querySelector('[data-weditplace]') && !d.querySelector('[data-weditgname]');
  }));
  t('★id を直す入力欄は無い', await page.evaluate(() => !document.querySelector('[data-wkeid]')));
  await setVal('[data-wkename="B"]', '鈑金・塗装');
  await setVal('[data-wkebadge="B"]', 'BP');
  await page.waitForTimeout(250);
  await click('[data-wkesave]');
  await page.waitForTimeout(1900);
  t('★保存すると札の並びに戻る', await page.evaluate(() =>
    !document.querySelector('[data-wkerow]') && !!document.querySelector('[data-wkid]')));
  t('★直した名前がその場で出る', await page.evaluate(() => {
    const e = document.querySelector('[data-wkid="B"]'); return !!e && e.innerText.indexOf('鈑金・塗装') >= 0;
  }), await txt('[data-wkid="B"]'));
  const bw = await page.evaluate(k => {
    const a = window.__fakeFb.get(k) || []; const w = a.find(x => x && x.id === 'B');
    return w ? { n: w.name, b: w.badge } : null;
  }, STOR + 'workItems');
  t('★共有の workItems にも入る（全員の画面に出る）', !!bw && bw.n === '鈑金・塗装' && bw.b === 'BP', bw);
  // ＋足す もその場でできる
  await click('[data-wkedit]');
  await page.waitForTimeout(450);
  await setVal('[data-wkenewname]', '室内クリーニング');
  await setVal('[data-wkenewbadge]', '室');
  await page.waitForTimeout(200);
  await click('[data-wkeadd]');
  await page.waitForTimeout(450);
  t('★その場で足せる', await page.evaluate(() =>
    [...document.querySelectorAll('[data-wkename]')].some(e => e.value === '室内クリーニング')));
  await click('[data-wkesave]');
  await page.waitForTimeout(1900);
  t('★足した作業がすぐ選べる', await page.evaluate(() =>
    [...document.querySelectorAll('[data-wkid]')].some(e => e.innerText.indexOf('室内クリーニング') >= 0)));

  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
  await browser.close(); server.close();

  // ─────────────────────────────────────────────────────────
  head('⑨ ファイルの中身の見張り');
  const ix = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const mb = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const hp = fs.readFileSync(path.join(DIR, 'hub_paper.js'), 'utf8');
  const cu = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const kc = fs.readFileSync(path.join(DIR, 'fb_snap_keycheck.js'), 'utf8');
  for (const [nm, src] of [['スケジュール', ix], ['スマホ', mb]]) {
    t(nm + '：受け皿 WORK_REG がある', src.indexOf('let WORK_REG = {') >= 0 || src.indexOf('let WORK_REG={') >= 0);
    t(nm + '：hubSetWorkDefs で入れる', src.indexOf('hubSetWorkDefs') >= 0);
    t(nm + '：既定は 11 項目・3グループ', src.indexOf('DEFAULT_WORK_ITEMS') >= 0 && src.indexOf('DEFAULT_WORK_GROUPS') >= 0);
    t(nm + '：★控えのキーに2つ入れてある', src.indexOf("'workItems'") >= 0 && src.indexOf("'workGroups'") >= 0);
  }
  t('★スケジュールは描画の【前】に入れる（useMemo・useEffect にしない）',
    /useMemo\(\(\)=>\{ *hubSetWorkDefs/.test(ix) || ix.indexOf('useMemo(()=>{ hubSetWorkDefs(workItemsRaw, workGroupsShared)') >= 0);
  t('★スマホも描画の前に入れる', /useMemo\(\(\)=>\{hubSetWorkDefs/.test(mb));
  t('★保存先は共有の2つのキー（どちらも配列）',
    ix.indexOf("useShared(STOR+'workItems'") >= 0 && ix.indexOf("useShared(STOR+'workGroups'") >= 0);
  t('★スマホに編集の画面は入れない（直すのは PC だけ）', mb.indexOf('WorksEditModal') < 0);
  t('スマホのまとめ読みに2つ入っている', mb.indexOf("STOR+'workItems'") >= 0 && mb.indexOf("STOR+'workGroups'") >= 0);
  t('★顧客リストは主作業を持たない（版だけ）', cu.indexOf('WorksEditModal') < 0);
  t('★取りこぼしの検査にも2つ足してある', kc.indexOf("'workItems'") >= 0 && kc.indexOf("'workGroups'") >= 0);
  t('★紙の控えは控えの workItems から名前を引く', hp.indexOf("P('workItems')") >= 0 && hp.indexOf('workDefP') >= 0);
  t('★紙の控えは古い表も残してある（昔の id）', hp.indexOf('WORKS_OLD_P') >= 0 && hp.indexOf('M12') >= 0);
  t('★ぜんぶ隠せない守りがある', ix.indexOf('ぜんぶ隠すことはできません') >= 0);
  t('★BLOCK-C は workBadgeText(row) を呼ぶだけ（手を入れていない）',
    ix.indexOf('workBadgeText(row)') >= 0 && ix.indexOf('const workBadgeText') >= 0);
  t('★昔の作業（WORKS_OLD）は残してある', ix.indexOf('WORKS_OLD') >= 0 && mb.indexOf('WORKS_OLD') >= 0);
  t('★マッハで止める作業は設定から作る', ix.indexOf('machBlockKeys') >= 0 && mb.indexOf('machBlockKeys') >= 0);
  t('★入庫制限の解除の一覧も設定から作る', ix.indexOf('EXEMPT_LIST = () =>') >= 0 && /worksNow\(\)\.forEach/.test(ix));

  // ── 2026-11-13 の2つ（月数は点検だけ／点検でも場所を分ける）の見張り
  const lineWith = (src, needle) => (src.split(String.fromCharCode(10)).find(l => l.indexOf(needle) >= 0) || '');
  for (const [nm, src] of [['スケジュール', ix], ['スマホ', mb]]) {
    t(nm + '：★グループに「月数を聞く」の印がある', src.indexOf('workGrpAsksMon') >= 0);
    t(nm + '：★印の無い古い控えは g1（点検）だけ月数を聞く',
      src.indexOf("String(g.id) === 'g1'") >= 0 || src.indexOf("String(g.id)==='g1'") >= 0);
    t(nm + '：★workSubOf は印の無い区画では月数を返さない',
      src.indexOf('if (!workGrpAsksMon(w)) return null') >= 0 || src.indexOf('if(!workGrpAsksMon(w))return null') >= 0);
    t(nm + '：★workMonOf は wkmon をそのまま返す（昔のバッジの月数を消さない）',
      src.indexOf("const workMonOf = (row) => String((row && row.wkmon) || '')") >= 0 ||
      src.indexOf("const workMonOf=(row)=>String((row&&row.wkmon)||'')") >= 0);
    for (const id of ['メンパ', '無点', '有点']) {
      t(nm + '：★点検（' + id + '）は はじめから「場所を分ける」',
        lineWith(src, "id:'" + id + "'").replace(/ /g, '').indexOf('place:true') >= 0,
        lineWith(src, "id:'" + id + "'").trim().slice(0, 60));
    }
    t(nm + '：★カードは workPlaceOn で出す（作業の id を名指ししない）',
      src.indexOf('{workPlaceOn(form.work)&&(') >= 0 || src.indexOf('{workPlaceOn(form.work) && (') >= 0);
  }
  t('★予約カードの窓の中でも直せる（B案・2026-11-13）',
    ix.indexOf('data-wkedit') >= 0 && ix.indexOf('data-wkerow') >= 0 && ix.indexOf('onSaveWorks') >= 0);
  t('★窓の中の保存先は 表とまったく同じ2つのキー', /onSaveWorks={saveWorkDefs}/.test(ix));
  t('★「表示中／隠し中」の字（②案・2026-11-13）', ix.indexOf("'隠し中':'表示中'") >= 0 && ix.indexOf('使う/隠す') < 0);
  t('★窓の中では マッハ・場所・グループを直させない', ix.indexOf('data-wkemach') < 0 && ix.indexOf('data-wkeplace') < 0 && ix.indexOf('data-wkegname') < 0);
  t('★編集の表にグループの 🗓（月数を聞く）がある', ix.indexOf('data-weditgmon') >= 0 && ix.indexOf('togGrpMon') >= 0);
  t('★月数を聞かない区画の行は「—」で出す', ix.indexOf('data-weditnomon') >= 0);
  t('★作業の id を名指しした決め打ちを書かない（有点なら12 をやめた）',
    ix.indexOf("id === '有点'") < 0 && mb.indexOf("id==='有点'") < 0);

  console.log(String.fromCharCode(10) + (fail ? '❌ FAIL' : '✅ PASS') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
