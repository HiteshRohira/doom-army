export const WORLD = {
  width: 1600,
  height: 900,
  playerWidth: 44,
  playerHeight: 64,
} as const;

export const MATCH = {
  durationMs: 5 * 60 * 1000,
  countdownMs: 3000,
  respawnMs: 2000,
  spawnProtectionMs: 1200,
  tickRate: 30,
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

export const WEAPON = {
  magazineSize: 30,
  startingReserve: 60,
  maxReserve: 150,
  ammoPickupAmount: 45,
  damage: 20,
  fireIntervalMs: 95,
  reloadMs: 1350,
  bulletSpeed: 1250,
  bulletLifetimeMs: 1300,
  spreadRadians: 0.025,
} as const;

export const GRENADE = {
  maxCount: 2,
  fuseMs: 1650,
  throwSpeed: 650,
  radius: 135,
  maxDamage: 85,
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
  { x: 72, y: 646, width: 360, height: 30, kind: "platform" },
  { x: 1168, y: 646, width: 360, height: 30, kind: "platform" },
  { x: 594, y: 590, width: 412, height: 30, kind: "platform" },
  { x: 224, y: 414, width: 310, height: 30, kind: "platform" },
  { x: 1066, y: 414, width: 310, height: 30, kind: "platform" },
  { x: 650, y: 246, width: 300, height: 30, kind: "platform" },
];

export interface SolidCover {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "rock";
}

export const SOLID_COVER: SolidCover[] = [
  { x: 742, y: 754, width: 116, height: 68, kind: "rock" },
  { x: 1280, y: 586, width: 90, height: 60, kind: "rock" },
  { x: 742, y: 534, width: 82, height: 56, kind: "rock" },
  { x: 1122, y: 366, width: 74, height: 48, kind: "rock" },
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
  { x: 350, y: 604 },
  { x: 530, y: 782 },
  { x: 650, y: 548 },
  { x: 940, y: 548 },
  { x: 1070, y: 782 },
  { x: 1240, y: 604 },
  { x: 1504, y: 782 },
  { x: 480, y: 372 },
  { x: 1286, y: 372 },
  { x: 800, y: 204 },
] as const;

export const SPAWN_POINTS = [
  { x: 170, y: 770 },
  { x: 1430, y: 770 },
  { x: 260, y: 594 },
  { x: 1340, y: 594 },
] as const;

export type RoomPhase = "lobby" | "countdown" | "playing" | "finished";

export interface PlayerInput {
  sequence: number;
  moveX: number;
  boostY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
  reload: boolean;
  grenade: boolean;
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
};

export interface PlayerSnapshot {
  id: string;
  name: string;
  slot: 0 | 1;
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
}

export interface ProjectileSnapshot {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
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

export type PickupKind = "ammo" | "grenade";

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
  };
}
