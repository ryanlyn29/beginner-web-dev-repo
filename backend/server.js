import express  from 'express'
import { createServer } from 'http';
import { Server } from 'socket.io';
import redis from './redis.js'
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'express-openid-connect';
const { auth, requiresAuth } = pkg;

dotenv.config();
const app = express()
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.AUTH0_BASE_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const port = 3000

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainAppPath = path.join(__dirname, "../src", "mainapp.html");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '../src')));

// Auth0 configuration
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`
};

// Auth0 middleware
app.use(auth(config));

redis.connect().catch(console.error);

// Middleware to sync Auth0 users with Redis
async function syncAuth0UserToRedis(req, res, next) {
  if (req.oidc.isAuthenticated()) {
    const auth0User = req.oidc.user;

    try {
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
      } else {
        console.log(`✅ User already exists in Redis: ${auth0User.email}`);
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
    res.sendFile(path.join(__dirname, "../src/Pages", "signin.html"));
  }
});

// Profile route - shows Auth0 user info (for debugging)
app.get("/profile", requiresAuth(), (req, res) => {
  res.send(`<pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>`);
});

// User data route - shows Redis user data (for debugging)
app.get("/user-data", requiresAuth(), async (req, res) => {
  try {
    const auth0User = req.oidc.user;
    const userId = await redis.get(`email:${auth0User.email}`);

    if (!userId) {
      return res.status(404).send('User not found in Redis');
    }

    const userData = await redis.hGetAll(`user:${userId}`);
    res.send(`<pre>${JSON.stringify(userData, null, 2)}</pre>`);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).send('Error fetching user data');
  }
});

// Board route - protected, requires authentication
app.get("/board", requiresAuth(), (req, res) => {
  res.sendFile(mainAppPath, (err) => {
    if (err) {
      console.error("Error sending mainapp.html", err);
      res.status(500).send("Error loading page");
    }
  });
});

// Chat route - protected, requires authentication
app.get("/chat", requiresAuth(), (req, res) => {
  res.sendFile(mainAppPath, (err) => {
    if (err) {
      console.error("Error sending mainapp.html", err);
      res.status(500).send("Error loading page");
    }
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Test event - remove later
  socket.on('test-message', (data) => {
    console.log('Received test message:', data);
    socket.emit('test-response', { message: 'Server received your message!' });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Socket.IO ready`);
})
