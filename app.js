// === GLOBALS ===
let allTracks = [];
let allPlaylists = [];
let allFavorites = [];
let allHistory = [];
let currentUser = null;
let currentPlaylistId = null;
let currentSort = 'title';
let currentSortDir = 'asc';

// Signal when app is fully ready (for Telegram init)
window._appReady = new Promise(resolve => { window._appReadyResolve = resolve; });

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  // Init global DB first
  await window.musicDB.init();

  // Load settings (includes currentUser)
  await loadSettings();

  // Init user-scoped DB for current user (or guest)
  const userId = currentUser ? currentUser.id : null;
  await window.musicDB.initUserDB(userId);

  // Load data from user DB
  await loadAllData();

  // Init player
  player.init();
  player.setTrackList(allTracks);

  // Setup UI
  setupDragDrop();
  setupProgressClick();
  setupVolumeClick();
  setupMediaSession();

  // Render everything
  renderAll();

  // Signal app ready
  if (window._appReadyResolve) window._appReadyResolve();

  // Init volume display
  const volFill = document.querySelector('.volume-fill');
  if (volFill) volFill.style.width = (player.volume * 100) + '%';

  // Init repeat/shuffle buttons
  player.updateUI();
});

// === PASSWORD HASHING (SHA-256) ===
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'soundwave_salt_v1');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// === RENDER ALL ===
function renderAll() {
  renderLibrary();
  renderStats();
  renderPlaylists();
  renderFavorites();
  renderHistory();
  updateAuthUI();
  updateAccountPage();
}

// === SWITCH USER DB ===
async function switchToUser(userId) {
  // Stop player completely
  player.stopHistoryTracking();
  player.audio.pause();
  player.audio.src = '';
  player.currentIndex = -1;
  player.isPlaying = false;
  player.currentHistoryEntryId = null;

  // Clear ALL in-memory data BEFORE switching
  allTracks = [];
  allPlaylists = [];
  allFavorites = [];
  allHistory = [];
  player.setTrackList([]);

  // Switch database
  await window.musicDB.initUserDB(userId);

  // Load fresh data from new DB
  await loadAllData();

  // Verify we loaded from the correct DB
  const loadedUserId = window.musicDB.getCurrentUserId();
  if (loadedUserId !== userId) {
    console.error('DB switch mismatch!', loadedUserId, '!==', userId);
    // Retry
    await window.musicDB.initUserDB(userId);
    await loadAllData();
  }

  // Update player tracklist
  player.setTrackList(allTracks);
}

// === LOAD DATA ===
async function loadAllData() {
  allTracks = await window.musicDB.getAllTracks();
  allPlaylists = await window.musicDB.getAllPlaylists();
  const favs = await window.musicDB.getAllFavorites();
  allFavorites = favs.map(f => f.trackId);
  allHistory = await window.musicDB.getHistory();
}

async function loadSettings() {
  const theme = await window.musicDB.getSetting('theme');
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeUI(theme);
  }
  const vol = await window.musicDB.getSetting('volume');
  if (vol !== null) player.setVolume(vol);
  const shuffle = await window.musicDB.getSetting('shuffle');
  if (shuffle) player.isShuffle = true;
  const repeat = await window.musicDB.getSetting('repeat');
  if (repeat) player.repeatMode = repeat;
  const user = await window.musicDB.getSetting('currentUser');
  if (user) currentUser = user;
}

// === NAVIGATION ===
function navigateTo(page, data) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  if (page === 'playlists') renderPlaylists();
  if (page === 'favorites') renderFavorites();
  if (page === 'history') renderHistory();
  if (page === 'library') renderLibrary();
  if (page === 'account') updateAccountPage();
  closeSidebar();
}

// === SIDEBAR ===
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.mobile-overlay').classList.toggle('active');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.mobile-overlay').classList.remove('active');
}

// === THEME ===
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  window.musicDB.saveSetting('theme', next);
  updateThemeUI(next);
}
function updateThemeUI(theme) {
  const label = document.getElementById('theme-label');
  if (label) label.textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
}

// === ACCOUNT LINKING (PC ↔ Telegram) ===
async function generateLinkCode() {
  if (!currentUser) {
    showToast('Сначала войдите в аккаунт', 'error');
    return;
  }
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await window.musicDB.saveSetting('linkCode_' + code, {
    userId: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    createdAt: Date.now()
  });
  const el = document.getElementById('pc-link-code');
  const val = document.getElementById('pc-link-code-value');
  if (el && val) {
    val.textContent = code;
    el.style.display = 'block';
  }
  showToast('Код: ' + code, 'success');
}

function copyLinkCode() {
  const val = document.getElementById('pc-link-code-value');
  if (val) {
    navigator.clipboard.writeText(val.textContent);
    showToast('Код скопирован!', 'success');
  }
}

// === FILE HANDLING ===
function setupDragDrop() {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(e => {
    zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(e => {
    zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.remove('dragover'); });
  });
  zone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    handleFiles(files);
  });
  // Global drag-drop
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.target.closest('.upload-zone')) return;
    handleFiles(e.dataTransfer.files);
  });
}

async function handleFiles(files) {
  const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/ogg', 'audio/x-m4a', 'audio/aac'];
  let added = 0;
  for (const file of files) {
    if (!audioTypes.some(t => file.type.includes(t.split('/')[1])) && !file.name.match(/\.(mp3|wav|flac|m4a|ogg)$/i)) {
      showToast(`Пропущен: ${file.name} (неподдерживаемый формат)`, 'error');
      continue;
    }
    try {
      const track = await processAudioFile(file);
      await window.musicDB.addTrack(track);
      allTracks.push(track);
      added++;
      showToast(`Добавлен: ${track.title}`, 'success');
    } catch (err) {
      showToast(`Ошибка загрузки: ${file.name}`, 'error');
    }
  }
  if (added > 0) {
    player.setTrackList(allTracks);
    renderLibrary();
    renderStats();
    showToast(`Загружено треков: ${added}`, 'info');
  }
}

async function processAudioFile(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.addEventListener('loadedmetadata', async () => {
      const cover = await extractCover(file);
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const track = {
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
        title: title,
        artist: 'Неизвестный исполнитель',
        album: 'Неизвестный альбом',
        duration: audio.duration,
        file: file,
        blob: file,
        cover: cover,
        dateAdded: Date.now(),
        format: file.name.split('.').pop().toUpperCase()
      };
      URL.revokeObjectURL(url);
      resolve(track);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Cannot load audio'));
    });
  });
}

function extractCover(file) {
  return new Promise(resolve => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        const view = new DataView(buffer);
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) === 'ID3') {
          let offset = 10;
          while (offset < view.byteLength - 10) {
            if (String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3)) === 'APIC') {
              offset += 10;
              while (offset < view.byteLength && view.getUint8(offset) !== 0xFF) offset++;
              if (view.getUint8(offset) === 0xFF && view.getUint8(offset+1) >= 0xD8) {
                let end = offset + 2;
                while (end < view.byteLength - 1) {
                  if (view.getUint8(end) === 0xFF && view.getUint8(end+1) === 0xD9) { end += 2; break; }
                  end++;
                }
                const blob = new Blob([buffer.slice(offset, end)], { type: 'image/jpeg' });
                resolve(URL.createObjectURL(blob));
                return;
              }
            }
            offset++;
          }
        }
        resolve(null);
      };
      reader.readAsArrayBuffer(file.slice(0, 1024 * 100));
    } catch {
      resolve(null);
    }
  });
}

// === RENDER LIBRARY ===
function renderLibrary() {
  const list = document.getElementById('track-list');
  const empty = document.getElementById('empty-library');
  if (!list) return;
  let filtered = getFilteredTracks();
  if (filtered.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty || createEmptyState('Библиотека пуста', 'Загрузите аудиофайлы, чтобы начать слушать', '🎵'));
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = filtered.map((t, i) => createTrackItem(t, allTracks.indexOf(t) + 1)).join('');
}

function getFilteredTracks() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  let tracks = [...allTracks];
  if (search) {
    tracks = tracks.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.artist || '').toLowerCase().includes(search) ||
      (t.album || '').toLowerCase().includes(search)
    );
  }
  tracks.sort((a, b) => {
    let va = a[currentSort] || '';
    let vb = b[currentSort] || '';
    if (currentSort === 'duration' || currentSort === 'dateAdded') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return currentSortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });
  return tracks;
}

function createTrackItem(track, num) {
  const isPlaying = player.currentIndex >= 0 && allTracks[player.currentIndex]?.id === track.id;
  const isFav = allFavorites.includes(track.id);
  return `
    <div class="track-item ${isPlaying ? 'playing' : ''}" data-id="${track.id}" onclick="playTrackById('${track.id}')">
      <span class="track-num">${isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="4" height="16"/><rect x="12" y="8" width="4" height="12"/><rect x="20" y="2" width="4" height="18"/></svg>' : num}</span>
      ${track.cover ? `<img class="track-cover" src="${track.cover}" alt="">` : '<div class="track-cover-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>'}
      <div class="track-info">
        <div class="track-title">${escHtml(track.title)}</div>
        <div class="track-meta">${escHtml(track.artist)} · ${track.format || 'MP3'}</div>
      </div>
      <span class="track-duration">${formatTime(track.duration || 0)}</span>
      <div class="track-actions">
        <button class="track-action-btn ${isFav ? 'fav-active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${track.id}')" title="Избранное">
          <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="track-action-btn" onclick="event.stopPropagation(); addToPlaylistPrompt('${track.id}')" title="В плейлист">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="track-action-btn" onclick="event.stopPropagation(); deleteTrack('${track.id}')" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}

// === PLAY TRACK ===
async function playTrackById(id) {
  const idx = allTracks.findIndex(t => t.id === id);
  if (idx === -1) return;
  await player.loadTrack(idx);
  player.play();
}

// === SEARCH & SORT ===
function filterTracks() { renderLibrary(); }
function sortTracks(field) {
  if (currentSort === field) {
    currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = field;
    currentSortDir = 'asc';
  }
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === currentSort));
  renderLibrary();
}

// === DELETE TRACK (with cleanup) ===
async function deleteTrack(id) {
  if (!confirm('Удалить трек?')) return;

  // Stop playback if this track is playing
  if (player.currentIndex >= 0 && allTracks[player.currentIndex]?.id === id) {
    player.stopHistoryTracking();
    player.audio.pause();
    player.audio.src = '';
    player.currentIndex = -1;
    player.isPlaying = false;
    player.updatePlayButton();
  }

  // Delete from DB
  await window.musicDB.deleteTrack(id);

  // Remove from all playlists
  for (const playlist of allPlaylists) {
    if (playlist.trackIds && playlist.trackIds.includes(id)) {
      playlist.trackIds = playlist.trackIds.filter(tid => tid !== id);
      await window.musicDB.addPlaylist(playlist);
    }
  }

  // Remove from favorites
  if (allFavorites.includes(id)) {
    await window.musicDB.removeFavorite(id);
    allFavorites = allFavorites.filter(fid => fid !== id);
  }

  // Remove from history
  await window.musicDB.deleteHistoryByTrack(id);
  allHistory = allHistory.filter(h => h.trackId !== id);

  // Remove from tracks
  allTracks = allTracks.filter(t => t.id !== id);
  player.setTrackList(allTracks);

  renderLibrary();
  renderStats();
  renderPlaylists();
  renderFavorites();
  renderHistory();
  showToast('Трек удалён', 'success');
}

// === CLEAR LIBRARY ===
async function clearLibrary() {
  if (!confirm('Удалить все треки? Это действие необратимо.')) return;
  player.stopHistoryTracking();
  player.audio.pause();
  player.audio.src = '';
  player.currentIndex = -1;
  player.isPlaying = false;

  await window.musicDB.clearTracks();
  await window.musicDB.clearHistory();
  // Also clear playlist track references
  for (const playlist of allPlaylists) {
    playlist.trackIds = [];
    await window.musicDB.addPlaylist(playlist);
  }
  allTracks = [];
  allHistory = [];
  player.setTrackList([]);
  renderLibrary();
  renderStats();
  renderPlaylists();
  renderHistory();
  showToast('Библиотека очищена', 'success');
}

// === FAVORITES ===
async function toggleFavorite(trackId) {
  if (allFavorites.includes(trackId)) {
    await window.musicDB.removeFavorite(trackId);
    allFavorites = allFavorites.filter(id => id !== trackId);
    showToast('Удалено из избранного', 'info');
  } else {
    await window.musicDB.addFavorite(trackId);
    allFavorites.push(trackId);
    showToast('Добавлено в избранное', 'success');
  }
  renderLibrary();
  renderStats();
  renderFavorites();
}

function renderFavorites() {
  const list = document.getElementById('favorites-list');
  const empty = document.getElementById('empty-favorites');
  if (!list) return;
  const tracks = allTracks.filter(t => allFavorites.includes(t.id));
  if (tracks.length === 0) {
    list.innerHTML = '';
    if (empty) { list.appendChild(empty); empty.style.display = ''; }
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = tracks.map((t, i) => createTrackItem(t, i + 1)).join('');
}

// === HISTORY ===
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('empty-history');
  if (!list) return;
  const entries = [...allHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
  if (entries.length === 0) {
    list.innerHTML = '';
    if (empty) { list.appendChild(empty); empty.style.display = ''; }
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = entries.map((entry, i) => {
    const track = allTracks.find(t => t.id === entry.trackId);
    if (!track) return '';
    return createHistoryItem(track, entry, i + 1);
  }).join('');
}

function createHistoryItem(track, entry, num) {
  const isPlaying = player.currentIndex >= 0 && allTracks[player.currentIndex]?.id === track.id;
  const isFav = allFavorites.includes(track.id);
  const timeAgo = formatTimeAgo(entry.timestamp);
  const listenTime = entry.listenTime ? formatTime(entry.listenTime) : '';
  const completed = entry.completed;
  const progressPct = track.duration > 0 ? Math.min(100, ((entry.lastPosition || 0) / track.duration) * 100) : 0;

  return `
    <div class="track-item history-item ${isPlaying ? 'playing' : ''}" data-id="${track.id}" onclick="playTrackById('${track.id}')">
      <span class="track-num">${isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="4" height="16"/><rect x="12" y="8" width="4" height="12"/><rect x="20" y="2" width="4" height="18"/></svg>' : num}</span>
      ${track.cover ? `<img class="track-cover" src="${track.cover}" alt="">` : '<div class="track-cover-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>'}
      <div class="track-info">
        <div class="track-title">${escHtml(track.title)}</div>
        <div class="track-meta">
          ${escHtml(track.artist)} · ${timeAgo}
          ${listenTime ? ` · Слушали ${listenTime}` : ''}
          ${completed ? ' · <span style="color:var(--accent)">✓ Прослушан</span>' : ''}
        </div>
        ${progressPct > 0 ? `<div class="history-progress"><div class="history-progress-fill" style="width:${progressPct}%"></div></div>` : ''}
      </div>
      <span class="track-duration">${formatTime(track.duration || 0)}</span>
      <div class="track-actions">
        <button class="track-action-btn ${isFav ? 'fav-active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${track.id}')" title="Избранное">
          <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="track-action-btn" onclick="event.stopPropagation(); addToPlaylistPrompt('${track.id}')" title="В плейлист">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>`;
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (sec < 60) return 'только что';
  if (min < 60) return `${min} мин назад`;
  if (hour < 24) return `${hour} ч назад`;
  if (day < 7) return `${day} дн назад`;
  return new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function clearHistory() {
  if (!confirm('Очистить историю прослушивания?')) return;
  await window.musicDB.clearHistory();
  allHistory = [];
  renderHistory();
  showToast('История очищена', 'success');
}

// === PLAYLISTS ===
function renderPlaylists() {
  const grid = document.getElementById('playlist-grid');
  const empty = document.getElementById('empty-playlists');
  if (!grid) return;
  if (allPlaylists.length === 0) {
    grid.innerHTML = '';
    if (empty) { grid.appendChild(empty); empty.style.display = ''; }
    return;
  }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = allPlaylists.map(p => {
    const tracks = (p.trackIds || []).map(id => allTracks.find(t => t.id === id)).filter(Boolean);
    const covers = tracks.slice(0, 4).map(t => t.cover || '');
    return `
    <div class="playlist-card" onclick="openPlaylist('${p.id}')">
      <div class="playlist-cover-grid">
        ${covers.map(c => c ? `<img src="${c}" alt="">` : '<div style="background:var(--gradient-subtle);width:100%;height:100%;"></div>').join('')}
        ${Array(4 - Math.min(covers.length, 4)).fill('<div style="background:var(--gradient-subtle);width:100%;height:100%;"></div>').join('')}
      </div>
      <div class="playlist-card-title">${escHtml(p.name)}</div>
      <div class="playlist-card-count">${tracks.length} треков</div>
    </div>`;
  }).join('');
}

function showCreatePlaylistModal() {
  document.getElementById('playlist-modal').classList.add('active');
  document.getElementById('playlist-name-input').value = '';
  document.getElementById('playlist-name-input').focus();
}
function hidePlaylistModal() {
  document.getElementById('playlist-modal').classList.remove('active');
}

async function createPlaylist(e) {
  e.preventDefault();
  const name = document.getElementById('playlist-name-input').value.trim();
  if (!name) return;
  const playlist = {
    id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
    name: name,
    trackIds: [],
    dateCreated: Date.now()
  };
  await window.musicDB.addPlaylist(playlist);
  allPlaylists.push(playlist);
  hidePlaylistModal();
  renderPlaylists();
  renderStats();
  showToast(`Плейлист "${name}" создан`, 'success');
}

function openPlaylist(id) {
  currentPlaylistId = id;
  const playlist = allPlaylists.find(p => p.id === id);
  if (!playlist) return;
  document.getElementById('playlist-detail-name').textContent = playlist.name;
  const tracks = (playlist.trackIds || []).map(tid => allTracks.find(t => t.id === tid)).filter(Boolean);
  const list = document.getElementById('playlist-detail-tracks');
  if (tracks.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🎶</div><div class="empty-title">Плейлист пуст</div><div class="empty-subtitle">Добавьте треки через библиотеку</div></div>';
  } else {
    list.innerHTML = tracks.map((t, i) => createTrackItem(t, i + 1)).join('');
  }
  navigateTo('playlist-detail');
}

async function renameCurrentPlaylist() {
  const playlist = allPlaylists.find(p => p.id === currentPlaylistId);
  if (!playlist) return;
  const name = prompt('Новое название плейлиста:', playlist.name);
  if (!name || name.trim() === '') return;
  playlist.name = name.trim();
  await window.musicDB.addPlaylist(playlist);
  document.getElementById('playlist-detail-name').textContent = playlist.name;
  renderPlaylists();
  showToast('Плейлист переименован', 'success');
}

async function deleteCurrentPlaylist() {
  if (!confirm('Удалить плейлист?')) return;
  await window.musicDB.deletePlaylist(currentPlaylistId);
  allPlaylists = allPlaylists.filter(p => p.id !== currentPlaylistId);
  renderPlaylists();
  renderStats();
  navigateTo('playlists');
  showToast('Плейлист удалён', 'success');
}

async function addToPlaylistPrompt(trackId) {
  if (allPlaylists.length === 0) {
    showToast('Сначала создайте плейлист', 'info');
    return;
  }
  const names = allPlaylists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const choice = prompt(`Выберите плейлист (введите номер):\n${names}`);
  if (!choice) return;
  const idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= allPlaylists.length) { showToast('Неверный номер', 'error'); return; }
  const playlist = allPlaylists[idx];
  if (!playlist.trackIds) playlist.trackIds = [];
  if (playlist.trackIds.includes(trackId)) {
    showToast('Трек уже в плейлисте', 'info');
    return;
  }
  playlist.trackIds.push(trackId);
  await window.musicDB.addPlaylist(playlist);
  showToast(`Добавлено в "${playlist.name}"`, 'success');
}

// === STATS ===
function renderStats() {
  const el = id => document.getElementById(id);
  if (el('stat-tracks')) el('stat-tracks').textContent = allTracks.length;
  const totalDur = allTracks.reduce((s, t) => s + (t.duration || 0), 0);
  if (el('stat-duration')) el('stat-duration').textContent = formatTime(totalDur);
  if (el('stat-favorites')) el('stat-favorites').textContent = allFavorites.length;
  if (el('stat-playlists')) el('stat-playlists').textContent = allPlaylists.length;
}

// === AUTH ===
function showAuthModal() { document.getElementById('auth-modal').classList.add('active'); }
function hideAuthModal() { document.getElementById('auth-modal').classList.remove('active'); }
function switchAuthTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.modal-tab:${tab === 'login' ? 'first-child' : 'last-child'}`).classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const users = await window.musicDB.getUsers();
  const passwordHash = await hashPassword(password);
  const user = users.find(u => u.email === email && u.password === passwordHash);
  if (!user) { showToast('Неверный email или пароль', 'error'); return; }
  currentUser = user;
  await window.musicDB.saveSetting('currentUser', user);
  hideAuthModal();
  // Switch to user's DB
  await switchToUser(user.id);
  renderAll();
  // Reset form
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  showToast(`Добро пожаловать, ${user.name}!`, 'success');
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const users = await window.musicDB.getUsers();
  if (users.find(u => u.email === email)) {
    showToast('Email уже зарегистрирован', 'error');
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = {
    id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString()),
    name, email,
    password: passwordHash,
    dateCreated: Date.now()
  };
  await window.musicDB.saveUser(user);
  currentUser = user;
  await window.musicDB.saveSetting('currentUser', user);
  hideAuthModal();
  // Switch to user's DB
  await switchToUser(user.id);
  renderAll();
  // Reset form
  document.getElementById('register-name').value = '';
  document.getElementById('register-email').value = '';
  document.getElementById('register-password').value = '';
  showToast(`Аккаунт создан! Добро пожаловать, ${name}!`, 'success');
}

async function handleLogout() {
  if (!confirm('Выйти из аккаунта?')) return;
  currentUser = null;
  await window.musicDB.saveSetting('currentUser', null);
  // Switch to guest DB
  await switchToUser(null);
  renderAll();
  showToast('Вы вышли из аккаунта', 'info');
}

function handleSidebarUserClick() {
  if (currentUser) {
    navigateTo('account');
  } else {
    showAuthModal();
  }
}

function updateAuthUI() {
  const nameEl = document.getElementById('sidebar-name');
  const emailEl = document.getElementById('sidebar-email');
  const avatarEl = document.getElementById('sidebar-avatar');
  const userCard = document.getElementById('sidebar-user-card');
  if (currentUser) {
    if (nameEl) nameEl.textContent = currentUser.name;
    if (emailEl) emailEl.textContent = currentUser.email;
    if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();
    if (userCard) {
      userCard.onclick = () => navigateTo('account');
      userCard.title = 'Нажмите, чтобы открыть аккаунт';
    }
  } else {
    if (nameEl) nameEl.textContent = 'Гость';
    if (emailEl) emailEl.textContent = 'Войти в аккаунт';
    if (avatarEl) avatarEl.textContent = '?';
    if (userCard) {
      userCard.onclick = () => showAuthModal();
      userCard.title = 'Нажмите, чтобы войти';
    }
  }
}

function updateAccountPage() {
  const guestActions = document.getElementById('account-actions-guest');
  const userActions = document.getElementById('account-actions-user');
  const profileLoggedOut = document.getElementById('profile-form-logged-out');
  const profileLoggedIn = document.getElementById('profile-form-logged-in');

  if (currentUser) {
    document.getElementById('account-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('account-name-display').textContent = currentUser.name;
    document.getElementById('account-email-display').textContent = currentUser.email;
    if (guestActions) guestActions.style.display = 'none';
    if (userActions) userActions.style.display = 'flex';
    if (profileLoggedOut) profileLoggedOut.style.display = 'none';
    if (profileLoggedIn) profileLoggedIn.style.display = 'block';
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-email').value = currentUser.email;
    document.getElementById('profile-password').value = '';
  } else {
    document.getElementById('account-avatar').textContent = '?';
    document.getElementById('account-name-display').textContent = 'Гость';
    document.getElementById('account-email-display').textContent = 'Не вошли в аккаунт';
    if (guestActions) guestActions.style.display = 'flex';
    if (userActions) userActions.style.display = 'none';
    if (profileLoggedOut) profileLoggedOut.style.display = 'flex';
    if (profileLoggedIn) profileLoggedIn.style.display = 'none';
  }
  renderAccountStats();
}

function renderAccountStats() {
  const dateEl = document.getElementById('account-date');
  if (dateEl) {
    if (currentUser && currentUser.dateCreated) {
      const d = new Date(currentUser.dateCreated);
      dateEl.textContent = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      dateEl.textContent = '—';
    }
  }
  const tracksEl = document.getElementById('account-tracks');
  if (tracksEl) tracksEl.textContent = allTracks.length;
  const favsEl = document.getElementById('account-favorites');
  if (favsEl) favsEl.textContent = allFavorites.length;
  const plEl = document.getElementById('account-playlists');
  if (plEl) plEl.textContent = allPlaylists.length;
  const listenEl = document.getElementById('account-listen-time');
  if (listenEl) {
    const totalSec = allTracks.reduce((s, t) => s + (t.duration || 0), 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    listenEl.textContent = h > 0 ? `${h}ч ${m}м` : `${m}м`;
  }
  const histEl = document.getElementById('account-history-count');
  if (histEl) {
    const unique = new Set(allHistory.map(h => h.trackId));
    histEl.textContent = unique.size;
  }
}

async function saveProfile() {
  if (!currentUser) return;
  const name = document.getElementById('profile-name').value.trim();
  const email = document.getElementById('profile-email').value.trim();
  const password = document.getElementById('profile-password').value;

  if (!name) { showToast('Введите имя', 'error'); return; }
  if (!email) { showToast('Введите email', 'error'); return; }

  if (email !== currentUser.email) {
    const users = await window.musicDB.getUsers();
    if (users.find(u => u.email === email && u.id !== currentUser.id)) {
      showToast('Email уже используется другим аккаунтом', 'error');
      return;
    }
  }

  currentUser.name = name;
  currentUser.email = email;
  if (password.length > 0) {
    if (password.length < 6) {
      showToast('Пароль должен быть минимум 6 символов', 'error');
      return;
    }
    currentUser.password = await hashPassword(password);
  }

  await window.musicDB.saveUser(currentUser);
  await window.musicDB.saveSetting('currentUser', currentUser);
  updateAuthUI();
  updateAccountPage();
  document.getElementById('profile-password').value = '';
  showToast('Профиль сохранён', 'success');
}

function toggleProfilePassword() {
  const pwInput = document.getElementById('profile-password');
  if (pwInput.type === 'password') {
    pwInput.type = 'text';
  } else {
    pwInput.type = 'password';
  }
}

async function clearAllData() {
  if (!confirm('Вы уверены? Все данные будут удалены без возможности восстановления.')) return;
  if (!confirm('Точно удалить ВСЕ данные?')) return;

  // Stop player
  player.stopHistoryTracking();
  player.audio.pause();
  player.audio.src = '';
  player.currentIndex = -1;
  player.isPlaying = false;

  // Clear current user's DB completely
  const userId = window.musicDB.getCurrentUserId();
  await window.musicDB.clearTracks();
  await window.musicDB.clearPlaylists();
  await window.musicDB.clearFavorites();
  await window.musicDB.clearHistory();

  // Also destroy and recreate the DB to ensure clean state
  if (userId) {
    await window.musicDB.destroyUserDB(userId);
    await window.musicDB.initUserDB(userId);
  }

  // Clear in-memory data
  allTracks = [];
  allPlaylists = [];
  allFavorites = [];
  allHistory = [];
  player.setTrackList([]);
  renderAll();
  showToast('Все данные очищены', 'success');
}

// === PROGRESS BAR ===
function setupProgressClick() {
  document.addEventListener('click', e => {
    const container = e.target.closest('.progress-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (player.audio.duration) {
      player.seek(pct * player.audio.duration);
    }
  });
}

function setupVolumeClick() {
  document.addEventListener('click', e => {
    const slider = e.target.closest('.volume-slider');
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    player.setVolume(pct);
  });
}

// === MEDIA SESSION ===
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', () => player.play());
  navigator.mediaSession.setActionHandler('pause', () => player.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => player.prev());
  navigator.mediaSession.setActionHandler('nexttrack', () => player.next());
}

// === UTILS ===
function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function createEmptyState(title, subtitle, icon) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  const iconDiv = document.createElement('div');
  iconDiv.className = 'empty-icon';
  iconDiv.textContent = icon || '🎵';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'empty-title';
  titleDiv.textContent = title;
  const subtitleDiv = document.createElement('div');
  subtitleDiv.className = 'empty-subtitle';
  subtitleDiv.textContent = subtitle;
  div.appendChild(iconDiv);
  div.appendChild(titleDiv);
  div.appendChild(subtitleDiv);
  return div;
}

// === PWA ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
