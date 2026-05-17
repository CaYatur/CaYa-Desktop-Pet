// special/types.ts
// -----------------------------------------------------------------------------
// Pet Special Actions / Pet World Effects / Pet Props System için tipler.
// -----------------------------------------------------------------------------

export type SpecialPetId = "caya" | "cube" | "blob";

/**
 * Eylem kapsamı.
 *  - "prop":      Pet'in yanında küçük bir obje/mini sahne. Pet penceresi
 *                 içinde render edilir.
 *  - "fullscreen": Tüm ekrana yayılan bir efekt. Ayrı bir Tauri overlay
 *                 penceresi açılır.
 *  - "pet-mod":   Sadece pet'in kendi konumunu veya görselini etkileyen
 *                 efekt (ör. Portal Jump pet'i taşır). Prop layer içinde
 *                 yaşar ama side-effect olarak invoke yapabilir.
 */
export type SpecialActionScope = "prop" | "fullscreen" | "pet-mod";

export type SpecialActionId =
  // ── CaYa ──
  | "caya.miniComputer"
  | "caya.matrixCodeRain"
  | "caya.meteorCompile"
  | "caya.bugInvasion"
  | "caya.terminalPortal"
  // ── Cube ──
  | "cube.gridScan"
  | "cube.geometryLab"
  | "cube.portalJump"
  | "cube.cloneCubes"
  | "cube.systemAnalyzer"
  | "cube.pixelRepair"
  // ── Blob ──
  | "blob.bubbleWorld"
  | "blob.waterSplash"
  | "blob.snackTime"
  | "blob.sleepZone"
  | "blob.toyBall"
  | "blob.moodAura";

export interface SpecialActionMeta {
  id: SpecialActionId;
  pet: SpecialPetId;
  /** Sağ tık menüsünde görünecek isim. */
  label: string;
  scope: SpecialActionScope;
  /** Efekt görsel olarak ne kadar sürecek (ms). */
  durationMs: number;
  /** Bir kez çalıştıktan sonra yeniden tetiklenebilmesi için bekleme süresi (ms). */
  cooldownMs: number;
  /** Otomasyon ilk açıldığında varsayılan olarak açık mı? */
  defaultAuto: boolean;

  // ── Prop / pet-mod scope için pencere geometrisi (sadece prop'larda) ──
  /** Prop pencere genişliği (fiziksel piksel). */
  propWindowWidth?: number;
  /** Prop pencere yüksekliği (fiziksel piksel). */
  propWindowHeight?: number;
  /** Prop pencerenin merkezinin, pet merkezine göre X offset'i. */
  propAnchorOffsetX?: number;
  /** Prop pencerenin merkezinin, pet merkezine göre Y offset'i. */
  propAnchorOffsetY?: number;
}

/** Pet için özel-eylem otomasyon ayarları. */
export interface PetAutoSpecialConfig {
  /** Bu pet için otomatik özel eylemler açık mı? */
  enabled: boolean;
  /** Per-action açık/kapalı. Anahtar yoksa registry'deki defaultAuto kullanılır. */
  perAction: Partial<Record<SpecialActionId, boolean>>;
}

export interface SpecialActionsSettings {
  /** Global anahtar — kapalıysa hiçbir pet için otomatik tetik olmaz. */
  globalEnabled: boolean;
  /** Pet bazlı ayarlar. */
  pets: Record<SpecialPetId, PetAutoSpecialConfig>;
}

export const DEFAULT_SPECIAL_SETTINGS: SpecialActionsSettings = {
  globalEnabled: true,
  pets: {
    caya: { enabled: true, perAction: {} },
    cube: { enabled: true, perAction: {} },
    blob: { enabled: true, perAction: {} }
  }
};

/** Overlay penceresi URL'inde gelen parametreler. */
export interface OverlayQuery {
  effect: SpecialActionId;
  durationMs: number;
  petId?: SpecialPetId;
  /** Tetikleyen pencerenin pet konumu (overlay'in efekti pet'e yakın başlatabilmesi için). */
  petCenterX?: number;
  petCenterY?: number;
}
