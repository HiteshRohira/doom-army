import {
  clamp,
  GRENADE,
  IDLE_INPUT,
  MATCH,
  MOVEMENT,
  PICKUP_POINTS,
  PLATFORMS,
  sanitizeInput,
  SOLID_COVER,
  SPAWN_POINTS,
  WEAPON,
  WORLD,
  type ExplosionSnapshot,
  type GrenadeSnapshot,
  type PickupKind,
  type PickupSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
} from "@arena/shared";

interface SimPlayer extends PlayerSnapshot {
  input: PlayerInput;
  previousBoosting: boolean;
  previousGrenade: boolean;
  fireCooldownMs: number;
  reloadRemainingMs: number;
  onGround: boolean;
}

interface SimProjectile extends ProjectileSnapshot {
  ageMs: number;
}

interface SimGrenade extends GrenadeSnapshot {}

interface SimExplosion extends ExplosionSnapshot {}

interface SimPickup extends PickupSnapshot {}

type CollisionRectangle = { x: number; y: number; width: number; height: number };

const COLLIDERS: CollisionRectangle[] = [...PLATFORMS, ...SOLID_COVER];

export class GameSimulation {
  readonly players = new Map<string, SimPlayer>();
  readonly projectiles: SimProjectile[] = [];
  readonly grenades: SimGrenade[] = [];
  readonly explosions: SimExplosion[] = [];
  readonly pickups: SimPickup[] = [];
  private nextProjectileId = 1;
  private nextGrenadeId = 1;
  private nextExplosionId = 1;

  constructor() {
    this.resetPickups();
  }

  addPlayer(id: string, name: string, slot: 0 | 1): void {
    const spawn = SPAWN_POINTS[slot];
    this.players.set(id, {
      id,
      name,
      slot,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      aimX: slot === 0 ? 1 : -1,
      aimY: 0,
      health: 100,
      fuel: 100,
      ammo: WEAPON.magazineSize,
      reserveAmmo: WEAPON.startingReserve,
      grenades: GRENADE.maxCount,
      reloading: false,
      ready: false,
      alive: true,
      respawnMs: 0,
      invulnerableMs: MATCH.spawnProtectionMs,
      kills: 0,
      deaths: 0,
      input: { ...IDLE_INPUT, aimX: slot === 0 ? 1 : -1 },
      previousBoosting: false,
      previousGrenade: false,
      fireCooldownMs: 0,
      reloadRemainingMs: 0,
      onGround: false,
    });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    removeWhere(this.projectiles, (projectile) => projectile.ownerId === id);
    removeWhere(this.grenades, (grenade) => grenade.ownerId === id);
  }

  setReady(id: string, ready: boolean): void {
    const player = this.players.get(id);
    if (player) player.ready = ready;
  }

  setInput(id: string, input: Partial<PlayerInput>): void {
    const player = this.players.get(id);
    if (!player) return;
    const next = sanitizeInput(input);
    if (next.sequence >= player.input.sequence) player.input = next;
  }

  reset(): void {
    this.projectiles.length = 0;
    this.grenades.length = 0;
    this.explosions.length = 0;
    this.nextProjectileId = 1;
    this.nextGrenadeId = 1;
    this.nextExplosionId = 1;
    this.resetPickups();
    for (const player of this.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.ready = false;
      this.respawn(player, true);
    }
  }

  step(dtSeconds: number): void {
    const dt = clamp(dtSeconds, 0, 0.05);
    const dtMs = dt * 1000;

    for (const player of this.players.values()) {
      player.fireCooldownMs = Math.max(0, player.fireCooldownMs - dtMs);
      player.invulnerableMs = Math.max(0, player.invulnerableMs - dtMs);

      if (!player.alive) {
        player.respawnMs = Math.max(0, player.respawnMs - dtMs);
        if (player.respawnMs === 0) this.respawn(player);
        continue;
      }

      this.updateMovement(player, dt);
      this.updateWeapon(player, dtMs);
      this.updateGrenadeThrow(player);
      if (player.y > WORLD.height + 100) this.kill(player, null);
    }

    this.updateProjectiles(dt, dtMs);
    this.updateGrenades(dt, dtMs);
    this.updateExplosions(dtMs);
    this.updatePickups(dtMs);
  }

  getPlayers(): PlayerSnapshot[] {
    return [...this.players.values()].map(
      ({
        input: _input,
        previousBoosting: _boosting,
        previousGrenade: _grenade,
        fireCooldownMs: _cooldown,
        reloadRemainingMs: _reload,
        onGround: _ground,
        ...snapshot
      }) => snapshot,
    );
  }

  getProjectiles(): ProjectileSnapshot[] {
    return this.projectiles.map(({ ageMs: _age, ...snapshot }) => snapshot);
  }

  getGrenades(): GrenadeSnapshot[] {
    return this.grenades.map((grenade) => ({ ...grenade }));
  }

  getExplosions(): ExplosionSnapshot[] {
    return this.explosions.map((explosion) => ({ ...explosion }));
  }

  getPickups(): PickupSnapshot[] {
    return this.pickups.map((pickup) => ({ ...pickup }));
  }

  private updateMovement(player: SimPlayer, dt: number): void {
    const input = player.input;
    player.aimX = input.aimX;
    player.aimY = input.aimY;

    const acceleration = player.onGround ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration;
    player.vx += input.moveX * acceleration * dt;
    const friction = player.onGround ? MOVEMENT.groundFriction : MOVEMENT.airFriction;
    if (Math.abs(input.moveX) < 0.08) player.vx *= Math.exp(-friction * dt);
    player.vx = clamp(player.vx, -MOVEMENT.maxSpeed, MOVEMENT.maxSpeed);

    const boostStrength = clamp(-input.boostY, 0, 1);
    const boosting = boostStrength > 0.16;
    if (boosting && !player.previousBoosting && player.onGround) {
      player.vy = -MOVEMENT.jumpVelocity * 0.78;
      player.onGround = false;
    }
    if (boosting && player.fuel > 0) {
      player.vy -= MOVEMENT.jetpackAcceleration * boostStrength * dt;
      player.fuel = Math.max(0, player.fuel - MOVEMENT.fuelUsePerSecond * boostStrength * dt);
    } else if (input.boostY > 0.2 && !player.onGround) {
      player.vy += MOVEMENT.gravity * input.boostY * 1.2 * dt;
    }

    if (player.onGround) player.fuel = Math.min(100, player.fuel + MOVEMENT.fuelRechargePerSecond * dt);

    player.previousBoosting = boosting;
    player.vy = Math.min(MOVEMENT.maxFallSpeed, player.vy + MOVEMENT.gravity * dt);
    this.moveAndCollide(player, dt);
  }

  private moveAndCollide(player: SimPlayer, dt: number): void {
    const halfWidth = WORLD.playerWidth / 2;
    const halfHeight = WORLD.playerHeight / 2;

    player.x += player.vx * dt;
    player.x = clamp(player.x, halfWidth, WORLD.width - halfWidth);
    for (const collider of COLLIDERS) {
      if (!overlapsPlayer(player, collider)) continue;
      if (player.vx > 0) player.x = collider.x - halfWidth;
      else if (player.vx < 0) player.x = collider.x + collider.width + halfWidth;
      player.vx = 0;
    }

    const previousY = player.y;
    player.y += player.vy * dt;
    player.onGround = false;
    for (const collider of COLLIDERS) {
      if (!overlapsPlayer(player, collider)) continue;
      const previousBottom = previousY + halfHeight;
      const previousTop = previousY - halfHeight;
      if (player.vy >= 0 && previousBottom <= collider.y + 4) {
        player.y = collider.y - halfHeight;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0 && previousTop >= collider.y + collider.height - 4) {
        player.y = collider.y + collider.height + halfHeight;
        player.vy = 0;
      }
    }
  }

  private updateWeapon(player: SimPlayer, dtMs: number): void {
    if (player.reloadRemainingMs > 0) {
      player.reloadRemainingMs = Math.max(0, player.reloadRemainingMs - dtMs);
      player.reloading = player.reloadRemainingMs > 0;
      if (!player.reloading) {
        const amount = Math.min(WEAPON.magazineSize - player.ammo, player.reserveAmmo);
        player.ammo += amount;
        player.reserveAmmo -= amount;
      }
      return;
    }

    if (((player.input.reload && player.ammo < WEAPON.magazineSize) || player.ammo === 0) && player.reserveAmmo > 0) {
      player.reloading = true;
      player.reloadRemainingMs = WEAPON.reloadMs;
      return;
    }

    if (!player.input.firing || player.fireCooldownMs > 0 || player.ammo === 0) return;

    const spread = (Math.random() * 2 - 1) * WEAPON.spreadRadians;
    const angle = Math.atan2(player.aimY, player.aimX) + spread;
    const aimX = Math.cos(angle);
    const aimY = Math.sin(angle);
    this.projectiles.push({
      id: this.nextProjectileId++,
      ownerId: player.id,
      x: player.x + aimX * 38,
      y: player.y - 5 + aimY * 15,
      vx: aimX * WEAPON.bulletSpeed,
      vy: aimY * WEAPON.bulletSpeed,
      ageMs: 0,
    });
    player.ammo -= 1;
    player.fireCooldownMs = WEAPON.fireIntervalMs;
  }

  private updateGrenadeThrow(player: SimPlayer): void {
    const pressed = player.input.grenade;
    if (pressed && !player.previousGrenade && player.grenades > 0) {
      const throwAngle = Math.atan2(player.aimY, player.aimX);
      player.grenades -= 1;
      this.grenades.push({
        id: this.nextGrenadeId++,
        ownerId: player.id,
        x: player.x + Math.cos(throwAngle) * 34,
        y: player.y - 8 + Math.sin(throwAngle) * 12,
        vx: Math.cos(throwAngle) * GRENADE.throwSpeed + player.vx * 0.35,
        vy: Math.sin(throwAngle) * GRENADE.throwSpeed - 180,
        fuseMs: GRENADE.fuseMs,
      });
    }
    player.previousGrenade = pressed;
  }

  private updateProjectiles(dt: number, dtMs: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.vx * dt;
      const endY = startY + projectile.vy * dt;
      projectile.ageMs += dtMs;

      let nearestT = 1.01;
      let hitPlayer: SimPlayer | null = null;

      for (const collider of COLLIDERS) {
        const t = segmentRectangle(startX, startY, endX, endY, collider.x, collider.y, collider.width, collider.height);
        if (t !== null && t < nearestT) nearestT = t;
      }

      for (const player of this.players.values()) {
        if (!player.alive || player.id === projectile.ownerId || player.invulnerableMs > 0) continue;
        const t = segmentRectangle(
          startX,
          startY,
          endX,
          endY,
          player.x - WORLD.playerWidth / 2,
          player.y - WORLD.playerHeight / 2,
          WORLD.playerWidth,
          WORLD.playerHeight,
        );
        if (t !== null && t < nearestT) {
          nearestT = t;
          hitPlayer = player;
        }
      }

      if (nearestT <= 1) {
        if (hitPlayer) this.damage(hitPlayer, projectile.ownerId, WEAPON.damage);
        this.projectiles.splice(index, 1);
        continue;
      }

      projectile.x = endX;
      projectile.y = endY;
      if (
        projectile.ageMs >= WEAPON.bulletLifetimeMs ||
        projectile.x < 0 ||
        projectile.x > WORLD.width ||
        projectile.y < 0 ||
        projectile.y > WORLD.height
      ) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  private updateGrenades(dt: number, dtMs: number): void {
    const radius = 10;
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      const grenade = this.grenades[index];
      grenade.fuseMs = Math.max(0, grenade.fuseMs - dtMs);
      grenade.vy += MOVEMENT.gravity * 0.72 * dt;

      const previousX = grenade.x;
      grenade.x += grenade.vx * dt;
      if (grenade.x < radius || grenade.x > WORLD.width - radius || COLLIDERS.some((collider) => circleIntersectsRectangle(grenade.x, grenade.y, radius, collider))) {
        grenade.x = clamp(previousX, radius, WORLD.width - radius);
        grenade.vx *= -0.54;
      }

      const previousY = grenade.y;
      grenade.y += grenade.vy * dt;
      if (COLLIDERS.some((collider) => circleIntersectsRectangle(grenade.x, grenade.y, radius, collider))) {
        grenade.y = previousY;
        grenade.vy *= -0.46;
        grenade.vx *= 0.84;
        if (Math.abs(grenade.vy) < 42) grenade.vy = 0;
      }

      if (grenade.fuseMs === 0 || grenade.y > WORLD.height + 50) {
        this.explodeGrenade(grenade);
        this.grenades.splice(index, 1);
      }
    }
  }

  private explodeGrenade(grenade: SimGrenade): void {
    this.explosions.push({
      id: this.nextExplosionId++,
      x: grenade.x,
      y: grenade.y,
      radius: GRENADE.radius,
      ageMs: 0,
    });
    for (const player of this.players.values()) {
      if (!player.alive || player.invulnerableMs > 0) continue;
      const distance = Math.hypot(player.x - grenade.x, player.y - grenade.y);
      if (distance >= GRENADE.radius) continue;
      const damage = Math.max(12, Math.round(GRENADE.maxDamage * (1 - distance / GRENADE.radius)));
      this.damage(player, grenade.ownerId, damage);
      const push = normalizeVector(player.x - grenade.x, player.y - grenade.y - 20);
      player.vx += push.x * 360;
      player.vy += push.y * 430;
    }
  }

  private updateExplosions(dtMs: number): void {
    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      this.explosions[index].ageMs += dtMs;
      if (this.explosions[index].ageMs > 420) this.explosions.splice(index, 1);
    }
  }

  private updatePickups(dtMs: number): void {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        pickup.respawnMs = Math.max(0, pickup.respawnMs - dtMs);
        if (pickup.respawnMs === 0) {
          this.relocatePickup(pickup);
          pickup.active = true;
        }
        continue;
      }

      for (const player of this.players.values()) {
        if (!player.alive || Math.hypot(player.x - pickup.x, player.y - pickup.y) > 42) continue;
        if (pickup.kind === "ammo") {
          if (player.reserveAmmo >= WEAPON.maxReserve) continue;
          player.reserveAmmo = Math.min(WEAPON.maxReserve, player.reserveAmmo + WEAPON.ammoPickupAmount);
        } else {
          if (player.grenades >= GRENADE.maxCount) continue;
          player.grenades += 1;
        }
        pickup.active = false;
        pickup.respawnMs = GRENADE.pickupRespawnMs;
        break;
      }
    }
  }

  private resetPickups(): void {
    this.pickups.length = 0;
    const kinds: PickupKind[] = ["ammo", "grenade", "ammo", "grenade"];
    kinds.forEach((kind, index) => {
      const point = PICKUP_POINTS[(index * 3 + 1) % PICKUP_POINTS.length];
      this.pickups.push({ id: index + 1, kind, x: point.x, y: point.y, active: true, respawnMs: 0 });
    });
  }

  private relocatePickup(pickup: SimPickup): void {
    const occupied = new Set(this.pickups.filter((entry) => entry.active && entry.id !== pickup.id).map((entry) => `${entry.x}:${entry.y}`));
    const available = PICKUP_POINTS.filter((point) => !occupied.has(`${point.x}:${point.y}`));
    const point = available[Math.floor(Math.random() * available.length)] ?? PICKUP_POINTS[0];
    pickup.x = point.x;
    pickup.y = point.y;
  }

  private damage(player: SimPlayer, attackerId: string, amount: number): void {
    player.health = Math.max(0, player.health - amount);
    if (player.health === 0) this.kill(player, attackerId);
  }

  private kill(player: SimPlayer, attackerId: string | null): void {
    if (!player.alive) return;
    player.alive = false;
    player.health = 0;
    player.vx = 0;
    player.vy = 0;
    player.deaths += 1;
    player.respawnMs = MATCH.respawnMs;
    if (attackerId && attackerId !== player.id) {
      const attacker = this.players.get(attackerId);
      if (attacker) attacker.kills += 1;
    }
  }

  private respawn(player: SimPlayer, initial = false): void {
    const pointIndex = initial ? player.slot : (player.slot + player.deaths * 2) % SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[pointIndex];
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.health = 100;
    player.fuel = 100;
    player.ammo = WEAPON.magazineSize;
    player.reserveAmmo = WEAPON.startingReserve;
    player.grenades = GRENADE.maxCount;
    player.reloading = false;
    player.reloadRemainingMs = 0;
    player.alive = true;
    player.respawnMs = 0;
    player.invulnerableMs = MATCH.spawnProtectionMs;
    player.input = { ...IDLE_INPUT, aimX: player.slot === 0 ? 1 : -1 };
    player.previousBoosting = false;
    player.previousGrenade = false;
  }
}

function overlapsPlayer(player: SimPlayer, rectangle: CollisionRectangle): boolean {
  return (
    player.x + WORLD.playerWidth / 2 > rectangle.x &&
    player.x - WORLD.playerWidth / 2 < rectangle.x + rectangle.width &&
    player.y + WORLD.playerHeight / 2 > rectangle.y &&
    player.y - WORLD.playerHeight / 2 < rectangle.y + rectangle.height
  );
}

function circleIntersectsRectangle(cx: number, cy: number, radius: number, rectangle: CollisionRectangle): boolean {
  const nearestX = clamp(cx, rectangle.x, rectangle.x + rectangle.width);
  const nearestY = clamp(cy, rectangle.y, rectangle.y + rectangle.height);
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius ** 2;
}

function segmentRectangle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number | null {
  const dx = endX - startX;
  const dy = endY - startY;
  let near = 0;
  let far = 1;

  for (const [origin, delta, min, max] of [
    [startX, dx, x, x + width],
    [startY, dy, y, y + height],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }

  return near >= 0 && near <= 1 ? near : null;
}

function normalizeVector(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function removeWhere<T>(values: T[], predicate: (value: T) => boolean): void {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) values.splice(index, 1);
  }
}
