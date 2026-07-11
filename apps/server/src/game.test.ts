import { afterEach, describe, expect, it, vi } from "vitest";
import { WEAPON } from "@doom-army/shared";
import { GameSimulation } from "./game";

describe("GameSimulation", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("awards a kill after sustained pulse-rifle hits", () => {
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

  it("launches with two grenades and throws only on a new grenade press", () => {
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    game.setInput("p1", { sequence: 1, aimX: 1, aimY: 0, grenade: true });

    game.step(1 / 30);
    game.step(1 / 30);

    expect(game.players.get("p1")!.grenades).toBe(1);
    expect(game.grenades).toHaveLength(1);
  });

  it("collects ammo and schedules the pickup at a new spawn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    const player = game.players.get("p1")!;
    const pickup = game.pickups.find((entry) => entry.kind === "ammo")!;
    player.reserveAmmo = 0;
    player.x = pickup.x;
    player.y = pickup.y;

    game.step(1 / 30);

    expect(player.reserveAmmo).toBe(WEAPON.ammoPickupAmount);
    expect(pickup.active).toBe(false);
    expect(pickup.respawnMs).toBeGreaterThan(0);
  });

  it("uses upward boost input to produce upward boost", () => {
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    const player = game.players.get("p1")!;
    for (let tick = 0; tick < 10; tick += 1) game.step(1 / 30);
    game.setInput("p1", { sequence: 1, moveX: 0, aimX: 1, aimY: 0, boostY: -1 });

    game.step(1 / 30);

    expect(player.vy).toBeLessThan(0);
    expect(player.fuel).toBeLessThan(100);
  });

  it("equips a weapon pickup with its own magazine", () => {
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    const player = game.players.get("p1")!;
    const pickup = game.pickups.find((entry) => entry.kind === "scatter")!;
    player.x = pickup.x;
    player.y = pickup.y;

    game.step(1 / 30);

    expect(player.weapon).toBe("scatter");
    expect(player.ammo).toBe(7);
  });

  it("executes one dash per cooldown window", () => {
    const game = new GameSimulation();
    game.addPlayer("p1", "Alpha", 0);
    const player = game.players.get("p1")!;
    game.setInput("p1", { sequence: 1, moveX: 1, aimX: 1, aimY: 0, dash: true });

    game.step(1 / 30);

    expect(player.vx).toBeGreaterThan(600);
    expect(player.dashCooldownMs).toBeGreaterThan(1000);
  });
});
