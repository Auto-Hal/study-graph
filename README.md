# Study Graph

Notionを知識の正本として使い、毎日の学習・復習・弱点管理・学習履歴・知識関係の可視化を扱う個人学習アプリです。

## 現在の状態（2026-10-07）

main は Phase 5A-4a まで実装されています。3科目の workspace / Graph、snapshot 表示、Objective ごとの出題・回答・SRS、限定的なオフライン復習を備えています。保存・復旧の修正はPR #128（main `f308577`）で本番反映済みです。3科目の今日・復習入口については [入口の仕様と検証](docs/REVIEW_ENTRY.md) を参照してください。

開発状況・優先順位・今回の検証結果は [開発計画](docs/DEVELOPMENT_PLAN.md)、起動・資格情報・Windows 環境の手順は [セットアップ](docs/DEVELOPMENT_SETUP.md) を参照してください。

```sh
npm ci
npm run doctor
npm run check
npm run dev
```

Node 22.18+ または24系を使用します。この Codex Windows ホストでは `./scripts/npm-local.ps1` を `npm` の代わりに使用できます。
外部接続は `npm run check:connections`、この Windows ホストの隔離 DB 検証は `./scripts/test-db-local.ps1` で確認できます。資格情報の同期と本番への設定反映は完了しています。
通常の復習セッションは `/review/session?project=...`、オフライン準備は `/review/offline` です。

## 過去の開発記録

以下は Phase 1–3 の導入当時の記録です。現在の仕様は上記の開発計画と各 Phase の文書を優先してください。

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
- `/review` — 3科目の復習・未学習・次回予定
- `/review/session?project=kuzushiji` — くずし字の復習
- `/review/session?project=western-art-history` — 西洋美術史の復習・練習
- `/review/session?project=philosophy` — 西洋哲学史の復習・練習
- `/projects/kuzushiji/progress` — くずし字学習記録・次回予定
- `/graph?project=...` — Knowledge Graph
- `/settings` — 接続状態・Adapter構成

詳細な仕様・同期方針・セキュリティ設計は `docs/` を参照してください。
