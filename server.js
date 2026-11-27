require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

let posts = [];
let chats = [];
let profiles = {};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.emit('state', { posts, chats, profiles });

  socket.on('join', (user) => {
    if (!user) return;
    if (!profiles[user]) {
      profiles[user] = { user, bio: '', lang: 'Afaan Oromo' };
    }
    io.emit('state', { posts, chats, profiles });
  });

  socket.on('post', (data) => {
    if (!data || !data.content) return;
    posts.push({
      id: Date.now() + Math.floor(Math.random() * 999),
      author: data.author || 'Anonymous',
      content: data.content,
      time: data.time || new Date().toLocaleTimeString(),
      likes: 0,
      comments: []
    });
    io.emit('state', { posts, chats, profiles });
  });

  socket.on('like', (id) => {
    const postItem = posts.find((x) => x.id === id);
    if (postItem) {
      postItem.likes = (postItem.likes || 0) + 1;
      io.emit('state', { posts, chats, profiles });
    }
  });

  socket.on('comment', ({ id, author, text }) => {
    const postItem = posts.find((x) => x.id === id);
    if (postItem && text) {
      postItem.comments.push({
        author: author || 'Anonymous',
        text
      });
      io.emit('state', { posts, chats, profiles });
    }
  });

  socket.on('chat', (msg) => {
    if (!msg || !msg.text) return;
    chats.push({
      sender: msg.sender || 'Anonymous',
      text: msg.text,
      time: msg.time || new Date().toLocaleTimeString()
    });
    io.emit('state', { posts, chats, profiles });
  });

  socket.on('profile', (data) => {
    if (!data || !data.user) return;
    profiles[data.user] = data;
    io.emit('state', { posts, chats, profiles });
    socket.emit('profile_saved');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('OUR FACE LIVE ON PORT ' + PORT);
});
