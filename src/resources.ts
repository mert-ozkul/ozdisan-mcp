import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { runWithSignal, UserInputError } from "./http.js";
import { clean } from "./normalize.js";
import { entryOut, nodeOut } from "./tools/categories.js";
import { loadProductDetail } from "./tools/products.js";
import type { ToolContext, ToolExtra } from "./tools/shared.js";

const MIME = "application/json";

function jsonResource(uri: URL, data: unknown): ReadResourceResult {
  return { contents: [{ uri: uri.href, mimeType: MIME, text: JSON.stringify(clean(data)) }] };
}

/** URI şablonundaki değişkeni tek bir çözülmüş dizeye çevirir (ör. "LM317%2FT" → "LM317/T"). */
function variable(value: string | string[] | undefined, name: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  let decoded = raw ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Geçersiz yüzde kodlaması: değeri olduğu gibi kullan.
  }
  if (!decoded.trim()) throw new UserInputError(`Kaynak adresinde '${name}' boş olamaz.`);
  return decoded.trim();
}

/**
 * MCP kaynakları: istemcilerin araç çağırmadan bağlama ekleyebileceği salt-okunur veriler.
 * Dil ve para birimi sunucu ayarlarından (OZDISAN_LANG / OZDISAN_CURRENCY) gelir.
 */
export function registerResources(server: McpServer, ctx: ToolContext): void {
  const { client } = ctx;

  server.registerResource(
    "categories",
    "ozdisan://categories",
    {
      title: "Özdisan kategori ağacı",
      description: "Top-level Özdisan category groups with their sub-categories and product counts (2 levels).",
      mimeType: MIME,
    },
    async (uri, extra: ToolExtra) =>
      runWithSignal(extra?.signal, async () => {
        const index = await client.getCategoryIndex();
        return jsonResource(uri, {
          total_products: index.totalCount,
          categories: index.roots.map((r) => nodeOut(r, 2)),
          note: "Use ozdisan://category/{category} for deeper levels.",
        });
      }),
  );

  server.registerResource(
    "category",
    new ResourceTemplate("ozdisan://category/{category}", {
      list: undefined,
      complete: {
        category: async (value) => {
          const index = await client.getCategoryIndex().catch(() => undefined);
          if (!index) return [];
          const q = value.trim();
          if (!q) return index.roots.map((r) => r.slug);
          return client
            .rankCategories(index, q)
            .slice(0, 20)
            .map((r) => r.entry.slug);
        },
      },
    }),
    {
      title: "Özdisan kategorisi",
      description:
        "One Özdisan category: its path, product count, page URL and direct sub-categories. " +
        "{category} is a slug (e.g. 'lineer-voltaj-regulatorleri-279'), numeric id or category name.",
      mimeType: MIME,
    },
    async (uri, vars, extra: ToolExtra) =>
      runWithSignal(extra?.signal, async () => {
        const entry = await client.resolveCategory(variable(vars.category, "category"));
        const index = await client.getCategoryIndex();
        const children = index.nodes.get(entry.sequenceId)?.subCategories ?? [];
        return jsonResource(uri, {
          category: entryOut(entry),
          url: client.categoryUrl(entry.slug, client.lang()),
          subcategories: children.map((c) => nodeOut(c, 1)),
        });
      }),
  );

  server.registerResource(
    "product",
    new ResourceTemplate("ozdisan://product/{product}", { list: undefined }),
    {
      title: "Özdisan ürünü",
      description:
        "Full details of one product (same as the get_product tool, without alternatives). " +
        "{product} is the Özdisan product code (e.g. '368374') or an exact manufacturer part number.",
      mimeType: MIME,
    },
    async (uri, vars, extra: ToolExtra) =>
      runWithSignal(extra?.signal, async () => {
        const loaded = await loadProductDetail(client, variable(vars.product, "product"), client.lang(), client.currency());
        return jsonResource(uri, { ...loaded.detail, other_products_with_same_part_number: loaded.otherMatches });
      }),
  );
}
