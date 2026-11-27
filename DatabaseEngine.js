/**
 * OUR FACE - Unlimited Global Distributed Storage & Satellite Sync Engine
 * Developer: Nesru Michael (3rd Year EDPM Program)
 * Contact: nesrumichael@gmail.com | +251923502787
 * Portfolio: https://nesrumichaelet.pages.dev
 */
const fs = require('fs');
const path = require('path');

class UnlimitedGlobalStorage {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.dbFile = path.join(this.dataDir, 'ourface_global_cluster.json');
    this.state = this._loadState();
  }

  _loadState() {
    if (fs.existsSync(this.dbFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.dbFile, 'utf-8'));
      } catch (e) {
        console.error('Cluster recovery initialized:', e);
      }
    }
    const initialState = {
      metadata: {
        platform: 'Our Face',
        architecture: 'Global Distributed Mesh + Orbital DTN (Delay-Tolerant Networking)',
        storageCapacity: 'UNLIMITED_ELASTIC_SHARDS',
        developer: {
          name: 'Nesru Michael',
          program: '3rd Year EDPM Program',
          email: 'nesrumichael@gmail.com',
          phone: '+251923502787',
          portfolio: 'https://nesrumichaelet.pages.dev'
        }
      },
      users: [],
      posts: [],
      messages: [],
      satellitePackets: []
    };
    this._saveState(initialState);
    return initialState;
  }

  _saveState(state = this.state) {
    fs.writeFileSync(this.dbFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  getUsers() { return this.state.users; }
  
  findUserByEmailOrUsername(identifier) {
    return this.state.users.find(
      u => u.email.toLowerCase() === identifier.toLowerCase() || 
           u.username.toLowerCase() === identifier.toLowerCase()
    );
  }

  findUserById(id) {
    return this.state.users.find(u => u.id === id);
  }

  createUser(userObj) {
    this.state.users.push(userObj);
    this._saveState();
    return userObj;
  }

  updateUser(id, updaterFn) {
    const idx = this.state.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    this.state.users[idx] = updaterFn(this.state.users[idx]);
    this._saveState();
    return this.state.users[idx];
  }

  getPosts() {
    return [...this.state.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  addPost(post) {
    this.state.posts.unshift(post);
    this._saveState();
    return post;
  }

  likePost(postId, userId) {
    const post = this.state.posts.find(p => p.id === postId);
    if (!post) return null;
    if (!post.likes.includes(userId)) {
      post.likes.push(userId);
    } else {
      post.likes = post.likes.filter(id => id !== userId);
    }
    this._saveState();
    return post;
  }

  addMessage(msg) {
    this.state.messages.push(msg);
    this._saveState();
    return msg;
  }

  getConversation(userA, userB) {
    return this.state.messages.filter(
      m => (m.senderId === userA && m.receiverId === userB) ||
           (m.senderId === userB && m.receiverId === userA)
    );
  }

  logSatellitePacket(packet) {
    this.state.satellitePackets.unshift(packet);
    if (this.state.satellitePackets.length > 500) {
      this.state.satellitePackets.pop();
    }
    this._saveState();
    return packet;
  }
}

module.exports = new UnlimitedGlobalStorage();
