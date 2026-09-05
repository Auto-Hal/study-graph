# Study Graph MVP Specification

## 1. Goal

Notionに蓄積した学習知識を、毎日の学習・復習に使えるUIへ変換する。

Phase 1の対象は「くずし字学習」。AI生成、Knowledge Graph、他学習プロジェクトへの展開はPhase 1には含めない。

## 2. Phase 1 implementation roadmap

初期ドラフトではReview flowとSupabase永続化を一つの段階としていたが、実装上の責務を明確にするためPhase 1.1 / 1.2へ分離した。以下を正式なPhase 1ロードマップとする。

### Phase 1.0 — Notion read-only foundation ✅

- Next.jsアプリ基盤
- Notion Lectures / Characters / Mistakes のサーバー側取得
- Home dashboard
  - 今日の復習候補
  - 完了講義数
  - 要定着文字数
  - 未克服誤読数
  - 最近の講義
  - 文字の定着状況
- Demo fallback
- Notion read-onlyを維持

### Phase 1.1 — Interactive review flow ✅

- `/review` を追加
- 1問ずつ問題を表示
- 答えの表示
- 4段階自己評価
  - もう一度
  - 難しい
  - できた
  - 即答
- セッション結果表示
- Mobile-first review UI

### Phase 1.2 — Review persistence & scheduling ✅

- Study Graph専用Supabase project
- `review_attempts` に回答履歴を追記保存
- `review_state` に現在の復習状態を保存
- 初期スケジューリング
  - again: 10分
  - hard: 初回1日
  - good: 初回2日
  - easy: 初回5日
- Home / Review は期限到来項目だけを表示
- RLS + server-only app token
- Notionは引き続きread-only

### Phase 1.3 — Project navigation & knowledge browsing ✅

- Projects一覧
- くずし字Project詳細
- Lectures一覧 / 詳細
- Characters一覧 / 詳細
- Mistakes一覧 / 詳細
- HomeからStudy Graph内の各詳細へ遷移
- 詳細画面からNotion原本を開ける
- Supabaseに復習状態がある項目は最終評価・次回復習も表示
- 復習日時はAsia/Tokyoで表示

### Phase 1.4 — Progress & review history ✅

- 保護されたSupabase RPC経由で復習履歴を取得
- 復習履歴一覧
- 直近の学習活動
- 次回復習予定の可視化
- 自己評価別の件数・傾向
- 文字 / 誤読単位の履歴表示
- Project詳細に進捗サマリーと学習記録への導線

Phase 1.4では高度な分析やAI診断は行わず、Supabaseに既に存在する履歴を「見返せる」ことを優先する。

### Phase 1.5 — MVP polish & release readiness

- ナビゲーション・空状態・エラー状態の統一
- Mobile / iPad実機でのUI調整
- アクセシビリティの基本確認
- アプリ名・favicon / Home Screen iconを正式化
- 現在の仮 `S` / `SG` アイコンをStudy Graph正式アイコンへ置換
- 設定・接続状態の最低限の可視化
- README / architecture / setup docsの最終整理
- 本番スモークテスト

**Phase 1.5完了を「くずし字MVP完成」とする。**

## 3. Phase 1に含めないもの

- OpenAI API
- AI問題生成・自由記述採点
- Knowledge Graph可視化
- 博物館フィールドモード
- FSRSなど高度な復習アルゴリズムへの置換
- Notionへの大量な回答ログ書き戻し
- 西洋美術史 / 哲学史 / ジャズなど他プロジェクト

これらはPhase 2以降で扱う。

## 4. Product principles

1. Notionを知識の正本とする。
2. Study Graphは「学習するためのUI」に徹する。
3. 高頻度の回答履歴・復習状態はSupabaseへ保存する。
4. Notionの既存DBを壊さず、Phase 1では基本的にread-onlyで接続する。
5. AIがなくても学習アプリとして成立させる。
6. Mobile-firstで、将来の博物館利用へ拡張できる構造を維持する。

## 5. Phase 1 completion criteria

- [x] Notionの実データをHomeへ表示できる
- [x] Mobileで復習セッションを完走できる
- [x] 自己評価をSupabaseへ永続保存できる
- [x] 次回復習日を計算し期限前項目をHomeから除外できる
- [x] Project / entity navigationを本番で利用できる
- [x] 過去の復習履歴と今後の復習予定を確認できる
- [ ] 空状態・失敗状態・主要画面のMobile UIが整っている
- [ ] 正式なStudy Graphアプリアイコンが設定されている
- [ ] Phase 1本番スモークテストが完了している

## 6. Phase 2 direction

Phase 1完成後は、次の順序を基本候補とする。

1. Knowledge Graph / Notion relation visualization
2. 複数学習プロジェクト対応（西洋美術史・哲学史など）
3. より高度な復習アルゴリズム
4. 博物館フィールドモード
5. 必要性を確認したうえでOpenAI APIによる問題生成・説明・採点
