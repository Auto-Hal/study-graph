# 開発環境

## 起動と検証

Node 22.18.0 以上の22系、または24系を使用する。CI は `.nvmrc` の22.18.0。

```sh
npm ci
npm run doctor
npm run check
npm run dev
```

`typecheck` は route 型を生成してから TypeScript を確認する。`test` は全 unit/contract suite、`check` は型・テスト・production build。
`.gitattributes` の LF 設定を保つ。`.tools`、`.next`、環境変数ファイルは Git に含めない。

## この Codex Windows ホスト

Node だけが配布されているため、npm はプロジェクトの `.tools/node_modules/npm` に導入済み。
PowerShell で次を使用できる。

```powershell
./scripts/npm-local.ps1 ci --cache .tools/npm-cache
./scripts/npm-local.ps1 run doctor
./scripts/npm-local.ps1 run check
./scripts/npm-local.ps1 run dev
```

このセッションでは開発サーバーを `http://127.0.0.1:3000` に起動し、今日・学ぶ・復習・Objective state API の200応答を確認した。起動し直す際に localhost へ限定する場合は、PowerShell の引数区切りを引用する。

```powershell
./scripts/npm-local.ps1 run dev '--' '--hostname' '127.0.0.1'
```

Next.js が初回起動時に生成する `AGENTS.md` と `CLAUDE.md` は、bundled Next.js 文書を参照するための補助ファイル。`next-env.d.ts` の型パスも dev / typegen に応じて自動生成される。

wrapper は現在の作業フォルダで npm を実行するため、このリポジトリのルートから呼ぶ。
`.tools` は持ち運ばない。別の Node 環境に npm がある場合は通常の `npm` を使用する。
このホストで再導入する場合は、bundled pnpm を使って `.tools` に npm を導入する。

```powershell
New-Item -ItemType Directory -Path .tools -Force | Out-Null
& 'C:/Users/tsuno/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir .tools add npm@11 --store-dir .tools/pnpm-store
```

ネットワーク制限があるセッションでは依存取得・接続確認に許可された実行が必要。

## 実データ

初回だけ `.env.example` を `.env.local` にコピーし、次の値を設定する。すでに `.env.local` がある場合はコピーで上書きせず、各行の `=` の右側に設定する。秘密値は Git に含めない。

ローカル開発の入力先はリポジトリ直下の `.env.local`。Vercel で実行する環境の入力先は Vercel Dashboard → `study-graph` → Settings → Environment Variables。
Supabase 側の `private.study_graph_config` / `app_token_sha256` には APP_TOKEN の SHA-256 ハッシュを設定する。アプリの環境変数にはトークン本体を使う。

2026-10-07 に4項目を `.env.local` と Vercel の既存 Secret に同期し、DB の `app_token_sha256` を更新した。Notion 認証、legacy 復習、learner Objective state、3科目の snapshot 読み取りはすべて200。接続検証の終了コードは0。
Supabase の「studyなど」接続で対象プロジェクトへの SQL 権限を確認済み。migration 1–22 も適用済みで、Objective v2 prefetch RPC の service-role-only 権限も確認した。
ローカルのアプリはこの hosted DB と同じ learner を使用する。自動 DB テストは下記の隔離インスタンスを使う。

| 変数 | 用途 |
| --- | --- |
| NOTION_TOKEN | curriculum・fresh Scope のサーバー読み取り |
| STUDY_GRAPH_APP_TOKEN | legacy 復習 RPC。DB 側の設定 hash と一致させる |
| SUPABASE_SERVICE_ROLE_KEY | snapshot・Objective runtime。サーバー専用 |
| STUDY_GRAPH_LEARNER_ID | 固定 learner の UUID |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | 開発 DB に切り替える場合の上書き。既定を使う場合はコメントのまま |

専用の開発 DB を使う場合は URL とキーを同じプロジェクトに揃える。
rollout flag は `.env.example` と Phase 仕様を参照する。既存 instance の受理は新規出題 flag と独立している。
`doctor` は存在確認だけを行い、credential や接続の正当性までは検証しない。

## 接続確認と APP_TOKEN 同期

```powershell
./scripts/npm-local.ps1 run check:connections
./scripts/npm-local.ps1 run prepare:token-sync
```

`check:connections` は Notion 認証、legacy 復習、learner 状態、3科目の snapshot を読み取り、1つでも失敗すると終了コード1を返す。回答保存・出題・snapshot 更新は行わず、秘密値や教材本文も出力しない。成功しても回答保存の E2E 完了を意味しない。

`prepare:token-sync` は現在の APP_TOKEN を SHA-256 に変換して `.tools/app-token-sync.sql` を生成する。トークン本体は含まれず、生成だけでは外部設定を変更しない。`.tools` は Git 対象外。

設定更新の対象は Supabase `uhckdhdkywhsqjcquvyj` と Vercel `study-graph` の production。2026-10-07 の設定反映後の deployment は `dpl_GTkbcAVC9sZi2U8niQs2FbPnperV`（READY）。コードは main `549349b2b1a56eb78e1dde58f2dca847181a0105` のまま。ローカルの開発基盤変更はこの再デプロイには含めていない。
旧 deployment ID と hash は Git 対象外の `.tools/production-config-sync-record.json` に保存した。以下は今後のトークン更新時の手順で、今回の同期は完了している。

本番の3科目の snapshot も既存 API で更新し、くずし字 generation 14、哲学史・美術史 generation 5 が有効期限内であることを DB で確認した。哲学史の更新は45秒の検証リクエストを超えたが、サーバー側の公開完了を確認した。画面・回答保存のブラウザ E2E は次の実装作業。

1. DB への SQL アクセスを確保する。手動の場合は [SQL Editor](https://supabase.com/dashboard/project/uhckdhdkywhsqjcquvyj/sql/new) を開く。
2. 現在の hash を `select value from private.study_graph_config where key = 'app_token_sha256';` で取得し、切り戻し用に手元に保存する。
3. Vercel の production `STUDY_GRAPH_APP_TOKEN` をローカルの同名値に更新する。コードの変更とは分け、現在稼働中の commit を再デプロイ対象とする。
4. 本番ビルドの成功を確認して、新しい deployment と DB hash を切り替える。可能なら production の domain 割当を保留してビルドし、生成した SQL を実行してから promote する。通常の再デプロイでは切替前後に短い認証不一致が生じるため、直ちに SQL と deployment の両方を確認する。
5. `check:connections` で6項目の成功を確認し、本番の復習画面も確認する。失敗した場合は保存した旧 hash と旧 deployment の組み合わせに戻す。

生成 SQL は既存の設定1行だけを更新する。設定が存在しない場合はトランザクションを失敗させ、テーブル・権限・公開 schema は変更しない。DB hash の変更直後から旧 APP_TOKEN は使えなくなるので、SQL だけを先に実行しない。

## PostgreSQL 検証

4つの実 DB suite は使い捨ての localhost PostgreSQL 17 と `psql` を必要とする。アプリの `.env.local` は読み込まない。
各 suite は一時 DB を作成し破棄する。suite の role 初期化もあるため通常の開発 DB ではなく専用インスタンスを用いる。

```powershell
$env:STUDY_GRAPH_ISOLATED_DB = '1'
$env:STUDY_GRAPH_TEST_DATABASE_URL = 'postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres'
# PATH にない場合は STUDY_GRAPH_TEST_PSQL に psql.exe のパスを指定
./scripts/npm-local.ps1 run test:db
```

CI は PostgreSQL 17 の service を使って4 suite を実行する。この Windows ホストでは [PostgreSQL 公式案内先の EDB](https://www.enterprisedb.com/download-postgresql-binaries) のバイナリを `.tools/postgresql-17.11` に導入済み。Docker は不要。

```powershell
# このホストでは導入済み。再構築時だけ実行（配布 zip は約382 MB）
./scripts/setup-postgres-local.ps1
# 一時クラスタ作成 → 4 suite → 停止 → 成功時のクラスタ削除
./scripts/test-db-local.ps1
# または
./scripts/npm-local.ps1 run test:db:local
```

`test-db-local.ps1` はランダムな localhost port と一時パスワードを使う。システムサービス・レジストリ・恒久的な PATH は変更せず、アプリの環境変数ファイルも読まない。失敗時は停止後に診断用クラスタを `.tools/pg-test-clusters` に残す。
Codex の Windows sandbox の制限トークンでは `pg_ctl` が起動できなかったため、このホストの DB suite は許可された実行環境で検証した。通常のユーザー PowerShell では上記コマンドを使う。
2026-10-07 に4 suite の全成功、DB の停止、成功時クラスタの削除を確認済み。

## 動作確認の順序

1. `doctor`、`check`、隔離 DB suite。
2. ローカルの今日・学ぶ・復習・Graph の表示と遷移。
3. 開発用の実接続で snapshot・回答保存・再送・次回予定。
4. 本番 SHA・migration・flag の読み取り確認後、必要な rollout を別途実施。

資格情報がない状態の画面表示や unit test の成功は、実サービスへの保存成功を保証しない。


## 隔離ブラウザ検証

回答保存・再送は [BROWSER_E2E.md](BROWSER_E2E.md) の手順を使用する。本番資格情報は不要。Windows は PowerShell 7 の `./scripts/test-db-local.ps1 -Suite e2e`。既存の DB suite は引数なしで実行できる。
