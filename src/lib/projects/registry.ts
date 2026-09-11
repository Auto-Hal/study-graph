import type { GraphNodeKindDefinition } from "../graph/types.ts";

export type StudyProjectStatus = "active" | "planned";

export type StudyProjectReviewDefinition = {
  strategy: "notion-queue" | "graph-practice";
  eligibleKinds: string[];
  sessionSize: number;
};

export type StudyProjectDefinition = {
  id: string;
  slug: string;
  title: string;
  shortLabel: string;
  eyebrow: string;
  description: string;
  goal: string;
  /** Short learner-facing context used consistently in the project index. */
  context: string;
  href: string;
  icon: string;
  status: StudyProjectStatus;
  phase: string;
  graphNodeKinds: GraphNodeKindDefinition[];
  review: StudyProjectReviewDefinition;
};

export const studyProjects: StudyProjectDefinition[] = [
  {
    id: "kuzushiji",
    slug: "kuzushiji",
    title: "くずし字",
    shortLabel: "くずし字",
    eyebrow: "KUZUSHIJI",
    description: "講義・文字・誤読・資料・表現をRelationでつなぎ、実物資料の読解力を育てる。",
    goal: "博物館・文書館の実物資料を、訳文なしで自力読解できる状態を目指す。",
    context: "講義と文字を読む",
    href: "/projects/kuzushiji",
    icon: "く",
    status: "active",
    phase: "Phase 1+",
    graphNodeKinds: [
      { id: "character", label: "文字", order: 10 },
      { id: "mistake", label: "誤読", order: 20 },
      { id: "lecture", label: "講義", order: 30 },
      { id: "source", label: "資料", order: 40 },
      { id: "expression", label: "表現", order: 50 },
    ],
    review: {
      strategy: "notion-queue",
      eligibleKinds: ["character", "mistake"],
      sessionSize: 12,
    },
  },
  {
    id: "western-art-history",
    slug: "western-art-history",
    title: "西洋美術史",
    shortLabel: "美術史",
    eyebrow: "WESTERN ART HISTORY",
    description: "Artist・Artwork・Movement・Periodなどを横断し、作品を時代と関係の中で理解する。",
    goal: "体系理解と美術検定2級合格につながる知識構造を可視化する。",
    context: "作品と時代の関係を学ぶ",
    href: "/projects/western-art-history",
    icon: "美",
    status: "active",
    phase: "Phase 3.0 Review",
    graphNodeKinds: [
      { id: "lecture", label: "講義", order: 10 },
      { id: "artist", label: "作家", order: 20 },
      { id: "artwork", label: "作品", order: 30 },
      { id: "movement", label: "様式・運動", order: 40 },
      { id: "term", label: "用語", order: 50 },
      { id: "period", label: "時代", order: 60 },
      { id: "culture", label: "文化・歴史", order: 70 },
      { id: "museum", label: "美術館・建築", order: 80 },
    ],
    review: {
      strategy: "graph-practice",
      eligibleKinds: ["artwork", "artist", "movement", "term", "period", "culture", "museum"],
      sessionSize: 12,
    },
  },
  {
    id: "philosophy",
    slug: "philosophy",
    title: "西洋哲学史",
    shortLabel: "哲学史",
    eyebrow: "WESTERN PHILOSOPHY",
    description: "哲学者・著作・用語・問題をRelationでたどり、論争と思想の継承を見える形にする。",
    goal: "思想を自分の言葉で説明し、時代を越えた問題のつながりを理解する。",
    context: "思想・人物・著作をたどる",
    href: "/projects/philosophy",
    icon: "哲",
    status: "active",
    phase: "Phase 3.0 Review",
    graphNodeKinds: [
      { id: "lecture", label: "講義", order: 10 },
      { id: "philosopher", label: "哲学者", order: 20 },
      { id: "work", label: "原典・著作", order: 30 },
      { id: "term", label: "用語", order: 40 },
      { id: "problem", label: "哲学的問題", order: 50 },
      { id: "period", label: "時代", order: 60 },
      { id: "culture", label: "文化", order: 70 },
      { id: "thought-note", label: "思考ノート", order: 80 },
    ],
    review: {
      strategy: "graph-practice",
      eligibleKinds: ["philosopher", "work", "term", "problem", "culture", "period"],
      sessionSize: 12,
    },
  },
];

export const defaultStudyProjectId = "kuzushiji";

export function getStudyProject(projectId: string | undefined | null) {
  return studyProjects.find((project) => project.id === projectId) ?? null;
}

export function getActiveStudyProjects() {
  return studyProjects.filter((project) => project.status === "active");
}
