// cosmetics.ts
// -----------------------------------------------------------------------------
// Pet kozmetik aksesuarlarının veri tanımları.
// Her aksesuar için kategori, görüntü URL'i ve pet frame üzerindeki
// konum/boyut bilgileri (frameSize'ın kesri olarak) belirtilir.
// -----------------------------------------------------------------------------

export type CosmeticCategory = "hat" | "glasses";

export interface CosmeticItem {
  id: string;
  displayName: string;
  category: CosmeticCategory;
  /** public/ klasörüne göreli URL */
  url: string;
  /**
   * Pet frame merkezi (frameSize/2, frameSize/2) referans alınarak offset.
   * Pozitif X = sağa, negatif Y = yukarı.
   * frameSize'ın katsayısı olarak verilir.
   */
  offsetXFraction: number;
  offsetYFraction: number;
  /** Kozmetiğin genişliği — frameSize'ın katsayısı */
  widthFraction: number;
  /** Kozmetiğin yüksekliği — frameSize'ın katsayısı */
  heightFraction: number;
}

export const COSMETICS: CosmeticItem[] = [
  // ── Şapkalar ────────────────────────────────────────────────────────────
  {
    id: "hat-tophat",
    displayName: "Silindir Şapka",
    category: "hat",
    url: "/cosmetics/hat-tophat.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.30,
    widthFraction: 0.50,
    heightFraction: 0.28,
  },
  {
    id: "hat-wizard",
    displayName: "Sihirbaz Şapkası",
    category: "hat",
    url: "/cosmetics/hat-wizard.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.34,
    widthFraction: 0.52,
    heightFraction: 0.38,
  },
  {
    id: "hat-crown",
    displayName: "Taç",
    category: "hat",
    url: "/cosmetics/hat-crown.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.30,
    widthFraction: 0.52,
    heightFraction: 0.20,
  },
  {
    id: "hat-propeller",
    displayName: "Pervane Şapka",
    category: "hat",
    url: "/cosmetics/hat-propeller.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.32,
    widthFraction: 0.50,
    heightFraction: 0.26,
  },
  // ── Gözlükler ────────────────────────────────────────────────────────────
  {
    id: "glasses-monocle",
    displayName: "Monokl",
    category: "glasses",
    url: "/cosmetics/glasses-monocle.svg",
    offsetXFraction: 0.10,
    offsetYFraction: -0.06,
    widthFraction: 0.28,
    heightFraction: 0.28,
  },
  {
    id: "glasses-round",
    displayName: "Yuvarlak Gözlük",
    category: "glasses",
    url: "/cosmetics/glasses-round.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.06,
    widthFraction: 0.56,
    heightFraction: 0.22,
  },
  {
    id: "glasses-star",
    displayName: "Yıldız Gözlük",
    category: "glasses",
    url: "/cosmetics/glasses-star.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.06,
    widthFraction: 0.56,
    heightFraction: 0.22,
  },
  {
    id: "glasses-heart",
    displayName: "Kalp Gözlük",
    category: "glasses",
    url: "/cosmetics/glasses-heart.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.08,
    widthFraction: 0.56,
    heightFraction: 0.22,
  },
  {
    id: "glasses-pixel",
    displayName: "Pixel Glasses",
    category: "glasses",
    url: "/cosmetics/glasses-pixel.svg",
    offsetXFraction: 0,
    offsetYFraction: -0.06,
    widthFraction: 0.64,
    heightFraction: 0.23,
  },
];

export function findCosmetic(id: string): CosmeticItem | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function cosmeticsByCategory(category: CosmeticCategory): CosmeticItem[] {
  return COSMETICS.filter((c) => c.category === category);
}
