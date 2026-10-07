"use client";

import Link, { useLinkStatus } from "next/link";

function StartLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span data-review-start-pending={pending} aria-busy={pending}>
    <span role={pending ? "status" : undefined}>{pending ? "準備中…" : label}</span> <span aria-hidden="true">→</span>
  </span>;
}

/** Keep issuance routes out of prefetch; acknowledge a deliberate click immediately. */
export default function ReviewStartLink({ href, label }: { href: string; label: string }) {
  return <Link className="phase5-action" href={href} prefetch={false}><StartLabel label={label} /></Link>;
}
