# Notion Sync Specification

## 1. Direction

Phase 1.0は **Notion → Study Graph のread-only同期** とする。

Study GraphからNotionへの更新は行わない。既存の学習データを安全に保ったまま、取得と表示の品質を先に確認する。

## 2. Source databases

### Lectures

Data source ID: `1da45577-aa7d-44e1-a304-9e33e5feb9e2`

MVPで読むプロパティ:

- 講義名
- 回次
- 学習テーマ
- 状態
- 実施日
- 復習正答率
- 新規字数

将来利用:

- 使用資料
- 誤読記録
- 重要・弱点字
- 頻出表現

### Characters

Data source ID: `4a9814ba-7c44-47ec-8c46-e5d558a62085`

MVPで読むプロパティ:

- 文字
- 読み
- 分類
- 習得状態
- 重要度
- 誤読回数
- 最終復習日

将来利用:

- 字母
- 登録理由
- 間違えやすい字
- 頻出語
- 講義 relation

### Mistakes

Data source ID: `12c37554-c7fa-424f-9590-f2f756bf284a`

MVPで読むプロパティ:

- 誤読項目
- 自分の回答
- 正解
- 原因
- 誤読日
- 再出題
- 克服済み

## 3. Review candidate rule — Phase 1.0

Homeの「今日の復習」は、まだ本格的な間隔反復アルゴリズムではない。

優先順位:

1. `Mistakes.再出題 = true` かつ `克服済み = false`
2. `Characters.習得状態 != 即読`
3. 文字は誤読回数の多い順

最大12件を候補として返し、Homeでは先頭5件を表示する。

Phase 1.1でSupabaseに回答履歴を持ち、次回復習日ベースへ置き換える。

## 4. Authentication

Notion integration secretは `NOTION_TOKEN` としてサーバー環境変数に保存する。

禁止事項:

- `NEXT_PUBLIC_` を付けない
- クライアントコンポーネントへtokenを渡さない
- GitHubへ実tokenをcommitしない

`.env.example` にはData source IDのみ記載し、secretは空欄とする。

## 5. Fetch policy

- Server Componentからサーバー側のNotion serviceを呼ぶ
- 3 databaseは `Promise.all` で並列取得
- 1回の取得は最大100件
- Phase 1.0ではページ本文までは一括取得しない
- 講義詳細画面を作る段階で必要なページだけ取得する

## 6. Future write-back policy

Notionへ書き戻す場合も、回答ログ1件ごとの保存は避ける。

Notionへ戻す候補:

- 最終復習日
- 集約した理解度
- 集約した復習正答率
- 習得状態

細かな回答履歴・回答時間・復習アルゴリズム用パラメータはSupabaseを正本とする。
