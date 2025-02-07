import { useEffect, useState } from 'react';

interface Player {
  id: string;
  name: string;
  remainingTime: number;
}

interface GameState {
  players: Array<Player>;
  currentPlayerIndex: number;
  running: boolean;
}

const isDead = (username: string, gameState: GameState | null): boolean => {
  if (!gameState) return false;
  return gameState.players.some((p) => p.name == username && p.remainingTime <= 0);
}


const currentCheck = (username: string, gameState: GameState | null): boolean => {
  if (!gameState) return false;
  if (username === gameState.players[gameState.currentPlayerIndex].name) {
    return true;
  }
  return false;
};

export default function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const socket = new WebSocket('wss://unixtm.dev:3000');
    socket.onopen = () => {
      console.log('Connected to Bun WebSocket server');
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'gameState') {
          setErrorMsg('');
          setGameState(message.data);
        } else if (message.type === 'error') {
          setErrorMsg(message.message);
        } else if (message.type === 'sfx') {
          //doSFX(message.effect);

          //No clue how to do the logic for doSFX() honestly.
          //This can be both of our problems.
          //  -- @UnixTMDev
        }
      } catch (err) {
        console.error('Invalid message from server:', err);
      }
    };
    socket.onclose = () => {
      console.log('WebSocket closed');
    };
    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const handleJoinRoom = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setErrorMsg('');
    ws.send(
      JSON.stringify({
        type: 'joinRoom',
        roomId,
        username,
      })
    );
  };

  const handleTap = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'tap' }));
  };

  const resetGame = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'reset' }));
  }

  const showModal = () => {
    if (window.confirm('Are you sure you want to reset the game?')) {
      resetGame();
    }
  }

  const changeTime = (time: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'changeTime ', time }));
  }

  const showTimeModal = () => {
    const time = prompt('Enter the time in minutes', '5');
    if (time) {
      changeTime(parseInt(time) * 60000);
    }
  }

  return (
    <div style={{ padding: '1rem', width: "100%" }}>
      {gameState && (
        <div style={{ width: "100%" }}>
          <h1 style={{ fontSize: '2rem' }}>Game State</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(gameState, null, 2)}</pre>
          <h1 style={{ fontSize: '2rem' }}>Room ID: {roomId}</h1>
          <div style={{ marginBottom: '1rem', display: "flex", flexDirection: 'row', gap: "1rem", }}>
            <button onClick={showModal} style={{ fontSize: '1.5rem', flex: "1" }}>
              Reset Game
            </button>
            <button onClick={showTimeModal} style={{ fontSize: '1.5rem', width: "100%", flex: "1" }}>
              Change Time
            </button>
          </div>
        </div>
      )}

      {
        !gameState && (
          <div style={{ marginBottom: '1rem', display: "flex", flexDirection: 'column', gap: "1rem" }}>
            <label style={{ fontSize: '1rem' }}>Join or create a room:</label>
            <input
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ marginRight: '0.5rem', fontSize: '1.5rem' }}
            />
            <label style={{ fontSize: '1rem' }}>Username:</label>
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ marginRight: '0.5rem', fontSize: '1.5rem' }}
            />
            <button onClick={handleJoinRoom} style={{ fontSize: "1.6rem" }}>Join/Create Room</button>
          </div>
        )
      }


      {errorMsg && <div style={{ color: 'red' }}>{errorMsg}</div>}

      <div style={{ marginTop: '2rem' }}>
        {gameState?.players.map((player, idx) => {
          const minutes = Math.floor(player.remainingTime / 60000);
          const seconds = Math.floor((player.remainingTime % 60000) / 1000);

          const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
          const isCurrent = idx === gameState.currentPlayerIndex;

          return (
            <div key={player.id} style={{ margin: '1rem 0', padding: "0 1rem", borderRadius: "8px", fontSize: '2.25rem', background: isDead(player.name, gameState) ? "red" : (currentCheck(player.name, gameState) ? "green" : "grey") }}>
              <strong>{player.name}</strong> — {minutes}:{formattedSeconds} {(isCurrent && gameState.running) && '(Current)'} {(isCurrent && !gameState.running) && '(WINNER!)'}
            </div>
          );
        })}
      </div>

      <button onClick={handleTap} style={{ width: "100%", height: "400px", background: isDead(username, gameState) ? "red" : (currentCheck(username, gameState) ? "green" : "grey"), color: "white", fontSize: "4rem" }} disabled={!currentCheck(username, gameState)}>
        {isDead(username, gameState) ? "You're dead!" : (currentCheck(username, gameState) ? "Tap!" : "Wait your turn!")}
      </button>
    </div >
  );
}
// The wall of text (see line 121) sucks ass, but I'd like to see YOU do better. --@UnixTMDev