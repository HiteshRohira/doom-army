import {
  clamp,
  IDLE_INPUT,
  MATCH,
  MOVEMENT,
  PLATFORMS,
  sanitizeInput,
  SPAWN_POINTS,
  WEAPON,
  WORLD,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
} from "@arena/shared";

interface SimPlayer extends PlayerSnapshot {
  input: PlayerInput;
  previousJetpack: boolean;
  fireCooldownMs: number;
  reloadRemainingMs: number;
  onGround: boolean;
}

interface SimProjectile extends ProjectileSnapshot {
  ageMs: number;
}

export class GameSimulation {
  readonly players = new Map<string, SimPlayer>();
  readonly projectiles: SimProjectile[] = [];
  private nextProjectileId = 1;

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
      reloading: false,
      ready: false,
      alive: true,
      respawnMs: 0,
      invulnerableMs: MATCH.spawnProtectionMs,
      kills: 0,
      deaths: 0,
      input: { ...IDLE_INPUT, aimX: slot === 0 ? 1 : -1 },
      previousJetpack: false,
      fireCooldownMs: 0,
      reloadRemainingMs: 0,
      onGround: false,
    });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      if (this.projectiles[index].ownerId === id) this.projectiles.splice(index, 1);
    }
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
    this.nextProjectileId = 1;
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

      if (player.y > WORLD.height + 100) this.kill(player, null);
    }

    this.updateProjectiles(dt, dtMs);
  }

  getPlayers(): PlayerSnapshot[] {
    return [...this.players.values()].map(({ input: _input, previousJetpack: _previous, fireCooldownMs: _cooldown, reloadRemainingMs: _reload, onGround: _ground, ...snapshot }) => snapshot);
  }

  getProjectiles(): ProjectileSnapshot[] {
    return this.projectiles.map(({ ageMs: _age, ...snapshot }) => snapshot);
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

    const justPressedJetpack = input.jetpack && !player.previousJetpack;
    if (justPressedJetpack && player.onGround) {
      player.vy = -MOVEMENT.jumpVelocity;
      player.onGround = false;
    } else if (input.jetpack && !player.onGround && player.fuel > 0) {
      player.vy -= MOVEMENT.jetpackAcceleration * dt;
      player.fuel = Math.max(0, player.fuel - MOVEMENT.fuelUsePerSecond * dt);
    }

    if (player.onGround) {
      player.fuel = Math.min(100, player.fuel + MOVEMENT.fuelRechargePerSecond * dt);
    }

    player.previousJetpack = input.jetpack;
    player.vy = Math.min(MOVEMENT.maxFallSpeed, player.vy + MOVEMENT.gravity * dt);
    this.moveAndCollide(player, dt);
  }

  private moveAndCollide(player: SimPlayer, dt: number): void {
    const halfWidth = WORLD.playerWidth / 2;
    const halfHeight = WORLD.playerHeight / 2;

    player.x += player.vx * dt;
    player.x = clamp(player.x, halfWidth, WORLD.width - halfWidth);
    for (const platform of PLATFORMS) {
      if (!overlapsPlayer(player, platform)) continue;
      if (player.vx > 0) player.x = platform.x - halfWidth;
      else if (player.vx < 0) player.x = platform.x + platform.width + halfWidth;
      player.vx = 0;
    }

    const previousY = player.y;
    player.y += player.vy * dt;
    player.onGround = false;
    for (const platform of PLATFORMS) {
      if (!overlapsPlayer(player, platform)) continue;
      const previousBottom = previousY + halfHeight;
      const previousTop = previousY - halfHeight;
      if (player.vy >= 0 && previousBottom <= platform.y + 4) {
        player.y = platform.y - halfHeight;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0 && previousTop >= platform.y + platform.height - 4) {
        player.y = platform.y + platform.height + halfHeight;
        player.vy = 0;
      }
    }
  }

  private updateWeapon(player: SimPlayer, dtMs: number): void {
    if (player.reloadRemainingMs > 0) {
      player.reloadRemainingMs = Math.max(0, player.reloadRemainingMs - dtMs);
      player.reloading = player.reloadRemainingMs > 0;
      if (!player.reloading) player.ammo = WEAPON.magazineSize;
      return;
    }

    if ((player.input.reload && player.ammo < WEAPON.magazineSize) || player.ammo === 0) {
      player.reloading = true;
      player.reloadRemainingMs = WEAPON.reloadMs;
      return;
    }

    if (!player.input.firing || player.fireCooldownMs > 0) return;

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

      for (const platform of PLATFORMS) {
        const t = segmentRectangle(startX, startY, endX, endY, platform.x, platform.y, platform.width, platform.height);
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
    player.reloading = false;
    player.reloadRemainingMs = 0;
    player.alive = true;
    player.respawnMs = 0;
    player.invulnerableMs = MATCH.spawnProtectionMs;
    player.input = { ...IDLE_INPUT, aimX: player.slot === 0 ? 1 : -1 };
    player.previousJetpack = false;
  }
}

function overlapsPlayer(player: SimPlayer, rectangle: { x: number; y: number; width: number; height: number }): boolean {
  return (
    player.x + WORLD.playerWidth / 2 > rectangle.x &&
    player.x - WORLD.playerWidth / 2 < rectangle.x + rectangle.width &&
    player.y + WORLD.playerHeight / 2 > rectangle.y &&
    player.y - WORLD.playerHeight / 2 < rectangle.y + rectangle.height
  );
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

