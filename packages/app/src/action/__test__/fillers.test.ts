import { type DefinitionKey } from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { fillNewMovement, fillNewOffense, fillNewUnit } from "../fillers";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

describe("fillNewMovement", () => {
  it("gives the movement of the unit, in its game, with the fuel it starts with", () => {
    expect(fillNewMovement("g1", "unit-1", "movement-1", key("movement", "foot"), 99)).toEqual({
      identifier: { id: "movement-1", gameId: "g1", unitId: "unit-1" },
      definition: key("movement", "foot"),
      fuel: 99,
    });
  });

  it("copies the key, so the movement does not share it", () => {
    const foot = key("movement", "foot");
    expect(fillNewMovement("g1", "unit-1", "movement-1", foot, 99).definition).not.toBe(foot);
  });
});

describe("fillNewOffense", () => {
  it("gives the offense of the unit, in its game, with the ammo it starts with", () => {
    expect(fillNewOffense("g1", "unit-1", "offense-1", key("offense", "rifle"), 9)).toEqual({
      identifier: { id: "offense-1", gameId: "g1", unitId: "unit-1" },
      definition: key("offense", "rifle"),
      ammo: 9,
    });
  });

  it("copies the key, so the offense does not share it", () => {
    const rifle = key("offense", "rifle");
    expect(fillNewOffense("g1", "unit-1", "offense-1", rifle, 9).definition).not.toBe(rifle);
  });
});

describe("fillNewUnit", () => {
  it("gives the unit of the player, in its game, at full health, neither moved nor acted", () => {
    expect(fillNewUnit("g1", "p1", "unit-1", key("unit", "infantry"), "movement-1", ["offense-1", "offense-2"], { x: 1, y: 5 })).toEqual({
      identifier: { id: "unit-1", gameId: "g1" },
      definition: key("unit", "infantry"),
      position: { x: 1, y: 5 },
      moved: false,
      acted: false,
      health: 100,
      playerId: "p1",
      movementId: "movement-1",
      offenseIds: ["offense-1", "offense-2"],
    });
  });

  it("copies the key and the position, so the unit does not share them", () => {
    const infantry = key("unit", "infantry");
    const position = { x: 1, y: 5 };
    const unit = fillNewUnit("g1", "p1", "unit-1", infantry, "movement-1", [], position);
    expect(unit.definition).not.toBe(infantry);
    expect(unit.position).not.toBe(position);
  });
});
