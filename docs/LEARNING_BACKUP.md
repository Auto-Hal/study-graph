# 学習データのバックアップと隔離復元

更新: 2026-10-07。個人用Study Graphの最小運用手順。Notionは教材の正本、Supabaseは回答・復習予定の正本。

## 対象と保存場所

`scripts/backup-learning.mjs` は固定の16テーブルを1つのSELECTで取得し、件数・内容checksum・23個のmigrationのファイルhash・取得時刻・作業元commitを記録する。回答の日本語・改行・引用符、履歴ID、問題の保存版、採点結果、Objective予定、発行済み問題、オフライン発行要求、教材snapshotの参照関係を保持する。bigintは文字列で保存し、JavaScriptの整数精度でIDやrevisionを変えない。

- `.tools/learning-backups/*.learning-backup.json` に保存。GitとVercelへのソース公開の対象外。
- `private.study_graph_config`、Auth、資格情報、`.env`、DB接続URLは含めない。
- snapshot同期の実行中leaseとエラー詳細は含めず、復元後に古い実行が再開されることを防ぐ。snapshotの世代・次の世代は保持する。
- 回答内容やNotionの教材データを含む個人ファイルなので、必要に応じて普段使用する保護された保存先へコピーする。自動的な外部アップロード・定期実行は行わない。

これはアプリの学習データの出力であり、Supabase全体、Notion本体、ブラウザ内の未送信回答、キャッシュ画像のバックアップではない。学習後は「保存済み」を確認してから取得する。未送信の回答が残る端末ではストレージを消さない。

## 取得方法A: 接続済みSupabaseの読み取りツール / SQL Editor

本ホストではDB接続URLは設定されていない。追加のDBパスワードを用意せず、以下を使える。

1. `node scripts/backup-learning.mjs sql` で読み取りSQLを出力する。
2. 接続済みSupabaseのSQLツール、またはDashboardのSQL Editorで、対象projectに対してそのSELECTを実行する。関数・tableの追加は不要。1つのSELECTの中で全テーブルを読むため、相互参照が同じ時点に揃う。
3. 結果の `capture` オブジェクトをJSONファイルとして保存する。ツール応答の説明文は含めない。`capture`自体、`{"capture":...}`、1行のJSON配列のいずれも受け付ける。置き場所は `.tools/learning-backups/capture.learning-capture.json` を推奨。
4. `node scripts/backup-learning.mjs pack .tools/learning-backups/capture.learning-capture.json` を実行する。固定table・column・型が現行schemaと一致し、資格情報を持つtableや同期のlease/エラー詳細がないことを確認して、checksum付きのファイルを作る。
5. 出力された保存先を控える。`node scripts/backup-learning.mjs inspect <backup-file>` で後から内容のhashとmigrationの一致を調べられる。回答文や資格情報は標準出力に表示しない。

今回の本番出力はこの方法で取得。読み取りツールの結果はモデル向け出力に全文表示せず、ローカルのGit対象外ファイルへ保存した。

## 取得方法B: DBへの直接接続がある場合

`STUDY_GRAPH_BACKUP_DATABASE_URL` をプロセス環境に設定し、`npm run backup:learning` を実行する。接続先で必要な16テーブルを読めるDBユーザーを使う。Supabaseのservice-role API keyはDB接続URLの代わりにはならない。接続URLをコマンド引数やGitに入れない。

このツールはアプリの `.env.local` を自動で読まず、`repeatable read read only` transactionの中でSELECTだけを実行する。接続エラー時も接続URL・回答・SQLの行内容を表示しない。直接接続での本番取得は本ホストでは未検証。方法Aによる取得・復元は検証済み。

## 隔離復元の手順

このWindowsホスト:

```powershell
pwsh -NoProfile -File scripts/test-db-local.ps1 -Suite backup -BackupFile .tools/learning-backups/<backup-file>.learning-backup.json
```

1. ランダムport・一時パスワードのローカルPostgreSQLを起動する。本番の.envを読まない。
2. バックアップのchecksum、table/column、取得時のmigration hashを検証する。不一致ならデータを挿入しない。
3. 新しく作るランダム名の空DBに全migrationを適用する。利用者が指定した既存DBへは復元しない。
4. 外部キーの依存順に、1つのtransactionで全データを挿入する。immutable trigger、外部キー、check、RLSを無効化しない。どこかで失敗したら挿入全体をrollbackする。
5. 全16テーブルの件数・内容hash、service-roleの予定読取RPCと保存した次回日時を照合する。履歴の採番は復元済み最大IDの次から続く。
6. `.tools/learning-backups/<backup-sha256>.restore-report.json` に検証結果を保存し、復元用DBを削除、DBサーバーを停止する。成功した使い捨てクラスタは削除する。元のファイルと本番DBは保持する。

既存のローカル開発サーバーや本番DBを復元先に指定できない。Linux/CIでは、使い捨てPostgreSQLの管理DB `/postgres` に限り `STUDY_GRAPH_ISOLATED_DB=1`、`STUDY_GRAPH_TEST_DATABASE_URL`、`STUDY_GRAPH_BACKUP_FILE` を設定し、`npm run test:backup` で同じ検証を実行できる。

## 本番で記録を失った場合

まず残っているDB・バックアップ・端末の未送信回答を保全し、新しい出題と同期を止める。直接既存DBへ流し込まず、取得時のmigrationを使った隔離復元で内容を確かめる。その後、復元先の新しいDB、資格情報の再設定、同じlearner ID、書き込み再開時点を具体化する。資格情報はこのバックアップに含まないため別途設定する。教材画像は取得時のGitの保存版から戻し、Notionの範囲を新しく読み取り、snapshotを更新してから再開する。

本番への復元、別のhosted Supabase projectへの切替、ブラウザの未送信回答の復元は今回の演習には含めない。自動の本番復元コマンドも追加していない。

## 検証済みの範囲

2026-10-07 11:58:50 UTCの本番出力を隔離PostgreSQL 17.11に復元。Objective予定11件、保存済み回答12件、発行済み問題13件、旧方式の履歴33件・状態28件、snapshot22件、オフライン要求3件を含む全16テーブルで件数・hashが一致。復元DBのservice-role読取RPCから予定11件を確認した。本番への回答送信やDB変更は行っていない。

自動テストは資格情報の混入・schema drift・ファイル改変・リモート復元先の拒否を確認する。実DBの固定教材でも16テーブルすべてにデータを作り、復元後に同じReceipt、予定、回答再送、オフライン要求再送が復元前と一致すること、履歴IDが2^53を超えても保たれること、依存行の欠損が全体rollbackになることを確認する。CIに個人のバックアップは渡さない。

Supabase全体のバックアップや `pg_dump` は拡張時の選択肢として残す。[Supabase公式](https://supabase.com/docs/guides/platform/backups)、[PostgreSQL公式](https://www.postgresql.org/docs/17/backup-dump.html)も参照。今回、有料機能や追加サービスは導入していない。

3科目の単元練習も既存の問題archive・instance・attempt・Receiptに保存されるため、サーバー保存済みの回答は16テーブルの対象に含まれる。単元の問題の組と再開位置はブラウザのIndexedDBにあるため、このバックアップから端末の「途中から再開」を復元することはできない。通信断で未同期の回答を含め、端末内の保存領域を消さない。
