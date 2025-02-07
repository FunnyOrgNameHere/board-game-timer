// server.ts
import { randomUUID } from 'crypto';
import { config } from 'dotenv';

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
  timeLimit: number;
}

interface RoomState {
  gameState: GameState;
  connections: Set<ServerWebSocket>; // All clients in this room
}

// Hard-coded defaults
const TIMER_LIMIT = 1.2; // 1.2 minutes

const TIME_LIMIT = TIMER_LIMIT * 60 * 1000; // 5 minutes
//const MAX_PLAYERS = 3; // up to 6 players
const rooms: Record<string, RoomState> = {};

function createGameState(timeLimit: number): GameState {
  const players: Array<Player> = [];
  return {
    players: players, // No placeholder players
    currentPlayerIndex: 0,
    lastTickTimestamp: Date.now(),
    running: false,
    timeLimit: timeLimit,
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
        let winnerIndex = gameState.players.findIndex((p) => p.remainingTime >= 1);
        gameState.currentPlayerIndex = winnerIndex;
      }
      broadcastState(roomId);
    }
  }
}, 250);


config();

const isDevelopment = process.env.NODE_ENV === 'development';
const cert = !isDevelopment ? undefined : Bun.file("/etc/letsencrypt/live/unixtm.dev-0001/fullchain.pem");
const key = !isDevelopment ? undefined : Bun.file("/etc/letsencrypt/live/unixtm.dev-0001/privkey.pem");

const server = Bun.serve({
  port: 3000, hostname: "0.0.0.0",
  
  cert: cert,
  key: key,
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
              gameState: createGameState(TIME_LIMIT),
              connections: new Set(),
            };
          }

          const { gameState, connections } = rooms[roomId];

          // Bind the player's ID to this websocket
          const playerId = randomUUID();

          //const newPlayer = [];
          //newPlayer.id = playerId;
          //newPlayer.name = username;
          gameState.players.push({
            id: playerId, // placeholder, replaced once joined
            name: username,
            remainingTime: TIME_LIMIT,
          });

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
});

console.log(`Server running at http://localhost:${server.port}`);
