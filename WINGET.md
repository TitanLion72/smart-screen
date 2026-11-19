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

> **Token tuzağı (yaşandı):** fine-grained PAT ile `wingetcreate submit`
> `Resource not accessible by personal access token` (403) verir — fine-grained
> token'lar sahibi olmadığın **public** repolara yazamaz. Gerekli olan classic
> token'da `public_repo` yetkisidir (`gh auth refresh -s public_repo`). Alternatif:
> fork dalını hazırlayıp PR'ı web'den açmak —
> `https://github.com/microsoft/winget-pkgs/compare/master...<kullanıcı>:<dal>?expand=1`.
> Ayrıca Microsoft CLA'sını PR sahibi hesabın imzalaması gerekir.

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
