/**
 * OUR FACE - Frontend Real-Time Application Logic
 * Developer: Nesru Michael (3rd Year EDPM Student)
 * Email: nesrumichael@gmail.com | Phone: +251923502787
 * Website: https://nesrumichaelet.pages.dev
 */
let socket = null;
let currentUser = null;
let authToken = localStorage.getItem('ourface_token') || null;
let activeChatPeer = null;
let onlineUserIds = [];

document.addEventListener('DOMContentLoaded', () => {
  populateWorldSelectors();
  registerServiceWorker();

  const savedUser = localStorage.getItem('ourface_user');
  if (authToken && savedUser) {
    currentUser = JSON.parse(savedUser);
    enterWorkspace();
  }
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function populateWorldSelectors() {
  const langSelects = [document.getElementById('globalLangSelect'), document.getElementById('regLanguage')];
  langSelects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = window.OUR_FACE_LANGUAGES.map(
      l => `<option value="${l.code}">${l.native} (${l.name})</option>`
    ).join('');
  });

  const countrySel = document.getElementById('regCountry');
  if (countrySel) {
    countrySel.innerHTML = window.OUR_FACE_COUNTRIES.map(
      c => `<option value="${c.code}" data-dial="${c.dial}" data-name="${c.name}">${c.flag} ${c.name} (${c.dial})</option>`
    ).join('');
  }

  document.getElementById('globalLangSelect').addEventListener('change', (e) => {
    applyLanguage(e.target.value);
  });
}

function applyLanguage(langCode) {
  const dict = window.OUR_FACE_UI_STRINGS[langCode] || window.OUR_FACE_UI_STRINGS.en;
  const langObj = window.OUR_FACE_LANGUAGES.find(l => l.code === langCode);
  document.documentElement.dir = langObj ? langObj.dir : 'ltr';

  if (document.getElementById('heroTitle')) document.getElementById('heroTitle').textContent = dict.heroTitle;
  if (document.getElementById('heroSub')) document.getElementById('heroSub').textContent = dict.heroSub;
  if (document.getElementById('postContentInput')) document.getElementById('postContentInput').placeholder = dict.postPlaceholder;
  if (document.getElementById('publishBtn')) document.getElementById('publishBtn').textContent = dict.publishBtn;
  if (document.getElementById('friendsLimitLabel')) document.getElementById('friendsLimitLabel').textContent = dict.friendsLimitLabel;
  if (document.getElementById('followersLabel')) document.getElementById('followersLabel').textContent = dict.followersLabel;
  if (document.getElementById('chatTitle')) document.getElementById('chatTitle').textContent = '💬 ' + dict.chatTitle;
  if (document.getElementById('satelliteStatus')) document.getElementById('satelliteStatus').textContent = '🛰️ ' + dict.satelliteStatus;
}

function switchAuthTab(mode) {
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('tabSignin').classList.toggle('active', mode === 'signin');
  document.getElementById('signupForm').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('signinForm').classList.toggle('hidden', mode !== 'signin');
}

async function handleSignup(e) {
  e.preventDefault();
  const countryOpt = document.getElementById('regCountry').selectedOptions[0];
  const payload = {
    fullName: document.getElementById('regFullName').value,
    username: document.getElementById('regUsername').value,
    email: document.getElementById('regEmail').value,
    countryCode: countryOpt.value,
    countryName: countryOpt.dataset.name,
    phoneCode: countryOpt.dataset.dial,
    language: document.getElementById('regLanguage').value,
    password: document.getElementById('regPassword').value
  };

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('ourface_token', authToken);
    localStorage.setItem('ourface_user', JSON.stringify(currentUser));
    enterWorkspace();
  } catch (err) {
    document.getElementById('authFeedback').textContent = '⚠️ ' + err.message;
  }
}

async function handleSignin(e) {
  e.preventDefault();
  const payload = {
    identifier: document.getElementById('loginIdentifier').value,
    password: document.getElementById('loginPassword').value
  };

  try {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign in failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('ourface_token', authToken);
    localStorage.setItem('ourface_user', JSON.stringify(currentUser));
    enterWorkspace();
  } catch (err) {
    document.getElementById('authFeedback').textContent = '⚠️ ' + err.message;
  }
}

function logoutUser() {
  localStorage.removeItem('ourface_token');
  localStorage.removeItem('ourface_user');
  location.reload();
}

function enterWorkspace() {
  document.getElementById('landingSection').classList.add('hidden');
  document.getElementById('governanceSection').classList.remove('active');
  document.getElementById('workspaceSection').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');

  renderMyProfile();
  initRealtimeSocket();
  loadGlobalFeed();
  loadGlobalUsers();
  loadSatelliteTelemetry();
}

function renderMyProfile() {
  document.getElementById('myAvatar').src = currentUser.avatar;
  document.getElementById('myFullName').textContent = currentUser.fullName;
  document.getElementById('myHandle').textContent = '@' + currentUser.username;
  document.getElementById('myCountryBadge').textContent = `🌍 ${currentUser.countryName} (${currentUser.phoneCode})`;
  document.getElementById('myBio').textContent = currentUser.bio;
  document.getElementById('myFriendsCount').textContent = `${(currentUser.friends || []).length} / 1000`;
  document.getElementById('myFollowersCount').textContent = `${(currentUser.followers || []).length} ∞`;
}

function initRealtimeSocket() {
  if (typeof io === 'undefined') return;
  socket = io();
  socket.emit('user:online', currentUser.id);

  socket.on('presence:update', (ids) => {
    onlineUserIds = ids;
    loadGlobalUsers();
  });

  socket.on('global:new_post', (post) => {
    prependPostToFeed(post);
  });

  socket.on('global:post_updated', () => {
    loadGlobalFeed();
  });

  socket.on('chat:receive_message', (msg) => {
    if (
      activeChatPeer &&
      ((msg.senderId === activeChatPeer.id && msg.receiverId === currentUser.id) ||
       (msg.senderId === currentUser.id && msg.receiverId === activeChatPeer.id))
    ) {
      appendChatMessage(msg);
    }
  });
}

async function publishGlobalPost() {
  const input = document.getElementById('postContentInput');
  const content = input.value.trim();
  if (!content) return;

  const visibility = document.getElementById('postVisibility').value;
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({ content, visibility, language: currentUser.language })
  });

  if (res.ok) {
    input.value = '';
    if (!socket) loadGlobalFeed();
  }
}

async function loadGlobalFeed() {
  const res = await fetch('/api/posts');
  const posts = await res.json();
  const container = document.getElementById('globalFeedContainer');
  container.innerHTML = '';
  posts.forEach(p => container.appendChild(createPostElement(p)));
}

function prependPostToFeed(post) {
  const container = document.getElementById('globalFeedContainer');
  if (document.getElementById('post-' + post.id)) return;
  container.prepend(createPostElement(post));
}

function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = 'post-' + post.id;
  const satName = post.satelliteRelay ? post.satelliteRelay.satelliteNode : 'OurFace-Orbital-Alpha';
  div.innerHTML = `
    <div class="post-meta">
      <div class="post-author">
        <img class="avatar-sm" src="${post.authorAvatar}" alt="${post.authorName}" />
        <div>
          <strong>${escapeHtml(post.authorName)}</strong>
          <div style="font-size:0.76rem;color:var(--text-muted);">
            @${escapeHtml(post.authorUsername)} • 🌍 ${escapeHtml(post.authorCountry || 'Global')} • ${new Date(post.createdAt).toLocaleTimeString()}
          </div>
        </div>
      </div>
      <span class="sat-tag">🛰️ ${satName}</span>
    </div>
    <div class="post-body">${escapeHtml(post.content)}</div>
    <div class="post-actions">
      <button class="action-chip" onclick="toggleLike('${post.id}')">❤️ ${(post.likes || []).length} Appreciate</button>
      <span class="action-chip">🌐 ${post.visibility}</span>
    </div>
  `;
  return div;
}

async function toggleLike(postId) {
  await fetch(`/api/posts/${postId}/like`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
}

async function loadGlobalUsers() {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  if (!res.ok) return;
  const users = await res.json();
  const listEl = document.getElementById('globalUsersList');
  listEl.innerHTML = '';

  users.filter(u => u.id !== currentUser.id).forEach(u => {
    const isOnline = onlineUserIds.includes(u.id);
    const isFollowing = (currentUser.following || []).includes(u.id);
    const isFriend = (currentUser.friends || []).includes(u.id);

    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `
      <div class="user-row-info">
        <img src="${u.avatar}" style="width:34px;height:34px;border-radius:50%;" />
        <div>
          <strong style="font-size:0.84rem;">${isOnline ? '🟢' : '⚪'} ${escapeHtml(u.fullName)}</strong>
          <div style="font-size:0.72rem;color:var(--text-muted);">@${escapeHtml(u.username)} • ${u.followerCount} ∞</div>
        </div>
      </div>
      <div class="mini-btns">
        <button class="btn-xs" onclick="followUser('${u.id}')">${isFollowing ? 'Following' : '+ Follow'}</button>
        <button class="btn-xs friend" onclick="addFriendUser('${u.id}')">${isFriend ? 'Friend ✓' : '+ Friend'}</button>
        <button class="btn-xs" onclick='openPrivateChat(${JSON.stringify({id: u.id, fullName: u.fullName})})'>💬</button>
      </div>
    `;
    listEl.appendChild(row);
  });
}

async function followUser(targetId) {
  const res = await fetch(`/api/users/${targetId}/follow`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  if (res.ok) {
    const data = await res.json();
    if (data.following) {
      currentUser.following = [...new Set([...(currentUser.following || []), targetId])];
    } else {
      currentUser.following = (currentUser.following || []).filter(id => id !== targetId);
    }
    localStorage.setItem('ourface_user', JSON.stringify(currentUser));
    loadGlobalUsers();
  }
}

async function addFriendUser(targetId) {
  const res = await fetch(`/api/users/${targetId}/friend`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error);
    return;
  }
  if (data.isFriend) {
    currentUser.friends = [...new Set([...(currentUser.friends || []), targetId])];
  } else {
    currentUser.friends = (currentUser.friends || []).filter(id => id !== targetId);
  }
  localStorage.setItem('ourface_user', JSON.stringify(currentUser));
  renderMyProfile();
  loadGlobalUsers();
}

async function openPrivateChat(peer) {
  activeChatPeer = peer;
  document.getElementById('chatWithLabel').textContent = `Connected in real time with ${peer.fullName}`;
  const res = await fetch(`/api/messages/${peer.id}`, {
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  const msgs = await res.json();
  const box = document.getElementById('chatMessagesBox');
  box.innerHTML = '';
  msgs.forEach(appendChatMessage);
}

function appendChatMessage(msg) {
  const box = document.getElementById('chatMessagesBox');
  const div = document.createElement('div');
  const isMine = msg.senderId === currentUser.id;
  div.className = 'msg-bubble ' + (isMine ? 'msg-mine' : 'msg-theirs');
  div.innerHTML = `
    <div>${escapeHtml(msg.text)}</div>
    <div style="font-size:0.65rem;opacity:0.75;margin-top:2px;">🛰️ ${msg.satelliteRelay || 'LEO-Mesh'} • ${new Date(msg.timestamp).toLocaleTimeString()}</div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function sendPrivateChat(e) {
  e.preventDefault();
  if (!activeChatPeer) {
    alert('Please click 💬 next to a friend or member to start chatting.');
    return;
  }
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (socket) {
    socket.emit('chat:private_message', {
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      receiverId: activeChatPeer.id,
      text
    });
  }
  input.value = '';
}

async function loadSatelliteTelemetry() {
  const res = await fetch('/api/satellite/status');
  const data = await res.json();
  const list = document.getElementById('satelliteList');
  list.innerHTML = data.satellites.map(s => `
    <div style="padding:0.4rem 0;border-bottom:1px solid rgba(148,163,184,0.1);">
      <strong style="color:#e2e8f0;">${s.name}</strong> (${s.altitudeKm} km)<br/>
      <span>${s.region} • Signal: ${s.signalStrength}</span>
    </div>
  `).join('');
}

function openGovernance(sectionKey) {
  document.getElementById('landingSection').classList.add('hidden');
  document.getElementById('workspaceSection').classList.add('hidden');
  document.getElementById('governanceSection').classList.add('active');
  const el = document.getElementById('gov-' + sectionKey);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function showMainView() {
  document.getElementById('governanceSection').classList.remove('active');
  if (currentUser && authToken) {
    document.getElementById('workspaceSection').classList.remove('hidden');
  } else {
    document.getElementById('landingSection').classList.remove('hidden');
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
