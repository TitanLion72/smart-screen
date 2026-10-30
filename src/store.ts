// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
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
/** Ücretsiz sürümde profil üst sınırı (Pro kapısı): mevcut kayıtlar silinmez. */
export const FREE_MAX_PROFILES = 3;

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

/**
 * v2.4 (inceleme #6): bozuk `ss:profiles` (dizi olmayan JSON) modül yüklenirken
 * `raw.map` üzerinden throw ediyor ve pencereyi düşürüyordu — safeRender bunu
 * kapsamıyor çünkü hata import aşamasında. Dizi değilse boş listeye düş.
 */
function readJsonArray<T>(key: string, fallback: T[]): T[] {
  const raw = readJson<unknown>(key, fallback);
  return Array.isArray(raw) ? (raw as T[]) : fallback;
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

/**
 * Hazır profiller. Temalar **kendi** (`ss-*`) ailemizden seçilir: bağlı profil
 * ön plana gelince tema değişiyor, bu yüzden tohumun eski bir yerleşik tema
 * (`catppuccin-*`, `vesper`) olması v3.0'ın "otomatik yol yalnız `ss-*`"
 * kuralıyla çelişip terminal açıldığında beklenmedik renk sıçraması yaratıyordu.
 */
export function seedProfiles(): Profile[] {
  return [
    {
      id: newId(),
      name: "İş",
      mode: "auto",
      source: "auto",
      theme: "ss-dusk",
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
      theme: "ss-night",
      themeMode: "dark",
      offset: -10,
      // duzeltme v2.2 (madde 13): tohumda autoLock kapalı — öntanımlı olarak
      // kilit atmasın, isteyen profilden açar.
      autoLock: false,
      apps: [],
    },
  ];
}

/** Eski kayitlarda `apps` alanı olmayabilir; normalize eder. */
const VALID_MODES = new Set(["auto", "time", "light", "fixed"]);
const VALID_SOURCES = new Set(["auto", "day", "warm", "cool", "night"]);

function normalize(p: any): Profile | null {
  if (!p || typeof p !== "object") return null;
  if (typeof p.id !== "string" || typeof p.name !== "string" || p.name.trim() === "") return null;
  const mode: Mode = VALID_MODES.has(p.mode) ? p.mode : "auto";
  const source: Source = VALID_SOURCES.has(p.source) ? p.source : "auto";
  const theme = typeof p.theme === "string" && p.theme.length > 0 ? p.theme : "catppuccin-macchiato";
  const themeMode = typeof p.themeMode === "string" && p.themeMode.length > 0 ? p.themeMode : "dark";
  const offset = typeof p.offset === "number" && Number.isFinite(p.offset) ? Math.max(-20, Math.min(20, Math.round(p.offset))) : 0;
  const autoLock = p.autoLock === true;
  const apps = Array.isArray(p.apps) ? p.apps.filter((x: any) => typeof x === "string" && x.length > 0).map((x: any) => x.toLowerCase()) : [];
  return { id: p.id, name: p.name.trim(), mode, source, theme, themeMode, offset, autoLock, apps };
}

export function loadProfiles(): Profile[] {
  const raw = readJsonArray<any>(KEY_PROFILES, []);
  const list = raw.map(normalize).filter((p): p is Profile => p !== null);
  return list.length > 0 ? list : seedProfiles();
}

/**
 * Eksik tohum profilleri geri yükler **ve** tohum adını taşıyan bir profilin
 * uygulama listesi boşsa varsayılan listeyi geri koyar. Var olan profilin
 * adı/mod/tema/ayarı EZİLMEZ — yalnız boş `apps` doldurulur.
 *
 * Neden: "kazayla uygulama listesini sildim" durumunda eski davranış hiçbir şey
 * yapmıyordu (profil zaten vardı), kullanıcı listeyi elle yeniden yazmak
 * zorundaydı. Boş liste ile "hiç bağlama istemiyorum" ayırt edilemediği için
 * geri getirme **yalnız açık düğme tıklamasında** çalışır, kendiliğinden değil.
 */
export function restoreSeedProfiles(profiles: Profile[]): {
  profiles: Profile[];
  added: number;
  appsRestored: number;
} {
  const next = profiles.map((p) => ({ ...p, apps: [...(p.apps ?? [])] }));
  let added = 0;
  let appsRestored = 0;
  for (const seed of seedProfiles()) {
    // Ayni isimde profil varsa dokunma; yalnız boş uygulama listesini doldur.
    const existing = next.find((p) => p.name === seed.name);
    if (existing) {
      if (existing.apps.length === 0 && seed.apps.length > 0) {
        existing.apps = [...seed.apps];
        appsRestored += 1;
      }
      continue;
    }
    if (next.length >= MAX_PROFILES) break;
    next.push(seed);
    added += 1;
  }
  return { profiles: next, added, appsRestored };
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