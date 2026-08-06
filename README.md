# 🎵 SoundWave

Современный музыкальный плеер с офлайн-поддержкой, пользовательскими аккаунтами и Telegram Mini App.

## 🚀 Возможности

- 🎧 **Воспроизведение** — MP3, WAV, FLAC, M4A, OGG
- 📂 **Библиотека** — загрузка файлов, drag & drop, поиск и сортировка
- 📋 **Плейлисты** — создание, редактирование, удаление
- ❤️ **Избранное** — быстрое добавление треков
- 📊 **История** — отслеживание прослушивания в реальном времени
- 🔐 **Аккаунты** — изоляция данных между пользователями
- 📱 **PWA** — установка на рабочий стол, офлайн-работа
- 🤖 **Telegram Mini App** — встроенная версия для Telegram

## 🌐 Публичный доступ

**Веб-версия:** [https://zn1der-gg.github.io/soundwave/](https://zn1der-gg.github.io/soundwave/)

**Telegram Mini App:** откройте через бота в Telegram

## 🛠 Технологии

- Чистый HTML/CSS/JavaScript (без фреймворков)
- IndexedDB для хранения данных
- Web Audio API для визуализации
- Web Crypto API (SHA-256) для хеширования паролей
- Telegram WebApp API

## 📦 Структура проекта

```
soundwave/
├── index.html          # Основная точка входа (ПК/мобильная версия)
├── tg.html             # Telegram Mini App
├── styles.css          # Основные стили
├── tg.css              # Стили для Telegram
├── app.js              # Логика приложения
├── player.js           # Музыкальный плеер
├── db.js               # IndexedDB (глобальная + пользовательская БД)
├── telegram.js         # Telegram WebApp интеграция
├── tg-init.js          # Инициализация Telegram Mini App
├── manifest.json       # PWA манифест
└── sw.js               # Service Worker
```

## 🚀 Запуск

### Локально

```bash
# Python
python -m http.server 3000


```

Откройте `http://localhost:3000`

