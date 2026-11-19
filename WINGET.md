# winget yayını

winget (Windows Package Manager) **ücretsiz** bir dağıtım kanalıdır: kullanıcı
`winget install TitanLion72.smart-screen` yazar, kurulum GitHub release'inden
indirilir. Microsoft imzası/Store hesabı gerekmez.

## Paket kimliği

| Alan | Değer |
|---|---|
| PackageIdentifier | `TitanLion72.smart-screen` |
| InstallerType | `nullsoft` (Tauri'nin NSIS kurulumu) |
| Scope | `user` (kurulum `%LOCALAPPDATA%` altına yazar) |
| Sessiz kurulum | `/S` |
| Mimari | `x64` |

## Manifest üretimi

Manifestler **elle yazılmaz**; yayın çıktısından üretilir (SHA256 dosyadan
hesaplanır, sürüm `tauri.conf.json` ile karşılaştırılır):

```powershell
npm.cmd run tauri build          # önce derleme
node tools/winget-manifest.mjs --version 3.6.0
```

Çıktı: `winget/manifests/t/TitanLion72/smart-screen/<sürüm>/` altında üç YAML
(version + installer + locale). Araç sürüm uyuşmazlığında **yazmaz**.

Doğrulama (winget kurulu makinede):

```powershell
winget validate --manifest winget\manifests\t\TitanLion72\smart-screen\3.6.0
```

`winget validate` PASS değilse PR gönderilmez.

## İlk gönderim

1. GitHub release **yayınlanmış** olmalı (installer URL canlı).
2. `wingetcreate submit winget\manifests\t\TitanLion72\smart-screen\3.6.0`
   (wingetcreate fork açar, dalı iter ve PR oluşturur).
3. PR'da CI manifestleri yeniden doğrular (`winget-pkgs` doğrulayıcıları).

> **Dürüst not:** PR'ın birleşmesi **bizim kontrolümüzde değil**. winget-pkgs
> bakımcıları inceler; birkaç gün sürebilir, değişiklik isteyebilir.
> "Yayınladım" demek için birleşmiş PR'ı görmek gerekir.

## Sonraki sürümler

Aynı akış: yeni sürüm yayınla → `node tools/winget-manifest.mjs --version X` →
`winget validate` → `wingetcreate submit`. Eski manifest klasörü silinmez
(winget sürüm geçmişini oradan okur).

## Bilinen sınırlar

- **Kod imzası yok** → winget kurulumu çalışır ama SmartScreen yine "bilinmeyen
  yayıncı" uyarabilir. Manifest imza gerektirmez; SmartScreen ayrı konu
  (`CODE-SIGNING.md`).
- winget yalnız SHA256 doğrular; güncelleme akışı Tauri updater'ından bağımsızdır
  (kullanıcı hangisini kullanırsa o).
- Store (MSIX) ayrı kanal; bu belge onu kapsamaz.
