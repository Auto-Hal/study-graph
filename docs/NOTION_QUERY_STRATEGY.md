# Notion Query Strategy

Study Graphでは、Notionを知識のSource of Truthとして維持しつつ、Notion API / connector双方の不要な全件問い合わせを避ける。

## App runtime

- Graph Adapterは選択中プロジェクトだけを読む。
- Data Source queryは`page_size: 100`と`next_cursor`でページネーションする。
- Project Registry層でGraph結果を5分キャッシュする。
- Supabaseの復習状態はNotionとは別に取得し、表示時だけGraphへ重ねる。
- 一時的なNotion失敗時は既存Demo fallbackを維持する。

## ChatGPT / development inspection

Notion connectorの調査用query quotaと、Study Graph本体が使うNotion APIのページネーション上限は別物として扱う。

開発時の調査では以下を優先する。

1. 既知のページ / DBはfetchでschemaとRelationを確認する。
2. Data Source queryは、実レコードの確認が必要な場合だけ使う。
3. 同じDBを目的なく繰り返しqueryしない。
4. 複数DBの件数確認は必要な対象だけに絞る。
5. 一度取得したData Source ID・property名・Relation先は仕様書とAdapterを参照し、再調査を減らす。

## Growth thresholds

### 100件超

通常のcursor paginationで処理する。追加設計は不要。

### Relation 25件超 / property

NotionのPage responseだけではRelationが完全でない可能性があるため、`has_more`を検出してPage Property endpointを追加paginationする。

### 数千〜10,000件級

毎回の全件取得をやめる。`last_edited_time`を基準に新規・更新ページだけを取得し、Study Graph側の読み取りキャッシュを差分更新する。

### Rate limit / 429

`Retry-After`に従って再試行する。多数のData Sourceを無制限に並列queryしない。

## Non-goals

- NotionをSupabaseへ丸ごと複製しない。
- Graph専用Relationを別DBへ二重管理しない。
- quota回避を目的にNotion schemaを変更しない。
