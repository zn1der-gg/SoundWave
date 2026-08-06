// === Telegram Mini App Initialization ===
(function() {
  const isTelegram = window.TelegramApp?.init() || false;

  if (!isTelegram) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div style="position:fixed;top:0;left:0;right:0;background:#6c5ce7;color:#fff;text-align:center;padding:12px;z-index:9999;font-size:13px;">
        Telegram Mini App версия. Откройте через Telegram бот.
      </div>
    `);
  }

  // Auto-login with Telegram user
  async function tgAutoLogin() {
    if (!isTelegram) return;

    const tgUser = window.TelegramApp.getTelegramUser();
    if (!tgUser) {
      console.warn('[TG] No Telegram user data available');
      return;
    }

    // Check if already logged in
    if (currentUser) {
      console.log('[TG] Already logged in as', currentUser.name);
      return;
    }

    // Find existing Telegram user in DB
    const userId = 'tg_' + tgUser.id;
    let user = await window.musicDB.getUser(userId);

    if (!user) {
      // Build name from available data
      let name = '';
      if (tgUser.first_name && tgUser.last_name) {
        name = tgUser.first_name + ' ' + tgUser.last_name;
      } else if (tgUser.first_name) {
        name = tgUser.first_name;
      } else if (tgUser.last_name) {
        name = tgUser.last_name;
      } else if (tgUser.username) {
        name = '@' + tgUser.username;
      } else {
        name = 'User ' + tgUser.id;
      }

      // Create new user
      user = {
        id: userId,
        name: name.trim(),
        email: '',
        passwordHash: '',
        createdAt: Date.now(),
        telegramId: tgUser.id,
        telegramUsername: tgUser.username || '',
        isTelegram: true
      };
      await window.musicDB.saveUser(user);
      console.log('[TG] Created new user:', user.name);
    } else {
      console.log('[TG] Found existing user:', user.name);
    }

    // Switch to this user's DB
    await switchToUser(userId);
    currentUser = user;
    await window.musicDB.saveSetting('currentUser', user);

    renderAll();
  }

  // === Theme Toggle ===
  let tgManualTheme = null;

  window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    tgManualTheme = next;
    window.musicDB.saveSetting('tg_theme', next);
    updateThemeUI(next);

    // Update toggle button
    const btn = document.getElementById('tg-theme-toggle');
    if (btn) {
      btn.querySelector('.theme-label').textContent = next === 'dark' ? '🌙 Тёмная тема' : '☀️ Светлая тема';
    }

    // Haptic feedback
    if (window.TelegramApp?.isTelegram) {
      window.TelegramApp.haptic('light');
    }
  };

  async function loadTgTheme() {
    const saved = await window.musicDB.getSetting('tg_theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      tgManualTheme = saved;
      updateThemeUI(saved);
    } else {
      // Use Telegram theme by default
      if (isTelegram) {
        window.TelegramApp.applyTheme();
      }
    }
  }

  function updateThemeUI(theme) {
    const label = document.getElementById('theme-label');
    if (label) label.textContent = theme === 'dark' ? '🌙 Тёмная тема' : '☀️ Светлая тема';
  }

  // Override navigateTo to update bottom tabs
  const originalNavigateTo = window.navigateTo;
  window.navigateTo = function(page, data) {
    if (originalNavigateTo) originalNavigateTo(page, data);

    // Update bottom tabs
    document.querySelectorAll('.tg-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.page === page);
    });

    // Show/hide BackButton in Telegram
    if (window.TelegramApp?.isTelegram) {
      const showBack = page === 'playlist-detail';
      window.TelegramApp.showBackButton(showBack);
    }

    // Haptic feedback on navigation
    if (window.TelegramApp?.isTelegram) {
      window.TelegramApp.haptic('light');
    }

    // Update theme label on account page
    if (page === 'account') {
      const saved = tgManualTheme || document.documentElement.getAttribute('data-theme');
      if (saved) updateThemeUI(saved);
    }
  };

  // Disable sidebar functions (not used in Telegram)
  window.toggleSidebar = function() {};
  window.closeSidebar = function() {};

  window.handleSidebarUserClick = function() {
    navigateTo('account');
  };

  // DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Apply theme
    if (isTelegram) {
      loadTgTheme();
    }

    // Auto-login after DB is ready — wait longer for app.js init
    setTimeout(() => tgAutoLogin(), 800);
  });

})();
