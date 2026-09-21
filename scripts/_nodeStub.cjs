const noop = () => {};
const el = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop, append: noop, removeChild: noop, remove: noop, setAttribute: noop,
  addEventListener: noop, removeEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], children: [], attachShadow: () => ({ appendChild: noop }),
});
globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.document = {
  addEventListener: noop, removeEventListener: noop,
  createElement: el, createTextNode: el, body: el(), head: el(),
  documentElement: el(), querySelector: () => null, querySelectorAll: () => [],
  readyState: "complete",
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.navigator = { userAgent: "node" };
