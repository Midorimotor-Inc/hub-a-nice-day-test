// スマホの予約カードの電話番号欄の検査（2026-10-06 ユーザー要望：車検・一般とも）
//   ・車検のカードに「電話」と「住所」が出る（PC版と同じ並び）
//   ・一般整備のカードには「電話」だけ出る（住所は車検だけ）
//   ・入れて保存すると、その予約に残る
//   ・入っていれば 📞 でそのままかけられる（記号は外して tel: にする）
//   ・iPhone が勝手に拡大しないよう16px以上
//   実行: node mobile_phone_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const NL = String.fromCharCode(10);
const DIR = __dirname, PORT = 8302, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const head = s => console.log(NL + '■ ' + s);
const seeText = async (page, s, ms = 10000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x) && e.offsetParent !== null); if (b) { b.click(); return true; } return false; }, s);

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
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const now = new Date();
const TODAY = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 開いている予約カードの「電話」欄を調べる
const phoneInfo = page => page.evaluate(() => {
  const lab = [...document.querySelectorAll('label')].find(e => /^電話/.test(e.innerText.trim()) && e.offsetParent !== null);
  if (!lab) return null;
  const inp = lab.parentElement && lab.parentElement.querySelector('input');
  if (!inp) return null;
  return { type: inp.type, ph: inp.placeholder || '', fs: parseFloat(getComputedStyle(inp).fontSize) };
});
const typePhone = (page, v) => page.evaluate(val => {
  const lab = [...document.querySelectorAll('label')].find(e => /^電話/.test(e.innerText.trim()) && e.offsetParent !== null);
  const inp = lab && lab.parentElement && lab.parentElement.querySelector('input');
  if (!inp) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, val);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, v);
const hasLabel = (page, re) => page.evaluate(r =>
  [...document.querySelectorAll('label')].some(e => new RegExp(r).test(e.innerText.trim()) && e.offsetParent !== null), re);

(async () => {
  const seed = {
    [STOR + 'insp']: { [TODAY]: [{ name: '車検テスト', carType: 'アルト', no: '3503', course: 2, time: '09:00', store: 'honten', seq: 1, id: 1 }] },
    [STOR + 'honten-sched']: { [TODAY]: { '10:00': { name: '整備テスト', carType: 'ワゴンR', work: 'Q', content: 'オイル交換', store: 'honten', at: 2, id: 2 } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
  };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (p.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')); return; }
    fs.readFile(path.join(DIR, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(signedInInit, [ME, STOR]);
  ctx.route('https://www.gstatic.com/firebasejs/**', route => {
    const u = route.request().url();
    const extra = NL + '(function(){ const s=' + JSON.stringify(seed) + '; for (const k in s) window.__fakeFb.set(k, s[k]); })();';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: (u.indexOf('firebase-app-compat') >= 0) ? FAKE_FB + extra : '' });
  });
  ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:' + PORT + '/mobile.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 25000); await clickText(page, '江川京志');
  await seeText(page, 'カレンダー', 25000);
  // スケジュール画面へ
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter(e => e.innerText.trim() === 'スケジュール' && e.offsetParent !== null); if (d.length) (d[d.length - 1].parentElement || d[0]).click(); });
  await page.waitForTimeout(1800);

  head('① 車検の予約カード');
  await page.getByText('車検テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('車検のカードが開く', await hasLabel(page, '^氏名'));
  const p1 = await phoneInfo(page);
  t('★電話の欄がある', !!p1, p1);
  t('電話のキーボードが出る（type=tel）', !!p1 && p1.type === 'tel', p1 && p1.type);
  t('例の表示が出る', !!p1 && /0000/.test(p1.ph), p1 && p1.ph);
  t('16px以上（iPhoneが勝手に拡大しない）', !!p1 && p1.fs >= 16, p1 && p1.fs);
  // ★A案（2026-10-20）：電話は1行まるごと／住所はボタン＋シート＋Google マップ
  const telW = await page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find(e => /^電話/.test(e.innerText.trim()) && e.offsetParent !== null);
    const inp = lab.parentElement.querySelector('input');
    return Math.round(inp.getBoundingClientRect().width);
  });
  t('★電話の欄が広い（1行まるごと・200px超）', telW > 200, telW + 'px');
  t('★住所は入力欄ではなくボタンになっている', await page.evaluate(() => {
    const b2 = [...document.querySelectorAll('button')].find(e => /住所|📍/.test(e.innerText) && e.offsetParent !== null);
    return !!b2;
  }));
  t('★住所ボタンを押すとシートが開く', await page.evaluate(() => {
    const b2 = [...document.querySelectorAll('button')].find(e => /住所|📍/.test(e.innerText) && e.offsetParent !== null);
    if (!b2) return false; b2.click(); return true;
  }) && await seeText(page, 'Google マップ', 4000));
  // シートの入力欄に住所を打つ → マップのボタンが使えるようになる
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input')].find(e => e.placeholder === '市区町村から' && e.offsetParent !== null);
    if (!inp) return false;
    const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    st.call(inp, '神戸市北区八多町中890-1'); inp.dispatchEvent(new Event('input', { bubbles: true })); return true;
  });
  await page.waitForTimeout(500);
  t('★住所を入れるとマップのリンクが住所つきで出る', await page.evaluate(() => {
    const a2 = [...document.querySelectorAll('a')].find(e => /Google/.test(e.innerText));
    return !!(a2 && a2.href.indexOf('google.com/maps') >= 0 && decodeURIComponent(a2.href).indexOf('八多町') >= 0);
  }), await page.evaluate(() => { const a2=[...document.querySelectorAll('a')].find(e=>/Google/.test(e.innerText)); return a2?decodeURIComponent(a2.href).slice(0,95):'(無い)'; }));
  // 住所を消すとマップは押せなくなる（a ではなく div になる）
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input')].find(e => e.placeholder === '市区町村から' && e.offsetParent !== null);
    const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    st.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  t('★住所が空の時はマップを押せない（リンクにしない）', await page.evaluate(() => {
    const any = [...document.querySelectorAll('a,div')].find(e => /Google マップで開く/.test(e.innerText) && e.children.length === 0);
    return !!any && any.tagName !== 'A';
  }), await page.evaluate(() => { const any=[...document.querySelectorAll('a,div')].find(e=>/Google マップで開く/.test(e.innerText)&&e.children.length===0); return any?any.tagName:'(無い)'; }));
  // 住所を戻してから次へ
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input')].find(e => e.placeholder === '市区町村から' && e.offsetParent !== null);
    const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    st.call(inp, '神戸市北区八多町中890-1'); inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b2=[...document.querySelectorAll('button')].find(e=>/とじる/.test(e.innerText)&&e.offsetParent!==null); if(b2)b2.click(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').join(__dirname, 'smoke-mobile-addr.png') });
  t('車検には住所がある（PC版と同じ。スマホはボタン）', await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /住所|📍/.test(e.innerText) && e.offsetParent !== null)));

  // ★ナンバー4桁（2026-10-17 ユーザー要望：スマホにも欲しい・車名の下に1行）
  const noInfo = await page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find(e => /^ナンバー/.test(e.innerText.trim()) && e.offsetParent !== null);
    if (!lab) return null;
    const inp = lab.parentElement && lab.parentElement.querySelector('input');
    if (!inp) return null;
    const labs = [...document.querySelectorAll('label')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim().split(' ')[0]);
    return { ph: inp.placeholder || '', im: inp.getAttribute('inputmode') || '', fs: parseFloat(getComputedStyle(inp).fontSize),
      afterCar: labs.indexOf('ナンバー') > labs.findIndex(x => /^車種/.test(x)) };
  });
  t('★ナンバーの欄がある', !!noInfo, noInfo);
  t('★車種より下にある（車名の下に1行）', !!noInfo && noInfo.afterCar, noInfo);
  t('数字キーパッドが出る（スマホはそのまま）', !!noInfo && noInfo.im === 'numeric', noInfo);
  t('16px以上（iPhoneが勝手に拡大しない）', !!noInfo && noInfo.fs >= 16, noInfo);
  t('★全角で打っても半角4桁になる', await page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find(e => /^ナンバー/.test(e.innerText.trim()) && e.offsetParent !== null);
    const inp = lab.parentElement.querySelector('input');
    const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    st.call(inp, '３３１０'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }) && await (async () => { await page.waitForTimeout(400); return page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find(e => /^ナンバー/.test(e.innerText.trim()) && e.offsetParent !== null);
    return lab.parentElement.querySelector('input').value === '3310';
  }); })());

  t('電話番号を入れられる', await typePhone(page, '090-1234-5678'));
  await page.waitForTimeout(400);
  t('入っていると 📞 が出る', await page.evaluate(() =>
    [...document.querySelectorAll('a')].some(a => a.innerText.indexOf('📞') >= 0 && a.offsetParent !== null)));
  t('発信先から記号（ハイフン）が外れている', await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => x.innerText.indexOf('📞') >= 0 && x.offsetParent !== null);
    return !!a && a.getAttribute('href') === 'tel:09012345678';
  }), await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(x => x.innerText.indexOf('📞') >= 0); return a ? a.getAttribute('href') : null; }));

  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(3500);
  const savedInsp = await page.evaluate(([stor, dk]) => {
    const rows = (window.__fakeFb.get(stor + 'insp') || {})[dk] || [];
    const r = rows.find(x => x && String(x.name || '').indexOf('車検テスト') >= 0);
    return r ? (r.phone || '') : null;
  }, [STOR, TODAY]);
  t('★保存すると車検の予約に電話番号が残る', savedInsp === '090-1234-5678', savedInsp);

  head('② 一般整備の予約カード');
  await page.waitForTimeout(600);
  await page.getByText('整備テスト', { exact: false }).last().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  t('整備のカードが開く', await hasLabel(page, '^氏名'));
  const p2 = await phoneInfo(page);
  t('★電話の欄がある', !!p2, p2);
  t('16px以上', !!p2 && p2.fs >= 16, p2 && p2.fs);
  t('整備には住所の欄は出さない（PC版と同じ）', (await hasLabel(page, '^住所')) === false);
  t('電話番号を入れられる', await typePhone(page, '078-123-4567'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(3500);
  const savedSched = await page.evaluate(([stor, dk]) => {
    const d = (window.__fakeFb.get(stor + 'honten-sched') || {})[dk] || {};
    for (const sk in d) if (d[sk] && String(d[sk].name || '').indexOf('整備テスト') >= 0) return d[sk].phone || '';
    return null;
  }, [STOR, TODAY]);
  t('★保存すると整備の予約に電話番号が残る', savedSched === '078-123-4567', savedSched);

  t('画面のエラーは出ていない', errs.length === 0, errs.slice(0, 3));

  await ctx.close(); await browser.close(); server.close();
  console.log(NL + '━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
