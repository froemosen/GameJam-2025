# Multiplayer MMO Features

## Animation Keybinds

Press these keys to trigger special Mohamed animations:

- **F** - Agree Gesture (thumbs up/nodding)
- **G** - All Night Dance (dance animation)
- **H** - Boom Dance (explosive dance move)
- **J** - Boxing Practice (boxing moves)
- **K** - Dead (fall down/death animation)
- **L** - Skill (special skill animation)

## Movement Controls (unchanged)

- **W / ↑** - Move forward
- **A / ←** - Move left
- **S / ↓** - Move backward
- **D / →** - Move right
- **Shift** - Sprint
- **Space** - Jump
- **E** - Toggle cinema mode (interact with screens)
- **Esc** - Exit cinema mode

## Sound Synchronization

When you trigger an animation with F, G, H, J, K, or L:
- A sound effect plays from your character's position
- Other players hear the sound from your location using 3D positional audio
- The sound gets quieter as players move further away
- All sounds are synchronized across the multiplayer session

## Custom Sounds

You can replace the placeholder sounds in `assets/sounds/` with your own:
- `agree.wav`, `dance.wav`, `boom.wav`, `boxing.wav`, `dead.wav`, `skill.wav`
- Supported formats: WAV, MP3, M4A
- Recommended: Short sound effects (1-3 seconds)

## Technical Details

- Animations are loaded from `assets/mohamed/Animation_*_withSkin.glb`
- Sounds use THREE.js PositionalAudio for 3D spatial audio
- Server broadcasts sound events to all connected players
- Remote players automatically load all 10 animations (4 movement + 6 special)
- Sound files are loaded on-demand when triggered

## Multiplayer

- All animations are synchronized across players
- Other players see your animations in real-time
- Sounds are heard from the correct player position
- Up to 20 updates per second for smooth synchronization
