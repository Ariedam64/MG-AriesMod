// A small in-memory DOM, enough to build the kit's components in node.
//
// `_nodeStub.cjs` only keeps modules from crashing at import. The kit checks
// need elements that remember their children, classes and listeners, so they
// install this one before building anything.

type Listener = (event: any) => void;

class FakeClassList {
  constructor(private owner: FakeElement) {}
  private get set(): Set<string> {
    return new Set(this.owner.className.split(/\s+/).filter(Boolean));
  }
  private write(next: Set<string>): void {
    this.owner.className = [...next].join(" ");
  }
  add(...names: string[]): void {
    const next = this.set;
    names.forEach((n) => next.add(n));
    this.write(next);
  }
  remove(...names: string[]): void {
    const next = this.set;
    names.forEach((n) => next.delete(n));
    this.write(next);
  }
  toggle(name: string, force?: boolean): boolean {
    const next = this.set;
    const on = force ?? !next.has(name);
    if (on) next.add(name);
    else next.delete(name);
    this.write(next);
    return on;
  }
  contains(name: string): boolean {
    return this.set.has(name);
  }
}

class FakeStyle {
  [key: string]: any;
  setProperty(name: string, value: string): void {
    this[name] = value;
  }
  removeProperty(name: string): void {
    delete this[name];
  }
}

function matches(el: FakeElement, selector: string): boolean {
  return selector.split(",").some((part) => {
    const sel = part.trim();
    // `tag[data-x="y"]` or `.class[data-x="y"]`: the prefix matches like a selector of its own.
    const attr = /^([\w.-]*)\[data-(\w+)="([^"]*)"\]$/.exec(sel);
    if (attr) {
      if (attr[1] && !matches(el, attr[1])) return false;
      return el.dataset[attr[2]] === attr[3];
    }
    if (sel.startsWith(".")) return sel.slice(1).split(".").every((c) => el.classList.contains(c));
    if (sel.startsWith("#")) return el.id === sel.slice(1);
    return el.tagName.toLowerCase() === sel.toLowerCase();
  });
}

class FakeElement {
  tagName: string;
  className = "";
  id = "";
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  dataset: Record<string, string> = {};
  style = new FakeStyle();
  classList = new FakeClassList(this);
  attributes: Record<string, string> = {};
  listeners: Record<string, Listener[]> = {};
  value = "";
  checked = false;
  disabled = false;
  type = "";
  title = "";
  private text = "";

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get isConnected(): boolean {
    return true;
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value: string) {
    this.children = [];
    this.text = String(value ?? "");
  }
  set innerHTML(value: string) {
    this.children = [];
    this.text = String(value ?? "");
  }
  get innerHTML(): string {
    return this.text;
  }
  appendChild<T extends FakeElement>(child: T): T {
    child.parentElement?.removeChild(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...nodes: Array<FakeElement | string>): void {
    for (const node of nodes) {
      if (typeof node === "string") this.text += node;
      else this.appendChild(node);
    }
  }
  prepend(...nodes: FakeElement[]): void {
    for (const node of nodes.reverse()) this.insertBefore(node, this.children[0] ?? null);
  }
  insertBefore<T extends FakeElement>(child: T, ref: FakeElement | null): T {
    child.parentElement?.removeChild(child);
    child.parentElement = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(child);
    else this.children.splice(at, 0, child);
    return child;
  }
  removeChild<T extends FakeElement>(child: T): T {
    this.children = this.children.filter((c) => c !== child);
    child.parentElement = null;
    return child;
  }
  remove(): void {
    this.parentElement?.removeChild(this);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [];
    this.text = "";
    this.append(...nodes);
  }
  contains(node: FakeElement | null): boolean {
    for (let cur = node; cur; cur = cur.parentElement) if (cur === this) return true;
    return false;
  }
  closest(selector: string): FakeElement | null {
    for (let cur: FakeElement | null = this; cur; cur = cur.parentElement) if (matches(cur, selector)) return cur;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (el: FakeElement) => {
      for (const child of el.children) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  removeAttribute(name: string): void {
    delete this.attributes[name];
  }
  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== fn);
  }
  dispatchEvent(event: { type: string }): boolean {
    for (const fn of this.listeners[event.type] ?? []) fn(event);
    const handler = (this as any)[`on${event.type}`];
    if (typeof handler === "function") handler.call(this, event);
    return true;
  }
  click(): void {
    this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} } as any);
  }
  focus(): void {}
  blur(): void {}
  animate(): any {
    return null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

export function installFakeDom(): { localStorage: FakeStorage } {
  const g = globalThis as any;
  const documentElement = new FakeElement("html");
  const head = documentElement.appendChild(new FakeElement("head"));
  const body = documentElement.appendChild(new FakeElement("body"));
  const docListeners = new FakeElement("#document");
  const localStorage = new FakeStorage();

  g.window = g;
  g.document = {
    documentElement,
    head,
    body,
    readyState: "complete",
    visibilityState: "visible",
    activeElement: null,
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => {
      const node = new FakeElement("#text");
      node.textContent = text;
      return node;
    },
    getElementById: (id: string) => documentElement.querySelector(`#${id}`),
    querySelector: (sel: string) => documentElement.querySelector(sel),
    querySelectorAll: (sel: string) => documentElement.querySelectorAll(sel),
    addEventListener: docListeners.addEventListener.bind(docListeners),
    removeEventListener: docListeners.removeEventListener.bind(docListeners),
    dispatchEvent: docListeners.dispatchEvent.bind(docListeners),
  };
  g.localStorage = localStorage;
  // Node 21+ ships a read-only `navigator` getter.
  Object.defineProperty(g, "navigator", {
    value: { userAgent: "node", platform: "node" },
    configurable: true,
  });
  // Window events go through a fake element, so checks can dispatch them.
  const windowEvents = new FakeElement("#window");
  g.addEventListener = windowEvents.addEventListener.bind(windowEvents);
  g.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
  g.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.getComputedStyle = () => ({ getPropertyValue: () => "" });
  g.requestAnimationFrame = (fn: () => void) => setTimeout(fn, 0);
  g.cancelAnimationFrame = (id: any) => clearTimeout(id);
  g.devicePixelRatio = 1;
  g.innerWidth = 1280;
  g.innerHeight = 800;
  g.HTMLElement = FakeElement;
  g.Node = FakeElement;
  g.Event = class {
    constructor(public type: string) {}
  };
  return { localStorage };
}
