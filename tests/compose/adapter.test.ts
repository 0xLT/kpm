import { describe, expect, it } from "vitest";
import { getAdapter, registerAdapter } from "../../src/compose/adapters/base.js";

describe("compose adapters", () => {
  it("looks up registered adapters by name", () => {
    registerAdapter({
      name: "stub",
      command: "echo",
      args: () => ["stub"],
      env: () => ({})
    });
    const adapter = getAdapter("stub");
    expect(adapter.name).toBe("stub");
  });

  it("throws for unknown adapters", () => {
    expect(() => getAdapter("nope")).toThrow();
  });
});
