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

const MAX_FRIENDS = 1000;

let posts = [];
let chats = [];
let profiles = {};
let notifications = {}; // user -> array of notif objects

function pushNotif(targetUser, text) {
  if (!targetUser) return;
  if (!notifications[targetUser]) notifications[targetUser] = [];
  notifications[targetUser].unshift({
    id: Date.now() + Math.floor(Math.random() * 9999),
    text,
    time: new Date().toLocaleTimeString(),
    read: false
  });
  notifications[targetUser] = notifications[targetUser].slice(0, 50);
}

function getFullState() {
  return { posts, chats, profiles, notifications };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.emit('state', getFullState());

  socket.on('join', (rawUser) => {
    const user = String(rawUser || '').trim().replace(/^@+/, '');
    if (!user) return;
    if (!profiles[user]) {
      profiles[user] = {
        user,
        bio: '',
        lang: 'Afaan Oromo',
        followers: [],
        following: [],
        friends: [],
        friendRequests: [] // incoming requests
      };
    } else {
      profiles[user].followers = profiles[user].followers || [];
      profiles[user].following = profiles[user].following || [];
      profiles[user].friends = profiles[user].friends || [];
      profiles[user].friendRequests = profiles[user].friendRequests || [];
    }
    io.emit('state', getFullState());
  });

  socket.on('toggle_follow', ({ actor, target }) => {
    const a = String(actor || '').trim().replace(/^@+/, '');
    const t = String(target || '').trim().replace(/^@+/, '');
    if (!a || !t || a === t) return;
    if (!profiles[a]) profiles[a] = { user: a, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };
    if (!profiles[t]) profiles[t] = { user: t, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };

    const idxFollowing = profiles[a].following.indexOf(t);
    if (idxFollowing === -1) {
      profiles[a].following.push(t);
      if (!profiles[t].followers.includes(a)) profiles[t].followers.push(a);
      pushNotif(t, '@' + a + ' si hordofuu jalqabe (Followed you).');
    } else {
      profiles[a].following.splice(idxFollowing, 1);
      profiles[t].followers = profiles[t].followers.filter((x) => x !== a);
    }
    io.emit('state', getFullState());
  });

  socket.on('send_friend_request', ({ actor, target }) => {
    const a = String(actor || '').trim().replace(/^@+/, '');
    const t = String(target || '').trim().replace(/^@+/, '');
    if (!a || !t || a === t) return;
    if (!profiles[a]) profiles[a] = { user: a, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };
    if (!profiles[t]) profiles[t] = { user: t, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };

    if (profiles[a].friends.includes(t)) return;
    if (profiles[a].friends.length >= MAX_FRIENDS || profiles[t].friends.length >= MAX_FRIENDS) return;

    if (!profiles[t].friendRequests.includes(a)) {
      profiles[t].friendRequests.push(a);
      pushNotif(t, '@' + a + ' gaaffii michummaa (Friend Request) siif erge.');
    }
    io.emit('state', getFullState());
  });

  socket.on('accept_friend', ({ actor, requester }) => {
    const a = String(actor || '').trim().replace(/^@+/, '');
    const r = String(requester || '').trim().replace(/^@+/, '');
    if (!a || !r || a === r) return;
    if (!profiles[a]) profiles[a] = { user: a, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };
    if (!profiles[r]) profiles[r] = { user: r, bio: '', lang: 'Afaan Oromo', followers: [], following: [], friends: [], friendRequests: [] };

    profiles[a].friendRequests = profiles[a].friendRequests.filter((x) => x !== r);
    if (profiles[a].friends.length < MAX_FRIENDS && !profiles[a].friends.includes(r)) {
      profiles[a].friends.push(r);
    }
    if (profiles[r].friends.length < MAX_FRIENDS && !profiles[r].friends.includes(a)) {
      profiles[r].friends.push(a);
    }
    pushNotif(r, '@' + a + ' gaaffii michummaa kee fudhate (Accepted friend request).');
    io.emit('state', getFullState());
  });

  socket.on('decline_friend', ({ actor, requester }) => {
    const a = String(actor || '').trim().replace(/^@+/, '');
    const r = String(requester || '').trim().replace(/^@+/, '');
    if (!a || !r || !profiles[a]) return;
    profiles[a].friendRequests = (profiles[a].friendRequests || []).filter((x) => x !== r);
    io.emit('state', getFullState());
  });

  socket.on('remove_friend', ({ actor, target }) => {
    const a = String(actor || '').trim().replace(/^@+/, '');
    const t = String(target || '').trim().replace(/^@+/, '');
    if (!a || !t) return;
    if (profiles[a]) profiles[a].friends = (profiles[a].friends || []).filter((x) => x !== t);
    if (profiles[t]) profiles[t].friends = (profiles[t].friends || []).filter((x) => x !== a);
    io.emit('state', getFullState());
  });

  socket.on('mark_notifs_read', (rawUser) => {
    const u = String(rawUser || '').trim().replace(/^@+/, '');
    if (!u || !notifications[u]) return;
    notifications[u].forEach((n) => { n.read = true; });
    io.emit('state', getFullState());
  });

  socket.on('post', (data) => {
    if (!data || !data.content) return;
    const author = String(data.author || 'Anonymous').trim().replace(/^@+/, '');
    posts.push({
      id: Date.now() + Math.floor(Math.random() * 999),
      author,
      content: data.content,
      time: data.time || new Date().toLocaleTimeString(),
      likes: 0,
      comments: []
    });
    const followers = (profiles[author] && profiles[author].followers) || [];
    followers.forEach((f) => {
      pushNotif(f, '@' + author + ' maxxansa haaraa maxxanse.');
    });
    io.emit('state', getFullState());
  });

  socket.on('like', (id) => {
    const postItem = posts.find((x) => x.id === id);
    if (postItem) {
      postItem.likes = (postItem.likes || 0) + 1;
      io.emit('state', getFullState());
    }
  });

  socket.on('comment', ({ id, author, text }) => {
    const postItem = posts.find((x) => x.id === id);
    if (postItem && text) {
      const cleanAuthor = String(author || 'Anonymous').trim().replace(/^@+/, '');
      postItem.comments.push({
        author: cleanAuthor,
        text
      });
      if (postItem.author && postItem.author !== cleanAuthor) {
        pushNotif(postItem.author, '@' + cleanAuthor + ' maxxansa kee irratti yaada (comment) kenne.');
      }
      io.emit('state', getFullState());
    }
  });

  socket.on('chat', (msg) => {
    if (!msg || !msg.text) return;
    const sender = String(msg.sender || 'Anonymous').trim().replace(/^@+/, '');
    chats.push({
      sender,
      to: msg.to ? String(msg.to).trim().replace(/^@+/, '') : 'All',
      text: msg.text,
      time: msg.time || new Date().toLocaleTimeString()
    });
    if (msg.to) {
      const target = String(msg.to).trim().replace(/^@+/, '');
      if (target && target !== 'All') {
        pushNotif(target, '@' + sender + ' ergaa (chat) siif erge.');
      }
    }
    io.emit('state', getFullState());
  });

  socket.on('profile', (data) => {
    if (!data || !data.user) return;
    const u = String(data.user).trim().replace(/^@+/, '');
    const existing = profiles[u] || { followers: [], following: [], friends: [], friendRequests: [] };
    profiles[u] = {
      ...existing,
      ...data,
      user: u,
      followers: existing.followers || [],
      following: existing.following || [],
      friends: existing.friends || [],
      friendRequests: existing.friendRequests || []
    };
    io.emit('state', getFullState());
    socket.emit('profile_saved');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('OUR FACE LIVE ON PORT ' + PORT);
});
