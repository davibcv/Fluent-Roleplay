/**
 * Safe LocalStorage setter utility to prevent QuotaExceededError.
 * Automatically limits undo history/snapshots, avoids duplicate consecutive items,
 * and removes older non-critical snapshots before saving if quota is tight.
 */

export const MAX_UNDO_HISTORY_ITEMS = 6;
export const MAX_SNAPSHOTS_ITEMS = 15;

/**
 * Helper to check if two state objects/snapshots are effectively identical.
 */
export function isIdenticalSnapshot(a: any, b: any): boolean {
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Trims an array of snapshots or history items to remove consecutive duplicates
 * and keep at most `maxItems` most recent entries.
 */
export function deduplicateAndLimitSnapshots<T>(items: T[], maxItems: number = MAX_UNDO_HISTORY_ITEMS): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  
  const deduplicated: T[] = [];
  for (const item of items) {
    if (deduplicated.length === 0) {
      deduplicated.push(item);
    } else {
      const prevItem = deduplicated[deduplicated.length - 1];
      if (!isIdenticalSnapshot(prevItem, item)) {
        deduplicated.push(item);
      }
    }
  }

  if (deduplicated.length > maxItems) {
    return deduplicated.slice(deduplicated.length - maxItems);
  }
  return deduplicated;
}

/**
 * Safely writes a key-value pair to LocalStorage without throwing QuotaExceededError.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    console.warn(`[safeLocalStorageSet] Quota exceeded or error setting "${key}". Attempting cleanup...`, e);

    // If setting history itself failed, attempt to progressively trim the history value
    if (key === 'fluent_sim_state_history') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          for (let keep = Math.min(parsed.length - 1, 4); keep >= 1; keep--) {
            try {
              const trimmedValue = JSON.stringify(parsed.slice(-keep));
              localStorage.setItem('fluent_sim_state_history', trimmedValue);
              return true;
            } catch {}
          }
        }
      } catch {}
      try {
        localStorage.removeItem('fluent_sim_state_history');
      } catch {}
      return false;
    }

    // Otherwise, for primary progress keys (e.g. fluent_sim_state), clear/trim undo history & old snapshots first
    try {
      const histRaw = localStorage.getItem('fluent_sim_state_history');
      if (histRaw) {
        const hist = JSON.parse(histRaw);
        if (Array.isArray(hist) && hist.length > 2) {
          localStorage.setItem('fluent_sim_state_history', JSON.stringify(hist.slice(-2)));
        } else {
          localStorage.removeItem('fluent_sim_state_history');
        }
      }
    } catch {}

    // Retry write
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {}

    // Trim fluent_snapshots if needed
    try {
      const snapsRaw = localStorage.getItem('fluent_snapshots');
      if (snapsRaw) {
        const snaps = JSON.parse(snapsRaw);
        if (Array.isArray(snaps) && snaps.length > 3) {
          localStorage.setItem('fluent_snapshots', JSON.stringify(snaps.slice(-3)));
        } else if (Array.isArray(snaps)) {
          localStorage.removeItem('fluent_snapshots');
        }
      }
    } catch {}

    // Retry write
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {}

    // Last resort cleanup of secondary temporary items
    try {
      localStorage.removeItem('fluent_sim_state_history');
      localStorage.removeItem('fluent_last_user_message');
      localStorage.removeItem('fluent_exercise_type_history');
    } catch {}

    // Final attempt
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (finalErr) {
      console.error(`[safeLocalStorageSet] Critical: failed to write "${key}" to LocalStorage:`, finalErr);
      return false;
    }
  }
}
