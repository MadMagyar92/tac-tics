import type { TerrainObject } from '@tac-tics/types'
import { describe, it, expect, beforeEach } from "vitest";
import { TerrainService } from "../terrain";

describe("TerrainService", () => {
  let service: TerrainService;
  let terrain: TerrainObject;

  beforeEach(() => {
    service = new TerrainService();
    terrain = { id: "t1" };
  });

  it("save returns the object's id", () => {
    expect(service.save(terrain)).toBe("t1");
  });

  it("load returns a previously saved object", () => {
    service.save(terrain);
    expect(service.load("t1")).toEqual(terrain);
  });

  it("load throws for an unknown id", () => {
    expect(() => service.load("missing")).toThrow("Terrain missing not found");
  });

  it("save overwrites an existing object with the same id", () => {
    service.save(terrain);
    const replacement: TerrainObject = { id: "t1" };
    service.save(replacement);
    expect(service.load("t1")).toBe(replacement);
  });
});