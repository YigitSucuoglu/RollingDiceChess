# Slot Machine Assets

Bu klasör, Current Roll panelinin ilerideki slot machine görünümü için resmî görsel kaynaklarını ve import giriş noktasını içerir.

## Kaynak dosyalar

Her iki kaynak sheet de 1536×1024 PNG'dir ve `source/` altında değiştirilmeden saklanır.

- `slot-machine-sheet.png`: Üç makaralı ana makine kasası, altı taşlık sembol şeridi, ayrı kol, taş/etiket parçaları ve dekoratif sağ panel parçalarını içerir.
- `chess-piece-sheet.png`: Taş sembolleri, etiket plakaları, ayrı kol ve dekoratif panel parçaları için alternatif kaynak içerir.

Kaynak sheet'ler doğrudan UI arka planı olarak kullanılmayacaktır. Orijinal dosyalar ileride yeniden kırpma ve optimizasyon yapılabilmesi için korunacaktır.

## Planlanan kullanım bölgeleri

### Slot machine sheet

- Sol üst: Current Roll için üç makaralı ana kasa.
- Orta sol: Pawn, Knight, Bishop, Rook, Queen ve King sembol şeridi.
- Alt bölüm: Ayrı taş sembolleri ve isim plakaları.
- Sol alt: Makine kolu.
- Sağ bölüm: İleride başlık, durum veya sonuç paneli olarak değerlendirilebilecek dekoratif plakalar.

### Chess piece sheet

- Üst sıra: Tekil taş sembolleri ve etiket plakaları için kırpma adayları.
- Sol alt: Alternatif makine kolu.
- Alt orta: İleride durum metni için değerlendirilebilecek iki dekoratif panel.

Kaynak görsellerde tekrarlanan King varyantları ve bazı etiket yazım farklılıkları bulunur. Hangi varyantın kullanılacağı, sprite üretimi sırasında görsel olarak doğrulanacaktır.

## Üretilecek asset türleri

Sonraki görevlerde ihtiyaç oldukça şu türetilmiş dosyalar hazırlanabilir:

- Optimize edilmiş makine kasası
- Üç reel penceresi için maske veya overlay
- Altı standart taş tipi için tekil semboller
- Makine kolu ve dekoratif panel parçaları
- Responsive kullanım için uygun boyut varyantları

Türetilmiş dosyalar kaynak sheet'lerin üzerine yazılmadan ayrı alt klasörlerde tutulacaktır.

## Kod import yapısı

`index.ts`, UI tarafından kullanılacak türetilmiş asset'leri merkezi ve tip güvenli biçimde dışa aktarır. Büyük source sheet'ler production bundle'a eklenmez; yalnızca asset üretimi için resmî kaynak olarak saklanır.

## Entegrasyon sırası

1. Kullanılacak bölgelerin kesin kırpma sınırlarını doğrula.
2. Türetilmiş ve optimize edilmiş asset dosyalarını üret.
3. Makine kasasını mevcut üç slot wrapper'ına uygula.
4. Taş sembollerini mevcut deterministik roulette animasyonuna bağla.
5. Responsive görünümü ve final `currentRoll` eşleşmesini doğrula.

Bu aşamada sprite kırpma, CSS `background-position`, reel animasyonu veya oyun görünümü değiştirilmemiştir.

## Üretilen frame

`generated/slot-machine-frame.png`, `slot-machine-sheet.png` içindeki üç makaralı ana kasadan türetilmiştir. Kaynak sheet değiştirilmemiştir. UI, büyük source sheet'i CSS ile konumlandırmak yerine merkezi `SLOT_MACHINE_ASSETS.generated.frame` export'u üzerinden bu bağımsız frame dosyasını kullanır.

`generated/pawn.png`, `knight.png`, `bishop.png`, `rook.png`, `queen.png` ve `king.png`, `chess-piece-sheet.png` içindeki altın taşlardan türetilmiş şeffaf ve optimize edilmiş sembollerdir. UI bu dosyalara yalnızca `SLOT_MACHINE_ASSETS.symbols` map'i üzerinden erişir; source sheet production bundle'a girmez.

`generated/slot-machine-lever.png`, `slot-machine-sheet.png` içindeki bağımsız kol mekanizması referans alınarak üretilmiş, alfa kanallı ve güvenli padding ile kırpılmış dekoratif lever asset'idir. UI bu dosyaya yalnızca `SLOT_MACHINE_ASSETS.generated.lever` üzerinden erişir. Lever oyun etkileşimi taşımaz; ROLL ile başlayan reel animasyonuna görsel olarak eşlik eder.
