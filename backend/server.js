import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import redis from './redis.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'express-openid-connect';
const { auth, requiresAuth } = pkg;

dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.AUTH0_BASE_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainAppPath = path.join(__dirname, "..", "src", "mainapp.html");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from src directory
app.use(express.static(path.join(__dirname, "..", 'src')));

// Auth0 configuration
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET || 'a_very_long_random_string_for_testing_locally',
  baseURL: process.env.AUTH0_BASE_URL || 'http://localhost:3000',
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`
};

// Auth0 middleware
app.use(auth(config));

// Try connecting to Redis, handle error if not available locally
if (redis && typeof redis.connect === 'function') {
    redis.connect().catch(console.error);
}

// Middleware to sync Auth0 users with Redis
async function syncAuth0UserToRedis(req, res, next) {
  if (req.oidc.isAuthenticated()) {
    const auth0User = req.oidc.user;

    try {
      if (redis && redis.isOpen) {
          const userId = await redis.get(`email:${auth0User.email}`);

          if (!userId) {
            const uniqueId = auth0User.sub.replace(/\|/g, '-'); 
            await redis.hSet(`user:${uniqueId}`, {
              id: String(uniqueId),
              name: String(auth0User.name || auth0User.email),
              email: String(auth0User.email),
              auth0_sub: String(auth0User.sub),
              picture: String(auth0User.picture || ''),
              mouseColor: '#3b82f6', // Default Blue
              themeColor: '#1a1b1d',
              created_at: String(new Date().toISOString())
            });
            await redis.set(`email:${auth0User.email}`, uniqueId);
            console.log(`✅ Created new user in Redis: ${auth0User.email}`);
          }
      }
    } catch (error) {
      console.error('Error syncing user to Redis:', error);
    }
  }
  next();
}

app.use(syncAuth0UserToRedis);

// Home route - serves the main app
app.get("/", (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.sendFile(mainAppPath, (err) => {
      if (err) {
        console.error("Error sending mainapp.html", err);
        res.status(500).send("Error loading page");
      }
    });
  } else {
    const signinPath = path.join(__dirname, "..", "src/Pages", "signin.html");
    res.sendFile(signinPath, (err) => {
        if(err) res.redirect('/login'); 
    });
  }
});

app.get("/profile", requiresAuth(), (req, res) => {
  res.json(req.oidc.user);
});

app.get("/api/user-data", requiresAuth(), async (req, res) => {
  try {
    const auth0User = req.oidc.user;
    let userData = { ...auth0User }; 
    
    if (redis && redis.isOpen) {
        const userId = await redis.get(`email:${auth0User.email}`);
        if (userId) {
             const redisData = await redis.hGetAll(`user:${userId}`);
             if(redisData) {
                 userData = { ...userData, ...redisData };
             }
        }
    }
    if(!userData.email) userData.email = auth0User.email;
    if(!userData.name) userData.name = auth0User.name;
    // Default colors if missing
    if(!userData.mouseColor) userData.mouseColor = '#3b82f6';
    if(!userData.themeColor) userData.themeColor = '#1a1b1d';
    
    userData.id = userData.id || auth0User.sub.replace(/\|/g, '-');

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Error fetching user data' });
  }
});

app.get("/user-data", requiresAuth(), (req, res) => {
    res.redirect("/api/user-data");
});

app.post("/api/invite", requiresAuth(), (req, res) => {
    const { email, boardId } = req.body;
    console.log(`[EMAIL SERVICE] 📧 Sending invitation email to: ${email}`);
    console.log(`[EMAIL SERVICE] Link: ${process.env.AUTH0_BASE_URL}/board?room=${boardId}`);
    res.json({ success: true, message: `Invitation sent to ${email}` });
});

app.get(["/board", "/chat", "/room"], requiresAuth(), (req, res) => {
  res.sendFile(mainAppPath);
});

function generateRoomCode(){
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Memory Stores
const pomodoroStates = {}; // { boardId: { phase, remainingTime, isRunning, lastUpdate } }
const roomGameStates = {}; // { boardId: { activeGameId, players, boardData, turn } }
const userPresence = {};   // { socketId: { boardId, userId, lastActive, ghostMode } }

// Ghost Mouse Configuration
const GHOST_TIMEOUT_MS = 10000; // 10 seconds inactivity triggers ghost
const PRESENCE_CHECK_INTERVAL = 2000;

setInterval(() => {
    const now = Date.now();
    for (const [sid, data] of Object.entries(userPresence)) {
        if (!data.ghostMode && (now - data.lastActive > GHOST_TIMEOUT_MS)) {
            // User is inactive - Enable Ghost Mode
            userPresence[sid].ghostMode = true;
            if (data.boardId) {
                io.to(data.boardId).emit('user:ghost', { 
                    userId: data.userId, 
                    isGhost: true 
                });
            }
        }
    }
}, PRESENCE_CHECK_INTERVAL);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', async (data) => {
    try {
      const { roomName, customCode } = data;
      const roomCode = customCode || generateRoomCode();
      const socketsInRoom = await io.in(roomCode).fetchSockets();

      if (customCode && socketsInRoom.length > 0) {
        socket.emit('roomError', 'Room code already in use. Try a different one.');
        return;
      }

      socket.join(roomCode);
      socket.emit('roomCreated', { roomCode: roomCode, roomName: roomName });
    } catch (error) {
      console.error('error creating room:', error);
      socket.emit('roomError', 'Error creating room.');
    }
  });

  socket.on('join-room', async (roomCode) => {
    try {
      const socketsInRoom = await io.in(roomCode).fetchSockets();
      if (socketsInRoom.length === 0) {
        socket.emit('roomError', 'Room does not exist.');
        return;
      }
      socket.join(roomCode);
      socket.emit('roomJoined', { roomCode: roomCode });
      socket.to(roomCode).emit('userJoined', { userId: socket.id });
    } catch (error) {
      console.error('error joining room:', error);
      socket.emit('roomError', 'Error joining room.');
    }
  });

  // Join a specific board room
  socket.on('join', async (boardId) => {
    socket.join(boardId);
    
    // Initialize presence tracking
    userPresence[socket.id] = {
        boardId,
        userId: socket.id, // Will be updated if authenticated user ID is passed later
        lastActive: Date.now(),
        ghostMode: false
    };

    // 1. Sync & Auto-Start Pomodoro (Requirement 3)
    if (!pomodoroStates[boardId]) {
      // Auto-start on first join
      pomodoroStates[boardId] = {
          phase: 'pomodoro',
          remainingTime: 25 * 60,
          isRunning: true, // Auto-start
          lastUpdate: Date.now()
      };
      console.log(`⏱️ Auto-started Pomodoro for Room ${boardId}`);
    }

    // Send current state
    const state = pomodoroStates[boardId];
    let currentRemaining = state.remainingTime;
    if (state.isRunning) {
         const elapsed = Math.floor((Date.now() - state.lastUpdate) / 1000);
         currentRemaining = Math.max(0, state.remainingTime - elapsed);
    }
    socket.emit('pomodoro:sync', { 
         ...state, 
         remainingTime: currentRemaining,
         lastUpdate: Date.now() 
    });

    // 2. Sync Game State (Requirement 2: Reconnects)
    if (roomGameStates[boardId]) {
        socket.emit('game:restore', roomGameStates[boardId]);
    }

    // 3. Sync Chat History
    if (redis && redis.isOpen) {
        try {
            const history = await redis.lRange(`chat:${boardId}`, 0, 49);
            const parsedHistory = history.map(msg => JSON.parse(msg));
            socket.emit('chat:history', parsedHistory);
        } catch (err) {
            console.error("Error fetching chat history:", err);
        }
    }
  });

  // Mouse Movement - Used for Ghost Presence Logic
  socket.on('mouse:move', (data) => {
      const { boardId } = data;
      // Update activity timestamp
      if (userPresence[socket.id]) {
          const wasGhost = userPresence[socket.id].ghostMode;
          userPresence[socket.id].lastActive = Date.now();
          userPresence[socket.id].ghostMode = false;

          // If they were a ghost, tell everyone they are back
          if (wasGhost && boardId) {
              io.to(boardId).emit('user:ghost', { 
                  userId: userPresence[socket.id].userId, 
                  isGhost: false 
              });
          }
      }
      // Broadcast move as usual
      socket.to(boardId).emit('mouse:move', data);
  });

  socket.on('board:update', (data) => {
    const { boardId } = data;
    if (boardId) {
        socket.to(boardId).emit('board:update', data);
    }
  });

  // GAME ACTIONS - Broadcast + Persist State (Requirement 1 & 2)
  socket.on('game:action', (data) => {
      const { boardId, type, payload, userId, userName, userColor } = data;
      if (!boardId) return;
      
      // Update Presence
      if (userPresence[socket.id]) userPresence[socket.id].lastActive = Date.now();

      // Initialize room game state if needed
      if (!roomGameStates[boardId]) {
          roomGameStates[boardId] = { activeGameId: null, boardData: {}, players: {} };
      }
      const gameState = roomGameStates[boardId];

      // --- SERVER AUTHORITATIVE SEAT LOGIC ---
      if (type.includes('_SIT')) {
          const { seat } = payload;
          
          // Race Condition Check: Is seat already taken?
          if (gameState.players && gameState.players[seat]) {
              // Seat occupied, do not process
              return;
          }

          // Assign Seat in Memory
          gameState.players[seat] = {
              id: userId,
              name: userName,
              mouseColor: userColor
          };
          
          // Re-attach the authoritative user object to payload to ensure all clients see the same data
          data.payload.user = gameState.players[seat];
      }

      if (type.includes('_LEAVE')) {
          // Find and remove player from state
          for (const seat in gameState.players) {
              if (gameState.players[seat].id === userId) {
                  delete gameState.players[seat];
              }
          }
      }

      // Track Active Game ID
      if (type === 'C4_MOVE') gameState.activeGameId = 'connect4';
      if (type === 'TTT_MOVE') gameState.activeGameId = 'tictactoe';
      if (type === 'RPS_COMMIT') gameState.activeGameId = 'rps';
      
      // Broadcast to room (including sender to confirm seat)
      io.to(boardId).emit('game:action', data);
  });

  // Handling client-to-server state sync (The authority model)
  // When a client updates the board, they send a sync state that the server stores
  // This is used for Move persistence (Board state, turn)
  socket.on('game:persist_state', (data) => {
      const { boardId, fullState } = data;
      if (boardId && roomGameStates[boardId]) {
          // Merge to avoid overwriting seat logic if race occurs
          roomGameStates[boardId] = {
              ...roomGameStates[boardId],
              ...fullState,
              players: roomGameStates[boardId].players // Keep players from server memory as primary source of truth if possible
          };
          // If fullState has players, it might be a reset, so we can trust it if needed, 
          // but usually seat logic is separate from board logic.
          if (fullState.players) {
               roomGameStates[boardId].players = fullState.players;
          }
      }
  });
  
  // PROFILE SYNC (Requirement 4)
  socket.on('profile:update', async (data) => {
      const { boardId, profile, userId } = data; // profile contains name, mouseColor, themeColor
      
      // 1. Update Redis (Persistence)
      if (redis && redis.isOpen && profile.email) {
          try {
              const redisId = await redis.get(`email:${profile.email}`);
              if (redisId) {
                  await redis.hSet(`user:${redisId}`, {
                      name: profile.name,
                      mouseColor: profile.mouseColor,
                      themeColor: profile.themeColor
                  });
              }
          } catch (e) {
              console.error("Redis profile save error", e);
          }
      }

      // 2. Update Presence Map
      if (userPresence[socket.id]) {
          userPresence[socket.id].userId = userId;
      }

      // 3. Update Game State Players if sitting
      if (boardId && roomGameStates[boardId] && roomGameStates[boardId].players) {
          const players = roomGameStates[boardId].players;
          for (const seat in players) {
              if (players[seat].id === userId) {
                  players[seat].name = profile.name;
                  players[seat].mouseColor = profile.mouseColor;
              }
          }
      }

      // 4. Broadcast to Room (Real-time Sync)
      if (boardId) {
          socket.to(boardId).emit('profile:update', { userId, profile });
      }
  });

  // POMODORO SYNC (Requirement 3)
  socket.on('pomodoro:action', (data) => {
      const { boardId, action, payload } = data;
      if (!boardId) return;

      if (!pomodoroStates[boardId]) {
          pomodoroStates[boardId] = {
              phase: 'pomodoro',
              remainingTime: 25 * 60,
              isRunning: false,
              lastUpdate: Date.now()
          };
      }

      const state = pomodoroStates[boardId];

      if (action === 'start') {
          state.isRunning = true;
          state.lastUpdate = Date.now();
      } else if (action === 'pause') {
          if (state.isRunning) {
              const elapsed = Math.floor((Date.now() - state.lastUpdate) / 1000);
              state.remainingTime = Math.max(0, state.remainingTime - elapsed);
          }
          state.isRunning = false;
          state.lastUpdate = Date.now();
      } else if (action === 'reset') {
          state.isRunning = false;
          state.phase = payload && payload.phase ? payload.phase : 'pomodoro';
          state.remainingTime = payload && payload.time ? payload.time : 25 * 60;
          state.lastUpdate = Date.now();
      } else if (action === 'sync') {
          // Client authoritative update (e.g. phase change)
          state.phase = payload.phase;
          state.remainingTime = payload.remainingTime;
          state.isRunning = payload.isRunning;
          state.lastUpdate = Date.now();
      }

      // Broadcast new state to everyone in room (including sender to confirm)
      io.to(boardId).emit('pomodoro:sync', state);
  });

  socket.on('chat:message', async (data) => {
      const { boardId, message, sender, senderId, senderName } = data;
      if (boardId && message) {
          const chatMessage = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: message,
              sender: senderName || 'User',
              senderId: senderId || socket.id,
              timestamp: new Date().toISOString()
          };

          if (redis && redis.isOpen) {
              try {
                  await redis.rPush(`chat:${boardId}`, JSON.stringify(chatMessage));
                  await redis.lTrim(`chat:${boardId}`, -50, -1);
              } catch (err) {
                  console.error("Error saving chat message:", err);
              }
          }
          io.to(boardId).emit('chat:message', chatMessage);
      }
  });

  socket.on('chat:typing', (data) => {
      const { boardId, isTyping, userName } = data;
      if (boardId) {
          socket.to(boardId).emit('chat:typing', { 
              userId: socket.id, 
              userName: userName, 
              isTyping: isTyping 
          });
      }
  });

  socket.on('disconnect', () => {
      // Cleanup presence
      if (userPresence[socket.id]) {
          const { boardId, userId } = userPresence[socket.id];
          
          // Mark game seat as potentially ghosted (handled by ghost timeout usually, but can trigger immediate ghost logic)
          if (boardId) {
              io.to(boardId).emit('user:ghost', { userId: userId, isGhost: true });
          }
          delete userPresence[socket.id];
      }
      console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Socket.IO ready`);
});
