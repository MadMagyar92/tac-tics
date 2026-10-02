import type { GameObject } from '@tac-tics/types'
import { describe, it, expect, beforeEach } from "vitest";
import { GameService } from "../game";

describe("GameService", () => {
  let service: GameService;
  let game: GameObject;

  beforeEach(() => {
    service = new GameService();
    game = { id: "g1", name: "g1" };
  });

  it("save returns the object's id", () => {
    expect(service.save(game)).toBe("g1");
  });

  it("load returns a previously saved object", () => {
    service.save(game);
    expect(service.load("g1")).toEqual(game);
  });

  it("load throws for an unknown id", () => {
    expect(() => service.load("missing")).toThrow("Game missing not found");
  });

  it("save overwrites an existing object with the same id", () => {
    service.save(game);
    service.save({ ...game, name: "g2" });
    expect(service.load("g1").name).toBe("g2");
  });
});