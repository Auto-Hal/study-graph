export type SchedulerReviewGrade = "again" | "hard" | "good" | "easy";

export type LegacySchedule = {
  intervalDays: number;
  repetitions: number;
  dueAt: string;
};

/** Exact four-grade arithmetic shared by legacy and Objective SRS paths. */
export function calculateLegacySchedule(
  grade: SchedulerReviewGrade,
  previousIntervalDays: number,
  previousRepetitions: number,
  now: Date,
): LegacySchedule {
  const interval = Math.max(0, Math.trunc(previousIntervalDays));
  const repetitions = Math.max(0, Math.trunc(previousRepetitions));

  if (grade === "again") {
    return {
      intervalDays: 0,
      repetitions: 0,
      dueAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    };
  }

  const intervalDays = grade === "hard"
    ? interval === 0 ? 1 : Math.max(1, Math.ceil(interval * 1.2))
    : grade === "good"
      ? interval === 0 ? 2 : Math.max(2, Math.round(interval * 2.2))
      : interval === 0 ? 5 : Math.max(5, Math.round(interval * 3.2));

  return {
    intervalDays,
    repetitions: repetitions + 1,
    dueAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}
