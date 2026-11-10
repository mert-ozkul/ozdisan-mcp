// ozdisan-mcp teşhis aracı: sitenin kullandığımız uç noktaları hâlâ beklediğimiz yapıda
// döndürüp döndürmediğini tek tek denetler. Site değiştiğinde araçlar sessizce boş sonuç
// vermek yerine burada FAIL olarak görünür.
//   npx -y ozdisan-mcp doctor           okunabilir tablo
//   npx -y ozdisan-mcp doctor --json    makine tarafından okunabilir çıktı
import { leafHits, OzdisanClient } from "./api.js";
import { REPO_URL, VERSION, type Config } from "./config.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
}

export interface DoctorReport {
  version: string;
  baseUrl: string;
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  json?: boolean;
  /** Çıktı satırlarının yazılacağı yer (varsayılan: stdout). */
  write?: (line: string) => void;
  client?: OzdisanClient;
}

/** Canlı uç noktaları sırayla denetler; her denetim bir öncekinin bulduğu örnek ürün/kategoriyi kullanır. */
export async function runDoctor(config: Config, opts: DoctorOptions = {}): Promise<DoctorReport> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const json = opts.json === true;
  // Disk önbelleği kapalı: doctor canlı siteyi denetlemeli, önceki çalıştırmanın kayıtlarını değil.
  const client = opts.client ?? new OzdisanClient({ ...config, diskCache: false });
  const checks: DoctorCheck[] = [];

  const check = async (name: string, fn: () => Promise<string>): Promise<void> => {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      const ms = Date.now() - startedAt;
      checks.push({ name, ok: true, ms, detail });
      if (!json) write(`  PASS  ${name} (${ms} ms) — ${detail}`);
    } catch (err) {
      const ms = Date.now() - startedAt;
      const error = err instanceof Error ? err.message : String(err);
      checks.push({ name, ok: false, ms, error });
      if (!json) write(`  FAIL  ${name} (${ms} ms) — ${error}`);
    }
  };

  if (!json) {
    write(`ozdisan-mcp doctor ${VERSION}`);
    write(`hedef: ${config.baseUrl} (dil: ${config.language}, para birimi: ${config.currency})`);
    write("");
  }

  let probeSku: string | undefined;
  let probeCategoryId: number | undefined;
  let probeDatasheet: { sku: string; media: string } | undefined;
  let productPageOk = false;

  await check("kategori ağacı (/api/categories/categories)", async () => {
    const index = await client.getCategoryIndex();
    if (!index.totalCount) throw new Error("totalCount 0 döndü");
    // Denetimler için ürünü olan bir yaprak kategori seçilir (kök kategoriler boş liste döndürebilir).
    probeCategoryId = index.bySeq.has(279) ? 279 : leafHits(index.roots).find((l) => l.count > 0)?.sequenceId;
    return `${index.bySeq.size} kategori, ${index.totalCount} ürün`;
  });

  await check("hızlı arama (/api/layout/header)", async () => {
    const res = await client.quickSearch("LM317");
    const variants = res.variants ?? [];
    if (!variants.length) throw new Error("LM317 için hiç eşleşme dönmedi");
    probeSku = variants[0]!.sku;
    return `${variants.length} eşleşme, ilk: ${probeSku}`;
  });

  await check("ürün listesi (/api/ps GetListData)", async () => {
    if (!probeCategoryId) throw new Error("ürünü olan yaprak kategori seçilemedi");
    const res = await client.listProducts(probeCategoryId, { page: 1, pageSize: 1 });
    if (!res.variantList?.totalCount) throw new Error("variantList.totalCount 0 döndü");
    return `${probeCategoryId}: ${res.variantList.totalCount} ürün, ${res.tableProperties?.length ?? 0} tablo sütunu`;
  });

  await check("kategori filtreleri (/api/ps GetTopFilterData)", async () => {
    if (!probeCategoryId) throw new Error("ürünü olan yaprak kategori seçilemedi");
    const res = await client.getAvailableFilters(probeCategoryId, {}, undefined);
    if (!res.propertyFilters?.length) throw new Error("propertyFilters boş döndü");
    return `${probeCategoryId}: ${res.propertyFilters.length} özellik, totalCount ${res.totalCount}`;
  });

  await check("ürün detay sayfası (HTML __NEXT_DATA__)", async () => {
    if (!probeSku) throw new Error("önce hızlı arama başarılı olmalı");
    const resolved = await client.resolveProduct(probeSku);
    const page = await client.getProductPage(resolved.erpRefId);
    if (!page.data?.sku) throw new Error("data.sku yok");
    const media = page.data.medias?.find((m) => m.field === "Datasheet")?.path;
    probeDatasheet = media ? { sku: page.data.sku, media } : undefined;
    productPageOk = true;
    return `${page.data.sku} (kod ${page.data.erpRefId}), ${page.data.properties?.length ?? 0} özellik`;
  });

  await check("fiyat uç noktası (/api/products/variantPrice)", async () => {
    if (!probeCategoryId) throw new Error("ürünü olan yaprak kategori seçilemedi");
    const list = await client.listProducts(probeCategoryId, { page: 1, pageSize: 10 });
    const variant = (list.variantList.data ?? []).find((v) => v.availability?.isShowPrice !== false);
    if (!variant) return "bu kategoride fiyat gösteren ürün yok — atlandı";
    const res = await client.getVariantPrices(variant.id, config.currency);
    const packages = res?.data?.packages ?? [];
    if (!packages.length) throw new Error("fiyat paketi dönmedi");
    const breaks = packages[0]?.priceBreaks ?? [];
    const price = breaks.flatMap((b) => b.prices ?? []).find((p) => p.currency === config.currency);
    if (!price) throw new Error(`${config.currency} fiyatı dönmedi`);
    return `${variant.sku}: ${packages.length} paket, ${breaks.length} kırılım, ${config.currency} ${price.price}`;
  });

  await check("datasheet çözümleme (/api/pdf/resolve)", async () => {
    // Ürün sayfası okunamadıysa "datasheet yok" diye geçmek yanıltıcı olur.
    if (!productPageOk) throw new Error("önce ürün detay sayfası denetimi başarılı olmalı");
    if (!probeDatasheet) return "bu ürünün datasheet bağlantısı yok — atlandı";
    const ds = await client.resolveDatasheetUrl(probeDatasheet.sku, probeDatasheet.media);
    if (!ds?.url) throw new Error("datasheet adresi çözümlenemedi");
    return `${new URL(ds.url).host}${ds.isExternal ? " (harici)" : ""}`;
  });

  const failed = checks.filter((c) => !c.ok);
  const report: DoctorReport = { version: VERSION, baseUrl: config.baseUrl, ok: failed.length === 0, checks };
  if (json) {
    write(JSON.stringify(report, null, 2));
  } else {
    write("");
    write(
      failed.length === 0
        ? `SONUÇ: ${checks.length} denetim geçti. Uç noktalar beklenen yapıda.`
        : `SONUÇ: ${failed.length}/${checks.length} denetim BAŞARISIZ. Araçlar hatalı sonuç verebilir; ` +
            `sorun sürüyorsa ${REPO_URL}/issues adresinde issue açın.`,
    );
  }
  return report;
}
