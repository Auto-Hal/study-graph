# Architecture

## Current architecture — Phase 1 MVP

```text
                    ┌──────────────┐
                    │    Notion    │
                    │ Knowledge DB │
                    └──────┬───────┘
                           │ read-only
                           ↓
┌─────────┐       ┌──────────────────┐       ┌──────────┐
│ Browser │ ←──→  │ Study Graph      │ ←──→  │ Supabase │
└─────────┘       │ Next.js / Vercel │       │ Review   │
                  └──────────────────┘       │ State    │
                                             └──────────┘
```

OpenAI APIはPhase 1では使用しない。基本機能はAIなしで成立させる。

## Responsibilities

### Notion — source of truth

- 講義本文
- Characters / Mistakesなどの学習知識
- Relation
- 人間が読み返したい整理済み情報
- Phase 1ではStudy Graphからwriteしない

### Study Graph / Next.js

- Home / Projects / Review / Progress / Settings UI
- NotionとSupabaseのサーバー側統合
- 今日の復習選定
- 復習セッション
- 接続状態・空状態・エラー状態の提示
- Asia/Tokyoでの日時表示
- PWA metadata / app icon

データ閲覧画面はServer Componentを基本とし、復習セッションなど状態管理が必要な部分だけClient Componentを使用する。

### Supabase — review persistence

- `review_attempts`: 自己評価のappend-only履歴
- `review_state`: 項目ごとの現在のスケジューリング状態
- 保護されたRPC経由の履歴・状態取得
- 保護されたRPC経由の復習結果保存

直接のテーブル公開は行わず、RLSを有効化する。Vercel側のserver-only `STUDY_GRAPH_APP_TOKEN` をRPC内で検証する。

### OpenAI API — Phase 2+ / optional

- 新規問題生成
- 自由記述採点
- 高度な解説
- 弱点に応じた類題生成

AIは既存の復習・閲覧機能を置き換えず、必要性を確認してから任意機能として追加する。

## Security rules

1. Notion tokenはサーバーのみ。
2. `STUDY_GRAPH_APP_TOKEN` はサーバーのみ。
3. Supabase publishable keyは公開可能だが、復習RPCは別トークン検証を必須にする。
4. ブラウザへsecretを露出しない。
5. NotionはPhase 1でread-only扱いにする。
6. 復習テーブルはRLSを有効化し、直接のanon/authenticated table accessを許可しない。
7. 失敗時は可能な範囲でNotion由来の復習キューへフォールバックし、学習を止めない。

## Data flow

### Knowledge browsing

```text
Browser → Next.js Server Component → Notion API → rendered UI
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
