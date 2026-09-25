// The native pet-team sync must link each mod team to the server team its
// create produced, or the next reconcile imports that server team as a second
// copy and the next reload creates yet another one.
//
// The server side is simulated from the game's own SavePetTeam reducer
// (v1284): the name is trimmed and cut to 16 grapheme clusters, and a created
// team is put at the FRONT of `petTeams`.
import { reconcilePetTeams, type PetTeam, type ServerPetTeam } from "../src/services/petTeamReconcile";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

const gameName = (name: string) => {
  const segs = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name.trim()));
  return segs.slice(0, 16).map(s => s.segment).join("");
};

let seq = 0;
/** One mod session: reconciles, sends the creates it asks for, applies the server echo. */
function session(teams: PetTeam[], server: ServerPetTeam[]) {
  const sent = new Map<string, string>();
  let creates = 0;
  const env = {
    sentName: (id: string) => sent.get(id),
    knownLocalId: () => undefined,
    newId: () => `imported${++seq}`,
  };
  const run = () => {
    const r = reconcilePetTeams(teams, server, env);
    teams = r.teams;
    for (const id of r.linkedLocalIds) sent.delete(id);
    return r;
  };
  const r1 = run();
  for (const local of r1.needsCreate) {
    const petIds = local.slots.filter((x): x is string => !!x);
    if (!petIds.length) continue;
    creates++;
    sent.set(local.id, local.name.trim());
    server.unshift({ id: `srv${++seq}`, name: gameName(local.name), members: petIds.map(petId => ({ petId })) });
  }
  run();          // the stateUserSlots echo
  sent.clear();   // pending create timed out
  run();
  return { teams, creates };
}

// 1. A name longer than the game keeps.
{
  const server: ServerPetTeam[] = [];
  let teams: PetTeam[] = [{ id: "a", name: "Crop Size Boosters", slots: ["p1", "p2", null], serverId: null }];
  const s1 = session(teams, server);
  teams = s1.teams;
  check("long name: one local team after the create", teams.length, 1);
  check("long name: linked to the server team", teams[0]?.serverId != null, true);
  const s2 = session(teams, server);
  check("long name: reload creates nothing more", s2.creates, 0);
  check("long name: still one server team after reload", server.length, 1);
}

// 2. A second team named like an existing one ("Team 3" again after a delete).
{
  const server: ServerPetTeam[] = [{ id: "S3", name: "Team 3", members: [{ petId: "x" }] }];
  let teams: PetTeam[] = [
    { id: "old", name: "Team 3", slots: ["x", null, null], serverId: "S3" },
    { id: "new", name: "Team 3", slots: ["y", null, null], serverId: null },
  ];
  const s1 = session(teams, server);
  teams = s1.teams;
  check("same name: two local teams, no import", teams.length, 2);
  check("same name: the new team got linked", teams.find(t => t.id === "new")?.serverId != null, true);
  const s2 = session(teams, server);
  check("same name: reload creates nothing more", s2.creates, 0);
  check("same name: two server teams after reload", server.length, 2);
}

// 3. A roster already damaged by the bug: the original local team never
//    linked, and its server team was imported beside it.
{
  const server: ServerPetTeam[] = [
    { id: "N", name: "Team 3", members: [{ petId: "y" }] },
    { id: "S3", name: "Team 3", members: [{ petId: "x" }] },
  ];
  const teams: PetTeam[] = [
    { id: "old", name: "Team 3", slots: ["x", null, null], serverId: "S3" },
    { id: "orig", name: "Team 3", slots: ["y", null, null], serverId: null },
    { id: "dup", name: "Team 3", slots: ["y", null, null], serverId: "N" },
  ];
  const s = session(teams, server);
  check("damaged roster: reload creates nothing", s.creates, 0);
  check("damaged roster: the copy is folded back", s.teams.length, 2);
  check("damaged roster: the original id keeps the link", s.teams.find(t => t.id === "orig")?.serverId, "N");
}

// 4. The ordinary case still works.
{
  const server: ServerPetTeam[] = [];
  const s = session([{ id: "a", name: "Hatchers", slots: ["p1", null, null], serverId: null }], server);
  check("plain name: linked", s.teams[0]?.serverId != null, true);
  check("plain name: one team", s.teams.length, 1);
}

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
