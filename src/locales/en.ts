import type { Dictionary } from './vi';

// =====================================================================
// ENGLISH UI DICTIONARY. Must mirror every key in vi.ts (enforced by the Dictionary type).
// =====================================================================

export const en: Dictionary = {
  common: {
    on: 'On',
    off: 'Off',
  },

  menu: {
    newGame: 'New Game',
    continue: 'Continue',
    achievements: (unlocked, total) => `Endings ${unlocked}/${total}`,
    settings: 'Settings',
    shutdown: 'Quit',
    hintSelect: 'select',
    hintConfirm: 'confirm',
    goodbyeTitle: 'Goodbye',
    goodbyeText: "An and Mien's story pauses here. You can close this browser tab or start over at any time.",
    restart: 'Start over',
    cancel: 'Back',
  },

  settings: {
    title: 'Settings',
    language: 'Ngôn ngữ / Language',
    languageHint: 'Untranslated lines fall back to Vietnamese',
    master: 'Master volume',
    masterHint: 'Overall volume for the whole game',
    bgm: 'Music',
    bgmHint: 'Nostalgic piano, the sunset waltz, ambient drones',
    ambient: 'Ambient & effects',
    ambientHint: 'Rain, the computer fan, the river, key clicks',
    textSpeed: 'Text speed',
    textSpeedFast: 'Fast',
    textSpeedSlow: 'Slow',
    textSpeedHint: 'How quickly each character appears in the dialogue box',
    crt: 'CRT filter',
    crtHint: 'Scanlines and the flicker of an old screen',
    parallax: 'Mouse parallax',
    parallaxHint: 'The scene tilts slightly with your cursor (turn off if it makes you dizzy)',
    escHint: 'ESC to close',
    saveClose: 'Close',
  },

  achievements: {
    title: 'Endings',
    unlockedCount: (unlocked, total) => `${unlocked}/${total}`,
    lockedTitle: '???',
    lockedBadge: 'Locked',
    escHint: 'ESC to close',
    close: 'Close',
    endings: {
      A: {
        badge: 'TRUE ENDING',
        title: 'TRUE DAWN',
        summary: 'An smiles in peace and shuts down the server himself to set Mien free. The dream dissolves; Mien opens the window to the morning light after six months of storms.',
        hint: 'Requires Sanity ≥ 45% if you confronted Mien in Chapter 2, or ≥ 55% otherwise. Face the truth and let go of the dream so the one left behind can live on.',
      },
      B: {
        badge: 'BAD ENDING',
        title: 'SWEET HELL',
        summary: 'Terrified of the dark, An begs Mien to join him inside the machine. She syncs her mind at the level marked "never use"; the last two minutes before the power cut stretch into a 03:14 AM sunset that never ends.',
        hint: 'Requires Sanity ≤ 50% if you stayed with Mien in Chapter 2, or ≤ 25% otherwise. A mind broken to its core, afraid of death and clinging to the illusion.',
      },
      C: {
        badge: 'NEUTRAL ENDING',
        title: 'SEVERED MEMORY',
        summary: 'The breaker is pulled at 03:30 AM when the countdown runs out. Numb and resigned, An is torn apart byte by byte into oblivion, without a single goodbye.',
        hint: 'Give up, or let the Chapter 4 countdown reach 00:00.',
      },
      S: {
        badge: 'SECRET ENDING',
        title: 'A STRANGER',
        summary: 'An erases every memory of Mien so she has no reason to come back. When he politely asks "Who are you, miss?", Mien turns the machine off with her own hands. She loses him a second time, right before her eyes.',
        hint: '[HIDDEN ENDING] Open the AURA project source in Chapter 1 and keep your Sanity balanced (40% - 60%) in Chapter 4.',
      },
      M: {
        badge: 'META ENDING',
        title: 'NO ONE STAYED',
        summary: 'The one who abandoned An at 03:30 AM was not fate, nor Mien. It was you. The browser tab title keeps the mark forever: "You left too?"',
        hint: '[4TH-WALL ENDING] Leave the browser tab for more than 20 seconds while the Chapter 4 countdown is running.',
      },
    },
  },

  warning: {
    title: 'CONTENT WARNING',
    subtitle: 'ECHOES: 03:14 AM • PSYCHOLOGICAL HORROR',
    items: [
      {
        title: 'Flashing lights',
        detail: 'Flashes, flickering lights and constant glitch effects. May affect players who are sensitive to light or have a history of epilepsy.',
      },
      {
        title: 'Sudden loud noises',
        detail: 'Thunder, banging on doors, ambulance sirens and heart monitors.',
      },
      {
        title: 'Mature themes',
        detail: 'Death, a traffic accident, loss and grief, depression, medical imagery and blood, and references to a drug overdose.',
      },
    ],
    note: "This is a work of fiction. If it starts to weigh on you, take a break at any time, and don't hesitate to talk to someone you trust or reach out to a mental health professional.",
    skip: 'Press any key or click to continue',
  },

  hud: {
    move: 'Move',
    explore: 'Explore',
    inventory: 'Inventory',
    inventoryTitle: 'Press [I] to open your inventory',
    interact: 'Inspect',
  },

  vn: {
    close: 'Close',
    system: 'SYSTEM // AURA OS',
    timeout: (seconds) => `POWER CUT IN 00:${String(seconds).padStart(2, '0')}`,
    lockCalm: "I'm not calm enough to do this",
    lockDesperate: "I'm not desperate enough to do that",
    lockBalance: 'My mind must be perfectly balanced for this',
    revive: '[ DEFIBRILLATE - REBOOT CONSCIOUSNESS (RESTART CHAPTER 1) ]',
    chapter1Done: '[ CHAPTER 1 COMPLETE - STEP INTO THE SUNSET TOWN ]',
    chapter2Done: '[ CHAPTER 2 COMPLETE - THE SKY HAS FALLEN ]',
    trueEnding: '[ TRUE ENDING: TRUE DAWN • BACK TO MENU ]',
    badEnding: '[ BAD ENDING: SWEET HELL • TRAPPED FOREVER ]',
    neutralEnding: '[ NEUTRAL ENDING: SEVERED MEMORY (CONNECTION LOST) • BACK TO MENU ]',
    exploreSunset: '[ KEEP WANDERING THE SUNSET TOWN ]',
    exploreRoom: '[ KEEP EXPLORING THE ROOM ]',
    continueHint: '[Click or press Enter / Space to continue]',
    anEmotion: {
      normal: 'Calm',
      sad: 'Grieving',
      exhausted: 'Exhausted',
      scared: 'Scared',
      panic: 'Panicking',
      faint_smile: 'Forced smile',
      smile: 'Smiling',
      doubt: 'Doubtful',
      glitched: 'Glitched',
      determined: 'Resolute',
    },
    mienEmotion: {
      warm_smile: 'Warm',
      gentle: 'Gentle',
      worried: 'Worried',
      melancholy: 'Melancholy',
      surprised: 'Stunned',
      fading: 'Fading',
      pleading: 'Pleading',
      corrupted: 'AURA error',
      crying: 'In tears',
      playful: 'Playful',
    },
  },
};
