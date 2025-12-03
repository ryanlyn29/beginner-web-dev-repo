
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
          // Check if user exists in Redis using their Auth0 email
          const userId = await redis.get(`email:${auth0User.email}`);

          if (!userId) {
            // User doesn't exist in Redis, create them
            const uniqueId = auth0User.sub.replace(/\|/g, '-'); // Use Auth0 sub as unique ID

            await redis.hSet(`user:${uniqueId}`, {
              id: String(uniqueId),
              name: String(auth0User.name || auth0User.email),
              email: String(auth0User.email),
              auth0_sub: String(auth0User.sub),
              picture: String(auth0User.picture || ''),
              created_at: String(new Date().toISOString())
            });

            // Create email -> userId mapping
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

// Apply sync middleware to all routes
app.use(syncAuth0UserToRedis);

// Home route - serves the main app
app.get("/", (req, res) => {
  if (req.oidc.isAuthenticated()) {
    // User is logged in, serve the main app
    res.sendFile(mainAppPath, (err) => {
      if (err) {
        console.error("Error sending mainapp.html", err);
        res.status(500).send("Error loading page");
      }
    });
  } else {
    // User is not logged in, show signin page
    const signinPath = path.join(__dirname, "..", "src/Pages", "signin.html");
    res.sendFile(signinPath, (err) => {
        if(err) res.redirect('/login'); // Fallback to Auth0 login if custom page fails
    });
  }
});

// Profile route - JSON response
app.get("/profile", requiresAuth(), (req, res) => {
  res.json(req.oidc.user);
});

// User data route - JSON response from Redis + Auth0 for Board
app.get("/user-data", requiresAuth(), async (req, res) => {
  try {
    const auth0User = req.oidc.user;
    let userData = { ...auth0User }; // Default to Auth0 data
    
    if (redis && redis.isOpen) {
        const userId = await redis.get(`email:${auth0User.email}`);
        if (userId) {
             const redisData = await redis.hGetAll(`user:${userId}`);
             if(redisData) {
                 userData = { ...userData, ...redisData };
             }
        }
    }
    // Ensure essential fields
    if(!userData.email) userData.email = auth0User.email;
    if(!userData.name) userData.name = auth0User.name;

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Error fetching user data' });
  }
});

// SPA Routes - serve mainapp.html for frontend routing
app.get(["/board", "/chat", "/room"], requiresAuth(), (req, res) => {
  res.sendFile(mainAppPath);
});

// Socket.IO connection handling
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
      console.log(`room created: ${roomCode} - ${roomName}`);
      socket.emit('roomCreated', {
        roomCode: roomCode,
        roomName: roomName
      });
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
      console.log(`User ${socket.id} joined room: ${roomCode}`);
      
      socket.emit('roomJoined', { roomCode: roomCode });
      socket.to(roomCode).emit('userJoined', { userId: socket.id });
    } catch (error) {
      console.error('error joining room:', error);
      socket.emit('roomError', 'Error joining room.');
    }
  });

  // Join a specific board room
  socket.on('join', (boardId) => {
    socket.join(boardId);
    console.log(`User ${socket.id} joined board room: ${boardId}`);
  });

  // Handle board updates and broadcast to others in the room
  socket.on('board:update', (data) => {
    const { boardId } = data;
    if (boardId) {
        socket.to(boardId).emit('board:update', data);
    }
  });

  /* 
   * NEW: Game Action Handler
   * Broadcasts specific game moves/actions to everyone in the room
   * This allows Games.js to stay in sync.
   * Client-side logic handles state validation (optimistic UI + eventual consistency for this scope)
   */
  socket.on('game:action', (data) => {
      const { boardId } = data;
      if (boardId) {
          // Broadcast to everyone including sender (simplified sync) 
          // or excluding sender if optimistic UI is perfect.
          // Here we broadcast to *others* usually, but for authoritative state games 
          // sometimes it's easier to broadcast to all. 
          // Following established pattern: broadcast to others.
          socket.to(boardId).emit('game:action', data);
      }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Socket.IO ready`);
});
