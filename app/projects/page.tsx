import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { studyProjects } from "@/src/lib/projects/registry";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading">
        <div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">学ぶ</h1><p className="phase5-context">学習中のプロジェクトと現在位置</p></div>
      </section>
      <section className="phase5-project-grid" aria-label="学習プロジェクト">
        {studyProjects.map((project) => {
          const active = project.status === "active";
          return active ? (
            <Link className="phase5-project-row" href={project.href} prefetch key={project.id}>
              <span className="phase5-project-mark" aria-hidden="true">{project.icon}</span>
              <span><span className="phase5-project-title">{project.title}</span><span className="phase5-project-goal">{project.context}</span></span>
              <span className="phase5-project-arrow" aria-hidden="true">→</span>
            </Link>
          ) : (
            <article className="phase5-project-row" key={project.id} aria-label={`${project.title} 準備中`}>
              <span className="phase5-project-mark" aria-hidden="true">{project.icon}</span>
              <span><span className="phase5-project-title">{project.title}</span><span className="phase5-project-goal">{project.context}</span></span>
              <span className="phase5-project-arrow" aria-hidden="true">→</span>
            </article>
          );
        })}
      </section>
      <section className="phase5-section">
        <div className="phase5-section-heading"><h2>知識のつながり</h2><Link href="/graph">知識のつながりを開く</Link></div>
        <p className="phase5-context">講義や概念の関係を、プロジェクトごとの文脈で眺められます。</p>
      </section>
      <PrimaryNav active="learn" />
    </main>
  );
}
