import { MATCH, type PlayerInput, type RoomAck, type RoomSnapshot } from "@arena/shared";
import type { Server, Socket } from "socket.io";
import { GameSimulation } from "./game.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RoomPlayer {
  socketId: string;
  name: string;
  slot: 0 | 1;
  ready: boolean;
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
    if (this.players.size >= 2 || this.phase !== "lobby") return null;
    const usedSlots = new Set([...this.players.values()].map((player) => player.slot));
    const slot: 0 | 1 = usedSlots.has(0) ? 1 : 0;
    const player = { socketId, name, slot, ready: false };
    this.players.set(socketId, player);
    this.game.addPlayer(socketId, name, slot);
    return player;
  }

  removePlayer(socketId: string): void {
    const leaving = this.players.get(socketId);
    if (!leaving) return;
    this.players.delete(socketId);
    this.game.removePlayer(socketId);
    if (this.phase === "playing" || this.phase === "countdown") {
      const survivor = [...this.players.values()][0];
      this.finish(survivor?.socketId ?? null, `${leaving.name} disconnected`);
    } else if (this.phase === "finished") {
      this.phase = "lobby";
      this.finishReason = null;
      this.winnerId = null;
    }
    for (const player of this.players.values()) {
      player.ready = false;
      this.game.setReady(player.socketId, false);
    }
  }

  setReady(socketId: string, ready: boolean, now: number): void {
    const player = this.players.get(socketId);
    if (!player || (this.phase !== "lobby" && this.phase !== "finished")) return;
    player.ready = ready;
    this.game.setReady(socketId, ready);
    if (this.players.size === 2 && [...this.players.values()].every((entry) => entry.ready)) {
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
    this.game.step(dtMs / 1000);
    if (this.remainingMs === 0) {
      const sorted = this.game.getPlayers().sort((a, b) => b.kills - a.kills);
      const winner = sorted.length === 2 && sorted[0].kills !== sorted[1].kills ? sorted[0].id : null;
      this.finish(winner, winner ? "Time expired" : "Draw");
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
    };
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketRooms = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private lastTick = Date.now();

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
    socket.on("room:create", (payload: { name?: string }, acknowledge: (result: RoomAck) => void) => {
      this.leave(socket);
      const code = this.uniqueCode();
      const room = new Room(code);
      this.rooms.set(code, room);
      this.joinRoom(socket, room, payload?.name, acknowledge);
    });

    socket.on("room:join", (payload: { code?: string; name?: string }, acknowledge: (result: RoomAck) => void) => {
      this.leave(socket);
      const code = String(payload?.code ?? "").trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) return acknowledge({ ok: false, error: "Room not found" });
      if (room.players.size >= 2) return acknowledge({ ok: false, error: "Room is full" });
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
    if (room.players.size === 0) this.rooms.delete(code);
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
      this.broadcast(room, now);
    }
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

