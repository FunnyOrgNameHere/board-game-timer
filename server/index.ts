// server.ts
import { randomUUID } from 'crypto';

interface Player {
  id: string; // Unique ID bound to a WebSocket
  name: string;
  remainingTime: number; // milliseconds
}

interface GameState {
  players: Array<Player>;
  currentPlayerIndex: number;
  lastTickTimestamp: number;
  running: boolean;
}

interface RoomState {
  gameState: GameState;
  connections: Set<ServerWebSocket>; // All clients in this room
}

// Hard-coded defaults
const TIMER_LIMIT = .5; // 1.2 minutes

const DEFAULT_TIME_LIMIT = TIMER_LIMIT * 60 * 1000; // 5 minutes
const MAX_PLAYERS = 3; // up to 6 players
const rooms: Record<string, RoomState> = {};

function createGameState(numPlayers: number, timeLimit: number): GameState {
  const players: Array<Player> = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: `player_${i}`, // placeholder, replaced once joined
      name: `Player ${i + 1}`,
      remainingTime: timeLimit,
    });
  }
  return {
    players,
    currentPlayerIndex: 0,
    lastTickTimestamp: Date.now(),
    running: false,
  };
}

function updateCurrentPlayerTime(gameState: GameState): void {
  if (!gameState.running) return;
  const now = Date.now();
  const elapsed = now - gameState.lastTickTimestamp;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  currentPlayer.remainingTime = Math.max(0, currentPlayer.remainingTime - elapsed);
  gameState.lastTickTimestamp = now;

  // Move to the next player if the current player runs out of time
  if (currentPlayer.remainingTime <= 0) {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.lastTickTimestamp = now;
  }
}

function isGameOver(gameState: GameState): boolean {
return gameState.players.filter((p) => p.remainingTime > 0).length <= 1;
}

function handleTap(gameState: GameState, playerId: string) {
  // Update clock for the current player
  updateCurrentPlayerTime(gameState);

  if (!gameState.running) {
    // First tap starts the clock
    gameState.running = true;
    gameState.lastTickTimestamp = Date.now();
    return;
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Only allow tap if it's indeed that user's turn
  if (currentPlayer.id === playerId) {
    // Move to the next player (round-robin)
    gameState.currentPlayerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.lastTickTimestamp = Date.now();
  }
}

function broadcastState(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const message = JSON.stringify({
    type: 'gameState',
    data: room.gameState,
  });

  for (const ws of room.connections) {
    // In Bun, readyState === 1 means "OPEN"
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
}

// Periodically tick each room’s current clock
setInterval(() => {
  for (const roomId of Object.keys(rooms)) {
    const { gameState } = rooms[roomId];
    if (gameState.running) {
      updateCurrentPlayerTime(gameState);
      if (isGameOver(gameState)) {
        gameState.running = false;
      }
      broadcastState(roomId);
    }
  }
}, 500);

const server = Bun.serve({
  port: 3000, hostname: "0.0.0.0",
  // This fetch handler attempts to upgrade every incoming request to a WebSocket.
  // If it’s not a WS request, we just return a standard response.
  fetch(req, server) {
    if (server.upgrade(req)) {
      // If the upgrade succeeds, we don’t return a Response at all
      return;
    }

    return new Response('Bun server is running!\n', { status: 200 });
  },

  websocket: {
    open(ws) {
      console.log('WebSocket opened');
    },

    message(ws, rawMsg) {
      try {
        const parsed = JSON.parse(rawMsg.toString());
        const { type } = parsed;

        if (type === 'joinRoom') {
          // { roomId, username }
          const { roomId, username } = parsed;
          if (!roomId || !username) return;

          // If room doesn't exist, create it
          if (!rooms[roomId]) {
            rooms[roomId] = {
              gameState: createGameState(MAX_PLAYERS, DEFAULT_TIME_LIMIT),
              connections: new Set(),
            };
          }

          const { gameState, connections } = rooms[roomId];
          const unassigned = gameState.players.find((p) =>
            p.id.startsWith('player_')
          );
          if (!unassigned) {
            // Room full or no placeholders left
            ws.send(
              JSON.stringify({ type: 'error', message: 'Room is full.' })
            );
            return;
          }

          // Bind the player's ID to this websocket
          const playerId = randomUUID();
          unassigned.id = playerId;
          unassigned.name = username;

          // Store the user’s info on ws.data
          ws.data = { roomId, playerId };

          // Add them to the room’s connection set
          connections.add(ws);

          // Broadcast new state
          broadcastState(roomId);
        } else if (type === 'tap') {
          // Only proceed if the user has joined a room
          if (!ws.data?.roomId || !ws.data?.playerId) return;
          const { roomId, playerId } = ws.data;
          const room = rooms[roomId];
          if (!room) return;

          handleTap(room.gameState, playerId);
          if (isGameOver(room.gameState)) {
            room.gameState.running = false;
          }
          broadcastState(roomId);
        } else {
          console.warn('Unknown message type:', type);
        }
      } catch (err) {
        console.error('Failed to handle message:', err);
      }
    },

    close(ws) {
      console.log('WebSocket closed');
      const { roomId } = ws.data || {};
      if (roomId && rooms[roomId]) {
        rooms[roomId].connections.delete(ws);
      }
      // Optional: If you want to free up the player slot on disconnect, do it here
    },
  },

  // 'development: true' is optional; not documented in the official docs but may
  // be recognized by Bun. If it causes issues, remove it.
  development: true,
});

console.log(`Server running at http://localhost:${server.port}`);
