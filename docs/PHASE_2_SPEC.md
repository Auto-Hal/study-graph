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

**Production確認済み**

- [x] GitHub CI成功
- [x] PreviewでNotion実Relationを可視化
- [x] `/graph` がPrimary Navigationから利用可能
- [x] Productionで10 nodes / 10 Relationsを確認
- [x] Production error/fatalログに新規問題なし

### Phase 2.1 — Graph browsing depth ✅

- [x] Sources / ExpressionsをStudy Graph内でも一覧・詳細表示
- [x] Graphから全ノード種類へ内部遷移
- [x] 選択ノード中心の表示モード
- [x] Relation種類による絞り込み
- [x] URL queryで選択ノード / Relation / focus modeを保持
- [x] 大規模Graph向け表示密度調整

### Phase 2.2 — Multi-project graph architecture

- [x] Project Registry
- [x] 共通Graph adapter interface
- [x] Project selector
- [x] Graph Node kindをプロジェクト別に拡張可能にする
- [x] 既存くずし字Adapterをregistry方式へ移行
- [x] 西洋美術史・西洋哲学史をplanned projectとして事前登録

**設計上の境界**

- Project Registryはプロジェクトの表示情報とNode kind定義を持つ。
- Adapter Registryはactive projectとデータ取得関数を対応付ける。
- Graph UIはNotion schemaを知らず、`GraphData` と `GraphNodeKindDefinition[]` のみを受け取る。
- planned projectはAdapterが追加されるまでNotion APIを呼ばない。

### Phase 2.3 — Western Art History pilot

既存Notion DBを変更せず、以下を中心にAdapterを作成する。

- Lectures
- Artists
- Artworks
- Art Movements
- Terms
- Historical Periods
- Culture
- Museums & Architecture

主な関係例:

- Artist ↔ Artwork
- Artwork ↔ Movement
- Movement ↔ Period
- Artwork ↔ Museum
- Lecture ↔ Artist / Artwork / Term

### Phase 2.4 — Philosophy pilot

既存Notion DBを利用する。

- 講義
- 哲学者
- 用語
- 哲学的問題
- 原典・著作
- 文化
- 時代
- 思考ノート

主な関係例:

- Philosopher ↔ Work
- Philosopher ↔ Term
- Philosopher ↔ Problem
- Work ↔ Problem
- Lecture ↔ Philosopher / Term / Work

### Phase 2.5 — Learning-aware Graph

Notion知識GraphとSupabase復習履歴を表示上で統合する。

- 復習期限到来ノードの表示
- 苦手ノードの強調
- 最近復習したノードの表示
- Relation単位で弱点の集まりを把握

Notion Relationそのものへ復習状態を書き戻さない。

## 4. Phase 2に含めないもの

現時点では以下を別フェーズ扱いとする。

- AIによるGraph自動生成
- OpenAI Embeddingsによる自動Relation追加
- Notion Relationの自動書き換え
- Graph専用ベクトルDB
- 博物館フィールドモード
- 高度なFSRSへの全面移行

## 5. Current Kuzushiji validation baseline

現在のNotion実データ:

- Lecture: 1
- Character: 3
- Mistake: 1
- Source: 1
- Expression: 4
- Total nodes: 10
- Relations: 10

件数は検証用baselineであり、コードへ固定しない。
