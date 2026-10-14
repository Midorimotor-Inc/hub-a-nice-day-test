// 代車管理の「スケジュールとのズレ」を、本番の実データでそのまま再現して理由を出す。2026-10-14
//   画面と同じ突き合わせ方（index の syncIssues と同じ規則）を Node で走らせ、
//   1件ずつ「なぜズレと判定したか」を書き出す。**読み取りだけ**。
//   実行: node fb_sync_diag.js            … 本番
//         node fb_sync_diag.js --dev      … テスト版
const fs = require('fs'), path = require('path');
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('C:/Users/A/Documents/Hub重要書類/firebase-admin.json', 'utf8'))) });
const db = admin.firestore();
const STOR = process.argv.includes('--dev') ? 'hub-v8-dev-' : 'hub-v8-';
const FIXED = process.argv.includes('--fixed');   // 直したあとの判定で数える
// 代車名の比べ方：レンタカーの印（鍵マーク）と空白は無視する
//   予約カードには「🔑 ノマド (3101)」と書かれるのに、代車管理は「ノマド (3101)」なので、
//   そのまま比べると全部「車名ちがい」になってしまう（本番で4件そうなっていた）。
const sameCar = (a, b) => String(a == null ? '' : a).replace(/🔑/g, '').replace(/\s+/g, '')
                       === String(b == null ? '' : b).replace(/🔑/g, '').replace(/\s+/g, '');
const NL = String.fromCharCode(10);

const kv = async (k) => { const s = await db.collection('kv').doc(STOR + k).get(); if (!s.exists) return null; try { return JSON.parse(s.data().v); } catch (e) { return null; } };
const toNum = (y, m, d) => y * 10000 + (m + 1) * 100 + d;
const carLabelOf = (c) => c ? ((c.name || '') + (c.num ? (' (' + c.num + ')') : '')) : '';
const dkNum = dk => { const q = String(dk || '').split('-'); return q.length === 3 ? (Number(q[0]) * 10000 + Number(q[1]) * 100 + Number(q[2])) : 0; };

(async () => {
  const [insp, arch, schedH, schedS, lresH, lresS, rres, carsH, carsS, rcars] = await Promise.all(
    ['insp', 'insp-arch', 'honten-sched', 'sanda-sched', 'honten-lres', 'sanda-lres', 'rres', 'honten-cars', 'sanda-cars', 'rentalcars'].map(kv));
  const inspData = Object.assign({}, arch || {}, insp || {});
  const n = new Date();
  const TD = toNum(n.getFullYear(), n.getMonth(), n.getDate());
  console.log('■ ' + (STOR === 'hub-v8-' ? '本番' : 'テスト版') + '　今日 = ' + n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate());
  console.log('  車検の日数 ' + Object.keys(inspData).length + '（うち保管箱 ' + Object.keys(arch || {}).length + '）');
  console.log('');

  const run = (sid) => {
    const sched = sid === 'honten' ? (schedH || {}) : (schedS || {});
    const other = sid === 'honten' ? (schedS || {}) : (schedH || {});
    const lres = sid === 'honten' ? (lresH || {}) : (lresS || {});
    const cars = (sid === 'honten' ? carsH : carsS) || [];
    const out = [];
    const seen = {};
    // 画面と同じ：bookingKey から予約の行を引く（整備は「見ている店」の sched しか見ない）
    const bkRow = (bk, user) => {
      const m = String(bk || '').match(/^(insp|sched)-(\d+-\d+-\d+)-(.*)$/);
      if (!m) return null;
      if (m[1] === 'insp') {
        const row = ((inspData[m[2]] || [])[Number(m[3])]) || null;
        if (row && row.name) return { kind: 'insp', dk: m[2], at: m[3], row, bk };
        if (!FIXED) return { kind: 'insp', dk: m[2], at: m[3], row };
        // 行番号がずれただけ＝同じ日に同じ氏名の車検があれば、それ
        const i = (inspData[m[2]] || []).findIndex(r => r && r.name && user && r.name === user);
        return i >= 0 ? { kind: 'insp', dk: m[2], at: String(i), row: (inspData[m[2]] || [])[i], bk: 'insp-' + m[2] + '-' + i }
                      : { kind: 'insp', dk: m[2], at: m[3], row: null };
      }
      const ok = r => r && r.name && (!user || r.name === user);   // ★氏名が合う時だけ「その予約」とみなす
      const mine = (sched[m[2]] || {})[m[3]] || null;
      if (FIXED ? ok(mine) : !!mine) return { kind: 'sched', dk: m[2], at: m[3], row: mine, bk };
      if (!FIXED) return { kind: 'sched', dk: m[2], at: m[3], row: null };
      // ★代車は店をまたいで貸すので、もう一方の店の整備も見る
      const his = (other[m[2]] || {})[m[3]] || null;
      if (ok(his)) return { kind: 'sched', dk: m[2], at: m[3], row: his, bk, otherStore: true };
      // ★枠の名前がずれただけ＝同じ日に同じ氏名の整備があれば、それ
      for (const src of [sched, other]) {
        const day = src[m[2]] || {};
        const k = Object.keys(day).find(x => day[x] && day[x].name && user && day[x].name === user);
        if (k) return { kind: 'sched', dk: m[2], at: k, row: day[k], bk: 'sched-' + m[2] + '-' + k, slipped: true };
      }
      return { kind: 'sched', dk: m[2], at: m[3], row: null };
    };
    const bkRowOther = (bk) => {   // ★他店の sched にいないか（画面は見ていない）
      const m = String(bk || '').match(/^sched-(\d+-\d+-\d+)-(.+)$/);
      if (!m) return null;
      return (other[m[1]] || {})[m[2]] || null;
    };
    const endOf = r => (r && r.ty != null) ? (r.ty * 10000 + (r.tm + 1) * 100 + r.td) : 0;
    const scan = (kind, resObj, carList) => Object.keys(resObj || {}).forEach(cid => {
      const car = (carList || []).find(c => String(c.id) === String(cid));
      Object.values(resObj[cid] || {}).forEach(r => {
        if (!r || !r.bookingKey) return;
        seen[r.bookingKey] = true;
        const f = bkRow(r.bookingKey, r.user), want = carLabelOf(car);
        if (f && f.bk) seen[f.bk] = true;   // 枠名がずれていても「対応する予約はある」
        const end = endOf(r);
        if (!f || !f.row || !f.row.name) {
          out.push({ type: 'row', kind, end, user: r.user, want, bk: r.bookingKey, carId: cid,
            otherRow: bkRowOther(r.bookingKey), inspRowStore: (f && f.kind === 'insp' && (inspData[f.dk] || [])[Number(f.at)]) ? ((inspData[f.dk] || [])[Number(f.at)].store || 'honten') : null,
            span: (r.fm + 1) + '/' + r.fd + '→' + (r.tm + 1) + '/' + r.td });
          return;
        }
        const have = kind === 'rental' ? (f.row.rentalLabel || '') : (f.row.loaner || '');
        const ng = FIXED ? !sameCar(have, want) : (String(have).trim() !== String(want).trim());
        if (ng)
          out.push({ type: 'label', kind, end, user: r.user, want, have: have || '（空）', bk: r.bookingKey,
            rowStore: f.row.store || (f.kind === 'sched' ? sid : 'honten'), span: (r.fm + 1) + '/' + r.fd + '→' + (r.tm + 1) + '/' + r.td });
      });
    });
    scan('loaner', lres, cars);
    scan('rental', rres || {}, rcars || []);
    const rev = (dk, at, row, kind) => {
      if (!row || !row.name) return;
      const lbl = (row.loaner || '').trim(), rlbl = (row.rentalLabel || '').trim();
      if (!lbl && !rlbl) return;
      const bk = kind + '-' + dk + '-' + at;
      if (seen[bk]) return;
      out.push({ type: 'bar', kind: rlbl ? 'rental' : 'loaner', end: dkNum(dk), user: row.name, have: (rlbl || lbl), dk,
        rowStore: row.store || (kind === 'sched' ? sid : 'honten') });
    };
    Object.keys(inspData).forEach(dk => (inspData[dk] || []).forEach((row, i) => { if (row && (row.store || 'honten') === sid) rev(dk, String(i), row, 'insp'); }));
    Object.keys(sched).forEach(dk => Object.keys(sched[dk] || {}).forEach(sk => rev(dk, sk, sched[dk][sk], 'sched')));
    return { now: out.filter(x => !x.end || x.end >= TD), past: out.filter(x => x.end && x.end < TD) };
  };

  console.log(FIXED ? '＝＝ 直したあとの判定で数えます ＝＝' : '＝＝ いまの（本番に出ている）判定で数えます ＝＝');
  console.log('');
  for (const sid of ['honten', 'sanda']) {
    const r = run(sid);
    console.log('━━ ' + (sid === 'honten' ? '本店' : '三田店') + ' の代車管理で見たとき：本日以降 ' + r.now.length + '件（過去 ' + r.past.length + '件は数えない）');
    r.now.forEach((x, i) => {
      const who = x.user || '（氏名なし）';
      if (x.type === 'row') {
        let why = 'スケジュールに予約が見つからない';
        if (x.otherRow) why = '★他店（' + (sid === 'honten' ? '三田店' : '本店') + '）の整備に予約がある＝見ている店の表にしか無いので「無い」と判定している';
        else if (x.inspRowStore && x.inspRowStore !== sid) why = '★その車検は ' + (x.inspRowStore === 'honten' ? '本店' : '三田店') + ' 入庫';
        else if (/^sched-/.test(x.bk)) why = 'その整備の枠が消えている（時間か日を動かした跡）';
        else why = 'その車検の行が消えている（行番号がずれた／予約を消した）';
        console.log('  ' + (i + 1) + '. [貸出だけ残る] ' + who + '　' + x.want + '　' + x.span + '　' + x.bk);
        console.log('       理由: ' + why);
      } else if (x.type === 'label') {
        console.log('  ' + (i + 1) + '. [車名ちがい] ' + who + '　予約カード「' + x.have + '」≠ 代車管理「' + x.want + '」　' + x.span);
      } else {
        console.log('  ' + (i + 1) + '. [予約カードだけ] ' + who + '　' + x.dk + '　カードの代車名「' + x.have + '」に対応する貸出が無い');
      }
    });
    console.log('');
  }
  process.exit(0);
})();
