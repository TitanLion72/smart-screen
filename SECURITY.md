# Güvenlik Politikası

Bu depo **herkese açıktır**. Aşağıdaki kurallar tavsiye değil, **kapıdır**:
`tools/security-check.mjs` her commit öncesi ve CI'da bunları denetler; ihlal
varsa birleştirme yapılmaz.

## Zorunlu kurallar (CI kapısı)

| # | Kural | Neden |
|---|---|---|
| S1 | **Sır yasak.** Özel anahtar, token, parola, API anahtarı koda gömülemez. | Depo public; bir kez push edilen sır kalıcıdır. |
| S2 | **Kimlik dosyası yasak.** `.pem`/`.key`/`.env`/`.p12` izlenmez. | Anahtar repoda = ürünün güncelleme zinciri çökebilir. |
| S3 | **Kabuk argümanı birleştirme yasak.** `Command::new("powershell").arg(format!("…{}", x))` kullanılmaz; kullanıcı girdisi daima ayrı `arg()` geçer. | Komut enjeksiyonu (RCE). |
| S4 | **Yol geçişi koruması zorunlu.** `req.url` okuyan her sunucu `resolve` + kök içinde kalma kontrolü yapar. | `../../` ile kök dışı dosya okuma. |
| S5 | **Sıkı CSP.** Üretimde `unsafe-eval`, joker kaynak, `localhost:1420` bulunamaz; `object-src`/`base-uri`/`frame-ancestors` zorunlu. | WebView XSS yüzeyi. |
| S6 | **En az yetki.** Capability'lerde joker pencere/URL yok; `opener` yalnız allowlist. | Yetki aşımı. |
| S7 | **Bağımlılık temizliği.** `cargo audit` ve `npm audit --audit-level=high` temiz olmalı. | Bilinen CVE. |

Çalıştır:

```powershell
npm.cmd run check:security         # hızlı (S1-S6)
npm.cmd run check:security:deps    # + bağımlılık denetimi (S7)
npm.cmd run test:security          # kapının kendi testi (yakalıyor mu?)
```

## Commit öncesi refleks

1. Yeni bir dosya eklerken **sır var mı** diye bak (`check:security` bunu yapar).
2. Kullanıcı girdisi komuta/sorguya/yola gidiyorsa **ayrı parametre** olarak geçir.
3. Yeni bir Tauri izni eklerken **daralt**: pencere adı ver, URL şeması ver.
4. `cargo update` / `npm update` sonrası **`check:security:deps`** koş.
5. Force-push ile "geçmişi temizledim" demek **çözüm değildir** — sır sızdıysa
   anahtar **döndürülür** (rotate).

## Desteklenen sürümler

Yalnız **en son yayınlanan sürüm** güvenlik düzeltmesi alır. Eski sürümler için
yama çıkarılmaz; otomatik güncelleme en son sürüme taşır.

## Açık bildirimi

Lütfen **herkese açık issue açmayın**. Bunun yerine:

1. GitHub'da **Security → Report a vulnerability** (özel bildirim) yolunu kullan:
   https://github.com/TitanLion72/smart-screen/security/advisories/new
2. Mümkünse şunları ekle: sürüm, yeniden üretme adımları, etki, varsa öneri.

Gizli bildirim kapalıysa depo sahibine GitHub profili üzerinden ulaş ve konuyu
"güvenlik" olarak işaretle — ayrıntıyı ilk mesaja dökme.

**Yanıt hedefi:** 7 gün içinde ilk değerlendirme. Düzeltme süresi etkiye göre
değişir; kritik bulguda hızlandırılmış yama + yeni sürüm yayınlanır.

## Kapsam

İlgilenilen alanlar:

- Lisans doğrulama (`license.rs`) — anahtar taklidi, imza atlatma
- Otomatik güncelleme (`tauri-plugin-updater`) — imza doğrulama, `latest.json`
  ele geçirilmesi, sürüm düşürme
- Komut yüzeyi (`src-tauri/src/lib.rs`) — yetkisiz dosya/ayar yazımı, PowerShell
  komut enjeksiyonu
- WebView güvenliği — CSP atlatma, capability aşımı
- Ayrıcalık yükseltme — kurulum/tray/otostart yolları

## Kapsam dışı (bilinerek kabul edilenler)

- **Lisans kapısının istemci tarafında kırılabilir olması.** Pro kontrolü çevrimdışı
  doğrulanır ve kaynak kod açıktır; kapıyı kaldıran fork'lar mümkündür. Bu bir
  güvenlik açığı olarak değerlendirilmez — iş modeli buna dayanmıyor.
- **Kurulum dosyasının Authenticode imzalı olmaması.** SmartScreen uyarısı beklenen
  davranıştır; `.sha256` ile bütünlük doğrulanabilir. Güncelleme paketleri ayrıca
  minisign ile imzalıdır.
- Üçüncü taraf tema dosyalarının (`~/.config/opencode/themes`) kendi içerikleri.

## Sırlar

Repoda hiçbir özel anahtar/token bulunmaz (`*.pem`, `*.key`, `.env*` `.gitignore`'da).
Güncelleme imza anahtarı ve lisans özel anahtarı yalnız geliştiricinin makinesinde
ve CI secret'larında tutulur.

**Sır sızarsa yapılacaklar (sırayla):**

1. Anahtarı **hemen döndür** (yeni anahtar üret, eskiyi geçersiz kıl).
2. Etkilenen yayınları işaretle; güncelleme imzası sızdıysa **acil sürüm** çıkar.
3. `git filter-repo` ile geçmişten temizle (döndürme sonrası, tek başına yeterli değil).
4. Kullanıcıları bilgilendir (release notu + güvenlik duyurusu).
