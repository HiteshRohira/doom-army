export const WORLD = {
  width: 1600,
  height: 900,
  playerWidth: 44,
  playerHeight: 64,
} as const;

export const MATCH = {
  durationMs: 3 * 60 * 1000,
  scoreLimit: 12,
  countdownMs: 3000,
  respawnMs: 2000,
  spawnProtectionMs: 1200,
  tickRate: 30,
  minPlayers: 2,
  maxPlayers: 5,
} as const;

export const MOVEMENT = {
  groundAcceleration: 1900,
  airAcceleration: 1150,
  maxSpeed: 340,
  groundFriction: 11,
  airFriction: 1.1,
  gravity: 1500,
  jumpVelocity: 520,
  jetpackAcceleration: 1850,
  maxFallSpeed: 850,
  fuelUsePerSecond: 44,
  fuelRechargePerSecond: 52,
} as const;

export type WeaponKind = "pulse" | "scatter" | "rail";

export const WEAPONS = {
  pulse: { label: "VX-9 PULSE", magazineSize: 28, startingReserve: 84, maxReserve: 168, ammoPickupAmount: 42, damage: 16, pellets: 1, fireIntervalMs: 88, reloadMs: 1150, bulletSpeed: 1480, bulletLifetimeMs: 1050, spreadRadians: 0.022, knockback: 32 },
  scatter: { label: "BREACHER", magazineSize: 7, startingReserve: 28, maxReserve: 56, ammoPickupAmount: 14, damage: 13, pellets: 7, fireIntervalMs: 610, reloadMs: 1450, bulletSpeed: 1180, bulletLifetimeMs: 520, spreadRadians: 0.16, knockback: 90 },
  rail: { label: "LONGBOW", magazineSize: 4, startingReserve: 16, maxReserve: 32, ammoPickupAmount: 8, damage: 58, pellets: 1, fireIntervalMs: 820, reloadMs: 1750, bulletSpeed: 2300, bulletLifetimeMs: 900, spreadRadians: 0.004, knockback: 150 },
} as const;

export const WEAPON = WEAPONS.pulse;

export const GRENADE = {
  maxCount: 2,
  fuseMs: 1650,
  throwSpeed: 650,
  radius: 135,
  maxDamage: 200,
  pickupRespawnMs: 6500,
} as const;

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "ground" | "platform";
}

export const PLATFORMS: Platform[] = [
  { x: 0, y: 822, width: 1600, height: 78, kind: "ground" },
  { x: 54, y: 664, width: 310, height: 26, kind: "platform" },
  { x: 1236, y: 664, width: 310, height: 26, kind: "platform" },
  { x: 532, y: 650, width: 220, height: 26, kind: "platform" },
  { x: 848, y: 650, width: 220, height: 26, kind: "platform" },
  { x: 220, y: 454, width: 284, height: 26, kind: "platform" },
  { x: 1096, y: 454, width: 284, height: 26, kind: "platform" },
  { x: 640, y: 398, width: 320, height: 26, kind: "platform" },
  { x: 68, y: 270, width: 238, height: 26, kind: "platform" },
  { x: 1294, y: 270, width: 238, height: 26, kind: "platform" },
  { x: 650, y: 180, width: 300, height: 26, kind: "platform" },
];

export interface SolidCover {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "rock";
}

export const SOLID_COVER: SolidCover[] = [
  { x: 760, y: 742, width: 80, height: 80, kind: "rock" },
  { x: 278, y: 606, width: 70, height: 58, kind: "rock" },
  { x: 1252, y: 606, width: 70, height: 58, kind: "rock" },
  { x: 725, y: 342, width: 70, height: 56, kind: "rock" },
  { x: 805, y: 342, width: 70, height: 56, kind: "rock" },
];

export interface BushDecoration {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BUSHES: BushDecoration[] = [
  { x: 138, y: 598, width: 112, height: 48 },
  { x: 346, y: 602, width: 92, height: 44 },
  { x: 1210, y: 598, width: 108, height: 48 },
  { x: 648, y: 546, width: 100, height: 44 },
  { x: 862, y: 548, width: 98, height: 42 },
  { x: 286, y: 370, width: 104, height: 44 },
  { x: 1228, y: 370, width: 94, height: 44 },
  { x: 706, y: 202, width: 96, height: 44 },
  { x: 824, y: 204, width: 92, height: 42 },
];

export const PICKUP_POINTS = [
  { x: 96, y: 782 },
  { x: 210, y: 624 },
  { x: 530, y: 782 },
  { x: 642, y: 610 },
  { x: 958, y: 610 },
  { x: 1070, y: 782 },
  { x: 1390, y: 624 },
  { x: 1504, y: 782 },
  { x: 362, y: 414 },
  { x: 1238, y: 414 },
  { x: 800, y: 358 },
  { x: 187, y: 230 },
  { x: 1413, y: 230 },
  { x: 800, y: 140 },
] as const;

export const SPAWN_POINTS = [
  { x: 170, y: 770 },
  { x: 1430, y: 770 },
  { x: 260, y: 594 },
  { x: 1340, y: 594 },
  { x: 800, y: 130 },
] as const;

export type RoomPhase = "lobby" | "countdown" | "playing" | "finished";
export type PlayerSlot = 0 | 1 | 2 | 3 | 4;

export interface PlayerInput {
  sequence: number;
  moveX: number;
  boostY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
  reload: boolean;
  grenade: boolean;
  dash: boolean;
}

export const IDLE_INPUT: PlayerInput = {
  sequence: 0,
  moveX: 0,
  boostY: 0,
  aimX: 1,
  aimY: 0,
  firing: false,
  reload: false,
  grenade: false,
  dash: false,
};

export interface PlayerSnapshot {
  id: string;
  name: string;
  slot: PlayerSlot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimX: number;
  aimY: number;
  health: number;
  fuel: number;
  ammo: number;
  reserveAmmo: number;
  grenades: number;
  reloading: boolean;
  ready: boolean;
  alive: boolean;
  respawnMs: number;
  invulnerableMs: number;
  kills: number;
  deaths: number;
  isBot: boolean;
  weapon: WeaponKind;
  dashCooldownMs: number;
}

export interface ProjectileSnapshot {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponKind;
}

export interface GrenadeSnapshot {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuseMs: number;
}

export interface ExplosionSnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
  ageMs: number;
}

export type PickupKind = "ammo" | "grenade" | "health" | "scatter" | "rail";

export interface PickupSnapshot {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  active: boolean;
  respawnMs: number;
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  serverTime: number;
  countdownMs: number;
  remainingMs: number;
  winnerId: string | null;
  finishReason: string | null;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  grenades: GrenadeSnapshot[];
  explosions: ExplosionSnapshot[];
  pickups: PickupSnapshot[];
}

export interface RoomJoinResult {
  code: string;
  playerId: string;
}

export type RoomAck =
  | { ok: true; room: RoomJoinResult }
  | { ok: false; error: string };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeInput(value: Partial<PlayerInput>): PlayerInput {
  const aimX = Number.isFinite(value.aimX) ? Number(value.aimX) : 1;
  const aimY = Number.isFinite(value.aimY) ? Number(value.aimY) : 0;
  const magnitude = Math.hypot(aimX, aimY);

  return {
    sequence: Number.isSafeInteger(value.sequence) ? Number(value.sequence) : 0,
    moveX: clamp(Number.isFinite(value.moveX) ? Number(value.moveX) : 0, -1, 1),
    boostY: clamp(Number.isFinite(value.boostY) ? Number(value.boostY) : 0, -1, 1),
    aimX: magnitude > 0.1 ? aimX / magnitude : 1,
    aimY: magnitude > 0.1 ? aimY / magnitude : 0,
    firing: value.firing === true,
    reload: value.reload === true,
    grenade: value.grenade === true,
    dash: value.dash === true,
  };
}
