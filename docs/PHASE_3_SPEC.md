# Study Graph Phase 3 Specification

## 1. Goal

Phase 2で完成した複数プロジェクトKnowledge Graphを、**実際の能動学習・復習へつなげる共通基盤**へ拡張する。

Phase 3の中心テーマは Cross-project Active Learning。Notionを知識の正本、Supabaseを高頻度の学習状態として維持し、プロジェクトごとの学習方法を共通Review UIへ接続する。

OpenAI APIはPhase 3.0の必須要件にしない。AIなしで成立する問題・復習・フィールド利用を先に完成させ、AIは後から明示的に追加できる補助層とする。

## 2. Principles

1. Notionを知識の正本として維持する。
2. Supabaseは復習履歴・次回期限など高頻度状態だけを持つ。
3. Notion node idをSupabase `item_id` として使い、GraphとReviewを同じ知識へ接続する。
4. 新しい学習プロジェクトを一括で「今日の復習」に投入しない。
5. 初回Practiceでユーザーが評価した知識だけを間隔反復へ参加させる。
6. 問題生成はまずNotion本文・プロパティ・Relationから決定論的に行う。
7. AIなしでも基本機能を利用可能にする。
8. AIを追加する場合も、保存済み問題の再利用・明示的生成・予算制御を前提にする。
9. Notionへの自動書き戻しは行わない。
10. Mobile / iPad / PWAで学習できることを維持する。

## 3. Roadmap

### Phase 3.0 — Cross-project Review Foundation

Reviewをくずし字専用実装からProject Registry型へ移行する。

#### Kuzushiji

従来の動作を維持する。

- NotionのCharacters / Mistakesから復習候補を取得
- Supabase `due_at` が期限到来した項目を出題
- Character / Mistake専用カードを維持
- 既存4件の履歴・スケジュールを変更しない
- くずし字ProgressはCharacter / Mistake履歴だけを表示する

#### Western Art History

Knowledge GraphをAIなしのPracticeソースとして利用する。

初期対象:

- Artwork
- Art Movement
- Term
- Historical Period

問題はNode labelを表面に出し、回答側で以下を表示する。

- Notion由来の概要
- 接続している知識Node
- Relation種類

初回は最大12件。まだSupabase履歴のないNodeをPractice候補にし、一度自己評価したNodeだけ `knowledge` itemとして復習スケジュールへ参加させる。

#### Western Philosophy

Knowledge GraphをAIなしのPracticeソースとして利用する。

初期対象:

- Philosopher
- Original Work
- Term
- Philosophical Problem

美術史と同様に、Notion概要・接続Node・Relationを回答材料とする。

#### Scheduling

既存の置換可能な簡易スケジューラをそのまま利用する。

- again: 10分
- hard: 初回1日、その後 ×1.2
- good: 初回2日、その後 ×2.2
- easy: 初回5日、その後 ×3.2

Phase 3.0ではFSRSへ変更しない。

#### Supabase schema compatibility

`review_state.item_kind` / `review_attempts.item_kind` に以下を許可する。

- `character`
- `mistake`
- `knowledge`

既存テーブル・RLS・app-token RPC構造は維持する。新しいテーブルは作らない。

#### Fallback safety

Supabase persistenceを利用できない環境では、問題閲覧・自己評価は可能だがAPIへ保存要求を送らない。

Preview環境でSecretがなくても安全に動作することを要件とする。

### Phase 3.1 — Unified Today Queue & Progress

複数プロジェクトの期限到来項目をHomeで統合する。

- Homeにプロジェクト別Due件数を表示
- 全プロジェクト横断の「今日の復習」入口
- project filter付きReview
- 美術史 / 哲学史のProgress表示
- プロジェクト別・全体の学習履歴
- 新規Practice候補と期限到来ReviewをUI上で区別

Phase 3.0ではHomeは従来のくずし字中心のままとし、ここで統合する。

### Phase 3.2 — Relation-aware Question Templates

AIなしの問題形式を増やす。

例:

- Node → 定義 / 概要
- Artwork → Artist / Movement / Period
- Philosopher → Work / Term / Problem
- Relation逆引き
- 複数Node比較
- Graph上の弱点近傍から出題

問題テンプレートはProject AdapterまたはReview Providerに定義し、Notion schemaをReview UIへ漏らさない。

### Phase 3.3 — Field Mode

博物館・文書館など現地で使う軽量学習モード。

特にくずし字では撮影不可資料の現地読解を主目的とする。

- 片手操作しやすいMobile UI
- 文字候補・確度・文脈メモの一時記録
- 「確定 / 有力候補 / 未確定」の段階管理
- 後からNotion原本や学習記録へ整理できる導線
- オフライン耐性を可能な範囲で強化

Notionへの自動書き戻しは別途設計するまで行わない。

### Phase 3.4 — Optional AI Assistance

OpenAI APIはここで初めて任意機能として検討する。

候補:

- Relationを使った追加問題生成
- 自由記述回答の評価補助
- 説明の難易度変更
- 弱点に合わせた追加解説

コスト原則:

- 通常Reviewで毎回答APIを呼ばない
- 保存済み問題を再利用する
- 生成は必要時のみ
- 低コストモデルを基本とし、強いモデルは明示的に選ぶ
- 日次 / 月次予算上限を設ける
- AI停止時もStudy Graphの基本機能は維持する

## 4. Phase 3.0に含めないもの

- Homeの全プロジェクト統合
- 美術史 / 哲学史の専用Progress dashboard
- AI問題生成
- 自由記述のAI採点
- Embeddings / Vector DB
- Notion Relationの自動追加・変更
- Notionへの学習ログ全件書き戻し
- FSRS全面移行
- Field Mode

## 5. Phase 3.0 completion criteria

- `/review?project=kuzushiji` が従来の復習動作を維持する
- `/review?project=western-art-history` でNotion実データのPracticeが表示される
- `/review?project=philosophy` でNotion実データのPracticeが表示される
- 美術史 / 哲学史は1セッション最大12件
- 未評価NodeはPractice候補、評価済みNodeはSupabase期限で制御される
- `knowledge` review attemptを保存可能
- 評価済みKnowledge nodeが既存Learning-aware Graphへ自動Overlayされる
- Preview fallbackではSupabase writeを行わない
- くずし字既存4件のstate / attemptを変更しない
- Notion write 0件
- OpenAI API call 0件
- Production error / fatal runtime log 0件
