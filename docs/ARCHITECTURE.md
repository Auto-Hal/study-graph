# Architecture

## Current architecture — Phase 1.0

```text
Browser
  ↓
Next.js App Router
  ↓ Server Component
Notion service
  ↓
Notion API
  ├─ Lectures
  ├─ Characters
  └─ Mistakes
```

## Planned architecture — Phase 1.1+

```text
                    ┌──────────────┐
                    │    Notion    │
                    │ Knowledge DB │
                    └──────┬───────┘
                           │ read / aggregate write-back
                           ↓
┌─────────┐       ┌──────────────────┐       ┌──────────┐
│ Browser │ ←──→  │ Study Graph      │ ←──→  │ Supabase │
└─────────┘       │ Next.js / Vercel │       │ Learning │
                  └──────────────────┘       │ Logs     │
                                             └──────────┘
```

OpenAI APIは後から任意機能として追加する。基本機能はAIなしで成立させる。

## Responsibilities

### Notion

- 講義本文
- 文字・語彙・史料などの知識
- Relation
- 人間が読み返したい整理済み情報

### Study Graph

- Home / Project / Review UI
- 今日の復習選定
- 復習セッション
- 学習状態の見せ方
- NotionとSupabaseの統合

### Supabase — future

- 回答履歴
- 正誤
- 自己評価
- 回答時間
- 次回復習日
- 間隔反復アルゴリズム用状態

### OpenAI API — future / optional

- 新規問題生成
- 自由記述採点
- 高度な解説
- 弱点に応じた類題生成

## Security rules

1. Notion tokenはサーバーのみ。
2. 将来のSupabase service role keyもサーバーのみ。
3. ブラウザへsecretを露出しない。
4. 外部サービスへのwriteは明示した処理だけに限定する。
5. 初期フェーズではNotionをread-only扱いにする。

## Why Server Components first

Homeはインタラクションよりデータ閲覧が中心なのでServer Componentを基本とする。

- secretをブラウザへ送らない
- Notion取得コードをサーバーに閉じ込められる
- クライアントJavaScriptを増やさずに済む

復習画面など状態管理が必要な箇所だけ、後からClient Componentを追加する。
