# Güvenlik Politikası

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

Repoda hiçbir özel anahtar/token bulunmaz (`*.pem`, `*.key` `.gitignore`'da).
Güncelleme imza anahtarı ve lisans özel anahtarı yalnız geliştiricinin makinesinde
ve CI secret'larında tutulur.
