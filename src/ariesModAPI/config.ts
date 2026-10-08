// ariesModAPI/config.ts
// Configuration de l'API Aries Mod

export const API_BASE_URL = "https://ariesmod-api.ariedam.fr/";
export const API_ORIGIN = API_BASE_URL.replace(/\/$/, "");

// Timeouts

// Rate limiting & AFK
export const MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND = 5; // 5 ticks * 60s = 5 min
export const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 secondes
