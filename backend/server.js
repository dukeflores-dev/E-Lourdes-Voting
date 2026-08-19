require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fileUpload = require('express-fileupload');

const { initDB } = require('./database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const voteRoutes = require('./routes/vote');
const resultsRoutes = require('./routes/results');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize Database
initDB();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  abortOnLimit: true
}));

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, 'data')
  }),
  secret: process.env.SESSION_SECRET || 'lourdes-evoting-secret-2024-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Attach io to every request for use in route handlers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/results', resultsRoutes);

// ─── SPA FALLBACKS ────────────────────────────────────────────────────────────
app.get('/voter/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'voter', req.path.replace('/voter/', '') + '.html'));
});
app.get('/admin/*', (req, res) => {
  const page = req.path.replace('/admin/', '');
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin', page + '.html'));
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('📡 Client connected:', socket.id);
  socket.on('join-results', (electionId) => {
    socket.join(`election-${electionId}`);
  });
  socket.on('disconnect', () => {
    console.log('📡 Client disconnected:', socket.id);
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🗳️  Lourdes College E-Voting System');
  console.log('  ─────────────────────────────────────');
  console.log(`  🌐 URL:   http://localhost:${PORT}`);
  console.log(`  👤 Admin: student_id=admin  password=admin123`);
  console.log('');
});

module.exports = { io };
