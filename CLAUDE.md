# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

「Hub a Nice Day」= 車検予約管理PWA（本店・三田店の2店舗運用）。スケジュール表・カレンダー・顧客リスト・代車/レンタカー管理を、**ビルド工程なしの単一HTMLファイル**で提供する。React 18 UMD + Babel standalone（ブラウザ内トランスパイル）で動く。**保存先は 2026-09-18 から Firebase（Firestore・東京）、本人認証は Firebase Authentication（招待コード＝アカウントの合言葉、またはメールリンク）、時点保存／復旧も 2026-09-19 から Firestore**。Google Apps Script (GAS) は**メール送信（招待コード・保存失敗の通知）だけ**に残っている。

## ビルド・テスト・実行

- **ビルド/lint は存在しない。** 静的HTMLをGitHub Pagesが直接配信する。
- **検査は Playwright の `*_test.js`**（`%LOCALAPPDATA%/Temp/hub-verify/node_modules` の playwright を使う）。Firebase には繋がず `fake_firebase.js`（にせの firebase）を差し込む：`node fb_auth_test.js`（本人認証）・`node fb_mode_test.js`（Firestore 経路）・`node fb_holiday_test.js`（休日タブ・休日メモ・繰り越し）・`node fb_mysched_test.js`（マイスケジュール・シークレット暗号化）・`node fb_contact_test.js`（住所・電話）・`node cust_delete_test.js`（顧客ファイルの削除）・`node staff_input_test.js`（予約カードの担当欄）・`node vehicle_loaner_test.js`（車両管理→代車管理の登録）・`node merge_scalar_test.js`（共有データのマージ）・`node loaner_edit_overflow_test.js`（代車の編集画面が履歴で埋まらない）・`node stale_snapshot_test.js`（古い写しで表示が消えない）・`node diff_write_test.js`（保存が他の予定を巻き添えにしない）・`node mobile_cust_test.js`（スマホの検索・顧客リスト・リストからの予約）・`node carno_test.js`（ナンバー4桁）・`node cust_open_mode_test.js`（顧客リストを同じタブで開き画面の大きさを揃える）・`node batch_poll_test.js` ほか（GAS 模擬・`BACKEND='gas'` に固定して動かす）。構文だけなら `node smoke_dev_check.js <file>`。
- 動作確認はブラウザでHTMLを開く（PWA。**Service Workerは使っていない**ので、ブラウザの通常キャッシュだけ。念のため確認時は**強制リロード Ctrl+Shift+R**）。
- デプロイ = `git push`。GitHub Pages反映に1〜3分。
- Babelのin-browser変換のため、構文エラーは実行時まで出ない（上の検査で拾う）。

## リポジトリ構成（DEVと本番は別リポジトリ）

| | DEV（このリポジトリ） | 本番 |
|---|---|---|
| フォルダ名 | `HUB-A-NICE-DAY-DEV` | `hub-a-nice-day` |（GitHub 名と違うが変えない。2026-09-21 にリポジトリだけ test/main に改名）
| GitHub | `Midorimotor-Inc/hub-a-nice-day-test` | `Midorimotor-Inc/hub-a-nice-day-main` |
| Pages URL | `https://midorimotor-inc.github.io/hub-a-nice-day-test/` | `https://midorimotor-inc.github.io/hub-a-nice-day-main/` |
| STORプレフィックス | `hub-v8-dev-` | `hub-v8-` |
| スケジュール本体 | `index_dev.html`（`index.html`がリダイレクト） | `index_main.html`（`index.html`がリダイレクト） |
| 顧客リスト | `customers.html` | `customers.html` |

- **2つのフォルダは必ず同じ親フォルダの直下に、上の名前で置く**（`port_to_main.js` が `../hub-a-nice-day` を本番として探すため）。親フォルダの場所はどこでもよく、Windowsのユーザー名にも依存しない。別PCでの構築手順は `SETUP_NEW_PC.md`。
- **会社アカウント以外は使わない。** GitHubは `Midorimotor-Inc`、メールは `hubaniceday.system@gmail.com` のみ。`kyoshi-egawa` / `egachan28` / `kabu.midorimotors@gmail.com` / `ega.turbo.go.go.go@gmail.com` は**すべて個人用で使用禁止**。
- 旧・個人アカウントのリポジトリ（`kyoshi-egawa/HUB-A-NICE-DAY-DEV`・`kyoshi-egawa/hub-a-nice-day-main`）は**2026-08-31にPagesをUnpublishして配信停止**、ローカルの `old-kyoshi` リモートも削除済み。リポジトリ自体は記録として残るが、**再接続・再公開しないこと**（v1.75のまま会社の本番GASを指す設定なので、配信を復活させると本番データを壊しうる）。

- **`index.html` は中身がなく `index_dev.html` / `index_main.html` へ `location.replace` するだけ。** 実装は `index_dev.html`（DEV）/ `index_main.html`（本番）にある。
- DEVと本番でファイルが**乖離している**ことがある（片方だけ修正されたまま）。**片方を直したら必ずもう片方も確認すること。** 過去に useShared のマージロジックがDEVだけ新しく、本番で代車が消えるバグが出た。
- `customers_dev.html` / `index_redirect_dev.html` は実験用サブファイル。ユーザーが日常使うのは `customers.html` と `index_dev.html`（本番は `index_main.html`）。
- **Firebase プロジェクト（hub-a-nice-day）も GAS_URL も DEV・本番で同一**。`STOR` プレフィックスだけでデータを分離している（Firestore の `kv` コレクションのドキュメントID＝`hub-v8-insp` vs `hub-v8-dev-insp`）。localStorageキャッシュキーも必ず `STOR` を前置すること（同一オリジンでDEV/本番が混ざるため）。`firebase_config.js`（公開設定）は両リポジトリに置く。**サービスアカウント鍵は `C:/Users/A/Documents/Hub重要書類/firebase-admin.json`（リポジトリに入れない・.gitignore 済み）**。

## DEV→本番の移植は必ず port_to_main.js を使う

- DEVリポジトリで `node port_to_main.js` を実行すると、`index_dev.html` → `../hub-a-nice-day/index_main.html`、`customers.html` → 同名 をコピーし、環境固有差分を自動変換する。**手動コピー＋手動置換で移植しないこと**（2026-06-12、手動移植でDEVのオレンジ配色が本番に混入した事故あり）。
- 移植のたびに `firebase_config.js` も本番へコピーされる。`BACKEND`・`AUTH_REQUIRED` は DEV・本番とも同じ値（firebase / true）で変換しない。
- 環境固有差分は4種類：① `STOR`（`hub-v8-dev-` ↔ `hub-v8-`）② タイトルの `[テスト版]` ③「⚠ スケジュールシステム テスト版」バッジ（2026-09-21 から。画面上の呼び名は「スケジュールシステム・テスト版」「スケジュールシステム・メイン」で統一し、ユーザーに見える所に DEV／本番と書かない） ④ **配色**（DEV＝オレンジ背景・グレー戻るボタン／本番＝青背景・緑戻るボタン。ただし代車管理の「スケジュールに戻る」(BACK_S)は2026-09-12からDEVも緑で共通）。**mobile.html も 2026-09-25 から配色差分あり**：`UI_BG`/`UI_HEAD`/`UI_TAB`/`UI_ACC`（テスト版＝オレンジ／メイン＝青）と `UI_BG_S`/`UI_HEAD_S`/`UI_TAB_S`/`UI_ACC_S`（三田店。テスト版は上と同じオレンジ／メインは赤）の8つの定数**だけ**を変換する。色は必ずこの定数を通すこと（画面に直書きすると変換されない）。スクリプトが全変換し、パターン未検出（DEV側コードの乖離）やDEV残骸の検出時は中断する。
- スクリプトが ✖ で中断したら、DEV側の該当コードが変わってルールが古くなった合図。`port_to_main.js` のルールを現状に合わせて更新してから再実行する。
- **移植後は `node smoke_main.js` が PASS するまで push 禁止。** 本番 Firestore の実データをサービスアカウント鍵で読み取り、にせの firebase に入れて（本物には書けない）流し込み、全画面（カレンダー/スケジュール/代車管理/車両管理/空き枠検索/三田店切替/顧客リスト）を自動巡回してレンダリングエラーを検出する。**DEVと本番はデータの形が違うことがあり、DEVでの動作確認だけでは不十分**（例: 本番のrresはオブジェクト構造・DEVは空 → DEVで踏めないクラッシュが本番で発生した事故あり）。
- push後の最終確認：本番ファイルをブラウザで開いて「**青ヘッダー・[テスト版]表記なし**」を目視。

## index_*.html 内のBLOCK制約（最重要）

ファイル先頭のコメントに編集可否が宣言されている。逸脱しないこと：

- **BLOCK-A: 設定値・定数** → 変更可能
- **BLOCK-B: データ層・Firestore/GAS通信・本人認証**（`STOR` / `sGet` / `sSet` / `writeVerified` / `useShared` / `fbGet` / `fbSet` / `fbTxn` / `fbAuth` まわり / `acquireLock` / `releaseLock`）→ **変更禁止**（データ消失リスク。必要時はユーザー Kyoshi に確認）
- **BLOCK-C: コアロジック**（`InspRow` / 1日6台・7台目承認ロジック・レギュラー車検3台上限）→ **変更禁止**
- **BLOCK-D: UIコンポーネント・モーダル** → 変更可能
- **BLOCK-E: メインアプリ・画面レイアウト** → 変更可能（要注意）

## データアーキテクチャ

すべての共有状態は Firestore のコレクション `kv`（ドキュメントID＝キー名、`{v: JSON文字列, u: サーバー時刻}`）に保存。フロントは `sGet(key)` / `sSet(key,value)` / `writeVerified(key, mutate, check)`（runTransaction）で読み書きし、`useShared` は onSnapshot で購読する（ポーリングは無い）。`BACKEND='gas'` にすると従来の GAS＋スプレッドシート経路に戻る（緊急用。GAS 側のデータは 2026-09-18 以降更新されていない）。`STOR` 無しのキー（`schedRestrictions`）は Firestore では `STOR` を前置したドキュメントになる（`fbDocId`）。

### 本人認証（Firebase Authentication）
- GAS の利用証は廃止（v2.46）。登録は「アドレス＋招待コード（6桁）」（v2.47〜。コード＝その人の Firebase アカウントの合言葉。管理者の招待で発行し GAS の `mailInvite` がメールする。既存の人は `users/{uid}.pw` でサインインし直して付け替える）か、「メールのリンクを開く」。いずれもその端末（ブラウザ）が本人としてサインインし、期限なく保たれる。
- 誰がログインできるかは Firestore の `meta/allowed`（`{emailKey: {email,name,store,uid,role,active,kind,label}}`、emailKey は '.'→','）。Firestore のルール（`firestore.rules`）もこれを見る。管理者は `role:'admin'`。投入・確認は `node fb_seed_allowed.js`。
- 端末の台帳は `devices/{端末ID}`。管理者コンソール（admin.html・DEV サイトのみ。`?env=prod` で本番）の「取り消し」は行を削除し、端末は次に開いた時に登録を捨てる。
- iPhone の Safari／ホーム画面の引き継ぎ（`?hand=`）は `handoff/{code}`（本人だけが読める `users/{uid}` の合言葉を使う）。
- 端末内の登録一覧（名前を選ぶログイン画面）は従来どおり `STOR+'auth-mine'`。
- **スマホの QR 登録（v2.76・2026-09-22）**：PC の登録完了画面「スマホも登録しますか？」とログイン画面「📱 スマホを登録（QR）」で、サインイン中の人の引き継ぎの印を `mobile.html?hand=…&reg=1` の QR にする（qrcode-generator@1.4.4・CDN 版固定）。mobile 側は `HUB_HANDOFF_REG` なら `hubSignInByHandoff`（サインインだけ・BLOCK-B の hubTakeHandoff は使わない）→ `AuthAddScreen viaHandoff` で通常の登録の流れ（自分専用／共有 → 完了 → ホーム画面に追加）。PC でサインインしていない人は招待 URL（`?inv=1&e=`・要コード）の QR。
- **招待 QR（v2.77）**：管理者コンソールで「招待を送る」を押すと、アドレス＋6桁を入れた `mobile.html?inv=1&e=…&code=…` の QR が出る（メールが届かない人向け。`showInviteQr`。URL コピーも可）。index/mobile は URL の `code` を登録欄に入れておく。コードが入った QR なので画面を他人に見せない運用。
- ルールの配備はコンソールに貼る（Claude の自動モードでは `node fb_rules.js --deploy` がブロックされる）。文法確認だけなら Admin SDK の createRuleset で行える。

### 時点保存／復旧（Firestore・2026-09-19）
- `snaps/{id}`（要約・ready）＋ `snaps/{id}/kv/{キー}`（値の写し）、一覧は `snapidx/{prefix}`。GAS の snapXxx と同じ関数名（`snapList/snapRead/snapRestore/snapAddBack/snapRestoreStore`）が FB_ON なら Firestore 版（`fbSnapXxx`）に流れる。
- サーバーは無いので **開いている PC 画面（index）が作る**：daily（1日1回・90日保持）、auto（1時間ごと・48時間保持）、復旧直前の pre-restore。一覧のトランザクションで claim してから中身を書く（複数画面の重複防止）。14日より前の車検の `insp → insp-arch` 仕分けも daily の後に画面側で行う。
- 復旧画面（管理者）に「今すぐ時点保存を作る」。検査は `node fb_snap_test.js`。

### GAS→Firestore の移行
`node fb_migrate.js [--prod] [--write|--verify]`（キー一覧はスナップショット＋cf-index＋既知キーから集める）。DEV は 2026-09-18、本番も同日に写し済み。

主なキー（`STOR` 前置。store別は `storKey(base, storeId)` = `${STOR}${storeId}-${base}`）:
- `${STOR}insp` — スケジュール（車検枠）。`{ "YYYY-M-D": [行...] }`。**日付キーはゼロ詰めなし**（`2026-3-6`）。
- `${STOR}custbk` — 顧客リスト発の仮予約（スケジュール未登録分）。`{ "氏名::YYYY-M-D": entry }`。
- `${STOR}{store}-lres` — 代車予約。**オブジェクト構造** `{ carId: { key: 予約 } }`（配列ではない）。
- `${STOR}rres` — レンタカー予約。これも**オブジェクト構造** `{ carId: { key: 予約 } }`。
- `${STOR}cf-index` / `${STOR}cf-{name}-chunk-{i}` — 顧客ファイル（Excelインポート結果）をチャンク分割保存。
  - **顧客ファイルの `no` は「ナンバー4桁」**（顧客No ではない。取り込みの列検出が `fc('NO','ナンバー')`。本番の実データも 3310・88・8612 など）。画面では「No.」と出ているが中身はナンバー。リスト・検索から予約すると予約行の `no` に自動で入り、v3.10 から予約カードの「ナンバー 4桁」欄とスケジュール表（車種の下）に出る。
  - **横断検索の索引（v2.98・2026-09-26・テスト版のみ）**：`cf-search-index`（{built,total,chunks,files}）＋ `cf-search-chunk-{i}`（2500行ずつ）。中身は**氏名・車種・顧客No・電話・満了日・どの月の誰か**だけで、**予約状況は入れない**（古くならない＝更新が要らない）。月ファイルがいつでも正で、索引は何度でも作り直せる補助データ。作るのは PC の顧客リスト（取り込み・削除の直後に自動＋「🗂 索引を作り直す」ボタン）。使うのは スマホの顧客タブ「探す」・PC のスケジュール画面の 🔍 検索・PC 顧客リストの「全月から探す」。同じ人は 顧客No（無ければ氏名＋車種）でまとめ、一番新しい月を「今回」・それ以外を「前回」として出す。**予約は必ず「今回の月」の行に入れる**（古い月に入れると過去の集計が動くため）。検査は `node mobile_cust_test.js`。24ヶ月＝6,920件で索引0.94MB・読み取り4件（全ファイルだと2.75MB・106件）。共通コード（`cfxLoad`/`cfxBuild`/`cfxSearch`）は index_dev・customers・mobile の3つに同じものを置く。
  - **スマホから（v2.95・2026-09-24）**：mobile.html も同じ置き方で読む（`cfLoadAll`。開いた時に1回・本番で4ファイル1,090件0.4MB）。予約でその人の行が変わる時は、サーバーの最新チャンクを読み直して**その1本だけ**書き戻す（`cfSaveRow`）。取り込み・削除・列の直しは PC のまま。リストからの予約はスケジュール（insp）・顧客ファイル・`custbk` の3つを揃えて書く（仮予約は insp に載せない＝PC と同じ）。
  - **削除（v2.79・2026-09-23）**：`cf-index` から名前を外すだけでなく、`cf-{name}-index` と全チャンクも `null` にする（`deleteFileOnServer`）。各画面は一覧に無いファイルを `pruneMissing` で下ろす（起動時・cf-index の購読・60秒ごとの拾い上げ）。取り込み直後10分は prune の対象外。検査は `node cust_delete_test.js`。
- `${STOR}{store}-dayoff` / `-pleave` — スタッフ休日／有給 `{"YYYY-M-D":[氏名]}`。`{store}-offnote` — 休日メモ `{"YYYY-M-D::氏名":"メモ"}`。`mholidays` — 会社の月間休日数 `{"YYYY-M":N}`（繰り越し計算 `calcHolidayCarry` の元。**会社の休日数が未設定の月で繰越は途切れる**＝繰越は連続して設定した月の間だけ流れる。**枠を超えた分はマイナス繰越にせず有給扱い**：枠を使い切った後に休日を入れると PC・スマホとも自動で pleave に入る（v2.67）。**A案（v2.69）：繰り越した日数は翌月の一番早い休日から順に充て（`carried`）「○月繰り越し分」と表示、集計は「休日N（うち店休日X＋繰り越し休日Y）」、バッジは翌月へ回る分だけ「繰り越しN日」で使い切れば出さない**。index/mobile に同じコード）。
- `${STOR}mysched` — **共有スケジュール** `{id:{dk,time,title,memo,owner,uid,at}}`。全員が読める。直せるのは本人だけ。
- `${STOR}myprv-{スタッフuid}` — **マイスケジュール**（v3.12・2026-09-30 で作り直し）`{id:{dk,time,title,memo,at}}`。暗号化はしない。
  **端末の種類（`${STOR}auth-kind`）で扱いが変わる**：`own`（自分専用）＝読み書きでき、画面上部の「すべて表示／共有スケジュール／マイスケジュール」で切り替えられる。`shared`（店の共有）＝`useHubPrivate` が key を作らないので**購読も読み込みもしない**（画面に出ないだけでなく端末に降りてこない）。予約の追加も共有スケジュールだけになる。
  以前の暗号書庫 `${STOR}mysec-{uid}` が残っている人には「持ってくる」案内を出し、答えを1回入れると myprv へ移して古い書庫を消す（`importOld`）。
  共通コードは index/mobile 両方にある `HUB_OWN_DEVICE`/`useHubPrivate`/`MySchedPanel`。検査は `node fb_mysched_test.js`。
  **ヒントと答え（AES-GCM の暗号シークレット）は v3.12 で廃止**（2026-09-30 ユーザー判断）。中身は Firestore に平文で入るので、`firestore.rules` に「myprv はその本人だけ」の決まりを用意してある（**コンソールに貼るまで効かない**）。

### loanerRes / rentalRes は配列ではなくオブジェクト
`loanerRes[carId]` / `rentalRes[carId]` は `{ key: 予約 }` のオブジェクト。`.filter`/`.map`/`.find` を直接呼ぶと `TypeError`。必ず `Object.values(loanerRes[carId]||{})` で配列化してから使う。各予約は日付フィールド `fy/fm/fd`（from）・`ty/tm/td`（to）で期間を表す（`fm`/`tm` は0始まりの月）。

### GAS側（スプレッドシート + ドライブ）— 2026-09-19 からはメール送信だけ
GASサーバーコードはリポジトリ内の `GAS_server_v14_auth.gs`（`build_gas_v14.js` が `GAS_auth_v14_module.gs` と合成して生成。実体はGoogle Apps Script側にデプロイ済み）。使っているのは `mailInvite`（招待コードのメール）と `notifyFail`（保存失敗の通知）だけ。データ・認証・時点保存は Firestore。以下は GAS 時代の記録（`BACKEND='gas'` に戻す時にだけ関係する）：
- **1セルの上限は50,000文字。** これを超えると `setValue` が失敗する（no-corsのためフロントは失敗を検知できない）。
- v9以降、**30,000字超の値はGoogleドライブのファイル**（`hubdata_blobs` フォルダ）に保存し、シートにはマーカー `__DRIVEFILE__` だけ置く。`doGet`/`doPost` が透過的に処理するのでフロントは無変更。
- シートに巨大セルがあると、そのシートへの全書き込みが極端に遅くなる（小データでも10秒超）。大きいデータは必ずドライブへ逃がす。
- 書き込みは `LockService`（25秒）で直列化。毎日深夜2時に `backup_YYYYMMDD` シートへ自動バックアップ（90日保持）。
- GASは**1プロジェクトに複数デプロイが存在しうる**。フロントが使う本番デプロイIDは `AKfycby...` で始まるもの（**2026-08-08に会社アカウント `hubaniceday.system@gmail.com` の新環境へ移行済み**。旧・個人アカウントの `AKfycbxy...` は稼働したまま残してあり、切り戻し先になる）。コード更新は「デプロイを管理 → 該当デプロイを編集 → 新バージョン」で行う（URLが変わると繋がらなくなる）。DriveApp を使う変更はドライブ権限の再承認＋再デプロイが必要。

### useShared（購読同期）
**保存は「触った所だけ」（v3.03・2026-09-29・Kyoshi承認のBLOCK-B変更）**：`useShared` の保存は、これまで手元の中身をキーごと**丸ごと上書き**していた。表示が欠けた状態（表示消失など）で1件保存すると、サーバー側の他の日・他人の予定まで消える＝**復活しない消え方**の実体だった。v3.03 からは before（保存前の手元）と after を見比べ、`applySharedDiff` で**変わった所だけ**をサーバー最新値（トランザクション `writeVerified`）に当てる。1段目（日付・車ID）と2段目（枠・予約キー）まで見て、触っていない所は base のまま残す。`before` に有り `after` に無い＝その人が消した、として削除。配列や数値はこれまでどおり全置き換え。GAS 版（BACKEND=gas）は従来の `sSet` のまま。検査は `node diff_write_test.js`（旧版では別の日の予定まで消えることも確認）。

**表示消失の見張り（v3.02・2026-09-29）**：v3.01 を入れた端末でも再発したため、原因を追う記録と自動復帰を追加。開いている日の「予定（整備）」「車検」が **あった→ゼロ** になったら、自分の保存から30秒以内を除き、その場で `sGet`（サーバー直読み）→ サーバーに中身があれば `updateLocal` で表示を戻し、黄色い帯で知らせる（保存はしない）。状況は `kv/{STOR}diag-display`（最新50件・端末の localStorage にも30件）に残す：版・ビルド・捨てたキャッシュ数・接続状態・オンライン/非表示・直前に購読値を当てたか（`src`）。**再発時はこの記録を読めば原因が分かる**（読み取りは Admin SDK で `node -e` などから）。検査は `node stale_snapshot_test.js` の④。

**表示消失対策（v3.01・2026-09-28・Kyoshi承認のBLOCK-B変更）**：①最初の読み込みが済んだあと、Firestore が返す**手元の控え（fromCache）の値は画面に当てない**（回線が一瞬不安定になると古い写しが届き、その日の予定が丸ごと消えてリロードで戻る、が起きていた）。②サーバー由来でも**中身が4割以上減る値**は、その場で当てず `sGet`（source:server）で読み直し、本当に減っていれば当て、違えば捨てる。記録は `localStorage` の `STOR+poll-anomaly`（kind:loss）。検査は `node stale_snapshot_test.js`（にせ firebase の `__fakeFb.emit(key,値,{fromCache})` で再現）。mobile も同じく fromCache は当てない。

`useShared(key, def, pollMs)` が各共有状態のフック。Firestore では onSnapshot で購読し（`pollMs` は GAS 版でだけ使う）、サーバーの変更が届くたびに反映する。**書き込み中（writeCount>0）は上書きせず、idベースマージ**でローカルの新しいエントリ（id大）を保持する。配列値（insp等）はマージせずサーバー版を採用。
- **マージは「入れ子のオブジェクト」専用**（`mergeSharedObjects`・Kyoshi承認のBLOCK-B変更 2026-09-24）。値が数値・文字列などの時はサーバー値をそのまま使う。以前は `{...5}` が `{}` になり、車検台数制限（`inspLimits` = {日付:台数}）が空オブジェクトに化けて「制限が勝手に解除される」「その月を開くと画面が落ちる（React error #31）」が起きた。検査は `node merge_scalar_test.js`。

## コミット規約

- 機能変更は DEV と本番の両リポジトリに反映する（ユーザーが両方を運用しているため）。`git -C <path>` で各リポジトリを操作。
- **バージョン番号はシステム全体で1つ。バージョンアップ時は必ず「スケジュール・リスト・モバイル」の3点セットを同じ値に揃える**（ユーザー指示・2026-07-15）: 機能追加・修正を反映するたびに0.01上げ、次の3ファイルを**必ず同一値**にする——① `index_dev.html`（本番 `index_main.html`）の `APP_VERSION` ② `customers.html` の `APP_VERSION` ③ `mobile.html` の `MOBILE_VERSION`。**1ファイルだけの変更でも3つとも上げる**。ヘッダーのバージョン表示はユーザーが「どの版が配信されているか」を確認する手段なので、上げ忘れないこと。
- **DEVへ push する前に `node stamp_build.js` を実行して `__APP_BUILD` を更新する**（3ファイル一括）。これが古いままだと開きっぱなしの画面に更新の帯が出ない。v2.27からはバージョン番号の違いでも帯が出るが、番号の上げ忘れと二重に守るため両方やる。
- 日本語コミットメッセージで可。
- GASコードをチャットからコピーさせると全角文字が化けて構文エラーになることがある。控えの `.gs` ファイルをメモ帳で開かせてコピーさせると確実。
