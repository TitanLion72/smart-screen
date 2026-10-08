/** Local persistence for panel preferences and user-defined profiles. */

import type { Mode, Source } from "./catalog";

export interface Profile {
  id: string;
  name: string;
  mode: Mode;
  source: Source;
  theme: string;
  themeMode: string;
  offset: number;
  autoLock: boolean;
  /** Ön plandaki bu exe'ler gelince bu profil devralır (örn. "vlc.exe"). */
  apps: string[];
}

export const MAX_PROFILES = 6;

const KEY_PROFILES = "ss:profiles";

export function getSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem("ss:" + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: string): void {
  try {
    localStorage.setItem("ss:" + key, value);
  } catch {
    /* storage unavailable: preferences stay in-memory */
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export function seedProfiles(): Profile[] {
  return [
    {
      id: newId(),
      name: "İş",
      mode: "auto",
      source: "auto",
      theme: "catppuccin-macchiato",
      themeMode: "dark",
      offset: 0,
      autoLock: false,
      // Engelli listede olmayan iş uygulamaları: ön plana gelince bu profil devralır.
      apps: ["code.exe", "windowsterminal.exe", "wezterm-gui.exe"],
    },
    {
      id: newId(),
      name: "Film",
      mode: "fixed",
      source: "night",
      theme: "vesper",
      themeMode: "dark",
      offset: -10,
      autoLock: true,
      apps: [],
    },
  ];
}

/** Eski kayitlarda `apps` alanı olmayabilir; normalize eder. */
function normalize(p: Profile): Profile {
  return { ...p, apps: Array.isArray(p.apps) ? p.apps : [] };
}

export function loadProfiles(): Profile[] {
  const list = readJson<Profile[]>(KEY_PROFILES, []).map(normalize);
  return list.length > 0 ? list : seedProfiles();
}

export function saveProfiles(profiles: Profile[]): void {
  writeJson(KEY_PROFILES, profiles);
}

export function loadActiveId(): string {
  return getSetting("activeProfile", "");
}

export function saveActiveId(id: string): void {
  setSetting("activeProfile", id);
}

export function upsertProfile(profiles: Profile[], profile: Profile): Profile[] {
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx < 0) {
    return profiles.length >= MAX_PROFILES ? profiles : [...profiles, profile];
  }
  const next = profiles.slice();
  next[idx] = profile;
  return next;
}

export function duplicateProfile(profile: Profile): Profile {
  return { ...profile, id: newId(), name: profile.name + " kopya" };
}

export function createProfile(name: string): Profile {
  return {
    id: newId(),
    name,
    mode: "auto",
    source: "auto",
    theme: "catppuccin-macchiato",
    themeMode: "dark",
    offset: 0,
    autoLock: false,
    apps: [],
  };
}