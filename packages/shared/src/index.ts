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
  damage: 20,
  fireIntervalMs: 95,
  reloadMs: 1350,
  bulletSpeed: 1250,
  bulletLifetimeMs: 1300,
  spreadRadians: 0.025,
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
  jetpack: boolean;
  aimX: number;
  aimY: number;
  firing: boolean;
  reload: boolean;
}

export const IDLE_INPUT: PlayerInput = {
  sequence: 0,
  moveX: 0,
  jetpack: false,
  aimX: 1,
  aimY: 0,
  firing: false,
  reload: false,
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
    jetpack: value.jetpack === true,
    aimX: magnitude > 0.1 ? aimX / magnitude : 1,
    aimY: magnitude > 0.1 ? aimY / magnitude : 0,
    firing: value.firing === true,
    reload: value.reload === true,
  };
}

