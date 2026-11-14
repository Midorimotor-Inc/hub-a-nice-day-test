// 端末台帳に「その端末が開いている版」を記録する検査（2026-11-14）。
//   ねらい：管理コンソールで「誰が古い版のまま開いているか」が分かること。
//   ・devices/{端末ID} に vS（スケジュール）／vL（顧客リスト）／vM（スマホ）と、その時刻（vSat…）を書く
//   ・3つの画面は別のキーで印を持つので、お互いを上書きしない
//   ・版が上がったら、次に開いた時に書き直す
//   ・admin.html に「開いている版」の列と、古い版を赤くする道具（verCmp）がある
//   実行: node device_ver_test.js
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname, PORT = 8483, STOR = 'hub-v8-dev-';
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const head = s => console.log('\n■ ' + s);
const seeText = async (page, s, ms = 20000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };
const clickText = (page, s) => page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.includes(x)); if (b) { b.click(); return true; } return false; }, s);
const FAKE_FB = fs.readFileSync(path.join(DIR, 'fake_firebase.js'), 'utf8');
const ek = e => e.replace(/\./g, ',');
const now = new Date();
const DK = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
// ★画面が立ち上がって台帳へ書くまで数秒かかる。決め打ちで待たず、書かれるまで見張る。
const DEVROW = () => { const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
  const k = Object.keys(st).filter(x => x.indexOf('devices/') === 0 && st[x]); return k.length === 1 ? Object.assign({ __id: k[0].slice(8) }, st[k[0]]) : (k.length ? { __many: k.length } : null); };
const devRow = page => page.evaluate(DEVROW);
const devCount = page => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__fakeFbStore') || '{}')).filter(x => x.indexOf('devices/') === 0).length);
const waitField = async (page, key, want, ms = 25000) => {
  try { await page.waitForFunction(([k, w, src]) => { const f = new Function('return (' + src + ')')()(); return !!(f && f[k] === w); }, [key, want, DEVROW.toString()], { timeout: ms, polling: 400 }); return true; } catch (e) { return false; }
};
const waitMark = async (page, k, want, ms = 25000) => {
  try { await page.waitForFunction(([x, w]) => localStorage.getItem(x) === w, [k, want], { timeout: ms, polling: 400 }); return true; } catch (e) { return false; }
};
const verOf = (f, re) => { const m = fs.readFileSync(path.join(DIR, f), 'utf8').match(re); return m ? m[1] : null; };
const V_S = verOf('index_dev.html', /APP_VERSION\s*=\s*'([^']+)'/);
const V_L = verOf('customers.html', /APP_VERSION\s*=\s*'([^']+)'/);
const V_M = verOf('mobile.html', /MOBILE_VERSION\s*=\s*'([^']+)'/);

const SEED = {
  'meta/allowed': {
    [ek('tikurin@midori-m.com')]: { email: 'tikurin@midori-m.com', name: '竹林直行', store: 'honten', uid: 'h3', role: 'staff', active: true, kind: 'staff' },
  },
  ['kv/' + STOR + 'honten-staff-v2']: { v: JSON.stringify([
    { name: '竹林直行', uid: 'h3', store: 'honten', myNumber: 3, loginEmail: 'tikurin@midori-m.com', sysUse: true, devPlan: ['own'] },
  ]) },
  ['kv/' + STOR + 'sanda-staff-v2']: { v: JSON.stringify([]) },
  ['kv/' + STOR + 'insp']: { v: JSON.stringify({ [DK]: [] }) },
  ['kv/' + STOR + 'honten-sched']: { v: JSON.stringify({}) },
  ['kv/' + STOR + 'honten-lres']: { v: JSON.stringify({}) },
};

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    fs.readFile(path.join(DIR, p), (err, d) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, /\.html$/.test(p) ? { 'Content-Type': 'text/html; charset=utf-8' } : {}); res.end(d);
    });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });
  const U = p => `http://localhost:${PORT}/${p}`;
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(seed => { if (!localStorage.getItem('__fakeFbStore')) localStorage.setItem('__fakeFbStore', JSON.stringify(seed)); }, SEED);
  await ctx.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app-compat') >= 0 ? FAKE_FB : '' }));
  await ctx.route('https://script.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));

  // ────────────────────────────────────────────────
  head('① 作りの確認（ファイルの中身）');
  const S1 = fs.readFileSync(path.join(DIR, 'index_dev.html'), 'utf8');
  const S2 = fs.readFileSync(path.join(DIR, 'customers.html'), 'utf8');
  const S3 = fs.readFileSync(path.join(DIR, 'mobile.html'), 'utf8');
  const S4 = fs.readFileSync(path.join(DIR, 'admin.html'), 'utf8');
  t('★3ファイルの版が同じ', V_S && V_S === V_L && V_L === V_M, [V_S, V_L, V_M]);
  t('★スケジュールの印は S', /HUB_APP_TAG = 'S'/.test(S1));
  t('★顧客リストの印は L', /HUB_APP_TAG = 'L'/.test(S2));
  t('★スマホの印は M', /HUB_APP_TAG = 'M'/.test(S3));
  [['index_dev.html', S1], ['customers.html', S2], ['mobile.html', S3]].forEach(([n, s]) => {
    t('★' + n + ' に版を書く道具がある', s.indexOf('const hubVerDoc = ()') > 0 && s.indexOf('const hubStampVer = async ()') > 0);
    t('★' + n + ' の印は画面ごとに別のキー', s.indexOf("STOR + 'auth-ver-' + HUB_APP_TAG") > 0);
    t('★' + n + ' は update で書く（取り消された行を作り直さない）', /fbDeviceRef\(\)\.update\(hubVerDoc\(\)\)/.test(s));
  });
  t('★管理コンソールに「開いている版」の列がある', S4.indexOf('<th>開いている版</th>') > 0);
  t('★古い版を見分ける道具がある（verCmp）', S4.indexOf('function verCmp(') > 0 && S4.indexOf('function newestVer(') > 0);
  t('★古い版は赤い札で出す', S4.indexOf('.state.old{') > 0 && /state ' \+ \(old \? 'old' : 'ok'\)/.test(S4));

  // ────────────────────────────────────────────────
  head('② スケジュールを開くと台帳に版が書かれる');
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.accept().catch(() => {}); });
  await page.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
  t('登録画面が出る', await seeText(page, 'ご自分のメールアドレス'));
  await page.fill('input[type=email]', 'tikurin@midori-m.com');
  await clickText(page, 'ログイン用のリンクをメールで受け取る');
  t('メールを送った', await seeText(page, 'メールを送りました', 8000));
  const sent = await page.evaluate(() => window.__fakeFb.sent());
  await page.goto(sent[0].url + '&mode=signIn&oobCode=good&apiKey=x', { waitUntil: 'domcontentloaded' });
  t('登録が終わる', await seeText(page, '竹林直行 さん'));
  await page.waitForTimeout(2500);
  await waitField(page, 'vS', V_S);
  const d1 = await devRow(page);
  t('★台帳に行ができる', !!d1, d1);
  t('★スケジュールの版（vS）が入る', !!d1 && d1.vS === V_S, d1 && d1.vS);
  t('★書いた時刻（vSat）も入る', !!d1 && typeof d1.vSat === 'number' && d1.vSat > 0, d1 && d1.vSat);
  t('★ほかの画面の版はまだ無い', !!d1 && !d1.vL && !d1.vM, d1 && [d1.vL, d1.vM]);
  t('★印は画面ごとに別のキー（S）', await waitMark(page, STOR + 'auth-ver-S', V_S));

  // ────────────────────────────────────────────────
  head('③ 顧客リスト・スマホも自分の版だけを書く（お互いを消さない）');
  const pL = await ctx.newPage();
  await pL.goto(U('customers.html'), { waitUntil: 'domcontentloaded' });
  const okL = await waitField(pL, 'vL', V_L);
  const d2 = await devRow(pL);
  t('★顧客リストの版（vL）が入る', okL && !!d2 && d2.vL === V_L, d2 && d2.vL);
  t('★スケジュールの版（vS）は消えない', !!d2 && d2.vS === V_S, d2 && d2.vS);
  const pM = await ctx.newPage();
  await pM.goto(U('mobile.html'), { waitUntil: 'domcontentloaded' });
  const okM = await waitField(pM, 'vM', V_M);
  const d3 = await devRow(pM);
  t('★スマホの版（vM）が入る', okM && !!d3 && d3.vM === V_M, d3 && d3.vM);
  t('★3つとも残っている', !!d3 && d3.vS === V_S && d3.vL === V_L && d3.vM === V_M, d3 && [d3.vS, d3.vL, d3.vM]);
  t('★台帳の行は1つのまま（増えない）', (await devCount(pM)) === 1, await devCount(pM));

  // ────────────────────────────────────────────────
  head('④ 版が上がったら、次に開いた時に書き直す');
  // 台帳と端末の印を「古い版」にしておく（版を下げる＝上げたのと同じ形）
  await page.evaluate(([id, k]) => {
    const st = JSON.parse(localStorage.getItem('__fakeFbStore') || '{}');
    st['devices/' + id] = Object.assign({}, st['devices/' + id], { vS: '3.000.0', vSat: 1 });
    localStorage.setItem('__fakeFbStore', JSON.stringify(st));
    localStorage.setItem(k, '3.000.0');
  }, [d3.__id, STOR + 'auth-ver-S']);
  const pR = await ctx.newPage();
  await pR.goto(U('index_dev.html'), { waitUntil: 'domcontentloaded' });
  t('開き直してログインできる', await seeText(pR, '代車管理', 30000));
  const okR = await waitField(pR, 'vS', V_S);
  const d4 = await devRow(pR);
  t('★台帳の版が今の版に書き直される', okR && !!d4 && d4.vS === V_S, d4 && d4.vS);
  t('★端末の印も今の版になる', await waitMark(pR, STOR + 'auth-ver-S', V_S));
  t('画面のエラーは出ていない', errs.length === 0, errs);

  console.log('\n━━━━━━━━━━━━━━━━━━━━');
  console.log('  PASS ' + pass + ' / FAIL ' + fail);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
