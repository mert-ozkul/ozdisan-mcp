import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir } from "../helpers.js";
import { SERVER_ENTRY, startServer, type E2EClient } from "./mcp-client.js";

const run = promisify(execFile);

describe("CLI: ozdisan-mcp doctor (canlı)", () => {
  it("--json ile tüm denetimleri geçer ve 0 ile çıkar", async () => {
    const { stdout } = await run(process.execPath, [SERVER_ENTRY, "doctor", "--json"], {
      env: { ...process.env, OZDISAN_CACHE_DIR: tempDir() },
      timeout: 110_000,
    });
    const report = JSON.parse(stdout);
    expect(report.checks).toHaveLength(7);
    expect(report.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("--help doctor alt komutunu anlatır", async () => {
    const { stdout } = await run(process.execPath, [SERVER_ENTRY, "--help"]);
    expect(stdout).toContain("doctor");
  });
});

describe("MCP kaynakları (stdio, canlı)", () => {
  let s: E2EClient;
  beforeAll(async () => {
    s = await startServer();
  });
  afterAll(async () => {
    await s?.close();
  });

  it("kategori ağacı ve ürün kaynağını okur", async () => {
    const cats = await s.client.readResource({ uri: "ozdisan://categories" });
    const tree = JSON.parse((cats.contents[0] as { text: string }).text);
    expect(tree.categories.length).toBeGreaterThan(0);

    const prod = await s.client.readResource({ uri: "ozdisan://product/LM317KCT" });
    const detail = JSON.parse((prod.contents[0] as { text: string }).text);
    expect(detail.part_number).toBe("LM317KCT");
  });
});
