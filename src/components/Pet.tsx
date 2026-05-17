// Pet.tsx
// -----------------------------------------------------------------------------
// Pet'in tüm görsel ve etkileşim katmanı. App.tsx, durum yönetimi state'ini
// burada düzenler; bu bileşen sadece prop olarak gelen veriyi render eder.
//
// Sprite mantığı:
//   * Tek bir div; arkaplan olarak sprite sheet kullanılır.
//   * background-size = (cols * frameSize) x (rows * frameSize)
//   * background-position-x = -frame * frameSize
//   * background-position-y = -row * frameSize
//   * image-rendering: pixelated → SVG/PNG sprite'larda keskin kalsın diye.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { PetDefinition, PetStateName } from "../data/petStates";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { findCosmetic } from "../data/cosmetics";

interface Props {
  pet: PetDefinition;
  state: PetStateName;
  /** Aktif kozmetik ID listesi (hat, glasses vb.) */
  cosmeticIds: string[];
  spriteUrl: string;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onAnimationEnd: (finished: PetStateName) => void;
  blobReactionToken: number;
}

export function Pet({
  pet,
  state,
  cosmeticIds,
  spriteUrl,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseDown,
  onAnimationEnd,
  blobReactionToken
}: Props) {
  const { frame } = usePetAnimation({
    pet,
    stateName: state,
    onAnimationEnd
  });
  const [blobJellyActive, setBlobJellyActive] = useState(false);

  useEffect(() => {
    if (pet.id !== "blob" || blobReactionToken <= 0) return;

    setBlobJellyActive(true);
    const timeoutId = window.setTimeout(() => {
      setBlobJellyActive(false);
    }, 460);

    return () => window.clearTimeout(timeoutId);
  }, [blobReactionToken, pet.id]);

  const row = pet.states[state].row;

  // Aktif kozmetik nesneleri.
  const activeCosmetics = useMemo(
    () => cosmeticIds.map((id) => findCosmetic(id)).filter(Boolean) as NonNullable<ReturnType<typeof findCosmetic>>[],
    [cosmeticIds]
  );

  const petStyle = useMemo(
    () => ({
      width: `${pet.frameSize}px`,
      height: `${pet.frameSize}px`,
      position: "relative" as const
    }),
    [pet.frameSize]
  );

  // Inline style — sprite sheet boyutlandırması.
  const spriteStyle = useMemo(
    () => ({
      position: "absolute" as const,
      inset: 0,
      backgroundImage: `url("${spriteUrl}")`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${pet.cols * pet.frameSize}px ${pet.rows * pet.frameSize}px`,
      backgroundPosition: `-${frame * pet.frameSize}px -${row * pet.frameSize}px`,
      imageRendering: "pixelated" as const
    }),
    [pet, frame, row, spriteUrl]
  );

  return (
    <div
      className={`pet${pet.id === "blob" ? " pet--blob" : ""}${blobJellyActive ? " pet--blob-jelly" : ""}`}
      style={petStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
    >
      <div className="pet__sprite" style={spriteStyle} />
      {activeCosmetics.map((cosmetic) => {
        const placement = pet.cosmeticPlacement?.[cosmetic.category];
        const scale = placement?.scale ?? 1;
        const w = cosmetic.widthFraction * pet.frameSize * scale;
        const h = cosmetic.heightFraction * pet.frameSize * scale;
        const l =
          pet.frameSize / 2 +
          (cosmetic.offsetXFraction + (placement?.offsetXFraction ?? 0)) * pet.frameSize -
          w / 2;
        const t =
          pet.frameSize / 2 +
          (cosmetic.offsetYFraction + (placement?.offsetYFraction ?? 0)) * pet.frameSize -
          h / 2;
        return (
          <img
            key={cosmetic.id}
            src={cosmetic.url}
            alt={cosmetic.displayName}
            style={{
              position: "absolute",
              left: l,
              top: t,
              width: w,
              height: h,
              pointerEvents: "none",
              imageRendering: "pixelated",
              zIndex: 10,
            }}
          />
        );
      })}
    </div>
  );
}
