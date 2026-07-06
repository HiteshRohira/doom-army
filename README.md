# Skyline Skirmish

A two-player browser arena shooter inspired by the fast jetpack movement and free-aim combat of classic mobile arena games. The MVP includes private room codes, Xbox gamepad controls, one SMG, one original map, and server-authoritative five-minute deathmatches.

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in two browser windows. Create a room in one, join with the code in the other, and ready both players.

### Test from another computer on the local network

`pnpm dev` exposes the Vite client on the machine's LAN interfaces. Keep the server terminal running, find the host machine's local IP, and open `http://HOST_IP:5173` on the second computer. Both computers must be on the same network; allow incoming Node.js connections if the host firewall prompts.

Xbox controls:

- Left stick: move
- A: jump/jetpack
- Right stick: aim
- Right trigger: fire
- X: reload

A keyboard/mouse fallback is available for development: A/D, Space, mouse aim/fire, and R.

## Commands

```bash
pnpm dev       # client and server with live reload
pnpm build     # production builds
pnpm test      # unit tests
pnpm typecheck # TypeScript validation
```

The client runs on port 5173 and proxies multiplayer traffic to the server on port 3001. For deployment, configure `VITE_SERVER_URL` on the client and `CLIENT_ORIGIN`/`PORT` on the server.
