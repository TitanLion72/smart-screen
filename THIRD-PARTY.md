# Üçüncü taraf bileşenler

Bu uygulama şu üçüncü taraf bileşenleri kullanır. Her bileşen kendi lisansı
altındadır; Smart-screen'in kendi kaynak kodu GPL-3.0-or-later'dır.

Aşağıda yalnız **doğrudan** bağımlılıklar tek tek yazılı. Geçişli (transitive)
paketler tek tek listelenmez; sayıları her tablonun altında. Listeler
`cargo metadata --format-version 1` (`src-tauri/`) ve `npm.cmd ls --all --json`
(proje kökü) çıktısından çıkarıldı — elle yazılmadı.

## Rust (cargo)

Doğrudan bağımlılıklar `src-tauri/Cargo.toml`'dan gelir.

| Bileşen | Sürüm | Lisans | Kaynak (URL) |
|---|---|---|---|
| chrono | 0.4.45 | MIT OR Apache-2.0 | https://crates.io/crates/chrono |
| ed25519-dalek | 2.2.0 | BSD-3-Clause | https://crates.io/crates/ed25519-dalek |
| nokhwa | 0.10.11 | Apache-2.0 | https://crates.io/crates/nokhwa |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://crates.io/crates/serde |
| serde_json | 1.0.151 | MIT OR Apache-2.0 | https://crates.io/crates/serde_json |
| tauri | 2.12.1 | Apache-2.0 OR MIT | https://crates.io/crates/tauri |
| tauri-build | 2.7.1 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-build |
| tauri-plugin-dialog | 2.8.4 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-dialog |
| tauri-plugin-notification | 2.5.1 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-notification |
| tauri-plugin-opener | 2.7.0 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-opener |
| tauri-plugin-process | 2.4.0 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-process |
| tauri-plugin-single-instance | 2.5.4 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-single-instance |
| tauri-plugin-updater | 2.14.1 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-updater |
| tauri-plugin-window-state | 2.5.0 | Apache-2.0 OR MIT | https://crates.io/crates/tauri-plugin-window-state |
| windows | 0.62.2 | MIT OR Apache-2.0 | https://crates.io/crates/windows |

Geçişli: 560 paket (`cargo metadata` toplam 575 paket çözümlüyor; biri bu
uygulama, 15'i doğrudan). Bunların hepsi MIT / Apache-2.0 / BSD / ISC / Zlib /
Unicode-3.0 gibi izin verici lisanslardadır; GPL-3.0 ile uyumludur.

## JavaScript (npm)

Yalnız çalışma zamanında kullanılan (production) bağımlılıklar.

| Bileşen | Sürüm | Lisans | Kaynak (URL) |
|---|---|---|---|
| @tauri-apps/api | 2.12.1 | Apache-2.0 OR MIT | https://www.npmjs.com/package/@tauri-apps/api |
| @tauri-apps/plugin-notification | 2.5.1 | MIT OR Apache-2.0 | https://www.npmjs.com/package/@tauri-apps/plugin-notification |
| @tauri-apps/plugin-opener | 2.7.0 | MIT OR Apache-2.0 | https://www.npmjs.com/package/@tauri-apps/plugin-opener |
| @tauri-apps/plugin-process | 2.4.0 | MIT OR Apache-2.0 | https://www.npmjs.com/package/@tauri-apps/plugin-process |
| @tauri-apps/plugin-updater | 2.14.0 | MIT OR Apache-2.0 | https://www.npmjs.com/package/@tauri-apps/plugin-updater |

Geçişli: 15 paket (ağaçta toplam 23 paket var; 8'i doğrudan).

**Geliştirme bağımlılıkları** (uygulamayla dağıtılmaz, yalnız derleme/test
için): `@tauri-apps/cli` 2.12.1 (Apache-2.0 OR MIT), `typescript` 6.0.3
(Apache-2.0), `vite` 8.3.5 (MIT). Kaynak adresleri sırasıyla
https://www.npmjs.com/package/@tauri-apps/cli ·
https://www.npmjs.com/package/typescript · https://www.npmjs.com/package/vite

## Lisans dosyaları

Her MIT / Apache-2.0 / BSD bileşenin tam lisans metni, yukarıdaki kaynak
sayfasında ("License" / "Repository" bağlantısı) ya da paketin kendi içinde
(`node_modules/<paket>/LICENSE`, `~/.cargo/registry/src/**/<paket>-<sürüm>/LICENSE*`)
bulunur. Tablodaki "MIT OR Apache-2.0" gibi çift lisanslar, bileşenin iki
lisans arasında seçim hakkı tanıdığı anlamına gelir; bu proje Apache-2.0'ı
tercih eder.

**GPL uyumu:** Bu bileşenlerin hiçbiri GPL-3.0 ile çelişmez (hepsi izin
verici lisanslı; copyleft yok). Uygulamanın tam kaynak kodu, yayınlanan her
sürümün etiketinde:
`https://github.com/TitanLion72/smart-screen/tree/v<sürüm>` — GPLv3 §6(d)
koşulunu karşılar.

### Doğrulanması gerekenler

Yok — `cargo metadata` ve `npm ls` çıktısındaki tüm doğrudan bileşenlerin
`license` alanı doluydu; belirsiz (`null`/`UNKNOWN`) bileşen çıkmadı.

Son doğrulama: 2026-11-02
