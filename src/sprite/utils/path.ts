import type { SpriteConfig } from '../settings';

export const splitKey = (key: string) => String(key || '').split('/').filter(Boolean);

export const joinPath = (base: string, path?: string) =>
  base.replace(/\/?$/, '/') + String(path || '').replace(/^\//, '');

export const dirOf = (path: string) =>
  path.lastIndexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '';

/** Resolve `.`/`..` segments so joined paths don't keep literal `../` traversal. */
function normalizeSegments(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}

export const relPath = (base: string, path: string) =>
  typeof path === 'string'
    ? normalizeSegments(path.startsWith('/') ? path.slice(1) : dirOf(base) + path)
    : path;

export function categoryOf(key: string, cfg: SpriteConfig): string {
  const parts = splitKey(key);
  const start = parts[0] === 'sprite' || parts[0] === 'sprites' ? 1 : 0;
  const width = Math.max(1, cfg.catLevels | 0);
  return parts.slice(start, start + width).join('/') || 'misc';
}

export function labelOf(key: string, cfg: SpriteConfig): string {
  const parts = splitKey(key);
  const start =
    (parts[0] === 'sprite' || parts[0] === 'sprites' ? 1 : 0) + Math.max(1, cfg.catLevels | 0);
  const name = parts.slice(start).join('/') || parts[parts.length - 1] || '';
  if (name.length <= cfg.labelMax) return name;
  return `${name.slice(0, Math.max(0, cfg.labelMax - 3))}...`;
}

export const baseNameOf = (key: string) => {
  const parts = splitKey(key);
  return parts[parts.length - 1] || '';
};

export function animParse(key: string) {
  const parts = splitKey(key);
  const last = parts[parts.length - 1];
  const match = last && last.match(/^(.*?)(?:[_-])(\d{1,6})(\.[a-z0-9]+)?$/i);
  if (!match) return null;
  const baseName = (match[1] || '') + (match[3] || '');
  const idx = Number(match[2]);
  if (!baseName || !Number.isFinite(idx)) return null;
  return { baseKey: parts.slice(0, -1).concat(baseName).join('/'), idx, frameKey: key };
}
