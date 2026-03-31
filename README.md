# 🎮 Twine Player

**Twine Player** is a modern desktop application designed to be a standalone way to play Twine games without using your browser.

The desire for this app came from the fact that I wanted a way to play Twine games without using my browser with my personal profile. Part of me was just tired of having any twine games appearing alongside my browser session, and another part got frustrated multiple times with saves being lost due to clearing the browser's local storage, or changing browsers, etc.

With this, I decided to make an app myself so that I can tackle exactly what my pain points were, adding new features as I go to attend my own desires with this app. This lead me to expand the project a bit, with more features appearing as I went along (Yes I cheat a lot, so a easy way to use the Console was a must for me :b )

Before going to the next session with the features, I'll also say that I plan to probably get this same kind of experience to other places as well. As soon as I'm not lazy I'll go and get my Mac to make a mac build as well (sorry), and I have a big desire to make a version of this that runs as an android app as well (mainly because I want to run Twine games on my Quest 3, but I think making it into an APK to sideload on Quest 3 would also benefit Android users in general I guess?).

---

## ✨ Key Features

### 📚 Premium Library Management
- **Visual Library**: A grid-based view of your previously accessed Twine games with automatic metadata extraction.
- **Smart Tracking**: Automatically tracks recently played games and last-played timestamps.

### 🛠️ Advanced Developer Console
A console custom-built for Twine debugging:
- **Autocomplete**: Real-time JavaScript autocomplete.
- **Command Management**: Save frequently used snippets and execute them with a single click.
- **Flexible Layouts**: Switch between an **Overlay** mode (for quick checks) and a **Side-by-side** mode where the console expands next to the game, resizing the window to show both perfectly.
- **Deep Integration**: Automatically hooks into internal Twine engine state so the saved commands are unique per game (IFID detection, story data).

### 💾 Native Save Engine
- **Universal Interceptor**: Intercepts native Twinery "Save to Disk" and "Load from Disk" actions.
- **Automatic Organization**: Saves are neatly organized into game-specific folders automatically, so you never lose a save file again.
- **In-App Manager**: Modern paginated UI to manage multiple save slots directly within the app.

### 🖥️ UI Stuff
- **Pinned Top Bar**: Toggle between a hidden auto-show header and a fixed pinned layout that pushes the game down rather than covering it.

---

## 🚀 Getting Started

### Installation
You can find pre-built binaries for **Windows** and **Linux** in the [releases section](https://github.com/YuuKwn/TwinePlayer/releases).

### Development Mode
If you want to run from source:
1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm start` to launch the application.

### Building from Source
Use Electron Builder commands:
- `npm run build:win` - Windows Installer
- `npm run build:linux` - Linux Tarball
- `npm run build:all` - Both platforms

---

## 📖 Full Documentation

For detailed information on all features, the IPC API reference, architecture overview, and the AI Illustrator setup, see the **[full documentation](docs/documentation.md)**.

---

## 🛠️ Technology Stack
- **Engine**: Electron (Node.js + Chromium)
- **Frontend**: Vanilla HTML5, Advanced CSS3 (Custom Design System), JavaScript (ES6+)
- **Storage**: LocalStorage for history/metadata, Native FS for game saves.

---

## 📜 License
This project is licensed under the ISC License.

---
