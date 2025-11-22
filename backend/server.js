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

// Correct path resolution relative to backend/server.js
const srcPath = path.join(__dirname, "..", "src");
const mainAppPath = path.join(srcPath, "mainapp.html");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from src directory
app.use(express.static(srcPath));

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

// Routes
app.get("/", (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.sendFile(mainAppPath);
  } else {
    res.sendFile(path.join(srcPath, "Pages", "signin.html"), (err) => {
        if (err) res.redirect('/login');
    });
  }
});

app.get("/profile", requiresAuth(), (req, res) => {
  res.send(`<pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>`);
});

app.get("/user-data", requiresAuth(), async (req, res) => {
  try {
    const auth0User = req.oidc.user;
    let userData = {};
    if (redis && redis.isOpen) {
        const userId = await redis.get(`email:${auth0User.email}`);
        if (userId) userData = await redis.hGetAll(`user:${userId}`);
    }
    res.send(`<pre>${JSON.stringify(userData, null, 2)}</pre>`);
  } catch (error) {
    res.status(500).send('Error fetching user data');
  }
});

// SPA Routes - serve mainapp.html for frontend routing
app.get(["/board", "/chat", "/room"], requiresAuth(), (req, res) => {
  res.sendFile(mainAppPath);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('join', (boardId) => {
    socket.join(boardId);
    console.log(`👤 User ${socket.id} joined board: ${boardId}`);
  });

  socket.on('board:update', (data) => {
    // Broadcast to everyone in the room EXCEPT the sender
    if (data.boardId) {
        socket.to(data.boardId).emit('board:update', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

httpServer.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
    console.log(`📡 Socket.IO ready`);
});