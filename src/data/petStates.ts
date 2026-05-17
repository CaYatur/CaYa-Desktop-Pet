// petStates.ts
// -----------------------------------------------------------------------------
// Pet durum makinesinin verisel tanımı. Her durum:
//   * Sprite sheet üzerindeki satır indexine
//   * Kaç frame oynayacağına
//   * Frame başına süreye (ms)
//   * Loop'lanıp loop'lanmayacağına
//   * Durum bittiğinde geri dönülecek state'e (transition) sahiptir.
//
// Yeni bir pet eklemek için PETS dizisine yeni bir kayıt eklemek yeterli;
// sprite sheet path'i ve frame boyutu kayıt başına tanımlanır.
// -----------------------------------------------------------------------------

export type PetStateName =
  | "idle"
  | "sleep"
  | "happy"
  | "thinking"
  | "clicked"
  | "dragged"
  | "walking";

export interface PetStateConfig {
  /** Sprite sheet üzerindeki satır (0-tabanlı). */
  row: number;
  /** Bu satırda kaç frame var. */
  frameCount: number;
  /** Frame başına süre (ms). */
  frameDuration: number;
  /** Animasyon loop'lansın mı? false ise frameCount'a varınca durur. */
  loop: boolean;
  /** Animasyon (loop=false ise) bitince hangi state'e geçilsin. */
  transitionTo?: PetStateName;
  /** Bu state'te konuşma balonunda dönecek mesajlar. */
  bubbleMessages?: string[];
}

export interface PetDefinition {
  /** UI'da gösterilecek isim. */
  id: string;
  displayName: string;
  /** public/ klasörüne göreli sprite sheet URL'i. */
  spriteUrl: string;
  /** Tek bir frame'in piksel boyutu (kare varsayıyoruz). */
  frameSize: number;
  /** Sprite sheet'in toplam frame matrisi (genişlik = cols * frameSize). */
  cols: number;
  rows: number;
  /** Bu pet'e özgü her bir state'in konfigürasyonu. */
  states: Record<PetStateName, PetStateConfig>;
  /** Pet için kısa açıklama (seçim ekranında). */
  description: string;
  /** Kategori bazında kozmetik yerleşim ince ayarları. */
  cosmeticPlacement?: Partial<Record<"hat" | "glasses", PetCosmeticPlacement>>;
}

export interface PetCosmeticPlacement {
  offsetXFraction?: number;
  offsetYFraction?: number;
  scale?: number;
}

// -----------------------------------------------------------------------------
// Ortak state şablonu — pet'ler büyük oranda aynı animasyon ritmini paylaşıyor.
// Sadece bubble mesajları pet bazlı özelleştiriliyor.
// -----------------------------------------------------------------------------
function buildStates(
  bubbles: Partial<Record<PetStateName, string[]>>
): Record<PetStateName, PetStateConfig> {
  return {
    idle: {
      row: 0,
      frameCount: 4,
      frameDuration: 220,
      loop: true,
      bubbleMessages: bubbles.idle
    },
    sleep: {
      row: 1,
      frameCount: 4,
      frameDuration: 380,
      loop: true,
      bubbleMessages: bubbles.sleep
    },
    happy: {
      row: 2,
      frameCount: 4,
      frameDuration: 140,
      loop: false,
      transitionTo: "idle",
      bubbleMessages: bubbles.happy
    },
    thinking: {
      row: 3,
      frameCount: 4,
      frameDuration: 260,
      loop: true,
      bubbleMessages: bubbles.thinking
    },
    clicked: {
      row: 4,
      frameCount: 4,
      frameDuration: 90,
      loop: false,
      transitionTo: "happy",
      bubbleMessages: bubbles.clicked
    },
    dragged: {
      row: 5,
      frameCount: 4,
      frameDuration: 120,
      loop: true,
      bubbleMessages: bubbles.dragged
    },
    walking: {
      row: 6,
      frameCount: 4,
      frameDuration: 180,
      loop: true,
      bubbleMessages: bubbles.walking
    }
  };
}

// -----------------------------------------------------------------------------
// PET'LER
// -----------------------------------------------------------------------------
export const PETS: PetDefinition[] = [
  {
    id: "caya",
    displayName: "CaYa",
    description: "CaYaDev temalı, kırmızı–siyah resmi pet. Konsol ruhuyla gelir.",
    spriteUrl: "/pets/caya.svg",
    frameSize: 144,
    cols: 4,
    rows: 7,
    states: buildStates({
      idle: [
        "> hazırım.",
        "while(alive) { code(); }",
        "PS C:\\CaYaDev\\Home >",
        "ctrl+s en sevdiğim tuş.",
        "compile çalışıyor mu?",
        "kahve molası?",
        "bug fix radarım açık.",
        "terminal sessizse bir şeyler yanlış olabilir.",
        "branch temiz, zihin temiz.",
        "bugün ne ship ediyoruz?",
        "minik ama kritik bir refactor kokusu alıyorum.",
        "logları okuyorum.",
        "bir fonksiyon daha yazabiliriz."
      ],
      sleep: [
        "zZz...",
        "// uyku modunda",
        "buffer temizleniyor...",
        "rüyada compile...",
        "gece build'i bana bırak.",
        "cache ısınıyor...",
        "sessiz branch zamanı.",
        "uyurken bile lint dinliyorum."
      ],
      happy: [
        "nice! ✓",
        "deploy başarılı!",
        "compile OK",
        ":) hep böyle ol",
        "testler geçti.",
        "yeşil pipeline güzel şey.",
        "merge kokusu geldi.",
        "tam istediğim gibi oldu."
      ],
      thinking: [
        "hmm...",
        "analiz ediyorum",
        "// TODO: çöz",
        "stack trace okuyorum",
        "edge-case avındayım.",
        "bir yerde küçük bir koşul kaçmış.",
        "bu satır bana bir şey anlatıyor.",
        "önce kök neden.",
        "çağrı zincirini izliyorum."
      ],
      clicked: [
        "!",
        "hey!",
        "ne oldu?",
        "selam!",
        "komut bekliyorum.",
        "tam buradayım.",
        "input algılandı.",
        "hazır ve nazırım."
      ],
      dragged: [
        "pencere taşınıyor...",
        "uçuyoruz!",
        "hop hop",
        "nereye?",
        "rota değişti.",
        "biraz daha yumuşak bırak.",
        "momentum yüksek.",
        "ben buna taktiksel yer değişimi diyorum."
      ],
      walking: [
        "geziyorum",
        "fonksiyon arıyorum...",
        "...",
        "masaüstü turu başladı.",
        "biraz keşif iyi gelir.",
        "piksel piksel devriye.",
        "uygun bir köşe bakıyorum.",
        "adım adım ilerliyorum."
      ]
    }),
    cosmeticPlacement: {
      glasses: { offsetYFraction: 0.015, scale: 0.98 }
    }
  },
  {
    id: "blob",
    displayName: "Blob",
    description: "Yumuşak, sevimli ve dostane bir maskot. Çift tıkta jöle gibi seker.",
    spriteUrl: "/pets/blob.svg",
    frameSize: 144,
    cols: 4,
    rows: 7,
    states: buildStates({
      idle: [
        "mırr~",
        "bugün hava güzel.",
        "...",
        "blob gibi akıyorum.",
        "şlop şlop",
        "yumuşak moddayım.",
        "burada minicik yayılıyorum.",
        "yuvarlanmadan duruyorum.",
        "parlak ve pofuduk.",
        "jölemsi huzur aktif."
      ],
      sleep: [
        "zzz~",
        "blob şarj oluyor...",
        "pof... zzz...",
        "yavaşça sönümleniyorum.",
        "yastık gibi oldum.",
        "uyurken bile squishy'yim."
      ],
      happy: [
        "yaaay!",
        "sevindim~",
        "boing!",
        "şeker blob zamanı!",
        "kıpır kıpırım.",
        "tam blob'luk haber.",
        "jöle enerjim yükseldi.",
        "pofuduk mutluluk!"
      ],
      thinking: [
        "düşünüyorum...",
        "hmmm...",
        "blob beyni çalışıyor.",
        "yuvarlak bir fikir bulacağım.",
        "bu biraz yapışkan bir problem.",
        "önce his, sonra çözüm.",
        "minik minik analiz.",
        "bir yerde tatlı bir ipucu var."
      ],
      clicked: [
        "aw!",
        "tıkladın!",
        "pof!",
        "blob algıladı.",
        "minik bir dürtü aldım.",
        "cıvık refleks aktif.",
        "şlop?",
        "beni dürttün."
      ],
      dragged: [
        "whee!",
        "uçuyoruz!",
        "blob express kalktı.",
        "fazla uzadım sanki.",
        "squish ama havada.",
        "yuvarlanmıyorum, süzülüyorum.",
        "beni yumuşak indir."
      ],
      walking: [
        "pıt pıt",
        "geziyorum~",
        "blob patrol.",
        "minik sekmelerle ilerliyorum.",
        "şıp şıp dolaşıyorum.",
        "zemin uygun, ben de akıyorum.",
        "kayan blob göreve çıktı.",
        "yumuşak devriye aktif."
      ]
    }),
    cosmeticPlacement: {
      glasses: { offsetYFraction: 0.03, scale: 0.94 }
    }
  },
  {
    id: "cube",
    displayName: "Cube",
    description: "Minimal, pikselleşmiş bir kübik dost.",
    spriteUrl: "/pets/cube.svg",
    frameSize: 144,
    cols: 4,
    rows: 7,
    states: buildStates({
      idle: ["[idle]", "[ok]", "[standby]", "[ready]", "[grid:stable]", "[pixel:calm]"],
      sleep: ["[sleep]", "[zzz]", "[low-power]", "[suspend]"],
      happy: ["[:)]", "[++]", "[green]", "[yay]", "[signal:good]"],
      thinking: ["[...]", "[calc]", "[trace]", "[scan]", "[logic?]"],
      clicked: ["[!]", "[input]", "[ping]", "[tap]"],
      dragged: ["[move]", "[shift]", "[carry]", "[airborne]"],
      walking: ["[walk]", "[step]", "[route]", "[patrol]", "[roam]"]
    }),
    cosmeticPlacement: {
      glasses: { offsetYFraction: 0.04, scale: 1.04 }
    }
  }
];

export function findPet(id: string): PetDefinition {
  return PETS.find((p) => p.id === id) ?? PETS[0];
}
