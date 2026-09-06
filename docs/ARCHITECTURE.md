# Architecture

## Current architecture — Phase 2

```text
                    ┌────────────────┐
                    │     Notion     │
                    │ Knowledge DBs  │
                    │ + Relations    │
                    └───────┬────────┘
                            │ read-only
                            ↓
┌─────────┐       ┌────────────────────┐       ┌──────────┐
│ Browser │ ←──→  │ Study Graph        │ ←──→  │ Supabase │
└─────────┘       │ Next.js / Vercel   │       │ Review   │
                  │                    │       │ State    │
                  │ Notion adapters    │       └──────────┘
                  │      ↓             │
                  │ common Graph model│
                  └────────────────────┘
```

OpenAI APIは現在も使用しない。基本機能はAIなしで成立させる。

## Responsibilities

### Notion — source of truth

- 講義本文
- Characters / Mistakes / Sources / Expressionsなどの学習知識
- Relation
- 人間が読み返したい整理済み情報
- Study Graphからwriteしない

### Study Graph / Next.js

- Home / Projects / Review / Progress / Graph / Settings UI
- NotionとSupabaseのサーバー側統合
- 今日の復習選定
- 復習セッション
- Knowledge Graphへの変換・可視化
- 接続状態・空状態・エラー状態の提示
- Asia/Tokyoでの日時表示
- PWA metadata / app icon

データ閲覧画面はServer Componentを基本とし、復習セッションやGraph操作など状態管理が必要な部分だけClient Componentを使用する。

### Supabase — review persistence

- `review_attempts`: 自己評価のappend-only履歴
- `review_state`: 項目ごとの現在のスケジューリング状態
- 保護されたRPC経由の履歴・状態取得
- 保護されたRPC経由の復習結果保存

直接のテーブル公開は行わず、RLSを有効化する。Vercel側のserver-only `STUDY_GRAPH_APP_TOKEN` をRPC内で検証する。

### Knowledge Graph adapters

Notion DBごとの構造をUIへ直接埋め込まず、学習プロジェクトごとのAdapterで共通Graph型へ変換する。

```text
Kuzushiji Notion DBs
  ├─ Lectures
  ├─ Characters
  ├─ Mistakes
  ├─ Sources
  └─ Expressions
        ↓
Kuzushiji Graph Adapter
        ↓
GraphNode[] + GraphEdge[]
        ↓
GraphExplorer
```

Phase 2.0ではくずし字Adapterを最初の実装とする。将来の西洋美術史・哲学史は、それぞれの既存Notion schemaに合わせたAdapterを追加し、同じGraphExplorerへ渡す。

Graph専用DBやRelationの複製テーブルは作らない。Notion Relationが正本であり、Study Graphは表示用に読み取るだけとする。

### OpenAI API — optional / later

- 新規問題生成
- 自由記述採点
- 高度な解説
- 弱点に応じた類題生成

AIは既存の復習・閲覧・Graph機能を置き換えず、必要性を確認してから任意機能として追加する。

## Security rules

1. Notion tokenはサーバーのみ。
2. `STUDY_GRAPH_APP_TOKEN` はサーバーのみ。
3. Supabase publishable keyは公開可能だが、復習RPCは別トークン検証を必須にする。
4. ブラウザへsecretを露出しない。
5. Notionはread-only扱いにする。
6. Knowledge GraphもNotion Relationをread-onlyで取得する。
7. 復習テーブルはRLSを有効化し、直接のanon/authenticated table accessを許可しない。
8. 失敗時は可能な範囲でfallbackを提示し、学習画面を壊さない。

## Data flow

### Knowledge browsing

```text
Browser → Next.js Server Component → Notion API → rendered UI
```

### Knowledge Graph

```text
Notion data sources + Relations
        ↓ server-side read
project-specific Graph Adapter
        ↓
GraphNode[] + GraphEdge[]
        ↓ props
Client GraphExplorer
  ├─ SVG layout
  ├─ search / kind focus
  ├─ node selection
  └─ connected-node highlighting
```

### Review scheduling

```text
Notion review candidates
        +
Supabase review_state
        ↓
Next.js server
        ↓
only due items → Browser
```

### Review grading

```text
Browser
  ↓ POST /api/review/attempt
Next.js server
  ↓ protected RPC + server-only token
Supabase
  ├─ append review_attempts
  └─ update review_state
```

### Progress history

```text
Browser request
  ↓
Next.js Server Component
  ├─ Notion metadata
  └─ protected Supabase history/state RPCs
        ↓
combined progress UI
```
