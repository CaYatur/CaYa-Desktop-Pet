export interface PetColorTheme {
  id: string;
  displayName: string;
  swatch: string;
}

export const DEFAULT_COLOR_THEME_ID = "default";

export const PET_COLOR_THEMES: PetColorTheme[] = [
  {
    id: DEFAULT_COLOR_THEME_ID,
    displayName: "Varsayılan",
    swatch: "linear-gradient(135deg, #ff5d6c 0%, #7be0ff 50%, #9aff6c 100%)"
  },
  {
    id: "electric-blue",
    displayName: "Elektrik Mavi",
    swatch: "#4ab8ff"
  },
  {
    id: "neon-green",
    displayName: "Neon Yeşil",
    swatch: "#84ff5d"
  },
  {
    id: "violet",
    displayName: "Mor",
    swatch: "#9d72ff"
  },
  {
    id: "gold",
    displayName: "Altın",
    swatch: "#ffc74f"
  },
  {
    id: "aqua",
    displayName: "Aqua",
    swatch: "#49f2ff"
  },
  {
    id: "sunset",
    displayName: "Günbatımı",
    swatch: "#ff9252"
  },
  {
    id: "bubblegum",
    displayName: "Bubblegum",
    swatch: "#ff73b8"
  },
  {
    id: "ice",
    displayName: "Buz",
    swatch: "#d9f7ff"
  },
  {
    id: "mono",
    displayName: "Mono",
    swatch: "#d0d0d0"
  }
];

export function findColorTheme(id?: string | null): PetColorTheme {
  return PET_COLOR_THEMES.find((theme) => theme.id === id) ?? PET_COLOR_THEMES[0];
}

export function resolvePetSpriteUrl(petId: string, themeId?: string | null): string {
  if (!themeId || themeId === DEFAULT_COLOR_THEME_ID) {
    return `/pets/${petId}.svg`;
  }

  return `/pets/${petId}--${themeId}.svg`;
}