import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctor } from "../../src/doctor.js";
import { fixture, html, json, mockFetch, nextDataPage, testConfig } from "../helpers.js";

const tree = fixture("category-tree-tr.json");
const quick = fixture("quick-lm317.json");
const product = fixture("product-368374.json");
const list = fixture("list-279.json");

afterEach(() => vi.unstubAllGlobals());

function healthySite() {
  return mockFetch([
    { match: (u) => u.includes("/api/categories/categories"), respond: () => json(tree) },
    { match: (u) => u.includes("/api/layout/header"), respond: () => json(quick) },
    { match: (u, _i, b) => u.endsWith("/api/ps") && b?.type === "GetListData", respond: () => json(list) },
    {
      match: (u, _i, b) => u.endsWith("/api/ps") && b?.type === "GetTopFilterData",
      respond: () => json({ totalCount: 42, propertyFilters: list.propertyFilters }),
    },
    { match: (u) => u.includes("/p/urun/"), respond: () => html(nextDataPage(product)) },
    {
      match: (u) => u.includes("/api/products/variantPrice"),
      respond: () => json(product.initialPrice.response),
    },
    {
      match: (u) => u.includes("/api/pdf/resolve"),
      respond: () => json({ url: "https://cdn.ozdisan.com/a.pdf", fileName: "a.pdf", isExternal: false }),
    },
  ]);
}

describe("doctor", () => {
  it("sağlıklı sitede 7 denetimin hepsi geçer", async () => {
    vi.stubGlobal("fetch", healthySite().impl);
    const lines: string[] = [];
    const report = await runDoctor(testConfig(), { write: (l) => lines.push(l) });
    expect(report.checks).toHaveLength(7);
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(lines.join("\n")).toMatch(/SONUÇ: 7 denetim geçti/);
  });

  it("site yapısı bozulduğunda FAIL raporlar ve ok=false döner", async () => {
    vi.stubGlobal("fetch", async () => json({ beklenmeyen: true }));
    const lines: string[] = [];
    const report = await runDoctor(testConfig(), { write: (l) => lines.push(l) });
    expect(report.ok).toBe(false);
    expect(report.checks.every((c) => !c.ok)).toBe(true);
    expect(report.checks[0]!.error).toMatch(/beklenen yapıda değil/);
    expect(lines.join("\n")).toMatch(/BAŞARISIZ/);
  });

  it("--json modunda yalnızca tek bir geçerli JSON belgesi yazar", async () => {
    vi.stubGlobal("fetch", healthySite().impl);
    const lines: string[] = [];
    await runDoctor(testConfig(), { json: true, write: (l) => lines.push(l) });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ ok: true, version: expect.any(String), baseUrl: expect.stringContaining("ozdisan") });
    expect(parsed.checks).toHaveLength(7);
  });
});

describe("doctor önbelleği", () => {
  it("disk önbelleğindeki eski kategori ağacına güvenmez", async () => {
    const config = testConfig({ diskCache: true });
    // Önce sağlıklı siteyle önbelleği doldur (normal sunucu kullanımı gibi).
    vi.stubGlobal("fetch", healthySite().impl);
    const { OzdisanClient } = await import("../../src/api.js");
    await new OzdisanClient(config).getCategoryIndex();
    // Sonra site bozulsun: doctor kategori ağacını da FAIL göstermeli.
    vi.stubGlobal("fetch", async () => json({ beklenmeyen: true }));
    const report = await runDoctor(config, { write: () => undefined });
    expect(report.checks[0]!.ok).toBe(false);
  });
});
