# Study Graph 開発状況と実装計画

> 2026-10-07 の合意により、今後の開発順序・到達条件は [次の開発サイクル](NEXT_DEVELOPMENT_CYCLE.md) を優先する。以下の P0–P4 は当初計画の記録。ブラウザ検証の実行方法と対象は [BROWSER_E2E.md](BROWSER_E2E.md) を参照。

## 2026-10-07: 本番反映と3科目の復習入口

保存・復旧の修正と環境整備は [PR #128](https://github.com/Auto-Hal/study-graph/pull/128) でmainへ取り込んだ。main `f308577bf6a9603c05382c9b3f245a8c6ed166d3`、Vercel `dpl_2hkXwArcT5N1pxtgBoVR9E1JaSMr` のREADYと本番alias割当を確認。GitHub CI run `37610492350` はbuild/browser-e2eとも成功。通常のTurbopack buildもCIで成功した。

https://study-graph-five.vercel.app の /、/projects、/review、3科目のworkspaceはHTTP 200。これは画面の読み取り確認であり、本番への回答送信は実施していない。DB・Notion・出題flagはこの最初の反映では変更していない。

続けて、3科目の復習・未学習・次回日時・取得不可・出題準備中を同じ構成で表示する入口を実装。出題と候補処理を共有し、Objectiveとlegacyの予定を分離した。予定の読取RPCを追加し、既存22 migration・writerは保持。現在の仕様・反映順・制約は [復習入口](REVIEW_ENTRY.md)。

ローカル検証: 593 unit/contract、実PostgreSQL 5組、24ブラウザケース、型検査、隔離source copyのwebpack build、git diff --checkが成功。次のPRでCIと本番読取を確認してから反映する。

以下の記録は初回のローカル検証時点の結果。

## 2026-10-07: 保存・復旧の最初の開発サイクル

### 今回追加・修正した内容

- 合意済みの個人利用・3科目の同等扱い・美術検定・哲学史の言い換え許容を `NEXT_DEVELOPMENT_CYCLE.md` に反映。
- 3科目の固定教材、localhostの使い捨てPostgreSQL、別ポート・別ソースコピーのNext.js、Chromiumの隔離検証を追加。実際の22 migration、採点、RPC、SRS、IndexedDBを通す。
- 美術史を再接続時のoutbox復旧対象へ追加。
- サーバー受理後の応答消失で出題が0問になっても、空の復習画面から受領結果の照合・再送が動くよう修正。
- CIに本番資格情報を使わない独立ブラウザ検証jobと画面・ログの保存を追加。CI上での新job実行は未確認（pushしていない）。
- Next.jsを16.3.4から16.3.6へ最小更新。既存依存の `next/og ImageResponse` の警告を解消し、`npm audit` は0件。公式情報: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j 。アプリのアイコンは固定値で生成されており、外部入力を渡す経路は確認していない。
- PowerShell 7をwrapperの実行先とし、`.tools` の検証コピーを型検査から除外。

### 検証結果

| 検証 | 結果・範囲 |
| --- | --- |
| 3科目 × 390px/820px | 正常保存6ケース成功。画面の次回日時とDBの日時が一致。横方向のあふれなし |
| 二重クリック・送信前失敗・受理後の応答消失 | 3科目 × 3ケース成功。ブラウザprofileを保持して終了・再起動し、同一回答IDで復旧。履歴1件・SRS適用1回 |
| unit/contract | 584件（515 + 17 + 52）、失敗・skip 0 |
| 型検査 | 隔離ソースコピーで `next typegen` と `tsc --noEmit` 成功 |
| production build | 同じコピーで `next build --webpack` 成功。元の開発サーバーの `.next` を使用していない。Turbopack buildは今回再実行していない |
| 実PostgreSQL | 既存4 suite成功。専用クラスタの停止と成功時の削除を確認 |
| 依存検査・差分 | `npm audit` 0件、`git diff --check` 成功 |

本番DB・Notion・Vercelは今回変更していない。今回のE2Eはhosted Supabase/PostgRESTや実Notionを使わない。実機Safari、サービスワーカーによる通信なしの起動、講義閲覧、全問題、美術検定教材、説明の意味採点は未検証。

### Gitと次の作業

作業開始時の既存28ファイルのstage済み差分を `environment-baseline.patch` として今回の作業フォルダに保全。追加作業後もindexの差分は同じSHA-256であり、既存のstageを変更していない。当初は作者未設定でコミットを保留した。2026-10-07 の本番反映の依頼後、連携中の Auto-Hal と既存の noreply 表記を照合し、環境整備をローカルの独立コミット `41424f0` に記録した。本番反映は後続記録を参照。

優先作業1〜4のうち、差分保全・計画反映、隔離環境、正常保存、主要復旧の検証と修正を実施。作業1の独立コミットも記録済み。次は作業5「今日・復習入口と実際のObjective予定の一致」。現在の入口はくずし字legacy候補中心であり、今回の15ケースを通っても3科目の予定表示が完成したことにはならない。

以下は今回の前に作成した状況・環境整備の記録。

確認日: 2026-10-04。調査基準: `Auto-Hal/study-graph` の main `549349b`（PR #125）。
これはコードの確認結果であり、同じ SHA が本番稼働中であることや、本番 DB の migration 適用済みを意味しない。

## 現在の実装

| 領域 | コード上の状態 | 次の確認・制約 |
| --- | --- | --- |
| 学習 UI | 今日・学ぶ・復習の3タブ、3科目の workspace、一覧・詳細、Graph、設定・診断 | 実データを使ったスマートフォン操作確認が必要 |
| データ取得 | 3科目の検証済み snapshot による表示、foreground/manual refresh、最終正常データの維持 | Notion は読み取り専用。初回回答の Scope は fresh read。snapshot は採点権限ではない |
| 復習・SRS | Git 所有の問題と Objective、immutable archive、server-issued instance、回答・Receipt、再送回復、DB による出題・SRS | legacy 復習と Objective の保存経路を混同しない |
| 哲学史 | タレス・アナクシマンドロス・アナクシメネスの3 Objective | rollout flag と現在の講義 Scope に依存 |
| 美術史 | 第1・2講義の7 Objective（旧石器時代、誇張、抽象化、Menhir、Dolmen、Cromlech、Trilithon） | 教材全体を網羅した状態ではない |
| オフライン | くずし字の限定 pilot、service worker、IndexedDB、durable outbox、checksum 検証 | 全科目・全問題のオフライン化ではない |
| Phase 5A-4a | online/offline が同じ Objective opportunity を使う atomic prefetch、複数端末競合・rollback の DB テスト | migration 22 の hosted 適用と稼働 SHA の確認が必要 |
| 品質基盤 | 既存の多数の unit/contract test と4 DB suite | 実サービスの E2E は未整備。文字列検査は動作確認の代わりにならない |

README の旧 Phase 3 説明は現在の実装と一致していなかった。今後は本書と各 Phase の仕様を参照する。
ランタイムの OpenAI API 利用は現在の学習機能の前提ではない。

## 今回の環境整備

- 空だった作業フォルダに最新 main を取得。以前のローカル checkout は変更していない。
- このホストは Node 24.19.0 があり npm がなかったため、`.tools` 内に npm を導入し PowerShell 用 wrapper を追加。
- `package-lock.json`、`.nvmrc`、Node engines を追加。CI の依存導入を `npm ci` に変更。
- `npm test` は全 unit/contract test を収集し、adapter/curriculum 専用 loader を分離する。実 DB suite は自動収集対象外。
- `npm run typecheck` はクリーン checkout でも route 型を生成する。`npm run check` は型検査・全テスト・build を行う。
- CI は従来の focused test / DB gate を保ち、全テストと型生成を追加。
- `.gitattributes` で LF を指定。Windows checkout の CRLF により文書の正規表現 contract が失敗する問題を解消。
- `.env.example` の任意 Supabase override をコメントアウト。空文字による既定接続先の無効化を防止。
- Next.js 16 の非推奨 `middleware.ts` を `proxy.ts` に移行し、既存の復習 route の挙動を維持。
- `npm run doctor` は必要変数の有無、空の override、Node、lockfile、DB ツールを値を出力せず確認。

## 実装順序

### P0: 実接続と稼働状態の確定

1. 開発用 Notion integration・DB・learner を設定し `doctor` と接続状態を確認。
2. 本番の read-only 調査で deployment の SHA、migration 1–22 の履歴・実体、rollout flag、snapshot generation と lease を照合。過去タスクの記録だけで済みと判断しない。
3. migration 22 の RPC/権限、旧 request mapping の回復、新出題に用いる checksum 付き revision を確認。

完了条件: 対象環境と SHA の対応、migration/flag/snapshot の確認結果を記録できること。未適用の本番 migration や rollout は具体的な変更内容を準備したうえで別途実施する。

### P1: 学習フローを E2E で固定

CI 用の隔離 fixture とブラウザ E2E を追加。今日→科目→講義→復習→回答→Receipt→次回予定を検証する。
複数端末での出題共有、二重送信、通信断→再起動→再送、Scope 不可、snapshot 不可、revision v1 の checksum 不可を含める。
ブラウザ E2E と PostgreSQL の競合テストを分け、CI には本番 credential を入れない。

完了条件: 正常系と主要回復系が自動で確認でき、同じ instance の再送が履歴や SRS を重複更新しないこと。390px 前後と iPad サイズで主要操作が成立すること。

### P2: 学習成果の表示を共通化

くずし字中心の Progress を、哲学史・美術史の Objective 単位の記録にも広げる。
理解度、次回予定、回答履歴、教材へのリンクを表示し、不明な値を0や未学習として表示しない。
Snapshot の表示、legacy SRS、Objective SRS の責務を分けた read model を先に設計する。

完了条件: 3科目で保存結果と画面の状態が一致し、取得不可が区別されること。

### P3: 教材拡充と制作手順

哲学史の次の講義、美術史の続く講義を小単位で追加する。
各追加には Scope subject・講義日・採点契約・immutable hash・既存 Objective の不変性を確認するテストを含める。
画像問題は出典・権利・配信・checksum を確定してから導入する。

完了条件: 既存 hash/epoch を無断で変更せず、対象講義が Scope に入る場合だけ出題されること。

### P4: オフラインの対象拡張

現在のくずし字1問 pilot の実機検証が済んでから、複数問・哲学史・美術史へ段階的に広げる。
容量制限、媒体検証、準備状況、復旧導線を追加する。採点確定と SRS はサーバーを正本とする。

完了条件: airplane mode での cold start と回答保持、復帰後の収束、複数端末競合を確認できること。

順序は P0→P1 を先行し、P2/P3 をその後に進め、P4 は E2E が安定してから着手する。機能追加より、現在の保存・復旧契約の実運用確認を優先する。

## 未解決の環境条件

2026-10-07 に4項目を `.env.local` と Vercel の既存 Secret に同期し、DB hash を更新した。Notion、legacy 復習、learner 状態、3科目の snapshot の6項目すべてが200。Supabase 接続の認可問題も解消した。
本番は同じ main `549349b` を再デプロイして設定を反映し、`dpl_GTkbcAVC9sZi2U8niQs2FbPnperV` が READY。本番の今日・学ぶ・復習と2つの読み取り API が200。回答保存の本番テストは行っていない。
PostgreSQL 17.11 と `psql` を `.tools` に導入した。使い捨ての localhost クラスタを使う4つの実 DB suite は全成功し、DB 停止とクラスタ削除も確認した。Docker はこの構成では不要。CI にも PostgreSQL 17 の隔離 service がある。
通常の sandbox では外部接続が制限されるため、依存取得には許可された network 実行を使用した。実接続には Notion API と対象 Supabase ホストへの許可も必要。
本番の migration 1–22 は適用済みで、v2 prefetch の service-role-only 権限を確認した。今回の本番変更は資格情報の同期、同じコードの再デプロイ、および既存 API による教材 snapshot の更新。新しい migration や rollout flag の変更は行っていない。

## 今回の検証結果（Windows / Node 24.19.0）

| 検証 | 結果 |
| --- | --- |
| `npm ci` | lockfile とローカル cache から29 package を再導入できた |
| `./scripts/npm-local.ps1 run check` | route 型生成、TypeScript、全584 test（515 + 17 + 52、失敗/skip 0）、production build が成功 |
| `npm run doctor` | 実行成功。4つの必要変数と portable psql を確認。Docker は任意 |
| `npm run check:connections` | 6項目すべて成功、終了コード0。legacy 復習は28行を読み取り |
| `git diff --check` | 成功 |
| hosted deployment | READY / production、main `549349b`。稼働中コードと調査対象が一致 |
| 実 DB suite | Windows / PostgreSQL 17.11 の使い捨てクラスタで4 suite 全成功 |
| hosted migration 履歴 | 1–22 適用済みを確認 |
| hosted snapshot | 3科目を既存 API で再取得し、有効期限内を DB で確認。くずし字 generation 14、哲学史・美術史 generation 5 |
| 本番の読み取り画面・API | 今日・学ぶ・復習、snapshot と Objective state API が200 |
| ローカル起動 | `127.0.0.1:3000` で今日・学ぶ・復習・Objective state API が200 |
| 回答保存・ブラウザ操作 E2E | 未検証。P1 の次作業 |

初回テストでは CRLF が原因の contract 失敗があり、LF 統一後に全件成功した。Next.js の middleware 非推奨警告は proxy 移行で解消した。
過去のクラウドタスクの検証結果は、このセッションの検証結果には合算していない。
