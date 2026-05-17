// special/registry.ts
// -----------------------------------------------------------------------------
// Her pet için kullanılabilir özel eylemlerin merkezi kaydı. Süreler, cooldown
// değerleri, prop pencere boyutları ve pet'e göre anchor offset'leri buradan
// ayarlanır.
//
// propWindowWidth/propWindowHeight: prop ayrı pencere olduğunda pencere boyutu
//   (fiziksel piksel — bizim ölçek genelde 1.0 olduğu için logical=physical).
// propAnchorOffsetX/Y: prop pencerenin MERKEZİNİN pet penceresinin MERKEZİNE
//   göre fiziksel piksel cinsinden offset'i. Eksi = sol/üst.
// -----------------------------------------------------------------------------

import type {
  SpecialActionId,
  SpecialActionMeta,
  SpecialPetId
} from "./types";

export const SPECIAL_ACTIONS: SpecialActionMeta[] = [
  // ── CaYa ─────────────────────────────────────────────────────────────────
  {
    id: "caya.miniComputer",
    pet: "caya",
    label: "Mini Bilgisayar",
    scope: "prop",
    durationMs: 9000,
    cooldownMs: 45_000,
    defaultAuto: true,
    propWindowWidth: 210,
    propWindowHeight: 150,
    propAnchorOffsetX: -170,
    propAnchorOffsetY: -10
  },
  {
    id: "caya.matrixCodeRain",
    pet: "caya",
    label: "Matrix Code Rain",
    scope: "fullscreen",
    durationMs: 12000,
    cooldownMs: 90_000,
    defaultAuto: true
  },
  {
    id: "caya.meteorCompile",
    pet: "caya",
    label: "Meteor Compile",
    scope: "fullscreen",
    durationMs: 8000,
    cooldownMs: 80_000,
    defaultAuto: true
  },
  {
    id: "caya.bugInvasion",
    pet: "caya",
    label: "Bug Invasion",
    scope: "fullscreen",
    durationMs: 7500,
    cooldownMs: 100_000,
    defaultAuto: true
  },
  {
    id: "caya.terminalPortal",
    pet: "caya",
    label: "Terminal Portal",
    scope: "prop",
    durationMs: 8000,
    cooldownMs: 60_000,
    defaultAuto: true,
    propWindowWidth: 210,
    propWindowHeight: 160,
    propAnchorOffsetX: 170,
    propAnchorOffsetY: -10
  },

  // ── Cube ─────────────────────────────────────────────────────────────────
  {
    id: "cube.gridScan",
    pet: "cube",
    label: "Grid Scan",
    scope: "fullscreen",
    durationMs: 6000,
    cooldownMs: 70_000,
    defaultAuto: true
  },
  {
    id: "cube.geometryLab",
    pet: "cube",
    label: "Geometry Lab",
    scope: "prop",
    durationMs: 8000,
    cooldownMs: 55_000,
    defaultAuto: true,
    propWindowWidth: 160,
    propWindowHeight: 170,
    propAnchorOffsetX: 160,
    propAnchorOffsetY: -30
  },
  {
    id: "cube.portalJump",
    pet: "cube",
    label: "Portal Jump",
    scope: "pet-mod",
    durationMs: 1800,
    cooldownMs: 65_000,
    defaultAuto: true,
    propWindowWidth: 160,
    propWindowHeight: 160,
    propAnchorOffsetX: 0,
    propAnchorOffsetY: 0
  },
  {
    id: "cube.cloneCubes",
    pet: "cube",
    label: "Clone Cubes",
    scope: "prop",
    durationMs: 5000,
    cooldownMs: 50_000,
    defaultAuto: true,
    propWindowWidth: 220,
    propWindowHeight: 70,
    propAnchorOffsetX: 0,
    propAnchorOffsetY: 110
  },
  {
    id: "cube.systemAnalyzer",
    pet: "cube",
    label: "System Analyzer",
    scope: "prop",
    durationMs: 9000,
    cooldownMs: 60_000,
    defaultAuto: true,
    propWindowWidth: 180,
    propWindowHeight: 170,
    propAnchorOffsetX: -170,
    propAnchorOffsetY: -30
  },
  {
    id: "cube.pixelRepair",
    pet: "cube",
    label: "Pixel Repair",
    scope: "fullscreen",
    durationMs: 6500,
    cooldownMs: 95_000,
    defaultAuto: true
  },

  // ── Blob ─────────────────────────────────────────────────────────────────
  {
    id: "blob.bubbleWorld",
    pet: "blob",
    label: "Bubble World",
    scope: "fullscreen",
    durationMs: 8000,
    cooldownMs: 80_000,
    defaultAuto: true
  },
  {
    id: "blob.waterSplash",
    pet: "blob",
    label: "Water Splash",
    scope: "prop",
    durationMs: 1500,
    cooldownMs: 25_000,
    defaultAuto: true,
    propWindowWidth: 180,
    propWindowHeight: 180,
    propAnchorOffsetX: 0,
    propAnchorOffsetY: 0
  },
  {
    id: "blob.snackTime",
    pet: "blob",
    label: "Snack Time",
    scope: "prop",
    durationMs: 5500,
    cooldownMs: 50_000,
    defaultAuto: true,
    propWindowWidth: 90,
    propWindowHeight: 80,
    propAnchorOffsetX: 110,
    propAnchorOffsetY: 10
  },
  {
    id: "blob.sleepZone",
    pet: "blob",
    label: "Sleep Zone",
    scope: "prop",
    durationMs: 8000,
    cooldownMs: 70_000,
    defaultAuto: true,
    propWindowWidth: 110,
    propWindowHeight: 100,
    propAnchorOffsetX: -110,
    propAnchorOffsetY: 10
  },
  {
    id: "blob.toyBall",
    pet: "blob",
    label: "Toy Ball",
    scope: "prop",
    durationMs: 6000,
    cooldownMs: 45_000,
    defaultAuto: true,
    propWindowWidth: 60,
    propWindowHeight: 80,
    propAnchorOffsetX: 110,
    propAnchorOffsetY: 30
  },
  {
    id: "blob.moodAura",
    pet: "blob",
    label: "Mood Aura",
    scope: "prop",
    durationMs: 6500,
    cooldownMs: 35_000,
    defaultAuto: true,
    propWindowWidth: 200,
    propWindowHeight: 200,
    propAnchorOffsetX: 0,
    propAnchorOffsetY: 0
  }
];

export function getActionsForPet(petId: SpecialPetId): SpecialActionMeta[] {
  return SPECIAL_ACTIONS.filter((a) => a.pet === petId);
}

export function findSpecialAction(id: SpecialActionId): SpecialActionMeta | undefined {
  return SPECIAL_ACTIONS.find((a) => a.id === id);
}

/** Bilinen pet ID dönüştürücü — petStates "caya"|"cube"|"blob" döndürür. */
export function asSpecialPetId(value: string): SpecialPetId | null {
  return value === "caya" || value === "cube" || value === "blob"
    ? value
    : null;
}
