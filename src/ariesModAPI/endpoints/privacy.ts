// ariesModAPI/endpoints/privacy.ts
// Endpoints pour la gestion des paramètres de confidentialité

import { httpGet, httpPost } from "../client/http";
import type { PlayerPrivacyPayload } from "../types";
import { optimistic } from "../optimistic";
import { CH_EVENTS } from "../events";
import { getCachedMyProfile, updateCachedMyProfilePrivacy } from "../cache/welcome";

/**
 * Récupère les paramètres de confidentialité du joueur authentifié
 * @returns Privacy settings ou null en cas d'erreur
 */
export async function fetchPrivacy(): Promise<PlayerPrivacyPayload | null> {
  const { status, data } = await httpGet<PlayerPrivacyPayload>("privacy");

  if (status === 200 && data) return data;
  if (status === 401) console.error("[api] fetchPrivacy unauthorized");
  return null;
}

/**
 * Met à jour un ou plusieurs paramètres de confidentialité (optimistic).
 * Seuls les champs envoyés sont modifiés côté serveur.
 * @param settings - Paramètres à modifier (au moins un champ requis)
 * @returns L'état complet des privacy settings après mise à jour, ou null en cas d'erreur
 */
export async function updatePrivacy(
  settings: Partial<PlayerPrivacyPayload>,
): Promise<PlayerPrivacyPayload | null> {
  if (!settings || Object.keys(settings).length === 0) return null;

  const profile = getCachedMyProfile();
  const privacySnapshot = profile?.privacy ? { ...profile.privacy } : null;

  // Build the optimistic merged privacy
  const optimisticPrivacy: PlayerPrivacyPayload = {
    showGarden: true,
    showInventory: true,
    showCoins: true,
    showActivityLog: true,
    showJournal: true,
    showStats: true,
    hideRoomFromPublicList: false,
    ...(privacySnapshot ?? {}),
    ...settings,
  };

  const result = await optimistic<PlayerPrivacyPayload>({
    apply: () => updateCachedMyProfilePrivacy(optimisticPrivacy),
    revert: () => {
      if (privacySnapshot) updateCachedMyProfilePrivacy(privacySnapshot);
    },
    request: async () => {
      const { status, data } = await httpPost<PlayerPrivacyPayload>("privacy", settings);
      if (status === 200 && data) return data;
      throw new Error(`updatePrivacy failed: ${status}`);
    },
    events: [CH_EVENTS.PRIVACY_UPDATED],
    onError: "Failed to update privacy settings.",
  });

  // If server returned data, apply the authoritative version
  if (result) {
    updateCachedMyProfilePrivacy(result);
  }

  return result;
}
