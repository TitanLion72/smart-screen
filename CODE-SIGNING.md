# Kod imzalama (Authenticode) — durum, seçenekler, akış

> **Bugünkü durum: kurulum dosyaları imzasız.** SmartScreen "bilinmeyen yayıncı"
> uyarır; kullanıcı *Ek bilgi → Yine de çalıştır* der. Bu sayfa imzayı **nasıl**
> ekleyeceğimizi ve öncesinde/sonrasında ne doğrulandığını anlatır. Karar
> verilmeden hiçbir adım uygulanmış sayılmaz — aşağıdaki tablo seçeneklerin
> gerçek (Ekim 2026) koşullarını listeler.

## İki ayrı imza var, karıştırılmasın

| İmza | Ne korur | Durum |
|---|---|---|
| **Tauri updater (minisign)** — `*.sig` + `latest.json` | Güncelleme paketinin bizden çıktığını; kurulumdan **önce** uygulama içinde doğrulanır | ✅ Var, her release'te üretiliyor |
| **Authenticode** — `signtool` | Dosyanın yayıncısını ve kurulumdan sonra değiştirilmediğini; Windows/SmartScreen kararı | ❌ Yok |

Yani "otomatik güncelleme imzalı, kurulum dosyası imzasız" ifadesi çelişki değil:
birincisi uygulama içi zincir, ikincisi işletim sisteminin tanıdığı yayıncı kimliği.

## Seçenekler (doğrulanmış, 2026-10)

| Seçenek | Maliyet | Yayıncı adı | Türkiye'den uygun mu | Not |
|---|---|---|---|---|
| **SignPath Foundation** | Ücretsiz | `SignPath Foundation` | ✅ (başvuru) | Açık kaynak projelere OV seviyesinde sertifika; anahtar onların HSM'inde. Koşullar: OSI lisansı, **proprietary bileşen yok**, ticari çift lisanslama yok, aktif herkese açık repo, sitede "Code signing policy" bölümü. Ücretli Pro özellikleri aynı açık kaynak kodun içinde (ayrı proprietary modül yok) — yine de inceleme ekibi freemium modeli sorgulayabilir. |
| **Certum Open Source Code Signing** | €49'dan (yıllık, KDV hariç) | `Open Source Developer <ad>` | ✅ | Bulut imzalama (SimplySign, donanım token gerekmez), 5000 imza/ay, SmartScreen itibarı **zamanla** oluşur. Bugün mağazada "out of stock" görünüyor — stok/teslim tarihi satıcıya sorulmalı. |
| **Azure Artifact Signing** (eski Trusted Signing) | $9.99/ay | kendi tüzel kişiliğin | ❌ | Kuruluşlar yalnız ABD/Kanada/AB/Birleşik Krallık; bireysel geliştiriciler yalnız ABD/Kanada. Türkiye kapsam dışı. |
| **Microsoft Store (MSIX)** | Ücretsiz | kendi mağaza kimliği | ⚠️ | Store paketi yeniden imzalar, uyarı çıkmaz — ama dağıtım tamamen Store'a taşınır (NSIS + kendi updater'ımız devre dışı). Ürün stratejisi kararı, imza işi değil. |
| **Authenticode'suz devam** | 0 | — | — | Kurulumun bir kısmı SmartScreen'de kaybedilir; kurumsal filtreler imzasız exe'yi tamamen bloklayabilir. |

**Öneri:** SignPath Foundation'a başvur (bedava, yayıncı adı proje değil vakıf),
paralel olarak Certum'a stok/fiyat sor. İkisi de olmazsa Certum ücretli yol zaten
tek makul seçenek; Azure bu bölgeden kullanılamıyor.

## Sertifika elimizdeyken akış (hazır)

İki araç eklendi, ikisi de sıfır bağımlılık:

```powershell
# 1) Derle
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\smart-screen-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<şifre>"
npm.cmd run tauri build

# 2) İmzala + doğrula (PFX yolu)
npm.cmd run sign -- --pfx C:\sertifika.pfx --password "<şifre>"

#    ya da sertifika Windows deposundaysa (SimplySign / HSM / token)
npm.cmd run sign -- --thumbprint <SHA1>

# 3) Yalnız doğrula (release öncesi kapı)
npm.cmd run verify:signature -- "src-tauri\target\release\bundle\nsis\smart-screen_3.0.0_x64-setup.exe"
```

- `tools/sign-artifacts.mjs` — varsayılan olarak NSIS setup, MSI ve
  `target/release/smart-screen.exe` dosyalarını imzalar; RFC3161 zaman damgası
  **zorunlu** (yoksa sertifika dolunca imza geçersizleşir). Sertifika verilmezse
  hiçbir şey yapmaz ve hata verir (sessizce imzasız release'e izin vermez).
- `tools/verify-signature.mjs` — `Get-AuthenticodeSignature` ile durum, imzalayan,
  zaman damgası okur; `--expect TitanLion72` ile yayıncı adını da denetler.
  İmzasız/doğrulanamayan dosyada sıfırdan farklı çıkar.
- Kendinden imzalı sertifikayla uçtan uca denendi: imzasız → `NotSigned` (FAIL),
  imzalı → yayıncı + zaman damgası görüldü, `--allow-untrusted` yalnız testte.
  Test sertifikası makineden silindi; repoda sertifika/anahtar yok (`*.pfx`, `*.key` ignore).

## İmzadan sonra ne değişir, ne değişmez

- **Değişir:** Dosya özelliklerinde yayıncı görünür; SmartScreen "bilinmeyen yayıncı"
  yerine yayıncı adını gösterir. Kurumsal uygulama denetimi (AppLocker/WDAC)
  imzalı dosyaya kural yazabilir.
- **Değişmez (hemen):** SmartScreen itibarı bir gecede oluşmaz — yeni imza da bir süre
  "az bilinen yayıncı" uyarısı verebilir; indirme sayısı/yaş ile düzelir.
- **Değişmez:** Uygulama içi güncelleme zinciri aynı kalır (minisign `.sig`).

## Güvenlik kuralları (pazarlık yok)

1. Sertifika dosyası (`.pfx`) ve şifresi **repoya girmez** (`.gitignore`: `*.pfx`, `*.key`, `*.pem`).
2. PFX'i diskte tutmak zorunluysa şifreli ve ayrı bir yerde; ideal olarak HSM/token.
3. İmza anahtarı kaybolursa/yenilenirse **SmartScreen itibarı sıfırdan başlar** — aynı
   sertifikayla devam etmek ticari olarak önemli.
4. Her release'te `npm.cmd run verify:signature` çalıştırılmadan yayın açılmaz.
5. Zaman damgası olmayan imza release'e konmaz (araç bunu uyarı olarak söyler).

## SignPath başvurusu yapılırsa eklenecek bölüm

SignPath koşulları, proje ana sayfasında ve indirme sayfasında **"Code signing
policy"** başlığı ister; şu üç bilgiyi içermeli:

- "Free code signing provided by SignPath.io, certificate by SignPath Foundation"
- Ekip rolleri ve kişiler (geliştirici, onaylayan, imza isteyen)
- Yalnız kendi kaynağımızdan üretilen dosyaların imzalandığı, imza anahtarının
  bizde olmadığı (HSM) ve sürümlerin bu depodan üretildiği

Bu bölüm, başvuru kabul edilmeden yazılmaz: olmayan bir imzalama ilişkisini
varmış gibi göstermek yanlış olur.
