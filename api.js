const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/DatabaseEngine');
const satRelay = require('../services/SatelliteRelayService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'our_face_super_secure_global_satellite_key_2026';
const MAX_FRIENDS = 1000;

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Platform Metadata & Developer Transparency Endpoint
router.get('/system/info', (req, res) => {
  res.json({
    platform: 'Our Face',
    tagline: 'Connecting Humanity Across Earth and Orbit in Real Time',
    developer: {
      name: 'Nesru Michael',
      academicRole: '3rd Year Student, Educational Planning and Management (EDPM) Program',
      email: 'nesrumichael@gmail.com',
      phone: '+251923502787',
      website: 'https://nesrumichaelet.pages.dev'
    },
    limits: {
      followers: 'UNLIMITED',
      friends: MAX_FRIENDS,
      storage: 'UNLIMITED_GLOBAL_DISTRIBUTED_SHARDS'
    },
    satelliteTelemetry: satRelay.getTelemetryStatus()
  });
});

// Register / Sign Up
router.post('/auth/signup', async (req, res) => {
  try {
    const { fullName, username, email, password, countryCode, countryName, phoneCode, language, bio } = req.body;
    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    if (db.findUserByEmailOrUsername(email) || db.findUserByEmailOrUsername(username)) {
      return res.status(409).json({ error: 'Email or Username already registered on Our Face.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      fullName,
      username: username.replace(/^@/, ''),
      email,
      password: hashedPassword,
      countryCode: countryCode || 'ET',
      countryName: countryName || 'Ethiopia',
      phoneCode: phoneCode || '+251',
      language: language || 'om',
      bio: bio || 'Connected globally on Our Face 🌍🛰️',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`,
      friends: [],       // Strictly capped at 1000
      followers: [],     // Unlimited
      following: [],     // Unlimited
      verified: true,
      createdAt: new Date().toISOString()
    };

    db.createUser(newUser);
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...safeUser } = newUser;

    res.status(201).json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Server error during account creation.' });
  }
});

// Sign In
router.post('/auth/signin', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = db.findUserByEmailOrUsername(identifier || '');
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Authentication error.' });
  }
});

// Get All Users (Directory for Follow & Add Friend)
router.get('/users', authenticateToken, (req, res) => {
  const users = db.getUsers().map(({ password, ...u }) => ({
    ...u,
    followerCount: u.followers.length,
    friendCount: u.friends.length,
    maxFriends: MAX_FRIENDS
  }));
  res.json(users);
});

// Follow User (UNLIMITED Followers)
router.post('/users/:targetId/follow', authenticateToken, (req, res) => {
  const currentUserId = req.user.id;
  const { targetId } = req.params;
  if (currentUserId === targetId) return res.status(400).json({ error: 'Cannot follow yourself.' });

  const targetUser = db.findUserById(targetId);
  const currentUser = db.findUserById(currentUserId);
  if (!targetUser || !currentUser) return res.status(404).json({ error: 'User not found.' });

  const isFollowing = currentUser.following.includes(targetId);

  db.updateUser(currentUserId, u => {
    u.following = isFollowing
      ? u.following.filter(id => id !== targetId)
      : [...new Set([...u.following, targetId])];
    return u;
  });

  const updatedTarget = db.updateUser(targetId, u => {
    u.followers = isFollowing
      ? u.followers.filter(id => id !== currentUserId)
      : [...new Set([...u.followers, currentUserId])];
    return u;
  });

  res.json({
    following: !isFollowing,
    targetFollowerCount: updatedTarget.followers.length,
    limit: 'UNLIMITED'
  });
});

// Add Friend (Strictly up to 1,000 Friends)
router.post('/users/:targetId/friend', authenticateToken, (req, res) => {
  const currentUserId = req.user.id;
  const { targetId } = req.params;
  if (currentUserId === targetId) return res.status(400).json({ error: 'Cannot add yourself as a friend.' });

  const currentUser = db.findUserById(currentUserId);
  const targetUser = db.findUserById(targetId);
  if (!currentUser || !targetUser) return res.status(404).json({ error: 'User not found.' });

  const alreadyFriends = currentUser.friends.includes(targetId);

  if (!alreadyFriends) {
    if (currentUser.friends.length >= MAX_FRIENDS) {
      return res.status(400).json({ error: `Friend limit reached (${MAX_FRIENDS} maximum friends allowed).` });
    }
    if (targetUser.friends.length >= MAX_FRIENDS) {
      return res.status(400).json({ error: `${targetUser.fullName} has reached the ${MAX_FRIENDS}-friend limit.` });
    }
  }

  const updatedMe = db.updateUser(currentUserId, u => {
    u.friends = alreadyFriends
      ? u.friends.filter(id => id !== targetId)
      : [...new Set([...u.friends, targetId])];
    return u;
  });

  db.updateUser(targetId, u => {
    u.friends = alreadyFriends
      ? u.friends.filter(id => id !== currentUserId)
      : [...new Set([...u.friends, currentUserId])];
    return u;
  });

  res.json({
    isFriend: !alreadyFriends,
    myFriendCount: updatedMe.friends.length,
    maxFriends: MAX_FRIENDS
  });
});

// Get Global Posts Feed
router.get('/posts', (req, res) => {
  res.json(db.getPosts());
});

// Create Post & Broadcast Globally + Via Satellite Mesh
router.post('/posts', authenticateToken, (req, res) => {
  const { content, visibility, language, mediaTag } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Post content cannot be empty.' });
  }

  const author = db.findUserById(req.user.id);
  const postId = uuidv4();
  const satPacket = satRelay.encapsulateOrbitalPacket('GLOBAL_POST', author.countryCode, postId);
  db.logSatellitePacket(satPacket);

  const newPost = {
    id: postId,
    authorId: author.id,
    authorName: author.fullName,
    authorUsername: author.username,
    authorAvatar: author.avatar,
    authorCountry: author.countryName,
    authorCountryCode: author.countryCode,
    content: content.trim(),
    visibility: visibility || 'GLOBAL_WORLDWIDE',
    language: language || author.language,
    mediaTag: mediaTag || null,
    satelliteRelay: satPacket,
    likes: [],
    createdAt: new Date().toISOString()
  };

  db.addPost(newPost);

  // Real-time instant global broadcast via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.emit('global:new_post', newPost);
    io.emit('satellite:packet_relayed', satPacket);
  }

  res.status(201).json(newPost);
});

// Like / React to Post
router.post('/posts/:postId/like', authenticateToken, (req, res) => {
  const updated = db.likePost(req.params.postId, req.user.id);
  if (!updated) return res.status(404).json({ error: 'Post not found.' });
  const io = req.app.get('io');
  if (io) io.emit('global:post_updated', updated);
  res.json(updated);
});

// Get Private Chat History with Friend
router.get('/messages/:friendId', authenticateToken, (req, res) => {
  const messages = db.getConversation(req.user.id, req.params.friendId);
  res.json(messages);
});

// Satellite Telemetry Feed
router.get('/satellite/status', (req, res) => {
  res.json(satRelay.getTelemetryStatus());
});

module.exports = router;
