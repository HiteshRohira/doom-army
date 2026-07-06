import { describe, expect, it, vi } from "vitest";
import { WEAPON } from "@arena/shared";
import { GameSimulation } from "./game";

describe("GameSimulation", () => {
  it("accelerates a player from authoritative input", () => {
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    const startX = game.players.get("p1")!.x;
    game.setInput("p1", { sequence: 1, moveX: 1, aimX: 1, aimY: 0 });

    for (let tick = 0; tick < 15; tick += 1) game.step(1 / 30);

    expect(game.players.get("p1")!.x).toBeGreaterThan(startX + 50);
  });

  it("spawns server-owned bullets and consumes ammunition", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    game.setInput("p1", { sequence: 1, aimX: 1, aimY: 0, firing: true });

    game.step(1 / 30);

    expect(game.projectiles).toHaveLength(1);
    expect(game.players.get("p1")!.ammo).toBe(WEAPON.magazineSize - 1);
  });

  it("awards a kill after five SMG hits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    game.addPlayer("p2", "Bravo", 1);
    const attacker = game.players.get("p1")!;
    const target = game.players.get("p2")!;
    attacker.x = 500;
    attacker.y = 780;
    target.x = 700;
    target.y = 780;
    target.invulnerableMs = 0;
    game.setInput("p1", { sequence: 1, aimX: 1, aimY: 0, firing: true });

    for (let tick = 0; tick < 50 && target.alive; tick += 1) game.step(1 / 30);

    expect(target.alive).toBe(false);
    expect(target.deaths).toBe(1);
    expect(attacker.kills).toBe(1);
  });
});

