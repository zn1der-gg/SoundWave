// === Telegram Mini App Integration ===
const TelegramApp = {
  webapp: null,
  user: null,
  isTelegram: false,

  init() {
    this.webapp = window.Telegram?.WebApp;
    if (!this.webapp) return false;

    this.isTelegram = true;
    this.user = this.webapp.initDataUnsafe?.user || null;

    // Ready
    this.webapp.ready();

    // Expand to full height
    this.webapp.expand();

    // Setup theme
    this.applyTheme();

    // Setup BackButton
    this.webapp.BackButton.onClick(() => {
      if (typeof navigateTo === 'function') {
        navigateTo('home');
      }
    });

    // Listen for theme changes
    this.webapp.onEvent('themeChanged', () => this.applyTheme());

    // Listen for viewport changes
    this.webapp.onEvent('viewportChanged', (e) => {
      document.documentElement.style.setProperty('--tg-safe-area-top', `${e.isStateStable ? this.webapp.safeAreaInset?.top || 0 : 0}px`);
      document.documentElement.style.setProperty('--tg-safe-area-bottom', `${e.isStateStable ? this.webapp.safeAreaInset?.bottom || 0 : 0}px`);
    });

    return true;
  },

  applyTheme() {
    if (!this.webapp) return;
    const theme = this.webapp.themeParams || {};

    // Map Telegram theme to CSS variables
    const root = document.documentElement;
    if (theme.bg_color) root.style.setProperty('--tg-bg', theme.bg_color);
    if (theme.text_color) root.style.setProperty('--tg-text', theme.text_color);
    if (theme.hint_color) root.style.setProperty('--tg-hint', theme.hint_color);
    if (theme.link_color) root.style.setProperty('--tg-link', theme.link_color);
    if (theme.button_color) root.style.setProperty('--tg-btn', theme.button_color);
    if (theme.button_text_color) root.style.setProperty('--tg-btn-text', theme.button_text_color);
    if (theme.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', theme.secondary_bg_color);

    // Detect dark/light from Telegram
    const isDark = this.webapp.colorScheme === 'dark';
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  },

  // Show/hide BackButton
  showBackButton(show) {
    if (!this.webapp) return;
    if (show) {
      this.webapp.BackButton.show();
    } else {
      this.webapp.BackButton.hide();
    }
  },

  // Haptic feedback
  haptic(type = 'medium') {
    if (!this.webapp?.HapticFeedback) return;
    switch (type) {
      case 'light': this.webapp.HapticFeedback.impactOccurred('light'); break;
      case 'medium': this.webapp.HapticFeedback.impactOccurred('medium'); break;
      case 'heavy': this.webapp.HapticFeedback.impactOccurred('heavy'); break;
      case 'success': this.webapp.HapticFeedback.notificationOccurred('success'); break;
      case 'error': this.webapp.HapticFeedback.notificationOccurred('error'); break;
      default: this.webapp.HapticFeedback.impactOccurred('medium');
    }
  },

  // MainButton
  showMainButton(text, onClick) {
    if (!this.webapp) return;
    this.webapp.MainButton.setText(text);
    this.webapp.MainButton.onClick(onClick);
    this.webapp.MainButton.show();
  },

  hideMainButton() {
    if (!this.webapp) return;
    this.webapp.MainButton.hide();
  },

  // Get Telegram user for auth
  getTelegramUser() {
    return this.user;
  },

  // Close mini app
  close() {
    if (this.webapp) this.webapp.close();
  },

  // Get viewport info
  getViewportHeight() {
    return this.webapp?.viewportHeight || window.innerHeight;
  },

  getSafeAreaInsets() {
    return this.webapp?.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
  }
};

// Auto-init on load
window.TelegramApp = TelegramApp;
