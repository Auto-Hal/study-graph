'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
export default function HistoryRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="phase5-secondary-action" type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? '読み込み中…' : 'もう一度読み込む'}</button>;
}
