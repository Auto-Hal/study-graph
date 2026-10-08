import type { ExplanationRubric } from "../exercises/types.ts";
import { philosophyObjectiveRegistry } from "../philosophy-objective-registry.ts";
import { westernArtObjectiveRegistry } from "../western-art-objective-registry.ts";
import { getStudyUnit } from "./catalog.ts";
import { buildUnitExercise as build, type UnitExercise } from "./exercise-builder.ts";
export type { UnitExercise } from "./exercise-builder.ts";
import glyphAssets from "./glyph-assets.ts";
import { kuzComparisonQuestions, artMegalithQuestions, philosophyChangeQuestions } from "./next-registry.ts";

const notionUrl = (id: string) => "https://app.notion.com/p/" + id.replaceAll("-", "");
const kuzLecture = "https://app.notion.com/p/3ccd2793413481819baff81888996b38";
const characterIds: Record<string, string> = {
  "あ": "3ccd2793-4134-815f-95f0-cc64dcdb86c7",
  "い": "3ccd2793-4134-8183-8cb4-c0bf821aba3f",
  "う": "3ccd2793-4134-81fe-81f8-fa1c4f33987c",
};
const kuz = glyphAssets.map(({ reading, asset }) => build({
  projectId: "kuzushiji", exerciseId: "kuzushiji.unit-reading." + asset.assetId,
  subjectId: characterIds[reading], subjectUrl: notionUrl(characterIds[reading]),
  title: "実資料の字形", prompt: "この字形の読みを、ひらがな1字で答えてください。",
  answers: [reading], explanation: `この字形は「${reading}」です。同じ読みでも、書き手や位置により形が変わります。字母はこの画像の判定対象にしていません。`,
  asset, lectureUrl: kuzLecture,
}));
// Interleave the second examples so the learner must look at each shape.
const kuzQuestions = [kuz[0], kuz[2], kuz[4], kuz[3], kuz[1], kuz[5]];

const artLecture = "https://app.notion.com/p/3bdd2793413481058e0fc17980f50ec8";
const artWork = (exerciseId: string, subjectId: string, title: string, prompt: string, answers: string[], explanation: string) => build({
  projectId: "western-art-history", exerciseId, subjectId, subjectUrl: notionUrl(subjectId),
  title, prompt, answers, explanation, lectureUrl: artLecture,
});
const lascaux = "3bdd2793-4134-81b7-bbb2-f26599a9266e";
const altamira = "3bdd2793-4134-8154-8915-f57c9285a37f";
const venus = "3bdd2793-4134-81b4-b386-d872b3aedec5";
const artQuestions: readonly UnitExercise[] = [
  ...westernArtObjectiveRegistry.slice(0, 3),
  artWork("western-art-history.unit.lascaux-country", lascaux, "ラスコー洞窟壁画", "ラスコー洞窟壁画がある国を答えてください。", ["フランス", "フランス共和国", "France"], "ラスコーはフランスの洞窟壁画です。動物の表現と旧石器時代という背景を結び付けて覚えます。"),
  artWork("western-art-history.unit.altamira-country", altamira, "アルタミラ洞窟壁画", "アルタミラ洞窟壁画がある国を答えてください。", ["スペイン", "スペイン王国", "Spain"], "アルタミラはスペインの洞窟壁画です。バイソンなどの動物像で知られ、ラスコーと区別して覚えます。"),
  artWork("western-art-history.unit.venus-material", venus, "ヴィレンドルフのヴィーナス", "ヴィレンドルフのヴィーナスは、どの種類の石で作られていますか。", ["石灰岩", "石灰石", "limestone"], "材質は石灰岩です。旧石器時代の小型女性像で、胸や腹部などの強調が表現の特徴です。"),
  build({
    projectId: "western-art-history", exerciseId: "western-art-history.unit.venus-interpretation",
    subjectId: venus, subjectUrl: notionUrl(venus), title: "ヴィーナス像の意味を考える",
    prompt: "ヴィレンドルフのヴィーナスの形の特徴を挙げ、その用途を断定できるか、1〜3文で説明してください。",
    explanation: "観察できる形の特徴と、豊穣・生殖などに関する解釈を分けて考えます。",
    rubric: {
      modelAnswer: "胸・腹部・臀部などが強調され、顔の特徴は弱められている。豊穣や生殖との関係が論じられるが、具体的な用途や意味は確定していない。",
      requiredPoints: ["身体の特定部分の強調、または顔などの個別的特徴の省略に触れる。", "豊穣・生殖などの解釈は仮説であり、用途は確定していないと述べる。"],
      allowedParaphrases: ["「お腹や胸を大きく表す」「個人の顔つきを描き分けない」など、観察を自分の言葉で述べてよい。", "「豊かさを願う像かもしれないが、使い道は分からない」でもよい。"],
      majorMisconceptions: ["用途が豊穣祈願だと確定している、と断言する。", "強調や省略を、単に技術が未熟だった証拠と決め付ける。"],
    }, lectureUrl: artLecture,
  }),
];

const phiLecture = "https://app.notion.com/p/3bdd279341348105904bd47a4f0f6f52";
const thales = philosophyObjectiveRegistry[0];
const apeiron = philosophyObjectiveRegistry[1];
const anaximenes = philosophyObjectiveRegistry[2];
const philosophyExplanation = (exerciseId: string, scope: UnitExercise, title: string, prompt: string, rubric: ExplanationRubric) => build({
  projectId: "philosophy", exerciseId, subjectId: scope.scopeSubjectId, subjectUrl: scope.scopeSubjectUrl,
  title, prompt, rubric, explanation: "言葉の一致ではなく、必要な要点と重大な誤解を確認して自己評価します。", lectureUrl: phiLecture,
});
const phiQuestions: readonly UnitExercise[] = [
  ...philosophyObjectiveRegistry,
  philosophyExplanation("philosophy.unit.thales-explanation", thales, "タレスの問い", "タレスの根源説で、「水」という答え以外に重要な点を、1〜3文で説明してください。", {
    modelAnswer: "多様な世界を、自然そのものにある共通の根源から説明しようとした点が重要である。タレスの説は、水をその根源とする試みとして伝えられる。",
    requiredPoints: ["多様なものの共通する根源・原理を探すという問いを述べる。", "自然の内に説明を求める試みとして捉える。"],
    allowedParaphrases: ["「いろいろなものの元は共通だと考えた」「世界の共通の仕組みを自然から考えた」でもよい。", "「自然の側に原因を求める」「神々の物語だけに頼らず説明を探す」でもよい。宗教の全面否定まで主張する必要はない。"],
    majorMisconceptions: ["現代の科学が、すべての物質が水だと証明した、と説明する。", "タレスの考えを単なる飲料水の重要性の話にして、共通原理の問いを落とす。"],
  }),
  philosophyExplanation("philosophy.unit.apeiron-comparison", apeiron, "水とアペイロンを比べる", "タレスの水と、アナクシマンドロスのアペイロンは、根源の考え方がどう違いますか。1〜3文で比べてください。", {
    modelAnswer: "タレスは水という具体的なものを根源としたと伝えられる。一方、アナクシマンドロスは水など特定の性質を持つものを超えた、無限定な根源であるアペイロンを考えた。どちらも世界の根源を問う点は共通している。",
    requiredPoints: ["水は具体的なものとして示された根源だと述べる。", "アペイロンは水など特定の性質に限定されない根源だと述べ、違いを示す。"],
    allowedParaphrases: ["「水のようにこれだと決まったものではない」「性質を限定しない元」「無限定なもの」でもよい。", "「限りのない根源」という表現でも、単に大量の水という意味にしていなければよい。"],
    majorMisconceptions: ["アペイロンを大量の水、空気、特定の元素の別名とする。", "二人とも同じ具体物を根源にしている、と違いを消す。"],
  }),
  philosophyExplanation("philosophy.unit.anaximenes-change", anaximenes, "一つの根源から多様な世界へ", "アナクシメネスは、空気から多様なものが生じることをどう説明しましたか。1〜3文で述べてください。", {
    modelAnswer: "空気の希薄化と凝縮によって、火・風・雲・水・土・石などが生じると説明した。根源が何かという問いに加え、その根源から多様な世界がどう生じるかという変化の仕組みを示そうとした。",
    requiredPoints: ["空気が薄くなることと、濃くなる・凝縮することの両方に触れる。", "その変化によって多様なものが生じるという、根源と世界をつなぐ説明を述べる。"],
    allowedParaphrases: ["「空気が薄まったり、固く集まったりして違うものになる」「密度の違いで物が生まれる」でもよい。", "生じるものを全部列挙する必要はない。例は省略してもよい。"],
    majorMisconceptions: ["空気という名称だけを答え、変化の仕組みを説明しない。", "別の根源が外から加わるという説明に置き換える。"],
  }),
];

const questions: Record<string, readonly UnitExercise[]> = {
  "kuzushiji-kana-1": kuzQuestions,
  "art-prehistory-1": artQuestions,
  "philosophy-arche-1": phiQuestions,
  "kuzushiji-kana-2": kuzComparisonQuestions,
  "art-megaliths-2": artMegalithQuestions,
  "philosophy-change-2": philosophyChangeQuestions,
};

export function getUnitExercises(unitId: string): readonly UnitExercise[] {
  const unit = getStudyUnit(unitId);
  const entries = questions[unitId] ?? [];
  if (unit && entries.length !== unit.questionCount) throw new Error("unit_question_count_mismatch");
  return entries;
}

export function findUnitExercise(unitId: string, exerciseId: string) {
  return getUnitExercises(unitId).find((entry) => entry.exerciseId === exerciseId) ?? null;
}
