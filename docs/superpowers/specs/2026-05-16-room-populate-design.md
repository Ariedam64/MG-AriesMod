# Room Populate — Design

**Date :** 2026-05-16
**Branche cible :** `private-features` exclusivement (jamais `main` / `public/main`)
**Status :** Design approuvé, en attente de plan d'implémentation

## Contexte

Magic Garden applique un bonus de vente quand la room est full (6/6 joueurs). Beaucoup de hosts jouent solo ou à 2-3 et ratent ce bonus. La feature **Room Populate** ajoute, dans le menu Room de la mod, un encart qui permet à l'host d'une room d'y connecter jusqu'à 5 "ghost bots" — des sessions WebSocket guest minimales qui maintiennent une présence sans jouer — pour atteindre 6/6 et débloquer le bonus.

Le serveur Magic Garden accepte des connexions guest sur `/version/<n>/api/rooms/<code>/connect` sans cookie ni token, uniquement avec un `playerId` random et un `anonymousUserStyle` JSON. C'est cette surface qu'on exploite.

## Décisions de design

| Décision | Choix | Raison |
|---|---|---|
| Approche WS | Approche A "lean" : pas de logique métier dans les bots | Minimal, isolé, facile à maintenir. Si insuffisant pour déclencher le bonus, on évoluera. |
| Modèle UI | Liste par bot avec X individuel + bouton "Fill room" | Permet de cibler un bot précis pour disconnect |
| Identité des bots | Pool seedé déterministe (Bot_1..Bot_5 avec couleur/avatar fixes) | Reconnaissable, débuggable, pas besoin de générateur |
| Lifecycle | Auto-reconnect 3× avec backoff, kick si plus host, no persistence reload | Robuste sans surprise au reload |
| Emplacement UI | Encart en haut du `leftPane` du menu Room existant | Contexte naturel (déjà la "vue room") |
| Gating non-host | Visible mais désactivé + message "Host only" | Découvrabilité de la feature |
| Branche | `private-features` exclusivement, isolation par fichiers absents sur main | Zero leak dans le bundle public |

## Architecture

### Modules

```
src/services/populate.ts             ← façade BotPoolService (entrypoint public)
src/services/populate/
  ├── bot.ts                         ← GhostBot : 1 instance = 1 WS + cycle de vie
  ├── personas.ts                    ← pool seedé Bot_1..Bot_5
  ├── connection.ts                  ← buildBotConnectUrl, parse gameVersion + roomCode
  └── hostWatcher.ts                 ← détection host vs ownId via atoms
src/store/atoms.ts                   ← +1 ligne : view hostPlayerId
src/ui/menus/room.ts                 ← +import populate + 1 ligne mountPopulateCard(leftPane)
```

Aucune modification du `webSocketBridge` ni du `core/state.ts` — les bots ouvrent leurs propres `new WebSocket(...)` sans toucher au pool de WS captées par la mod.

### Data flow

```
[User click "Fill"]
   → BotPoolService.fillToCapacity()
      → gate check (isHost, inRoom, version, !discord)
      → for missing 1..N: spawn GhostBot(persona_i) séquentiel +250ms
         → builds URL via connection.ts
         → opens WS → onmessage(Welcome) → status "connected"
         → on close inattendu → backoff retry (1s, 3s, 9s), max 3 tentatives
[HostWatcher subscription]
   → playerId atom change OR hostPlayerId atom change
   → if transition host → not host : BotPoolService.disconnectAll()
[User click X sur un bot]
   → bot.disconnect() (no retry, close code 1000)
[User click "Disconnect all"]
   → BotPoolService.disconnectAll() (no retry)
```

### État exposé (consommé par l'UI)

```ts
type BotStatus = "connecting" | "connected" | "retrying" | "disconnected";

type BotSnapshot = {
  id: string;                  // local uid pour la clé de liste
  persona: { name: string; color: string };
  status: BotStatus;
  retryAttempt?: number;       // 1..3 quand status === "retrying"
  error?: string;
};

type PoolSnapshot = {
  isHost: boolean;
  inRoom: boolean;
  isDiscord: boolean;
  currentPlayers: number;      // 0..6 (depuis numPlayers atom)
  capacity: 6;
  bots: BotSnapshot[];
};
```

## GhostBot — machine d'état

```
   spawn()
     │
     ▼
[connecting] ──ws.open──► [connected] ──disconnect()──► [disconnected] (final)
     │                        │
     │                        ws.close inattendu
     │                        ▼
     │ ws.error            [retrying]
     │                        │
     │              (backoff 1s, 3s, 9s)
     │                        │
     └─error──► [retrying]    ├── attempt N<3 ──► [connecting]
                              └── attempt 3 fail ─► [disconnected] (error="max retries")
```

**Détails clés :**
- **Identifiant** : `"p_" + 16 chars alphanum random`, stable pour cette instance (réutilisé sur reconnect).
- **Pas de logique métier** : on n'ack pas Welcome, on n'envoie pas de position. Juste ouvrir, écouter, garder vivant.
- **Keep-alive** : les ping/pong frames RFC 6455 sont gérées par le navigateur. Si le serveur attend un heartbeat applicatif, à investiguer phase 1.
- **`disconnect()` idempotent** : clear timer reconnect, close WS code 1000.

## URL & version — sources dynamiques

Trois sources distinctes (pas de parse de `quinoaWS.url`) :

| Donnée | Source | Pattern existant |
|---|---|---|
| Version | `gameVersion` exporté par `src/utils/gameVersion.ts` | utilisé par sprite, settings, mgAssets, playerAvatar |
| Room code | `location.pathname` → `/r/([^/]+)` | maintenu par soft-nav existante |
| Host | `location.host` | direct |

```ts
// src/services/populate/connection.ts
export function buildBotConnectUrl(persona: Persona, playerId: string): string | null {
  if (!gameVersion) return null;
  const roomMatch = location.pathname.match(/\/r\/([^/]+)/);
  if (!roomMatch) return null;
  const roomCode = roomMatch[1];

  const params = new URLSearchParams();
  params.set("surface", `"web"`);
  params.set("platform", `"desktop"`);
  params.set("playerId", `"${playerId}"`);
  params.set("version", `"${gameVersion}"`);
  params.set("anonymousUserStyle", JSON.stringify(personaToStyle(persona)));
  params.set("source", `"manualUrl"`);
  params.set("capabilities", `"fbo_mipmap_unsupported"`);

  return `wss://${location.host}/version/${gameVersion}/api/rooms/${encodeURIComponent(roomCode)}/connect?${params}`;
}
```

**Fail-fast :** si gameVersion null ou pas de match `/r/...`, `fillToCapacity` retourne une erreur et l'UI toast.

## HostWatcher

**Nouvel atom dérivé** dans `src/store/atoms.ts` :
```ts
export const hostPlayerId = makeView<any, string | null>("stateAtom", { path: "data.hostPlayerId" });
```

**Subscription réactive** (pas de polling) :
```ts
// src/services/populate/hostWatcher.ts
export function startHostWatcher(onLost: () => void): () => void {
  let lastIsHost = false;
  let myId: string | null = null;
  let hostId: string | null = null;

  const recompute = () => {
    const now = !!myId && !!hostId && myId === hostId;
    if (lastIsHost && !now) onLost();
    lastIsHost = now;
  };

  const unsubA = playerId.on((v) => { myId = v; recompute(); });
  const unsubB = hostPlayerId.on((v) => { hostId = v; recompute(); });

  void Promise.all([playerId.get(), hostPlayerId.get()]).then(([a, b]) => {
    myId = a; hostId = b; lastIsHost = !!a && !!b && a === b;
  });

  return () => { unsubA(); unsubB(); };
}
```

Pas de "host regagné" : si on regagne host plus tard, on ne re-spawn pas — user doit recliquer Fill.

## UI

**Emplacement** : encart inséré entre le header `count` et la liste de joueurs dans `leftPane` de `renderRoomMenu` (`src/ui/menus/room.ts`).

```
header (count "N players")
┌─ Populate ────────────────┐
│ Players: 1/6              │
│ [ Fill room (+5) ]        │
│                           │
│ Active bots (3):          │
│ • Sparrow_1  [X]          │
│ • Otter_2    [X]          │
│ • Lemon_3    [X]          │
│ [ Disconnect all ]        │
└───────────────────────────┘
[player card 1]
...
```

**Styling** : réutilise les constantes existantes (`TEAL`, `TEAL_DIM`, `TEAL_BORDER`, `CARD_BG`, `BORDER`). Pas de nouveaux tokens.

**États visuels :**

| État runtime | Rendu |
|---|---|
| Pas dans une room | Encart caché |
| Discord activity | Visible désactivé, message "Not available on Discord" |
| Pas host | Visible désactivé, badge "Host only" |
| Host, 6/6 joueurs | Bouton "Fill" remplacé par "Room full" disabled |
| Host, room non-pleine | Bouton "Fill room (+N)" enabled |
| Bot en connecting/retrying | Spinner + label "Connecting..." / "Retrying (2/3)..." |
| Bot en erreur finale | Ligne rouge subtile, X devient "Remove" |

**Réactivité** : `BotPoolService.onChange((s) => populateCard.update(s))` — patch in-place pas re-create. `unsubPopulate()` appelé quand le menu est démonté ; **les bots restent connectés** (fermer le menu UI ne déconnecte rien).

**Compteur "Players: N/6"** : lu depuis l'atom `numPlayers` existant.

## API publique

```ts
// src/services/populate.ts
export const BotPoolService = {
  fillToCapacity(): Promise<{ ok: true; spawned: number } | { ok: false; error: string }>,
  spawnOne(): Promise<{ ok: true; botId: string } | { ok: false; error: string }>,
  disconnect(botId: string): void,
  disconnectAll(): void,
  getSnapshot(): PoolSnapshot,
  onChange(cb: (s: PoolSnapshot) => void): () => void,
};

// Exposé UI uniquement
export function mountPopulateCard(leftPane: HTMLElement): () => void;
```

**Pas d'API sur `window.Gemini`** — feature interne. Si besoin futur, ajout explicite.

## Persistance

**Aucune.**
- Pas de `localStorage`, pas de `GM_*Value`, pas de key `gemini:populate.*`.
- Cohérent avec l'option "no persistence reload" choisie.
- Sur reload : pool vide, les WS précédentes sont coupées par le navigateur.

## Lifecycle global

- **Init lazy** : `startHostWatcher` lancé au premier `onChange` ou `fillToCapacity`. Aucun side-effect à l'import (règle core #3).
- **Cleanup** : tous les `setTimeout` (backoff) trackés et clearables via `disconnect()`.
- **Pas de shutdown global** : la mod n'a pas de tear-down, le watcher tourne tant que la page vit.

## Gating environnement

```ts
function gateState(): "ok" | "no-room" | "discord" | "no-host" | "no-version" {
  if (isDiscordSurface()) return "discord";
  if (!gameVersion) return "no-version";
  if (!/\/r\/[^/]+/.test(location.pathname)) return "no-room";
  return "ok";
}
```

Re-checké au moment du clic Fill (fail-fast).

## Branche privée — isolation

**Stratégie : fichiers absents sur `main` (Option 1).**

- Tout le code populate vit dans `src/services/populate.ts` + `src/services/populate/*` — fichiers qui n'existent que sur `private-features`.
- L'ajout `hostPlayerId` view dans `atoms.ts` : aussi private-only (1 ligne).
- Le diff dans `src/ui/menus/room.ts` est minimal : 1 import + 1 ligne `mountPopulateCard(leftPane)`. Sur main, ces 2 lignes n'existent pas.

**Pros** : zero leak dans le bundle public (même pas de string "populate"). **Cons** : merge friction sur `room.ts` à gérer manuellement à chaque sync main → private.

## Risques & inconnues — à valider en phase build

| Inconnue | Plan |
|---|---|
| Le serveur kick-t-il une WS silencieuse après le Welcome ? | Test phase 1 : 1 bot, observer 5 min. Si kick → reproduire heartbeat applicatif minimal observé chez le client officiel. |
| Le bonus full-room se déclenche-t-il vraiment avec des bots "ghost" ? | Test phase 2 : room remplie, vendre crops, vérifier multiplicateur appliqué. Si non → escalade vers Approche B (bots avec position). |
| Format `anonymousUserStyle` accepté | Copier exactement l'exemple WS du user. Si rejet → lire valeurs valides depuis `MGData`. |
| Rate-limit serveur sur nouvelles connexions | Spawn séquentiel +250 ms entre chaque bot. |
| `numPlayers` atom pas live | Belt-and-suspenders : recouper avec `statePlayers.length`. |

## Non-objectifs

- **Pas d'auto-spawn au load** : user doit cliquer Fill explicitement.
- **Pas de persistance reload** : décision actée.
- **Pas de bots qui jouent** : approche lean strict.
- **Pas d'API publique `window.Gemini`** : feature interne private.
- **Pas de support Discord activity** : feature désactivée sur `*.discordsays.com`.
- **Pas de re-spawn au "host regagné"** : user re-déclenche manuellement.
