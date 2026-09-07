import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidObjectiveSrsEpoch,
  assertValidObjectiveSrsKey,
  calculateObjectiveSchedule,
  objectiveSrsKey,
  type ObjectiveSrsKey,
} from "./objective-srs.ts";
import { calculateLegacySchedule } from "./exercises/attempt.ts";

const key: ObjectiveSrsKey = {
  learnerId: "00000000-0000-4000-8000-000000000001",
  projectId: "kuzushiji",
  objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
  srsEpoch: 1,
};

test("Objective SRS key is deterministic and excludes objectiveVersion", () => {
  assert.doesNotThrow(() => assertValidObjectiveSrsKey(key));
  assert.equal(objectiveSrsKey(key), objectiveSrsKey({ ...key }));
  assert.equal(
    objectiveSrsKey(key),
    '["00000000-0000-4000-8000-000000000001","kuzushiji","kuzushiji.a.eitaigura-u3042-00032-1.read",1]',
  );
  assert.doesNotMatch(objectiveSrsKey(key), /objectiveVersion/);
});

test("Objective SRS key and epoch validators fail closed", () => {
  for (const invalid of [0, -1, 1.5, Number.NaN, Infinity, "1", null, undefined]) {
    assert.throws(() => assertValidObjectiveSrsEpoch(invalid), /positive integer/);
  }
  assert.throws(() => assertValidObjectiveSrsKey({ ...key, srsEpoch: 0 }), /srsEpoch/);
  assert.throws(() => assertValidObjectiveSrsKey({ ...key, objectiveId: "" }), /objectiveId/);
});

test("Objective scheduler delegates to the unchanged legacy four-grade arithmetic", () => {
  const now = new Date("2026-01-02T03:04:05.000Z");
  for (const grade of ["again", "hard", "good", "easy"] as const) {
    for (const [interval, repetitions] of [[0, 0], [5, 2]] as const) {
      assert.deepEqual(
        calculateObjectiveSchedule(grade, interval, repetitions, now),
        calculateLegacySchedule(grade, interval, repetitions, now),
      );
    }
  }
  assert.equal(calculateObjectiveSchedule("again", 8, 4, now).intervalDays, 0);
  assert.equal(calculateObjectiveSchedule("hard", 0, 0, now).intervalDays, 1);
  assert.equal(calculateObjectiveSchedule("good", 0, 0, now).intervalDays, 2);
  assert.equal(calculateObjectiveSchedule("easy", 0, 0, now).intervalDays, 5);
  assert.equal(calculateObjectiveSchedule("hard", 5, 2, now).intervalDays, 6);
  assert.equal(calculateObjectiveSchedule("good", 5, 2, now).intervalDays, 11);
  assert.equal(calculateObjectiveSchedule("easy", 5, 2, now).intervalDays, 16);
});
