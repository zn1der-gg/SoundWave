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
      console.warn('[TG] No Telegram user data');
      return;
    }

    // Check if already logged in
    if (currentUser) {
      console.log('[TG] Already logged in as', currentUser.name);
      return;
    }

    const userId = 'tg_' + tgUser.id;
    let user = await window.musicDB.getUser(userId);

    if (!user) {
      // Build name from available data
      let name = 'User';
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
      console.log('[TG] Created user:', user.name);
    } else {
      console.log('[TG] Found existing user:', user.name);
    }

    await switchToUser(userId);
    currentUser = user;
    await window.musicDB.saveSetting('currentUser', user);

    renderAll();
  }

  // === Account Linking (PC ↔ Telegram) ===
  // Generate link code on PC, enter in Telegram to sync

  window.generateLinkCode = async function() {
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
    // Show code
    const el = document.getElementById('link-code-display');
    if (el) {
      el.textContent = code;
      el.style.display = 'block';
    }
    showToast('Код создан: ' + code, 'success');
  };

  window.showLinkAccountModal = function() {
    const modal = document.getElementById('tg-link-modal');
    if (modal) modal.classList.add('active');
  };

  window.hideLinkAccountModal = function() {
    const modal = document.getElementById('tg-link-modal');
    if (modal) modal.classList.remove('active');
  };

  window.handleLinkCode = async function() {
    const input = document.getElementById('link-code-input');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code || code.length < 4) {
      showToast('Введите код', 'error');
      return;
    }

    const linkData = await window.musicDB.getSetting('linkCode_' + code);
    if (!linkData) {
      showToast('Код не найден или истёк', 'error');
      return;
    }

    // Found linked account — log into it
    const linkedUser = await window.musicDB.getUser(linkData.userId);
    if (linkedUser) {
      await switchToUser(linkedUser.id);
      currentUser = linkedUser;
      await window.musicDB.saveSetting('currentUser', currentUser);
      renderAll();
      hideLinkAccountModal();
      showToast('Аккаунт привязан! Добро пожаловать, ' + linkedUser.name, 'success');
      // Clean up code
      await window.musicDB.saveSetting('linkCode_' + code, null);
    } else {
      showToast('Аккаунт не найден', 'error');
    }
  };

  // === Theme Toggle ===
  let tgManualTheme = null;

  window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    tgManualTheme = next;
    window.musicDB.saveSetting('tg_theme', next);
    updateThemeUI(next);

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
    } else if (isTelegram) {
      window.TelegramApp.applyTheme();
    }
  }

  function updateThemeUI(theme) {
    const label = document.getElementById('theme-label');
    if (label) label.textContent = theme === 'dark' ? '🌙 Тёмная тема' : '☀️ Светлая тема';
  }

  // Override navigateTo
  const originalNavigateTo = window.navigateTo;
  window.navigateTo = function(page, data) {
    if (originalNavigateTo) originalNavigateTo(page, data);

    document.querySelectorAll('.tg-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.page === page);
    });

    if (window.TelegramApp?.isTelegram) {
      window.TelegramApp.showBackButton(page === 'playlist-detail');
      window.TelegramApp.haptic('light');
    }

    if (page === 'account') {
      const saved = tgManualTheme || document.documentElement.getAttribute('data-theme');
      if (saved) updateThemeUI(saved);
      updateAccountLinkUI();
    }
  };

  function updateAccountLinkUI() {
    const linkSection = document.getElementById('tg-link-section');
    if (!linkSection) return;
    if (currentUser && !currentUser.isTelegram) {
      // PC user logged in on Telegram — show link code
      linkSection.style.display = 'block';
      generateLinkCode();
    } else if (currentUser && currentUser.isTelegram) {
      // Telegram user — show option to link PC account
      linkSection.style.display = 'block';
    }
  }

  // Disable sidebar functions
  window.toggleSidebar = function() {};
  window.closeSidebar = function() {};
  window.handleSidebarUserClick = function() { navigateTo('account'); };

  // DOM ready
  document.addEventListener('DOMContentLoaded', async () => {
    if (isTelegram) {
      loadTgTheme();
    }

    // WAIT for app.js to finish initializing DB and loading settings
    await window._appReady;
    console.log('[TG] App ready, running auto-login...');

    // Now currentUser is loaded from settings (if saved)
    await tgAutoLogin();
  });

})();
