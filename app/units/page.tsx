import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { studyUnits } from "@/src/lib/review/units/catalog";

export default function StudyUnitsPage() {
  return <main className="phase5-shell">
    <AppHeader context="単元練習" backHref="/projects" backLabel="学ぶ" />
    <section className="phase5-page-heading"><div><p className="phase5-eyebrow">単元練習</p><h1 className="phase5-page-title">ひと区切りを練習する</h1><p className="phase5-context">科目を選び、短答や説明に取り組みます。回答は保存され、同じ端末で途中から再開できます。</p></div></section>
    <section className="unit-list" aria-label="3科目の単元">
      {studyUnits.map((unit) => <Link href={`/units/${unit.id}`} prefetch={false} className="unit-list-card" key={unit.id}>
        <p className="phase5-eyebrow">{unit.projectTitle}</p><h2>{unit.title}</h2><p>{unit.goal}</p>
        <span>{unit.questionCount}問 · {unit.minutes}</span><strong>単元を開く →</strong>
      </Link>)}
    </section>
    <PrimaryNav active="learn" />
  </main>;
}
