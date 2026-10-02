import type { UnitObject } from '@tac-tics/types'
import { describe, it, expect, beforeEach } from "vitest";
import { UnitService } from "../unit";

describe("UnitService", () => {
  let service: UnitService;
  let unit: UnitObject;

  beforeEach(() => {
    service = new UnitService();
    unit = { id: "u1" };
  });

  it("save returns the object's id", () => {
    expect(service.save(unit)).toBe("u1");
  });

  it("load returns a previously saved object", () => {
    service.save(unit);
    expect(service.load("u1")).toEqual(unit);
  });

  it("load throws for an unknown id", () => {
    expect(() => service.load("missing")).toThrow("Unit missing not found");
  });

  it("save overwrites an existing object with the same id", () => {
    service.save(unit);
    const replacement: UnitObject = { id: "u1" };
    service.save(replacement);
    expect(service.load("u1")).toBe(replacement);
  });
});