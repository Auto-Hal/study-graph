import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import StudyUnitPractice from "@/src/components/StudyUnitPractice";
import { getStudyUnit } from "@/src/lib/review/units/catalog";
import { loadUnitAvailability } from "@/src/lib/review/units/runtime";

export const dynamic = "force-dynamic";

export default async function StudyUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = getStudyUnit(unitId);
  if (!unit) notFound();
  const availability = await loadUnitAvailability(unit);
  return <main className="phase5-session-shell" data-unit-id={unit.id} data-unit-status={availability}>
    <AppHeader context={`${unit.projectTitle} · 単元練習`} backHref="/units" backLabel="単元" />
    <section className="review-project-intro"><div><p className="phase5-eyebrow">{unit.projectTitle} · {unit.minutes}</p><h1>{unit.title}</h1></div><div className="review-session-badge"><strong>{unit.questionCount}</strong><span>問題</span></div></section>
    <StudyUnitPractice unit={unit} availability={availability} />
  </main>;
}
