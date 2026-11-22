// ==========================================================
// NESRU MICHAEL WEB APP v2 - SOCIAL FEED, FRIENDS & LIVE CHAT
// ==========================================================

const STORAGE_KEYS = {
  SB_URL: 'nesru_sb_url',
  SB_KEY: 'nesru_sb_key',
  USER: 'nesru_current_user',
  POSTS: 'nesru_local_posts',
  LIKES: 'nesru_local_likes',
  COMMENTS: 'nesru_local_comments',
  RELS: 'nesru_local_rels',
  MESSAGES: 'nesru_local_messages',
  PROFILES: 'nesru_local_profiles'
};

let supabaseClient = null;
let authMode = 'login';
let currentUser = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
let feedFilter = 'all';
let activeChatTarget = '';
let onlineUsersMap = {};
let heartbeatTimer = null;

let state = {
  profiles: [],
  posts: [],
  likes: [],
  comments: [],
  relationships: [],
  messages: []
};

window.addEventListener('DOMContentLoaded', async () => {
  registerSW();
  loadSupabaseConfigInputs();
  initSupabase();
  updateUserUI();

  if (currentUser) {
    navigateTo('view-feed');
  }

  await refreshAllData();
  startPresenceHeartbeat();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-target="${viewId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (viewId === 'view-chat') {
    scrollChatToBottom();
  }
}

function loadSupabaseConfigInputs() {
  document.getElementById('sb-url').value = localStorage.getItem(STORAGE_KEYS.SB_URL) || '';
  document.getElementById('sb-key').value = localStorage.getItem(STORAGE_KEYS.SB_KEY) || '';
}

function saveSupabaseConfig() {
  const url = document.getElementById('sb-url').value.trim();
  const key = document.getElementById('sb-key').value.trim();

  if (!url.startsWith('https://') || key.length < 20) {
    showToast('Maaloo URL (https://...) fi Anon Key sirrii galchaa!');
    return;
  }

  localStorage.setItem(STORAGE_KEYS.SB_URL, url);
  localStorage.setItem(STORAGE_KEYS.SB_KEY, key);
  initSupabase();
  showToast("Qindaa'inni Supabase ol-kaa'ameera!");
  refreshAllData();
}

function initSupabase() {
  const url = localStorage.getItem(STORAGE_KEYS.SB_URL);
  const key = localStorage.getItem(STORAGE_KEYS.SB_KEY);
  const badge = document.getElementById('cloud-badge');

  if (url && key && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      badge.textContent = 'Supabase Cloud';
      badge.className = 'badge badge-cloud';
      setupRealtimeSubscriptions();
    } catch (e) {
      supabaseClient = null;
      badge.textContent = 'Local Mode';
      badge.className = 'badge badge-local';
    }
  } else {
    supabaseClient = null;
    badge.textContent = 'Local Mode';
    badge.className = 'badge badge-local';
  }
}

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('btn-show-login').classList.toggle('active', mode === 'login');
  document.getElementById('btn-show-register').classList.toggle('active', mode === 'register');
  document.getElementById('field-name').classList.toggle('hidden', mode === 'login');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Seeni' : 'Akkaawuntii Uumi';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const password = document.getElementById('auth-password').value;

  if (authMode === 'register' && !name) {
    showToast('Maaloo maqaa guutuu galchaa.');
    return;
  }

  if (supabaseClient) {
    if (authMode === 'register') {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });
      if (error) {
        showToast('Dogoggora Galmee: ' + error.message);
        return;
      }
      const userObj = { name: name || email.split('@')[0], email };
      await upsertProfile(userObj);
      setLoggedInUser(userObj);
      showToast("Galmeen keessan milkaa'eera!");
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        showToast('Dogoggora Seensaa: ' + error.message);
        return;
      }
      const fullName = data.user?.user_metadata?.full_name || email.split('@')[0];
      const userObj = { name: fullName, email };
      await upsertProfile(userObj);
      setLoggedInUser(userObj);
      showToast('Baga nagaan deebitan, ' + fullName + '!');
    }
  } else {
    const userObj = { name: name || email.split('@')[0], email };
    await upsertProfile(userObj);
    setLoggedInUser(userObj);
    showToast("Seensa Local milkaa'eera!");
  }

  await refreshAllData();
  navigateTo('view-feed');
}

function setLoggedInUser(userObj) {
  currentUser = userObj;
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userObj));
  updateUserUI();
  setupRealtimeSubscriptions();
}

function handleLogout() {
  if (supabaseClient) {
    supabaseClient.auth.signOut().catch(() => {});
  }
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.USER);
  updateUserUI();
  showToast('Akkaawuntii keessaa baataniittu.');
  navigateTo('view-auth');
}

function updateUserUI() {
  const name = currentUser ? currentUser.name : 'Nesru Michael';
  const email = currentUser ? currentUser.email : 'nesrumichael@gmail.com';
  const initials = getInitials(name);

  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = email;
  document.getElementById('feed-user-tag').textContent = currentUser ? currentUser.name : 'Seenaa (Guest)';
}

function getInitials(name) {
  return (name || 'NM')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

async function upsertProfile(userObj) {
  const payload = {
    email: userObj.email,
    full_name: userObj.name,
    last_seen: new Date().toISOString()
  };

  if (supabaseClient) {
    await supabaseClient.from('profiles').upsert(payload, { onConflict: 'email' });
  } else {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    const idx = list.findIndex((p) => p.email === userObj.email);
    if (idx >= 0) list[idx] = { ...list[idx], ...payload };
    else list.push(payload);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
  }
}

function startPresenceHeartbeat() {
  clearInterval(heartbeatTimer);
  const ping = async () => {
    if (!currentUser) return;
    await upsertProfile(currentUser);
  };
  ping();
  heartbeatTimer = setInterval(ping, 25000);
}

function isUserOnline(email) {
  if (!email) return false;
  if (currentUser && email === currentUser.email) return true;
  if (onlineUsersMap[email]) return true;

  const prof = state.profiles.find((p) => p.email === email);
  if (prof && prof.last_seen) {
    const diffSec = (Date.now() - new Date(prof.last_seen).getTime()) / 1000;
    return diffSec < 75;
  }
  return false;
}

function setupRealtimeSubscriptions() {
  if (!supabaseClient) return;

  if (window._nesruChannel) {
    supabaseClient.removeChannel(window._nesruChannel);
  }

  const channel = supabaseClient.channel('nesru-social-live', {
    config: {
      presence: {
        key: currentUser ? currentUser.email : 'guest-' + Math.random().toString(36).slice(2, 7)
      }
    }
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      onlineUsersMap = {};
      Object.keys(presenceState).forEach((key) => {
        if (key.includes('@')) {
          onlineUsersMap[key] = presenceState[key][0];
        }
      });
      renderAllViews();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadPosts())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => loadLikes())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => loadComments())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, () => loadRelationships())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadProfiles())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadMessages())
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && currentUser) {
        await channel.track({
          email: currentUser.email,
          name: currentUser.name,
          online_at: new Date().toISOString()
        });
      }
    });

  window._nesruChannel = channel;
}

async function refreshAllData() {
  await Promise.all([
    loadProfiles(),
    loadPosts(),
    loadLikes(),
    loadComments(),
    loadRelationships(),
    loadMessages()
  ]);
  renderAllViews();
}

async function loadProfiles() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('profiles').select('*').order('last_seen', { ascending: false });
    if (data) state.profiles = data;
  } else {
    state.profiles = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    if (state.profiles.length === 0) {
      state.profiles = [
        { email: 'nesrumichael@gmail.com', full_name: 'Nesru Michael', last_seen: new Date().toISOString() }
      ];
    }
  }
  updateChatTargetOptions();
  renderPeople(<strong style="cursor:pointer;" onclick="openPublicProfile('${escapeHtml(post.author_email)}')">${escapeHtml(post.author)}</strong>);
  updateProfileStats();
}

async function loadPosts() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    if (data) state.posts = data;
  } else {
    state.posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
  }
  renderFeed();
  updateProfileStats();
}

async function loadLikes() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('post_likes').select('*');
    if (data) state.likes = data;
  } else {
    state.likes = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKES) || '[]');
  }
  renderFeed();
}

async function loadComments() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('post_comments').select('*').order('created_at', { ascending: true });
    if (data) state.comments = data;
  } else {
    state.comments = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMMENTS) || '[]');
  }
  renderFeed(<strong style="cursor:pointer;" onclick="openPublicProfile('${escapeHtml(post.author_email)}')">${escapeHtml(post.author)}</strong>);
}

async function loadRelationships() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('relationships').select('*');
    if (data) state.relationships = data;
  } else {
    state.relationships = JSON.parse(localStorage.getItem(STORAGE_KEYS.RELS) || '[]');
  }
  renderPeople();
  renderFeed();
  updateProfileStats();
}

async function loadMessages() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true }).limit(150);
    if (data) state.messages = data;
  } else {
    state.messages = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
  }
  renderChat();
}

function renderAllViews() {
  renderFeed();
  renderPeople();
  renderChat();
  updateProfileStats();
}

function setFeedFilter(mode) {
  feedFilter = mode;
  document.getElementById('filter-all').classList.toggle('active', mode === 'all');
  document.getElementById('filter-following').classList.toggle('active', mode === 'following');
  renderFeed();
}

async function handleCreatePost(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('Barreeffama maxxansuuf dura Seenaa (Login)!');
    navigateTo('view-auth');
    return;
  }

  const title = document.getElementById('post-title').value.trim();
  const body = document.getElementById('post-body').value.trim();
  const image_url = document.getElementById('post-image').value.trim() || null;

  if (!title || !body) return;

  const newPost = {
    title,
    body,
    author: currentUser.name,
    author_email: currentUser.email,
    image_url,
    shares_count: 0
  };

  if (supabaseClient) {
    const { error } = await supabaseClient.from('posts').insert(newPost);
    if (error) {
      showToast('Dogoggora: ' + error.message);
      return;
    }
    await loadPosts();
  } else {
    newPost.id = String(Date.now());
    newPost.created_at = new Date().toISOString();
    state.posts.unshift(newPost);
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(state.posts));
    renderFeed();
  }

  document.getElementById('post-form').reset();
  showToast('Barreeffamni keessan maxxanfameera!');
}

async function toggleLike(postId) {
  if (!currentUser) {
    showToast('Like gochuuf dura Seenaa!');
    navigateTo('view-auth');
    return;
  }

  const existing = state.likes.find(
    (l) => String(l.post_id) === String(postId) && l.user_email === currentUser.email
  );

  if (supabaseClient) {
    let res;
    if (existing) {
      res = await supabaseClient.from('post_likes').delete().eq('id', existing.id);
    } else {
      res = await supabaseClient.from('post_likes').insert({ post_id: postId, user_email: currentUser.email });
    }
    if (res.error) {
      showToast('Dogoggora Like: ' + res.error.message);
      return;
    }
    await loadLikes();
  } else {
    if (existing) {
      state.likes = state.likes.filter((l) => l !== existing);
    } else {
      state.likes.push({ id: String(Date.now()), post_id: postId, user_email: currentUser.email });
    }
    localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(state.likes));
    renderFeed();
  }
}

async function handleAddComment(e, postId) {
  e.preventDefault();
  if (!currentUser) {
    showToast('Comment barreessuuf dura Seenaa!');
    navigateTo('view-auth');
    return;
  }

  const input = document.getElementById(`comment-input-${postId}`);
  const text = input.value.trim();
  if (!text) return;

  const newComment = {
    post_id: postId,
    author_name: currentUser.name,
    author_email: currentUser.email,
    comment_text: text
  };

  if (supabaseClient) {
    const { error } = await supabaseClient.from('post_comments').insert(newComment);
    if (error) {
      showToast('Dogoggora Comment: ' + error.message);
      return;
    }
    await loadComments();
  } else {
    newComment.id = String(Date.now());
    state.comments.push(newComment);
    localStorage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(state.comments));
    renderFeed();
  }

  input.value = '';
  showToast('Comment dabalameera!');
}

async function handleSharePost(postId) {
  const post = state.posts.find((p) => String(p.id) === String(postId));
  if (!post) return;

  const nextShares = (post.shares_count || 0) + 1;
  if (supabaseClient) {
    const { error } = await supabaseClient.from('posts').update({ shares_count: nextShares }).eq('id', postId);
    if (error) {
      showToast('Dogoggora Share: ' + error.message);
      return;
    }
    await loadPosts();
  } else {
    post.shares_count = nextShares;
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(state.posts));
    renderFeed();
  }

  const shareText = `${post.title}\n${post.body}\n— ${post.author} (Nesru Michael App)`;
  if (navigator.share) {
    navigator.share({ title: post.title, text: shareText, url: window.location.href }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText);
    showToast("Barreeffamni copy ta'eera — bakka barbaaddanitti Share godhaa!");
  } else {
    showToast('Share dabalameera!');
  }
}

function toggleCommentsPanel(postId) {
  const box = document.getElementById(`comments-box-${postId}`);
  if (box) box.classList.toggle('hidden');
}

function renderFeed() {
  const container = document.getElementById('posts-list');
  if (!container) return;

  let postsToShow = [...state.posts];

  if (feedFilter === 'following' && currentUser) {
    const followingEmails = state.relationships
      .filter((r) => r.sender_email === currentUser.email && r.rel_type === 'follow')
      .map((r) => r.receiver_email);
    postsToShow = postsToShow.filter(
      (p) => followingEmails.includes(p.author_email) || p.author_email === currentUser.email
    );
  }

  if (postsToShow.length === 0) {
    container.innerHTML = `<div class="card"><p class="muted">Barreeffamni asitti hin jiru. Jalqaba irratti barreeffama haaraa maxxansaa!</p></div>`;
    return;
  }

  container.innerHTML = postsToShow
    .map((post) => {
      const postLikes = state.likes.filter((l) => String(l.post_id) === String(post.id));
      const isLiked = currentUser && postLikes.some((l) => l.user_email === currentUser.email);
      const postComments = state.comments.filter((c) => String(c.post_id) === String(post.id));
      const online = isUserOnline(post.author_email);
      const isMe = currentUser && post.author_email === currentUser.email;
      const isFollowing =
        currentUser &&
        state.relationships.some(
          (r) =>
            r.sender_email === currentUser.email &&
            r.receiver_email === post.author_email &&
            r.rel_type === 'follow'
        );

      return `
        <article class="post-card">
          <div class="post-header">
            <div class="post-author-info">
              <div class="avatar-sm">
                ${escapeHtml(getInitials(post.author))}
                <span class="presence-pin ${online ? 'dot-online' : 'dot-offline'}"></span>
              </div>
              <div>
                <strong>${escapeHtml(post.author)}</strong>
                <div class="status-sub">
                  ${online ? '<span style="color:#16a34a;font-weight:700;">● Online</span>' : 'Offline'}
                  • ${formatTime(post.created_at)}
                </div>
              </div>
            </div>
            ${
              !isMe && post.author_email
                ? `<div style="display:flex;gap:5px;">
                    <button class="btn btn-sm ${isFollowing ? 'btn-success' : 'btn-outline'}"
                      onclick="toggleFollow('${escapeHtml(post.author_email)}')">
                      ${isFollowing ? '✓ Following' : '+ Follow'}
                    </button>
                    <button class="btn btn-sm btn-outline"
                      onclick="openDirectChat('${escapeHtml(post.author_email)}')">💬</button>
                   </div>`
                : ''
            }
          </div>

          <h4 class="post-title">${escapeHtml(post.title)}</h4>
          <p class="post-body">${escapeHtml(post.body)}</p>
          ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="Post image" class="post-img" loading="lazy" />` : ''}

          <div class="post-actions">
            <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${escapeHtml(post.id)}')">
              👍 Like (${postLikes.length})
            </button>
            <button class="action-btn" onclick="toggleCommentsPanel('${escapeHtml(post.id)}')">
              💬 Comment (${postComments.length})
            </button>
            <button class="action-btn" onclick="handleSharePost('${escapeHtml(post.id)}')">
              🔗 Share (${post.shares_count || 0})
            </button>
          </div>

          <div id="comments-box-${escapeHtml(post.id)}" class="comments-box">
            ${postComments
              .map(
                (c) => `
                <div class="comment-item">
                  <strong>${escapeHtml(c.author_name)}:</strong> ${escapeHtml(c.comment_text)}
                </div>`
              )
              .join('')}
            <form class="comment-form" onsubmit="handleAddComment(event, '${escapeHtml(post.id)}')">
              <input type="text" id="comment-input-${escapeHtml(post.id)}" placeholder="Yaada (comment) barreessi..." required />
              <button type="submit" class="btn btn-primary btn-sm">Ergi</button>
            </form>
          </div>
        </article>
      `;
    })
    .join('');
}

async function toggleFollow(targetEmail) {
  if (!currentUser) {
    showToast('Follow gochuuf dura Seenaa!');
    navigateTo('view-auth');
    return;
  }

  const existing = state.relationships.find(
    (r) =>
      r.sender_email === currentUser.email &&
      r.receiver_email === targetEmail &&
      r.rel_type === 'follow'
  );

  if (supabaseClient) {
    if (existing) {
      await supabaseClient.from('relationships').delete().eq('id', existing.id);
    } else {
      await supabaseClient.from('relationships').insert({
        sender_email: currentUser.email,
        receiver_email: targetEmail,
        rel_type: 'follow',
        status: 'accepted'
      });
    }
    await loadRelationships();
  } else {
    if (existing) {
      state.relationships = state.relationships.filter((r) => r !== existing);
    } else {
      state.relationships.push({
        id: String(Date.now()),
        sender_email: currentUser.email,
        receiver_email: targetEmail,
        rel_type: 'follow',
        status: 'accepted'
      });
    }
    localStorage.setItem(STORAGE_KEYS.RELS, JSON.stringify(state.relationships));
    renderPeople();
    renderFeed();
  }
  showToast(existing ? 'Unfollow gootaniittu.' : 'Amma hordofaa (Following) jirtu!');
}

async function sendFriendRequest(targetEmail) {
  if (!currentUser) {
    showToast('Add Friend gochuuf dura Seenaa!');
    navigateTo('view-auth');
    return;
  }

  const existing = state.relationships.find(
    (r) =>
      r.rel_type === 'friend' &&
      ((r.sender_email === currentUser.email && r.receiver_email === targetEmail) ||
        (r.sender_email === targetEmail && r.receiver_email === currentUser.email))
  );

  if (existing) {
    showToast('Gaaffiin hiriyummaa duraan ergameera ykn hiriyoota taataniittu.');
    return;
  }

  if (supabaseClient) {
    await supabaseClient.from('relationships').insert({
      sender_email: currentUser.email,
      receiver_email: targetEmail,
      rel_type: 'friend',
      status: 'pending'
    });
    await loadRelationships();
  } else {
    state.relationships.push({
      id: String(Date.now()),
      sender_email: currentUser.email,
      receiver_email: targetEmail,
      rel_type: 'friend',
      status: 'pending'
    });
    localStorage.setItem(STORAGE_KEYS.RELS, JSON.stringify(state.relationships));
    renderPeople();
  }
  showToast('Gaaffiin hiriyummaa (Friend Request) ergameera!');
}

async function acceptFriendRequest(relId) {
  if (supabaseClient) {
    await supabaseClient.from('relationships').update({ status: 'accepted' }).eq('id', relId);
    await loadRelationships();
  } else {
    const rel = state.relationships.find((r) => String(r.id) === String(relId));
    if (rel) rel.status = 'accepted';
    localStorage.setItem(STORAGE_KEYS.RELS, JSON.stringify(state.relationships));
    renderPeople();
  }
  showToast("Hiriyummaan mirkanaa'eera!");
}

function renderPeople() {
  const container = document.getElementById('people-list');
  const reqBox = document.getElementById('friend-requests-box');
  const reqList = document.getElementById('friend-requests-list');
  if (!container) return;

  const query = (document.getElementById('people-search')?.value || '').toLowerCase();

  if (currentUser) {
    const incoming = state.relationships.filter(
      (r) => r.receiver_email === currentUser.email && r.rel_type === 'friend' && r.status === 'pending'
    );
    if (incoming.length > 0) {
      reqBox.classList.remove('hidden');
      reqList.innerHTML = incoming
        .map((r) => {
          const sender = state.profiles.find((p) => p.email === r.sender_email);
          const sName = sender ? sender.full_name : r.sender_email;
          return `
            <div class="person-card">
              <div>
                <strong>${escapeHtml(sName)}</strong>
                <div class="muted">${escapeHtml(r.sender_email)}</div>
              </div>
              <button class="btn btn-success btn-sm" onclick="acceptFriendRequest('${escapeHtml(r.id)}')">✓ Accept Friend</button>
            </div>
          `;
        })
        .join('');
    } else {
      reqBox.classList.add('hidden');
    }
  } else {
    reqBox.classList.add('hidden');
  }

  const map = new Map();
  state.profiles.forEach((p) => map.set(p.email, { email: p.email, full_name: p.full_name }));
  state.posts.forEach((p) => {
    if (p.author_email && !map.has(p.author_email)) {
      map.set(p.author_email, { email: p.author_email, full_name: p.author });
    }
  });

  const people = Array.from(map.values()).filter((p) => {
    if (currentUser && p.email === currentUser.email) return false;
    return p.full_name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query);
  });

  if (people.length === 0) {
    container.innerHTML = `<div class="card"><p class="muted">Fayyadamtoonni biroo ammaaf hin argamne.</p></div>`;
    return;
  }

  container.innerHTML = people
    .map((p) => {
      const online = isUserOnline(p.email);
      const isFollowing =
        currentUser &&
        state.relationships.some(
          (r) => r.sender_email === currentUser.email && r.receiver_email === p.email && r.rel_type === 'follow'
        );
      const friendRel =
        currentUser &&
        state.relationships.find(
          (r) =>
            r.rel_type === 'friend' &&
            ((r.sender_email === currentUser.email && r.receiver_email === p.email) ||
              (r.sender_email === p.email && r.receiver_email === currentUser.email))
        );

      let friendBtn = `<button class="btn btn-sm btn-primary" onclick="sendFriendRequest('${escapeHtml(p.email)}')">+ Add Friend</button>`;
      if (friendRel) {
        if (friendRel.status === 'accepted') {
          friendBtn = `<button class="btn btn-sm btn-success" disabled>🤝 Friends</button>`;
        } else {
          friendBtn = `<button class="btn btn-sm btn-outline" disabled>⏳ Pending</button>`;
        }
      }

      return `
        <div class="person-card">
          <div class="post-author-info">
            <div class="avatar-sm">
              ${escapeHtml(getInitials(p.full_name))}
              <span class="presence-pin ${online ? 'dot-online' : 'dot-offline'}"></span>
            </div>
            <div>
              <strong>${escapeHtml(p.full_name)}</strong>
              <div class="status-sub">
                ${online ? '<span style="color:#16a34a;font-weight:700;">● Online</span>' : 'Offline'}
              </div>
            </div>
          </div>

          <div class="person-actions">
            <button class="btn btn-sm ${isFollowing ? 'btn-success' : 'btn-outline'}"
              onclick="toggleFollow('${escapeHtml(p.email)}')">
              ${isFollowing ? '✓ Following' : '+ Follow'}
            </button>
            ${friendBtn}
            <button class="btn btn-sm btn-outline" onclick="openDirectChat('${escapeHtml(p.email)}')">💬 Chat</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function updateChatTargetOptions() {
  const select = document.getElementById('chat-target-select');
  if (!select) return;

  const currentVal = activeChatTarget;
  const map = new Map();
  state.profiles.forEach((p) => map.set(p.email, p.full_name));
  state.posts.forEach((p) => {
    if (p.author_email && !map.has(p.author_email)) map.set(p.author_email, p.author);
  });

  let opts = `<option value="">🌍 Chat Waliinii (Hundaa)</option>`;
  map.forEach((name, email) => {
    if (currentUser && email === currentUser.email) return;
    const statusDot = isUserOnline(email) ? '🟢' : '⚪';
    opts += `<option value="${escapeHtml(email)}">${statusDot} ${escapeHtml(name)}</option>`;
  });

  select.innerHTML = opts;
  select.value = currentVal;
}

function openDirectChat(targetEmail) {
  activeChatTarget = targetEmail;
  updateChatTargetOptions();
  switchChatTarget(targetEmail);
  navigateTo('view-chat');
}

function switchChatTarget(targetEmail) {
  activeChatTarget = targetEmail;
  const titleEl = document.getElementById('chat-room-title');
  const statusEl = document.getElementById('chat-room-status');

  if (!targetEmail) {
    titleEl.textContent = 'Chat Waliinii (Public Group)';
    const onlineCount = Math.max(1, state.profiles.filter((p) => isUserOnline(p.email)).length);
    statusEl.innerHTML = `<span class="dot-online"></span> ${onlineCount} Online amma`;
  } else {
    const prof = state.profiles.find((p) => p.email === targetEmail);
    const name = prof ? prof.full_name : targetEmail;
    const online = isUserOnline(targetEmail);
    titleEl.textContent = name;
    statusEl.innerHTML = online
      ? `<span class="dot-online"></span> <strong style="color:#16a34a;">Online amma</strong>`
      : `<span class="dot-offline"></span> Offline`;
  }

  renderChat();
}

async function handleSendMessage(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('Chat gochuuf dura Seenaa (Login)!');
    navigateTo('view-auth');
    return;
  }

  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  const newMsg = {
    sender_name: currentUser.name,
    sender_email: currentUser.email,
    receiver_email: activeChatTarget || null,
    message_text: text
  };

  if (supabaseClient) {
    const { error } = await supabaseClient.from('messages').insert(newMsg);
    if (error) {
      showToast('Dogoggora Ergaa: ' + error.message);
      return;
    }
    await loadMessages();
  } else {
    newMsg.id = String(Date.now());
    newMsg.created_at = new Date().toISOString();
    state.messages.push(newMsg);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(state.messages));
    renderChat();
  }

  input.value = '';
  scrollChatToBottom();
}

function renderChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (!activeChatTarget) {
    const onlineCount = Math.max(1, state.profiles.filter((p) => isUserOnline(p.email)).length);
    const statusEl = document.getElementById('chat-room-status');
    if (statusEl) statusEl.innerHTML = `<span class="dot-online"></span> ${onlineCount} Online amma`;
  } else {
    const online = isUserOnline(activeChatTarget);
    const statusEl = document.getElementById('chat-room-status');
    if (statusEl) {
      statusEl.innerHTML = online
        ? `<span class="dot-online"></span> <strong style="color:#16a34a;">Online amma</strong>`
        : `<span class="dot-offline"></span> Offline`;
    }
  }

  const filtered = state.messages.filter((m) => {
    if (!activeChatTarget) {
      return !m.receiver_email;
    }
    if (!currentUser) return false;
    return (
      (m.sender_email === currentUser.email && m.receiver_email === activeChatTarget) ||
      (m.sender_email === activeChatTarget && m.receiver_email === currentUser.email)
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="muted" style="text-align:center;margin:auto;">Ergaan ammaaf hin jiru. Nagaa gaafachuun jalqabaa!</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((m) => {
      const isMine = currentUser && m.sender_email === currentUser.email;
      const senderOnline = isUserOnline(m.sender_email);
      return `
        <div class="msg-bubble ${isMine ? 'mine' : ''}">
          <div class="msg-meta">
            <span class="${senderOnline ? 'dot-online' : 'dot-offline'}"></span>
            <span>${escapeHtml(isMine ? 'Ana' : m.sender_name)}</span>
            <span>• ${formatTime(m.created_at)}</span>
          </div>
          <div>${escapeHtml(m.message_text)}</div>
        </div>
      `;
    })
    .join('');

  scrollChatToBottom();
}

function scrollChatToBottom() {
  const box = document.getElementById('chat-messages');
  if (box) box.scrollTop = box.scrollHeight;
}

function updateProfileStats(function openPublicProfile(email) {
  if (!email) return;
  const modal = document.getElementById('public-profile-modal');
  const titleEl = document.getElementById('pub-prof-name');
  const bodyEl = document.getElementById('pub-prof-content');
  if (!modal || !titleEl || !bodyEl) return;

  const prof = state.profiles.find((p) => p.email === email) || {};
  const userPosts = state.posts.filter((p) => p.author_email === email);
  const name = prof.full_name || (userPosts[0] && userPosts[0].author) || email.split('@')[0];
  const bio = prof.bio || 'Odeeffannoon dabalataa hin galmaa’ine.';
  const online = isUserOnline(email);

  const followersCount = state.relationships.filter(
    (r) => r.receiver_email === email && r.rel_type === 'follow'
  ).length;
  const friendsCount = state.relationships.filter(
    (r) =>
      r.rel_type === 'friend' &&
      r.status === 'accepted' &&
      (r.sender_email === email || r.receiver_email === email)
  ).length;

  titleEl.textContent = name;
  bodyEl.innerHTML = `
    <p class="muted">${escapeHtml(email)}</p>
    <p>${online ? '<span style="color:#16a34a;font-weight:700;">● Online amma</span>' : 'Offline'}</p>
    <p style="margin:8px 0;"><strong>Bio:</strong> ${escapeHtml(bio)}</p>
    <div style="display:flex;gap:12px;margin:10px 0;font-size:14px;">
      <span><strong>${userPosts.length}</strong> Posts</span>
      <span><strong>${followersCount}</strong> Followers</span>
      <span><strong>${friendsCount}</strong> Friends</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button type="button" class="btn btn-primary btn-sm" onclick="closePublicProfile(); toggleFollow('${escapeHtml(email)}')">+ Follow</button>
      <button type="button" class="btn btn-outline btn-sm" onclick="closePublicProfile(); openDirectChat('${escapeHtml(email)}')">💬 Chat</button>
    </div>
    <hr />
    <h4>Barreeffamoota (${userPosts.length})</h4>
    ${
      userPosts.length
        ? userPosts
            .map(
              (p) => `
              <div style="border-bottom:1px solid #eee;padding:8px 0;">
                <strong>${escapeHtml(p.title)}</strong>
                <p style="margin:4px 0;font-size:14px;">${escapeHtml(p.body)}</p>
              </div>`
            )
            .join('')
        : '<p class="muted">Barreeffama hin maxxansine.</p>'
    }
  `;

  modal.classList.remove('hidden');
}

function closePublicProfile() {
  const modal = document.getElementById('public-profile-modal');
  if (modal) modal.classList.add('hidden');
}) {
  if (!currentUser) return;
  const myPosts = state.posts.filter((p) => p.author_email === currentUser.email).length;
  const followers = state.relationships.filter(
    (r) => r.receiver_email === currentUser.email && r.rel_type === 'follow'
  ).length;
  const friends = state.relationships.filter(
    (r) =>
      r.rel_type === 'friend' &&
      r.status === 'accepted' &&
      (r.sender_email === currentUser.email || r.receiver_email === currentUser.email)
  ).length;

  document.getElementById('stat-posts').textContent = myPosts;
  document.getElementById('stat-followers').textContent = followers;
  document.getElementById('stat-friends').textContent = friends;
}

function formatTime(iso) {
  if (!iso) return 'Amma';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
    }
