# Three.js Game Template (GameJam-2025)

Lightweight starter template for a browser Three.js game with Mohamed as the controllable character.

Files added:
- `index.html` — loads the game and shows instructions overlay.
- `src/game.js` — ES module: builds the Three.js scene, Mohamed character with animations, pointer-lock controls, and basic physics.
- `assets/mohamed/` — Character model and animation files (idle, walk, run, and more).

How to run locally

1. Use a local HTTP server (browsers block module imports from file://). From the project root run e.g. with Python 3:

```powershell
python -m http.server 8000
```

2. Open your browser at http://localhost:8000

Controls
- Click to lock the pointer.
- W/A/S/D or arrow keys to move.
- Space to jump.
- Mouse to look around while pointer is locked.

Features
- Mohamed character with smooth animation blending (idle, walk, run)
- Character rotates to face movement direction
- Third-person camera that follows the character
- Basic physics with gravity and jumping

Notes and possible improvements
- Add collision detection (currently character can pass through obstacles since only Y collision with ground is handled).
- Add more animations from the assets folder (dead, boxing, dance moves, etc.)
- Add better physics with a library (Cannon.js, Ammo.js, Rapier).
- Add a shift key to toggle between walk and run speeds explicitly.

---

## 📚 Documentation

### Core Documentation
- **[Complete System Overview](documentation/COMPLETE_SYSTEM_OVERVIEW.md)** - Full system architecture and how everything works together
- **[Multiplayer Features](documentation/MULTIPLAYER_FEATURES.md)** - Multiplayer system documentation
- **[README Multiplayer](documentation/README_MULTIPLAYER.md)** - Multiplayer setup and usage guide

### Server Documentation
- **[Go Server README](documentation/README_GO_SERVER.md)** - Go backend server documentation
- **[Flask README](documentation/README_FLASK.md)** - Original Flask server documentation (legacy)

### Performance & Optimization
- **[Network Optimization](documentation/NETWORK_OPTIMIZATION.md)** - Network optimization techniques and implementation
- **[Optimization Visual Guide](documentation/OPTIMIZATION_VISUAL_GUIDE.md)** - Visual diagrams explaining optimizations
- **[Go Metrics Guide](documentation/GO_METRICS_GUIDE.md)** - Go runtime metrics monitoring guide

### Monitoring & Analysis
- **[Monitoring README](monitoring/README.md)** - Monitoring stack setup (Prometheus + Grafana)
- **[Python Analysis Script](monitoring/analyze-metrics.py)** - Advanced metrics analysis tool
- **[Bash Analysis Script](monitoring/analyze-metrics.sh)** - Quick metrics analysis tool

### Quick Links
- 📊 **Grafana Dashboard**: http://localhost:3000 (admin/admin)
- 🔍 **Prometheus**: http://localhost:9090
- 📈 **Metrics Endpoint**: http://localhost:5500/metrics

---

## 🚀 Quick Start

### Development Mode
```bash
# Start the game server
./game-server

# Or with monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d
./game-server
```

### View Documentation
```bash
# Open documentation folder
cd documentation/

# Start with the complete overview
cat COMPLETE_SYSTEM_OVERVIEW.md
```
