# Aries Mod Backend — Documentation API

Documentation destinée à l'intégration côté client. Tous les endpoints sont décrits avec leur méthode HTTP, les paramètres attendus, les réponses retournées et le comportement serveur.

**Base URL :** `http(s)://<host>:4000`

---

## Table des matières

1. [Authentification](#authentification)
2. [Collect State (Envoi de données)](#collect-state)
3. [Players (Joueurs)](#players)
4. [Friends (Amis)](#friends)
5. [Messages (Messages directs)](#messages)
6. [Groups (Groupes)](#groups)
7. [Events (Temps réel)](#events)
8. [Leaderboard (Classements)](#leaderboard)
9. [Privacy (Confidentialité)](#privacy)
10. [Codes d'erreur](#codes-derreur)
11. [Statut en ligne](#statut-en-ligne)
12. [Système de confidentialité](#système-de-confidentialité)

---

## Authentification

Toutes les routes protégées nécessitent un header `Authorization` contenant la clé API du joueur :

```
Authorization: Bearer <api_key>
```

La clé API est obtenue via le flux OAuth Discord. Le serveur extrait le token du header, le cherche dans la table `players.api_key` et identifie le joueur associé. Si le token est absent ou invalide, le serveur renvoie `401 Unauthorized`.

### Flux OAuth Discord

Le processus d'obtention de la clé API se fait en deux étapes :

---

### `GET /auth/discord/login`

Lance le flux OAuth Discord. Redirige le navigateur vers la page d'autorisation Discord.

**Auth requise :** Non

**Comportement serveur :**
- Construit l'URL d'autorisation Discord avec le `client_id`, le `redirect_uri` et le scope `identify`
- Redirige le navigateur vers Discord

**Utilisation côté client :**
Ouvrir cette URL dans un navigateur ou une popup. L'utilisateur autorise l'application sur Discord, puis est redirigé vers le callback.

---

### `GET /auth/discord/callback`

Callback OAuth Discord. Appelé automatiquement par Discord après autorisation.

**Auth requise :** Non

**Query params :**

| Param | Type   | Description                     |
|-------|--------|---------------------------------|
| code  | string | Code d'autorisation fourni par Discord |

**Comportement serveur :**
1. Échange le `code` contre un access token Discord
2. Récupère le profil Discord (id, username, avatar)
3. Crée ou met à jour le joueur dans la base de données
4. Génère une clé API aléatoire de 64 caractères hexadécimaux
5. Retourne une page HTML qui affiche la clé et tente de l'envoyer via `window.opener.postMessage`

**Utilisation côté client :**
Si ouvert en popup, écouter le message `postMessage` pour récupérer la clé API automatiquement. Sinon, l'utilisateur la copie manuellement depuis la page affichée.

---

## Collect State

### `POST /collect-state`

Envoie l'état du jeu au serveur. C'est l'endpoint principal appelé périodiquement par le mod pour synchroniser les données du joueur.

**Auth requise :** Optionnelle — le token Bearer est prioritaire. Si absent ou invalide, le serveur utilise le champ `playerId` du body comme identifiant de secours.

**Body (JSON) :**

```json
{
  "playerName": "string",
  "avatar": ["string", "string", "string", "string"],
  "coins": 12345,
  "room": {
    "id": "room_id",
    "isPrivate": false,
    "playersCount": 5,
    "userSlots": [
      {
        "playerId": "player_id",
        "name": "Nom",
        "avatarUrl": "https://...",
        "coins": 100
      }
    ]
  },
  "state": {
    "garden": { },
    "inventory": { },
    "stats": {
      "player": { "numEggsHatched": 10 }
    },
    "activityLog": { },
    "journal": { }
  },
  "modVersion": "1.0.0"
}
```

Tous les champs sont optionnels (sauf le token d'auth). Le serveur met à jour uniquement les champs fournis.

**Réponse :** `204 No Content`

**Comportement serveur :**
- Met à jour la table `players` (nom, avatar, coins, `last_event_at`, `mod_version`)
- Met à jour `player_state` (garden, inventory, stats, activity_log, journal) en upsert
- Met à jour `rooms` et `room_players` (gestion des salles, `is_private` est déterminé par `room.isPrivate` ou le setting `hideRoomFromPublicList` lu depuis la base)
- Met à jour `leaderboard_stats` (coins + eggs_hatched extraits de `stats.player.numEggsHatched`)
- Les joueurs dont l'ID commence par `p_` dans les `userSlots` sont ignorés
- **Note :** Les privacy settings ne sont plus gérés ici, utiliser `POST /privacy` à la place

---

## Players

### `GET /get-player-view`

Récupère le profil et l'état d'un joueur unique.

**Auth requise :** Non

**Query params :**

| Param    | Type   | Requis | Description                                                                 |
|----------|--------|--------|-----------------------------------------------------------------------------|
| playerId | string | Oui    | ID du joueur                                                                |
| sections | string | Non    | Sections à inclure, séparées par des virgules. Valeurs possibles : `profile`, `garden`, `inventory`, `stats`, `activityLog`, `journal`, `room`, `leaderboard` |

**Réponse (200) :**

```json
{
  "playerId": "123",
  "playerName": "Nom",
  "avatarUrl": "https://...",
  "avatar": ["...", "...", "...", "..."],
  "coins": 12345,
  "hasModInstalled": true,
  "modVersion": "1.0.0",
  "badges": ["mod_creator"],
  "isOnline": true,
  "lastEventAt": "2025-01-01T00:00:00Z",
  "room": {
    "id": "room_id",
    "is_private": false,
    "players_count": 5,
    "last_updated_at": "2025-01-01T00:00:00Z",
    "last_updated_by_player_id": "player_id",
    "user_slots": [...]
  },
  "privacy": {
    "showGarden": true,
    "showInventory": true,
    "showCoins": true,
    "showActivityLog": true,
    "showJournal": true,
    "showStats": true,
    "hideRoomFromPublicList": false
  },
  "leaderboard": {
    "coins": {
      "rank": 5,
      "total": 12350,
      "rankChange": 3
    },
    "eggsHatched": {
      "rank": 12,
      "total": 87,
      "rankChange": -1
    }
  },
  "state": {
    "garden": { },
    "inventory": { },
    "stats": { },
    "activityLog": [ ],
    "journal": [ ]
  }
}
```

**Comportement serveur :**
- Respecte les paramètres de confidentialité du joueur (les sections masquées retournent `null`)
- Le statut en ligne est calculé sur un seuil de 6 minutes depuis `last_event_at`
- La room n'est incluse que si elle n'est pas privée et que le joueur n'a pas activé `hideRoomFromPublicList`
- `badges` : tableau de badges attribués au joueur. Valeurs possibles : `"mod_creator"`, `"supporter"`. Tableau vide `[]` si aucun badge.
- `coins` est `null` si `privacy.showCoins = false`
- Les données d'état (garden, inventory, stats, activityLog, journal) sont toujours imbriquées dans l'objet `state`, et sont `null` si la section privacy correspondante est désactivée
- Le leaderboard contient :
  - `rank` : Position actuelle dans le classement
  - `total` : Valeur de la catégorie (coins ou eggs hatched)
  - `rankChange` : Nombre de places gagnées (+) ou perdues (-) depuis le dernier snapshot journalier. `null` si pas de snapshot.
  - `coins` est `null` si `privacy.showCoins = false`, `eggsHatched` est `null` si `privacy.showStats = false`

---

### `POST /get-players-view`

Récupère les profils de plusieurs joueurs en une seule requête.

**Auth requise :** Non

**Body (JSON) :**

```json
{
  "playerIds": ["id1", "id2", "id3"],
  "sections": "profile,garden"
}
```

| Champ     | Type             | Requis | Description                       |
|-----------|------------------|--------|-----------------------------------|
| playerIds | string[]         | Oui    | Liste d'IDs (max 50)              |
| sections  | string/string[]  | Non    | Sections à inclure                |

**Réponse (200) :** Tableau de profils joueurs (même format que `get-player-view`), ordonnés dans le même ordre que les IDs fournis.

**Comportement serveur :**
- Maximum 50 joueurs par requête
- La confidentialité est appliquée individuellement pour chaque joueur

---

### `GET /list-mod-players`

Liste les joueurs qui ont le mod installé.

**Auth requise :** Non

**Query params :**

| Param  | Type   | Requis | Description                               |
|--------|--------|--------|-------------------------------------------|
| query  | string | Non    | Recherche par nom ou ID (insensible à la casse) |
| limit  | number | Non    | Nombre de résultats (défaut: 50, max: 200) |
| offset | number | Non    | Décalage pour la pagination (défaut: 0)    |

**Réponse (200) :**

```json
[
  {
    "playerId": "123",
    "playerName": "Nom",
    "avatarUrl": "https://...",
    "avatar": ["...", "...", "...", "..."],
    "badges": ["supporter"],
    "lastEventAt": "2025-01-01T00:00:00Z",
    "isOnline": true
  }
]
```

**Comportement serveur :**
- Filtre : `has_mod_installed = true`
- Recherche par `ILIKE` sur le nom ou l'ID
- Trié par `last_event_at` décroissant (les plus récemment actifs en premier)
- `isOnline` est calculé avec un seuil de 6 minutes depuis `last_event_at`

---

## Friends

Toutes les routes friends nécessitent l'authentification.

### `POST /friend-request`

Envoie une demande d'ami.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "toPlayerId": "target_player_id"
}
```

**Réponse :** `204 No Content`

**Comportement serveur :**
- Vérifie que les deux joueurs existent
- Vérifie qu'il n'y a pas déjà une relation (amis, en attente)
- Nettoie les anciennes relations rejetées si elles existent
- Crée une entrée `player_relationships` avec status `pending`
- Les IDs sont ordonnés (le plus petit = `user_one_id`)
- Émet un événement `friend_request` aux deux joueurs (via SSE/polling)

**Erreurs possibles :**
- `404` : Joueur cible introuvable
- `409` : Déjà amis, demande déjà en attente, ou impossible de s'envoyer une demande à soi-même

---

### `GET /list-friend-requests`

Récupère les demandes d'ami en attente.

**Auth requise :** Oui

**Réponse (200) :**

```json
{
  "playerId": "my_id",
  "incoming": [
    {
      "fromPlayerId": "other_id",
      "otherPlayerId": "other_id",
      "playerName": "Nom du joueur",
      "avatarUrl": "https://...",
      "badges": ["mod_creator"],
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "outgoing": [
    {
      "toPlayerId": "other_id",
      "otherPlayerId": "other_id",
      "playerName": "Nom du joueur",
      "avatarUrl": "https://...",
      "badges": [],
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### `GET /list-friends`

Récupère la liste des amis acceptés.

**Auth requise :** Oui

**Réponse (200) :**

```json
{
  "playerId": "my_id",
  "friends": [
    {
      "playerId": "friend_id",
      "name": "Nom",
      "avatarUrl": "https://...",
      "avatar": ["...", "...", "...", "..."],
      "badges": ["supporter"],
      "lastEventAt": "2025-01-01T00:00:00Z",
      "roomId": "room_id_or_null",
      "isOnline": true
    }
  ]
}
```

**Comportement serveur :**
- Inclut le statut en ligne (seuil de 6 min)
- `roomId` est `null` si la room est privée ou si l'ami a activé `hideRoomFromPublicList`
- `badges` : tableau des badges du joueur (`"mod_creator"`, `"supporter"`), ou `[]` si aucun

---

### `POST /friend-respond`

Accepte ou refuse une demande d'ami.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "otherPlayerId": "requester_id",
  "action": "accept"
}
```

| Champ         | Type   | Description                       |
|---------------|--------|-----------------------------------|
| otherPlayerId | string | ID du joueur qui a fait la demande |
| action        | string | `"accept"` ou `"reject"`          |

**Réponse :** `204 No Content`

**Comportement serveur :**
- Seul le destinataire de la demande peut répondre (pas l'émetteur)
- Si rejeté, la relation est supprimée de la base
- Émet un événement `friend_response`

**Erreurs possibles :**
- `400` : Action invalide
- `403` : Pas autorisé à répondre (c'est vous qui avez fait la demande)
- `404` : Demande introuvable

---

### `POST /friend-cancel`

Annule une demande d'ami sortante.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "otherPlayerId": "target_id"
}
```

**Réponse :** `204 No Content`

**Comportement serveur :**
- Seul l'émetteur de la demande peut annuler
- Supprime la relation de la base
- Émet un événement `friend_cancelled`

---

### `POST /friend-remove`

Supprime un ami.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "otherPlayerId": "friend_id"
}
```

**Réponse :** `204 No Content`

**Comportement serveur :**
- La relation doit être en status `accepted`
- Supprime la relation de la base
- Émet un événement `friend_removed`

---

## Messages

Messages directs entre joueurs amis.

### `POST /messages/send`

Envoie un message direct.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "toPlayerId": "recipient_id",
  "text": "Contenu du message"
}
```

| Champ      | Type   | Description                              |
|------------|--------|------------------------------------------|
| toPlayerId | string | ID du destinataire                        |
| text       | string | Contenu du message (max 1000 caractères)  |

**Réponse (201) :**

```json
{
  "id": 1,
  "conversationId": "id1:id2",
  "senderId": "sender_id",
  "recipientId": "recipient_id",
  "body": "Contenu du message",
  "createdAt": "2025-01-01T00:00:00Z",
  "deliveredAt": "2025-01-01T00:00:00Z",
  "readAt": null
}
```

**Comportement serveur :**
- Vérifie que les joueurs sont amis
- Le `conversationId` est formaté comme `"id_petit:id_grand"` (IDs triés)
- Émet un événement `message` aux deux joueurs
- Rate limit : 30 messages/min par joueur

**Erreurs possibles :**
- `400` : Texte vide ou trop long
- `403` : Les joueurs ne sont pas amis

---

### `GET /messages/thread`

Récupère l'historique des messages avec un joueur (pagination).

**Auth requise :** Oui

**Query params :**

| Param         | Type   | Requis | Description                                    |
|---------------|--------|--------|------------------------------------------------|
| otherPlayerId | string | Oui    | ID de l'autre joueur                            |
| afterId       | number | Non    | Récupérer les messages après cet ID             |
| limit         | number | Non    | Nombre de messages (défaut: 50, max: 200)       |

**Réponse (200) :** Tableau de messages (même format que `send`), triés par ID croissant.

**Comportement serveur :**
- Vérifie que les joueurs sont amis et connectés
- Pagination basée sur l'ID du message

---

### `POST /messages/read`

Marque les messages comme lus.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "otherPlayerId": "sender_id",
  "upToId": 42
}
```

| Champ         | Type   | Description                                   |
|---------------|--------|-----------------------------------------------|
| otherPlayerId | string | ID de l'autre joueur                           |
| upToId        | number | Marquer comme lus tous les messages jusqu'à cet ID |

**Réponse (200) :**

```json
{
  "updated": 5
}
```

**Comportement serveur :**
- Met à jour le champ `read_at` sur les messages concernés
- Émet un événement `read` aux deux joueurs

---

### `GET /messages/poll`

Récupère les nouveaux messages depuis un timestamp donné (polling simple).

**Auth requise :** Non (utilise `playerId` en query param)

**Query params :**

| Param    | Type   | Requis | Description                      |
|----------|--------|--------|----------------------------------|
| playerId | string | Oui    | ID du joueur                     |
| since    | string | Oui    | Timestamp ISO (ex: `2025-01-01T00:00:00Z`) |

**Réponse (200) :** Tableau de messages reçus depuis le timestamp (max 100).

**Comportement serveur :**
- Rate limité par `playerId`
- Retourne les messages où le joueur est le destinataire et `created_at > since`

---

## Groups

Système de groupes de discussion avec hiérarchie de rôles et support public/privé.

**Rôles :** `owner` > `admin` > `member`
- **Owner** : Tous les droits (renommer, supprimer, ajouter/retirer des membres, changer les rôles)
- **Admin** : Peut renommer le groupe, ajouter/retirer des membres (sauf owner et autres admins), changer les rôles des membres inférieurs
- **Member** : Peut envoyer des messages et quitter le groupe

**Maximum :** 100 membres par groupe

### `POST /groups`

Crée un nouveau groupe.

**Auth requise :** Oui

**Body (JSON) :**

```json
{
  "name": "Mon groupe",
  "isPublic": false
}
```

| Champ    | Type    | Requis | Description                                    |
|----------|---------|--------|------------------------------------------------|
| name     | string  | Oui    | Nom du groupe (max 40 caractères)              |
| isPublic | boolean | Non    | Groupe public (défaut: `false`)                |

**Réponse (201) :**

```json
{
  "id": 1,
  "name": "Mon groupe",
  "ownerId": "creator_id",
  "isPublic": false,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

**Comportement serveur :**
- Le créateur devient automatiquement propriétaire (`role: owner`)
- Le créateur est ajouté comme membre du groupe

---

### `GET /groups`

Liste les groupes du joueur authentifié.

**Auth requise :** Oui

**Réponse (200) :**

```json
{
  "playerId": "my_id",
  "groups": [
    {
      "id": 1,
      "name": "Mon groupe",
      "ownerId": "owner_id",
      "isPublic": false,
      "role": "owner",
      "createdAt": "...",
      "updatedAt": "...",
      "memberCount": 5,
      "previewMembers": [
        { "playerId": "...", "playerName": "...", "discordAvatarUrl": "...", "avatar": [...], "badges": [] }
      ],
      "unreadCount": 3
    }
  ]
}
```

**Comportement serveur :**
- `previewMembers` contient un aperçu de 3 membres maximum, chaque membre inclut `badges`
- `unreadCount` est calculé à partir de `last_read_message_id` du membre
- Trié par `updated_at` décroissant

---

### `GET /groups/public`

Liste les groupes publics que le joueur n'a pas encore rejoints.

**Auth requise :** Oui

**Query params :**

| Param  | Type   | Requis | Description                                    |
|--------|--------|--------|------------------------------------------------|
| search | string | Non    | Recherche par nom (insensible à la casse)       |
| limit  | number | Non    | Nombre de résultats (1-50, défaut: 20)          |
| offset | number | Non    | Décalage pour la pagination (défaut: 0)         |

**Réponse (200) :**

```json
{
  "groups": [
    {
      "id": 1,
      "name": "Groupe public",
      "ownerId": "owner_id",
      "memberCount": 12,
      "previewMembers": [
        { "playerId": "...", "playerName": "...", "discordAvatarUrl": "...", "avatar": [...], "badges": [] }
      ],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

**Comportement serveur :**
- Retourne uniquement les groupes publics (`is_public = true`)
- Exclut les groupes dont le joueur est déjà membre
- `previewMembers` contient un aperçu de 3 membres maximum, chaque membre inclut `badges`
- Trié par `updated_at` décroissant (les plus actifs en premier)
- Le paramètre `search` filtre par nom avec `ILIKE`

---

### `GET /groups/:groupId`

Détails d'un groupe spécifique.

**Auth requise :** Oui

**Permissions :**
- **Groupes publics** : Accessible par tous (membres et non-membres)
- **Groupes privés** : Accessible uniquement par les membres

**Réponse (200) :**

```json
{
  "group": {
    "id": 1,
    "name": "Mon groupe",
    "ownerId": "owner_id",
    "isPublic": false,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "members": [
    {
      "playerId": "...",
      "name": "...",
      "avatarUrl": "...",
      "avatar": [...],
      "badges": ["mod_creator"],
      "role": "owner",
      "joinedAt": "...",
      "lastEventAt": "...",
      "roomId": "room_id_or_null",
      "isOnline": true
    }
  ],
  "isMember": true,
  "role": "member"
}
```

**Comportement serveur :**
- Les groupes publics peuvent être consultés par n'importe qui (pour faciliter la décision de rejoindre)
- Les groupes privés nécessitent d'être membre
- `isMember` indique si le joueur authentifié est membre du groupe
- `role` contient le rôle du joueur s'il est membre, sinon `null`
- Pour chaque membre, le statut `isOnline` est calculé (seuil de 6 minutes)
- `roomId` est `null` si la room est privée ou si le membre a activé `hideRoomFromPublicList`

**Erreurs possibles :**
- `403` : Groupe privé et non-membre
- `404` : Groupe introuvable

---

### `PATCH /groups/:groupId`

Met à jour un groupe (nom et/ou visibilité).

**Auth requise :** Oui (owner ou admin)

**Body (JSON) :**

Au moins un des champs suivants doit être fourni :

```json
{
  "name": "Nouveau nom",       // Optionnel : nouveau nom du groupe (max 40 caractères)
  "isPublic": false            // Optionnel : true = public, false = privé
}
```

**Exemples :**

```json
// Renommer uniquement
{ "name": "Mon Super Groupe" }

// Changer la visibilité uniquement
{ "isPublic": false }

// Renommer et changer la visibilité
{ "name": "Groupe Secret", "isPublic": false }
```

**Réponse (200) :**

```json
{
  "groupId": 1,
  "name": "Nouveau nom",       // Présent si modifié
  "isPublic": false,           // Présent si modifié
  "updatedAt": "..."
}
```

---

### `DELETE /groups/:groupId`

Supprime un groupe.

**Auth requise :** Oui (owner uniquement)

**Réponse :** `204 No Content`

**Comportement serveur :**
- Supprime le groupe, ses membres et ses messages
- Émet un événement `group_deleted` à tous les membres

---

### `POST /groups/:groupId/members`

Ajoute un membre au groupe (invitation).

**Auth requise :** Oui (owner ou admin)

**Body (JSON) :**

```json
{
  "memberId": "player_id_to_add"
}
```

**Réponse :** `204 No Content`

**Comportement serveur :**
- **Groupe privé** : le nouveau membre doit être ami avec l'inviteur
- **Groupe public** : pas de vérification d'amitié
- Maximum 100 membres par groupe
- Le nouveau membre reçoit le rôle `member`
- Émet un événement `group_member_added` avec les infos du membre

**Erreurs possibles :**
- `403` : Pas owner/admin, ou joueur pas ami (groupe privé)
- `409` : Déjà membre ou groupe plein

---

### `DELETE /groups/:groupId/members/:memberId`

Retire un membre du groupe.

**Auth requise :** Oui (owner ou admin)

**Réponse :** `204 No Content`

**Comportement serveur :**
- L'owner ne peut pas être retiré
- Un admin ne peut retirer que des membres de rang inférieur (pas d'autres admins ni l'owner)
- Émet un événement `group_member_removed` avec les infos du membre

---

### `POST /groups/:groupId/leave`

Quitter un groupe.

**Auth requise :** Oui

**Réponse :** `204 No Content`

**Comportement serveur :**
- L'owner ne peut pas quitter (il doit supprimer le groupe)
- Émet un événement `group_member_removed` avec les infos du membre

---

### `POST /groups/:groupId/join`

Rejoindre un groupe public.

**Auth requise :** Oui

**Réponse :** `204 No Content`

**Comportement serveur :**
- Le groupe doit être public (`isPublic: true`)
- Le joueur ne doit pas déjà être membre
- Maximum 100 membres
- Le joueur rejoint avec le rôle `member`
- Émet un événement `group_member_added` avec les infos du membre

**Erreurs possibles :**
- `403` : Le groupe n'est pas public
- `409` : Déjà membre ou groupe plein

---

### `PATCH /groups/:groupId/members/:memberId/role`

Change le rôle d'un membre.

**Auth requise :** Oui (owner ou admin)

**Body (JSON) :**

```json
{
  "role": "admin"
}
```

| Champ | Type   | Description                          |
|-------|--------|--------------------------------------|
| role  | string | Nouveau rôle : `"admin"` ou `"member"` |

**Réponse (200) :**

```json
{
  "memberId": "player_id",
  "oldRole": "member",
  "newRole": "admin"
}
```

**Comportement serveur :**
- L'owner peut changer le rôle de n'importe qui (sauf lui-même)
- Un admin peut promouvoir/rétrograder des membres de rang inférieur uniquement
- On ne peut pas changer son propre rôle
- Émet un événement `group_role_changed` avec les infos du membre + ancien/nouveau rôle

**Erreurs possibles :**
- `400` : Rôle invalide, ou tentative de changer son propre rôle
- `403` : Pas les permissions, ou cible de rang supérieur/égal
- `409` : Le membre a déjà ce rôle

---

### `POST /groups/:groupId/messages`

Envoie un message dans un groupe.

**Auth requise :** Oui (doit être membre)

**Body (JSON) :**

```json
{
  "text": "Contenu du message"
}
```

| Champ | Type   | Description                             |
|-------|--------|-----------------------------------------|
| text  | string | Contenu du message (max 1000 caractères) |

**Réponse (201) :**

```json
{
  "groupId": 1,
  "message": {
    "id": 42,
    "senderId": "sender_id",
    "body": "Contenu du message",
    "createdAt": "..."
  }
}
```

**Comportement serveur :**
- Seuls les membres peuvent envoyer des messages
- Le serveur garde uniquement les 500 messages les plus récents par groupe (les anciens sont supprimés)
- Émet un événement `group_message` aux autres membres

---

### `GET /groups/:groupId/messages`

Récupère l'historique des messages du groupe.

**Auth requise :** Oui (doit être membre)

**Query params :**

| Param    | Type   | Requis | Description                              |
|----------|--------|--------|------------------------------------------|
| afterId  | number | Non    | Messages après cet ID                     |
| beforeId | number | Non    | Messages avant cet ID                     |
| limit    | number | Non    | Nombre de messages (1-100, défaut: 50)    |

**Réponse (200) :** Tableau de messages du groupe.

---

### `POST /groups/:groupId/messages/read`

Marque les messages du groupe comme lus.

**Auth requise :** Oui (doit être membre)

**Body (JSON) :**

```json
{
  "messageId": 42
}
```

**Réponse :** `204 No Content`

**Comportement serveur :**
- Met à jour le `last_read_message_id` du membre dans le groupe

---

## Events

Système de temps réel pour recevoir les événements (demandes d'ami, messages, etc.).

Deux méthodes sont disponibles : **SSE (Server-Sent Events)** et **Long Polling**.

### `GET /events/stream`

Connexion SSE (Server-Sent Events) pour le temps réel.

**Auth requise :** Oui

**Headers requis :**
```
Authorization: Bearer <api_key>
Accept: text/event-stream
```

**Comportement serveur :**
1. Vérifie que le joueur est connecté (`last_event_at` dans les 6 dernières minutes)
2. Envoie immédiatement deux événements initiaux :
   - `connected` : `{ playerId, lastEventId, serverSessionId }`
   - `welcome` : État initial complet (voir ci-dessous)
3. Envoie un heartbeat (ping) toutes les 30 secondes
4. Streame les événements en temps réel

> **Note sur `serverSessionId` :** Généré une fois au démarrage du serveur. Si ce champ change entre deux connexions SSE, le client doit refaire une connexion propre pour resynchroniser son état.

**Format des événements SSE :**
```
id: <event_id>
event: <type>
data: <json>

```

**Événement `welcome` (état initial) :**

```json
{
  "myProfile": {
    "playerId": "my_id",
    "name": "Mon nom en jeu",
    "avatarUrl": "https://...",
    "avatar": ["...", "...", "...", "..."],
    "badges": ["mod_creator"],
    "privacy": {
      "showGarden": true,
      "showInventory": true,
      "showCoins": true,
      "showActivityLog": true,
      "showJournal": true,
      "showStats": true,
      "hideRoomFromPublicList": false
    }
  },
  "friends": [
    {
      "playerId": "friend_id",
      "name": "Nom",
      "avatarUrl": "https://...",
      "avatar": ["...", "...", "...", "..."],
      "badges": ["supporter"],
      "lastEventAt": "2025-01-01T00:00:00Z",
      "roomId": "room_id_or_null",
      "isOnline": true
    }
  ],
  "friendRequests": {
    "incoming": [
      {
        "fromPlayerId": "other_id",
        "otherPlayerId": "other_id",
        "playerName": "Nom",
        "avatarUrl": "https://...",
        "badges": [],
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "outgoing": [
      {
        "toPlayerId": "other_id",
        "otherPlayerId": "other_id",
        "playerName": "Nom",
        "avatarUrl": "https://...",
        "badges": [],
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ]
  },
  "groups": [ ],
  "publicGroups": [
    {
      "id": 2,
      "name": "Groupe public",
      "ownerId": "owner_id",
      "memberCount": 12,
      "previewMembers": [
        { "playerId": "...", "playerName": "...", "discordAvatarUrl": "...", "avatar": [...], "badges": [] }
      ],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "groupMembers": [
    {
      "playerId": "member_id",
      "name": "Nom du membre",
      "avatarUrl": "https://...",
      "avatar": ["...", "...", "...", "..."],
      "badges": ["mod_creator"],
      "lastEventAt": "2025-01-01T00:00:00Z",
      "roomId": "room_id_or_null",
      "isOnline": true,
      "groupIds": [1, 2]
    }
  ],
  "conversations": {
    "friends": [
      {
        "conversationId": "id1:id2",
        "otherPlayerId": "other_id",
        "otherPlayerName": "Nom",
        "otherPlayerAvatarUrl": "https://...",
        "messages": [
          { "id": 1, "senderId": "...", "recipientId": "...", "body": "...", "createdAt": "...", "readAt": null }
        ],
        "unreadCount": 3
      }
    ],
    "groups": [
      {
        "groupId": 1,
        "groupName": "Mon groupe",
        "messages": [
          { "id": 42, "senderId": "...", "senderName": "Nom", "senderAvatarUrl": "https://...", "body": "...", "createdAt": "...", "readAt": "..." }
        ],
        "unreadCount": 5
      }
    ]
  },
  "modPlayers": [
    {
      "playerId": "123",
      "playerName": "Nom",
      "avatarUrl": "https://...",
      "avatar": ["...", "...", "...", "..."],
      "badges": ["mod_creator"],
      "lastEventAt": "2025-01-01T00:00:00Z",
      "isOnline": true
    }
  ],
  "publicRooms": [
    {
      "id": "room_id",
      "playersCount": 5,
      "userSlots": [
        { "playerId": "...", "name": "...", "avatarUrl": "...", "coins": 100 }
      ],
      "lastUpdatedAt": "2025-01-01T00:00:00Z"
    }
  ],
  "leaderboard": {
    "coins": {
      "top": [
        {
          "playerId": "player_123",
          "playerName": "TopPlayer1",
          "avatarUrl": "https://cdn.discordapp.com/avatars/...",
          "avatar": ["body1", "eyes2", "mouth3", "accessory1"],
          "badges": ["mod_creator"],
          "rank": 1,
          "total": 50000,
          "rankChange": 0
        },
        {
          "playerId": "player_456",
          "playerName": "TopPlayer2",
          "avatarUrl": "https://...",
          "avatar": ["...", "...", "...", "..."],
          "badges": [],
          "rank": 2,
          "total": 45000,
          "rankChange": 3
        }
        // ... jusqu'à 15 joueurs
      ],
      "myRank": {
        "playerId": "my_id",
        "playerName": "Mon nom",
        "avatarUrl": "https://...",
        "avatar": ["...", "...", "...", "..."],
        "badges": ["supporter"],
        "rank": 42,
        "total": 12350,
        "rankChange": -2
      }
    },
    "eggsHatched": {
      "top": [
        {
          "playerId": "player_789",
          "playerName": "EggMaster",
          "avatarUrl": "https://...",
          "avatar": ["...", "...", "...", "..."],
          "badges": [],
          "rank": 1,
          "total": 235,
          "rankChange": 1
        }
        // ... jusqu'à 15 joueurs
      ],
      "myRank": {
        "playerId": "my_id",
        "playerName": "Mon nom",
        "avatarUrl": "https://...",
        "avatar": ["...", "...", "...", "..."],
        "badges": [],
        "rank": 18,
        "total": 87,
        "rankChange": null
      }
    }
  }
}
```

**Note sur `groupMembers` :** Cette section contient tous les membres de tous vos groupes (sauf vous-même), avec leur statut en ligne, dernière activité, room actuelle et la liste des IDs de groupes que vous avez en commun. Un membre peut apparaître dans plusieurs groupes, son champ `groupIds` indique lesquels.

**Note sur `modPlayers` :** Cette section contient tous les joueurs qui ont le mod installé (`has_mod_installed = true`), limité aux 100 plus récemment actifs. Le champ `isOnline` est calculé avec un seuil de 6 minutes depuis `last_event_at`. Le champ `badges` contient les badges du joueur (`"mod_creator"`, `"supporter"`) ou un tableau vide `[]`.

**Note sur `leaderboard` :** Cette section contient les classements pour chaque catégorie (coins, eggsHatched). Pour chaque catégorie :
- `top` : Les 15 premiers joueurs, triés par ordre décroissant. Le champ `total` correspond au nombre de coins (catégorie coins) ou au nombre d'eggs hatched (catégorie eggsHatched).
- `myRank` : Votre position dans le classement. Peut être `null` si vous n'avez pas de stats dans cette catégorie.
- `rankChange` : Nombre de places gagnées (+) ou perdues (-) depuis le dernier snapshot. `null` si pas encore de snapshot. Exemple : `+3` = gagné 3 places, `-2` = perdu 2 places.
- Les joueurs avec `show_coins: false` (pour coins) ou `show_stats: false` (pour eggsHatched) apparaissent anonymisés : `playerId: "null"`, `playerName: "anonymous"`, `avatarUrl: null`, `avatar: null`, `badges: []`.
- Le snapshot des rangs est mis à jour automatiquement **toutes les 10 minutes** pour tous les joueurs (via cron job). Cela garantit que les joueurs inactifs ont aussi un `rankChange` cohérent.

**Note sur `readAt` (messages de groupe) :** Pour les messages de groupe, `readAt` fonctionne comme WhatsApp/Telegram :
- **Messages reçus** (des autres) : `readAt` indique si **vous** avez lu le message. Basé sur votre `last_read_message_id`. Si `message.id <= votre_last_read_message_id`, alors `readAt` = `createdAt`, sinon `null`.
- **Messages envoyés** (les vôtres) : `readAt` indique si **au moins un autre membre** a lu le message. Si au moins un membre a `last_read_message_id >= message.id`, alors `readAt` = `createdAt`, sinon `null`.

---

### `GET /events/poll`

Alternative long-polling au SSE.

**Auth requise :** Oui

**Query params :**

| Param     | Type   | Requis | Description                                              |
|-----------|--------|--------|----------------------------------------------------------|
| since     | string | Oui    | Dernier event ID reçu (commencer avec `"0"`)              |
| timeoutMs | number | Non    | Timeout d'attente en ms (5000-30000, défaut: 25000)       |

**Réponse (200) :**

```json
{
  "playerId": "my_id",
  "lastEventId": 42,
  "serverSessionId": "1706000000000-0.123456789",
  "events": [
    {
      "id": 42,
      "type": "friend_request",
      "data": { },
      "ts": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

> **Note :** `lastEventId` est un **nombre entier** (pas une chaîne). `serverSessionId` est généré au démarrage du serveur (`${Date.now()}-${Math.random()}`). Si ce champ change entre deux polls, le client doit se reconnecter avec `since=0` pour recevoir les événements initiaux à nouveau.

**Comportement serveur :**
- Premier appel (`since=0`) : retourne immédiatement `connected` + `welcome` avec `id: 0` et le `lastEventId` courant
- Appels suivants : retourne les événements bufferisés depuis `sinceId` ; si le buffer est vide, attend jusqu'à `timeoutMs` qu'un nouvel événement arrive
- Si aucun événement dans le délai, retourne un tableau vide avec le `lastEventId` courant
- Le client doit rappeler en boucle avec le `lastEventId` reçu

**Utilisation côté client (pseudo-code) :**
```javascript
let lastEventId = "0";

async function poll() {
  const res = await fetch(`/events/poll?since=${lastEventId}&timeoutMs=25000`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await res.json();
  lastEventId = data.lastEventId;

  for (const event of data.events) {
    handleEvent(event.type, event.data);
  }

  // Rappeler immédiatement
  poll();
}
```

---

### Types d'événements

| Type               | Description                          | Données clés                                                      |
|--------------------|--------------------------------------|-------------------------------------------------------------------|
| `connected`        | Connexion établie                    | `playerId`, `lastEventId`, `serverSessionId`                      |
| `welcome`          | État initial complet                 | `friends`, `friendRequests`, `groups`, `groupMembers`, `conversations`, `modPlayers`, `leaderboard` |
| `friend_request`   | Nouvelle demande d'ami reçue         | `requesterId`, `requesterName`, `requesterAvatarUrl`, `requesterBadges`, `targetId`, `targetName`, `targetAvatarUrl`, `targetBadges`, `createdAt` |
| `friend_response`  | Réponse à une demande d'ami          | `requesterId`, `requesterName`, `requesterAvatarUrl`, `requesterBadges`, `responderId`, `responderName`, `responderAvatarUrl`, `responderBadges`, `action`, `updatedAt`, + si `action: "accept"` : `requesterRoomId`, `requesterIsOnline`, `responderRoomId`, `responderIsOnline` |
| `friend_cancelled` | Demande d'ami annulée                | `requesterId`, `targetId`, `cancelledAt`                          |
| `friend_removed`   | Ami supprimé                         | `removerId`, `removedId`, `removedAt`                             |
| `message`          | Nouveau message direct reçu          | `conversationId`, `senderId`, `recipientId`, `body`, `createdAt`  |
| `read`             | Messages marqués comme lus           | `conversationId`, `readerId`, `upToId`, `readAt`                  |
| `presence`         | Changement de statut en ligne d'un ami ou membre de groupe | `playerId`, `online`, `lastEventAt`, `roomId` (`null` si `hideRoomFromPublicList`) |
| `group_message`    | Nouveau message de groupe            | `groupId`, `message: { id, senderId, sender: { playerId, name, avatar, avatarUrl, badges }, body, createdAt }` |
| `group_read`       | Messages de groupe marqués comme lus | `groupId`, `readerId`, `reader: { playerId, name, avatar, avatarUrl, badges }`, `messageId`, `readAt` |
| `group_deleted`    | Groupe supprimé                      | `groupId`, `deletedBy`, `actor: { playerId, name, avatar, avatarUrl, badges }`, `deletedAt` |
| `group_updated`    | Groupe mis à jour (nom et/ou visibilité) | `groupId`, `name` (si modifié), `isPublic` (si modifié), `actor: { playerId, name, avatar, avatarUrl, badges }`, `updatedAt` |
| `group_member_added`   | Membre ajouté/a rejoint le groupe | `groupId`, `groupName`, `member: { playerId, name, avatar, avatarUrl, badges }`, `addedBy`, `createdAt`, `conversation` (seulement pour le nouveau membre) |
| `group_member_removed` | Membre retiré ou a quitté        | `groupId`, `member: { playerId, name, avatar, avatarUrl, badges }`, `removedBy`, `removedAt` |
| `group_role_changed`   | Rôle d'un membre modifié         | `groupId`, `member: { playerId, name, avatar, avatarUrl, badges }`, `oldRole`, `newRole`, `changedBy`, `changedAt` |
| `room_changed`         | Un ami ou membre de groupe a changé de room | `playerId`, `roomId`, `previousRoomId` (`null` si `hideRoomFromPublicList`) |
| `privacy_updated`      | Un ami ou membre de groupe a changé ses privacy settings | `playerId`, `privacy`                                         |

**Note sur `friend_response` :** Quand l'action est `"accept"`, l'événement contient des informations supplémentaires pour les deux joueurs :
- `requesterRoomId` : Room actuelle du demandeur (`null` si privée ou cachée)
- `requesterIsOnline` : Statut en ligne du demandeur (basé sur le seuil de 6 minutes)
- `responderRoomId` : Room actuelle du répondeur (`null` si privée ou cachée)
- `responderIsOnline` : Statut en ligne du répondeur (basé sur le seuil de 6 minutes)

Cela permet aux deux joueurs de voir immédiatement le statut et la room de leur nouvel ami sans avoir à refetch la liste d'amis.

**Note sur `group_member_added` :** Quand un nouveau membre est ajouté ou rejoint un groupe, il reçoit une version enrichie de l'événement contenant un champ `conversation` avec :
- `messages` : Les 50 derniers messages du groupe (avec `id`, `senderId`, `senderName`, `senderAvatarUrl`, `body`, `createdAt`, `readAt`)
- `unreadCount` : Nombre de messages non lus pour ce membre

Les membres existants du groupe reçoivent l'événement standard sans le champ `conversation`.

---

## Leaderboard

### `GET /leaderboard/coins`

Classement par nombre de pièces.

**Auth requise :** Non

**Query params :**

| Param      | Type   | Requis | Description                                        |
|------------|--------|--------|----------------------------------------------------|
| query      | string | Non    | Recherche par nom ou ID (insensible à la casse)     |
| limit      | number | Non    | Nombre de résultats (1-100, défaut: 50)             |
| offset     | number | Non    | Décalage pour pagination (défaut: 0)                |
| myPlayerId | string | Non    | ID du joueur pour inclure son rang dans la réponse (même s'il n'est pas dans les résultats) |

**Réponse (200) :**

```json
{
  "rows": [
    {
      "playerId": "123",
      "playerName": "Nom",
      "avatarUrl": "https://...",
      "avatar": [...],
      "badges": ["supporter"],
      "lastEventAt": "...",
      "rank": 1,
      "total": 50000,
      "rankChange": 3
    }
  ],
  "myRank": {
    "playerId": "456",
    "playerName": "Mon nom",
    "avatarUrl": "https://...",
    "avatar": [...],
    "badges": [],
    "lastEventAt": "...",
    "rank": 28,
    "total": 12000,
    "rankChange": -2
  }
}
```

**Comportement serveur :**
- `total` : Correspond à la valeur de la catégorie (coins pour `/coins`, eggs hatched pour `/eggs-hatched`)
- Trié par coins décroissant
- Si un joueur a masqué ses coins (`show_coins = false`), il apparaît comme `"anonymous"` et `badges: []`
- Le paramètre `query` filtre par nom ou ID avec `ILIKE`
- `rank` : Position actuelle dans le classement
- `rankChange` : Nombre de places gagnées (+) ou perdues (-) depuis le dernier snapshot journalier. `null` si pas encore de snapshot.
- **`myRank`** : Si le paramètre `myPlayerId` est fourni, le champ `myRank` contient les informations du joueur spécifié (rang, total, rankChange, etc.), même s'il n'apparaît pas dans `rows`. Permet d'afficher "Top 15 + mon rang" dans les interfaces. Retourne `null` si le joueur n'existe pas.

---

### `GET /leaderboard/coins/rank`

Rang d'un joueur dans le classement des pièces.

**Auth requise :** Non

**Query params :**

| Param    | Type   | Requis | Description   |
|----------|--------|--------|---------------|
| playerId | string | Oui    | ID du joueur  |

**Réponse (200) :**

```json
{
  "rank": 5,
  "total": 1000,
  "rankChange": 3,
  "row": {
    "playerId": "123",
    "playerName": "Nom",
    "avatarUrl": "https://...",
    "avatar": [...],
    "badges": ["mod_creator"],
    "lastEventAt": "...",
    "total": 50000
  }
}
```

**Comportement serveur :**
- `total` : Correspond à la valeur de la catégorie (coins pour `/coins/rank`, eggs hatched pour `/eggs-hatched/rank`)
- `rankChange` : Nombre de places gagnées (+) ou perdues (-) en 24h. `null` si pas de snapshot.
- Si le joueur a masqué ses données, `badges: []` et les champs identifiants sont anonymisés.

---

### `GET /leaderboard/eggs-hatched`

Classement par nombre d'œufs éclos.

**Auth requise :** Non

**Query params :** Identiques à `/leaderboard/coins` (incluant `myPlayerId`)

**Réponse (200) :** Même structure que `/leaderboard/coins`, trié par eggs hatched décroissant. Le champ `total` correspond au nombre d'œufs éclos. Inclut également `myRank` si `myPlayerId` est fourni.

**Comportement serveur :**
- Si un joueur a masqué ses stats (`show_stats = false`), il apparaît comme `"anonymous"`
- `rankChange` basé sur `eggs_rank_snapshot`
- **`myRank`** : Même fonctionnement que pour `/leaderboard/coins`

---

### `GET /leaderboard/eggs-hatched/rank`

Rang d'un joueur dans le classement des œufs.

**Auth requise :** Non

**Query params / Réponse :** Identiques à `/leaderboard/coins/rank`

---

## Privacy

Endpoints dédiés à la gestion des paramètres de confidentialité du joueur. Permet de lire et modifier les privacy settings sans passer par `/collect-state`.

### `GET /privacy`

Récupère les paramètres de confidentialité actuels du joueur.

**Auth requise :** Oui

**Réponse (200) :**

```json
{
  "showGarden": true,
  "showInventory": true,
  "showCoins": true,
  "showActivityLog": true,
  "showJournal": true,
  "showStats": true,
  "hideRoomFromPublicList": false
}
```

**Comportement serveur :**
- Tous les paramètres valent `true` par défaut (sauf `hideRoomFromPublicList` qui vaut `false`)
- Si le joueur n'a jamais configuré ses privacy settings, les valeurs par défaut sont retournées

---

### `POST /privacy`

Met à jour un ou plusieurs paramètres de confidentialité. Seuls les champs envoyés sont modifiés, les autres restent inchangés.

**Auth requise :** Oui

**Body (JSON) :**

Envoyer uniquement les paramètres à modifier. Tous les champs sont optionnels mais au moins un doit être présent.

```json
{
  "showGarden": false,
  "showCoins": false
}
```

**Paramètres acceptés :**

| Champ                  | Type    | Description                              |
|------------------------|---------|------------------------------------------|
| showGarden             | boolean | Visibilité du jardin                      |
| showInventory          | boolean | Visibilité de l'inventaire                |
| showCoins              | boolean | Visibilité des pièces + leaderboard       |
| showActivityLog        | boolean | Visibilité du journal d'activité          |
| showJournal            | boolean | Visibilité du journal                     |
| showStats              | boolean | Visibilité des stats + leaderboard eggs   |
| hideRoomFromPublicList | boolean | Cacher la room des listes publiques       |

**Réponse (200) :** L'état complet des privacy settings après mise à jour (même format que `GET /privacy`).

**Comportement serveur :**
- Upsert en base : crée l'entrée si elle n'existe pas, sinon met à jour uniquement les colonnes fournies
- Les valeurs non envoyées dans le body ne sont pas modifiées
- Retourne l'état complet après mise à jour pour que le client puisse synchroniser
- Émet un événement `privacy_updated` à tous les amis du joueur (via SSE/polling)

**Erreurs possibles :**
- `400` : Aucun paramètre valide fourni (retourne la liste des paramètres acceptés)

---

## Codes d'erreur

| Code | Signification                                                   |
|------|-----------------------------------------------------------------|
| 400  | Requête invalide (paramètres manquants ou mal formatés)          |
| 401  | Non authentifié (token manquant ou invalide)                     |
| 403  | Interdit (pas les permissions nécessaires)                       |
| 404  | Ressource introuvable                                           |
| 409  | Conflit (doublon, état invalide — ex: déjà amis)                 |
| 429  | Rate limit atteint (trop de requêtes)                            |
| 500  | Erreur serveur                                                  |

---

## Statut en ligne

Un joueur est considéré **en ligne** si son `last_event_at` date de moins de **6 minutes**.

Ce champ est mis à jour à chaque appel à `/collect-state`. Le mod doit donc appeler cet endpoint régulièrement (toutes les quelques minutes) pour maintenir le statut en ligne.

---

## Système de confidentialité

Chaque joueur peut configurer la visibilité de ses données via les endpoints `GET /privacy` et `POST /privacy` :

| Paramètre               | Effet                                                   |
|--------------------------|----------------------------------------------------------|
| `showGarden`             | Masque le jardin dans les vues joueur                     |
| `showInventory`          | Masque l'inventaire dans les vues joueur                  |
| `showCoins`              | Masque les pièces + anonymise dans le leaderboard coins   |
| `showActivityLog`        | Masque le journal d'activité                              |
| `showJournal`            | Masque le journal                                        |
| `showStats`              | Masque les stats + anonymise dans le leaderboard eggs     |
| `hideRoomFromPublicList` | Cache la room des listes publiques, des events `presence`/`room_changed` et de la liste d'amis |

---

## WebSocket

Un endpoint WebSocket est disponible pour les pings :

**URL :** `ws://<host>:4000/ws/ping`

**Protocole :**
- Envoyer `ping` → reçoit `pong`
- Tout autre message → reçoit un écho du message

> **Note :** Pour le temps réel (événements), utiliser SSE (`/events/stream`) ou long polling (`/events/poll`) plutôt que le WebSocket, qui ne sert qu'au ping.

---

## Health Check

### `GET /health`

Vérification que le serveur est en ligne.

**Auth requise :** Non

**Réponse (200) :**

```json
{
  "status": "ok"
}
```
