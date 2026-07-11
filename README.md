# Skyline Skirmish

A desktop browser arena shooter built around fast jetpack movement, air dashes, free-aim combat, weapon routing, grenades, and short score-limit matches. Play instantly against server-controlled bots or create a private room for up to five players.

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in two browser windows. Create a room in one, join with the code in the other, and ready all connected players.

### Test from another computer

`pnpm dev` exposes the Vite client on the machine's LAN interfaces for local testing. For public play, deploy the built app to an HTTPS host such as Railway and share that public URL; the server serves the client and Socket.IO from the same origin by default.

Xbox controls:

- Left stick: move, boost, and drop
- Right stick: aim
- Right trigger or A: fire
- Left bumper: dash
- B: throw grenade
- X: reload

Keyboard and mouse: A/D move, W/S jet/drop, mouse aim/fire, Shift dash, G grenade, and R reload.

Weapons:

- VX-9 Pulse: accurate automatic rifle
- Breacher: close-range seven-pellet shotgun
- Longbow: slow, high-damage rail rifle

## Commands

```bash
pnpm dev       # client and server with live reload
pnpm build     # production builds
pnpm test      # unit tests
pnpm typecheck # TypeScript validation
```

The local client runs on port 5173 and proxies multiplayer traffic to the server on port 3001. For same-origin deployment, configure `PORT` on the server; set `VITE_SERVER_URL` and `CLIENT_ORIGIN` only when the client and server are hosted on different origins.
