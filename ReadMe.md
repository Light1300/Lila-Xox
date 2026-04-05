# XvO — Real-Time Multiplayer Tic-Tac-Toe

> **Built as a technical assignment for Lila Gaming Studios**
> Demonstrates server-authoritative multiplayer architecture using Nakama game server, Next.js 13, and TypeScript.

**Developer:** Sarvesh Patil — Backend Developer at [Flickit.app](https://flickit.app)
[LinkedIn](https://www.linkedin.com/in/sarvesh-patil-559b3124b/) · [Portfolio](https://light1300.github.io/Sarvesh.dev/) · [GitHub](http://github.com/Light1300/) · [Twitter/X](https://x.com/SarveshPat21415)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Nakama Internals — Deep Dive](#4-nakama-internals--deep-dive)
   - [TypeScript Runtime Model](#41-typescript-runtime-model)
   - [Match Lifecycle](#42-match-lifecycle)
   - [Server-Authoritative Game Logic](#43-server-authoritative-game-logic)
   - [OpCode Message Protocol](#44-opcode-message-protocol)
   - [Matchmaking via RPC](#45-matchmaking-via-rpc)
   - [Leaderboard System](#46-leaderboard-system)
5. [Frontend Architecture](#5-frontend-architecture)
6. [WebSocket Communication Flow](#6-websocket-communication-flow)
7. [Key Engineering Challenges & Solutions](#7-key-engineering-challenges--solutions)
   - [The nakama-runtime npm Problem](#71-the-nakama-runtime-npm-problem)
   - [Port 7350 Not Starting](#72-port-7350-not-starting)
   - [Device ID Collision on Local Testing](#73-device-id-collision-on-local-testing)
   - [SDK Payload Double-Parsing Bug](#74-sdk-payload-double-parsing-bug)
   - [TypeScript Enum Mismatches](#75-typescript-enum-mismatches)
8. [Project Structure](#8-project-structure)
9. [Local Development Setup](#9-local-development-setup)
10. [Features Implemented](#10-features-implemented)
11. [Thinking Process & Engineering Decisions](#11-thinking-process--engineering-decisions)

---

## 1. Project Overview

This project is a production-ready, real-time multiplayer Tic-Tac-Toe game built on top of **Nakama** — an open-source, distributed game server by Heroic Labs. The core design principle is **server-authoritative game logic**: the server owns and validates every state transition. Clients are purely presentational — they send intent (a move), and the server decides whether to accept or reject it.

This ensures:
- **Cheat prevention** — clients cannot forge board states
- **Single source of truth** — all connected clients see the same game state
- **Deterministic outcomes** — win/draw conditions computed exclusively server-side

The frontend is a **Next.js 13** (App Router) application using the official `@heroiclabs/nakama-js` SDK to communicate with the server over persistent WebSocket connections.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│                                                             │
│   Browser (Next.js 13 + nakama-js SDK)                      │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│   │  Auth/Login  │  │  Game Board  │  │   Leaderboard   │  │
│   │  (Device ID) │  │  (WebSocket) │  │   (RPC Call)    │  │
│   └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│          │                 │                   │           │
└──────────┼─────────────────┼───────────────────┼───────────┘
           │   HTTP REST     │   WebSocket        │  HTTP RPC
           ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    NAKAMA SERVER (Docker)                    │
│                      Port 7350                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Auth Engine │  │ Match Handler│  │  RPC Functions  │   │
│  │  JWT + Device│  │ (TypeScript) │  │  find_match_js  │   │
│  │  Sessions    │  │ 5 ticks/sec  │  │  record_win_js  │   │
│  └──────────────┘  └──────┬───────┘  │ get_leaderboard │   │
│                           │          └────────┬────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              TypeScript Runtime (V8)                 │   │
│  │  match_handler.ts · match_rpc.ts · main.ts           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │  SQL
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL 12 (Docker)                      │
│                  Port 5432                                   │
│                                                             │
│   Users · Sessions · Leaderboard Records · Storage          │
└─────────────────────────────────────────────────────────────┘
```

### Port Map

| Port | Service | Purpose |
|------|---------|---------|
| `7349` | Nakama gRPC | Internal gRPC API |
| `7350` | Nakama HTTP + WS | Client connections, REST API, WebSocket upgrade |
| `7351` | Nakama Console | Admin web UI |
| `5432` | PostgreSQL | Persistent storage |
| `3000` | Next.js | Frontend dev server |

---

## 3. Technology Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Game Server | Nakama | 3.17.0 | Authoritative server, match lifecycle, leaderboards |
| Server Logic | TypeScript | 4.x | Compiled to JS, loaded into Nakama's V8 runtime |
| Database | PostgreSQL | 12.2 | Persistent user/session/leaderboard storage |
| Infrastructure | Docker + Docker Compose | 29.x | Local containerisation of Nakama + Postgres |
| Frontend | Next.js | 13 (App Router) | React SSR framework |
| Client SDK | @heroiclabs/nakama-js | 2.x | WebSocket + REST client for Nakama |
| State Mgmt | React Hooks + useRef | — | Local game state, socket callbacks |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |

---

## 4. Nakama Internals — Deep Dive

### 4.1 TypeScript Runtime Model

Nakama supports three server-side runtimes: **Go**, **Lua**, and **TypeScript/JavaScript**. This project uses the TypeScript runtime.

The TypeScript source files are compiled to a single bundled JavaScript file (`build/index.js`) using `npx tsc`. Nakama loads this bundle into its embedded **V8 JavaScript engine** at startup, using the `runtime.js_entrypoint` config directive pointing to `build/index.js`.

The entrypoint must export an `InitModule` function — this is the Nakama bootstrap hook:

```typescript
function InitModule(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    initializer: nkruntime.Initializer
) {
    initializer.registerRpc("find_match_js", rpcFindMatch);
    initializer.registerRpc("record_win_js", rpcRecordWin);
    initializer.registerRpc("get_leaderboard_js", rpcGetLeaderboard);
    initializer.registerMatch(moduleName, { matchInit, matchJoinAttempt, ... });
    nk.leaderboardCreate("tictactoe_wins", false,
        nkruntime.SortOrder.DESCENDING,
        nkruntime.Operator.INCREMENTAL, "", {});
}
```

> **Critical note on the type definitions package:** `@heroiclabs/nakama-runtime` does **not exist on the npm public registry**. This was a major early blocker. The correct installation is via a GitHub source reference:
> ```json
> "dependencies": {
>   "nakama-runtime": "github:heroiclabs/nakama-common#master"
> }
> ```
> This installs type definitions from the `nakama-common` repository directly. The package lands at `node_modules/nakama-runtime`, not `node_modules/@heroiclabs/nakama-runtime`. See [Section 7.1](#71-the-nakama-runtime-npm-problem) for full details.

---

### 4.2 Match Lifecycle

Nakama authoritative matches are driven by a **server-side tick loop**. Every match instance runs through a defined lifecycle implemented as handler functions:

```
matchInit          → Called once when match is created
    │
    ▼
matchJoinAttempt   → Called per player connection attempt (accept/reject gate)
    │
    ▼
matchJoin          → Called after player successfully joins
    │
    ▼
matchLoop ─────────► Runs at tickRate (5/sec). Processes messages, drives game state
    │
    ▼
matchLeave         → Called when a player disconnects
    │
    ▼
matchTerminate     → Called when match is forcibly ended (server shutdown)
```

**Tick rate** is set to `5` ticks per second in `matchInit`:

```typescript
const matchInit: nkruntime.MatchInitFunction<MatchState> = (
    ctx, logger, nk, params
) => {
    return {
        state: initialState,
        tickRate: 5,
        label: JSON.stringify({ open: true, fast: false })
    };
};
```

The **match label** is a JSON string stored in Nakama's match registry. It is queried during matchmaking to find open matches. When a match fills up (2 players), the label is updated to `{ open: false }` to prevent additional joins.

---

### 4.3 Server-Authoritative Game Logic

The heart of anti-cheat is `matchLoop`. Every tick, it processes the incoming message queue. For each `MOVE` opcode received:

```typescript
// 1. Validate sender is the active player
if (state.marks[message.sender.userId] !== state.mark) {
    dispatcher.broadcastMessage(OpCode.REJECTED, {reason: "not_your_turn"}, [sender]);
    continue;
}

// 2. Validate position bounds
if (pos < 0 || pos > 8 || !Number.isInteger(pos)) {
    dispatcher.broadcastMessage(OpCode.REJECTED, {reason: "invalid_move"}, [sender]);
    continue;
}

// 3. Validate cell is not already occupied
if (state.board[pos] !== 0) {
    dispatcher.broadcastMessage(OpCode.REJECTED, {reason: "cell_taken"}, [sender]);
    continue;
}

// 4. Apply move and compute outcome
state.board[pos] = state.marks[message.sender.userId];
const winner = calculateWinner(state.board);
```

The client **never** applies a move to its local state optimistically in a trust-sensitive way — it sends the intent and waits for the server's `UPDATE` or `DONE` broadcast to re-render the board.

**Turn deadline enforcement** is also server-side. The `deadlineTick` counter decrements each tick. When it reaches zero, the server forcibly advances the turn:

```typescript
if (state.playing) {
    state.deadlineTick--;
    if (state.deadlineTick <= 0) {
        // Auto-advance turn, broadcast with timedOut: true
        state.activeMark = state.activeMark === 1 ? 2 : 1;
        state.deadlineTick = tickRate * turnTimeSecs;
        dispatcher.broadcastMessage(OpCode.UPDATE, { ...state, timedOut: true });
    }
}
```

---

### 4.4 OpCode Message Protocol

All real-time game messages are exchanged over the WebSocket as binary-encoded JSON payloads tagged with an integer opcode.

| OpCode | Direction | Name | Payload |
|--------|-----------|------|---------|
| `1` | Server → Client | `START` | `{ board, marks, mark, deadline }` |
| `2` | Server → Client | `UPDATE` | `{ board, mark, deadline }` |
| `3` | Server → Client | `DONE` | `{ board, winner, winnerPositions, nextGameStart }` |
| `4` | Client → Server | `MOVE` | `{ position: 0–8 }` |
| `5` | Server → Client | `REJECTED` | `{ reason: string }` |

The client registers a single `socket.onmatchdata` handler that switches on `matchState.op_code`:

```typescript
socket.onmatchdata = (matchState: MatchData) => {
    const json = JSON.parse(new TextDecoder().decode(matchState.data));
    switch (matchState.op_code) {
        case OpCode.START:   // initialise board, set player marks
        case OpCode.UPDATE:  // re-render board, update turn indicator + timer
        case OpCode.DONE:    // show result, record win if applicable
    }
};
```

> **Important implementation detail:** `playerIndexRef` is a `useRef`, not `useState`. Socket callbacks in React capture the closure at mount time — `useState` values inside a callback will be stale. Using a ref guarantees the callback always reads the current player index, which was critical for correctly identifying winner vs. loser in the `DONE` handler.

---

### 4.5 Matchmaking via RPC

Matchmaking is implemented as a Nakama **RPC function** — a server-side function callable over HTTP REST by authenticated clients.

The `find_match_js` RPC uses `nk.matchList()` with a Bleve query syntax to find existing open matches:

```typescript
const query = `+label.open:1 +label.fast:${request.fast ? 1 : 0}`;
matches = nk.matchList(10, true, null, null, 1, query);
```

If no open match is found, it creates a new one via `nk.matchCreate(moduleName, params)` and returns the match ID to the client. The client then calls `socket.joinMatch(matchId)` to subscribe to that match's real-time event stream.

```
Client A                    Nakama                    Client B
   │                           │                          │
   │── POST /v2/rpc/find_match ─►│                          │
   │◄── { matchIds: ["abc"] } ──│                          │
   │                           │                          │
   │── WS: joinMatch("abc") ───►│                          │
   │◄── matchJoinAttempt ───────│                          │
   │◄── matchJoin ─────────────│                          │
   │                           │◄─ WS: joinMatch("abc") ──│
   │                           │── matchJoinAttempt ──────►│
   │                           │── matchJoin ─────────────►│
   │                           │                          │
   │◄── OpCode.START ──────────┼──────────────────────────►│
   │                    (game begins)                      │
```

---

### 4.6 Leaderboard System

Nakama has a built-in leaderboard engine backed by PostgreSQL. The leaderboard is created idempotently in `InitModule`:

```typescript
nk.leaderboardCreate(
    "tictactoe_wins",           // leaderboard ID
    false,                      // not authoritative (anyone can write own score)
    nkruntime.SortOrder.DESCENDING,
    nkruntime.Operator.INCREMENTAL,  // each write adds to existing score
    "",                         // no reset schedule
    {}
);
```

`INCREMENTAL` operator means each call to `leaderboardRecordWrite(..., 1, ...)` adds 1 to the player's existing win count rather than replacing it.

Win recording is triggered client-side only after the server broadcasts `OpCode.DONE` with `winner === myPlayerIndex`:

```typescript
// In board.tsx DONE handler:
if (msg.winner === myPlayerIndex) {
    nakamaRef.current.recordWin(); // calls RPC record_win_js
}
```

The `record_win_js` RPC extracts the caller's identity from the server-side `ctx` object (not from the payload — the payload cannot be trusted) and writes the record:

```typescript
nk.leaderboardRecordWrite(
    "tictactoe_wins",
    ctx.userId,      // server-resolved identity
    ctx.username ?? "",
    1, 0, {}
);
```

---

## 5. Frontend Architecture

The frontend follows a **single Nakama instance pattern** — one `Nakama` class instance is created per browser session, stored in a `useRef` to persist across re-renders without triggering re-renders itself.

```
app/
├── page.tsx              ← Landing page (links, developer info)
└── tictactoe/
    └── page.tsx          ← Mounts <Board /> component

components/
├── board.tsx             ← Core game component (all game state)
├── square.tsx            ← Individual cell (pure presentational)
└── Leaderboard.tsx       ← Top-10 winners display

lib/
├── nakama.ts             ← Nakama SDK wrapper class
└── messages.ts           ← Shared OpCode enums + message types
```

### State Management Strategy

Game state is deliberately **not** managed in a global store (no Redux/Zustand). All state lives in `board.tsx` using React hooks. The key architectural decision is the separation of:

- `useState` → values needed to trigger re-renders (board squares, turn indicator, messages)
- `useRef` → values needed inside socket callbacks without stale closure issues (`playerIndexRef`, `nakamaRef`)

This distinction is what solved the "opponent marks not showing" bug — the `DONE` handler was reading a stale `playerIndex` state value from the closure captured at mount time.

---

## 6. WebSocket Communication Flow

```
BROWSER                              NAKAMA SERVER
   │                                      │
   │── authenticateDevice(deviceId) ─────►│
   │◄── JWT session token ────────────────│
   │                                      │
   │── socket.connect(session) ──────────►│  (WebSocket upgrade)
   │◄── connection acknowledged ──────────│
   │                                      │
   │── rpc("find_match_js", {}) ─────────►│
   │◄── { matchIds: ["match-uuid"] } ─────│
   │                                      │
   │── socket.joinMatch("match-uuid") ───►│  matchJoinAttempt()
   │◄── match presence info ─────────────│  matchJoin()
   │                                      │
   │                          (2nd player joins)
   │◄── OpCode.START ────────────────────│  matchLoop tick
   │                                      │
   │── socket.sendMatchState(MOVE, {pos})►│  matchLoop processes
   │◄── OpCode.UPDATE ───────────────────│  broadcast to all
   │                                      │
   │◄── OpCode.DONE ─────────────────────│  winner computed
   │── rpc("record_win_js", {}) ─────────►│  leaderboard updated
   │◄── { success: true } ───────────────│
```

---

## 7. Key Engineering Challenges & Solutions

### 7.1 The nakama-runtime npm Problem

**Problem:** Every attempt to install the Nakama TypeScript type definitions via:
```
npm install @heroiclabs/nakama-runtime
```
resulted in a `404 Not Found` from the npm registry. The package `@heroiclabs/nakama-runtime` does not exist on npm.

**Root Cause:** Heroic Labs distributes the server-side TypeScript definitions through GitHub, not the npm registry. The package is named `nakama-runtime` (no `@heroiclabs` scope) and is installed directly from the `heroiclabs/nakama-common` GitHub repository.

**Resolution:** Use a GitHub URL dependency in `package.json`:
```json
{
  "dependencies": {
    "nakama-runtime": "github:heroiclabs/nakama-common#master"
  }
}
```
After `npm install`, the types are available at `node_modules/nakama-runtime/index.d.ts` and referenced in TypeScript as the global `nkruntime` namespace — no `import` statement required.

> **Note:** `@heroiclabs/nakama-js` (the *client-side* SDK) **does** exist on npm. These are two completely different packages — client SDK vs. server-side type definitions. Confusing them was the core of the problem.

---

### 7.2 Port 7350 Not Starting

**Problem:** Nakama started successfully (no crash) but the HTTP API on port 7350 was never available. All client connections returned `ERR_CONNECTION_REFUSED`. The Docker logs showed only ports 7348 and 7351 starting.

**Root Cause:** The `local.yml` configuration file was missing the `socket` block. Without explicit socket configuration, Nakama's API server did not bind.

**Resolution:** Added explicit socket configuration to `local.yml`:
```yaml
socket:
  server_key: defaultkey
  port: 7350
  address: ""
  protocol: tcp
```

---

### 7.3 Device ID Collision on Local Testing

**Problem:** When testing with two browser windows on the same machine (or two Brave browsers sharing the same `localStorage` namespace), both clients authenticated as the same Nakama user ID. This caused the second connection attempt to invalidate the first session — Nakama allows only one active session per user.

**Root Cause:** The client generates a persistent `deviceId` and stores it in `localStorage`. Two windows in the same browser share the same `localStorage` origin, producing identical device IDs and therefore identical user accounts.

**Resolution:** Use genuinely separate browser environments — Chrome and Edge (separate localStorage per browser binary), or Chrome regular + Chrome Incognito. The `uuidv4()` generation logic was correct; the issue was purely environmental.

---

### 7.4 SDK Payload Double-Parsing Bug

**Problem:** The leaderboard fetch was crashing with:
```
SyntaxError: Unexpected token 'o', "[object Obj"... is not valid JSON
```

**Root Cause:** The `@heroiclabs/nakama-js` SDK's `client.rpc()` method automatically deserialises the JSON response payload before returning it. Our code then called `JSON.parse()` again on the already-parsed object, which produced `[object Object]` as the input string — not valid JSON.

**Resolution:** Added a type guard before parsing:
```typescript
const payload = result.payload;
if (Array.isArray(payload)) return payload;
if (typeof payload === "string") return JSON.parse(payload);
return [];
```

---

### 7.5 TypeScript Enum Mismatches

**Problem:** The Docker build failed with TypeScript compilation errors:
```
error TS2345: Argument of type '"desc"' is not assignable to parameter of type 'SortOrder'
error TS2551: Property 'INCREMENT' does not exist on type 'typeof Operator'
```

**Root Cause:** Nakama's TypeScript definitions use string enums rather than raw string literals. The correct identifiers are:
- `nkruntime.SortOrder.DESCENDING` (not `"desc"`)
- `nkruntime.Operator.INCREMENTAL` (not `"incr"` or `"INCREMENT"`)

**Resolution:** Always use the fully-qualified enum references from the `nkruntime` namespace rather than raw strings when calling Nakama SDK methods.

---

## 8. Project Structure

```
nakama-tictactoe/
│
├── client/
│   ├── server/                    ← Nakama server code
│   │   ├── src/
│   │   │   ├── main.ts            ← InitModule, RPC + match registration
│   │   │   ├── match_handler.ts   ← Full match lifecycle implementation
│   │   │   ├── match_rpc.ts       ← find_match_js, record_win_js, get_leaderboard_js
│   │   │   ├── messages.ts        ← Shared OpCode enums and message types
│   │   │   └── daily_rewards.ts   ← Bonus: daily reward RPC
│   │   ├── build/
│   │   │   └── index.js           ← Compiled output (loaded by Nakama V8 runtime)
│   │   ├── docker-compose.yml     ← Nakama + PostgreSQL services
│   │   ├── local.yml              ← Nakama runtime configuration
│   │   ├── package.json           ← nakama-runtime from github:heroiclabs/nakama-common
│   │   └── tsconfig.json
│   │
│   └── client/                    ← Next.js 13 frontend
│       ├── app/
│       │   ├── page.tsx           ← Landing page
│       │   └── tictactoe/
│       │       └── page.tsx       ← Game page
│       ├── components/
│       │   ├── board.tsx          ← Main game component
│       │   ├── square.tsx         ← Cell component
│       │   └── Leaderboard.tsx    ← Top-10 leaderboard
│       ├── lib/
│       │   ├── nakama.ts          ← SDK wrapper (auth, match, RPC, moves)
│       │   └── messages.ts        ← OpCode enums (mirrored from server)
│       └── .env.local             ← NEXT_PUBLIC_SERVER_API, PORT, SSL flag
```

---

## 9. Local Development Setup

### Prerequisites

- Node.js 18+
- Docker Desktop (running)
- Git

### Step 1 — Clone

```bash
git clone <repo-url>
cd nakama-tictactoe
```

### Step 2 — Start the server

```powershell
cd client/server
npm install        # installs nakama-runtime from github:heroiclabs/nakama-common
npx tsc            # compiles TypeScript → build/index.js
docker compose up --build nakama
```

Verify startup — all four lines must appear:
```
Starting API server for gRPC requests         port: 7349
Starting API server gateway for HTTP requests  port: 7350
Starting Console server for gRPC requests      port: 7348
Starting Console server gateway for HTTP       port: 7351
JavaScript logic loaded.
Startup done
```

Admin console: `http://localhost:7351` (credentials: `admin` / `password`)

### Step 3 — Start the frontend

```powershell
# In a second terminal
cd client/client
# Edit .env.local:
# NEXT_PUBLIC_SERVER_API=<your-local-ip>
# NEXT_PUBLIC_SERVER_PORT=7350
# NEXT_PUBLIC_USE_SSL=false
npm install
npm run dev
```

### Step 4 — Play

Open `http://localhost:3000` in **two different browsers** (e.g. Chrome + Edge). Login with different usernames, click **Find Match** in both. The match starts automatically when two players connect.

> **Why two different browsers?** `localStorage` is scoped per browser binary. Two tabs in the same browser share the same `deviceId`, which causes Nakama to authenticate both as the same user, invalidating the first session when the second connects.

---

## 10. Features Implemented

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Device authentication | `client.authenticateDevice(uuidv4())` | Persistent UUID in localStorage |
| Auto matchmaking | `find_match_js` RPC + Bleve label query | Finds open match or creates new |
| Server-authoritative moves | `matchLoop` validates every `MOVE` opcode | Clients cannot cheat |
| Turn enforcement | `deadlineTick` counter in match state | 30s per turn, auto-advance on timeout |
| Real-time board sync | `dispatcher.broadcastMessage` on every state change | All players see identical board |
| Disconnect handling | `matchLeave` broadcasts `DONE` with disconnect reason | Graceful disconnection |
| Win detection | `calculateWinner()` server-side on every move | 8 win conditions checked |
| Leaderboard | `nk.leaderboardRecordsList` + INCREMENTAL operator | Persisted in PostgreSQL |
| Win recording | `record_win_js` RPC triggered on `DONE` | Uses `ctx.userId` (server-resolved) |
| Turn timer UI | Client-side `setInterval` synced to server `deadline` timestamp | Green → Yellow → Red |
| Mobile responsive | Tailwind CSS responsive classes | Tested on mobile Brave |

---

## 11. Thinking Process & Engineering Decisions

### Why Nakama over a custom WebSocket server?

A custom Node.js WebSocket server (e.g. `ws` library + Express) would require implementing from scratch: session management, match lifecycle, presence tracking, reconnection handling, and persistent storage. Nakama provides all of these as first-class primitives. The tradeoff is learning the Nakama API surface — which this project documents thoroughly.

### Why TypeScript runtime over Lua or Go?

The assignment specified TypeScript/Node.js as the developer's background. Nakama's TypeScript runtime compiles to JavaScript running in V8, sharing language familiarity with the frontend. The tradeoff is performance — Go runtime is significantly faster for CPU-intensive match logic. For a 2-player turn-based game at 5 ticks/sec, TypeScript runtime performance is completely adequate.

### Why not trust the client for move validation?

In a client-trusted architecture, a malicious client could send any board state to the server. By making `matchLoop` the single point of state mutation and validation, we guarantee game integrity regardless of client behaviour. The client's board state is always overwritten by the server's authoritative broadcast — the client's optimistic local update is cosmetic only.

### The iterative debugging approach

The development process was heavily iterative, with each environment issue discovered and resolved incrementally:

1. **npm package discovery** → Learned that Nakama runtime types are GitHub-distributed, not npm-published
2. **Docker port binding** → Discovered that `local.yml` socket block is mandatory for port 7350
3. **Multi-player testing** → Discovered localStorage collision between browser tabs; resolved with separate browser binaries
4. **Stale closure bug** → Identified that React state inside WebSocket callbacks needs `useRef` for freshness
5. **SDK payload parsing** → Discovered nakama-js auto-deserialises RPC payloads; removed double `JSON.parse`
6. **TypeScript enum strictness** → Learned Nakama uses string enums via `nkruntime.SortOrder` and `nkruntime.Operator` namespaces

Each of these was not a code bug but an **integration contract misunderstanding** — the kind that only surfaces when building a real end-to-end system rather than following isolated tutorials.

---

## References

- [Nakama TypeScript Runtime](https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/)
- [Nakama Authoritative Multiplayer](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/)
- [Nakama XOXO Tutorial](https://heroiclabs.com/docs/nakama/tutorials/javascript/xoxo/)
- [heroiclabs/nakama-project-template](https://github.com/heroiclabs/nakama-project-template)
- [heroiclabs/nakama-common (runtime types)](https://github.com/heroiclabs/nakama-common)
- [@heroiclabs/nakama-js (client SDK)](https://github.com/heroiclabs/nakama-js)

---

*Built by Sarvesh Patil as a technical assignment for Lila Gaming Studios.*
*Backend Developer at [Flickit.app](https://flickit.app) · [LinkedIn](https://www.linkedin.com/in/sarvesh-patil-559b3124b/) · [Portfolio](https://light1300.github.io/Sarvesh.dev/)*
