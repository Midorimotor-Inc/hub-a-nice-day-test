// ① 更新の帯：サーバー側のバージョン番号が違えば（__APP_BUILD が同じでも）帯が出る／同じなら出ない
// ② 既定で全画面：初めて開いたタブでは最初の操作で全画面に入る。「元に戻す」を押した端末は次から入らない。
//    （2026-09-12 ユーザー指示。全画面はブラウザの制約で操作なしには入れないので「最初の操作で」）
const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
for (const base of [__dirname, path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify')]) {
  try { chromium = require(path.join(base, 'node_modules', 'playwright')).chromium; break; } catch (e) {}
}
if (!chromium) { try { chromium = require('playwright').chromium; } catch (e) {} }
if (!chromium) { console.error('playwright が見つかりません'); process.exit(1); }

const DIR = __dirname;
const PORT = 8155;
let pass = 0, fail = 0;
const t = (label, ok, extra) => { if (ok) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✖ ' + label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const seeText = async (page, s, ms = 8000) => { try { await page.waitForFunction(x => document.body.innerText.includes(x), s, { timeout: ms }); return true; } catch (e) { return false; } };

(async () => {
  // 配信側の版を切り替えられる小さなサーバー。 ?_v= 付き（帯の確認用の取得）だけ「新しい版」を返す。
  let served = {};  // file -> {bumpVersion:boolean}
  const server = http.createServer((req, res) => {
    const [p0, qs] = req.url.split('?');
    const p = decodeURIComponent(p0).replace(/^\//, '');
    fs.readFile(path.join(DIR, p), 'utf8', (err, d) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      let out = d;
      if (p.endsWith('.html')) {
        out = out.replace(/const AUTH_REQUIRED = (true|false);/, 'const AUTH_REQUIRED = false;')
    .replace(/const BACKEND = '[a-z]+';/, "const BACKEND = 'gas';");   // この検査は GAS を模擬するので保存先を GAS に固定（2026-09-18）
        // 帯の確認用の取得（?_v=）にだけ、バージョン番号を1つ上げた版を返す
        if (qs && /_v=/.test(qs) && served[p] && served[p].bumpVersion) {
          // ★版は【桁数を問わず】最後の数字を＋1 すること。
          //   2026-10-06 に版が 3 桁（3.117.3）になったのに、ここが 2 桁（3.117）前提のままだったため
          //   【新しい版を返せていなかった】＝帯の見張りが 3 画面とも素通りしていた（2026-11-14 発見）。
          out = out.replace(/(APP_VERSION|MOBILE_VERSION)(\s*=\s*)'([^']+)'/, (m, k, eq, v) => {
            const ps = String(v).split('.');
            ps[ps.length - 1] = String(Number(ps[ps.length - 1]) + 1);
            return k + eq + "'" + ps.join('.') + "'";
          });
        }
        // 帯は 8 秒後の確認で出る。テストでは待ち時間を 1 秒に縮める
        out = out.replace('setTimeout(check,8000);', 'setTimeout(check,1000);');
      }
      res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(out);
    });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ headless: true });

  const open = async (file, opts) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    await ctx.route('https://script.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e))); if (process.env.DBG) { page.on('console', m => console.log('  [console]', m.text().slice(0,100))); page.on('request', r => { if (r.url().includes('_v=')) console.log('  [req]', r.url()); }); }
    if (opts && opts.before) { await page.goto(`http://localhost:${PORT}/blank.txt`).catch(() => {}); await page.evaluate(opts.before); }
    await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errs };
  };

  // ── ① 更新の帯 ──
  for (const file of ['index_dev.html', 'customers.html', 'mobile.html']) {
    served = { [file]: { bumpVersion: true } };
    const { ctx, page, errs } = await open(file);
    t(file + '：版が上がっていれば帯が出る（__APP_BUILD が同じでも）', await seeText(page, '新しいバージョンがあります', 45000));
    t(file + '：JSエラーなし', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
    served = { [file]: { bumpVersion: false } };
    const r2 = await open(file);
    await r2.page.waitForTimeout(4000);
    t(file + '：同じ版なら帯は出ない', !(await r2.page.evaluate(() => document.body.innerText.includes('新しいバージョンがあります'))));
    await r2.ctx.close();
  }

  // ── ② 開いた直後は【聞かない】（v3.94.0・2026-11-02 ユーザー決定）──
  //   ★聞く作りに戻さないこと。開くたびに1クリック増える。
  //   全画面に入る道はヘッダー右上の ⛶ ボタンだけ。
  //   headless では requestFullscreen が拒否されることがあるので、呼ばれたかどうかを記録して確かめる
  const spy = () => {
    window.__fsCalls = 0;
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function () { window.__fsCalls++; return orig ? orig.apply(this, arguments).catch(() => {}) : Promise.resolve(); };
  };
  const login = async (page) => {
    await seeText(page, '担当者を選択してください');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('江川京志')); if (b) b.click(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('でログイン')); if (b) b.click(); });
    await page.waitForTimeout(1200);
  };
  const askShown = page => page.evaluate(() => document.body.innerText.includes('全画面で使いますか'));
  {
    const { ctx, page } = await open('index_dev.html');
    await page.evaluate(spy);
    await login(page);
    t('★開いても「全画面で使いますか？」は聞かない（v3.94.0 で廃止）', !(await askShown(page)),
      await page.evaluate(() => document.body.innerText.slice(0, 120)));
    t('勝手に全画面に入らない', (await page.evaluate(() => window.__fsCalls)) === 0);
    await page.mouse.click(700, 500);
    await page.waitForTimeout(400);
    t('画面を触っても全画面に入らない', (await page.evaluate(() => window.__fsCalls)) === 0);
    t('文字が青く選ばれない（選択なし）', (await page.evaluate(() => String(window.getSelection()))) === '');
    await ctx.close();
  }
  {
    // 古い localStorage の 'off' は無視して消す（2026-09-20）
    const { ctx, page } = await open('index_dev.html', { before: () => { try { localStorage.setItem('hub-v8-dev-fs-pref2', 'off'); } catch (e) {} } });
    await page.evaluate(spy);
    await login(page);
    t('古い localStorage の off は消される', (await page.evaluate(() => localStorage.getItem('hub-v8-dev-fs-pref2'))) === null);
    await ctx.close();
  }
  {
    // 「全画面」ボタンを押した時：復帰処理が横取りせず、ボタンで入る。'off' を書いてしまわない
    const { ctx, page } = await open('index_dev.html');
    await page.evaluate(spy);
    await seeText(page, '担当者を選択してください');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('でログイン') ); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('江川京志')); if (b) b.click(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('でログイン')); if (b) b.click(); });
    await page.waitForTimeout(1500);
    // ここまでのクリックで入っていたら、いったん外す（本物の全画面が入る環境向け）
    await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__fsCalls);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('このまま使う')); if (b) b.click(); });   // 案内が出ていたら先に閉じる
    await page.waitForTimeout(300);
    const btn = await page.$('button[data-fs-toggle]');
    t('「全画面」ボタンがある', !!btn);
    if (btn) { await btn.click(); await page.waitForTimeout(600); }
    const after = await page.evaluate(() => window.__fsCalls);
    t('「全画面」ボタンで全画面に入ろうとする（1回だけ）', after === before + 1, { before, after });
    t('「全画面」ボタンを押しても off を書かない', (await page.evaluate(() => sessionStorage.getItem('hub-v8-dev-fs-pref2'))) !== 'off');
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail}件 不合格 / ${pass}件 合格` : `\n全${pass}件 PASS`);
  process.exit(fail ? 1 : 0);
})();
