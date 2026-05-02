## Space Pirates (MVP)

Mobile-friendly browser management sim prototype built with HTML/CSS/JavaScript.

### Run

Open `./index.html` in a browser.

> Note: the game loads sprites from the provided external GitHub asset URL; if CORS blocks that URL in your environment, the game automatically falls back to simple vector shapes.

### Controls

- Tap a building to open its full-screen upgrade/details panel (simulation pauses)
- Tap ring button (bottom-left) to open full-screen Build/Statistics menu (simulation pauses)
- Choose a build option, then tap the map to place
- Drag to pan
- Pinch (or wheel on desktop) to zoom

### MVP Features Included

- Right-side top-to-bottom traffic lane with ship classes (small/medium/large)
- Gold economy with top-right HUD display
- Pirate Base auto-raiding with 3 upgrade levels and ship-class gating
- Quantum route connectivity system (buildings only function when connected)
- Dock + Market merchant loop with shopping and flee behavior
- Mecha-Kraken spawn/roam/despawn and traffic suppression
- Monster Hunter Base automatic kraken response
- Bottom ticker hints
- Bottom-left ring menu with Build and Statistics sections
- Full-screen paused menus for build/statistics and upgrades
- Icon thought bubbles for ships/merchants/krakens/hunters/buildings
- Local save/load via `localStorage`
- Uses the provided sprite sheet URL for core entity rendering with fallback shapes
