# Study Graph

Notionを知識の正本として使い、毎日の学習・復習・弱点管理・学習履歴・知識関係の可視化を扱う個人学習アプリです。

## Current phase

Phase 1の **くずし字MVP** と、Phase 2の **複数プロジェクトKnowledge Graph** は完成済みです。現在はPhase 3で、美術史・哲学史を含むCross-project Active Learningへ拡張しています。

### Phase 1 — Learning MVP ✅

- Notionの学習データをread-onlyで取得
- Homeで期限到来した復習を表示
- 1問ずつ答えを確認し、4段階で自己評価
- Supabaseへ復習履歴と次回復習日時を保存
- 講義・文字・誤読・資料・頻出表現をStudy Graph内で閲覧
- 復習履歴・評価傾向・次回予定を可視化
- SettingsでNotion / Supabaseの接続状態を確認
- Mobile-first / iPad対応、PWAメタデータと正式アイコン

### Phase 2 — Multi-project Knowledge Graph ✅

- Notionの既存Relationをread-onlyでGraph化
- Project Registry / 共通 `GraphNode` / `GraphEdge` / `GraphAdapter`
- くずし字・西洋美術史・西洋哲学史を同じGraph UIへ接続
- Node選択、検索、Relation絞り込み、選択中心表示、共有URL
- Supabaseの復習状態をGraph nodeへOverlay
- 100件単位pagination + project単位5分cache
- Notion schemaは各学習プロジェクトで維持し、Adapterだけを個別実装

Production baseline:

- くずし字: 10 nodes / 10 Relations
- 西洋美術史: 36 nodes / 90 Relations
- 西洋哲学史: 45 nodes / 187 Relations

### Phase 3.0 — Cross-project Review

- ReviewをProject Registry型へ移行
- くずし字は従来の期限ベースScheduled Reviewを維持
- 美術史はArtwork / Movement / Term / PeriodをAIなしでPractice
- 哲学史はPhilosopher / Work / Term / ProblemをAIなしでPractice
- Notion概要・接続Node・Relationから問題カードを構成
- 初回Practiceで評価したKnowledge nodeだけSupabaseの間隔反復へ参加
- Supabase `item_kind` に汎用 `knowledge` を追加
- Preview fallbackでは評価保存APIを呼ばない

OpenAI APIは現在使用していません。基本機能はAIなしで成立します。

## Data responsibilities

- **Notion**: 講義・人物・作品・用語・資料・Relationなど、人間が整理する知識の正本
- **Supabase**: 高頻度の復習履歴・スケジューリング状態
- **Study Graph / Vercel**: Project Adapter / Review Providerを通して両者を統合する学習UIとKnowledge Graph

秘密情報はサーバー側だけで使用し、ブラウザへ送信しません。Notionへの書き戻しは行いません。

## Main routes

- `/` — Home
- `/projects` — Project Registry / 学習プロジェクト
- `/projects/kuzushiji` — くずし字Project
- `/review?project=kuzushiji` — くずし字Scheduled Review
- `/review?project=western-art-history` — 西洋美術史Practice
- `/review?project=philosophy` — 西洋哲学史Practice
- `/projects/kuzushiji/progress` — くずし字学習記録・次回予定
- `/graph?project=...` — Knowledge Graph
- `/settings` — 接続状態・Adapter構成

詳細な仕様・同期方針・セキュリティ設計は `docs/` を参照してください。
