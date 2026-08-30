# Dots and Boxes — Server

Socket.io backend for a real-time multiplayer Dots and Boxes game. No database — rooms and game state live in memory for the lifetime of the process.

**Frontend:** [nextjs-dots-and-boxes-client](https://github.com/TheIlkinAlizade/nextjs-dots-and-boxes-client)

---

## What it does

- Create/join rooms via a 5-character code, no accounts
- Server-authoritative turn order, line validation, and box completion (including the "go again" rule)
- 30s reconnect grace period on disconnect, keyed to a client-held player ID rather than the socket ID
- Resign (drop out, stay in the room) vs leave (removed entirely) vs kick (host-only, lobby-only)
- Host sets grid size, starts the game, resets the room to a fresh lobby for a rematch

## Stack

- TypeScript / Node.js
- Socket.io — rooms + ack callbacks, no REST
- Plain `http` server, no Express
- In-memory `Map`, no persistence layer
- Docker, multi-stage build

## Events

**Client → server:** `create_room`, `join_room`, `leave_room`, `kick_player`, `start_game`, `make_move`, `resign`, `play_again`

**Server → client:** `player_joined`, `player_left`, `player_disconnected`, `player_reconnected`, `player_resigned`, `game_started`, `move_made`, `turn_skipped`, `game_over`, `room_back_to_lobby`, `kicked`

## Setup

```bash
git clone https://github.com/TheIlkinAlizade/socketio-dots-and-boxes-server.git
cd socketio-dots-and-boxes-server
cp .env.example .env
npm install
npm run dev
```

Runs on `http://localhost:4000`.

### Docker

```bash
docker build -t dots-and-boxes-server .
docker run -p 4000:4000 -e PORT=4000 -e CLIENT_URL=http://localhost:3000 dots-and-boxes-server
```

Env vars are passed at `docker run`, not baked into the image.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on |
| `CLIENT_URL` | Frontend origin, for CORS |

See [`.env.example`](./.env.example).