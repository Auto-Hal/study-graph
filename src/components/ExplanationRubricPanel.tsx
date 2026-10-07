import type { ExplanationRubric } from "@/src/lib/review/exercises/types";

export default function ExplanationRubricPanel({ rubric }: { rubric: ExplanationRubric }) {
  return <div className="explanation-rubric">
    <div><h3>模範解答の一例</h3><p>{rubric.modelAnswer}</p></div>
    <div><h3>必要な要点</h3><ul>{rubric.requiredPoints.map((point) => <li key={point}>{point}</li>)}</ul></div>
    <div><h3>許容する言い換え</h3><ul>{rubric.allowedParaphrases.map((point) => <li key={point}>{point}</li>)}</ul></div>
    <div><h3>重大な誤解</h3><ul>{rubric.majorMisconceptions.map((point) => <li key={point}>{point}</li>)}</ul></div>
    <p>文章が見本と同じである必要はありません。要点を説明できたか、誤解が残っていないかを見て評価してください。</p>
  </div>;
}
