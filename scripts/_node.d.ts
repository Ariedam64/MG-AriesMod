// The few Node APIs the check suites use. @types/node is not installed and
// node_modules is committed, so these stand in for it in scripts/tsconfig.json.

declare const process: {
  cwd(): string;
  exit(code?: number): never;
  exitCode: number | undefined;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
