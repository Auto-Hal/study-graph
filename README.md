# Study Graph

Notionを知識の正本として使い、毎日の学習・復習・弱点管理・学習履歴を扱う個人学習アプリです。

## Phase 1 MVP

最初の対象は **くずし字学習** です。

- Notionの Lectures / Characters / Mistakes をread-onlyで取得
- Homeで期限到来した復習を表示
- 1問ずつ答えを確認し、4段階で自己評価
- Supabaseへ復習履歴と次回復習日時を保存
- 講義・文字・誤読記録をStudy Graph内で閲覧
- 復習履歴・評価傾向・次回予定を可視化
- SettingsでNotion / Supabaseの接続状態を確認
- Mobile-first / iPad対応、PWAメタデータと正式アイコン

OpenAI APIはPhase 1では使用しません。基本機能はAIなしで成立します。

## Data responsibilities

- **Notion**: 講義・文字・誤読など、人間が整理する知識の正本
- **Supabase**: 高頻度の復習履歴・スケジューリング状態
- **Study Graph / Vercel**: 両者を統合する学習UI

秘密情報はサーバー側だけで使用し、ブラウザへ送信しません。Phase 1ではNotionへの書き戻しを行いません。

## Main routes

- `/` — Home
- `/projects` — 学習プロジェクト
- `/projects/kuzushiji` — くずし字Project
- `/review` — 今日の復習
- `/projects/kuzushiji/progress` — 学習記録・次回予定
- `/settings` — 接続状態・MVP設定

詳細な仕様・同期方針・セキュリティ設計は `docs/` を参照してください。
