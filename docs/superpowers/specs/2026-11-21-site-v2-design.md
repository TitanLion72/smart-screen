# Site v2 — "Karanlık oda, tek ışık" tasarım belgesi

Tarih: 2026-11-21 · Durum: onay bekliyor · Önceki belge: `2026-11-19-site-design.md` (iptal)

## 1. Neden yeniden

Önceki site dört yapay zekâ izi taşıyordu ve kullanıcı beğenmedi. Doğrulanmış
sebep (frontend-design skill'in kalibrasyon listesi):

1. Krem zemin (#F4F1EA civarı) + yüksek kontrast serif + terracotta vurgu
2. Gazete düzeni: saç teli kurallar, sıfır yarıçap, yoğun kolonlar
3. Her başlığın üstünde ALL-CAPS, aralıklı eyebrow
4. Monospace küçük veri etiketleri + `·` ile birleşik meta satırları

Hepsi "kötü zevk" değil; **karar verilmemiş varsayılan**. Yenilemede dördü de
atılıyor. Skill: *"Where it leaves an axis free, don't spend that freedom on
one of these defaults."*

## 2. Seçilen yön (onaylandı)

**"Karanlık oda, tek ışık."** Sayfa neredeyse siyah; tek ışık kaynağı ürünün
kendi arayüzü. Kullanıcı isteği: *"yön 2 olsun ama daha dolu dolu olsun."*

### 2.1 "Dolu" ne demek — ve ne demek değil

**Dolu = gerçek içerik yoğunluğu.** Değil: stok fotoğraf, renkli ikon seti,
gradient leke, emoji, üç kolonlu kart ızgarası, decoration.

Ürünün iddiası "kamera görüntüsü diske yazılmaz, telemetri yok" — sayfaya stok
fotoğraf koymak bu iddiayla çelişir (nereden geldiği belli olmayan görsel).
Bu yüzden:

| İstek | Karşılığı |
|---|---|
| "görsel çok az" | **8 gerçek uygulama karesi** (4 değil): durum hero, monitörler, sıcak ton, kontrast denetimi, profiller, tema çipleri, geçmiş, tanılama |
| "logolar" | Gerçek marka işareti: uygulamanın kendi `icon.svg`'i, ölçeklenebilir; ayrıca **OS/monitör bağlam ikonları** — WMI/DDC/Ed25519 gibi gerçek teknik etiketler (uydurma rakip logosu yok) |
| "örnek fotolar" | **Kendi ürettiğimiz tek görsel**: `og.png` + hero'da "oda" ışığı (CSS ışıma, gerçek fizik). Stok fotoğraf yok, gerekçe yukarıda |
| "animasyonlar" | 4 anlamlı hareket: **(a)** hero'da ürünün açılış anı (ekran kararır → parlaklık %100→%38'e iner), **(b)** kaydırdıkça odanın kararması (23:00'e geçiş), **(c)** eğrinin çizilmesi + "şu an" noktasının saatinle ilerlemesi, **(d)** sayıların bir kez sayması (62%, 4300 K) |

Hareket **kullanıcıya cevap veren** ya da **ürünün davranışını gösteren**
harekettir; her bölümde fade-up girişi yok (skill: genel varsayılan).

## 3. Token sistemi

### Renk (6)
| Ad | Hex | Rol |
|---|---|---|
| void | `#05070a` | Sayfa zemini — gerçek siyaha yakın, mavi-gri |
| wall | `#0d1118` | Yükseltilmiş yüzey (kart, ekran çerçevesi) |
| text | `#eeece7` | Birincil metin — saf beyaz değil, kâğıt sıcaklığı |
| dim | `#9aa0a8` | İkincil metin |
| glow | `#ffbe86` | **Tek vurgu** — ürünün sıcak tonu |
| ember | `#c2410c` | Yalnız "şu an" işaretçisi ve küçük uyarılar |

Sayfanın gerçek rengi **ekran karelerinden** gelir (krem, pirinç, obsidyen);
tasarım bunları çerçeveler, kendi rengini üretmez. Kontrast: text/void 15.8,
dim/void 7.4, glow/void 11.2 — üçü de AAA.

### Tipografi (tek aile)
**Bricolage Grotesque** — self-hosted değişken font, `wght 200–800`,
`wdth 75–100`, alt küme 79 KB (Türkçe tam). Tek aile; hiyerarşi
**ağırlık + genişlik + boyut** üçlüsünden, renkten değil.

- Hero: `wght 250`, `wdth 96%`, `clamp(2.2rem, 5vw, 3.9rem)`, `-0.038em`
- Bölüm başlığı: `wght 300`, `wdth 92%`
- Gövde: `wght 360`, 17px/1.62, satır ≤ 62ch
- Mikro etiket: **artık ALL-CAPS yok** — cümle düzeni, `wght 520`, 14px

### Yerleşim
Tek kolon akış, geniş boşluk, sol hizalı (hero başlığı sol; Yön 2 mockup'ında
ortaydı — orta hizalama "landing page" varsayılanına yakın, sola çeviriyorum).
Ekran kareleri **tam genişlik "vitrin"** olarak, kırpılmadan, çerçevesiz-yüzsüz
(sadece 1px sınır + ışıma).

```
┌──────────────────────────────────────────────┐
│ smart-screen            nasıl çalışır  indir │
│                                              │
│  Oda karanlıkken                             │
│  ekran da karanlık olmalı.                   │
│                                              │
│  Kamera ışığı ölçer, parlaklık ve ton…       │
│  [İndir]  [Kaynak]                           │
│                                              │
│        ▓▓▓ ekran vitrini ▓▓▓                 │
│                                              │
├──────────────────────────────────────────────┤
│  08:00 ────────────────────────── 23:00      │
│  4 sabah/öğle/akşam/gece durağı (yatay)      │
├──────────────────────────────────────────────┤
│  8 kare, 2 sütun mozaik (kırpma yok)         │
├──────────────────────────────────────────────┤
│  neye dokunmaz (2 sütun karşılaştırma)       │
├──────────────────────────────────────────────┤
│  kurulum gerçekleri (tablo)                  │
├──────────────────────────────────────────────┤
│  SSS (7)                                     │
├──────────────────────────────────────────────┤
│  kapanış + indir                             │
└──────────────────────────────────────────────┘
```

## 4. İlkeler

1. **Tek cesur hareket: ışık.** Sayfada parlayan tek şey ekran. Vurgu rengi
   yalnız etkileşim ve "şu an" için.
2. **Ekran kareleri kahraman.** Süs yok, çünkü içerik var.
3. **Hareket ürünü gösterir**, kendini göstermez.
4. **Metin iş yapar**: cümle düzeninde, aktif fiil, dolgu yok.
5. **Karanlıkta okunur**: her metin AAA, 62ch üstü satır yok.

## 5. Kapsam

**Yapılacak:** siteyi sıfırdan yaz (yeni `site/`), 8 kare üret, TR+EN, dört
hareket, tüm kapılar (`site:check`, `--smoke`, parity, kontrast, bütçe).

**Yapılmayacak:**
- Stok fotoğraf, üçüncü taraf ikon seti, CDN, analitik
- Uydurma müşteri logosu / referans
- Fiyat bölümü (Pro fiyatı belirlenmedi)
- Eski tasarımdan miras: eyebrow, mono etiket, saç teli kural estetiği,
  krem+terracotta, gazete kolonları

## 6. Bütçe (ölçümle düzeltildi)

| Ölçü | Sınır | Not |
|---|---|---|
| Font | ≤ 85 KB | ölçüldü: 79.4 KB (wdth+wght, Türkçe tam) |
| İlk yükleme | ≤ 150 KB raw / ≤ 45 KB gzip | font + HTML + CSS + JS |
| 8 kare | ≤ 120 KB/kare | toplam ≤ 700 KB |
| JS | ≤ 8 KB | dört hareket + okuma |

## 7. Doğrulama

- `site:check`: parity, kontrast (AAA metin), bağlantı, bütçe, yasak desen
  (`backdrop-filter`, `radial-gradient` **leke olarak** — ışıma istisnası
  yorumla belgelenir), eyebrow/ALL-CAPS sınıfı yokluğu
- `--smoke`: 360/768/1440 taşma yok, JS kapalı içerik durur,
  `prefers-reduced-motion` dört hareketi de kapatır, dil geçişi
- Gözle: 3 genişlikte kare al, dört hareketin başlangıç/bitiş hâli
- Lighthouse: dört kategori ≥ 95
