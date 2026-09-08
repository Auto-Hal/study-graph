/**
 * Runtime-neutral canonical JSON used by all versioned content contracts.
 * Object keys are sorted, array order is preserved, and strings are not
 * normalized.  Keep this module free of Node-only imports so browser
 * snapshot validation can use exactly the same semantic bytes.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeJsonValue(value: unknown, path: string, active: WeakSet<object>): JsonValue {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
      return value;
    case "undefined":
      throw new TypeError(`undefined is not allowed at ${path}`);
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`Unsupported JSON value at ${path}`);
  }

  if (active.has(value)) throw new TypeError(`Cyclic JSON value at ${path}`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      for (const key of keys) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new TypeError(`Unsupported enumerable array property at ${path}.${key}`);
        }
      }
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(`Sparse array is not allowed at ${path}[${index}]`);
        }
        result.push(normalizeJsonValue(value[index], `${path}[${index}]`, active));
      }
      return result;
    }

    if (!isPlainObject(value)) throw new TypeError(`Unsupported object at ${path}`);
    const result: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    for (const key of Object.keys(value).sort()) {
      result[key] = normalizeJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`, active);
    }
    return result;
  } finally {
    active.delete(value);
  }
}

/** Canonical JSON for content hashes: sorted object keys, preserved array order, unchanged strings. */
export function canonicalizeJson(value: unknown): string {
  const normalized = normalizeJsonValue(value, "$", new WeakSet<object>());
  const result = JSON.stringify(normalized);
  if (result === undefined) throw new TypeError("Canonical JSON must be defined");
  return result;
}
