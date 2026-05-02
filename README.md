## Space Pirates (MVP)

Mobile-friendly browser management sim prototype built with HTML/CSS/JavaScript.

### Run

Open `./index.html` in a browser.

> Note: the game uses extracted PNG sprites from the included sprite sheet for ships, structures, and reaction icons.

### Controls

- Tap a building to open its full-screen upgrade/details panel (simulation pauses)
- Tap ring button (bottom-left) to open full-screen Build/Statistics menu (simulation pauses)
- Choose a build option, then tap the map to place
- Tap an existing structure while placement is armed to inspect or upgrade it instead of placing over it
- Drag to pan
- Pinch (or wheel on desktop) to zoom

### MVP Features Included

- Right-side top-to-bottom traffic lane with ship classes (small/medium/large)
- Gold economy with top-right HUD display
- Pirate Base auto-raiding with 3 upgrade levels and ship-class gating
- Quantum route connectivity system (buildings only function when connected)
- Left-side merchant arrivals that roam toward connected markets, with optional trade beacons improving traffic
- Mecha-Kraken spawn/roam/despawn and traffic suppression
- Monster Hunter Base automatic kraken response
- Bottom ticker hints
- Bottom-left ring menu with Build and Statistics sections
- Full-screen paused menus for build/statistics and upgrades
- Icon thought bubbles for ships/merchants/krakens/hunters/buildings
- Local save/load via `localStorage`
- Uses extracted sprite-sheet PNGs for core entity rendering and reaction bubbles
