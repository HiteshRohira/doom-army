import Phaser from "phaser";
import { io } from "socket.io-client";
import type { PlayerInput, RoomAck, RoomSnapshot } from "@doom-army/shared";
import { MATCH, WORLD } from "@doom-army/shared";
import { ArenaScene } from "./game/ArenaScene";
import "./style.css";

const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
const socket = io(serverUrl, { transports: ["websocket", "polling"] });
const gamepadApiAvailable = typeof navigator.getGamepads === "function";

let playerId: string | null = null;
let snapshot: RoomSnapshot | null = null;
let lastOverlayKey = "";
let callsign = localStorage.getItem("doom-army-callsign") ?? "";

const arenaScene = new ArenaScene((input: PlayerInput) => socket.emit("player:input", input));
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: "#0b1b2a",
  scene: arenaScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
});

socket.on("connect", () => {
  if (!playerId) renderLanding();
});

socket.on("disconnect", () => {
  arenaScene.setLatencyMs(null);
});

socket.on("room:state", (next: RoomSnapshot) => {
  snapshot = next;
  arenaScene.setNetworkState(next, playerId);
  renderRoomOverlay(next);
});

renderLanding();
setInterval(measureLatency, 2500);

function renderLanding(message = ""): void {
  lastOverlayKey = "landing";
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <section class="panel landing-panel">
      <p class="eyebrow">Neon jetpack deathmatch</p>
      <h1>Skyline<br /><em>Skirmish</em></h1>
      <p class="subtitle">A fast desktop arena shooter built around vertical control, weapon routes, air dashes, and brutal three-minute score races.</p>
      <div class="feature-strip"><span><b>3</b> weapons</span><span><b>12</b> to win</span><span><b>${MATCH.maxPlayers}</b> players</span></div>
      <p class="controller-check">${gamepadApiAvailable ? "Desktop controls ready · Mouse + keyboard or twin-stick gamepad" : "Desktop controls · Mouse + keyboard"}</p>
      <div class="stack">
        <div>
          <label for="callsign">Callsign</label>
          <input id="callsign" maxlength="16" autocomplete="nickname" placeholder="Player" value="${escapeHtml(callsign)}" />
        </div>
        <div class="mode-grid">
          <button id="practice-room"><span class="button-kicker">Instant action</span>Fight 2 bots</button>
          <button id="create-room" class="secondary"><span class="button-kicker">Online</span>Create room</button>
        </div>
      </div>
      <div class="divider"></div>
      <form id="join-form">
        <label for="room-code">Already have a room code?</label>
        <div class="form-row">
          <input id="room-code" class="room-code-input" maxlength="5" autocomplete="off" placeholder="ABCDE" />
          <button type="submit" class="secondary">Join room</button>
        </div>
      </form>
      <p id="landing-error" class="error">${escapeHtml(message)}</p>
    </section>`;

  const callsignInput = document.querySelector<HTMLInputElement>("#callsign")!;
  const createButton = document.querySelector<HTMLButtonElement>("#create-room")!;
  const practiceButton = document.querySelector<HTMLButtonElement>("#practice-room")!;
  const joinForm = document.querySelector<HTMLFormElement>("#join-form")!;
  const roomInput = document.querySelector<HTMLInputElement>("#room-code")!;

  createButton.addEventListener("click", () => {
    storeCallsign(callsignInput.value);
    createButton.disabled = true;
    socket.timeout(5000).emit("room:create", { name: callsign }, (error: Error | null, result: RoomAck) => {
      createButton.disabled = false;
      if (error) return showLandingError("The server did not respond. Try again.");
      handleRoomAck(result);
    });
  });

  practiceButton.addEventListener("click", () => {
    storeCallsign(callsignInput.value);
    practiceButton.disabled = true;
    socket.timeout(5000).emit("room:practice", { name: callsign }, (error: Error | null, result: RoomAck) => {
      practiceButton.disabled = false;
      if (error) return showLandingError("The server did not respond. Try again.");
      handleRoomAck(result);
    });
  });

  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    storeCallsign(callsignInput.value);
    const submit = joinForm.querySelector<HTMLButtonElement>("button")!;
    submit.disabled = true;
    socket.timeout(5000).emit("room:join", { code: roomInput.value, name: callsign }, (error: Error | null, result: RoomAck) => {
      submit.disabled = false;
      if (error) return showLandingError("The server did not respond. Try again.");
      handleRoomAck(result);
    });
  });
}

function handleRoomAck(result: RoomAck): void {
  if (!result.ok) return showLandingError(result.error);
  playerId = result.room.playerId;
  lastOverlayKey = "";
}

function renderRoomOverlay(state: RoomSnapshot): void {
  document.body.classList.toggle("in-match", state.phase === "playing" || state.phase === "countdown");
  const local = state.players.find((player) => player.id === playerId);
  const key = `${state.phase}:${state.players.map((player) => `${player.id}:${player.ready}:${player.kills}`).join("|")}:${state.winnerId}:${state.finishReason}`;
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;

  if (state.phase === "playing" || state.phase === "countdown") {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  if (state.phase === "lobby") {
    overlay.innerHTML = `
      <section class="panel">
        <p class="eyebrow">Private room</p>
        <h2>Ready up</h2>
        <div class="room-code">
          <div><label for="room-code-display" class="muted">Room code</label><input id="room-code-display" class="room-code-display" value="${state.code}" readonly /></div>
          <button id="copy-code" class="secondary">Copy</button>
        </div>
        <div class="roster">
          ${state.players.map((player) => `<div class="player-row"><span>${escapeHtml(player.name)}${player.id === playerId ? " · You" : player.isBot ? " · Bot" : ""}</span><span class="${player.ready ? "ready" : ""}">${player.ready ? "Ready" : "Not ready"}</span></div>`).join("")}
          ${Array.from({ length: MATCH.maxPlayers - state.players.length }, () => '<div class="player-row"><span class="muted">Open slot</span><span>Open</span></div>').join("")}
        </div>
        <div class="controls-card"><b>COMBAT LOADOUT</b><span>Pulse rifle · Breacher shotgun · Longbow rail rifle</span><span>Mouse aim/fire · Shift dash · G grenade · R reload</span></div>
        <p class="muted">${state.players.length < MATCH.minPlayers ? `Need at least ${MATCH.minPlayers} players.` : "All players must be ready."}</p>
        <div class="actions">
          <button id="ready-button">${local?.ready ? "Cancel ready" : "Ready"}</button>
          <button id="leave-button" class="danger">Leave</button>
        </div>
      </section>`;
    bindRoomButtons(local?.ready ?? false, state.code);
    return;
  }

  const winner = state.players.find((player) => player.id === state.winnerId);
  const sorted = [...state.players].sort((a, b) => b.kills - a.kills);
  const outcome = state.winnerId === null ? "Draw" : state.winnerId === playerId ? "Victory" : `${winner?.name ?? "Opponent"} wins`;
  overlay.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Match complete</p>
      <h2>${escapeHtml(outcome)}</h2>
      <div class="result-score">${sorted.map((player) => player.kills).join(" — ")}</div>
      <p class="muted">${escapeHtml(state.finishReason ?? "Time expired")}</p>
      <div class="roster">
        ${sorted.map((player) => `<div class="player-row"><span>${escapeHtml(player.name)}${player.id === playerId ? " · You" : ""}</span><span>${player.kills} kills</span></div>`).join("")}
      </div>
      <div class="actions">
        ${state.players.length >= MATCH.minPlayers ? `<button id="ready-button">${local?.ready ? "Waiting for players..." : "Ready for rematch"}</button>` : ""}
        <button id="leave-button" class="danger">Leave room</button>
      </div>
    </section>`;
  bindRoomButtons(local?.ready ?? false, state.code);
}

function bindRoomButtons(isReady: boolean, code: string): void {
  document.querySelector("#ready-button")?.addEventListener("click", () => socket.emit("player:ready", !isReady));
  document.querySelector("#leave-button")?.addEventListener("click", leaveRoom);
  document.querySelector("#copy-code")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#copy-code");
    const source = document.querySelector<HTMLInputElement>("#room-code-display");
    const copied = await copyText(code, source);
    if (button) button.textContent = copied ? "Copied" : "Selected — Ctrl+C";
  });
}

async function copyText(value: string, source: HTMLInputElement | null): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection path for browsers that block clipboard writes.
    }
  }

  if (!source) return false;
  source.focus();
  source.select();
  source.setSelectionRange(0, value.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function leaveRoom(): void {
  socket.emit("room:leave");
  playerId = null;
  snapshot = null;
  arenaScene.setNetworkState(emptySnapshot(), null);
  document.body.classList.remove("in-match");
  renderLanding();
}

function storeCallsign(value: string): void {
  callsign = value.trim().slice(0, 16);
  localStorage.setItem("doom-army-callsign", callsign);
}

function measureLatency(): void {
  if (!socket.connected) {
    arenaScene.setLatencyMs(null);
    return;
  }

  const startedAt = performance.now();
  socket.timeout(2000).emit("net:ping", (error: Error | null) => {
    if (error) return arenaScene.setLatencyMs(null);
    arenaScene.setLatencyMs(performance.now() - startedAt);
  });
}

function showLandingError(message: string): void {
  const error = document.querySelector<HTMLParagraphElement>("#landing-error");
  if (error) error.textContent = message;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function emptySnapshot(): RoomSnapshot {
  return {
    code: "",
    phase: "lobby",
    serverTime: Date.now(),
    countdownMs: 0,
    remainingMs: 5 * 60 * 1000,
    winnerId: null,
    finishReason: null,
    players: [],
    projectiles: [],
    grenades: [],
    explosions: [],
    pickups: [],
  };
}
