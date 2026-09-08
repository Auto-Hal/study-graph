/** Deep-freeze a snapshot so callers cannot mutate the archived observation. */
export function freezeSnapshot<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") freezeSnapshot(child);
  }
  return Object.freeze(value);
}
