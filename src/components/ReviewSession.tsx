"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ReviewCard = {
  id: string;
  kind: "character" | "mistake";
  label: string;
  prompt: string;
  front: string;
  reason: string;
  answerRows: Array<{ label: string; value: string }>;
  sourceUrl: string;
};

type Grade = "again" | "hard" | "good" | "easy";

type Result = {
  id: string;
  grade: Grade;
};

const gradeOptions: Array<{
  grade: Grade;
  label: string;
  hint: string;
}> = [
  { grade: "again", label: "もう一度", hint: "ほぼ思い出せなかった" },
  { grade: "hard", label: "難しい", hint: "ヒントがあれば分かった" },
  { grade: "good", label: "できた", hint: "自力で思い出せた" },
  { grade: "easy", label: "即答", hint: "迷わず答えられた" },
];

export default function ReviewSession({ cards }: { cards: ReviewCard[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [finished, setFinished] = useState(false);

  const summary = useMemo(() => {
    const counts: Record<Grade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const result of results) counts[result.grade] += 1;
    return counts;
  }, [results]);

  if (cards.length === 0) {
    return (
      <section className="review-stage empty-stage">
        <p className="eyebrow">REVIEW</p>
        <h1>今日は復習項目がありません。</h1>
        <p>Notion側で再出題対象や未定着文字が追加されると、ここに自動で出てきます。</p>
        <Link className="secondary-action" href="/">ホームへ戻る</Link>
      </section>
    );
  }

  if (finished) {
    const confident = summary.good + summary.easy;
    const needsWork = summary.again + summary.hard;

    return (
      <section className="review-stage result-stage">
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>今日の復習は完了です。</h1>
        <p className="result-lead">{cards.length}問を確認しました。まずは学習体験を固める段階なので、この結果はまだNotionには書き戻しません。</p>

        <div className="result-grid">
          <div><strong>{confident}</strong><span>自力でできた</span></div>
          <div><strong>{needsWork}</strong><span>要再確認</span></div>
          <div><strong>{summary.easy}</strong><span>即答</span></div>
        </div>

        <div className="grade-summary">
          {gradeOptions.map((option) => (
            <div key={option.grade}>
              <span>{option.label}</span>
              <strong>{summary[option.grade]}</strong>
            </div>
          ))}
        </div>

        <div className="result-actions">
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setIndex(0);
              setRevealed(false);
              setResults([]);
              setFinished(false);
            }}
          >
            もう一度復習する
          </button>
          <Link className="secondary-action" href="/">ホームへ戻る</Link>
        </div>
      </section>
    );
  }

  const card = cards[index];
  const progress = ((index + 1) / cards.length) * 100;

  function gradeCurrent(grade: Grade) {
    const nextResults = [...results, { id: card.id, grade }];
    setResults(nextResults);

    if (index >= cards.length - 1) {
      setFinished(true);
      return;
    }

    setIndex((current) => current + 1);
    setRevealed(false);
  }

  return (
    <section className="review-stage">
      <div className="review-progress-row">
        <div>
          <p className="eyebrow">{card.kind === "character" ? "CHARACTER" : "MISTAKE"}</p>
          <span>{index + 1} / {cards.length}</span>
        </div>
        <Link href="/">終了</Link>
      </div>

      <div className="progress-track" aria-label={`復習進捗 ${index + 1}/${cards.length}`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <article className={`study-card ${revealed ? "is-revealed" : ""}`}>
        <div className="study-card-front">
          <span className="review-kind">{card.kind === "character" ? "文字" : "誤読"}</span>
          <p className="study-prompt">{card.prompt}</p>
          <div className={card.kind === "character" ? "study-glyph" : "study-mistake-title"}>{card.front}</div>
          <p className="study-reason">{card.reason}</p>
        </div>

        {!revealed ? (
          <button className="reveal-button" type="button" onClick={() => setRevealed(true)}>
            答えを表示
          </button>
        ) : (
          <div className="answer-panel">
            <p className="eyebrow">ANSWER</p>
            <div className="answer-list">
              {card.answerRows.map((row) => (
                <div key={`${card.id}-${row.label}`}>
                  <span>{row.label}</span>
                  <strong>{row.value || "未登録"}</strong>
                </div>
              ))}
            </div>
            {card.sourceUrl !== "#" && (
              <a className="notion-source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">
                Notionで元データを確認
              </a>
            )}
          </div>
        )}
      </article>

      {revealed && (
        <div className="grade-area">
          <p>どのくらい思い出せましたか？</p>
          <div className="grade-buttons">
            {gradeOptions.map((option) => (
              <button key={option.grade} type="button" onClick={() => gradeCurrent(option.grade)}>
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
