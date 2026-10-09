import {
  DEFAULT_MOVEMENT_CONFIG,
  TASK_MOVEMENT_CONFIG,
  drawWanderPause,
  findNearbyWalkable,
  hasGameCaughtUp,
  initialMovementState,
  manhattan,
  stepMovement,
  ticksFromMs,
  type Anchor,
  type IsWalkable,
  type MovementConfig,
  type MovementState,
  type PickInterest,
  type WanderArea,
  type XY,
} from "../src/features/companion/movement";
import { findFirstStep } from "../src/features/companion/pathfinding";
import { matchBuildingName } from "../src/features/companion/buildings";
import { buildCompanionMap } from "../src/features/companion/mapView";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

/** An open 40x40 map with no obstacle. */
const openMap: IsWalkable = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40;

/** The same map, but column x=5 is a wall (except for a door at y=0). */
const wallMap: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);

const cfg = (over: Partial<MovementConfig> = {}): MovementConfig => ({
  ...DEFAULT_MOVEMENT_CONFIG,
  ...over,
});

/** Deterministic random(): always the same draw. */
const fixedRandom = (v: number) => () => v;

/** Default anchor for the tests: the player, as in Follow mode. */
const playerAnchor = (tile: XY): Anchor => ({ tile, onArrival: "wander", tracksPlayer: true });

/** 8-neighbourhood: the game's notion of adjacency (3x3 interaction area). */
const chebyshev = (a: XY, b: XY) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function run(
  state: MovementState,
  player: XY,
  ticks: number,
  isWalkable: IsWalkable = openMap,
  config: MovementConfig = cfg(),
  random: () => number = fixedRandom(0)
) {
  let s = state;
  const path: (XY | null)[] = [];
  const frames: { preTile: XY | null; tile: XY | null; activity: string }[] = [];
  let teleports = 0;
  let illegalSteps = 0;
  for (let i = 0; i < ticks; i++) {
    const prev = s.tile;
    const d = stepMovement({ anchor: playerAnchor(player), state: s, isWalkable, random, config });
    s = d.state;
    if (d.teleported) teleports++;
    // The central invariant: apart from a teleport, a tick moves one tile at most.
    if (!d.teleported && prev && d.tile && manhattan(prev, d.tile) > 1) illegalSteps++;
    path.push(d.tile);
    frames.push({ preTile: prev, tile: d.tile, activity: d.state.activity });
  }
  return { state: s, path, frames, teleports, illegalSteps };
}

console.log("--- spawning ---");
{
  const player = { x: 10, y: 10 };
  const d = stepMovement({
    anchor: playerAnchor(player),
    state: initialMovementState(),
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("spawns next to the player", d.tile && chebyshev(d.tile, player), 1);
  check("the spawn is flagged as a jump", d.teleported, true);
  check("never spawns on the player's tile", d.tile && (d.tile.x === player.x && d.tile.y === player.y), false);
}
{
  // The player is walled in: no walkable tile around.
  const closed: IsWalkable = () => false;
  const d = stepMovement({
    anchor: playerAnchor({ x: 10, y: 10 }),
    state: initialMovementState(),
    isWalkable: closed,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("no walkable tile -> no position, no crash", d.tile, "null");
  check("findNearbyWalkable returns null when everything is blocked", findNearbyWalkable({ x: 1, y: 1 }, closed, true), "null");
}

console.log("\n--- following ---");
{
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 10, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 20, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("no illegal step (more than one tile) while following", r.illegalSteps, 0);
  check("no teleport at distance 10", r.teleports, 0);
  check("ends at followDistance from the player", manhattan(r.state.tile!, player), DEFAULT_MOVEMENT_CONFIG.followDistance);
  check("keeps pursuing while it catches up", r.state.activity, "pursue");
}
{
  // Guard against falling behind: a player standing still must not send a
  // companion that is still far behind off wandering, or it never catches up.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 10, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, DEFAULT_MOVEMENT_CONFIG.idleTicksBeforeWander + 4);
  // The switch to wandering must only happen once the player is reached.
  // (Wandering out to the wander radius afterwards is normal; only the switch is tested.)
  // We look at the position BEFORE the step of the switching tick: that is the
  // state the decision was taken on.
  const firstWander = r.frames.find((f) => f.activity === "wander");
  check(
    "switches to wandering only after catching up",
    firstWander && firstWander.preTile && manhattan(firstWander.preTile, player) <= DEFAULT_MOVEMENT_CONFIG.followDistance,
    true
  );
  check("still ends up wandering once it has arrived", r.state.activity, "wander");
}
{
  // Already at the right distance: it must not hug the player.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 21, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 5, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("does not move when it is already close enough", `${r.state.tile!.x},${r.state.tile!.y}`, "21,20");
}
{
  // A wall between the companion and the player: it must go around, never through.
  const player = { x: 10, y: 5 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 1, y: 5 }, lastAnchorTile: player };
  const r = run(start, player, 40, wallMap);
  const crossedWall = r.path.some((p) => p && p.x === 5 && p.y !== 0);
  check("never crosses a blocked tile", crossedWall, false);
  check("no illegal step while going around the wall", r.illegalSteps, 0);
}

console.log("\n--- switching between follow and wander ---");
{
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 21, y: 20 }, lastAnchorTile: player };
  const idle = DEFAULT_MOVEMENT_CONFIG.idleTicksBeforeWander;
  const before = run(start, player, idle - 1);
  check("keeps pursuing before the idle threshold", before.state.activity, "pursue");
  const after = run(start, player, idle);
  check("switches to wander at the threshold", after.state.activity, "wander");
  check("no illegal step while wandering", after.illegalSteps, 0);

  // The player moves again: straight back to following.
  const resumed = stepMovement({
    anchor: playerAnchor({ x: 21, y: 21 }),
    state: after.state,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("back to pursuing as soon as the player moves", resumed.state.activity, "pursue");
  check("the wander target is dropped on returning to follow", resumed.state.wanderTarget, "null");
}
{
  // Wandering must stay within the radius around the player.
  const player = { x: 20, y: 20 };
  const start: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
  };
  const radius = DEFAULT_MOVEMENT_CONFIG.wanderRadius;
  const r = run(start, player, 60, openMap, cfg(), Math.random);
  const strayed = r.path.some((p) => p && manhattan(p, player) > radius * 2);
  check("never strays far from the player while wandering", strayed, false);
  check("no illegal step over 60 random ticks", r.illegalSteps, 0);
  check("no stray teleport while wandering", r.teleports, 0);
}

console.log("\n--- timings in milliseconds ---");
{
  check("30 s at 150 ms per step = 200 ticks", ticksFromMs(30_000, 150, 0), 200);
  check("15 s at 150 ms per step = 100 ticks", ticksFromMs(15_000, 150, 1), 100);
  // The setting must keep its meaning when the walking speed changes.
  check("30 s at 300 ms per step = 100 ticks", ticksFromMs(30_000, 300, 0), 100);
  check("0 ms honours the requested minimum", ticksFromMs(0, 150, 0), 0);
  check("a short duration does not drop below the minimum", ticksFromMs(10, 150, 1), 1);
  check("invalid pace -> minimum, no division by zero", ticksFromMs(30_000, 0, 1), 1);
}
{
  // The reported bug: the companion set off wandering again every ~600 ms.
  // With a 30 s pause at 150 ms per step, it must stay still for ~200 ticks.
  const player = { x: 20, y: 20 };
  const pauseTicks = ticksFromMs(30_000, 150, 0);
  const config = cfg({ wanderPauseTicks: pauseTicks, idleTicksBeforeWander: 1 });
  let state: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    wanderCooldown: pauseTicks,
  };
  let moves = 0;
  // The cooldown goes down by one tick per call: it uses up `pauseTicks`
  // before the next target is picked.
  for (let i = 0; i < pauseTicks; i++) {
    const prev = state.tile!;
    const d = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config });
    state = d.state;
    if (d.tile && manhattan(prev, d.tile) > 0) moves++;
  }
  check("still for the whole 30 s pause", moves, 0);
  const after = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config });
  check("sets off again once the pause is over", manhattan(state.tile!, after.tile!), 1);
}

console.log("\n--- random wander pause ---");
{
  const ranged = cfg({ wanderPauseTicks: 10, wanderPauseMaxTicks: 20 });
  check("low draw -> lower bound", drawWanderPause(ranged, fixedRandom(0)), 10);
  check("high draw -> upper bound, inclusive", drawWanderPause(ranged, fixedRandom(0.9999)), 20);
  check("middle draw -> in the middle", drawWanderPause(ranged, fixedRandom(0.5)), 15);
  let outOfRange = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) {
    const p = drawWanderPause(ranged, Math.random);
    seen.add(p);
    if (p < 10 || p > 20 || !Number.isInteger(p)) outOfRange++;
  }
  check("500 draws stay in range, in whole ticks", outOfRange, 0);
  check("and the pause really varies", seen.size > 5, true);
  // With no upper bound, or a nonsensical one, the old fixed pause applies.
  check("no upper bound: fixed pause", drawWanderPause(cfg({ wanderPauseTicks: 7, wanderPauseMaxTicks: undefined }), fixedRandom(0.9)), 7);
  check("upper bound below the minimum: fixed pause", drawWanderPause(cfg({ wanderPauseTicks: 7, wanderPauseMaxTicks: 3 }), fixedRandom(0.9)), 7);
  check("NaN upper bound: fixed pause", drawWanderPause(cfg({ wanderPauseTicks: 7, wanderPauseMaxTicks: NaN }), fixedRandom(0.9)), 7);
  // The defaults: 8 to 45 s.
  check("default: 8 s minimum", DEFAULT_MOVEMENT_CONFIG.wanderPauseTicks, ticksFromMs(8_000, 150, 0));
  check("default: 45 s maximum", DEFAULT_MOVEMENT_CONFIG.wanderPauseMaxTicks, ticksFromMs(45_000, 150, 0));
}
{
  // End to end through the state machine: on reaching its target, the pause it
  // sets is the drawn one, not a constant.
  const player = { x: 20, y: 20 };
  const config = cfg({ wanderPauseTicks: 10, wanderPauseMaxTicks: 20 });
  const arrivedOnTarget = (random: () => number): MovementState =>
    stepMovement({
      anchor: playerAnchor(player),
      state: {
        ...initialMovementState(),
        activity: "wander",
        tile: { x: 21, y: 21 },
        lastAnchorTile: player,
        idleTicks: 999,
        wanderTarget: { x: 21, y: 21 },
      },
      isWalkable: openMap,
      random,
      config,
    }).state;
  check("arrival, low draw -> short pause", arrivedOnTarget(fixedRandom(0)).wanderCooldown, 10);
  check("arrival, high draw -> long pause", arrivedOnTarget(fixedRandom(0.9999)).wanderCooldown, 20);
}

console.log("\n--- wandering with a purpose ---");
{
  const player = { x: 20, y: 20 };
  const wandering = (over: Partial<MovementState> = {}): MovementState => ({
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    idleTicks: 999,
    ...over,
  });
  const step = (state: MovementState, pickInterest?: PickInterest | null, config = cfg()) =>
    stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config, pickInterest });

  // Without a hook: exactly the old behaviour (the first tile of the sweep).
  const plain = step(wandering());
  check("no hook: random target as before", `${plain.state.wanderTarget!.x},${plain.state.wanderTarget!.y}`, "17,17");
  check("no hook: target not flagged as an interest", plain.state.wanderTargetIsInterest, false);

  // The hook offers a valid tile: it becomes the target.
  let seenArea: WanderArea | null = null;
  const toward = step(wandering(), (area) => {
    seenArea = area;
    return { x: 22, y: 21 };
  });
  check("the interest is accepted as the target", `${toward.state.wanderTarget!.x},${toward.state.wanderTarget!.y}`, "22,21");
  check("the target is flagged as an interest", toward.state.wanderTargetIsInterest, true);
  check("and it takes a step toward it", `${toward.tile!.x},${toward.tile!.y}`, "21,21");
  const area = seenArea as WanderArea | null;
  check("the hook receives the centre and the radius", area && `${area.center.x},${area.center.y},${area.radius}`, "20,20,3");
  check("the hook receives the current position", area && `${area.from.x},${area.from.y}`, "20,21");
  check("hook area: rejects the centre (the player)", area && area.isWalkable(20, 20), false);
  check("hook area: rejects the current tile", area && area.isWalkable(20, 21), false);
  check("hook area: rejects outside the radius", area && area.isWalkable(24, 20), false);
  check("hook area: accepts a tile within the radius", area && area.isWalkable(23, 23), true);

  // An offer that wandering would not have accepted falls back to chance.
  const outside = step(wandering(), () => ({ x: 30, y: 30 }));
  check("interest outside the radius -> random stroll", `${outside.state.wanderTarget!.x},${outside.state.wanderTarget!.y}`, "17,17");
  check("and the target is not flagged as an interest", outside.state.wanderTargetIsInterest, false);
  const onPlayer = step(wandering(), () => ({ ...player }));
  check("interest on the player -> rejected", onPlayer.state.wanderTargetIsInterest, false);
  const blockedMap: IsWalkable = (x, y) => openMap(x, y) && !(x === 22 && y === 21);
  const onWall = stepMovement({
    anchor: playerAnchor(player),
    state: wandering(),
    isWalkable: blockedMap,
    random: fixedRandom(0),
    config: cfg(),
    pickInterest: () => ({ x: 22, y: 21 }),
  });
  check("interest on a blocked tile -> rejected", onWall.state.wanderTargetIsInterest, false);
  const fractional = step(wandering(), () => ({ x: 21.5, y: 21 }));
  check("interest off the grid -> rejected", fractional.state.wanderTargetIsInterest, false);
  const thrower = step(wandering(), () => {
    throw new Error("boom");
  });
  check("a hook that throws -> random stroll, no crash", thrower.state.wanderTarget !== null && !thrower.state.wanderTargetIsInterest, true);

  // The hook is only consulted when a new target is drawn.
  let calls = 0;
  const counting: PickInterest = () => {
    calls++;
    return { x: 22, y: 21 };
  };
  let s = wandering();
  for (let i = 0; i < 3; i++) s = step(s, counting).state;
  check("a single call for a single target", calls, 1);

  // During the pause there is no new target, so no call.
  calls = 0;
  step(wandering({ wanderCooldown: 5 }), counting);
  check("no call during the pause", calls, 0);

  // While pursuing, wandering does not run: no call either.
  calls = 0;
  stepMovement({
    anchor: playerAnchor(player),
    state: { ...initialMovementState(), tile: { x: 10, y: 20 }, lastAnchorTile: player },
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg({ idleTicksBeforeWander: 999 }),
    pickInterest: counting,
  });
  check("no call while pursuing", calls, 0);
}
{
  // Arriving on an interest is reported, once, and only that.
  const player = { x: 20, y: 20 };
  const config = cfg({ wanderPauseTicks: 4, wanderPauseMaxTicks: 4 });
  let s: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    idleTicks: 999,
  };
  const reached: XY[] = [];
  let illegal = 0;
  let firstPick = true;
  const pick: PickInterest = () => {
    if (!firstPick) return null;
    firstPick = false;
    return { x: 22, y: 22 };
  };
  for (let i = 0; i < 40; i++) {
    const prev = s.tile!;
    const d = stepMovement({ anchor: playerAnchor(player), state: s, isWalkable: openMap, random: fixedRandom(0), config, pickInterest: pick });
    s = d.state;
    if (d.interestReached) reached.push(d.interestReached);
    if (d.tile && manhattan(prev, d.tile) > 1) illegal++;
  }
  check("arriving on the interest is reported once", reached.length, 1);
  check("on the right tile", reached[0] && `${reached[0].x},${reached[0].y}`, "22,22");
  check("no illegal step on the way to look", illegal, 0);
}
{
  // A random stroll that reaches its end reports nothing.
  const player = { x: 20, y: 20 };
  let s: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    idleTicks: 999,
  };
  let reports = 0;
  for (let i = 0; i < 40; i++) {
    const d = stepMovement({ anchor: playerAnchor(player), state: s, isWalkable: openMap, random: fixedRandom(0), config: cfg(), pickInterest: () => null });
    s = d.state;
    if (d.interestReached) reports++;
  }
  check("random stroll: no interest arrival reported", reports, 0);
}
{
  // The player moves while it goes to look: the interest is dropped, and a
  // later chance arrival on the same tile does not bring it back.
  const player = { x: 20, y: 20 };
  let s: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    idleTicks: 999,
  };
  s = stepMovement({ anchor: playerAnchor(player), state: s, isWalkable: openMap, random: fixedRandom(0), config: cfg(), pickInterest: () => ({ x: 22, y: 22 }) }).state;
  const moved = stepMovement({ anchor: playerAnchor({ x: 21, y: 20 }), state: s, isWalkable: openMap, random: fixedRandom(0), config: cfg() });
  check("the player moves: interest dropped", moved.state.wanderTargetIsInterest, false);
  check("and the target with it", moved.state.wanderTarget, "null");
}
{
  // In garden mode, an interest outside the zone is rejected even within the radius.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = { tile: { x: 12, y: 12 }, onArrival: "wander", tracksPlayer: false, zone: inGarden, wanderRadius: 5 };
  const d = stepMovement({
    anchor: gardenAnchor,
    state: { ...initialMovementState(), activity: "wander", tile: { x: 12, y: 13 }, lastAnchorTile: { x: 12, y: 12 } },
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
    pickInterest: () => ({ x: 16, y: 12 }),
  });
  check("interest outside the garden -> rejected", d.state.wanderTargetIsInterest, false);
  check("the fallback target stays in the garden", inGarden(d.state.wanderTarget!.x, d.state.wanderTarget!.y), true);
}

console.log("\n--- anti-jump lock (render acknowledgement) ---");
{
  const tile = { x: 5, y: 5 };
  check("moves on when the game has rendered the current position", hasGameCaughtUp(tile, { x: 5, y: 5 }), true);
  check("waits when the game has fallen behind", hasGameCaughtUp(tile, { x: 4, y: 5 }), false);
  check("waits even for a lag of a single tile", hasGameCaughtUp(tile, { x: 5, y: 4 }), false);
  check("does not hold back while nothing has been observed", hasGameCaughtUp(tile, null), true);
  check("does not hold back before spawning", hasGameCaughtUp(null, { x: 1, y: 1 }), true);
}
{
  // The scenario that caused the bug: the loop runs faster than rendering.
  // With the lock, the gap between the injected and the rendered position can
  // never exceed one tile, so the avatar layer never has to cut.
  const player = { x: 15, y: 5 };
  let state: MovementState = { ...initialMovementState(), tile: { x: 5, y: 5 }, lastAnchorTile: player };
  let observed: XY | null = null;
  let maxGap = 0;
  // Rendering only "consumes" one tick in three.
  for (let i = 0; i < 60; i++) {
    if (hasGameCaughtUp(state.tile, observed)) {
      const d = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config: cfg() });
      state = d.state;
    }
    if (i % 3 === 0 && state.tile) observed = { ...state.tile };
    if (state.tile && observed) maxGap = Math.max(maxGap, manhattan(state.tile, observed));
  }
  check("injected and rendered positions stay within 1 tile", maxGap, 1);
  check("the companion makes progress despite the lock", state.tile!.x > 5, true);
}

console.log("\n--- robustness ---");
{
  // The companion ends up on a tile that has become blocked: it must be able
  // to move off it without looping forever.
  const player = { x: 10, y: 10 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 5, y: 3 }, lastAnchorTile: player };
  const r = run(start, player, 30, wallMap);
  check("moves off a blocked tile without an illegal step", r.illegalSteps, 0);
}
{
  // The companion's position must never land on the player's.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 26, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 30, openMap, cfg({ followDistance: 0 }));
  const overlapped = r.path.some((p) => p && p.x === player.x && p.y === player.y);
  check("never walks onto the player's tile", overlapped, false);
}

console.log("\n--- garden mode (still anchor plus zone) ---");
{
  // Zone = a 6x6 square; the anchor is its centre and does not follow the player.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = {
    tile: { x: 12, y: 12 },
    onArrival: "wander",
    tracksPlayer: false,
    wanderRadius: 3,
  };
  let state: MovementState = { ...initialMovementState(), tile: { x: 12, y: 12 } };
  let escaped = false;
  let illegal = 0;
  for (let i = 0; i < 200; i++) {
    const prev = state.tile;
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: inGarden,
      random: Math.random,
      config: cfg({ wanderPauseTicks: 0, wanderPauseMaxTicks: 0 }),
    });
    state = d.state;
    if (d.tile && !inGarden(d.tile.x, d.tile.y)) escaped = true;
    if (!d.teleported && prev && d.tile && manhattan(prev, d.tile) > 1) illegal++;
  }
  check("never leaves the garden zone", escaped, false);
  check("no illegal step while wandering the garden", illegal, 0);
  // A still anchor: nobody to wait for, it wanders as soon as it has arrived.
  check("wanders without waiting for the player to go idle", state.activity, "wander");
}
{
  // The trap the anchor plus zone model must remove: the player walks away,
  // and catching up must NOT drag the companion out of its garden.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = { tile: { x: 12, y: 12 }, onArrival: "wander", tracksPlayer: false };
  let state: MovementState = { ...initialMovementState(), tile: { x: 12, y: 12 } };
  let escaped = false;
  for (let i = 0; i < 50; i++) {
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: inGarden,
      random: Math.random,
      config: cfg(),
    });
    state = d.state;
    if (d.tile && !inGarden(d.tile.x, d.tile.y)) escaped = true;
  }
  check("a distant player does not drag the companion out of the garden", escaped, false);
}

console.log("--- never a teleport after spawning ---");
{
  // The player goes to the far end of the map: the companion must WALK, never
  // pop up next to them.
  const player = { x: 38, y: 38 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 1, y: 1 }, lastAnchorTile: player };
  const r = run(start, player, 120, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("no jump, even over a very long distance", r.teleports, 0);
  check("no illegal step", r.illegalSteps, 0);
  check("it really did make progress on foot", r.state.tile!.x > 1 && r.state.tile!.y > 1, true);
}
{
  // Switching from garden mode to follow: the anchor jumps from one end to the
  // other, the companion does not.
  const state: MovementState = {
    ...initialMovementState(),
    tile: { x: 12, y: 12 },
    lastAnchorTile: { x: 12, y: 12 },
  };
  const far = { x: 35, y: 35 };
  const d = stepMovement({
    anchor: playerAnchor(far),
    state,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("mode switch: no jump", d.teleported, false);
  check("mode switch: a single step", manhattan(state.tile!, d.tile!), 1);
}
{
  // The trap that separating the zone from walkability must remove: switching
  // to garden mode while the companion is OUTSIDE. Without it, no tile around
  // it is allowed and it stays frozen forever.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = {
    tile: { x: 12, y: 12 },
    onArrival: "wander",
    tracksPlayer: false,
    zone: inGarden,
  };
  let state: MovementState = { ...initialMovementState(), tile: { x: 2, y: 2 }, lastAnchorTile: { x: 12, y: 12 } };
  let teleports = 0;
  for (let i = 0; i < 60; i++) {
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: openMap,
      random: fixedRandom(0),
      config: cfg(),
    });
    if (d.teleported) teleports++;
    state = d.state;
  }
  check("walks back into the garden from outside", inGarden(state.tile!.x, state.tile!.y), true);
  check("without a single jump", teleports, 0);
}

console.log("\n--- pathfinding: going around ---");
{
  // THE case that froze the companion: lined up on an axis (dy === 0) with a
  // wall ahead. The greedy step then had no vertical candidate to try.
  const wallAtX5: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);
  const step = findFirstStep({ x: 3, y: 5 }, (x, y) => x === 8 && y === 5, wallAtX5);
  check("lined up facing a wall: it still finds a step", step !== null, true);
  check("and that step goes around instead of into the wall", step && step.x === 5, false);
}
{
  // It must REACH the target, not just avoid the wall.
  const wallAtX5: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);
  let tile: XY = { x: 3, y: 5 };
  const target = { x: 8, y: 5 };
  for (let i = 0; i < 60; i++) {
    const step = findFirstStep(tile, (x, y) => x === target.x && y === target.y, wallAtX5);
    if (!step) break;
    if (manhattan(tile, step) !== 1) { check("every step is adjacent", false, true); break; }
    tile = step;
  }
  check("goes through the door and reaches the target", `${tile.x},${tile.y}`, "8,5");
}
{
  // A concave obstacle: the case where a go-around heuristic would fail.
  const pocket: IsWalkable = (x, y) => {
    if (!openMap(x, y)) return false;
    if (y === 8 && x >= 4 && x <= 10) return false;
    if (x === 4 && y >= 4 && y <= 8) return false;
    if (x === 10 && y >= 4 && y <= 8) return false;
    return true;
  };
  let tile: XY = { x: 7, y: 6 };
  const target = { x: 7, y: 20 };
  let stuck = false;
  for (let i = 0; i < 120; i++) {
    const step = findFirstStep(tile, (x, y) => x === target.x && y === target.y, pocket);
    if (!step) { stuck = true; break; }
    tile = step;
    if (tile.x === target.x && tile.y === target.y) break;
  }
  check("gets out of a U-shaped pocket", stuck, false);
  check("and arrives at the destination", `${tile.x},${tile.y}`, "7,20");
}

console.log("\n--- pathfinding: edge cases ---");
{
  const closed: IsWalkable = (x, y) => openMap(x, y) && x < 5;
  const step = findFirstStep({ x: 1, y: 1 }, (x, y) => x === 20 && y === 1, closed);
  check("a truly unreachable target -> null (it stays put)", step, "null");
}
{
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 4 && y === 4, openMap);
  check("already there -> null, no stray step", step, "null");
}
{
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 9 && y === 12, openMap);
  check("the returned step is always adjacent", step && manhattan({ x: 4, y: 4 }, step), 1);
}
{
  // Arriving on a tile that is not walkable must never be offered.
  const holeAt: IsWalkable = (x, y) => openMap(x, y) && !(x === 9 && y === 4);
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 9 && y === 4, holeAt);
  check("a non-walkable arrival -> rejected", step, "null");
}
{
  // Search budget: a huge map must not turn a single step into an endless sweep.
  const infinite: IsWalkable = () => true;
  const step = findFirstStep({ x: 0, y: 0 }, () => false, infinite, 500);
  check("the node budget holds, no infinite loop", step, "null");
}

console.log("\n--- moving on command ---");
{
  const target = { x: 12, y: 10 };
  const taskAnchor: Anchor = { tile: target, onArrival: "hold", tracksPlayer: false };
  const startedAt = (): MovementState => ({ ...initialMovementState(), tile: { x: 4, y: 10 } });

  const walk = (config: MovementConfig): MovementState => {
    let s = startedAt();
    for (let i = 0; i < 60; i++) {
      s = stepMovement({ anchor: taskAnchor, state: s, isWalkable: openMap, random: fixedRandom(0), config }).state;
      if (s.tile && manhattan(s.tile, target) === 0) break;
    }
    return s;
  };

  const done = walk(TASK_MOVEMENT_CONFIG);
  check("command: the target is reached exactly", done.tile && manhattan(done.tile, target), 0);

  // The bug that prompted this test: with the follow config, the companion
  // stopped at followDistance from the target. The caller expected an exact
  // arrival, so it waited out its whole timeout on every crop.
  const short = walk(cfg());
  check("follow config: stops short of the target", short.tile && manhattan(short.tile, target), 2);

  // Already there: no stray step, the caller moves on at once.
  const onSpot: MovementState = { ...initialMovementState(), tile: { ...target }, lastAnchorTile: { ...target } };
  const still = stepMovement({
    anchor: taskAnchor,
    state: onSpot,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: TASK_MOVEMENT_CONFIG,
  });
  check("already on the target: stays still", still.tile && manhattan(still.tile, target), 0);
}

console.log("\n--- finding buildings ---");
{
  // No building name is hardcoded: we search the keys the map exposes, where
  // both casing and separators vary.
  const names = ["Pet_Shop", "PetHutch", "SeedShop"];

  check("the pet shop is found", matchBuildingName(names, ["pet"], ["sell", "shop", "store"]), "Pet_Shop");
  // "pet" alone would also match the hutch: that is the whole point of the second group.
  check("the hutch is told apart from the shop", matchBuildingName(names, ["pet"], ["hutch"]), "PetHutch");
  check("separators are ignored", matchBuildingName(["pet shop"], ["petshop"], []), "pet shop");
  check("case is ignored", matchBuildingName(["PETSHOP"], ["pet"], ["shop"]), "PETSHOP");
  check("with no second group, nothing is required", matchBuildingName(names, ["seed"], []), "SeedShop");
  // Guessing would be worse than returning null: the caller knows what to do with an absence.
  check("nothing matches: nothing is made up", matchBuildingName(names, ["barn"], []), null);
  check("the second group can rule everything out", matchBuildingName(names, ["pet"], ["barn"]), null);
}

console.log("\n--- the grid as the companion sees it ---");
{
  // 4 x 3, two blocked tiles, one of them only conditionally.
  const map = buildCompanionMap({
    cols: 4,
    rows: 3,
    collisionTiles: [1],
    conditionalCollisionRegions: [{ condition: "shopClosed", tiles: [6] }],
    npcSpawns: { Reina: 9 },
    userSlotIdxAndDirtTileIdxToGlobalTileIdx: [[4, 5], [10, 11]],
    userSlotIdxAndBoardwalkTileIdxToGlobalTileIdx: [[8]],
    locations: { Pet_Shop: { activationTilesIdxs: [2, 3] } },
  });
  check("the grid gets built", map !== null, true);
  check("index -> xy", JSON.stringify(map?.toXY(6)), JSON.stringify({ x: 2, y: 1 }));
  check("xy -> index", map?.toIndex(2, 1), 6);
  check("a free tile can be crossed", map?.isWalkable(0, 0), true);
  check("a collision blocks", map?.isWalkable(1, 0), false);
  check("a conditional collision blocks too", map?.isWalkable(2, 1), false);
  check("nothing passes outside the grid", map?.isWalkable(4, 0), false);
  check("a local dirt tile becomes global", map?.gardenTileToGlobal(1, 1), 11);
  check("a missing dirt index returns null", map?.gardenTileToGlobal(1, 5), null);
  check("the number of dirt tiles in a plot", map?.dirtTileCount(0), 2);
  check("the plot counts both dirt and boardwalk", map?.gardenTilesForSlot(0).join(","), "4,5,8");
  check("an NPC's spawn point", map?.npcSpawnTile("Reina"), 9);
  check("a building is found by fragments", map?.findBuilding(["pet"], ["shop"]), "Pet_Shop");
  check("a map with no dimensions is not built", buildCompanionMap({ cols: 0, rows: 3 }), null);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
