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

// Memory Store for Pomodoro State (Per Room)
const pomodoroStates = {}; // { boardId: { phase, remainingTime, isRunning, lastUpdate } }

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
    
    // Sync Pomodoro State on Join
    if (pomodoroStates[boardId]) {
      const state = pomodoroStates[boardId];
      // Calculate current remaining if running
      let currentRemaining = state.remainingTime;
      if (state.isRunning) {
         const elapsed = Math.floor((Date.now() - state.lastUpdate) / 1000);
         currentRemaining = Math.max(0, state.remainingTime - elapsed);
      }
      socket.emit('pomodoro:sync', { 
         ...state, 
         remainingTime: currentRemaining,
         // Send fresh timestamp reference
         lastUpdate: Date.now() 
      });
    }

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

  socket.on('board:update', (data) => {
    const { boardId } = data;
    if (boardId) {
        socket.to(boardId).emit('board:update', data);
    }
  });

  // GAME ACTIONS - Broadcast to all in room
  socket.on('game:action', (data) => {
      const { boardId } = data;
      if (boardId) {
          // Broadcast to everyone including sender for state consistency in some game types,
          // but typically 'game:action' is handled by onRemoteData on peers.
          socket.to(boardId).emit('game:action', data);
      }
  });
  
  // PROFILE SYNC
  socket.on('profile:update', (data) => {
      const { boardId, profile, userId } = data;
      if (boardId) {
          socket.to(boardId).emit('profile:update', { userId, profile });
      }
  });

  // POMODORO SYNC
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

      // Broadcast new state to everyone in room
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
    // Optional: emit user left to handle cleanup if needed, 
    // though ghosts handle timeout automatically.
  });
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Socket.IO ready`);
});
