// テスト版のスタッフ表に入っている「ログイン用メール」を、本番のスタッフ表へ写す（2026-09-30 ユーザー指示）。
//   本番コンソールを開くとメール欄が空で入れ直しが要る、を解消するためのもの。
//   許可簿（meta/allowed）はテスト版・本番で共通なので触らない。写すのはスタッフ表の loginEmail だけ。
//   氏名・番号（myNumber）・店舗・uid は本番のまま。空のメールを埋めるだけで、既に入っている値は上書きしない。
//   node fb_copy_staff_mail.js          … 何が変わるかを見るだけ（書き込まない）
//   node fb_copy_staff_mail.js --write  … 実際に書き込む（直前の中身を backup-prod-*-staff.json に控える）
const fs = require('fs'), path = require('path');
const KEY_FILE = process.env.HUB_FB_KEY || 'C:/Users/A/Documents/Hub重要書類/firebase-admin.json';
const MOD = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'hub-verify', 'node_modules');
const admin = require(path.join(MOD, 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))) });
const db = admin.firestore();
const WRITE = process.argv.indexOf('--write') >= 0;
const norm = s => String(s || '').replace(/[\s\u3000]/g, '');

(async () => {
  let changed = 0;
  for (const st of ['honten', 'sanda']) {
    const devDoc = await db.collection('kv').doc('hub-v8-dev-' + st + '-staff-v2').get();
    const prdDoc = await db.collection('kv').doc('hub-v8-' + st + '-staff-v2').get();
    if (!devDoc.exists || !prdDoc.exists) { console.log('  ' + st + '：スタッフ表が見つかりません'); continue; }
    const D = JSON.parse(devDoc.data().v || '[]'), P = JSON.parse(prdDoc.data().v || '[]');
    fs.writeFileSync(path.join(__dirname, 'backup-prod-' + st + '-staff.json'), JSON.stringify(P, null, 1));
    const next = P.map(p => {
      if (String(p.loginEmail || '').trim()) return p;                        // 既に入っている人は触らない
      const d = D.find(x => x && x.uid === p.uid) || D.find(x => x && norm(x.name) === norm(p.name));
      if (!d || !String(d.loginEmail || '').trim()) return p;                 // テスト版にも無い人はそのまま
      changed++;
      console.log('  ' + (st === 'sanda' ? '三田店' : '本店') + '　' + p.name + '　← ' + d.loginEmail
        + (d.uid !== p.uid ? '　※uidが違います（本番 ' + p.uid + ' / テスト ' + d.uid + '）' : ''));
      return Object.assign({}, p, { loginEmail: d.loginEmail, sysUse: true });
    });
    if (WRITE) {
      await db.collection('kv').doc('hub-v8-' + st + '-staff-v2')
        .set({ v: JSON.stringify(next), u: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  console.log(changed + '人分' + (WRITE ? ' を本番へ写しました。' : ' が対象です（まだ書いていません。--write で実行）。')
    + '　控え: backup-prod-honten-staff.json / backup-prod-sanda-staff.json');
  process.exit(0);
})().catch(e => { console.error('できませんでした:', e.message); process.exit(1); });
