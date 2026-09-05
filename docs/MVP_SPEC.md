# Study Graph MVP Specification

## 1. Goal

Notionに蓄積した学習知識を、毎日の復習に使えるUIへ変換する。

最初の対象は「くずし字学習」。AI生成はMVPに含めない。

## 2. MVPの段階

### Phase 1.0 — Read-only vertical slice

- Next.jsアプリが起動する
- Notionの Lectures / Characters / Mistakes をサーバー側で取得する
- Homeで以下を表示する
  - 今日の復習候補
  - 完了講義数
  - 要定着文字数
  - 未克服誤読数
  - 最近の講義
  - 文字の定着状況
- Notion token未設定時はDemo dataでUI確認可能

### Phase 1.1 — Review flow

- 復習セッション開始
- 問題表示
- 正誤 / 自己評価の記録
- 次回復習日の計算
- 学習ログをSupabaseへ保存

### Phase 1.2 — Project navigation

- Projects一覧
- くずし字Project詳細
- Lectures / Characters / Mistakesの一覧・詳細

## 3. MVPに含めないもの

- OpenAI API
- AI問題生成・自由記述採点
- Knowledge Graph
- 博物館フィールドモード
- Notionへの大量な回答ログ書き戻し
- 西洋美術史 / 哲学史など他プロジェクト

## 4. Product principles

1. Notionを知識の正本とする。
2. Study Graphは「学習するためのUI」に徹する。
3. 細かな回答履歴は将来Supabaseに保存する。
4. Notionの既存DBを壊さず、まずread-onlyで接続する。
5. AIがなくても学習アプリとして成立させる。

## 5. Phase 1.0 acceptance criteria

- [ ] `npm run dev` でHomeが表示される
- [ ] Mobile幅でも主要情報が読める
- [ ] Notion未接続時にDemo dataで破綻しない
- [ ] Notion接続時にLecturesが回次順で取得できる
- [ ] Charactersの習得状態・誤読回数を取得できる
- [ ] Mistakesの再出題・克服済みを取得できる
- [ ] 実tokenがGitにコミットされない
- [ ] Notionへのwrite処理が存在しない

## 6. First validation

最初の実機確認は、既存の「01_くずし字を『読む』とは何か」がHomeの最近の講義に表示されることを基準にする。
