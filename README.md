# Study Graph

Notionを知識の正本として使い、毎日の学習・復習・弱点管理・学習履歴・知識関係の可視化を扱う個人学習アプリです。

## Current phase

Phase 1の **くずし字MVP** は完成済みです。Phase 2ではKnowledge Graphを複数学習プロジェクトへ展開できる共通基盤へ拡張しています。

### Phase 1 — Learning MVP ✅

- Notionの学習データをread-onlyで取得
- Homeで期限到来した復習を表示
- 1問ずつ答えを確認し、4段階で自己評価
- Supabaseへ復習履歴と次回復習日時を保存
- 講義・文字・誤読・資料・頻出表現をStudy Graph内で閲覧
- 復習履歴・評価傾向・次回予定を可視化
- SettingsでNotion / Supabaseの接続状態を確認
- Mobile-first / iPad対応、PWAメタデータと正式アイコン

### Phase 2.0–2.1 — Knowledge Graph ✅

- Notionの既存Relationをread-onlyでGraph化
- くずし字の講義 / 文字 / 誤読 / 資料 / 表現をNodeへ変換
- Node選択、検索、Relation絞り込み、選択中心表示、共有URL
- Sources / ExpressionsをStudy Graph内でも一覧・詳細表示

### Phase 2.2 — Multi-project Graph architecture

- Project Registry
- 共通 `GraphNode` / `GraphEdge` / `GraphAdapter` interface
- `/graph?project=...` のProject selector
- プロジェクトごとにNode kindを定義可能
- くずし字AdapterをRegistryへ登録
- 西洋美術史（Phase 2.3）・西洋哲学史（Phase 2.4）を次のAdapterとして事前登録

OpenAI APIは現在使用していません。基本機能はAIなしで成立します。

## Data responsibilities

- **Notion**: 講義・人物・作品・用語・資料・Relationなど、人間が整理する知識の正本
- **Supabase**: 高頻度の復習履歴・スケジューリング状態
- **Study Graph / Vercel**: Project Adapterを通して両者を統合する学習UIとKnowledge Graph

秘密情報はサーバー側だけで使用し、ブラウザへ送信しません。Notionへの書き戻しは行いません。

## Main routes

- `/` — Home
- `/projects` — Project Registry / 学習プロジェクト
- `/projects/kuzushiji` — くずし字Project
- `/review` — 今日の復習
- `/projects/kuzushiji/progress` — 学習記録・次回予定
- `/graph` — Knowledge Graph
- `/settings` — 接続状態・Adapter構成

詳細な仕様・同期方針・セキュリティ設計は `docs/` を参照してください。
