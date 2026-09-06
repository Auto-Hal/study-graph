# Study Graph Phase 2 Specification

## 1. Goal

Phase 1で完成した「学習・復習できるMVP」に、**知識同士の関係を見て理解できる層**を追加する。

Phase 2の中心テーマは Knowledge Graph と複数学習プロジェクト対応。Notionの既存DBを作り替えるのではなく、プロジェクトごとのAdapterでStudy Graph共通モデルへ変換する。

## 2. Principles

1. Notionを知識の正本として維持する。
2. Graph専用DBへRelationを二重管理しない。
3. Notion schemaの違いを無理に統一しない。
4. Study Graph側にproject-specific Adapterを置く。
5. Graph UIは共通化する。
6. OpenAI APIなしでも成立させる。
7. Mobile / iPadで閲覧できることを維持する。

## 3. Phase 2 roadmap

### Phase 2.0 — Knowledge Graph foundation ✅

対象: くずし字

- `/graph` をPrimary Navigationへ追加
- Notion Relationをserver-side / read-onlyで取得
- Lecture / Character / Mistake / Source / ExpressionをGraph化
- SVG Knowledge Graph
- ノード選択、接続強調、検索、種類別強調
- Study Graph詳細 / Notion原本への遷移
- 100件超のData Source向けページネーション
- Demo fallback

Production baseline: 10 nodes / 10 Relations。

### Phase 2.1 — Graph browsing depth ✅

- Sources / Expressionsの一覧・詳細
- 全ノード種類への内部遷移
- 選択ノード中心の表示モード
- Relation種類による絞り込み
- URL queryで選択ノード / Relation / focus modeを保持
- 大規模Graph向け表示密度調整

### Phase 2.2 — Multi-project graph architecture ✅

- Project Registry
- 共通Graph adapter interface
- Project selector
- プロジェクト別Node kind定義
- くずし字Adapterをregistry方式へ移行
- 西洋美術史・西洋哲学史を同じGraph UIへ追加可能な構造

Graph UIはNotion schemaを知らず、`GraphData` と `GraphNodeKindDefinition[]` のみを受け取る。

### Phase 2.3 — Western Art History pilot ✅

既存Notionの8 Data Sourceを変更せず専用Adapterで共通Graphへ変換。

対象:

- Lectures
- Artists
- Artworks
- Art Movements
- Terms
- Historical Periods
- Culture
- Museums & Architecture

主なRelation:

- Lecture ↔ Artist / Artwork / Movement / Term / Period / Culture / Museum
- Artwork ↔ Artist / Movement / Period / Museum
- Artist ↔ Movement / Period / Influence
- Movement ↔ Period / next Movement
- Term ↔ Artwork / Artist / Movement / Period
- Period ↔ next Period / Culture
- Culture ↔ Artwork / Movement
- Museum ↔ architectural Movement

双方向Relationはcanonical sideのみをGraphEdgeへ変換し、逆Relationによる二重線を避ける。

Production validation:

- Notion Relations connected
- 36 nodes / 90 Relations
- 7/8 node types populated（現在の先史美術データには実名Artistがまだ0件）
- Relation filter / focus URL 動作確認済み
- error/fatal runtime log 0件
- 空の初期placeholder pageはNotionを変更せず表示時のみ除外

### Phase 2.4 — Philosophy pilot 🚧

既存Notionの「課題」を除く8 Data Sourceを変更せず専用Adapterで共通Graphへ変換する。

対象:

- 講義
- 哲学者
- 用語
- 哲学的問題
- 原典・著作
- 文化
- 時代
- 思考ノート

実装する主なRelation:

- Lecture ↔ Philosopher / Term / Problem / Work / Culture / Period
- Philosopher ↔ Term / Work / Problem / Culture / Period
- Philosopher ↔ Teacher / Influence
- Term ↔ Problem / Culture
- Problem ↔ Work
- Thought Note ↔ Lecture / Problem

師弟・影響関係はcanonical sideのみを採用し、逆Relationを重複表示しない。

**完了条件**

- [ ] 哲学史がProject selectorから選択可能
- [ ] Vercel Previewでproduction build / TypeScript成功
- [ ] ProductionでNotion実データを取得
- [ ] 8 node typesを共通Graph UIで表示可能
- [ ] Relation filter / focus URL / searchが哲学史でも利用可能
- [ ] GitHub CI成功
- [ ] Productionでnode / relation件数を確認
- [ ] Production error/fatalログに新規問題なし

### Phase 2.5 — Learning-aware Graph

Notion知識GraphとSupabase復習履歴を表示上で統合する。

- 復習期限到来ノードの表示
- 苦手ノードの強調
- 最近復習したノードの表示
- Relation単位で弱点の集まりを把握

Notion Relationそのものへ復習状態を書き戻さない。

## 4. Phase 2に含めないもの

- AIによるGraph自動生成
- OpenAI Embeddingsによる自動Relation追加
- Notion Relationの自動書き換え
- Graph専用ベクトルDB
- 博物館フィールドモード
- 高度なFSRSへの全面移行

## 5. Validation baselines

### Kuzushiji

- 10 nodes
- 10 Relations

### Western Art History

- 36 nodes
- 90 Relations
- 7/8 populated node types

件数は検証用baselineであり、コードへ固定しない。Notionへ学習データを追加すればGraphにも増える。
