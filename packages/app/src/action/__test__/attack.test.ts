import type {
  AttackAction,
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  ObjectService,
  OffenseDefinition,
  OffenseObject,
  UnitObject,
  UnitReferenceId,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { ATTACK_ACTION, AttackActionService } from "../attack";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });
const unitKey = (name: string) => key("unit", name);
const offenseKey = (name: string) => key("offense", name);

const offenseDefinition = (
  name: string,
  { damage, ammoMax = 9, range = [1, 1] }: { damage: Record<string, number>; ammoMax?: number; range?: [number, number] },
): OffenseDefinition => ({
  definition: offenseKey(name),
  ammoMax,
  rangeMin: range[0],
  rangeMax: range[1],
  damage: Object.entries(damage).map(([unit, amount]) => ({ unit: unitKey(unit), damage: amount })),
});

const definitions: Definition[] = [
  offenseDefinition("tank1", { damage: { recon: 85, tank: 55 } }), // cannon, 9 rounds: cannot hit infantry
  offenseDefinition("tank2", { damage: { infantry: 75, recon: 40 }, ammoMax: -1 }), // machine gun, unlimited
  offenseDefinition("infantry", { damage: { infantry: 55 }, ammoMax: -1 }),
  offenseDefinition("artillery", { damage: { infantry: 90, tank: 70 }, range: [2, 3] }),
  offenseDefinition("toy", { damage: { infantry: 0 }, ammoMax: -1 }), // has an entry for infantry, but it does no damage
  // an entry whose key has the name "infantry" but is not a unit: it must not count as an entry for the infantry unit
  { ...offenseDefinition("lookalike", { damage: {}, ammoMax: -1 }), damage: [{ unit: key("terrain", "infantry"), damage: 50 }] },
  offenseDefinition("pinprick", { damage: { infantry: 1 }, ammoMax: -1 }), // the smallest damage there is
  offenseDefinition("negative", { damage: { infantry: -5 }, ammoMax: -1 }), // an entry that would heal: not damage
  offenseDefinition("empty", { damage: { infantry: 30 }, ammoMax: 0 }), // a capacity of zero rounds is limited, not unlimited
];

/** The offense objects that exist: id, offense definition, and ammo when full. "orphan" has no definition. */
const offenseObjects: [id: string, definition: string, fullAmmo: number][] = [
  ["cannon", "tank1", 9],
  ["mg", "tank2", -1],
  ["rifle", "infantry", -1],
  ["gun", "artillery", 9],
  ["toy", "toy", -1],
  ["lookalike", "lookalike", -1],
  ["pinprick", "pinprick", -1],
  ["negative", "negative", -1],
  ["empty", "empty", 0],
  ["orphan", "missing", 9],
];

/** Which offense objects each kind of attacking unit has, primary weapon first. */
const loadouts: Record<string, string[]> = {
  tank: ["cannon", "mg"],
  infantry: ["rifle"],
  artillery: ["gun"],
  mixed: ["gun", "mg"], // artillery 2-3, then a machine gun
  harmless: ["toy"],
  "harmless-then-armed": ["toy", "mg"],
  lookalike: ["lookalike"],
  pinprick: ["pinprick"],
  negative: ["negative"],
  empty: ["empty"],
  ghost: ["nope"], // an id no offense object has
  "ghost-then-armed": ["nope", "mg"],
  orphaned: ["orphan"],
  "orphan-then-armed": ["orphan", "mg"],
  "half-orphan": ["mg", "orphan"],
  unarmed: [],
};

const storeKey = (id: UnitReferenceId) => `${id.gameId}:${id.unitId}:${id.id}`;

/**
 * A definition service and an object service, holding only offense objects, that remember what they were asked for.
 * Units can be saved too, but are only remembered: `savedUnits`.
 */
function createWorld(ammo: Record<string, number> = {}) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const requested: DefinitionKey[] = [];
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      requested.push(requestedKey);
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const stored = new Map<string, OffenseObject>(
    offenseObjects.map(([id, definition, fullAmmo]) => [
      `g1:attacker:${id}`,
      { identifier: { id, gameId: "g1", unitId: "attacker" }, definition: offenseKey(definition), ammo: ammo[id] ?? fullAmmo },
    ]),
  );
  const loaded: UnitReferenceId[] = [];
  const saved: OffenseObject[] = [];
  const savedUnits: UnitObject[] = [];
  const deletedUnits: Id[] = [];
  const deletedOffenses: UnitReferenceId[] = [];
  /** The scope of every save, in the order the saves were made. */
  const saves: string[] = [];
  /** The scope of every delete, in order. */
  const deletes: string[] = [];
  /** Every save and delete, as "save unit", "delete unit" and so on, in order. */
  const calls: string[] = [];
  /** Fails the test if the service asks for objects of a scope other than offense. */
  const offenseOnly = (scope: string) => {
    if (scope !== "offense") {
      throw new Error(`unexpected scope "${scope}"`);
    }
  };
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      offenseOnly(scope);
      return new Map([...stored.values()].map((object) => [object.identifier, object])) as unknown as Map<O["identifier"], O>;
    },
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push(scope);
      calls.push(`save ${scope}`);
      if (scope === "unit") {
        savedUnits.push(object as unknown as UnitObject);
        return object.identifier;
      }
      offenseOnly(scope);
      const offense = object as unknown as OffenseObject;
      saved.push(offense);
      stored.set(storeKey(offense.identifier), offense);
      return object.identifier;
    },
    load<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]) {
      offenseOnly(scope);
      loaded.push(identifier as UnitReferenceId);
      return stored.get(storeKey(identifier as UnitReferenceId)) as unknown as O | undefined;
    },
    delete<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]) {
      deletes.push(scope);
      calls.push(`delete ${scope}`);
      if (scope === "unit") {
        deletedUnits.push(identifier);
        return undefined;
      }
      offenseOnly(scope);
      deletedOffenses.push(identifier as UnitReferenceId);
      const object = stored.get(storeKey(identifier as UnitReferenceId));
      stored.delete(storeKey(identifier as UnitReferenceId));
      return object as unknown as O | undefined;
    },
  };

  return { service: new AttackActionService(definitionService, objectService), requested, loaded, saved, savedUnits, deletedUnits, deletedOffenses, saves, deletes, calls, stored };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0 });

type UnitOptions = { offense?: string[]; health?: number; gameId?: string; playerId?: string; x?: number; y?: number };

const unit = (
  id: string,
  definition: string,
  { offense = [], health = 100, gameId = "g1", playerId = id === "attacker" ? "p1" : "p2", x = id === "attacker" ? 0 : 1, y = 0 }: UnitOptions = {},
): UnitObject => ({
  identifier: { id, gameId },
  definition: unitKey(definition),
  position: { x, y },
  playerId,
  health,
  offenseIds: offense,
  moved: false,
  acted: false,
  fuel: 60,
});

/** The attacker (player p1, at 0,0) is one of the kinds in `loadouts`. */
const attacker = (kind: string, options: UnitOptions = {}) => unit("attacker", kind, { offense: loadouts[kind], ...options });
/** The target (player p2) is one square to the right of the attacker unless said otherwise. */
const target = (definition: string, options: UnitOptions = {}) => unit("target", definition, options);

const attack = (from: UnitObject, to: UnitObject, gameId = "g1"): AttackAction => ({
  definition: key("action", "attack"),
  game: game(gameId),
  unit: from,
  target: to,
});

describe("ATTACK_ACTION", () => {
  it("is the action named attack", () => {
    expect(ATTACK_ACTION).toEqual({ scope: "action", name: "attack" });
  });
});

describe("AttackActionService", () => {
  describe("canExecute", () => {
    it("is true for a unit of another player whose offense reaches the target and damages it", () => {
      const { service } = createWorld();
      expect(service.canExecute(attack(attacker("infantry"), target("infantry")))).toBe(true);
    });

    describe("teams and game", () => {
      it("is false when the target belongs to the same player", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("infantry", { playerId: "p1" }), target("infantry", { playerId: "p1" })))).toBe(false);
      });

      it("is false when the attacker is not in the action's game", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("infantry", { gameId: "g2" }), target("infantry")))).toBe(false);
      });

      it("is false when the target is not in the action's game", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("infantry"), target("infantry", { gameId: "g2" })))).toBe(false);
      });
    });

    describe("offense", () => {
      it("is false when none of the unit's offenses has an entry for the target", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("tank"), target("apc")))).toBe(false);
      });

      it("is false when the unit has no offense at all", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("unarmed"), target("infantry")))).toBe(false);
      });

      it("is true when only the secondary offense has an entry for the target", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("tank"), target("infantry")))).toBe(true);
      });

      it("is false when the only entry for the target does no damage", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("harmless"), target("infantry")))).toBe(false);
      });

      it("only counts an entry whose whole key matches the target's definition, not just its name", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("lookalike"), target("infantry")))).toBe(false);
      });

      it("counts an entry that does 1 damage: any damage above zero is enough", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("pinprick"), target("infantry")))).toBe(true);
      });

      it("does not count an entry with negative damage", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("negative"), target("infantry")))).toBe(false);
      });

      it("skips an entry that does no damage and uses an offense that does", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("harmless-then-armed"), target("infantry")))).toBe(true);
      });

      it("is false when the unit lists an offense object that does not exist", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("ghost"), target("infantry")))).toBe(false);
      });

      it("is false when the definition of an offense object that has to be consulted is not found", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("orphaned"), target("infantry")))).toBe(false);
        // the machine gun cannot damage a tank, so the orphan has to be consulted
        expect(service.canExecute(attack(attacker("half-orphan"), target("tank")))).toBe(false);
      });

      it("does not fall back to a later offense past one that is missing", () => {
        const { service, loaded } = createWorld();
        // the machine gun could damage an infantry, but the offense listed before it cannot be loaded or defined
        expect(service.canExecute(attack(attacker("ghost-then-armed"), target("infantry")))).toBe(false);
        expect(service.canExecute(attack(attacker("orphan-then-armed"), target("infantry")))).toBe(false);
        expect(loaded.map((id) => id.id)).toEqual(["nope", "orphan"]);
      });

      it("does not need an offense that does not have to be consulted", () => {
        const { service, loaded } = createWorld();
        // the machine gun is used on a recon, so the orphan is never even loaded
        expect(service.canExecute(attack(attacker("half-orphan"), target("recon")))).toBe(true);
        expect(loaded.map((id) => id.id)).toEqual(["mg"]);
      });
    });

    describe("range", () => {
      it("is false when the target is farther away than the offense reaches", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("infantry"), target("infantry", { x: 2 })))).toBe(false);
      });

      it("measures the distance along the grid, not in a straight line", () => {
        const { service } = createWorld();
        const diagonal = target("infantry", { x: 1, y: 1 }); // 2 squares away
        expect(service.canExecute(attack(attacker("infantry"), diagonal))).toBe(false);
      });

      it("is false when the target is closer than the offense's minimum range", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("artillery"), target("infantry", { x: 1 })))).toBe(false);
      });

      it.each([2, 3])("is true when the target is exactly %i away from a 2-3 range offense", (distance) => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("artillery"), target("infantry", { x: distance })))).toBe(true);
      });

      it("is false when the target is beyond the maximum range", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("artillery"), target("infantry", { x: 4 })))).toBe(false);
      });

      // an artillery (range 2-3) standing at (5, 5), so the target can be on any side of it
      it.each([
        { where: "2 to the right", x: 7, y: 5, reachable: true },
        { where: "2 to the left", x: 3, y: 5, reachable: true },
        { where: "2 above", x: 5, y: 3, reachable: true },
        { where: "2 below", x: 5, y: 7, reachable: true },
        { where: "1 diagonal step away (2 along the grid)", x: 4, y: 4, reachable: true },
        { where: "2 across and 1 up (3 along the grid)", x: 3, y: 4, reachable: true },
        { where: "1 across and 2 down (3 along the grid)", x: 6, y: 7, reachable: true },
        { where: "2 across and 2 down (4 along the grid)", x: 7, y: 7, reachable: false },
        { where: "3 across and 1 up (4 along the grid)", x: 2, y: 4, reachable: false },
        { where: "1 to the left (inside the minimum range)", x: 4, y: 5, reachable: false },
        { where: "1 above (inside the minimum range)", x: 5, y: 4, reachable: false },
        { where: "on the same square", x: 5, y: 5, reachable: false },
      ])("an offense of range 2-3 from (5, 5) reaches a target $where: $reachable", ({ x, y, reachable }) => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("artillery", { x: 5, y: 5 }), target("infantry", { x, y })))).toBe(reachable);
      });

      it("is true when the primary offense is too close to fire but the secondary reaches", () => {
        const { service } = createWorld();
        expect(service.canExecute(attack(attacker("mixed"), target("infantry", { x: 1 })))).toBe(true);
      });
    });

    describe("ammo", () => {
      it("is false when the only offense that can damage the target has no ammo left", () => {
        const { service } = createWorld({ gun: 0 });
        expect(service.canExecute(attack(attacker("artillery"), target("infantry", { x: 2 })))).toBe(false);
      });

      it("treats a capacity of zero rounds as limited, not unlimited: with none left it cannot fire", () => {
        const { service } = createWorld(); // "empty" has an ammoMax of 0 and no rounds
        expect(service.canExecute(attack(attacker("empty"), target("infantry")))).toBe(false);
      });

      it("is true with one round left", () => {
        const { service } = createWorld({ gun: 1 });
        expect(service.canExecute(attack(attacker("artillery"), target("infantry", { x: 2 })))).toBe(true);
      });

      it("does not need any rounds for an offense with unlimited ammo", () => {
        const { service } = createWorld({ rifle: 0 });
        expect(service.canExecute(attack(attacker("infantry"), target("infantry")))).toBe(true);
      });

      it("is true when the primary offense is out of ammo but the secondary can still damage the target", () => {
        const { service } = createWorld({ cannon: 0 });
        expect(service.canExecute(attack(attacker("tank"), target("recon")))).toBe(true);
      });
    });

    describe("lookups", () => {
      it("loads the unit's offense objects through the offense service in order, in the action's game", () => {
        const { service, loaded } = createWorld();
        service.canExecute(attack(attacker("tank"), target("infantry")));
        expect(loaded).toEqual([
          { id: "cannon", gameId: "g1", unitId: "attacker" },
          { id: "mg", gameId: "g1", unitId: "attacker" },
        ]);
      });

      it("stops loading once an offense is usable", () => {
        const { service, loaded, requested } = createWorld();
        service.canExecute(attack(attacker("tank"), target("recon")));
        expect(loaded.map((id) => id.id)).toEqual(["cannon"]);
        expect(requested).toEqual([offenseKey("tank1")]);
      });

      it("looks up each offense object's definition through the definition service", () => {
        const { service, requested } = createWorld();
        service.canExecute(attack(attacker("tank"), target("infantry")));
        expect(requested).toEqual([offenseKey("tank1"), offenseKey("tank2")]);
      });

      it("loads nothing when the units cannot fight at all", () => {
        const { service, loaded } = createWorld();
        service.canExecute(attack(attacker("tank", { playerId: "p2" }), target("recon")));
        expect(loaded).toEqual([]);
      });
    });

    it("changes nothing and saves nothing", () => {
      const { service, saves } = createWorld();
      const action = attack(attacker("tank"), target("recon"));
      const before = structuredClone(action);
      service.canExecute(action);
      expect(action).toEqual(before);
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the action with the damage taken off the target's health", () => {
      const { service } = createWorld();
      const action = attack(attacker("tank"), target("recon", { health: 100 }));
      expect(service.preview(action)).toEqual({ ...action, target: { ...action.target, health: 15 } }); // cannon: 85
    });

    it("never takes the target's health below zero", () => {
      const { service } = createWorld();
      expect(service.preview(attack(attacker("tank"), target("recon", { health: 30 }))).target.health).toBe(0);
    });

    it.each([
      ["a cannon with ammo", {}, () => attack(attacker("tank"), target("recon"))],
      ["a machine gun with unlimited ammo", {}, () => attack(attacker("infantry"), target("infantry"))],
      ["a secondary offense, the primary having no ammo", { cannon: 0 }, () => attack(attacker("tank"), target("recon"))],
      ["the offense that reaches a distant target", {}, () => attack(attacker("mixed"), target("infantry", { x: 2 }))],
      ["the offense that reaches a close target", {}, () => attack(attacker("mixed"), target("infantry", { x: 1 }))],
      ["an entry that does 1 damage", {}, () => attack(attacker("pinprick"), target("infantry"))],
      ["a target with little health left", {}, () => attack(attacker("tank"), target("recon", { health: 30 }))],
    ])("gives the action that execute gives, for %s", (_name, ammo, build) => {
      expect(createWorld(ammo).service.preview(build())).toEqual(createWorld(ammo).service.execute(build()));
    });

    it("saves nothing, neither the offense nor the target, and spends no ammo", () => {
      const { service, saved, savedUnits, saves, stored } = createWorld();
      service.preview(attack(attacker("tank"), target("recon")));
      expect(saves).toEqual([]);
      expect(saved).toEqual([]);
      expect(savedUnits).toEqual([]);
      expect(stored.get("g1:attacker:cannon")?.ammo).toBe(9);
    });

    it("saves nothing even for an offense whose capacity is zero", () => {
      const { service, saves } = createWorld({ empty: 1 });
      expect(service.preview(attack(attacker("empty"), target("infantry"))).target.health).toBe(70);
      expect(saves).toEqual([]);
    });

    it("looks the offense up, as canExecute does", () => {
      const { service, loaded } = createWorld();
      service.preview(attack(attacker("tank"), target("recon")));
      expect(loaded.map((id) => id.id)).toEqual(["cannon"]);
    });

    it("gives the same action every time, since nothing is spent", () => {
      const { service } = createWorld({ gun: 1 });
      const action = attack(attacker("artillery"), target("infantry", { x: 2 }));
      const first = service.preview(action);
      expect(service.preview(action)).toEqual(first);
      expect(service.canExecute(action)).toBe(true);
      expect(service.execute(action)).toEqual(first);
      expect(service.canExecute(action)).toBe(false);
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const action = attack(attacker("tank"), target("recon"));
      const before = structuredClone(action);
      service.preview(action);
      expect(action).toEqual(before);
    });

    it.each([
      ["the units belong to the same player", () => attack(attacker("infantry", { playerId: "p1" }), target("infantry", { playerId: "p1" }))],
      ["the attacker is not in the game", () => attack(attacker("infantry", { gameId: "g2" }), target("infantry"))],
      ["the target is out of range", () => attack(attacker("infantry"), target("infantry", { x: 5 }))],
      ["the offense has no ammo", () => attack(attacker("artillery"), target("infantry", { x: 2 }))],
      ["no offense has an entry for the target", () => attack(attacker("unarmed"), target("infantry"))],
    ])("gives the action as it is when %s", (_reason, build) => {
      const { service, saves } = createWorld({ gun: 0 });
      const action = build();
      expect(service.canExecute(action)).toBe(false);
      expect(service.preview(action)).toBe(action);
      expect(saves).toEqual([]);
    });
  });

  describe("execute", () => {
    it("subtracts the damage from the target's health", () => {
      const { service } = createWorld();
      const result = service.execute(attack(attacker("tank"), target("recon", { health: 100 })));
      expect(result.target.health).toBe(15); // cannon: 85
    });

    it("saves the target, with the health it ends up with", () => {
      const { service, savedUnits } = createWorld();
      const result = service.execute(attack(attacker("tank"), target("recon", { health: 100 })));
      expect(savedUnits).toHaveLength(1);
      expect(savedUnits[0]).toBe(result.target);
      expect(savedUnits[0].identifier).toEqual({ id: "target", gameId: "g1" });
      expect(savedUnits[0].health).toBe(15);
    });

    it("saves the target after the offense it spent a round of", () => {
      const { service, saves } = createWorld();
      service.execute(attack(attacker("tank"), target("recon")));
      expect(saves).toEqual(["offense", "unit"]);
    });

    it("saves the target alone when the offense has unlimited ammo", () => {
      const { service, saves, saved, savedUnits } = createWorld();
      service.execute(attack(attacker("infantry"), target("infantry")));
      expect(saves).toEqual(["unit"]);
      expect(saved).toEqual([]);
      expect(savedUnits.map((unit) => unit.health)).toEqual([45]);
    });

    it("does not delete a target that has health left, or its offenses", () => {
      const { service, deletes, deletedUnits, deletedOffenses } = createWorld();
      service.execute(attack(attacker("tank"), target("recon", { health: 86, offense: ["rifle"] })));
      expect(deletes).toEqual([]);
      expect(deletedUnits).toEqual([]);
      expect(deletedOffenses).toEqual([]);
    });

    it.each([1, 30, 84, 85, 86, 100, 500])("saves or deletes a target of %i health according to the health the action gives it", (health) => {
      const { service, savedUnits, deletedUnits } = createWorld();
      const result = service.execute(attack(attacker("tank"), target("recon", { health })));
      if (result.target.health <= 0) {
        expect(deletedUnits).toEqual([result.target.identifier]);
        expect(savedUnits).toEqual([]);
      } else {
        expect(savedUnits).toHaveLength(1);
        expect(savedUnits[0]).toBe(result.target);
        expect(deletedUnits).toEqual([]);
      }
      expect(result.target.health).toBe(Math.max(0, health - 85));
    });

    describe("a target the damage takes to zero health or below", () => {
      it("is deleted, by its identifier, and not saved", () => {
        const { service, savedUnits, deletedUnits, calls } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 30 })));
        expect(deletedUnits).toEqual([{ id: "target", gameId: "g1" }]);
        expect(savedUnits).toEqual([]);
        expect(calls).not.toContain("save unit");
      });

      it("is deleted when the damage just equals its health, with its offenses", () => {
        const { service, savedUnits, deletedUnits, deletedOffenses } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 85, offense: ["rifle"] })));
        expect(deletedUnits).toEqual([{ id: "target", gameId: "g1" }]);
        expect(deletedOffenses).toEqual([{ id: "rifle", gameId: "g1", unitId: "target" }]);
        expect(savedUnits).toEqual([]);
      });

      it("is deleted when the damage is one more than its health", () => {
        const { service, deletedUnits } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 84 })));
        expect(deletedUnits).toHaveLength(1);
      });

      it("is still given with zero health in the action", () => {
        const { service } = createWorld();
        expect(service.execute(attack(attacker("tank"), target("recon", { health: 30 }))).target.health).toBe(0);
      });

      it("is deleted after the round the offense spent is saved", () => {
        const { service, calls } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 30 })));
        expect(calls).toEqual(["save offense", "delete unit"]);
      });

      it("is the only thing saved or deleted when the offense has unlimited ammo", () => {
        const { service, calls } = createWorld();
        service.execute(attack(attacker("infantry"), target("infantry", { health: 50 })));
        expect(calls).toEqual(["delete unit"]);
      });

      it("takes its offenses with it, in the order it lists them, after the unit", () => {
        const { service, deletedOffenses, calls } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 30, offense: ["rifle", "gun"] })));
        expect(deletedOffenses).toEqual([
          { id: "rifle", gameId: "g1", unitId: "target" },
          { id: "gun", gameId: "g1", unitId: "target" },
        ]);
        expect(calls).toEqual(["save offense", "delete unit", "delete offense", "delete offense"]);
      });

      it("takes only its own offenses, not the attacker's", () => {
        const { service, deletedOffenses, stored } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 30, offense: ["rifle"] })));
        expect(deletedOffenses.map((id) => id.unitId)).toEqual(["target"]);
        expect(stored.has("g1:attacker:cannon")).toBe(true);
        expect(stored.has("g1:attacker:mg")).toBe(true);
      });

      it("takes no offenses when it has none", () => {
        const { service, deletedOffenses } = createWorld();
        service.execute(attack(attacker("tank"), target("recon", { health: 30, offense: [] })));
        expect(deletedOffenses).toEqual([]);
      });

      it("is not deleted by a preview", () => {
        const { service, calls } = createWorld();
        const result = service.preview(attack(attacker("tank"), target("recon", { health: 30, offense: ["rifle"] })));
        expect(result.target.health).toBe(0);
        expect(calls).toEqual([]);
      });
    });

    it("does not save the attacker", () => {
      const { service, savedUnits } = createWorld();
      service.execute(attack(attacker("tank"), target("recon")));
      expect(savedUnits.map((unit) => unit.identifier.id)).toEqual(["target"]);
    });

    it("saves the offense object that was used with one round fewer", () => {
      const { service, saved, stored } = createWorld();
      service.execute(attack(attacker("tank"), target("recon")));
      expect(saved).toEqual([{ identifier: { id: "cannon", gameId: "g1", unitId: "attacker" }, definition: offenseKey("tank1"), ammo: 8 }]);
      expect(stored.get("g1:attacker:cannon")?.ammo).toBe(8);
    });

    it("subtracts from the target's current health", () => {
      const { service } = createWorld();
      expect(service.execute(attack(attacker("tank"), target("recon", { health: 90 }))).target.health).toBe(5);
    });

    it("never takes the target's health below zero", () => {
      const { service } = createWorld();
      expect(service.execute(attack(attacker("tank"), target("recon", { health: 30 }))).target.health).toBe(0);
    });

    it("spends ammo only on the offense that was used", () => {
      const { service, saved } = createWorld();
      service.execute(attack(attacker("tank"), target("recon")));
      expect(saved.map((object) => object.identifier.id)).toEqual(["cannon"]);
    });

    it("takes 1 off the health for an entry that does 1 damage", () => {
      const { service } = createWorld();
      expect(service.execute(attack(attacker("pinprick"), target("infantry", { health: 100 }))).target.health).toBe(99);
    });

    it("spends a round whenever the capacity is not negative, even for a capacity of zero", () => {
      const { service, saved } = createWorld({ empty: 1 }); // a round is stored although the capacity is 0
      const result = service.execute(attack(attacker("empty"), target("infantry")));
      expect(result.target.health).toBe(70);
      expect(saved.map((object) => [object.identifier.id, object.ammo])).toEqual([["empty", 0]]);
    });

    it("takes the target to exactly zero when the damage equals its health", () => {
      const { service } = createWorld();
      expect(service.execute(attack(attacker("tank"), target("recon", { health: 85 }))).target.health).toBe(0);
    });

    it("saves nothing for an offense with unlimited ammo", () => {
      const { service, saved } = createWorld();
      const result = service.execute(attack(attacker("infantry"), target("infantry")));
      expect(result.target.health).toBe(45);
      expect(saved).toEqual([]);
    });

    it("falls back to the secondary offense when the primary has no ammo, and spends nothing", () => {
      const { service, saved } = createWorld({ cannon: 0 });
      const result = service.execute(attack(attacker("tank"), target("recon")));
      expect(result.target.health).toBe(60); // machine gun: 40
      expect(saved).toEqual([]);
    });

    it("uses the offense that reaches the target: the primary at its range, the secondary when it is too close", () => {
      const far = createWorld();
      const farResult = far.service.execute(attack(attacker("mixed"), target("infantry", { x: 2 })));
      expect(farResult.target.health).toBe(10); // artillery: 90
      expect(far.saved.map((object) => [object.identifier.id, object.ammo])).toEqual([["gun", 8]]);

      const near = createWorld();
      const nearResult = near.service.execute(attack(attacker("mixed"), target("infantry", { x: 1 })));
      expect(nearResult.target.health).toBe(25); // machine gun: 75
      expect(near.saved).toEqual([]);
    });

    it("does damage with the offense after one whose entry does no damage", () => {
      const { service } = createWorld();
      const result = service.execute(attack(attacker("harmless-then-armed"), target("infantry")));
      expect(result.target.health).toBe(25); // the toy's 0 is skipped; machine gun: 75
    });

    it("uses up the ammo for the next attack: the spent round is seen when the offense is loaded again", () => {
      const { service } = createWorld({ gun: 1 });
      const action = attack(attacker("artillery"), target("infantry", { x: 2 }));
      expect(service.canExecute(action)).toBe(true);
      service.execute(action);
      expect(service.canExecute(action)).toBe(false);
    });

    it("returns the same action with only the target's health changed", () => {
      const { service } = createWorld();
      const action = attack(attacker("tank"), target("recon"));
      expect(service.execute(action)).toEqual({ ...action, target: { ...action.target, health: 15 } });
    });

    it("does not change the action it was given or the offense object it loaded", () => {
      const { service, stored } = createWorld();
      const action = attack(attacker("tank"), target("recon"));
      const before = structuredClone(action);
      const cannonBefore = stored.get("g1:attacker:cannon");
      const cannonAmmoBefore = cannonBefore?.ammo;
      service.execute(action);
      expect(action).toEqual(before);
      expect(cannonBefore?.ammo).toBe(cannonAmmoBefore);
    });

    it.each([
      ["the units belong to the same player", () => attack(attacker("infantry", { playerId: "p1" }), target("infantry", { playerId: "p1" }))],
      ["the attacker is not in the game", () => attack(attacker("infantry", { gameId: "g2" }), target("infantry"))],
      ["the target is out of range", () => attack(attacker("infantry"), target("infantry", { x: 5 }))],
      ["the offense has no ammo", () => attack(attacker("artillery"), target("infantry", { x: 2 }))],
      ["no offense has an entry for the target", () => attack(attacker("unarmed"), target("infantry"))],
    ])("returns the action as it is and saves and deletes nothing when %s", (_reason, build) => {
      const { service, calls } = createWorld({ gun: 0 });
      const action = build();
      expect(service.canExecute(action)).toBe(false);
      expect(service.execute(action)).toBe(action);
      expect(calls).toEqual([]);
    });
  });
});
