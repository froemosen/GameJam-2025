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
