# Architecture

## Current architecture — Phase 2.2

```text
Notion project DBs
  ├─ Kuzushiji
  ├─ Western Art History (next)
  └─ Philosophy (next)
          │ read-only
          ↓
Project-specific Graph Adapter
          │
          ↓
Common GraphNode / GraphEdge
          │
          ├──────────────→ Shared Knowledge Graph UI
          │
Browser ←→ Next.js / Vercel ←→ Supabase review state
```

OpenAI APIは現在使用しない。学習・復習・Graphの基本機能はAIなしで成立させる。

## Responsibilities

### Notion — source of truth

- プロジェクト固有の講義・人物・作品・文字・資料・用語など
- Relation
- 人間が読み返したい整理済み情報
- Study Graphからwriteしない

各学習プロジェクトのNotion schemaは無理に統一しない。

### Project Registry

`src/lib/projects/registry.ts`

- Study Graphが扱う学習プロジェクトを登録
- title / goal / route / current phase / statusを定義
- Graphで利用するNode kind一覧をプロジェクトごとに定義
- 現在は `kuzushiji` がactive
- `western-art-history` と `philosophy` は次フェーズ向けにplanned登録

### Common Graph model

`src/lib/graph/types.ts`

- `GraphNode`
- `GraphEdge`
- `GraphData`
- `GraphNodeKindDefinition`
- `GraphAdapter`

Graph UIはNotionのプロパティ名を知らず、この共通型だけを受け取る。

### Graph Adapter Registry

`src/lib/graph/registry.ts`

```text
project id
   ↓
Adapter lookup
   ↓
project-specific Notion reader
   ↓
GraphData
```

Phase 2.2では既存のくずし字Graph readerを最初のAdapterとしてRegistryへ登録する。

西洋美術史・哲学史では、それぞれの既存Notion schemaに合わせたAdapterを追加するだけで共通Graph UIを再利用できる。

### Study Graph / Next.js

- Home / Projects / Review / Progress / Settings UI
- Project Registry表示
- NotionとSupabaseのサーバー側統合
- 今日の復習選定
- 復習セッション
- 共通Knowledge Graph UI
- `/graph?project=...` によるProject選択
- selected node / relation / focus modeをURL queryへ保持
- 接続状態・空状態・エラー状態の提示
- Asia/Tokyoでの日時表示
- PWA metadata / app icon

データ閲覧画面はServer Componentを基本とし、Graph操作や復習セッションなど状態管理が必要な部分だけClient Componentを使用する。

### Supabase — review persistence

- `review_attempts`: 自己評価のappend-only履歴
- `review_state`: 項目ごとの現在のスケジューリング状態
- 保護されたRPC経由の履歴・状態取得
- 保護されたRPC経由の復習結果保存

直接のテーブル公開は行わず、RLSを有効化する。Vercel側のserver-only `STUDY_GRAPH_APP_TOKEN` をRPC内で検証する。

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
5. Notionはread-onlyで利用する。
6. Graph専用DBへNotion Relationを複製しない。
7. 復習テーブルはRLSを有効化し、直接のanon/authenticated table accessを許可しない。
8. 失敗時は可能な範囲でDemo / Notion由来キューへフォールバックし、学習を止めない。

## Data flows

### Project Graph

```text
Browser GET /graph?project=kuzushiji
        ↓
Next.js Server Component
        ↓
Project Registry → Graph Adapter Registry
        ↓
Kuzushiji Adapter → Notion API (read-only)
        ↓
GraphNode[] + GraphEdge[]
        ↓
Shared GraphExplorer
```

### Review scheduling

```text
Notion review candidates + Supabase review_state
        ↓
Next.js server
        ↓
only due items → Browser
```

### Review grading

```text
Browser → POST /api/review/attempt
        ↓
Next.js server → protected RPC + server-only token
        ↓
Supabase
  ├─ append review_attempts
  └─ update review_state
```
