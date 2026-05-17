// ContextMenu.tsx
// -----------------------------------------------------------------------------
// Themed HTML context menu. It keeps friend-window actions separate from main
// window actions so secondary pets cannot change the main pet selection.
//
// Pet Special Actions:
//   * Per-pet "Özel Eylemler" submenu — manuel tetik.
//   * "Otomatik Özel Efektler" submenu — global / per-pet / per-action toggle.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PET_COLOR_THEMES } from "../data/colorThemes";
import { findPet, PETS, type PetStateName } from "../data/petStates";
import { cosmeticsByCategory } from "../data/cosmetics";
import { getActionsForPet } from "../special/registry";
import { isActionAutoEnabled } from "../special/specialStorage";
import type {
  SpecialActionId,
  SpecialActionsSettings,
  SpecialPetId
} from "../special/types";

export type MenuAction =
  | { type: "set-mode"; state: PetStateName }
  | { type: "select-pet"; petId: string }
  | { type: "toggle-bubble" }
  | { type: "toggle-wander" }
  | { type: "toggle-interactive" }
  | { type: "spawn-friend"; petId: string }
  | { type: "close-friend"; label: string }
  | { type: "close-self" }
  | { type: "hide" }
  | { type: "exit" }
  | { type: "toggle-cosmetic"; cosmeticId: string }
  | { type: "set-color-theme"; themeId: string }
  | { type: "trigger-special"; actionId: SpecialActionId }
  | { type: "toggle-auto-special-global" }
  | { type: "toggle-auto-special-pet" }
  | { type: "toggle-auto-special-action"; actionId: SpecialActionId };

export interface MenuFriend {
  label: string;
  petId: string;
}

interface Props {
  open: boolean;
  x: number;
  y: number;
  currentPetId: string;
  bubbleEnabled: boolean;
  wanderEnabled: boolean;
  interactiveEnabled: boolean;
  friends: MenuFriend[];
  isFriendWindow: boolean;
  /** category -> active cosmetic id */
  activeCosmetics: Record<string, string>;
  activeColorThemeId: string;
  /** Pet Special Actions ayarları — varsa otomatik/özel menüler eklenir. */
  specialSettings: SpecialActionsSettings;
  specialPetId: SpecialPetId | null;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  action?: MenuAction;
  submenu?: MenuItem[];
  separator?: boolean;
  swatch?: string;
}

type SubmenuSide = "left" | "right";

interface SubmenuLayout {
  left: number;
  maxHeight: number;
  side: SubmenuSide;
  top: number;
}

const MENU_WIDTH = 220;
const SUBMENU_WIDTH = 178;
const MENU_MARGIN = 4;
const ITEM_HEIGHT = 32;
const SEPARATOR_HEIGHT = 9;
const MENU_CHROME_HEIGHT = 42;

export function ContextMenu({
  open,
  x,
  y,
  currentPetId,
  bubbleEnabled,
  wanderEnabled,
  interactiveEnabled,
  friends,
  isFriendWindow,
  activeCosmetics,
  activeColorThemeId,
  specialSettings,
  specialPetId,
  onAction,
  onClose
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (
        !ref.current?.contains(e.target as Node) &&
        !target?.closest("[data-context-menu-layer='submenu']")
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setActiveSubmenu(null);
    }
  }, [open]);

  if (!open) return null;

  const openFriendPetIds = new Set(friends.map((f) => f.petId));
  const friendCandidates = PETS.filter(
    (p) => p.id !== currentPetId && !openFriendPetIds.has(p.id)
  );

  const items: MenuItem[] = [
    { label: "Uyut", action: { type: "set-mode", state: "sleep" } },
    { label: "Uyandır", action: { type: "set-mode", state: "idle" } },
    { label: "Mutlu yap", action: { type: "set-mode", state: "happy" } },
    { label: "Düşünüyor moduna al", action: { type: "set-mode", state: "thinking" } },
    { separator: true, label: "" }
  ];

  if (!isFriendWindow) {
    const selectablePets = PETS.filter((p) => !openFriendPetIds.has(p.id));
    items.push({
      label: "Pet seç",
      submenu: selectablePets.map((p) => ({
        label: `${p.id === currentPetId ? "* " : "  "}${p.displayName}`,
        action: { type: "select-pet", petId: p.id }
      }))
    });
    if (friendCandidates.length > 0) {
      items.push({
        label: "Arkadaş ekle",
        submenu: friendCandidates.map((p) => ({
          label: `+ ${p.displayName}`,
          action: { type: "spawn-friend", petId: p.id }
        }))
      });
    }
    if (friends.length > 0) {
      items.push({
        label: "Arkadaşları kapat",
        submenu: friends.map((f) => ({
          label: `Kapat: ${findPet(f.petId).displayName}`,
          action: { type: "close-friend", label: f.label }
        }))
      });
    }
  }

  // ── Pet Special Actions ──────────────────────────────────────────────
  if (specialPetId) {
    const specialActions = getActionsForPet(specialPetId);
    if (specialActions.length > 0) {
      items.push({
        label: "Özel Eylemler",
        submenu: specialActions.map((meta) => ({
          label: `▸ ${meta.label}`,
          action: { type: "trigger-special", actionId: meta.id }
        }))
      });

      const petConfig = specialSettings.pets[specialPetId];
      const globalOn = specialSettings.globalEnabled;
      const petOn = petConfig.enabled;

      const autoSubmenu: MenuItem[] = [
        {
          label: `${globalOn ? "✓" : "  "} Global Otomasyon`,
          action: { type: "toggle-auto-special-global" }
        },
        {
          label: `${petOn ? "✓" : "  "} Bu Pet için Otomasyon`,
          action: { type: "toggle-auto-special-pet" }
        },
        { separator: true, label: "" }
      ];
      for (const meta of specialActions) {
        const effective = isActionAutoEnabled(
          specialSettings,
          specialPetId,
          meta.id,
          meta.defaultAuto
        );
        autoSubmenu.push({
          label: `${effective ? "✓ " : "  "}${meta.label}`,
          action: { type: "toggle-auto-special-action", actionId: meta.id }
        });
      }

      items.push({
        label: "Otomatik Efektler",
        submenu: autoSubmenu
      });
    }
  }

  // ── Kozmetikler ──────────────────────────────────────────────────────
  const hats = cosmeticsByCategory("hat");
  const glasses = cosmeticsByCategory("glasses");
  const activeHatId = activeCosmetics["hat"] ?? "";
  const activeGlassesId = activeCosmetics["glasses"] ?? "";
  const colorThemes = PET_COLOR_THEMES;

  items.push(
    {
      label: "Şapkalar",
      submenu: hats.map((c) => ({
        label: `${activeHatId === c.id ? "✓ " : "  "}${c.displayName}`,
        action: { type: "toggle-cosmetic" as const, cosmeticId: c.id }
      }))
    },
    {
      label: "Gözlükler",
      submenu: glasses.map((c) => ({
        label: `${activeGlassesId === c.id ? "✓ " : "  "}${c.displayName}`,
        action: { type: "toggle-cosmetic" as const, cosmeticId: c.id }
      }))
    },
    {
      label: "Renk Teması",
      submenu: colorThemes.map((theme) => ({
        label: `${activeColorThemeId === theme.id ? "✓ " : "  "}${theme.displayName}`,
        action: { type: "set-color-theme" as const, themeId: theme.id },
        swatch: theme.swatch
      }))
    },
    { separator: true, label: "" }
  );

  items.push(
    {
      label: `Gezinti: ${wanderEnabled ? "Açık" : "Kapalı"}`,
      action: { type: "toggle-wander" }
    },
    {
      label: `İnteraktif: ${interactiveEnabled ? "Açık" : "Kapalı"}`,
      action: { type: "toggle-interactive" }
    },
    {
      label: `Konuşma balonu: ${bubbleEnabled ? "Açık" : "Kapalı"}`,
      action: { type: "toggle-bubble" }
    },
    { separator: true, label: "" }
  );

  if (isFriendWindow) {
    items.push({ label: "Bu peti kapat", action: { type: "close-self" } });
  } else {
    items.push(
      { label: "Gizle", action: { type: "hide" } },
      { label: "Çıkış", action: { type: "exit" } }
    );
  }

  const w = Math.min(MENU_WIDTH, Math.max(160, window.innerWidth - MENU_MARGIN * 2));
  const submenuWidth = Math.min(
    SUBMENU_WIDTH,
    Math.max(140, window.innerWidth - MENU_MARGIN * 2)
  );
  const maxMenuHeight = Math.max(ITEM_HEIGHT * 4, window.innerHeight - MENU_MARGIN * 2);
  const h = Math.min(
    items.reduce(
    (sum, item) => sum + (item.separator ? SEPARATOR_HEIGHT : ITEM_HEIGHT),
    MENU_CHROME_HEIGHT
    ),
    maxMenuHeight
  );
  const left = Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - w - MENU_MARGIN));
  const top = Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - h - MENU_MARGIN));

  const currentPet = findPet(currentPetId);
  const clearActiveSubmenu = () => setActiveSubmenu(null);
  const renderItemLabel = (item: MenuItem) => (
    <span className="context-menu__item-main">
      {item.swatch ? <span className="context-menu__swatch" style={{ background: item.swatch }} /> : null}
      <span>{item.label}</span>
    </span>
  );

  return (
    <div
      ref={ref}
      className="context-menu"
      data-no-drag
      style={{ left, top, width: w, maxHeight: maxMenuHeight }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="context-menu__header">{currentPet.displayName}</div>
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="context-menu__sep" />
        ) : item.submenu && item.submenu.length > 0 ? (
          <Submenu
            key={item.label}
            active={activeSubmenu === item.label}
            item={item}
            submenuWidth={submenuWidth}
            onActivate={() => setActiveSubmenu(item.label)}
            onDeactivate={() =>
              setActiveSubmenu((current) => (current === item.label ? null : current))
            }
            onAction={onAction}
            onClose={onClose}
          />
        ) : item.submenu ? null : (
          <button
            key={item.label}
            className="context-menu__item"
            onFocus={clearActiveSubmenu}
            onMouseEnter={clearActiveSubmenu}
            onClick={() => {
              if (item.action) onAction(item.action);
              onClose();
            }}
          >
            {renderItemLabel(item)}
          </button>
        )
      )}
    </div>
  );
}

function Submenu({
  active,
  item,
  submenuWidth,
  onActivate,
  onDeactivate,
  onAction,
  onClose
}: {
  active: boolean;
  item: MenuItem;
  submenuWidth: number;
  onActivate: () => void;
  onDeactivate: () => void;
  onAction: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SubmenuLayout>({
    left: MENU_MARGIN,
    maxHeight: Math.max(ITEM_HEIGHT * 3, window.innerHeight - MENU_MARGIN * 2),
    side: "right",
    top: MENU_MARGIN
  });
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openSubmenu = useCallback(() => {
    clearCloseTimer();
    onActivate();
  }, [clearCloseTimer, onActivate]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      onDeactivate();
    }, 120);
  }, [clearCloseTimer, onDeactivate]);

  const updateLayout = useCallback(() => {
    const wrapper = ref.current;
    const submenuCount = item.submenu?.length ?? 0;
    if (!wrapper || submenuCount === 0) return;

    const rect = wrapper.getBoundingClientRect();
    const estimatedHeight = Math.min(
      submenuCount * ITEM_HEIGHT + 8,
      window.innerHeight - MENU_MARGIN * 2
    );
    const spaceRight = window.innerWidth - rect.right - MENU_MARGIN;
    const spaceLeft = rect.left - MENU_MARGIN;

    let nextSide: SubmenuSide =
      spaceRight >= submenuWidth || spaceRight >= spaceLeft ? "right" : "left";
    if (nextSide === "right" && spaceRight < submenuWidth && spaceLeft > spaceRight) {
      nextSide = "left";
    }
    if (nextSide === "left" && spaceLeft < submenuWidth && spaceRight > spaceLeft) {
      nextSide = "right";
    }

    const nextLeft =
      nextSide === "right"
        ? Math.min(rect.right - 1, window.innerWidth - submenuWidth - MENU_MARGIN)
        : Math.max(MENU_MARGIN, rect.left - submenuWidth + 1);
    const desiredTop = rect.top - 4;
    const nextTop = Math.max(
      MENU_MARGIN,
      Math.min(desiredTop, window.innerHeight - MENU_MARGIN - estimatedHeight)
    );

    setLayout({
      left: nextLeft,
      maxHeight: Math.max(ITEM_HEIGHT * 3, window.innerHeight - nextTop - MENU_MARGIN),
      side: nextSide,
      top: nextTop
    });
  }, [item.submenu, submenuWidth]);

  useLayoutEffect(() => {
    if (!active) return;
    updateLayout();
    const scrollParent = ref.current?.closest(".context-menu");
    window.addEventListener("resize", updateLayout);
    scrollParent?.addEventListener("scroll", updateLayout);
    return () => {
      window.removeEventListener("resize", updateLayout);
      scrollParent?.removeEventListener("scroll", updateLayout);
    };
  }, [active, updateLayout]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer]
  );

  return (
    <div
      ref={ref}
      className="context-menu__sub-wrapper"
      onMouseEnter={openSubmenu}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`context-menu__item context-menu__item--has-sub${active ? " context-menu__item--active" : ""}`}
        aria-expanded={active}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          openSubmenu();
        }}
        onFocus={openSubmenu}
        onBlur={scheduleClose}
      >
        <span className="context-menu__item-main">
          {item.swatch ? <span className="context-menu__swatch" style={{ background: item.swatch }} /> : null}
          <span>{item.label}</span>
        </span>
        <span className="context-menu__chevron">{">"}</span>
      </button>
      {active
        ? createPortal(
            <div
              className={`context-menu__sub context-menu__sub--${layout.side} context-menu__sub--open`}
              data-context-menu-layer="submenu"
              style={{ left: layout.left, maxHeight: layout.maxHeight, top: layout.top, width: submenuWidth }}
              onMouseEnter={openSubmenu}
              onMouseLeave={scheduleClose}
            >
              {item.submenu!.map((s, idx) =>
                s.separator ? (
                  <div key={`sep-${idx}`} className="context-menu__sep" />
                ) : (
                  <button
                    key={s.label}
                    className="context-menu__item"
                    onClick={() => {
                      if (s.action) onAction(s.action);
                      onClose();
                    }}
                  >
                    <span className="context-menu__item-main">
                      {s.swatch ? <span className="context-menu__swatch" style={{ background: s.swatch }} /> : null}
                      <span>{s.label}</span>
                    </span>
                  </button>
                )
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
