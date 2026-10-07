# くずし字オンライン出題の再開

更新: 2026-10-07。個人利用の次サイクルで、バックアップ・隔離復元とオンライン出題の再開を進める。

## 現在の対象

新しい出題は、日本永代蔵の「あ」の単字画像を読み、答えを入力し、4段階で自己評価する1問のpilot。くずし字全般・複数文字・短文の出題を完了した状態ではない。正答は既存の日本語正規化を経て「あ」と照合する。哲学史の説明問題の評価方針とは別の契約。

## 再開前に分かったこと

- Vercel Productionの `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` と `NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED=false` は2026-10-04 06:50:56 UTCに追加され、同時刻以降の変更履歴はmetadataにない。
- くずし字の「準備中」は前者の出題停止設定による。global Objective v2の出題設定は有効。
- 停止理由を示す設定commentや現在の運用文書は見つかっていない。過去のPhase 4E-6文書はiPhoneの400とblocked回答の構造診断・明示回復を記録するが、今回の停止の直接原因だとは確認できていない。
- 現行mainのブラウザ検証は、3科目の正常保存、二重操作、送信前失敗、受理後の応答消失とブラウザ再起動を確認済み。実機Safariや通信なしでの起動は未検証。
- 2026-10-07のfresh Notion読み取りは `notion / scope ready`、文字3件、対象pilot候補1件。Objective予定は取得可能で、その1件は期限に達している。教材・予定の書き換えは不要。
- 本番の回答・予定・問題・教材snapshotをバックアップし、隔離DBで復元した。手順は [学習バックアップ](LEARNING_BACKUP.md)。

## 反映する設定

既存のProduction限定 `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED` の値を `true` にし、検証済みmainをProductionへ反映する。secret、learner、Notion、保存経路、schema、他科目のflagはそのまま使う。オフライン起動の再開は実機検証後の作業として残す。

本番のHome / Reviewで「準備中」が解消し、「復習1問」を確認する。画像の取得も確認する。本番へ人工的な回答を送ってSRSを進めない。最初の自然な利用時に、入力→評価→「保存済み」→次回予定を確認する。保存・再送の自動検証は隔離DBで行う。

開始時はfresh ScopeとDBロック下で現在の予定を再確認する。先に別端末で回答した場合などは0問になることがある。取得失敗を0問として表示しない。

## 停止が必要になった場合

`STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` に戻して同じmainを再反映する。既存の回答、出題済み問題、再送ID、未送信outbox、Objective予定を削除しない。既発行instanceの回答・Receipt回収経路は継続する。古いwriterへ振り替えたり、migrationを巻き戻したりしない。

端末にblocked回答が残る場合は、[Phase 4E-6](PHASE_4E_6_FINAL_OFFLINE_HARDENING.md) の構造診断と、同じ回答IDの明示回復を使う。今回の出題再開が、過去の端末内blocked回答を回復済みにすることはない。

実際のdeployment・SHA・本番確認結果は作業の反映記録に残す。
