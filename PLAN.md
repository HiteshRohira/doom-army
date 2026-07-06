# Browser Arena MVP Plan

## Product goal

Build a browser-based 2D arena shooter for exactly two remote players. One player creates a private room, shares its code, and the second player joins. Both use Xbox-compatible gamepads in a five-minute deathmatch; the player with the most kills wins.

The movement and combat should have the quick, floaty feel of Mini Militia—platform movement, jetpack flight, free aiming, and rapid gunfire—while using an original name, characters, map, interface, and artwork.

## MVP scope

### Included

- Two players per room, with no bots or spectators
- Create-room and join-by-code flow
- One original platform arena
- One SMG-style weapon
- Two grenades per spawn plus replenishing ammo and grenade pickups
- Running, jumping, jetpack flight, aiming, shooting, damage, death, and respawning
- Five-minute deathmatch, kill counter, timer, and result screen
- Xbox gamepad support
- Browser audio, basic animation, hit effects, and game feel
- Desktop Chromium-based browser support initially
- Deployable web client and multiplayer server

### Deferred

- Accounts, matchmaking, progression, cosmetics, chat, bots, and spectators
- More than two players
- Multiple maps or weapons, weapon pickups beyond ammo/grenades, and melee
- Touch controls and mobile-browser optimization
- Cross-room parties, persistent statistics, ranked play, and anti-cheat hardening
- Advanced reconnect/match recovery

## Recommended technology

- **Client:** TypeScript, Vite, and Phaser 3
- **Networking:** Socket.IO over WebSockets
- **Server:** Node.js and TypeScript
- **Shared package:** message schemas, input types, game constants, and map definitions
- **Repository:** pnpm workspace containing `client`, `server`, and `shared`
- **Testing:** Vitest for game rules and server behavior; Playwright for lobby flows

The server will be authoritative for room state, match time, movement validation, shots, damage, deaths, respawns, and scores. Clients send controller inputs and render interpolated server snapshots. This keeps both players synchronized and avoids making the room creator responsible for hosting the match.

## Controls

Initial Xbox mapping:

- Left stick: run and aim in 360 degrees
- Right stick up/down: jetpack boost and fast descent
- Right trigger: fire
- Right bumper: throw grenade
- X: reload
- Menu button: open the controls/options overlay; it does not pause the online match

Keyboard controls can be retained as a developer/debug fallback, but Xbox gamepad is the supported MVP input.

## Initial game rules

- Match begins when both connected players confirm they are ready
- Match length: 5:00
- Highest kill count at zero wins; equal scores produce a draw
- Players respawn after 2 seconds at a safe spawn point
- Brief spawn protection prevents immediate spawn kills
- The SMG has automatic fire, a magazine, reload time, bullet spread, and finite reserve ammunition replenished by map pickups
- Players spawn with two grenades; ammunition and grenades respawn at changing map locations
- Falling or leaving the arena counts as a death; the opposing player receives the kill only when they caused the recent damage
- If a player disconnects, the remaining player sees a clear match-ended message

Exact movement speed, jetpack fuel, damage, fire rate, and respawn values will live in shared configuration so they can be tuned without rewriting game logic.

## Map and visual direction

The MVP does not need externally commissioned art. We can build its first visual pass from simple original vector-like shapes, procedural effects, and a small hand-authored sprite sheet.

Assets needed:

- Two color variants of one original soldier character
- A simple SMG silhouette, muzzle flash, bullets/tracers, and hit particles
- Ground, wall, and platform tiles for one arena
- A background with two or three parallax layers
- Jetpack flame/smoke, spawn, death, and impact effects
- Lobby, HUD, timer, score, controller prompts, and result screen
- A few short original or licensed sound effects

The target is a readable, energetic comic-military style with chunky silhouettes and bright effects. It can evoke the same genre and pace, but should not reuse or closely trace Mini Militia characters, maps, logos, animations, sounds, or UI. Detailed art production can wait until the game is fun; the first pass should use clean silhouettes and strong team colors.

## Implementation phases

### 1. Foundation

- Create the TypeScript workspace and client/server/shared packages
- Add Phaser game bootstrapping and a responsive 16:9 canvas
- Define shared protocol messages, tunable constants, and room state
- Add automated formatting, linting, tests, and local development commands

**Exit:** client and server start together; the browser connects and displays connection/gamepad status.

### 2. Local gameplay vertical slice

- Build the arena collision geometry and spawn points
- Implement character physics, jumping, jetpack fuel, and recharge
- Add 360-degree aiming and the SMG firing/reload loop
- Add health, damage, death, respawn, camera, HUD, and basic effects
- Tune the controller dead zones and response curves

**Exit:** two locally controlled debug characters can complete the full combat loop on the final MVP map.

### 3. Rooms and multiplayer

- Implement short, case-insensitive room codes
- Add create, join, ready, full-room, invalid-code, and leave flows
- Run the match simulation on the server at a fixed tick rate
- Send inputs to the server and snapshots to both clients
- Add interpolation, local movement prediction, reconciliation, and latency display
- Validate fire rate, movement bounds, hits, deaths, and scoring server-side

**Exit:** two browsers on separate machines can join the same room and play a synchronized match under ordinary internet latency.

### 4. Match flow

- Add the pre-match ready screen and short countdown
- Implement the authoritative five-minute clock and score tracking
- Add respawn selection, spawn protection, end-of-match results, and rematch
- Handle disconnects, room cleanup, and duplicate inputs safely

**Exit:** players can create a room, finish a match, see the correct winner, and start a rematch without refreshing.

### 5. MVP presentation and release

- Replace debug graphics with the simple original art pass
- Add muzzle, impact, jetpack, death, and screen-feedback effects
- Add compact audio and volume controls
- Test current Xbox controllers on Windows and macOS browsers
- Add network-condition tests, gameplay-rule tests, and lobby end-to-end tests
- Deploy the static client and a regionally close WebSocket server with HTTPS

**Exit:** a shareable public URL supports a stable two-player session from room creation through results.

## Acceptance criteria

- A player can create a room and copy a short code
- A second player can join that room from another computer
- A third player cannot enter the room
- Both Xbox controllers are detected and all required actions work
- Both players see substantially consistent movement, shots, health, kills, and time
- The match ends after five minutes and reports the correct winner or draw
- Deaths respawn correctly and do not corrupt the score
- The room closes cleanly after players leave
- The game maintains a smooth render rate on a typical desktop browser and remains playable under moderate latency

## Build order and risk strategy

The first playable target is movement plus shooting on one machine. Networking comes only after that combat loop feels good, because synchronizing unproven movement makes tuning much slower. The largest technical risk is reconciling fast jetpack movement and firing across latency, so multiplayer prediction should be proven before spending time on polished art.

The first art pass should be made in-engine and from tiny original assets. Once the mechanics are enjoyable, those placeholders can be replaced independently by commissioned art, a compatible licensed asset pack, or a more deliberate custom style without changing the game architecture.
