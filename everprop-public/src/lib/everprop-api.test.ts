import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadEverpropAllFollowUps,
  loadEverpropLeads,
  toCreatePropertyPayload,
  updateEverpropProperty,
  updateEverpropPropertyStatus,
} from "./everprop-api";

const apiProperty = {
  public_id: "prop-public-1",
  version: 8,
  title: "Lote 8",
  operation: "SALE",
  category: "LOT",
  status: "RESERVED",
  price: 12000,
  currency_code: "USD",
  city: "San Salvador de Jujuy",
  neighborhood: "Centro",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: apiProperty }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ));
});

describe("property API contracts", () => {
  it("preserves the backend project id instead of substituting a constant", () => {
    const payload = toCreatePropertyPayload({
      title: "Lote 8",
      city: "San Salvador de Jujuy",
      projectId: 42,
    });

    expect(payload.project_id).toBe(42);
  });

  it("uses the normal update endpoint and current version for status changes", async () => {
    const updated = await updateEverpropPropertyStatus("prop-public-1", "reserved", 7);
    const [, init] = vi.mocked(fetch).mock.calls[0];

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("http://localhost:18080/api/v1/admin/properties/prop-public-1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ status: "RESERVED", version: 7 });
    expect(updated.version).toBe(8);
  });

  it("refuses an edit when no concurrency version was loaded", async () => {
    await expect(updateEverpropProperty("prop-public-1", { title: "Nuevo" })).rejects.toThrow(
      "versión válida",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("paginated API contracts", () => {
  it("loads every declared page for leads and follow-ups", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      const isFollowUp = url.pathname.endsWith("/follow-ups");
      const data = isFollowUp
        ? [{
            id: `follow-${page}`,
            companyId: "c1",
            leadId: "lead-1",
            agentId: "agent-1",
            type: "note",
            occurredAt: "2026-09-08T12:00:00Z",
            summary: `Follow-up ${page}`,
            result: "Recorded",
          }]
        : [{ id: `lead-${page}`, name: `Lead ${page}`, stage: "NEW" }];

      return new Response(JSON.stringify({
        data,
        meta: { current_page: page, last_page: 2, per_page: 100, total: 2 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const [leads, followUps] = await Promise.all([loadEverpropLeads(), loadEverpropAllFollowUps()]);

    expect(leads.map((lead) => lead.id)).toEqual(["lead-1", "lead-2"]);
    expect(followUps.map((followUp) => followUp.id)).toEqual(["follow-1", "follow-2"]);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetch).mock.calls.every(([input]) => String(input).includes("per_page=100"))).toBe(true);
  });

  it("fails explicitly instead of silently truncating an unsafe result set", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [],
        meta: { current_page: 1, last_page: 101, per_page: 100, total: 10_001 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));

    await expect(loadEverpropLeads()).rejects.toThrow("límite seguro");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
