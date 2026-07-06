import Phaser from "phaser";
import { io } from "socket.io-client";
import type { PlayerInput, RoomAck, RoomSnapshot } from "@arena/shared";
import { WORLD } from "@arena/shared";
import { ArenaScene } from "./game/ArenaScene";
import "./style.css";

const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const connectionPill = document.querySelector<HTMLDivElement>("#connection-pill")!;
const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
const socket = io(serverUrl, { transports: ["websocket", "polling"] });
const gamepadApiAvailable = typeof navigator.getGamepads === "function";

let playerId: string | null = null;
let snapshot: RoomSnapshot | null = null;
let lastOverlayKey = "";
let callsign = localStorage.getItem("arena-callsign") ?? "";

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
  connectionPill.textContent = "Server connected";
  connectionPill.classList.add("online");
  if (!playerId) renderLanding();
});

socket.on("disconnect", () => {
  connectionPill.textContent = "Server disconnected";
  connectionPill.classList.remove("online");
});

socket.on("room:state", (next: RoomSnapshot) => {
  snapshot = next;
  arenaScene.setNetworkState(next, playerId);
  renderRoomOverlay(next);
});

renderLanding();

function renderLanding(message = ""): void {
  lastOverlayKey = "landing";
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Two-player browser arena</p>
      <h1>Skyline<br />Skirmish</h1>
      <p class="subtitle">Jetpacks, one loud SMG, and five minutes to settle the score. Connect an Xbox controller, create a room, and send the code to a rival.</p>
      <p class="controller-check">${gamepadApiAvailable ? "Controller API available — press any controller button to activate it." : "Controller API unavailable on this browser or connection."}</p>
      <div class="stack">
        <div>
          <label for="callsign">Callsign</label>
          <input id="callsign" maxlength="16" autocomplete="nickname" placeholder="Player" value="${escapeHtml(callsign)}" />
        </div>
        <button id="create-room">Create private room</button>
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
          <div><span class="muted">Room code</span><br /><strong>${state.code}</strong></div>
          <button id="copy-code" class="secondary">Copy</button>
        </div>
        <div class="roster">
          ${state.players.map((player) => `<div class="player-row"><span>${escapeHtml(player.name)}${player.id === playerId ? " · You" : ""}</span><span class="${player.ready ? "ready" : ""}">${player.ready ? "Ready" : "Not ready"}</span></div>`).join("")}
          ${state.players.length < 2 ? '<div class="player-row"><span class="muted">Waiting for rival…</span><span>Open</span></div>' : ""}
        </div>
        <p class="muted">Both players must be ready. Press any button on the Xbox controller once so the browser can detect it.</p>
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
  const outcome = state.winnerId === null ? "Draw" : state.winnerId === playerId ? "Victory" : `${winner?.name ?? "Rival"} wins`;
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
        ${state.players.length === 2 ? `<button id="ready-button">${local?.ready ? "Waiting for rival…" : "Ready for rematch"}</button>` : ""}
        <button id="leave-button" class="danger">Leave room</button>
      </div>
    </section>`;
  bindRoomButtons(local?.ready ?? false, state.code);
}

function bindRoomButtons(isReady: boolean, code: string): void {
  document.querySelector("#ready-button")?.addEventListener("click", () => socket.emit("player:ready", !isReady));
  document.querySelector("#leave-button")?.addEventListener("click", leaveRoom);
  document.querySelector("#copy-code")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(code);
    const button = document.querySelector<HTMLButtonElement>("#copy-code");
    if (button) button.textContent = "Copied";
  });
}

function leaveRoom(): void {
  socket.emit("room:leave");
  playerId = null;
  snapshot = null;
  arenaScene.setNetworkState(emptySnapshot(), null);
  renderLanding();
}

function storeCallsign(value: string): void {
  callsign = value.trim().slice(0, 16);
  localStorage.setItem("arena-callsign", callsign);
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
  };
}
