// === GLOBAL DB (users, settings — shared across all accounts) ===
const GLOBAL_DB_NAME = 'SoundWaveDB';
const GLOBAL_DB_VERSION = 3;

// === USER DB (tracks, playlists, favorites, history — per-account) ===
const USER_DB_VERSION = 3;

function getUserDBName(userId) {
  return userId ? `SoundWaveDB_user_${userId}` : 'SoundWaveDB_guest';
}

// === Global DB (users + settings) ===
class GlobalDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(GLOBAL_DB_NAME, GLOBAL_DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVersion = e.oldVersion;
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('users')) {
            db.createObjectStore('users', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      };
      req.onsuccess = e => { this.db = e.target.result; resolve(); };
      req.onerror = e => reject(e.target.error);
    });
  }

  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  async saveUser(user) {
    return new Promise((resolve, reject) => {
      const req = this._tx('users', 'readwrite').put(user);
      req.onsuccess = () => resolve(user);
      req.onerror = e => reject(e.target.error);
    });
  }

  async getUser(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('users').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async getUsers() {
    return new Promise((resolve, reject) => {
      const req = this._tx('users').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  }

  async saveSetting(key, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx('settings', 'readwrite').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async getSetting(key) {
    return new Promise((resolve, reject) => {
      const req = this._tx('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = e => reject(e.target.error);
    });
  }
}

// === User-scoped DB (tracks, playlists, favorites, history) ===
class UserDB {
  constructor(userId) {
    this.db = null;
    this.userId = userId;
    this.dbName = getUserDBName(userId);
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, USER_DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVersion = e.oldVersion;
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('tracks')) {
            const ts = db.createObjectStore('tracks', { keyPath: 'id' });
            ts.createIndex('title', 'title', { unique: false });
            ts.createIndex('dateAdded', 'dateAdded', { unique: false });
          }
          if (!db.objectStoreNames.contains('playlists')) {
            const pl = db.createObjectStore('playlists', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('history')) {
            const hs = db.createObjectStore('history', { keyPath: 'id' });
            hs.createIndex('trackId', 'trackId', { unique: false });
            hs.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains('favorites')) {
            db.createObjectStore('favorites', { keyPath: 'trackId' });
          }
        }
        if (oldVersion < 3) {
          if (db.objectStoreNames.contains('history')) {
            try {
              const tx = e.target.transaction;
              const hs = tx.objectStore('history');
              if (!hs.indexNames.contains('completed')) {
                hs.createIndex('completed', 'completed', { unique: false });
              }
            } catch (e) { /* index may already exist */ }
          }
        }
      };
      req.onsuccess = e => { this.db = e.target.result; resolve(); };
      req.onerror = e => reject(e.target.error);
    });
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch (e) {}
      this.db = null;
    }
  }

  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  // === TRACKS ===
  async addTrack(track) {
    return new Promise((resolve, reject) => {
      const req = this._tx('tracks', 'readwrite').put(track);
      req.onsuccess = () => resolve(track);
      req.onerror = e => reject(e.target.error);
    });
  }

  async getAllTracks() {
    return new Promise((resolve, reject) => {
      const req = this._tx('tracks').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  }

  async deleteTrack(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('tracks', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async clearTracks() {
    return new Promise((resolve, reject) => {
      const req = this._tx('tracks', 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  // === PLAYLISTS ===
  async addPlaylist(playlist) {
    return new Promise((resolve, reject) => {
      const req = this._tx('playlists', 'readwrite').put(playlist);
      req.onsuccess = () => resolve(playlist);
      req.onerror = e => reject(e.target.error);
    });
  }

  async getAllPlaylists() {
    return new Promise((resolve, reject) => {
      const req = this._tx('playlists').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  }

  async deletePlaylist(id) {
    return new Promise((resolve, reject) => {
      const req = this._tx('playlists', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async clearPlaylists() {
    return new Promise((resolve, reject) => {
      const req = this._tx('playlists', 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  // === FAVORITES ===
  async addFavorite(trackId) {
    return new Promise((resolve, reject) => {
      const req = this._tx('favorites', 'readwrite').put({ trackId, date: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async removeFavorite(trackId) {
    return new Promise((resolve, reject) => {
      const req = this._tx('favorites', 'readwrite').delete(trackId);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async getAllFavorites() {
    return new Promise((resolve, reject) => {
      const req = this._tx('favorites').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  }

  async clearFavorites() {
    return new Promise((resolve, reject) => {
      const req = this._tx('favorites', 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  // === HISTORY ===
  async addToHistory(trackId) {
    return new Promise((resolve, reject) => {
      const entry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        trackId,
        timestamp: Date.now(),
        listenTime: 0,
        completed: false,
        lastPosition: 0
      };
      const req = this._tx('history', 'readwrite').put(entry);
      req.onsuccess = () => resolve(entry);
      req.onerror = e => reject(e.target.error);
    });
  }

  async updateHistoryEntry(id, data) {
    return new Promise((resolve, reject) => {
      const store = this._tx('history', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) { resolve(); return; }
        const updated = { ...existing, ...data };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = e => reject(e.target.error);
      };
      getReq.onerror = e => reject(e.target.error);
    });
  }

  async getHistory() {
    return new Promise((resolve, reject) => {
      const req = this._tx('history').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
  }

  async deleteHistoryByTrack(trackId) {
    return new Promise((resolve, reject) => {
      const store = this._tx('history', 'readwrite');
      const idx = store.index('trackId');
      const req = idx.openCursor(trackId);
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = e => reject(e.target.error);
    });
  }

  async clearHistory() {
    return new Promise((resolve, reject) => {
      const req = this._tx('history', 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }
}

// === Main DB Manager ===
class MusicDB {
  constructor() {
    this.global = new GlobalDB();
    this.user = null;
    this.currentUserId = null;
  }

  async init() {
    await this.global.init();
  }

  async initUserDB(userId) {
    // Close old connection
    if (this.user) {
      this.user.close();
      this.user = null;
      // Wait for connection to fully close
      await new Promise(r => setTimeout(r, 150));
    }

    this.currentUserId = userId;
    this.user = new UserDB(userId);
    await this.user.init();
  }

  getCurrentUserId() {
    return this.currentUserId;
  }

  // Delegate global methods
  async saveUser(user) { return this.global.saveUser(user); }
  async getUser(id) { return this.global.getUser(id); }
  async getUsers() { return this.global.getUsers(); }
  async saveSetting(key, value) { return this.global.saveSetting(key, value); }
  async getSetting(key) { return this.global.getSetting(key); }

  // Delegate user methods
  async addTrack(track) { return this.user.addTrack(track); }
  async getAllTracks() { return this.user.getAllTracks(); }
  async deleteTrack(id) { return this.user.deleteTrack(id); }
  async clearTracks() { return this.user.clearTracks(); }
  async addPlaylist(playlist) { return this.user.addPlaylist(playlist); }
  async getAllPlaylists() { return this.user.getAllPlaylists(); }
  async deletePlaylist(id) { return this.user.deletePlaylist(id); }
  async clearPlaylists() { return this.user.clearPlaylists(); }
  async addFavorite(trackId) { return this.user.addFavorite(trackId); }
  async removeFavorite(trackId) { return this.user.removeFavorite(trackId); }
  async getAllFavorites() { return this.user.getAllFavorites(); }
  async clearFavorites() { return this.user.clearFavorites(); }
  async addToHistory(trackId) { return this.user.addToHistory(trackId); }
  async updateHistoryEntry(id, data) { return this.user.updateHistoryEntry(id, data); }
  async getHistory() { return this.user.getHistory(); }
  async deleteHistoryByTrack(trackId) { return this.user.deleteHistoryByTrack(trackId); }
  async clearHistory() { return this.user.clearHistory(); }

  async destroyUserDB(userId) {
    return new Promise((resolve, reject) => {
      const name = getUserDBName(userId);
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }
}

window.musicDB = new MusicDB();
