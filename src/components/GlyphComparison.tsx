import ExerciseAsset from "./ExerciseAsset";
import type { ReviewAsset } from "../lib/review/types";

export default function GlyphComparison({ current, references }: { current?: ReviewAsset; references: readonly ReviewAsset[] }) {
  if (!current || !references.length) return null;
  return <section className="glyph-comparison" aria-label="同じ読みの字形比較">
    <h3>同じ読みの字形を見比べる</h3>
    <p>線のつながり・曲がり・広がりを比べ、形が違っても同じ読みになることを確かめます。</p>
    <div className="glyph-comparison-grid">
      <ExerciseAsset asset={{ ...current, caption: "今回の字形" }} />
      {references.map((asset) => <ExerciseAsset key={asset.src} asset={{ ...asset, caption: "前の単元の同じ読み" }} />)}
    </div>
  </section>;
}
