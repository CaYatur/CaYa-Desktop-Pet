// App.tsx
// -----------------------------------------------------------------------------
// Pet uygulamasının kök bileşeni. Tek dosya farklı rolleri orkestre eder:
//   * Pencere kimliği: ana pencere "main", arkadaşlar "friend-{petId}".
//   * Sağ tık menüsü açıldığında pencereyi geçici olarak büyütür (menü
//     taşmasın), kapanınca geri toplar.
//   * Drag sırasında useThrowPhysics velocity'yi örnekler; bırakınca
//     momentum/bounce ile fırlatma çalışır.
//   * Otonom gezinti modu (wander) sağ tık menüsünden açılır/kapanır.
//   * Arkadaş ekleme → yeni Tauri pencere. Pet'ler birbirini event'lerle
//     görür ve yakın geldiklerinde "selam" (happy) verir.
//   * Pet Special Actions: PropLayer (pet'in yanında objeler) ve
//     spawn_overlay_window (fullscreen efektler) üzerinden çalışır.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Pet } from "./components/Pet";
import { SpeechBubble } from "./components/SpeechBubble";
import { ContextMenu, type MenuAction } from "./components/ContextMenu";
import {
  DEFAULT_COLOR_THEME_ID,
  findColorTheme,
  resolvePetSpriteUrl
} from "./data/colorThemes";
import { findPet, type PetStateName } from "./data/petStates";
import { findCosmetic } from "./data/cosmetics";
import { useDraggable } from "./hooks/useDraggable";
import { usePetState } from "./hooks/usePetState";
import { useThrowPhysics } from "./hooks/useThrowPhysics";
import { useWander, type FriendSnapshot } from "./hooks/useWander";
import { useFriendAwareness } from "./hooks/useFriendAwareness";

import { useSpecialActions } from "./special/useSpecialActions";
import { asSpecialPetId, findSpecialAction } from "./special/registry";
import type { SpecialActionId } from "./special/types";

import "./styles/app.css";

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ExpandedWindowState extends WindowState {
  content_x: number;
  content_y: number;
}
interface MenuAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface MenuState {
  open: boolean;
  x: number;
  y: number;
  anchor: MenuAnchor | null;
}
interface PetSettings {
  selected_pet: string;
  auto_sleep_seconds: number;
  speech_bubble_enabled: boolean;
  wander_enabled: boolean;
  wander_by_window: Record<string, boolean>;
  interactive_by_window: Record<string, boolean>;
  volume: number;
  theme: string;
  window: WindowState;
  friends: Record<string, string>;
  /** window label -> (category -> cosmeticId) */
  cosmetics_by_window: Record<string, Record<string, string>>;
  /** pet id -> color theme id */
  color_theme_by_pet: Record<string, string>;
}

const DEFAULT_SETTINGS: PetSettings = {
  selected_pet: "caya",
  auto_sleep_seconds: 60,
  speech_bubble_enabled: false,
  wander_enabled: false,
  wander_by_window: {},
  interactive_by_window: {},
  volume: 0.6,
  theme: "dark",
  window: { x: 1200, y: 600, width: 176, height: 176 },
  friends: {},
  cosmetics_by_window: {},
  color_theme_by_pet: {}
};

function withWindowCosmetic(
  settings: PetSettings,
  label: string,
  category: string,
  cosmeticId: string | null
): PetSettings {
  const windowCosmetics = { ...(settings.cosmetics_by_window?.[label] ?? {}) };
  if (cosmeticId) {
    windowCosmetics[category] = cosmeticId;
  } else {
    delete windowCosmetics[category];
  }

  const cosmeticsByWindow = { ...(settings.cosmetics_by_window ?? {}) };
  if (Object.keys(windowCosmetics).length > 0) {
    cosmeticsByWindow[label] = windowCosmetics;
  } else {
    delete cosmeticsByWindow[label];
  }

  return {
    ...settings,
    cosmetics_by_window: cosmeticsByWindow
  };
}

function withPetColorTheme(
  settings: PetSettings,
  petId: string,
  themeId: string | null
): PetSettings {
  const colorThemeByPet = { ...(settings.color_theme_by_pet ?? {}) };
  if (themeId) {
    colorThemeByPet[petId] = themeId;
  } else {
    delete colorThemeByPet[petId];
  }

  return {
    ...settings,
    color_theme_by_pet: colorThemeByPet
  };
}

// Menü pencere içinde sığsın diye açıldığında ekstra alan.
// Rust tarafı fiziksel piksel kullandığı için bu değerleri açılış anındaki
// devicePixelRatio ile ölçekleyip gönderiyoruz.
const MENU_EXTRA_W = 480;
const MENU_EXTRA_H = 560;

const MODE_HOLD_RANGES_MS: Record<"idle" | "sleep" | "happy" | "thinking", {
  min: number;
  max: number;
}> = {
  idle: { min: 1200, max: 2600 },
  sleep: { min: 4200, max: 7600 },
  happy: { min: 2200, max: 4200 },
  thinking: { min: 2600, max: 5200 }
};

const GREET_HOLD_MIN_MS = 900;
const GREET_HOLD_MAX_MS = 1800;

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function getModeHoldRange(state: PetStateName) {
  switch (state) {
    case "sleep":
      return MODE_HOLD_RANGES_MS.sleep;
    case "happy":
      return MODE_HOLD_RANGES_MS.happy;
    case "thinking":
      return MODE_HOLD_RANGES_MS.thinking;
    default:
      return MODE_HOLD_RANGES_MS.idle;
  }
}

export default function App() {
  // --- Bu pencere kim? ----------------------------------------------------
  // Ana pencere label "main"; arkadaşlar "friend-{petId}".
  // pet ID'yi label'dan parse ediyoruz — URL query'sine güvenmiyoruz.
  const { ownLabel, urlPetId, isFriendWindow } = useMemo(() => {
    const label = getCurrentWindow().label;
    const isFriend = label.startsWith("friend-");
    return {
      ownLabel: label,
      urlPetId: isFriend ? label.substring("friend-".length) : null,
      isFriendWindow: isFriend
    };
  }, []);

  // --- Ayarlar ------------------------------------------------------------
  const [settings, setSettings] = useState<PetSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const cosmeticMutationRef = useRef(0);
  const colorThemeMutationRef = useRef(0);
  const modeHoldTimerRef = useRef<number | null>(null);
  const modeHoldTokenRef = useRef(0);
  const modeHoldUntilRef = useRef(0);
  const [menu, setMenu] = useState<MenuState>({
    open: false,
    x: 0,
    y: 0,
    anchor: null
  });
  const menuOpenRef = useRef(menu.open);
  const [modeHoldActive, setModeHoldActive] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    menuOpenRef.current = menu.open;
  }, [menu.open]);

  // Aktif pet ID: friend window ise URL'den, değilse settings'ten.
  const activePetId = isFriendWindow
    ? urlPetId ?? "blob"
    : settings.selected_pet;
  const activeColorTheme = useMemo(
    () => findColorTheme(settings.color_theme_by_pet?.[activePetId]),
    [settings.color_theme_by_pet, activePetId]
  );
  const activeSpriteUrl = useMemo(
    () => resolvePetSpriteUrl(activePetId, activeColorTheme.id),
    [activePetId, activeColorTheme.id]
  );
  const pet = useMemo(() => findPet(activePetId), [activePetId]);
  const wanderEnabled =
    settings.wander_by_window?.[ownLabel] ??
    (ownLabel === "main" ? settings.wander_enabled : false);
  const interactiveEnabled = settings.interactive_by_window?.[ownLabel] ?? true;
  const wanderEnabledRef = useRef(wanderEnabled);
  const interactiveEnabledRef = useRef(interactiveEnabled);

  useEffect(() => {
    wanderEnabledRef.current = wanderEnabled;
  }, [wanderEnabled]);
  useEffect(() => {
    interactiveEnabledRef.current = interactiveEnabled;
  }, [interactiveEnabled]);

  // Bubble mesaj havuzu lookup'ı.
  const getBubblePool = useCallback(
    (state: PetStateName) => pet.states[state]?.bubbleMessages,
    [pet]
  );

  const {
    activeState,
    bubble,
    setMode,
    playTransient,
    onTransientFinished,
    markActivity,
    regenerateBubble
  } = usePetState({
    autoSleepSeconds: settings.auto_sleep_seconds,
    getBubblePool,
    bubbleEnabled: settings.speech_bubble_enabled
  });
  const activeStateRef = useRef(activeState);
  const sleepingDragRef = useRef(false);

  useEffect(() => {
    activeStateRef.current = activeState;
  }, [activeState]);

  // --- Backend: ayarları yükle ---------------------------------------------
  // Tüm pencereler ayarları okur (wander/bubble gibi davranışlar her pet için
  // tutarlı olsun). Sadece main pencere disk'e yazma yetkisine sahip.
  useEffect(() => {
    invoke<PetSettings>("load_settings")
      .then((loaded) => setSettings(loaded))
      .catch((e) => console.warn("load_settings failed:", e));
  }, []);

  // Debounced persist (sadece main).
  const persistTimerRef = useRef<number | null>(null);
  const persistSettings = useCallback(
    (next: PetSettings) => {
      if (isFriendWindow) return;
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(() => {
        invoke("save_settings", { settings: next }).catch((e) =>
          console.warn("save_settings failed:", e)
        );
      }, 300);
    },
    [isFriendWindow]
  );

  const updateSettings = useCallback(
    (patch: Partial<PetSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings]
  );

  const persistCurrentWindow = useCallback(async () => {
    if (isFriendWindow) return;
    try {
      const state = await invoke<WindowState>("get_window_state");
      updateSettings({ window: state });
    } catch (e) {
      console.warn("get_window_state failed:", e);
    }
  }, [isFriendWindow, updateSettings]);

  const setWanderForThisWindow = useCallback(
    (enabled: boolean) => {
      wanderEnabledRef.current = enabled;
      setSettings((prev) => ({
        ...prev,
        wander_enabled: ownLabel === "main" ? enabled : prev.wander_enabled,
        wander_by_window: {
          ...(prev.wander_by_window ?? {}),
          [ownLabel]: enabled
        }
      }));
      invoke<PetSettings>("set_wander_for_window", {
        label: ownLabel,
        enabled
      })
        .then((next) => setSettings(next))
        .catch((e) => console.warn("set_wander_for_window failed:", e));
    },
    [ownLabel]
  );

  const setInteractiveForThisWindow = useCallback(
    (enabled: boolean) => {
      interactiveEnabledRef.current = enabled;
      setSettings((prev) => ({
        ...prev,
        interactive_by_window: {
          ...(prev.interactive_by_window ?? {}),
          [ownLabel]: enabled
        }
      }));
      invoke<PetSettings>("set_interactive_for_window", {
        label: ownLabel,
        enabled
      })
        .then((next) => setSettings(next))
        .catch((e) => console.warn("set_interactive_for_window failed:", e));
    },
    [ownLabel]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<string>("pet:friend-closed", (event) => {
      const label = event.payload;
      setSettings((prev) => {
        if (!prev.friends?.[label]) return prev;
        const friends = { ...prev.friends };
        delete friends[label];
        return { ...prev, friends };
      });
    })
      .then((u) => {
        if (cancelled) {
          u();
        } else {
          unlisten = u;
        }
      })
      .catch((e) => console.warn("pet:friend-closed listen failed:", e));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // --- Arkadaş farkındalığı (multi-window) --------------------------------
  const { friends } = useFriendAwareness({
    ownLabel,
    ownPetId: activePetId,
    broadcastIntervalMs: 250
  });
  // Kendimizi dışarı veren bir görünüm (filter):
  const otherFriends: FriendSnapshot[] = useMemo(
    () => friends.filter((f) => f.label !== ownLabel),
    [friends, ownLabel]
  );

  // --- Fizik (atmaca) -----------------------------------------------------
  const { startSampling, releaseWithVelocity, cancel: cancelPhysics } =
    useThrowPhysics({
      onThrowStart: () => {
        // Atış sırasında gözleri "dragged" gibi titret.
        playTransient("dragged");
      },
      onSettled: () => {
        // Yere indi/durdu — restingState'e dön (idle/sleep).
        onTransientFinished("dragged");
        persistCurrentWindow();
        // Wander açıksa devam etsin.
        wanderApi.current?.resume();
      }
    });

  // --- Otonom gezinti -----------------------------------------------------
  const wanderApi = useRef<{ resume: () => void; interrupt: () => void } | null>(
    null
  );
  const [walking, setWalking] = useState(false);
  const [blobReactionToken, setBlobReactionToken] = useState(0);

  const clearModeHoldTimer = useCallback(() => {
    if (modeHoldTimerRef.current != null) {
      window.clearTimeout(modeHoldTimerRef.current);
      modeHoldTimerRef.current = null;
    }
  }, []);

  const startModeHold = useCallback(
    (durationMs: number) => {
      if (!wanderEnabledRef.current || durationMs <= 0) return;

      clearModeHoldTimer();
      const token = ++modeHoldTokenRef.current;
      modeHoldUntilRef.current = Date.now() + durationMs;
      setModeHoldActive(true);
      setWalking(false);
      wanderApi.current?.interrupt();

      modeHoldTimerRef.current = window.setTimeout(() => {
        if (token !== modeHoldTokenRef.current) return;
        modeHoldUntilRef.current = 0;
        setModeHoldActive(false);
        if (wanderEnabledRef.current && !menuOpenRef.current) {
          wanderApi.current?.resume();
        }
      }, durationMs);
    },
    [clearModeHoldTimer]
  );

  useEffect(
    () => () => {
      clearModeHoldTimer();
    },
    [clearModeHoldTimer]
  );

  const handleGreet = useCallback(() => {
    // Yakın arkadaş görünce kısa happy.
    playTransient("happy");
    startModeHold(randomBetween(GREET_HOLD_MIN_MS, GREET_HOLD_MAX_MS));
  }, [playTransient, startModeHold]);

  const { interrupt: wanderInterrupt, resume: wanderResume } = useWander({
    enabled: wanderEnabled,
    onWalkingChange: setWalking,
    onGreet: handleGreet,
    friends: otherFriends,
    ownLabel,
    interactiveEnabled
  });
  // Hook geri çağrılarını closure'lar üzerinden kullanmak için ref.
  wanderApi.current = { resume: wanderResume, interrupt: wanderInterrupt };

  // Walking aktifken aktif state'i ona ayarla (geçici override).
  const visualState: PetStateName = modeHoldActive ? activeState : walking ? "walking" : activeState;

  // --- Sürükleme ----------------------------------------------------------
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const { handleMouseDown } = useDraggable({
    disabled: menu.open,
    onDragStart: () => {
      draggingRef.current = true;
      setDragging(true);
      wanderInterrupt();
      cancelPhysics();
      sleepingDragRef.current = activeStateRef.current === "sleep";
      playTransient("dragged");
    },
    onSamplingStart: () => {
      startSampling();
    },
    onRelease: () => {
      releaseWithVelocity();
    },
    onDragMove: (distance) => {
      if (sleepingDragRef.current && distance > 90) {
        sleepingDragRef.current = false;
        setMode("idle");
      }
    },
    onDragEnd: async () => {
      draggingRef.current = false;
      setDragging(false);
      // Konumu disk'e yaz.
      await persistCurrentWindow();
    }
  });

  // --- Pet Special Actions (Props + Fullscreen Effects) -------------------
  const specialPetId = useMemo(() => asSpecialPetId(activePetId), [activePetId]);
  const specialBusy = dragging || menu.open || walking;
  const special = useSpecialActions({
    petId: specialPetId ?? "caya",
    busy: specialBusy
  });

  // Aktif prop ID'lerini izle: yeni eklendiğinde pet state'ine yansıt;
  // bittiğinde uygun şekilde geri dön.
  const prevPropsRef = useRef<SpecialActionId[]>([]);
  useEffect(() => {
    if (!specialPetId) return;
    const prev = prevPropsRef.current;
    const next = special.activeProps;

    const added = next.filter((id) => !prev.includes(id));
    const removed = prev.filter((id) => !next.includes(id));

    for (const id of added) {
      switch (id) {
        case "caya.miniComputer":
        case "caya.terminalPortal":
        case "cube.systemAnalyzer":
        case "cube.geometryLab":
          playTransient("thinking");
          break;
        case "blob.snackTime":
        case "blob.toyBall":
        case "blob.waterSplash":
          playTransient("happy");
          break;
        case "blob.sleepZone":
          playTransient("sleep");
          break;
        default:
          break;
      }
    }

    for (const id of removed) {
      switch (id) {
        case "caya.miniComputer":
        case "caya.terminalPortal":
        case "cube.systemAnalyzer":
        case "cube.geometryLab":
          onTransientFinished("thinking");
          break;
        case "blob.snackTime":
        case "blob.toyBall":
        case "blob.waterSplash":
          onTransientFinished("happy");
          break;
        case "blob.sleepZone":
          onTransientFinished("sleep");
          break;
        default:
          break;
      }
    }

    prevPropsRef.current = next;
  }, [special.activeProps, specialPetId, playTransient, onTransientFinished]);

  // --- Etkileşimler -------------------------------------------------------
  const handleClick = useCallback(() => {
    playTransient("clicked");
    regenerateBubble();
  }, [playTransient, regenerateBubble]);

  const handleDoubleClick = useCallback(() => {
    playTransient("happy");
    regenerateBubble();
    startModeHold(randomBetween(1200, 2400));
    if (activePetId === "blob") {
      setBlobReactionToken((current) => current + 1);
      // Blob çift tık → küçük su sıçraması.
      special.trigger("blob.waterSplash", { manual: true });
    }
  }, [activePetId, playTransient, regenerateBubble, startModeHold, special]);

  // Menü açıldığında pencereyi büyüt, kapanınca eski boyuta geri al.
  const expandedRef = useRef<WindowState | null>(null);
  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      markActivity();
      wanderInterrupt();
      cancelPhysics();
      setWalking(false);
      onTransientFinished("dragged");
      const originalViewportWidth = window.innerWidth;
      const originalViewportHeight = window.innerHeight;
      const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
      // Önce mevcut pencere durumunu kaydet.
      let nextMenu: MenuState = {
        open: true,
        x: e.clientX,
        y: e.clientY,
        anchor: null
      };
      try {
        const original: WindowState = await invoke("get_window_state");
        expandedRef.current = original;
        const expanded = await invoke<ExpandedWindowState>("expand_window", {
          extraHeight: Math.ceil(MENU_EXTRA_H * deviceScale),
          extraWidth: Math.ceil(MENU_EXTRA_W * deviceScale)
        });
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });

        const widthScale =
          expanded.width > 0 && Number.isFinite(window.innerWidth / expanded.width)
            ? window.innerWidth / expanded.width
            : 1;
        const heightScale =
          expanded.height > 0 && Number.isFinite(window.innerHeight / expanded.height)
            ? window.innerHeight / expanded.height
            : 1;
        const contentLeft = expanded.content_x * widthScale;
        const contentTop = expanded.content_y * heightScale;

        nextMenu = {
          open: true,
          x: e.clientX + contentLeft,
          y: e.clientY + contentTop,
          anchor: {
            left: contentLeft,
            top: contentTop,
            width: originalViewportWidth,
            height: originalViewportHeight
          }
        };
      } catch (err) {
        console.warn("expand_window failed:", err);
      }
      setMenu(nextMenu);
    },
    [cancelPhysics, markActivity, onTransientFinished, wanderInterrupt]
  );

  const closeMenu = useCallback(async () => {
    setMenu((m) => ({ ...m, open: false, anchor: null }));
    const orig = expandedRef.current;
    expandedRef.current = null;
    if (orig) {
      try {
        await invoke("set_window_size", {
          x: orig.x,
          y: orig.y,
          width: orig.width,
          height: orig.height
        });
      } catch (err) {
        console.warn("set_window_size failed:", err);
      }
    }
    if (wanderEnabledRef.current && Date.now() >= modeHoldUntilRef.current) {
      wanderApi.current?.resume();
    }
  }, []);

  useEffect(() => {
    if (!menu.open) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    const currentWindow = getCurrentWindow();
    currentWindow
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) closeMenu();
      })
      .then((u) => {
        if (cancelled) {
          u();
        } else {
          unlisten = u;
        }
      })
      .catch((e) => console.warn("onFocusChanged failed:", e));

    const onBlur = () => closeMenu();
    window.addEventListener("blur", onBlur);
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("blur", onBlur);
    };
  }, [menu.open, closeMenu]);

  const handleMenuAction = useCallback(
    async (action: MenuAction) => {
      switch (action.type) {
        case "set-mode":
          setMode(action.state);
          {
            const holdRange = getModeHoldRange(action.state);
            startModeHold(randomBetween(holdRange.min, holdRange.max));
          }
          break;
        case "select-pet":
          if (!isFriendWindow) {
            updateSettings({ selected_pet: action.petId });
            setMode("idle");
          }
          break;
        case "toggle-bubble":
          updateSettings({ speech_bubble_enabled: !settings.speech_bubble_enabled });
          break;
        case "toggle-wander":
          setWanderForThisWindow(!wanderEnabledRef.current);
          break;
        case "toggle-interactive":
          setInteractiveForThisWindow(!interactiveEnabledRef.current);
          break;
        case "close-self":
          try {
            await invoke("close_friend", { label: ownLabel });
          } catch (e) {
            console.warn("close_friend failed:", e);
            getCurrentWindow().close().catch((err) => console.warn(err));
          }
          break;
        case "spawn-friend":
          try {
            const label = await invoke<string>("spawn_friend", { petId: action.petId });
            setSettings((prev) => ({
              ...prev,
              friends: { ...(prev.friends ?? {}), [label]: action.petId }
            }));
          } catch (e) {
            console.warn("spawn_friend failed:", e);
          }
          break;
        case "close-friend":
          try {
            await invoke("close_friend", { label: action.label });
            setSettings((prev) => {
              const friends = { ...(prev.friends ?? {}) };
              delete friends[action.label];
              return { ...prev, friends };
            });
          } catch (e) {
            console.warn("close_friend failed:", e);
          }
          break;
        case "hide":
          getCurrentWindow().hide().catch((e) => console.warn(e));
          break;
        case "toggle-cosmetic": {
          const cosmetic = findCosmetic(action.cosmeticId);
          if (!cosmetic) break;

          const category = cosmetic.category;
          const previousSettings = settingsRef.current;
          const currentCosmeticId = previousSettings.cosmetics_by_window?.[ownLabel]?.[category] ?? null;
          const nextCosmeticId = currentCosmeticId === action.cosmeticId ? null : action.cosmeticId;
          const optimisticSettings = withWindowCosmetic(
            previousSettings,
            ownLabel,
            category,
            nextCosmeticId
          );
          const mutationId = ++cosmeticMutationRef.current;

          settingsRef.current = optimisticSettings;
          setSettings(optimisticSettings);

          try {
            const next = await invoke<PetSettings>("set_cosmetic_for_window", {
              label: ownLabel,
              category,
              cosmeticId: nextCosmeticId
            });

            if (mutationId === cosmeticMutationRef.current) {
              settingsRef.current = next;
              setSettings(next);
            }
          } catch (e) {
            console.warn("set_cosmetic_for_window failed:", e);

            if (mutationId === cosmeticMutationRef.current) {
              settingsRef.current = previousSettings;
              setSettings(previousSettings);
            }
          }
          break;
        }
        case "set-color-theme": {
          const nextThemeId =
            action.themeId === DEFAULT_COLOR_THEME_ID ? null : action.themeId;
          const previousSettings = settingsRef.current;
          const optimisticSettings = withPetColorTheme(previousSettings, activePetId, nextThemeId);
          const mutationId = ++colorThemeMutationRef.current;

          settingsRef.current = optimisticSettings;
          setSettings(optimisticSettings);

          try {
            const next = await invoke<PetSettings>("set_color_theme_for_pet", {
              petId: activePetId,
              themeId: nextThemeId
            });

            if (mutationId === colorThemeMutationRef.current) {
              settingsRef.current = next;
              setSettings(next);
            }
          } catch (e) {
            console.warn("set_color_theme_for_pet failed:", e);

            if (mutationId === colorThemeMutationRef.current) {
              settingsRef.current = previousSettings;
              setSettings(previousSettings);
            }
          }
          break;
        }
        case "trigger-special": {
          // Manuel tetik — cooldown'a takılabilir, sessizce yutarız.
          const meta = findSpecialAction(action.actionId);
          if (!meta || meta.pet !== specialPetId) break;
          special.trigger(action.actionId, { manual: true });
          break;
        }
        case "toggle-auto-special-global":
          special.setGlobalAutoEnabled(!special.settings.globalEnabled);
          break;
        case "toggle-auto-special-pet":
          if (!specialPetId) break;
          special.setPetAutoEnabled(!special.settings.pets[specialPetId].enabled);
          break;
        case "toggle-auto-special-action": {
          if (!specialPetId) break;
          const meta = findSpecialAction(action.actionId);
          if (!meta) break;
          const currentRaw = special.settings.pets[specialPetId].perAction[action.actionId];
          const current = currentRaw ?? meta.defaultAuto;
          special.setActionAutoEnabled(action.actionId, !current);
          break;
        }
        case "exit":
          if (isFriendWindow) {
            // Sadece kendi pencereni kapat.
            getCurrentWindow().close().catch((e) => console.warn(e));
          } else {
            invoke("exit_app").catch((e) => console.warn(e));
          }
          break;
      }
    },
    [
      setMode,
      startModeHold,
      settings.speech_bubble_enabled,
      updateSettings,
      setWanderForThisWindow,
      setInteractiveForThisWindow,
      activePetId,
      isFriendWindow,
      ownLabel,
      specialPetId,
      special
    ]
  );

  // --- Bubble periyodik yenileme ------------------------------------------
  useEffect(() => {
    if (!settings.speech_bubble_enabled) return;
    const id = window.setInterval(() => regenerateBubble(), 7000);
    return () => window.clearInterval(id);
  }, [settings.speech_bubble_enabled, regenerateBubble]);

  // Sürükleme/menü/walking sırasında bubble görünmesin.
  const bubbleVisible =
    settings.speech_bubble_enabled &&
    activeState !== "dragged" &&
    !menu.open;

  // Bu pencere için aktif kozmetik map'i (category -> cosmeticId).
  const windowCosmetics = useMemo(
    () => settings.cosmetics_by_window?.[ownLabel] ?? {},
    [settings.cosmetics_by_window, ownLabel]
  );
  // Pet bileşenine verilecek aktif kozmetik ID'leri.
  const activeCosmeticIds = useMemo(
    () => Object.values(windowCosmetics).filter(Boolean),
    [windowCosmetics]
  );

  // Sağ tık menü öğeleri için arkadaş listesi (kendimizi dışarıda tut, ana pencere her zaman gizlenir).
  const menuFriends = useMemo(
    () => {
      return Object.entries(settings.friends ?? {})
        .filter(([label]) => label !== ownLabel && label.startsWith("friend-"))
        .map(([label, petId]) => ({ label, petId }));
    },
    [ownLabel, settings.friends]
  );

  const petStackStyle: CSSProperties | undefined = menu.anchor
    ? {
        position: "absolute",
        left: menu.anchor.left + menu.anchor.width / 2,
        top: menu.anchor.top + menu.anchor.height / 2,
        transform: "translate(-50%, -50%)"
      }
    : undefined;

  return (
    <div className="app-root" data-theme={settings.theme}>
      <div className="pet-stack" style={petStackStyle}>
        <SpeechBubble message={bubble} visible={bubbleVisible} />
        <Pet
          pet={pet}
          state={visualState}
          cosmeticIds={activeCosmeticIds}
          spriteUrl={activeSpriteUrl}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onMouseDown={handleMouseDown}
          onAnimationEnd={onTransientFinished}
          blobReactionToken={blobReactionToken}
        />
        {/* Pet props artık her biri ayrı şeffaf, click-through Tauri
             penceresinde render edilir; bu pencerede sadece pet kalır. */}
      </div>
      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        currentPetId={activePetId}
        bubbleEnabled={settings.speech_bubble_enabled}
        wanderEnabled={wanderEnabled}
        interactiveEnabled={interactiveEnabled}
        friends={menuFriends}
        isFriendWindow={isFriendWindow}
        activeCosmetics={windowCosmetics}
        activeColorThemeId={activeColorTheme.id}
        specialSettings={special.settings}
        specialPetId={specialPetId}
        onAction={handleMenuAction}
        onClose={closeMenu}
      />
    </div>
  );
}
