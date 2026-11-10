# Değişiklik Günlüğü

## 0.1.1

Site değiştiğinde hatalı sonuç vermeyi önleyen düzeltmeler ([@bahattinercan](https://github.com/bahattinercan) katkısıyla).

- **Hata maskeleme kaldırıldı.** Ürün sayfasında `__NEXT_DATA__` yoksa veya JSON'u bozuksa sunucu artık
  "ürün bulunamadı" demiyor; `SiteContractError` fırlatıyor. Gerçek "ürün yok" durumu (site 200 + `pageProps.error`)
  hâlâ `UserInputError` olarak dönüyor.
- **Uç nokta sözleşmesi denetimi eklendi.** Kategori ağacı, kategori arama, ürün listesi (`variantList`), filtre
  (`propertyFilters`) ve hızlı arama yanıtları beklenen alanları taşımıyorsa boş sonuç yerine açık hata veriliyor.
- **`ozdisan-mcp doctor` alt komutu.** Yedi canlı uç noktayı tek tek denetleyen teşhis komutu; depo gerekmeden
  `npx -y ozdisan-mcp doctor` ile çalışır (`--json` makine tarafından okunabilir çıktı verir), bozuk uç noktada 1 ile
  çıkar. Disk önbelleğini kullanmaz, her zaman canlı siteyi denetler. Depoda `npm run doctor` aynı komutu çalıştırır.
- **MCP kaynakları (resources).** `ozdisan://categories`, `ozdisan://category/{category}` (kategori tamamlama
  destekli) ve `ozdisan://product/{product}`: istemciler kategori ağacını ve ürünleri araç çağırmadan bağlama
  ekleyebilir.
- **MCP istemcisine doğru ipucu.** `SiteContractError` sonucunda "ağ/bağlantı" değil, "site yapısı değişmiş olabilir,
  `npx -y ozdisan-mcp doctor` + güncelleme" ipucu dönüyor ve modelin bunu "bulunamadı" diye özetlemesi engelleniyor.
- Doküman: `OZDISAN_BASE_URL` belgelendi, npm yayın durumu düzeltildi, teşhis bölümü eklendi.
- Depo: `SECURITY.md`, `CONTRIBUTING.md`, dependabot, yayın iş akışı ve issue/PR şablonları.
- Testler: sözleşme bozulması, doctor ve kaynak senaryoları için yeni birim testleri (126 birim + 31 uçtan uca test).

## 0.1.0

İlk sürüm.

- 11 araç: `search_products`, `get_product`, `search_categories`, `browse_categories`, `get_category_filters`,
  `filter_products`, `get_alternatives`, `compare_products`, `check_bom`, `download_datasheet`, `read_datasheet`
- 2 istem: `komponent_sec`, `bom_kontrol`
- Parametrik filtrelerde Türkçe/İngilizce özellik adları, birimli sayısal aralıklar ve hatalı girdilerde öneriler
- TRY/USD/EUR fiyatlar, TR/EN dil desteği
- Hız sınırlama, yeniden deneme, bellek ve disk önbelleği
- Güvenlik: datasheet okumada yerel/özel ağ adreslerine (DNS ve yönlendirmeler dahil) erişim engeli, akışla boyut sınırı,
  PDF imza doğrulaması, eşzamanlı indirmelerde dosya bütünlüğü
- Değer ve birim eşleştirmede ondalık nokta, işaret ve m/M (mili/mega) ön ekleri asla yok sayılmaz
- İstemci iptaline uyum ve uzun işlemlerde (BOM, karşılaştırma) ilerleme bildirimi
- Birim ve uçtan uca (canlı site, stdio) testler
