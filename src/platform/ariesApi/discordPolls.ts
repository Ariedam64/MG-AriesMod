// The Discord long polls this used to pause left with the Community Hub, so
// there is nothing to pause any more. Kept only for the import in
// ui/kit/sprites/iconCache.ts, which belongs to another part of the refactor;
// once that call is unwrapped, this file goes.
export const withDiscordPollPause = <T>(fn: () => Promise<T>): Promise<T> => fn();
