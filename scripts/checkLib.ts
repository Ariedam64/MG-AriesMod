// The generic helpers in src/lib that every feature builds on.
import { debounce, sleep, waitUntil } from "../src/lib/async";
import { Emitter, Subscriptions } from "../src/lib/emitter";
import { formatInteger, formatPrice, pad2 } from "../src/lib/format";
import { clamp, clampFinite } from "../src/lib/math";
import { chance, pickOne } from "../src/lib/random";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
}

async function main(): Promise<void> {
  check("clamp inside", clamp(5, 0, 10) === 5);
  check("clamp below", clamp(-3, 0, 10) === 0);
  check("clamp above", clamp(30, 0, 10) === 10);
  check("clampFinite NaN uses fallback", clampFinite("nope", 0, 10, 4) === 4);
  check("clampFinite string number", clampFinite("12", 0, 10, 4) === 10);

  check("pickOne first", pickOne(["a", "b", "c"], () => 0) === "a");
  check("pickOne last even at 0.9999", pickOne(["a", "b", "c"], () => 0.9999) === "c");
  check("pickOne never past the end", pickOne(["a", "b"], () => 1) === "b");
  check("chance below", chance(0.5, () => 0.2));
  check("chance above", !chance(0.5, () => 0.7));

  check("formatInteger groups", formatInteger(1234567.8) === "1,234,567");
  check("formatInteger round", formatInteger(2.6, "round") === "3");
  check("formatInteger negative is 0", formatInteger(-5) === "0");
  check("formatInteger NaN is 0", formatInteger(NaN) === "0");
  check("formatPrice k", formatPrice(1500) === "1.50k", String(formatPrice(1500)));
  check("formatPrice B", formatPrice(2e9) === "2B", String(formatPrice(2e9)));
  check("formatPrice small", formatPrice(42) === "42");
  check("formatPrice bad", formatPrice("x") === null);
  check("pad2", pad2(7) === "07" && pad2(12) === "12");

  const seen: number[] = [];
  const emitter = new Emitter<number>();
  const off = emitter.on((v) => seen.push(v));
  emitter.on(() => {
    throw new Error("listener failure is expected in this check");
  });
  const quietError = console.error;
  console.error = () => {};
  emitter.emit(1);
  off();
  emitter.emit(2);
  console.error = quietError;
  check("emitter delivers and survives a throwing listener", seen.join() === "1");

  let undone = 0;
  const subs = new Subscriptions();
  subs.add(() => undone++);
  subs.add(Promise.resolve(() => undone++));
  subs.add(undefined);
  subs.dispose();
  await sleep(0);
  check("subscriptions undo sync and promised unsubscribers", undone === 2, `undone=${undone}`);

  let tries = 0;
  const found = await waitUntil(() => (++tries >= 3 ? "ready" : null), { intervalMs: 1 });
  check("waitUntil resolves the probe value", found === "ready" && tries === 3);
  const missing = await waitUntil(() => null, { timeoutMs: 20, intervalMs: 5 });
  check("waitUntil times out to null", missing === null);

  const calls: number[] = [];
  const debounced = debounce((v: number) => calls.push(v), 10);
  debounced(1);
  debounced(2);
  debounced(3);
  await sleep(30);
  check("debounce keeps the last call only", calls.join() === "3", calls.join());
  debounced(4);
  debounced.cancel();
  await sleep(30);
  check("debounce cancel", calls.join() === "3");

  console.log(failed ? `${failed} FAILURES` : "all good");
  process.exit(failed ? 1 : 0);
}

main();
