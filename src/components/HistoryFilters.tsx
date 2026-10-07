'use client';

import { useState } from 'react';
import { historyProjects, type HistoryQuery } from '@/src/lib/history/core';
import { studyUnits } from '@/src/lib/review/units/catalog';

export default function HistoryFilters({ query }: { query: HistoryQuery }) {
  const [project, setProject] = useState(query.project);
  const [unit, setUnit] = useState(query.unit);
  return <form className="history-filters" action="/history" method="get" aria-label="履歴を絞り込む">
    <label>科目<select name="project" value={project} onChange={event => { setProject(event.target.value); setUnit(''); }}>
      <option value="">すべての科目</option>{historyProjects.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}
    </select></label>
    <label>単元<select name="unit" value={unit} onChange={event => setUnit(event.target.value)}>
      <option value="">すべての学習</option>{studyUnits.filter(u => !project || u.projectId === project).map(u => <option value={u.id} key={u.id}>{u.title}</option>)}
    </select></label>
    <label>学習した日（日本時間）<input name="date" type="date" defaultValue={query.date} /></label>
    <label className="history-recheck"><input name="recheck" type="checkbox" value="1" defaultChecked={query.recheck} />要再確認の回答だけ</label>
    <button type="submit" className="phase5-secondary-action">絞り込む</button>
  </form>;
}
