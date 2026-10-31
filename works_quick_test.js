// 作業内容まわりの検査（2026-10-31 ユーザー決定の4つ）
//   ① 作業項目（主作業）は 11 個。⑫ / M12 / M6 / M1 / N1 / N6 は選べない
//   ② 作業のバッジを選んだら、内容欄が【空のときだけ】作業名を入れる（A案）。
//      すでに書いてあれば触らない。「その他」は入れない
//   ③ クイック整備・修理（Q）を選んだ時だけ「リフト作業／ピット作業」が出る。
//      両方えらべる。どちらも選ばなければ＝ふつう
//   ④ 入庫制限の解除は Q だけ3通り（ふつう／リフト／ピット）。
//      両方えらんだ時は【両方が解除されていないと通さない】
//   おまけ：昔の予約（M6 など）は保存されている字のまま出す／PC のクイックメニュー（グループ区画）
//   実行: node works_quick_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8411, STOR = 'hub-v8-dev-';
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
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// 消えた6つ（昔の予約には残るが、もう選べない）
const GONE = ['12ヶ月点検', 'メンパ12ヶ月点検', 'メンパ6ヶ月点検', 'メンパ1ヶ月点検', '新車1ヶ月点検', '新車6ヶ月点検'];

(async () => {
  const seed = {
    [STOR + 'insp']: {},
    // ★昔の予約（M6）を1件入れておく＝保存されている字のまま出るかを見る
    [STOR + 'honten-sched']: { [DK]: { '13:00': { name: 'むかし太郎', work: 'M6', staff: '江川京志', id: 1, carType: 'アルト' } } },
    [STOR + 'sanda-sched']: {},
    [STOR + 'honten-staff-v2']: [{ uid: 'h7', name: '江川京志', myNumber: 7, badge: 'bodywork', store: 'honten' }],
    [STOR + 'sanda-staff-v2']: [],
    [STOR + 'honten-memo']: {}, [STOR + 'sanda-memo']: {},
    // ★ピット作業だけ解除してある（ふつうの Q とリフト作業は通らない）
    'honten-schedRestrictions': { [DK]: { ranges: [{ startTime: '09:00', endTime: '11:00' }], exemptWorks: ['Q:pit', '保', '納'] } },
    [STOR + 'setItems']: [
      { id: 'sq1', g: 'g1', label: '1ヶ月', text: '1ヶ月' },
      { id: 'sq3', g: 'g1', label: '12ヶ月', text: '12ヶ月' },
      { id: 'si1', g: 'g2', label: 'Eオイル交換', text: 'エンジンオイル交換' },
      { id: 'si5', g: 'g3', label: 'レッカー搬入', text: 'レッカー搬入' },
    ],
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
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); await d.accept().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/index_dev.html', { waitUntil: 'domcontentloaded' });
  await seeText(page, '江川京志', 20000); await clickText(page, '江川京志'); await clickText(page, 'でログイン');
  await seeText(page, 'スケジュール', 20000); await clickText(page, 'このまま使う');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('スケジュール') && el.offsetParent !== null && el.textContent.replace(/\s/g, '').length < 12); if (b) b.click(); });
  await page.waitForTimeout(1500);

  // ── 道具 ───────────────────────────────────────────────
  const closeCard = async () => {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /^✕|×/.test(e.innerText.trim()) && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(500);
  };
  // ★入庫制限の設定画面は自分の覆い（zIndex 2000）を押して閉じる。
  //   予約カードの ✕ を探すやり方だと別のボタンを押してしまい、
  //   設定画面が開いたまま次のカードの「保存」を押すことになる（2026-10-31 に踏んだ）。
  const closeRestr = async () => {
    await page.evaluate(() => { const o=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).zIndex==='2000'); if(o)o.click(); });
    await page.waitForTimeout(600);
  };
  const openEmptyAt = async (slot) => {
    await page.evaluate(s => {
      const row = [...document.querySelectorAll('tr')].find(r => r.innerText.indexOf(s) === 0);
      if (!row) return false;
      const inner = [...row.querySelectorAll('div,td')].find(e => /クリックして追加/.test(e.innerText || ''));
      (inner || row).click();
      return true;
    }, slot);
    await page.waitForTimeout(800);
    return page.evaluate(() => /予約カード/.test(document.body.innerText));
  };
  const openWorkPop = async () => {
    for (let i = 0; i < 3; i++) {
      if (await page.evaluate(() => !!document.querySelector('[data-wkid]'))) return true;
      await page.evaluate(() => { const d = document.querySelector('[data-kbkey="work"]'); if (d) d.click(); });
      await page.waitForTimeout(450);
    }
    return page.evaluate(() => !!document.querySelector('[data-wkid]'));
  };
  const pickWork = async (word) => {
    await openWorkPop();
    const ok = await page.evaluate(w => {
      const it = [...document.querySelectorAll('[data-wkid]')].find(e => (e.innerText || '').includes(w));
      if (!it) return false;
      it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // 選択は mousedown で確定する作り
      return true;
    }, word);
    await page.waitForTimeout(350);
    return ok;
  };
  const noteVal = () => page.evaluate(() => {
    const m = document.querySelector('.booking-modal-inner') || document;
    const ta = [...m.querySelectorAll('textarea')].find(e => e.offsetParent !== null);
    return ta ? ta.value : null;
  });
  const setNote = (v) => page.evaluate(x => {
    const m = document.querySelector('.booking-modal-inner') || document;
    const ta = [...m.querySelectorAll('textarea')].find(e => e.offsetParent !== null);
    if (!ta) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    s.call(ta, x); ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, v);
  const fillNameCar = (n) => page.evaluate(nm => {
    const modal = document.querySelector('.booking-modal-inner') || document;
    const boxes = [...modal.querySelectorAll('input')].filter(e => e.offsetParent !== null && !['date', 'checkbox', 'radio', 'number'].includes(e.type));
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const byPh = p => boxes.find(e => (e.placeholder || '').indexOf(p) >= 0);
    const nameBox = byPh('お客様名') || boxes[0];
    const carBox = byPh('例：プリウス');
    if (nameBox) set(nameBox, nm);
    if (carBox) set(carBox, 'テスト車');
    return !!nameBox;
  }, n);
  const saveCard = async () => {
    alerts.length = 0;
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /予約確定|保存/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
    await page.waitForTimeout(2200);
  };
  const savedRow = (name) => page.evaluate(([k, nm]) => {
    const sd = window.__fakeFb.get(k) || {};
    for (const dk in sd) for (const sl in sd[dk]) { const r = sd[dk][sl]; if (r && r.name === nm) return JSON.parse(JSON.stringify(r)); }
    return null;
  }, [STOR + 'honten-sched', name]);

  // ══ ① 作業項目は11個 ══════════════════════════════════
  head('① 作業項目（主作業）は 11 個');
  t('予約カードが開く（13:00 は空いていないので 15:00）', await openEmptyAt('15:00'));
  await openWorkPop();
  const wk = await page.evaluate(() => [...document.querySelectorAll('[data-wkid]')].map(e => ({ id: e.getAttribute('data-wkid'), txt: (e.innerText || '').trim() })));
  t('★11 個だけ出る', wk.length === 11, wk.map(x => x.id));
  t('★並びは Q / メンパ / 有点 / 無点 / B / R / 商 / 保 / 試 / 納 / 他',
    wk.map(x => x.id).join(',') === 'Q,メンパ,有点,無点,B,R,商,保,試,納,他', wk.map(x => x.id));
  t('★「メンパ」がある', wk.some(x => x.id === 'メンパ' && /メンパ/.test(x.txt)));
  t('★「有点 有料点検」がある', wk.some(x => x.id === '有点' && /有料点検/.test(x.txt)));
  t('★「無点 無料点検」がある', wk.some(x => x.id === '無点' && /無料点検/.test(x.txt)));
  for (const g of GONE) t('★「' + g + '」は選べない', !wk.some(x => x.txt.indexOf(g) >= 0), wk.map(x => x.txt));
  t('★リフト作業・ピット作業は主作業に入れない（入庫制限の中だけの話）',
    !wk.some(x => /リフト作業|ピット作業/.test(x.txt)), wk.map(x => x.txt));

  // ══ ② 内容欄は空のときだけ入れる ═════════════════════════
  head('② 選んだら内容欄が【空のときだけ】作業名を入れる（A案）');
  t('内容欄は最初は空', (await noteVal()) === '');
  await pickWork('メンパ');
  t('★空だったので「メンパ」が入る', (await noteVal()) === 'メンパ', await noteVal());
  await setNote('お客様から電話あり');
  await pickWork('鈑金塗装');
  t('★すでに書いてあれば触らない', (await noteVal()) === 'お客様から電話あり', await noteVal());
  await setNote('');
  await pickWork('その他');
  t('★「その他」は入れない（空のまま）', (await noteVal()) === '', await noteVal());
  await setNote('');
  await pickWork('無料点検');
  t('★「無点」を選ぶと「無料点検」が入る', (await noteVal()) === '無料点検', await noteVal());

  // ══ ③ Q のときだけ リフト／ピット ════════════════════════
  head('③ クイック整備・修理のときだけ「どこで作業するか」が出る');
  t('Q 以外では出ていない', await page.evaluate(() => !document.querySelector('[data-qkrow]')));
  await pickWork('クイック整備');
  t('★Q を選ぶと出る', await page.evaluate(() => !!document.querySelector('[data-qkrow]')));
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].map(e => ({ k: e.getAttribute('data-qkind'), txt: e.innerText.trim() })));
  t('★2つだけ（「ふつう」のボタンは置かない）', kinds.length === 2, kinds);
  t('★リフト作業・ピット作業の順', kinds.map(x => x.k).join(',') === 'lift,pit', kinds);
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="lift"]');if(b)b.click();}); await page.waitForTimeout(250);
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="pit"]');if(b)b.click();}); await page.waitForTimeout(250);
  t('★両方えらべる（複数選択）', await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].filter(e => /✓/.test(e.innerText)).length === 2),
    await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].map(e => e.innerText.trim())));
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="lift"]');if(b)b.click();}); await page.waitForTimeout(250);
  t('もう一度押すと外れる', await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].filter(e => /✓/.test(e.innerText)).length === 1));
  await pickWork('鈑金塗装');
  t('★Q 以外に変えると消える', await page.evaluate(() => !document.querySelector('[data-qkrow]')));
  await pickWork('クイック整備');
  t('★Q に戻すと選び直しから（えらんでいない）', await page.evaluate(() => [...document.querySelectorAll('[data-qkind]')].every(e => !/✓/.test(e.innerText))));
  await closeCard();

  // ══ ④ 入庫制限の解除は Q だけ3通り ═══════════════════════
  head('④ 入庫制限の「制限解除項目」は Q だけ3通り');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /入庫制限/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(900);
  const ex = await page.evaluate(() => document.body.innerText);
  t('設定の画面が開く', /制限解除/.test(ex), ex.slice(0, 200));
  t('★「クイック整備・修理（リフトもピットも使わない）」がある', /リフトもピットも使わない/.test(ex));
  t('★「クイック整備・修理のリフト作業」がある', /クイック整備・修理のリフト作業/.test(ex));
  t('★「クイック整備・修理のピット作業」がある', /クイック整備・修理のピット作業/.test(ex));
  for (const g of GONE) t('★解除の一覧にも「' + g + '」は出ない', ex.indexOf(g) < 0);
  await closeRestr();
  t('★設定の画面は閉じた', await page.evaluate(() => !/制限解除/.test(document.body.innerText)));

  // ══ ⑤ 通し方（ピットだけ解除してある日）═════════════════
  head('⑤ ピット作業だけ解除した日に、どれが通るか（09:00〜11:00 が制限）');
  // ⑤-1 Q＋ピット → 通る
  t('10:00 のカードが開く', await openEmptyAt('10:00'));
  await fillNameCar('ぴっと太郎');
  await pickWork('クイック整備');
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="pit"]');if(b)b.click();}); await page.waitForTimeout(250);
  await saveCard();
  const s1 = await savedRow('ぴっと太郎');
  t('★ピット作業なら入庫制限中でも受けられる', !!s1, { s1, alerts: alerts.slice(0, 2) });
  t('★qkind に pit が入って保存される', !!s1 && Array.isArray(s1.qkind) && s1.qkind.join(',') === 'pit', s1 && s1.qkind);
  t('断りのメッセージは出ない', !alerts.some(a => /入庫制限中/.test(a)), alerts.slice(0, 2));

  // ⑤-2 Q（ふつう）→ 断られる
  t('09:30 のカードが開く（制限の中・別の枠）', await openEmptyAt('09:30'));
  await fillNameCar('ふつう次郎');
  await pickWork('クイック整備');
  await saveCard();
  t('★ふつうのクイック整備は断られる', !(await savedRow('ふつう次郎')), alerts.slice(0, 2));
  t('「入庫制限中です」と出る', alerts.some(a => /入庫制限中/.test(a)), alerts.slice(0, 2));
  await closeCard();

  // ⑤-3 Q＋リフト＋ピット → 両方そろっていないので断られる
  t('10:30 のカードが開く（制限の中・別の枠）', await openEmptyAt('10:30'));
  await fillNameCar('りょうほう三郎');
  await pickWork('クイック整備');
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="lift"]');if(b)b.click();}); await page.waitForTimeout(200);
  await page.evaluate(()=>{const b=document.querySelector('[data-qkind="pit"]');if(b)b.click();}); await page.waitForTimeout(200);
  await saveCard();
  t('★両方えらんだら【両方】解除されていないと通さない', !(await savedRow('りょうほう三郎')), alerts.slice(0, 2));
  await closeCard();

  // ⑤-4 制限の外（13:00 より後）なら ふつうの Q も通る
  t('12:00 のカードが開く', await openEmptyAt('12:00'));
  await fillNameCar('そとの四郎');
  await pickWork('クイック整備');
  await saveCard();
  t('★制限の外ならふつうの Q も通る', !!(await savedRow('そとの四郎')), alerts.slice(0, 2));
  await closeCard();

  // ══ ⑥ 昔の予約は昔の字のまま ═══════════════════════════
  head('⑥ 昔の予約（M6）は保存されている字のまま出す');
  const scr = await page.evaluate(() => document.body.innerText);
  t('★「むかし太郎」の行が出ている', /むかし太郎/.test(scr));
  // ★バッジに出るのは id（M6）。なぞると出る説明（title）が昔の名前のまま
  t('★バッジは M6 のまま出る', await page.evaluate(() => [...document.querySelectorAll('span')].some(e => e.innerText.trim()==='M6' && e.getAttribute('title')==='メンパ6ヶ月点検')),
    await page.evaluate(() => [...document.querySelectorAll('span[title]')].map(e=>e.getAttribute('title')).filter(x=>/メンパ|点検/.test(x)).slice(0,5)));
  t('★データは書き換えていない（work は M6 のまま）',
    await page.evaluate(([k, dk]) => { const v = window.__fakeFb.get(k) || {}; const d = v[dk] || {}; return (d['13:00'] || {}).work === 'M6'; }, [STOR + 'honten-sched', DK]));

  // ══ ⑦ クイックメニュー（PC）═══════════════════════════
  head('⑦ クイックメニュー（グループの区画で全部出す・A案）');
  t('12:30 ではなく 15:00 のカードを開く', await openEmptyAt('15:00'));
  t('★内容欄のとなりに「⚡ クイックメニュー」がある', await page.evaluate(() => !!document.querySelector('[data-quickmenu]')));
  t('★バッジの列は常時出していない（ボタン1つにまとめた）',
    await page.evaluate(() => { const m = document.querySelector('.booking-modal-inner'); return m ? !/Eオイル交換/.test(m.innerText) : false; }));
  await page.evaluate(()=>{const b=document.querySelector('[data-quickmenu]');if(b)b.click();});
  await page.waitForTimeout(700);
  t('★押すと大きく開く', await seeText(page, 'クイックメニュー', 4000));
  t('★グループの区画に分かれている', await page.evaluate(() => document.querySelectorAll('[data-qg]').length >= 4),
    await page.evaluate(() => document.querySelectorAll('[data-qg]').length));
  t('★「点検」「整備・交換」「預かり・搬入」「その他」が出る', await page.evaluate(() => {
    const x = [...document.querySelectorAll('[data-qg]')].map(e => e.innerText).join('|');
    return /点検/.test(x) && /整備・交換/.test(x) && /預かり・搬入/.test(x) && /その他/.test(x);
  }));
  t('★点検のグループに 1ヶ月・12ヶ月が入っている', await page.evaluate(() => {
    const g = [...document.querySelectorAll('[data-qg]')].find(e => /点検/.test(e.innerText));
    return !!g && /1ヶ月/.test(g.innerText) && /12ヶ月/.test(g.innerText);
  }));
  // ★押した判定は pointerdown → pointerup（どちらも入れ物まで伝わらせる）
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-qi]')].find(e => /Eオイル交換/.test(e.innerText)); if (!b) return; const r = b.getBoundingClientRect(); const o = { bubbles: true, clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }; b.dispatchEvent(new MouseEvent('pointerdown', o)); b.dispatchEvent(new MouseEvent('pointerup', o)); });
  await page.waitForTimeout(400);
  t('★押すと内容欄に行として入る', /エンジンオイル交換/.test(String(await noteVal())), await noteVal());
  await page.evaluate(()=>{const b=document.querySelector('[data-qmedit]');if(b)b.click();});
  await page.waitForTimeout(350);
  t('★✎ 編集で「新しいバッジを足す」が出る', await seeText(page, '新しいバッジを足す', 3000));
  t('★編集中は ✎ と ✕ が出る', await page.evaluate(() => {
    const b = document.querySelector('[data-qi]'); if (!b) return false;
    const x = [...b.querySelectorAll('button')].map(e => e.innerText.trim()).join('');
    return x.indexOf('✎') >= 0 && x.indexOf('✕') >= 0;
  }));
  // ★新しいバッジを足して「保存して閉じる」→ setItems / setGroups が書かれる
  await page.evaluate(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('input')].filter(e => /ボタンに出す字|内容欄に入れる文/.test(e.placeholder || ''));
    if (ins[0]) set(ins[0], 'バッテリー交換');
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /＋ 追加する/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(400);
  t('★足したバッジが出る', await page.evaluate(() => [...document.querySelectorAll('[data-qi]')].some(e => /バッテリー交換/.test(e.innerText))));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => /保存して閉じる/.test(e.innerText) && e.offsetParent !== null); if (b) b.click(); });
  await page.waitForTimeout(1800);
  const si = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'setItems');
  const sg = await page.evaluate(k => JSON.parse(JSON.stringify(window.__fakeFb.get(k) || null)), STOR + 'setGroups');
  t('★setItems に足した分が保存される', Array.isArray(si) && si.some(x => x && x.label === 'バッテリー交換'), si && si.map(x => x.label));
  t('★グループは別のキー setGroups に保存される', Array.isArray(sg) && sg.length >= 4 && sg.some(g => g.name === '点検'), sg);
  await closeCard();

  head('通し');
  t('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT, fullPage: false }); console.log('   [shot] ' + process.env.SHOT); }
  await browser.close(); server.close();
  console.log(String.fromCharCode(10) + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  成功 ' + pass + ' / 失敗 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
