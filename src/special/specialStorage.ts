// special/specialStorage.ts
// -----------------------------------------------------------------------------
// Özel-eylem ayarlarını localStorage üzerinden persist eder. Bu sayede
// mevcut Rust PetSettings struct'ına hiç dokunulmaz — özel ayarlar tamamen
// frontend tarafında yaşar ve uygulama yeniden açıldığında geri yüklenir.
// -----------------------------------------------------------------------------

import {
  DEFAULT_SPECIAL_SETTINGS,
  type SpecialActionId,
  type SpecialActionsSettings,
  type SpecialPetId
} from "./types";

const STORAGE_KEY = "caya:special-actions:v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clone(value: SpecialActionsSettings): SpecialActionsSettings {
  return {
    globalEnabled: value.globalEnabled,
    pets: {
      caya: { enabled: value.pets.caya.enabled, perAction: { ...value.pets.caya.perAction } },
      cube: { enabled: value.pets.cube.enabled, perAction: { ...value.pets.cube.perAction } },
      blob: { enabled: value.pets.blob.enabled, perAction: { ...value.pets.blob.perAction } }
    }
  };
}

export function loadSpecialSettings(): SpecialActionsSettings {
  if (!isBrowser()) return clone(DEFAULT_SPECIAL_SETTINGS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_SPECIAL_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<SpecialActionsSettings>;
    return {
      globalEnabled: parsed.globalEnabled ?? DEFAULT_SPECIAL_SETTINGS.globalEnabled,
      pets: {
        caya: {
          enabled: parsed.pets?.caya?.enabled ?? DEFAULT_SPECIAL_SETTINGS.pets.caya.enabled,
          perAction: { ...(parsed.pets?.caya?.perAction ?? {}) }
        },
        cube: {
          enabled: parsed.pets?.cube?.enabled ?? DEFAULT_SPECIAL_SETTINGS.pets.cube.enabled,
          perAction: { ...(parsed.pets?.cube?.perAction ?? {}) }
        },
        blob: {
          enabled: parsed.pets?.blob?.enabled ?? DEFAULT_SPECIAL_SETTINGS.pets.blob.enabled,
          perAction: { ...(parsed.pets?.blob?.perAction ?? {}) }
        }
      }
    };
  } catch {
    return clone(DEFAULT_SPECIAL_SETTINGS);
  }
}

export function saveSpecialSettings(value: SpecialActionsSettings): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage full vs. — sessizce geç.
  }
}

export function setGlobalEnabled(
  current: SpecialActionsSettings,
  enabled: boolean
): SpecialActionsSettings {
  return { ...clone(current), globalEnabled: enabled };
}

export function setPetEnabled(
  current: SpecialActionsSettings,
  petId: SpecialPetId,
  enabled: boolean
): SpecialActionsSettings {
  const next = clone(current);
  next.pets[petId].enabled = enabled;
  return next;
}

export function setActionEnabled(
  current: SpecialActionsSettings,
  petId: SpecialPetId,
  actionId: SpecialActionId,
  enabled: boolean
): SpecialActionsSettings {
  const next = clone(current);
  next.pets[petId].perAction[actionId] = enabled;
  return next;
}

export function isActionAutoEnabled(
  settings: SpecialActionsSettings,
  petId: SpecialPetId,
  actionId: SpecialActionId,
  defaultAuto: boolean
): boolean {
  if (!settings.globalEnabled) return false;
  if (!settings.pets[petId].enabled) return false;
  const explicit = settings.pets[petId].perAction[actionId];
  return explicit ?? defaultAuto;
}
