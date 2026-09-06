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

### Phase 2.0 — Knowledge Graph foundation

対象: くずし字

- `/graph` をPrimary Navigationへ追加
- Notion Relationをserver-side / read-onlyで取得
- 5種類のノードを共通Graph型へ変換
  - Lecture
  - Character
  - Mistake
  - Source
  - Expression
- RelationをGraphEdgeへ変換
  - 講義 → 重要・弱点字
  - 講義 → 誤読記録
  - 講義 → 使用資料
  - 講義 → 頻出表現
  - 誤読 → 関連文字
  - 誤読 → 関連資料
- SVG Knowledge Graph
- ノード選択
- 接続ノード / Relationの強調
- テキスト検索
- 種類別の強調
- Study Graph詳細 / Notion原本への遷移
- 100件を超えるData Sourceも取得できるページネーション
- Demo fallback

**完了条件**

- [ ] GitHub CI成功
- [ ] PreviewでNotion実Relationを可視化
- [ ] `/graph` がPrimary Navigationから利用可能
- [ ] Productionで実データのノード数・Relation数を確認
- [ ] Production error/fatalログに新規問題がない

### Phase 2.1 — Graph browsing depth

- Sources / ExpressionsをStudy Graph内でも一覧・詳細表示
- Graphから全ノード種類へ内部遷移可能にする
- 選択ノード中心の表示モード
- Relation種類による絞り込み
- URL queryで選択ノードを共有できる状態にする
- 大規模Graph向け表示密度調整

### Phase 2.2 — Multi-project graph architecture

- Project registry
- 共通Graph adapter interface
- Project selector
- Graph Node kindをプロジェクト別に拡張可能にする
- 既存くずし字Adapterをregistry方式へ移行

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

## 5. Phase 2.0 production validation target

現在のくずし字Notionデータでは、少なくとも以下が確認できることを期待する。

- Lecture: 1
- Character: 3
- Mistake: 1
- Source: 1
- Expression: 4
- Total nodes: 10

RelationはNotionの実データを基準とし、件数をコードへ固定しない。
