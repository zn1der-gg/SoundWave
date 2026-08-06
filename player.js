class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.tracks = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 'none'; // none, one, all
    this.volume = 1;
    this.currentPlaylist = null;
    this.currentView = 'library';
    this.audioContext = null;
    this.analyser = null;
    this.visualizerData = null;

    // History tracking
    this.currentHistoryEntryId = null;
    this.historyListenTime = 0;
    this.historyUpdateInterval = null;
    this.lastHistorySaveTime = 0;

    // Error tracking
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;

    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onTrackEnd());
    this.audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
    this.audio.addEventListener('error', (e) => this.onError(e));
    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());

    // Save history on tab hide / page unload
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flushHistory();
    });
    window.addEventListener('beforeunload', () => this.flushHistory());
  }

  init() {
    this.setupAudioContext();
  }

  setupAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioContext.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      this.visualizerData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.log('AudioContext not available');
    }
  }

  getVisualizerData() {
    if (this.analyser && this.visualizerData) {
      this.analyser.getByteFrequencyData(this.visualizerData);
      return this.visualizerData;
    }
    return null;
  }

  setTrackList(tracks) {
    this.tracks = tracks;
  }

  async loadTrack(index) {
    if (index < 0 || index >= this.tracks.length) return;

    // Save previous track history before switching
    await this.flushHistory();

    this.currentIndex = index;
    this.consecutiveErrors = 0;
    const track = this.tracks[index];

    // Reset history tracking for new track
    this.historyListenTime = 0;
    this.lastHistorySaveTime = Date.now();

    if (track.blob) {
      const url = URL.createObjectURL(track.blob);
      this.audio.src = url;
    } else if (track.file) {
      const url = URL.createObjectURL(track.file);
      this.audio.src = url;
    }

    this.audio.load();

    // Create history entry immediately
    try {
      const entry = await window.musicDB.addToHistory(track.id);
      this.currentHistoryEntryId = entry.id;
    } catch (e) {
      console.error('Failed to create history entry:', e);
    }

    this.updateUI();
  }

  async play() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (this.currentIndex === -1 && this.tracks.length > 0) {
      await this.loadTrack(0);
    }
    try {
      await this.audio.play();
      this.isPlaying = true;
      this.updatePlayButton();
      this.startHistoryTracking();
    } catch (e) {
      console.error('Playback error:', e);
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.updatePlayButton();
    this.flushHistory();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  // === HISTORY REAL-TIME TRACKING ===
  onPlay() {
    this.startHistoryTracking();
  }

  onPause() {
    this.flushHistory();
  }

  startHistoryTracking() {
    this.stopHistoryTracking();
    this.lastHistorySaveTime = Date.now();
    // Update history every 5 seconds while playing
    this.historyUpdateInterval = setInterval(() => {
      if (this.isPlaying && this.audio.currentTime > 0) {
        this.flushHistory();
      }
    }, 5000);
  }

  stopHistoryTracking() {
    if (this.historyUpdateInterval) {
      clearInterval(this.historyUpdateInterval);
      this.historyUpdateInterval = null;
    }
  }

  async flushHistory() {
    // Accumulate listen time since last save
    if (this.isPlaying && this.lastHistorySaveTime > 0) {
      const now = Date.now();
      const delta = (now - this.lastHistorySaveTime) / 1000;
      this.historyListenTime += delta;
      this.lastHistorySaveTime = now;
    } else {
      this.lastHistorySaveTime = Date.now();
    }

    if (!this.currentHistoryEntryId) return;

    try {
      const track = this.tracks[this.currentIndex];
      const duration = track ? (track.duration || 0) : 0;
      const currentTime = this.audio.currentTime || 0;
      const completed = duration > 0 && currentTime >= duration - 2;

      await window.musicDB.updateHistoryEntry(this.currentHistoryEntryId, {
        listenTime: Math.round(this.historyListenTime * 10) / 10,
        lastPosition: currentTime,
        completed: completed,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('Failed to update history:', e);
    }
  }

  async next() {
    if (this.tracks.length === 0) return;
    this.stopHistoryTracking();
    let nextIndex;
    if (this.isShuffle) {
      if (this.tracks.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * this.tracks.length);
        } while (nextIndex === this.currentIndex);
      }
    } else {
      nextIndex = (this.currentIndex + 1) % this.tracks.length;
    }
    await this.loadTrack(nextIndex);
    if (this.isPlaying) this.play();
  }

  async prev() {
    if (this.tracks.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    this.stopHistoryTracking();
    let prevIndex;
    if (this.isShuffle) {
      if (this.tracks.length === 1) {
        prevIndex = 0;
      } else {
        do {
          prevIndex = Math.floor(Math.random() * this.tracks.length);
        } while (prevIndex === this.currentIndex);
      }
    } else {
      prevIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
    }
    await this.loadTrack(prevIndex);
    if (this.isPlaying) this.play();
  }

  seek(time) {
    if (this.audio.duration) {
      this.audio.currentTime = time;
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audio.volume = this.volume;
    window.musicDB.saveSetting('volume', this.volume);
    // Update volume slider UI
    const volFill = document.querySelector('.volume-fill');
    if (volFill) volFill.style.width = (this.volume * 100) + '%';
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.updateShuffleButton();
    window.musicDB.saveSetting('shuffle', this.isShuffle);
  }

  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const idx = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(idx + 1) % modes.length];
    this.updateRepeatButton();
    window.musicDB.saveSetting('repeat', this.repeatMode);
  }

  onTimeUpdate() {
    const { currentTime, duration } = this.audio;
    if (!duration) return;

    const progress = (currentTime / duration) * 100;
    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const sliderFill = document.getElementById('slider-fill');

    if (progressBar) progressBar.style.width = progress + '%';
    if (sliderFill) sliderFill.style.width = progress + '%';
    if (currentTimeEl) currentTimeEl.textContent = this.formatTime(currentTime);
    if (totalTimeEl) totalTimeEl.textContent = this.formatTime(duration);

    const miniProgress = document.getElementById('mini-progress');
    if (miniProgress) miniProgress.style.width = progress + '%';
  }

  async onTrackEnd() {
    // Mark current track as completed in history
    if (this.currentHistoryEntryId) {
      try {
        const track = this.tracks[this.currentIndex];
        await window.musicDB.updateHistoryEntry(this.currentHistoryEntryId, {
          completed: true,
          listenTime: track ? (track.duration || 0) : this.historyListenTime,
          lastPosition: 0,
          timestamp: Date.now()
        });
      } catch (e) {
        console.error('Failed to mark track completed:', e);
      }
    }

    this.stopHistoryTracking();

    if (this.repeatMode === 'one') {
      this.historyListenTime = 0;
      this.lastHistorySaveTime = Date.now();
      this.audio.currentTime = 0;
      this.play();
    } else if (this.repeatMode === 'all' || this.currentIndex < this.tracks.length - 1) {
      await this.next();
    } else {
      this.pause();
    }
  }

  onMetadataLoaded() {
    const track = this.tracks[this.currentIndex];
    if (track) {
      this.updateTrackInfo(track);
    }
  }

  onError(e) {
    console.error('Audio error:', e);
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.pause();
      this.consecutiveErrors = 0;
      if (typeof showToast === 'function') {
        showToast('Ошибка воспроизведения. Воспроизведение остановлено.', 'error');
      }
      return;
    }
    if (typeof showToast === 'function') {
      showToast('Ошибка загрузки трека, пропуск...', 'error');
    }
    this.next();
  }

  formatTime(s) {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  updateUI() {
    this.updatePlayButton();
    this.updateShuffleButton();
    this.updateRepeatButton();
    this.updateQueue();
    this.updateMiniPlayer();
    this.updateTrackHighlight();
  }

  updateTrackHighlight() {
    const currentTrack = this.tracks[this.currentIndex];
    document.querySelectorAll('.track-item').forEach(el => {
      el.classList.remove('playing');
      const numEl = el.querySelector('.track-num');
      if (numEl && numEl.querySelector('svg')) {
        const idx = Array.from(el.parentNode.children).indexOf(el);
        numEl.innerHTML = (idx + 1).toString();
      }
    });
    if (!currentTrack) return;
    const active = document.querySelector(`.track-item[data-id="${currentTrack.id}"]`);
    if (active) {
      active.classList.add('playing');
      const numEl = active.querySelector('.track-num');
      if (numEl) {
        numEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="4" height="16"/><rect x="12" y="8" width="4" height="12"/><rect x="20" y="2" width="4" height="18"/></svg>';
      }
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  updatePlayButton() {
    const btns = document.querySelectorAll('.play-btn-main');
    btns.forEach(btn => {
      btn.innerHTML = this.isPlaying
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
    });
  }

  updateShuffleButton() {
    const btns = document.querySelectorAll('.shuffle-btn');
    btns.forEach(btn => btn.classList.toggle('active', this.isShuffle));
  }

  updateRepeatButton() {
    const btns = document.querySelectorAll('.repeat-btn');
    btns.forEach(btn => {
      btn.classList.toggle('active', this.repeatMode !== 'none');
      if (this.repeatMode === 'one') {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" font-size="8" fill="currentColor" text-anchor="middle" font-weight="bold">1</text></svg>';
      } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
      }
    });
  }

  updateTrackInfo(track) {
    const coverEl = document.getElementById('player-cover');
    const titleEl = document.getElementById('player-title');
    const artistEl = document.getElementById('player-artist');

    if (coverEl && track.cover) {
      coverEl.src = track.cover;
      coverEl.style.display = 'block';
      document.getElementById('player-cover-placeholder')?.style.setProperty('display', 'none');
    } else if (coverEl) {
      coverEl.style.display = 'none';
      document.getElementById('player-cover-placeholder')?.style.setProperty('display', 'flex');
    }

    if (titleEl) titleEl.textContent = track.title || 'Неизвестно';
    if (artistEl) artistEl.textContent = track.artist || 'Неизвестный исполнитель';

    document.title = `${track.title || 'Трек'} - SoundWave`;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover ? [{ src: track.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    }
  }

  updateQueue() {
    const container = document.getElementById('queue-list');
    if (!container) return;
    container.innerHTML = this.tracks.map((t, i) => `
      <div class="queue-item ${i === this.currentIndex ? 'active' : ''}" onclick="player.loadTrack(${i}); player.play();">
        <span class="queue-num">${i + 1}</span>
        <div class="queue-info">
          <span class="queue-title">${t.title || 'Неизвестно'}</span>
          <span class="queue-artist">${t.artist || ''}</span>
        </div>
        <span class="queue-dur">${this.formatTime(t.duration || 0)}</span>
      </div>
    `).join('');
  }

  updateMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini && this.currentIndex >= 0) {
      mini.classList.add('visible');
    }
  }

  getCurrentTrack() {
    return this.tracks[this.currentIndex] || null;
  }
}

window.player = new MusicPlayer();