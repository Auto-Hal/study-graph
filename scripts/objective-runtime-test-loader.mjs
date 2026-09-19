// Test-only: retain real adapter modules while replacing Next's server-only marker in Node.
// All network calls in adapter tests are captured; this loader is never used by the app.
import { register } from "node:module";
register(new URL("./objective-runtime-test-hooks.mjs", import.meta.url));
