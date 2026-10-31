// スマホ：① 一般予約（整備）のカードにも「事前入庫」を付ける ② 日付送りに週ごと・月ごとを足す
//   （2026-10-31 ユーザー要望：
//     「スマホの一般予約のカードの中に、車検のように事前入庫と、納車日を設定するを加えてください」
//     「スマホのスケジュールの、日付をスキップするのに1日ずつしかできないので、
//       パソコンのように週ごとと月ごとも入れてほしい」）
//   ・納車日は前から付いている（ここでは一般予約でも出ることを確かめるだけ）
//   ・事前入庫は PC版が 2026-09-19 から整備でも持っている。スマホがその追いつき
//   実行: node mobile_entry_jump_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8377, STOR = 'hub-v8-dev-';
const SRC = process.env.SRC || 'mobile.html';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log('\n■ ' + s);
const seeText = async (page, s, ms = 12000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
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
// 月またぎの事故を避けるため、検査はいつも「その月の10日」を起点にする
const base = new Date(); base.setDate(10);
const Y = base.getFullYear(), M = base.getMonth(), D = 10;
const DK = Y + '-' + (M + 1) + '-' + D;
const back = (n) => { const x = new Date(Y, M, D - n); return x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(); };
const PREV = back(1);                                  // 前の日＝事前入庫の日
const ymd = (o) => o.y + '-' + (o.m + 1) + '-' + o.d;

(async () => {
  const seed = {
    [STOR + 'insp']: { [DK]: [] },
    // 10日の整備1件（事前入庫なし）と、10日に入庫して11日に作業する整備1件
    [STOR + 'honten-sched']: {
      [DK]: { '13:00': { id: 31, name: '整備次郎', carType: 'ジムニー', work: 'Q', content: 'オイル交換' } },
      [Y + '-' + (M + 1) + '-' + (D + 1)]: { '09:30': { id: 32, name: '前入花子', carType: 'アルト', work: 'Q', content: 'タイヤ交換', entryDate: DK } },
    },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-cdow-v2']: [], [STOR + 'honten-cdate']: [], [STOR + 'honten-cdow']: [],
    [STOR + 'sanda-cdow-v2']: [], [STOR + 'sanda-cdate']: [], [STOR + 'sanda-cdow']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 850 }, isMobile: true, hasTouch: true });
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
  await page.goto('http://localhost:' + PORT + '/' + SRC, { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('江川京志')); if (b) b.click(); });
  await seeText(page, 'カレンダー', 25000);

  // ── スケジュール画面へ ──
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => /^(⏰ )?スケジュール$/.test(e.innerText.trim()) && e.offsetParent !== null);
    const target = d.length ? d[d.length - 1].parentElement : null;
    if (target) target.click();
  });
  await page.waitForTimeout(1500);
  await seeText(page, 'タイムスケジュール', 12000);
  // 検査の起点＝その月の10日にそろえる
  await page.evaluate(([y, m, d]) => {
    const t = new Date(), cur = t.getDate();
    window.__want = { y, m, d };
  }, [Y, M, D]);
  const toDay = async (want) => {
    for (let i = 0; i < 40; i++) {
      const now = await page.evaluate(() => {
        const e = [...document.querySelectorAll('div')].find(x => /^\d+月\d+日（.）$/.test(x.innerText.trim()));
        return e ? e.innerText.trim() : '';
      });
      if (now === want) return true;
      await page.evaluate(() => { const b = document.querySelector('[data-daystep="-1"]'); if (b) b.click(); });
      await page.waitForTimeout(120);
    }
    return false;
  };
  const dayLabel = async () => page.evaluate(() => {
    const e = [...document.querySelectorAll('div')].find(x => /^\d+月\d+日（.）$/.test(x.innerText.trim()));
    return e ? e.innerText.trim() : '';
  });
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const label = (y, m0, d) => (m0 + 1) + '月' + d + '日（' + DOW[new Date(y, m0, d).getDay()] + '）';
  await toDay(label(Y, M, D));

  head('② スケジュールの日付送りに週ごと・月ごと');
  t('★「‹ 1週」「1週 ›」のボタンがある', (await page.$$eval('[data-datejump]', a => a.map(x => x.innerText.trim()))).join(',').indexOf('1週') >= 0,
    await page.$$eval('[data-datejump]', a => a.map(x => x.innerText.trim())));
  t('★「‹ 1か月」「1か月 ›」のボタンがある', (await page.$$eval('[data-datejump]', a => a.map(x => x.innerText.trim()))).filter(x => x.indexOf('1か月') >= 0).length === 2);
  t('★指で押せる大きさ（34px以上）', (await page.$$eval('[data-datejump]', a => a.every(x => x.getBoundingClientRect().height >= 34))));
  t('いまは起点の日を見ている', (await dayLabel()) === label(Y, M, D), await dayLabel());

  await page.click('[data-datejump="d7"]'); await page.waitForTimeout(300);
  t('★「1週 ›」で7日先になる', (await dayLabel()) === label(Y, M, D + 7), await dayLabel());
  await page.click('[data-datejump="d-7"]'); await page.waitForTimeout(300);
  t('★「‹ 1週」で元に戻る', (await dayLabel()) === label(Y, M, D), await dayLabel());
  await page.click('[data-datejump="m1"]'); await page.waitForTimeout(300);
  t('★「1か月 ›」で翌月の同じ日になる', (await dayLabel()) === label(Y, M + 1, D), await dayLabel());
  await page.click('[data-datejump="m-1"]'); await page.waitForTimeout(300);
  t('★「‹ 1か月」で元に戻る', (await dayLabel()) === label(Y, M, D), await dayLabel());
  // ★前日・翌日は日付のすぐ両隣に置き、ボタンだと一目で分かる形にする（2026-10-31 ユーザー指示）
  const step = await page.$$eval('[data-daystep]', a => a.map(x => {
    const r = x.getBoundingClientRect();
    return { t: x.innerText.replace(/\s+/g, ''), w: r.width, h: r.height, left: r.left, right: r.right };
  }));
  t('1日ずつの送りは2つ残っている', step.length === 2, step);
  t('★「前日」「翌日」と字が入っていて、ボタンだと分かる', step.length === 2 && step[0].t.indexOf('前日') >= 0 && step[1].t.indexOf('翌日') >= 0, step);
  t('★指で押せる大きさ（44px以上）', step.length === 2 && step.every(b => b.h >= 44 && b.w >= 44), step);
  const near = await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(x => /^\d+月\d+日（.）$/.test(x.innerText.trim()));
    const bs = [...document.querySelectorAll('[data-daystep]')];
    if (!d || bs.length !== 2) return null;
    const r = d.getBoundingClientRect();
    return { left: Math.round(r.left - bs[0].getBoundingClientRect().right), right: Math.round(bs[1].getBoundingClientRect().left - r.right) };
  });
  t('★日付のすぐ左隣にある（すき間20px以内）', !!near && near.left >= 0 && near.left <= 20, near);
  t('★日付のすぐ右隣にある（すき間20px以内）', !!near && near.right >= 0 && near.right <= 20, near);
  t('★日付の下に字を出さない', await page.evaluate(() => !document.body.innerText.includes('スワイプで日付移動')));

  head('① 一般予約（整備）のカード');
  await page.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.innerText && x.innerText.indexOf('整備次郎') >= 0);
    let n = e; for (let i = 0; i < 6 && n; i++) { if (n.onclick) break; n = n.parentElement; }
    (n || e).click();
  });
  await page.waitForTimeout(1000);
  let txt = await page.innerText('body');
  t('整備の編集カードが開く', txt.indexOf('整備の編集') >= 0);
  t('★「＋ 事前入庫にする（前の日から）」が出る', txt.indexOf('事前入庫にする') >= 0, txt.slice(0, 200));
  t('★「＋ 納車日を設定する」も出る（前からある分）', txt.indexOf('納車日を設定する') >= 0);

  // 事前入庫にしてみる
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.indexOf('事前入庫にする') >= 0); if (b) b.click(); });
  await page.waitForTimeout(400);
  txt = await page.innerText('body');
  t('★押すと「🚗 事前入庫：MM/DD に入庫」が出る', /🚗 事前入庫：\d\d\/\d\d に入庫/.test(txt), txt.slice(0, 300));
  const entVal = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[type=date]')];
    return ins.map(i => i.value);
  });
  t('★既定は「前の日」', entVal.indexOf([Y, String(M + 1).padStart(2, '0'), String(D - 1).padStart(2, '0')].join('-')) >= 0, entVal);
  // 保存する
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.indexOf('予約確定') >= 0); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const saved = await page.evaluate((k) => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    let doc = st[k];
    if (doc && typeof doc.v === 'string') { try { doc = JSON.parse(doc.v); } catch (e) {} }
    return doc || null;
  }, 'kv/' + STOR + 'honten-sched');
  const savedRow = saved && saved[DK] && saved[DK]['13:00'];
  t('★入庫日が保存される', !!savedRow && String(savedRow.entryDate || '') === PREV, savedRow || saved);

  head('① 事前入庫の日の画面に出る');
  // 10日に入庫して11日に作業する「前入花子」は、10日の日のカードに出るはず
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter(e => /^(📅 )?カレンダー$/.test(e.innerText.trim()) && e.offsetParent !== null);
    const target = d.length ? d[d.length - 1].parentElement : null;
    if (target) target.click();
  });
  await page.waitForTimeout(1200);
  // カレンダーで起点の日を開く
  await page.evaluate((d) => {
    const b = [...document.querySelectorAll('button,div')].filter(e => e.innerText.trim() === String(d) && e.offsetParent !== null);
    if (b.length) b[b.length - 1].click();
  }, D);
  await page.waitForTimeout(1200);
  txt = await page.innerText('body');
  t('★整備の事前入庫が「🚗 事前入庫」の箱に出る', txt.indexOf('事前入庫') >= 0 && txt.indexOf('前入花子') >= 0, txt.slice(0, 400));
  t('★行の右に「→ M/D整備」と出る（車検と見分けがつく）', /→ \d+\/\d+整備/.test(txt), txt.slice(0, 400));
  t('整備の事前入庫には入庫済みチェックを出さない', (await page.$$eval('[data-dropoff="sched"]', a => a.length)) >= 1);

  head('② 日のカードにも週ごと・月ごと');
  const cardLabel = async () => page.evaluate(() => {
    const e = [...document.querySelectorAll('div')].find(x => /^\d+月\d+日（.）$/.test(x.innerText.trim()));
    return e ? e.innerText.trim() : '';
  });
  t('★5つの送りボタンが出る', (await page.$$eval('[data-dayjump]', a => a.length)) === 5, await page.$$eval('[data-dayjump]', a => a.map(x => x.innerText.trim())));
  await page.click('[data-dayjump="d7"]'); await page.waitForTimeout(400);
  t('★「1週 ›」で7日先の日のカードになる', (await cardLabel()) === label(Y, M, D + 7), await cardLabel());
  await page.click('[data-dayjump="m1"]'); await page.waitForTimeout(400);
  t('★「1か月 ›」でさらに1か月先', (await cardLabel()) === label(Y, M + 1, D + 7), await cardLabel());
  await page.click('[data-dayjump="today"]'); await page.waitForTimeout(400);
  const td = new Date();
  t('★「本日」で今日に戻る', (await cardLabel()) === label(td.getFullYear(), td.getMonth(), td.getDate()), await cardLabel());
  t('カードは閉じていない（送りボタンがまだ出ている）', (await page.$$eval('[data-dayjump]', a => a.length)) === 5);
  const cstep = await page.$$eval('[data-daynav]', a => a.map(x => {
    const r = x.getBoundingClientRect();
    return { t: x.innerText.replace(/\s+/g, ''), w: r.width, h: r.height };
  }));
  t('★日のカードも「前日」「翌日」の字つきボタン', cstep.length === 2 && cstep[0].t.indexOf('前日') >= 0 && cstep[1].t.indexOf('翌日') >= 0, cstep);
  t('★日のカードも指で押せる大きさ（44px以上）', cstep.length === 2 && cstep.every(b => b.h >= 44 && b.w >= 44), cstep);
  const cnear = await page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(x => /^\d+月\d+日（.）$/.test(x.innerText.trim()));
    const bs = [...document.querySelectorAll('[data-daynav]')];
    if (!d || bs.length !== 2) return null;
    const r = d.getBoundingClientRect();
    return { left: Math.round(r.left - bs[0].getBoundingClientRect().right), right: Math.round(bs[1].getBoundingClientRect().left - r.right) };
  });
  t('★日のカードも日付のすぐ両隣（すき間20px以内）', !!cnear && cnear.left >= 0 && cnear.left <= 20 && cnear.right >= 0 && cnear.right <= 20, cnear);
  t('★日のカードも日付の下に字を出さない', await page.evaluate(() => !/車検 \d+台 \/ 整備 \d+件/.test(document.body.innerText)));

  head('月の終わりでもはみ出さない');
  const over = await page.evaluate(() => {
    // 1/31 の1か月先は 2/28（または 2/29）であること
    const f = (y, m, d, delta) => { const last = new Date(y, m + delta + 1, 0).getDate(); const nd = new Date(y, m + delta, Math.min(d, last)); return (nd.getMonth() + 1) + '/' + nd.getDate(); };
    return { a: f(2026, 0, 31, 1), b: f(2026, 2, 31, -1) };
  });
  t('1/31 の1か月先は 2/28', over.a === '2/28', over);
  t('3/31 の1か月前は 2/28', over.b === '2/28', over);

  t('JSエラーなし', errs.length === 0, errs);
  await browser.close(); server.close();
  console.log('\n──────── 結果 ' + pass + ' 件合格 / ' + fail + ' 件不合格 ────────');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
