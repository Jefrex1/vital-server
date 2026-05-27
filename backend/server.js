'use strict';
require('dotenv').config();

// ─── Validate required env vars before anything else ──────────────────────────
// Both JWT_SECRET and ENCRYPTION_KEY are validated inside their respective modules
// (middleware/index.js and lib/db.js) and will call process.exit(1) if missing.

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { WebSocketServer } = require('ws');
const swaggerUi = require('swagger-ui-express');

// Import modules (env validation happens here)
require('./lib/db');                          // DB init + migrations
const { attachWebSocket } = require('./lib/websocket');
const { errorHandler }    = require('./middleware');

const authRouter    = require('./routes/auth');
const usersRouter   = require('./routes/users');
const configsRouter = require('./routes/configs');
const groupsRouter  = require('./routes/groups');
const invitesRouter = require('./routes/invites');
const filesRouter   = require('./routes/files');
const adminRouter   = require('./routes/admin');

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Restrict to explicitly configured origins. Use '*' only in dev with ALLOW_ALL_ORIGINS=true.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : null;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / Postman / curl
    if (process.env.ALLOW_ALL_ORIGINS === 'true') return callback(null, true);
    if (allowedOrigins && allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

// ─── Swagger ──────────────────────────────────────────────────────────────────
const swaggerSpec = {
  openapi: '3.0.0',
  info: { title: 'oServer API', version: '2.0.0', description: 'SSH File Manager & Terminal API' },
  servers: [{ url: `http://localhost:${process.env.PORT || 3001}` }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  security: [{ bearerAuth: [] }],
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth',    authRouter);
app.use('/users',   usersRouter);
app.use('/',        usersRouter);   // exposes /account/settings and /account/password at root level
app.use('/configs', configsRouter);
app.use('/groups',  groupsRouter);
app.use('/invites', invitesRouter);
app.use('/',        filesRouter);   // /run, /files/*, /saved-commands
app.use('/',        adminRouter);   // /permissions, /audit

// ─── Centralised error handler (must be last) ─────────────────────────────────
app.use(errorHandler);

// ─── HTTP + WebSocket ─────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
attachWebSocket(wss);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[oServer] Running on port ${PORT}`);
  if (!process.env.CORS_ORIGINS && process.env.ALLOW_ALL_ORIGINS !== 'true') {
    console.warn('[oServer] ⚠️  CORS_ORIGINS is not set — requests from browsers will be blocked.');
    console.warn('[oServer]    Set CORS_ORIGINS=http://localhost:3000 or set ALLOW_ALL_ORIGINS=true for dev.');
  }
});
