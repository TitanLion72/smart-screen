# Rekabet analizi ve eksik belirleme — v3.6 planı

Tarih: 19 Kasım 2026 · Yöntem: 5 paralel web araştırması + GitHub API teyidi
(her sürüm/tarih iddiası `api.github.com` ile ayrıca doğrulandı).

---

## 1. Pazar iki ayrı kategoriye bölünmüş — ve kimse ikisini birleştirmiyor

| Kategori | Ürünler | Ne yapıyor | Ne yapmıyor |
|---|---|---|---|
| **A. Işık / renk sıcaklığı** | f.lux 4.150, Iris 1.2.x, CareUEyes 2.7.2.0, Redshift (arşiv), LightBulb 2.7.3, Windows Night Light | Gamma ile ekranı sarartma, zamanlama | **Donanım parlaklığı yok** (LightBulb dahil), monitör başına kontrol yok, tema yok |
| **B. Parlaklık / monitör** | Twinkle Tray 1.17.2, Monitorian 4.16.11, ClickMonitorDDC, DisplayFusion 12.1.1, DisplayMagician (ölü) | DDC/CI parlaklık, monitör profili | **Renk sıcaklığı çoğunda yok**, ortam ışığı yok, tema yok |

**Bizim konumumuz:** ikisinin kesişimi + üçüncü eksen (tema yazma). Bu gerçek bir
boşluk — pazarlama cümlesi değil, aşağıdaki tabloda görünüyor.

### Yetenek matrisi

| Yetenek | smart-screen | Twinkle Tray | Monitorian | CareUEyes | f.lux | LightBulb | DisplayFusion |
|---|---|---|---|---|---|---|---|
| DDC/CI donanım parlaklığı | ✅ (Pro) | ✅ | ✅ | ❌ (yazılım dim) | ❌ | ❌ | kısmi |
| Dahili panel parlaklığı (WMI) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Monitör **başına** ayrı kontrol | ✅ | ✅ | ✅ (max 4) | ✅ | ❌ | ✅ | ✅ |
| Renk sıcaklığı / sarılık | ✅ | ❌ | ✅ (preset K) | ✅ | ✅ | ✅ | ❌ |
| Renk sıcaklığı **monitör başına** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Kamera ile ortam ışığı** | ✅ | beta sensör | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Editör/uygulama teması yazma** | ✅ (9 adaptör) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Uygulamaya bağlı profil | ✅ (Pro) | ❌ | ❌ | ✅ (kural) | ❌ | ❌ | pencere profili |
| Oyun/video dondurma | ✅ | ❌ | ❌ | ✅ (pause mode) | ❌ | ❌ | ✅ |
| Boşta parlaklık düşürme | ✅ (v3.5) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 20-20-20 mola | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Kontrast/WCAG denetimi | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fiyat | (belirlenmemiş) | ücretsiz | ücretsiz + eklenti | $24.90 ömürlük | ücretsiz | ücretsiz (MIT) | $34 ömürlük |

### Fiyat çıpası

- Iris: **$15** tek seferlik (doğrulandı, iristech.co)
- CareUEyes: **$24.90** ömürlük · $19.90/yıl · $2.90/ay (doğrulandı)
- DisplayFusion: **$34** Pro ömürlük
- Twinkle Tray / Monitorian / LightBulb: ücretsiz

→ Ödeme yapan müşterinin zihninde üst sınır **~35 dolar**. Üstüne çıkmak için
"utility" değil "sistem" satmak gerekir.

---

## 2. Rakiplerin gerçek durumu (GitHub API ile teyitli, 19.11.2026)

| Ürün | Son stable | Tarih | Açık issue | Yorum |
|---|---|---|---|---|
| Twinkle Tray | v1.17.2 | 2025-12-25 | **615** | **11 aydır stable sürüm yok.** En popüler DDC aracı bakımda geride |
| Monitorian | 4.16.11 | 2026-11-08 | 11 | Aktif, disiplinli |
| LightBulb | 2.7.3 | 2026-11-06 | 5 | Aktif, küçük kapsam |
| DisplayMagician | v2.7.2 | 2024-10-19 | 11 | **2 yıldır ölü** |
| f.lux | 4.150 | (forum, aktif) | — | Kod canlı, **web sitesi 2020'den beri güncellenmemiş** |
| Iris | 1.2.x | 2022-11-30 | — | Satışta ama changelog ölü |
| SunsetScreen | — | — | — | **Domain satılık** — ürün ölü |

**Çıkarım:** kategori "ölü atlar ve yarı bakımlı devler"den oluşuyor.
Twinkle Tray'in 615 açık issue'su bizim için hem uyarı hem fırsat: DDC/CI
kırılganlığı çözülmemiş bir problem, çözen kazanır.

---

## 3. Kullanıcıların açık yaraları — 10 kanıtlı şikâyet

Hepsi GitHub issue, birebir alıntı + tarih. Bunlar rakiplerin **çözemediği** işler.

| # | Şikâyet | Kanıt | Bizde durum |
|---|---|---|---|
| 1 | **HDR açıkken parlaklık kontrolü ölüyor** | twinkle-tray#97 (2020-10-22, 90 yorum), Monitorian#411/#756 (2026-06-07) hâlâ açık | ⚠️ Sarılığı HDR'da kapatıyoruz; **parlaklık yazımı HDR'da test edilmedi** |
| 2 | DDC/CI monitör rastgele "görünmüyor" | twinkle-tray#1187 (2026-01-21), 342 açık issue | ✅ Okuma/enumerasyon sağlam; **yeniden deneme/geri kazanma yok** |
| 3 | **Uykudan sonra monitör %100'e dönüyor** | Monitorian#115 (2021-01-04) açık | ❌ **Güç olayı dinlenmiyor** (aşağıda §4) |
| 4 | Dahili panel Win11'de tanınmıyor | Monitorian#316 (2022), #692 (2025) | ✅ WMI ile okuyoruz |
| 5 | Monitör başına parlaklık + **fare tekerleği** kısayolu | twinkle-tray#35 (2020), PowerToys#20405 | ❌ Tepsi yalnız sol tık dinliyor |
| 6 | **Harici monitör için ortam ışığına göre otomatik parlaklık** — "kimse yapmıyor" | Monitorian#246 (2021-10-21) açık | ✅ **Kamera ile yapıyoruz — tek biz** |
| 7 | Renk sıcaklığı uyanınca sıfırlanıyor | LightBulb#102 (2019) açık | ⚠️ `gamma::recover()` yalnız **açılışta** çağrılıyor (lib.rs:809) |
| 8 | Ayarlar/Action Center açınca filtre kapanıyor | LightBulb#173 (2020) | ✅ Muhtemelen etkilenmiyor (gamma rampası kalıcı) — test edilmeli |
| 9 | Tam ekran oyunda filtre devre dışı / gamma sıfırlanıyor | LightBulb#150 (2020) | ✅ Oyun tespiti + dondurma var |
| 10 | Araç CPU yiyor, tam ekran uygulamayı minimize ediyor | twinkle-tray#493, #835 | ✅ Dakikada bir tur; **ölçülmedi** |

**En değerli üç satır: #3, #5, #1.** Üçü de "yeni özellik" değil, "ürün güvenilir
olsun" işi. Kullanıcı bunlar için para ödüyor.

---

## 4. Kendi kodumuzda doğruladığım somut eksikler

Bunlar araştırma iddiası değil, **dosyada gördüğüm gerçek**:

### E1 — Güç olayı (uyku/uyanma) hiç dinlenmiyor
```
src-tauri/Cargo.toml  → tauri-plugin-* listesinde power/session plugin YOK
src-tauri/src/*.rs    → WM_POWERBROADCAST / PBT_APMRESUMEAUTOMATIC geçmiyor
gamma.rs:326          → recover() var, ama lib.rs:809'da yalnız AÇILIŞTA çağrılıyor
```
Sonuç: kullanıcı dizüstünü kapatıp açtığında sürücü gamma rampasını sıfırlarsa
sarılık kaybolur ve **en fazla 60 saniye** geri gelmez. Parlaklık da aynı.
Rakiplerin 1 numaralı şikâyeti bu; bizde de var, sadece kimse bildirmedi.

### E2 — HDR açıkken parlaklık yazımı tanımsız
`monitor.rs` HDR bilgisini yalnız enumerasyonda (`hdr.rs` için) kullanıyor.
`brightness_set_monitor` HDR'da ne yapıyor — denenmemiş. Rakiplerin 90 yorumluk
issue'su tam burada.

### E3 — Tepsi fare tekerleği yok
`lib.rs:1027` yalnız `TrayIconEvent::Click { Left, Up }`. Twinkle Tray'in en çok
istenen özelliği (#35) parlaklığı tepsi üzerinde tekerlekle değiştirmek.

### E4 — DDC/CI hatasında geri kazanma yok
Monitör bir turda cevap vermezse (sürücü meşgul, uyku, kablo) o monitör
listeden düşüyor; geri gelmesi için yeniden enumerasyon gerekiyor mu, kaç turda
toparlıyor — belirsiz.

### E5 — "Kullanıcı döndü" davranışı boşta düşürmesinde ani
`idleDim` 600 sn'de −15, 1800'de −25 uyguluyor; dönüşte hedef **anında** geri
geliyor. 60 saniyelik turda bu "ekran bir anda parladı" olarak görülebilir.
Yumuşak dönüş (3-5 saniyede) daha iyi olur.

---

## 5. Windows 11'in bıraktığı boşluklar (teyitli)

| Konu | Windows ne yapıyor | Boşluk |
|---|---|---|
| Night Light | Sıcaklık + zamanlama UI'da var | **Programatik API yok** — topluluk registry blob'unu tersine mühendislikle çözüyor. Biz de yalnız okuyoruz |
| Adaptif parlaklık | Yalnız **ALS sensörlü** cihazlarda (laptop/Surface) | Masaüstünde hiç yok → kamera bizim avantajımız |
| Harici monitör parlaklığı | Hiç yok | DDC/CI'ye bırakılmış, kırılgan |
| HDR geçişi | SDR/HDR parlaklık kaydırıcıları var | HDR aç/kapa'da **sönme** bilinen sorun |
| CABC ("içeriğe göre parlaklık") | Kapatılabilir (24H2+) | Uygulamaya duyarlı değil, OLED'de şikâyet sürüyor |
| Enerji tasarrufu | 24H2+: pilde %30 parlaklık kırpması | Kaba, kullanıcıya görünmez |

---

## 6. Dağıtım gerçeği

| Kanal | Durum | Maliyet |
|---|---|---|
| **winget** | `wingetcreate` + `winget-pkgs` PR | **Ücretsiz** — hemen yapılabilir, en yüksek getiri/efor |
| **Microsoft Store (MSIX)** | Tauri Win32 → MSIX Desktop Bridge mümkün, **Microsoft kendisi imzalar** | Komisyon %15 (kendi ödeme altyapınla %0) |
| SmartScreen | İmzasız exe → "bilinmeyen yayıncı" uyarısı | — |
| Kod imzalama | SignPath OSS **ücretsiz**; Certum OSS $58 / Standard $249+; Azure Artifact Signing $9.99/ay (TR erişimi belirsiz) | $0–$249/yıl |

**Sıralama önerisi:** winget (bedava, bir gün) → SignPath/Certum → Store.

---

## 7. Eksik listesi — etki × efor

| Öncelik | İş | Neden | Efor |
|---|---|---|---|
| **P0** | **Güç olayı dinleme** (uyanınca parlaklık + gamma geri yükle) | Rakiplerin #1 şikâyeti; bizde de var; "bozuk hissi" buradan gelir | ~1 gün |
| **P0** | **HDR'da parlaklık davranışı** — test et, tanımla, belgele | 90 yorumluk açık yara; kimse çözmedi | ~1 gün |
| **P1** | **Tepside fare tekerleği** ile parlaklık | En çok istenen mikro-özellik | ~0.5 gün |
| **P1** | **DDC/CI geri kazanma** — monitör düşerse N turda yeniden dene, kullanıcıya "monitör uyandırılıyor" göster | Kırılganlık kategorinin en büyük sorunu | ~1 gün |
| **P2** | Boşta dönüşünü yumuşat (3-5 sn rampa) | "Ekran bir anda parladı" şikâyetini önler | ~0.5 gün |
| **P2** | **winget yayını** | Bedava keşif kanalı | ~0.5 gün |
| **P3** | Night Light blob yazma (tersine mühendislik) | Riskli, sürüm bağımlı; **önerilmez** | — |
| **P3** | Store MSIX paketleme | Komisyon + imza; winget'ten sonra | ~2 gün |

---

## 8. Stratejik okuma — ne yapmalı

**Kısa cevap:** yeni özellik eklemekten çok, **kategorinin ortak yarasını iyileştirmek**
daha çok değer üretir. Sebep: rakiplerin hepsi aynı üç yerden kanıyor
(uyku sonrası kalıcılık, HDR, DDC kırılganlığı) ve hiçbiri çözmemiş.

**Üç sütun:**

1. **Güvenilirlik (P0)** — uyku/uyanma, HDR, DDC geri kazanma. Bunlar satış
   konuşmasında "asla bozulmaz" diyebilmenin önkoşulu. Rakipler bunu diyemiyor.
2. **Farklılaşma** — zaten var: kamera ile ortam ışığı (kimse yapmıyor),
   editör teması yazma (kimse yapmıyor), kontrast denetimi (kimse yapmıyor).
   Bunları **pazarlamada** öne çıkarmak lazım; kodda değil, hikâyede eksik.
3. **Dağıtım** — winget bedava ve hızlı; Store ve imza sonra.

**Yapmamalı:** mobil, macOS, Linux (v3.5 kararı geçerli — motor taşınabilir ama
değer yaratan API'ler platforma bağlı). Night Light blob yazma (sürüm kırılganlığı).

---

## 9. Karar noktaları (senin)

1. **P0'a mı P1'e mi önce?** Ben P0 derim — çünkü "bozuk hissi" en pahalı kusur.
2. **winget'e bu turda çıkalım mı?** Bedava, yarım gün, gerçek kullanıcı getirir.
3. **Store'a girmek istiyor musun?** MSIX + %15 komisyon; ayrı bir tur.
4. **Pro fiyatı ne olacak?** Piyasa çıpası $15–34 arası. Kodda fiyat yok.

---

## Kaynaklar

- GitHub API: `api.github.com/repos/{xanderfrangos/twinkle-tray, emoacht/Monitorian, Tyrrrz/LightBulb, terrymacdonald/DisplayMagician}/releases/latest` — 19.11.2026
- Issue'lar: twinkle-tray #35/#97/#286/#493/#835/#1187 · Monitorian #115/#246/#316/#411/#692/#756 · LightBulb #102/#150/#173 · PowerToys #20405
- care-eyes.com/buy.html ve /release.html (2.7.2.0, 18.11.2026)
- iristech.co (fiyat $15), iristech.co/category/iris-new-version/windows (2022.11.30)
- forum.justgetflux.com (4.150, 19.11.2026) · justgetflux.com/news (son yazı 2020-03-09)
- github.com/sharpbracket/redshift/releases (v1.12, arşiv 2026-04-01)
- sunsetscreen.com (DomainMarket — ürün ölü)
- learn.microsoft.com: code-signing-options, why-distribute-through-store, sensors-adaptive-brightness, energy-saver
- devclass.com (Azure Trusted Signing $9.99/ay, 2026-01-14) · certum.store · signpath.org

**Ulaşılamayan kaynaklar:** apps.microsoft.com (410/JS render), alternativeto.net (403),
softpedia (403), Reddit (403/JS), websearch API (HTTP 402). Store yıldız/yorum
verisi **alınamadı** — bu raporda Store metriği yok.
