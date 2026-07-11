import { MATCH, type PlayerInput, type PlayerSlot, type RoomAck, type RoomSnapshot } from "@doom-army/shared";
import type { Server, Socket } from "socket.io";
import { GameSimulation } from "./game.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RoomPlayer {
  socketId: string;
  name: string;
  slot: PlayerSlot;
  ready: boolean;
  isBot: boolean;
}

class Room {
  readonly game = new GameSimulation();
  readonly players = new Map<string, RoomPlayer>();
  phase: RoomSnapshot["phase"] = "lobby";
  countdownEndsAt = 0;
  remainingMs = MATCH.durationMs;
  winnerId: string | null = null;
  finishReason: string | null = null;

  constructor(readonly code: string) {}

  addPlayer(socketId: string, name: string): RoomPlayer | null {
    if (this.players.size >= MATCH.maxPlayers || this.phase !== "lobby") return null;
    const usedSlots = new Set([...this.players.values()].map((player) => player.slot));
    const slot = firstOpenSlot(usedSlots);
    if (slot === null) return null;
    const player = { socketId, name, slot, ready: false, isBot: false };
    this.players.set(socketId, player);
    this.game.addPlayer(socketId, name, slot);
    return player;
  }

  addBot(name: string): RoomPlayer | null {
    const usedSlots = new Set([...this.players.values()].map((player) => player.slot));
    const slot = firstOpenSlot(usedSlots);
    if (slot === null) return null;
    const socketId = `bot:${this.code}:${slot}`;
    const bot = { socketId, name, slot, ready: true, isBot: true };
    this.players.set(socketId, bot);
    this.game.addPlayer(socketId, name, slot, true);
    this.game.setReady(socketId, true);
    return bot;
  }

  removePlayer(socketId: string): void {
    const leaving = this.players.get(socketId);
    if (!leaving) return;
    this.players.delete(socketId);
    this.game.removePlayer(socketId);
    let resetReadiness = false;
    if (this.phase === "playing" || this.phase === "countdown") {
      if (this.players.size < MATCH.minPlayers) {
        const survivor = [...this.players.values()][0];
        this.finish(survivor?.socketId ?? null, `${leaving.name} disconnected`);
        resetReadiness = true;
      }
    } else if (this.phase === "finished") {
      this.phase = "lobby";
      this.finishReason = null;
      this.winnerId = null;
      resetReadiness = true;
    } else {
      resetReadiness = true;
    }
    if (resetReadiness) {
      for (const player of this.players.values()) {
        player.ready = false;
        this.game.setReady(player.socketId, false);
      }
    }
  }

  setReady(socketId: string, ready: boolean, now: number): void {
    const player = this.players.get(socketId);
    if (!player || (this.phase !== "lobby" && this.phase !== "finished")) return;
    player.ready = ready;
    this.game.setReady(socketId, ready);
    if (this.players.size >= MATCH.minPlayers && [...this.players.values()].every((entry) => entry.ready)) {
      this.phase = "countdown";
      this.countdownEndsAt = now + MATCH.countdownMs;
      this.winnerId = null;
      this.finishReason = null;
      this.game.reset();
    }
  }

  update(dtMs: number, now: number): void {
    if (this.phase === "countdown" && now >= this.countdownEndsAt) {
      this.phase = "playing";
      this.remainingMs = MATCH.durationMs;
    }
    if (this.phase !== "playing") return;

    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    this.updateBots(now);
    this.game.step(dtMs / 1000);
    const scoreWinner = this.game.getPlayers().find((player) => player.kills >= MATCH.scoreLimit);
    if (scoreWinner) {
      this.finish(scoreWinner.id, `${MATCH.scoreLimit} eliminations reached`);
      return;
    }
    if (this.remainingMs === 0) {
      const sorted = this.game.getPlayers().sort((a, b) => b.kills - a.kills);
      const winner = sorted.length >= MATCH.minPlayers && sorted[0].kills !== sorted[1]?.kills ? sorted[0].id : null;
      this.finish(winner, winner ? "Time expired" : "Draw");
    }
  }

  private updateBots(now: number): void {
    const alive = this.game.getPlayers().filter((player) => player.alive);
    for (const bot of alive.filter((player) => player.isBot)) {
      const targets = alive.filter((player) => player.id !== bot.id);
      const target = targets.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (!target) continue;
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.hypot(dx, dy) || 1;
      const orbit = Math.sin(now / 820 + bot.slot * 2.1);
      const needsAltitude = dy < -85;
      this.game.setInput(bot.id, {
        sequence: now,
        moveX: Math.abs(dx) > 210 ? Math.sign(dx) : orbit,
        boostY: needsAltitude ? -0.92 : dy > 210 ? 0.75 : orbit > 0.72 ? -0.58 : 0,
        aimX: dx / distance,
        aimY: dy / distance,
        firing: distance < 760 && Math.abs(orbit) > 0.12,
        reload: bot.ammo < 6,
        grenade: distance < 260 && Math.sin(now / 1700 + bot.slot) > 0.94,
        dash: Math.abs(dx) > 500 && Math.sin(now / 900 + bot.slot) > 0.86,
      });
    }
  }

  finish(winnerId: string | null, reason: string): void {
    this.phase = "finished";
    this.winnerId = winnerId;
    this.finishReason = reason;
    for (const player of this.players.values()) {
      player.ready = false;
      this.game.setReady(player.socketId, false);
    }
  }

  snapshot(now: number): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      serverTime: now,
      countdownMs: this.phase === "countdown" ? Math.max(0, this.countdownEndsAt - now) : 0,
      remainingMs: this.remainingMs,
      winnerId: this.winnerId,
      finishReason: this.finishReason,
      players: this.game.getPlayers().map((player) => ({
        ...player,
        ready: this.players.get(player.id)?.ready ?? false,
      })),
      projectiles: this.game.getProjectiles(),
      grenades: this.game.getGrenades(),
      explosions: this.game.getExplosions(),
      pickups: this.game.getPickups(),
    };
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketRooms = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private lastBroadcast = 0;

  constructor(private readonly io: Server) {}

  start(): void {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / MATCH.tickRate);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  register(socket: Socket): void {
    socket.on("net:ping", (acknowledge?: () => void) => {
      if (typeof acknowledge === "function") acknowledge();
    });

    socket.on("room:create", (payload: { name?: string }, acknowledge: (result: RoomAck) => void) => {
      this.leave(socket);
      const code = this.uniqueCode();
      const room = new Room(code);
      this.rooms.set(code, room);
      this.joinRoom(socket, room, payload?.name, acknowledge);
    });

    socket.on("room:practice", (payload: { name?: string }, acknowledge: (result: RoomAck) => void) => {
      this.leave(socket);
      const code = this.uniqueCode();
      const room = new Room(code);
      this.rooms.set(code, room);
      this.joinRoom(socket, room, payload?.name, (result) => {
        acknowledge(result);
        if (!result.ok) return;
        room.addBot("VEX");
        room.addBot("NOVA");
        room.setReady(socket.id, true, Date.now());
        this.broadcast(room);
      });
    });

    socket.on("room:join", (payload: { code?: string; name?: string }, acknowledge: (result: RoomAck) => void) => {
      this.leave(socket);
      const code = String(payload?.code ?? "").trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) return acknowledge({ ok: false, error: "Room not found" });
      if (room.players.size >= MATCH.maxPlayers) return acknowledge({ ok: false, error: "Room is full" });
      if (room.phase !== "lobby") return acknowledge({ ok: false, error: "Match already in progress" });
      this.joinRoom(socket, room, payload?.name, acknowledge);
    });

    socket.on("player:ready", (ready: boolean) => {
      const room = this.roomFor(socket.id);
      if (room) room.setReady(socket.id, ready === true, Date.now());
    });

    socket.on("player:input", (input: Partial<PlayerInput>) => {
      const room = this.roomFor(socket.id);
      if (room?.phase === "playing") room.game.setInput(socket.id, input);
    });

    socket.on("room:leave", () => this.leave(socket));
    socket.on("disconnect", () => this.leave(socket));
  }

  private joinRoom(socket: Socket, room: Room, rawName: string | undefined, acknowledge: (result: RoomAck) => void): void {
    const fallbackName = `Player ${room.players.size + 1}`;
    const name = String(rawName ?? "").trim().slice(0, 16) || fallbackName;
    const player = room.addPlayer(socket.id, name);
    if (!player) return acknowledge({ ok: false, error: "Unable to join room" });
    socket.join(room.code);
    this.socketRooms.set(socket.id, room.code);
    acknowledge({ ok: true, room: { code: room.code, playerId: socket.id } });
    this.broadcast(room);
  }

  private leave(socket: Socket): void {
    const code = this.socketRooms.get(socket.id);
    if (!code) return;
    this.socketRooms.delete(socket.id);
    const room = this.rooms.get(code);
    socket.leave(code);
    if (!room) return;
    room.removePlayer(socket.id);
    const humans = [...room.players.values()].filter((player) => !player.isBot);
    if (humans.length === 0) this.rooms.delete(code);
    else this.broadcast(room);
  }

  private roomFor(socketId: string): Room | undefined {
    const code = this.socketRooms.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(50, now - this.lastTick);
    this.lastTick = now;
    for (const room of this.rooms.values()) {
      room.update(dt, now);
      if (now - this.lastBroadcast >= 50) this.broadcast(room, now);
    }
    if (now - this.lastBroadcast >= 50) this.lastBroadcast = now;
  }

  private broadcast(room: Room, now = Date.now()): void {
    this.io.to(room.code).emit("room:state", room.snapshot(now));
  }

  private uniqueCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 5; i += 1) code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}

function firstOpenSlot(usedSlots: Set<PlayerSlot>): PlayerSlot | null {
  for (let slot = 0; slot < MATCH.maxPlayers; slot += 1) {
    if (!usedSlots.has(slot as PlayerSlot)) return slot as PlayerSlot;
  }
  return null;
}
