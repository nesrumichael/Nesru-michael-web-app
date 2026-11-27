/**
 * ============================================================================
 * OUR FACE - GLOBAL & ORBITAL REAL-TIME SOCIAL MEDIA SERVER
 * ============================================================================
 * Lead Developer: Nesru Michael
 * Academic Program: 3rd Year Student, Educational Planning & Management (EDPM)
 * Email: nesrumichael@gmail.com
 * Phone: +251923502787
 * Portfolio: https://nesrumichaelet.pages.dev
 * ============================================================================
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const apiRoutes = require('./routes/api');
const db = require('./models/DatabaseEngine');
const satRelay = require('./services/SatelliteRelayService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('io', io);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', apiRoutes);

// Active Online Users Map (userId -> socketId)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  socket.on('user:online', (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit('presence:update', Array.from(onlineUsers.keys()));
  });

  // Real-time Private Direct Messaging between Friends & Global Users
  socket.on('chat:private_message', (data) => {
    const { senderId, senderName, receiverId, text } = data;
    if (!senderId || !receiverId || !text) return;

    const satPacket = satRelay.encapsulateOrbitalPacket('PRIVATE_CHAT_MSG', 'ORBITAL_MESH', uuidv4());
    const messageRecord = {
      id: uuidv4(),
      senderId,
      senderName,
      receiverId,
      text: text.trim(),
      satelliteRelay: satPacket.satelliteNode,
      timestamp: new Date().toISOString()
    };

    db.addMessage(messageRecord);

    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('chat:receive_message', messageRecord);
    }
    socket.emit('chat:receive_message', messageRecord);
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(uid);
        break;
      }
    }
    io.emit('presence:update', Array.from(onlineUsers.keys()));
  });
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════════════╗
  ║  OUR FACE - GLOBAL & ORBITAL SOCIAL PLATFORM IS LIVE                 ║
  ║  Port: ${PORT}                                                          ║
  ║  Developer: Nesru Michael (3rd Year EDPM Program)                    ║
  ║  Email: nesrumichael@gmail.com | Phone: +251923502787                ║
  ║  Portfolio: https://nesrumichaelet.pages.dev                         ║
  ╚══════════════════════════════════════════════════════════════════════╝
  `);
});
