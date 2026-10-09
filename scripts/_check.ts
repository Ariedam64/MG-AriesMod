// The tally every check suite shares.
//
// A suite records its cases with `check` (a condition) or `checkEqual` (a
// value against the expected one), then ends with `done()`, which prints the
// count and exits non-zero if anything failed. A suite with async work wraps
// its body in `run(async () => { ... })` instead, so a thrown error counts as
// a failure rather than escaping as an unhandled rejection.

let passed = 0;
let failed = 0;

/** Readable form of a value for a failure report. */
function show(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || value === null) return String(value);
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Strict equality for primitives (NaN equals NaN), structural equality through
 * JSON for objects and arrays. A number never equals its string form.
 */
function isEqual(got: unknown, want: unknown): boolean {
  if (got === want) return true;
  if (typeof got === "number" && typeof want === "number") return Number.isNaN(got) && Number.isNaN(want);
  if (typeof got !== "object" || typeof want !== "object" || got === null || want === null) return false;
  return JSON.stringify(got) === JSON.stringify(want);
}

/** Records one case that passes when `ok` is true. `detail` is printed only on failure. */
export function check(label: string, ok: boolean, detail?: string): boolean {
  if (ok) {
    passed++;
    console.log(`ok   ${label}`);
  } else {
    failed++;
    process.exitCode = 1;
    console.log(`FAIL ${label}${detail ? `\n     ${detail.split("\n").join("\n     ")}` : ""}`);
  }
  return ok;
}

/** Records one case that passes when `got` equals `want` (see `isEqual`). */
export function checkEqual(label: string, got: unknown, want: unknown): boolean {
  return check(label, isEqual(got, want), `got  ${show(got)}\nwant ${show(want)}`);
}

/** Prints the tally and exits: 0 when every case passed, 1 otherwise or when none ran. */
export function done(): never {
  const total = passed + failed;
  if (total === 0) {
    console.log("\nFAIL no check ran");
    process.exit(1);
  }
  console.log(`\n${passed}/${total} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

/** Runs a suite body, sync or async, then `done()`. A thrown error is a failure. */
export function run(main: () => unknown): void {
  Promise.resolve()
    .then(main)
    .then(done, (error: unknown) => {
      check("the suite ran to the end", false, error instanceof Error ? error.stack ?? error.message : show(error));
      done();
    });
}
