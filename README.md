# Study Graph

Notionを知識の正本として使い、毎日の学習・復習・弱点管理・学習履歴・知識関係の可視化を扱う個人学習アプリです。

## Current phase

Phase 1の **くずし字MVP** は完成済みです。Phase 2では、NotionにあるRelationを学習の地図として使う **Knowledge Graph** を追加しています。

### Phase 1 — Learning MVP ✅

- Notionの Lectures / Characters / Mistakes をread-onlyで取得
- Homeで期限到来した復習を表示
- 1問ずつ答えを確認し、4段階で自己評価
- Supabaseへ復習履歴と次回復習日時を保存
- 講義・文字・誤読記録をStudy Graph内で閲覧
- 復習履歴・評価傾向・次回予定を可視化
- SettingsでNotion / Supabaseの接続状態を確認
- Mobile-first / iPad対応、PWAメタデータと正式アイコン

### Phase 2.0 — Knowledge Graph foundation

- Notionの既存Relationをread-onlyで取得
- くずし字の **講義 / 文字 / 誤読 / 資料 / 表現** を共通Graphノードへ変換
- RelationをSVGで可視化
- ノード選択、接続知識の強調、検索、種類別強調
- Study Graph内の詳細またはNotion原本へ遷移
- Graph専用DBは作らず、Notionを引き続きsource of truthとして維持

OpenAI APIは現在も使用していません。基本機能はAIなしで成立します。

## Data responsibilities

- **Notion**: 講義・文字・誤読・資料・表現・Relationなど、人間が整理する知識の正本
- **Supabase**: 高頻度の復習履歴・スケジューリング状態
- **Study Graph / Vercel**: 両者を統合する学習UIとKnowledge Graph表示

秘密情報はサーバー側だけで使用し、ブラウザへ送信しません。Notionへの書き戻しは行いません。

## Main routes

- `/` — Home
- `/projects` — 学習プロジェクト
- `/projects/kuzushiji` — くずし字Project
- `/review` — 今日の復習
- `/projects/kuzushiji/progress` — 学習記録・次回予定
- `/graph` — Knowledge Graph
- `/settings` — 接続状態・現在の構成

詳細な仕様・同期方針・セキュリティ設計は `docs/` を参照してください。
