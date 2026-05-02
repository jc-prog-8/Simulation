(() => {
  const SAVE_KEY = "space_pirates_save_v2";
  const WORLD_W = 2200;
  const WORLD_H = 1600;
  const TRAFFIC_X = 1800;
  const LINK_RANGE = 190;
  const MAX_RENDER_DPR = 2;
  const UPGRADE_COST_MULTIPLIER = 1.8;
  const MAX_DELTA_TIME = 0.05;

  const BUILDING_TYPES = {
    route: { id: "route", name: "Quantum Route Node", role: "Extends station network connectivity.", cost: 20, maxLevel: 1, radius: 12, connectable: true, color: "#38d7ff" },
    pirate: { id: "pirate", name: "Pirate Base", role: "Auto-raids nearby traffic when connected.", cost: 120, maxLevel: 3, radius: 42, connectable: true, color: "#9143ff", upgradeCost: [0, 160, 330] },
    dock: { id: "dock", name: "Dock Pad", role: "Merchants arrive and depart from here.", cost: 90, maxLevel: 2, radius: 46, connectable: true, color: "#2d8cff", upgradeCost: [0, 120] },
    market: { id: "market", name: "Market Stall", role: "Generates gold when merchants shop.", cost: 140, maxLevel: 3, radius: 36, connectable: true, color: "#52e0ff", upgradeCost: [0, 170, 360] },
    hunter: { id: "hunter", name: "Monster Hunter Base", role: "Dispatches hunters to remove Mecha-Krakens.", cost: 210, maxLevel: 3, radius: 42, connectable: true, color: "#ff6f8f", upgradeCost: [0, 240, 420] },
  };

  const SHIP_CLASSES = [
    { id: "small", speed: 84, reward: 16, weight: 0.66 },
    { id: "medium", speed: 64, reward: 40, weight: 0.26 },
    { id: "large", speed: 45, reward: 90, weight: 0.08 },
  ];

  const TICKER_MESSAGES = [
    "Connected buildings glow brighter. Unpowered structures do nothing.",
    "Level 2 Pirate Bases can raid medium traffic.",
    "Merchants avoid stations with active Kraken sightings.",
    "Krakens also thin out traffic in nearby trade lanes.",
    "Build shops to earn gold from visitors, not just raids.",
    "Monster Hunter Bases keep trade lanes calm.",
  ];

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const tickerEl = document.getElementById("ticker");
  const goldEl = document.getElementById("gold-value");
  const menuBtn = document.getElementById("menu-button");
  const menuOverlay = document.getElementById("overlay-menu");
  const upgradeOverlay = document.getElementById("overlay-upgrade");
  const buildOptionsEl = document.getElementById("build-options");
  const statsListEl = document.getElementById("stats-list");
  const statsGraphEl = document.getElementById("stats-graph");

  const ui = { menuOpen: false, tab: "build", selected: null, placementMode: null, tickerIndex: 0, tickerTimer: 0 };

  const state = {
    gold: 420,
    buildings: [],
    ships: [],
    merchants: [],
    krakens: [],
    hunters: [],
    raiders: [],
    stats: { raidGold: 0, merchantGold: 0, raids: 0, merchantVisits: 0, merchantFlee: 0, krakenIncidents: 0, shipsMissed: 0 },
    statsHistory: [],
    elapsed: 0,
    timers: { ship: 0, merchant: 0, kraken: 0, save: 0 },
  };

  const camera = { x: 0, y: 0, zoom: 1, dragging: false, dragStartX: 0, dragStartY: 0, startX: 0, startY: 0 };
  const touchState = { pointers: new Map(), pinchStartDist: 0, pinchStartZoom: 1 };
  let lastTs = performance.now();
  let idSeq = 1;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const snap = (v) => Math.round(v / 24) * 24;
  const nextId = (prefix) => `${prefix}_${++idSeq}`;
  const worldToScreen = (x, y) => ({ x: (x - camera.x) * camera.zoom, y: (y - camera.y) * camera.zoom });
  const screenToWorld = (x, y) => ({ x: x / camera.zoom + camera.x, y: y / camera.zoom + camera.y });
  const isPaused = () => ui.menuOpen || !upgradeOverlay.classList.contains("hidden");
  const activeBuildings = (type) => state.buildings.filter((b) => b.type === type && b.connected);

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnInitialBuildings() {
    state.buildings = [];
  }

  function setTicker(msg) {
    tickerEl.textContent = msg;
    ui.tickerTimer = 0;
  }

  function placeBuilding(typeId, x, y, free = false) {
    const def = BUILDING_TYPES[typeId];
    if (!def) return false;
    if (!free && state.gold < def.cost) {
      setTicker("Not enough gold.");
      return false;
    }
    state.buildings.push({
      id: nextId("b"),
      type: typeId,
      x: snap(clamp(x, 40, WORLD_W - 40)),
      y: snap(clamp(y, 40, WORLD_H - 40)),
      level: 1,
      cooldown: 0,
      connected: false,
      thought: null,
      thoughtTimer: 0,
    });
    if (!free) state.gold -= def.cost;
    updateConnectivity();
    return true;
  }

  function openMenu() {
    ui.menuOpen = true;
    menuOverlay.classList.remove("hidden");
    renderBuildOptions();
    renderStats();
  }

  function closeMenu() {
    ui.menuOpen = false;
    menuOverlay.classList.add("hidden");
  }

  function setTab(tab) {
    ui.tab = tab;
    document.getElementById("build-tab").classList.toggle("hidden", tab !== "build");
    document.getElementById("stats-tab").classList.toggle("hidden", tab !== "stats");
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  }

  function renderBuildOptions() {
    buildOptionsEl.innerHTML = "";
    Object.values(BUILDING_TYPES).forEach((def) => {
      const btn = document.createElement("button");
      btn.className = "build-btn";
      btn.innerHTML = `<strong>${def.name}</strong><br>${def.role}<span class="cost">Cost: ${def.cost}</span>`;
      btn.addEventListener("click", () => {
        ui.placementMode = def.id;
        closeMenu();
        setTicker(`Tap valid space to place ${def.name}.`);
      });
      buildOptionsEl.appendChild(btn);
    });
  }

  function renderStats() {
    const connectedCount = state.buildings.filter((b) => b.connected).length;
    const lines = [
      ["Gold", Math.floor(state.gold)],
      ["Raid income", Math.floor(state.stats.raidGold)],
      ["Merchant income", Math.floor(state.stats.merchantGold)],
      ["Successful raids", state.stats.raids],
      ["Merchant visits", state.stats.merchantVisits],
      ["Merchant flees", state.stats.merchantFlee],
      ["Kraken incidents", state.stats.krakenIncidents],
      ["Missed ships", state.stats.shipsMissed],
      ["Connected structures", connectedCount],
      ["Active krakens", state.krakens.length],
    ];
    statsListEl.innerHTML = lines.map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("");
    drawStatsGraph();
  }

  function recordStatsHistory(dt, force = false) {
    state.elapsed += dt;
    const interval = 1.5;
    if (!force && state.elapsed < interval) return;
    const sample = {
      t: (state.statsHistory[state.statsHistory.length - 1]?.t ?? 0) + state.elapsed,
      gold: state.gold,
      raidGold: state.stats.raidGold,
      merchantGold: state.stats.merchantGold,
    };
    state.statsHistory.push(sample);
    if (state.statsHistory.length > 160) state.statsHistory.shift();
    state.elapsed = 0;
  }

  function drawStatsGraph() {
    if (!statsGraphEl) return;
    const gctx = statsGraphEl.getContext("2d");
    const w = statsGraphEl.width;
    const h = statsGraphEl.height;
    gctx.clearRect(0, 0, w, h);
    gctx.fillStyle = "#0a1840";
    gctx.fillRect(0, 0, w, h);

    const hist = state.statsHistory;
    if (hist.length < 2) {
      gctx.fillStyle = "#9db9ff";
      gctx.font = "14px sans-serif";
      gctx.textAlign = "center";
      gctx.textBaseline = "middle";
      gctx.fillText("Graphs will appear as the simulation runs.", w / 2, h / 2);
      return;
    }

    const left = 42;
    const right = 10;
    const top = 12;
    const bottom = 26;
    const pw = w - left - right;
    const ph = h - top - bottom;
    const maxY = Math.max(1, ...hist.map((p) => Math.max(p.gold, p.raidGold, p.merchantGold)));

    gctx.strokeStyle = "rgba(146,175,255,0.3)";
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(left, top);
    gctx.lineTo(left, h - bottom);
    gctx.lineTo(w - right, h - bottom);
    gctx.stroke();

    gctx.fillStyle = "#8fb0ff";
    gctx.font = "11px sans-serif";
    gctx.textAlign = "right";
    gctx.fillText("0", left - 6, h - bottom);
    gctx.fillText(Math.floor(maxY).toLocaleString(), left - 6, top + 2);

    const drawSeries = (key, color) => {
      gctx.strokeStyle = color;
      gctx.lineWidth = 2;
      gctx.beginPath();
      for (let i = 0; i < hist.length; i += 1) {
        const p = hist[i];
        const x = left + (i / (hist.length - 1)) * pw;
        const y = top + (1 - p[key] / maxY) * ph;
        if (i === 0) gctx.moveTo(x, y);
        else gctx.lineTo(x, y);
      }
      gctx.stroke();
    };

    drawSeries("gold", "#ffd548");
    drawSeries("raidGold", "#c084ff");
    drawSeries("merchantGold", "#5de7ff");

    const legends = [["Gold", "#ffd548"], ["Raid", "#c084ff"], ["Merchant", "#5de7ff"]];
    gctx.font = "11px sans-serif";
    gctx.textAlign = "left";
    legends.forEach(([name, color], i) => {
      const lx = left + i * 110;
      const ly = h - 10;
      gctx.fillStyle = color;
      gctx.fillRect(lx, ly - 8, 10, 3);
      gctx.fillStyle = "#dbe8ff";
      gctx.fillText(name, lx + 14, ly - 2);
    });
  }

  function cycleTicker(dt) {
    ui.tickerTimer += dt;
    if (ui.tickerTimer < 7) return;
    ui.tickerTimer = 0;
    ui.tickerIndex = (ui.tickerIndex + 1) % TICKER_MESSAGES.length;
    tickerEl.textContent = TICKER_MESSAGES[ui.tickerIndex];
  }

  function weightedShipType() {
    const n = Math.random();
    let acc = 0;
    for (const cls of SHIP_CLASSES) {
      acc += cls.weight;
      if (n <= acc) return cls;
    }
    return SHIP_CLASSES[0];
  }

  const trafficSuppression = () => clamp(1 - state.krakens.length * 0.2, 0.42, 1);
  const shipClassIndex = (id) => (id === "small" ? 1 : id === "medium" ? 2 : 3);
  const pirateCooldown = (base) => clamp(3.2 - base.level * 0.75, 1, 3.2);
  const pirateRange = (base) => 220 + base.level * 55;
  const krakenNear = (pos, r) => state.krakens.some((k) => dist(k, pos) < r);

  function spawnShip() {
    const cls = weightedShipType();
    state.ships.push({
      id: nextId("ship"),
      classId: cls.id,
      x: TRAFFIC_X + rand(-32, 32),
      y: -40,
      speed: cls.speed,
      reward: cls.reward,
      raided: false,
      targeted: false,
      thought: null,
      thoughtTimer: 0,
    });
  }

  function spawnMerchant() {
    const docks = activeBuildings("dock");
    const markets = activeBuildings("market");
    if (!docks.length || !markets.length) return;
    const dock = docks[Math.floor(Math.random() * docks.length)];
    const target = markets[Math.floor(Math.random() * markets.length)];
    state.merchants.push({
      id: nextId("merchant"),
      x: dock.x,
      y: dock.y,
      homeDockId: dock.id,
      shopId: target.id,
      state: "toShop",
      speed: 48,
      timer: 0,
      thought: "💳",
      thoughtTimer: 0.8,
    });
  }

  function spawnKraken() {
    state.krakens.push({
      id: nextId("kraken"),
      x: rand(720, WORLD_W - 160),
      y: rand(180, WORLD_H - 180),
      vx: rand(-16, 16),
      vy: rand(-16, 16),
      radius: 240,
      ttl: rand(26, 38),
      thought: "🐙",
      thoughtTimer: 1000,
    });
    state.stats.krakenIncidents += 1;
    setTicker("Mecha-Kraken sighted. Merchants are getting nervous.");
  }

  function launchHunter(base, target) {
    base.cooldown = Math.max(8 - base.level * 1.5, 3.2);
    state.hunters.push({
      id: nextId("hunter"),
      x: base.x,
      y: base.y,
      targetId: target.id,
      speed: 140 + base.level * 28,
      thought: "🎯",
      thoughtTimer: 1000,
    });
  }

  function updateConnectivity() {
    const nodes = state.buildings.filter((b) => BUILDING_TYPES[b.type].connectable);
    nodes.forEach((n) => (n.connected = false));
    const roots = nodes.filter((n) => n.type === "route");
    if (!roots.length) return;
    const queue = [roots[0]];
    const visited = new Set();
    while (queue.length) {
      const n = queue.shift();
      if (visited.has(n.id)) continue;
      visited.add(n.id);
      n.connected = true;
      for (const other of nodes) if (!visited.has(other.id) && dist(n, other) <= LINK_RANGE) queue.push(other);
    }
  }

  function getUpgradeInfo(building) {
    const def = BUILDING_TYPES[building.type];
    if (building.level >= def.maxLevel) return { canUpgrade: false, cost: 0, benefit: "Max level reached." };
    const cost = def.upgradeCost?.[building.level] ?? Math.round(def.cost * UPGRADE_COST_MULTIPLIER * building.level);
    let benefit = "Improved output.";
    if (building.type === "pirate") benefit = building.level === 1 ? "Unlock medium ship raids. Better range and faster attacks." : "Unlock large ship raids. Better range and fastest attacks.";
    if (building.type === "market") benefit = "Higher merchant spending and attraction.";
    if (building.type === "hunter") benefit = building.level === 1 ? "Larger kraken response radius and faster hunter craft." : "Sector-wide kraken detection and max hunter speed.";
    if (building.type === "dock") benefit = "Higher merchant arrival reliability.";
    return { canUpgrade: true, cost, benefit };
  }

  function openUpgrade(building) {
    ui.selected = building;
    const def = BUILDING_TYPES[building.type];
    const info = getUpgradeInfo(building);
    document.getElementById("upgrade-title").textContent = def.name;
    document.getElementById("upgrade-role").textContent = def.role;
    document.getElementById("upgrade-level").textContent = `Current level: ${building.level}`;
    document.getElementById("upgrade-benefit").textContent = `Next benefits: ${info.benefit}`;
    document.getElementById("upgrade-cost").textContent = info.canUpgrade ? `Upgrade cost: ${info.cost} gold` : "No further upgrades.";
    document.getElementById("upgrade-buy").disabled = !info.canUpgrade;
    upgradeOverlay.classList.remove("hidden");
  }

  function closeUpgrade() {
    ui.selected = null;
    upgradeOverlay.classList.add("hidden");
  }

  function upgradeSelected() {
    const b = ui.selected;
    if (!b) return;
    const info = getUpgradeInfo(b);
    if (!info.canUpgrade) return;
    if (state.gold < info.cost) return setTicker("Not enough gold for upgrade.");
    state.gold -= info.cost;
    b.level += 1;
    setTicker(`${BUILDING_TYPES[b.type].name} upgraded to level ${b.level}.`);
    openUpgrade(b);
  }

  function attackShip(base) {
    if (!base.connected || base.cooldown > 0) return;
    const maxClass = base.level;
    let candidate = null;
    let best = Infinity;
    for (const ship of state.ships) {
      if (ship.raided || ship.targeted || shipClassIndex(ship.classId) > maxClass) continue;
      const d = dist(base, ship);
      if (d <= pirateRange(base) && d < best) {
        candidate = ship;
        best = d;
      }
    }
    if (!candidate) return;
    candidate.targeted = true;
    candidate.thought = "❗";
    candidate.thoughtTimer = 0.8;
    base.cooldown = pirateCooldown(base);
    base.thought = "⚡";
    base.thoughtTimer = 0.7;
    state.raiders.push({
      id: nextId("raider"),
      x: base.x,
      y: base.y,
      originId: base.id,
      targetId: candidate.id,
      speed: 180 + base.level * 26,
      reward: candidate.reward + (base.level - 1) * 5,
      state: "toTarget",
      thought: "☠",
      thoughtTimer: 0.8,
    });
  }

  function updateSimulation(dt) {
    recordStatsHistory(dt);
    for (const b of state.buildings) {
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.thoughtTimer > 0) b.thoughtTimer -= dt;
      if (b.thoughtTimer <= 0) b.thought = null;
    }

    state.timers.ship -= dt;
    if (state.timers.ship <= 0) {
      spawnShip();
      state.timers.ship = rand(1.25, 2.4) / trafficSuppression();
    }

    state.timers.merchant -= dt;
    const dockCount = activeBuildings("dock").length;
    const marketCount = activeBuildings("market").length;
    if (state.timers.merchant <= 0 && dockCount && marketCount) {
      if (Math.random() < clamp(0.8 - state.krakens.length * 0.18, 0.2, 0.9)) spawnMerchant();
      state.timers.merchant = clamp(8 - marketCount * 0.6, 3.5, 8.5);
    }

    state.timers.kraken -= dt;
    if (state.timers.kraken <= 0) {
      spawnKraken();
      state.timers.kraken = rand(32, 55);
    }

    state.ships = state.ships.filter((ship) => {
      ship.y += ship.speed * dt;
      if (ship.thoughtTimer > 0) ship.thoughtTimer -= dt;
      if (ship.thoughtTimer <= 0) ship.thought = null;
      if (krakenNear(ship, 220) && Math.random() < 0.007) {
        ship.thought = "⚠";
        ship.thoughtTimer = 0.8;
      }
      if (ship.y > WORLD_H + 80) {
        if (!ship.raided) state.stats.shipsMissed += 1;
        return false;
      }
      return !ship.raided;
    });

    for (const base of activeBuildings("pirate")) attackShip(base);

    state.raiders = state.raiders.filter((r) => {
      const origin = state.buildings.find((b) => b.id === r.originId);
      if (!origin) return false;
      if (r.state === "toTarget") {
        const target = state.ships.find((s) => s.id === r.targetId);
        if (!target || target.raided) {
          r.state = "return";
        } else {
          const dx = target.x - r.x;
          const dy = target.y - r.y;
          const d = Math.hypot(dx, dy) || 1;
          r.x += (dx / d) * r.speed * dt;
          r.y += (dy / d) * r.speed * dt;
          if (d < 20) {
            target.raided = true;
            target.targeted = false;
            target.thought = "☠";
            target.thoughtTimer = 0.8;
            state.gold += r.reward;
            state.stats.raidGold += r.reward;
            state.stats.raids += 1;
            r.state = "return";
            r.thought = "💰";
            r.thoughtTimer = 0.7;
          }
        }
      }
      if (r.state === "return") {
        const dx = origin.x - r.x;
        const dy = origin.y - r.y;
        const d = Math.hypot(dx, dy) || 1;
        r.x += (dx / d) * r.speed * dt;
        r.y += (dy / d) * r.speed * dt;
        if (d < 14) return false;
      }
      if (r.thoughtTimer > 0) r.thoughtTimer -= dt;
      if (r.thoughtTimer <= 0) r.thought = null;
      return true;
    });

    state.krakens = state.krakens.filter((k) => {
      k.ttl -= dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (Math.random() < 0.02) {
        k.vx += rand(-12, 12);
        k.vy += rand(-12, 12);
      }
      k.vx = clamp(k.vx, -42, 42);
      k.vy = clamp(k.vy, -42, 42);
      if (k.x < 120 || k.x > WORLD_W - 120) k.vx *= -1;
      if (k.y < 120 || k.y > WORLD_H - 120) k.vy *= -1;
      return k.ttl > 0;
    });

    for (const hunterBase of activeBuildings("hunter")) {
      if (hunterBase.cooldown > 0 || !state.krakens.length) continue;
      const range = hunterBase.level >= 3 ? 9999 : 280 + hunterBase.level * 130;
      const candidates = state.krakens.filter((k) => dist(k, hunterBase) <= range);
      if (!candidates.length) continue;
      const target = candidates.reduce((a, b) => (dist(a, hunterBase) < dist(b, hunterBase) ? a : b));
      launchHunter(hunterBase, target);
    }

    state.hunters = state.hunters.filter((h) => {
      const target = state.krakens.find((k) => k.id === h.targetId);
      if (!target) return false;
      const dx = target.x - h.x;
      const dy = target.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      h.x += (dx / d) * h.speed * dt;
      h.y += (dy / d) * h.speed * dt;
      if (d < 22) {
        state.krakens = state.krakens.filter((k) => k.id !== target.id);
        setTicker("Hunter craft neutralized a Mecha-Kraken.");
        return false;
      }
      return true;
    });

    state.merchants = state.merchants.filter((m) => {
      const shop = state.buildings.find((b) => b.id === m.shopId);
      const dock = state.buildings.find((b) => b.id === m.homeDockId);
      if (!shop || !dock || !shop.connected || !dock.connected) return false;
      if (krakenNear(m, 230) && m.state !== "flee") {
        m.state = "flee";
        m.thought = "😱";
        m.thoughtTimer = 1.3;
        state.stats.merchantFlee += 1;
      }
      let target = null;
      if (m.state === "toShop") target = shop;
      if (m.state === "leaving") target = dock;
      if (m.state === "flee") target = { x: 260, y: m.y - 120 };
      if (m.state === "shopping") {
        m.timer -= dt;
        if (m.timer <= 0) {
          const spend = 18 + shop.level * 14;
          state.gold += spend;
          state.stats.merchantGold += spend;
          state.stats.merchantVisits += 1;
          m.state = "leaving";
          m.thought = "💰";
          m.thoughtTimer = 1;
        }
      } else {
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        const d = Math.hypot(dx, dy) || 1;
        m.x += (dx / d) * m.speed * dt;
        m.y += (dy / d) * m.speed * dt;
        if (d < 18) {
          if (m.state === "toShop") {
            m.state = "shopping";
            m.timer = 2.2;
            m.thought = "🛍";
            m.thoughtTimer = 1;
          } else if (m.state === "leaving" || m.state === "flee") {
            return false;
          }
        }
      }
      if (m.thoughtTimer > 0) m.thoughtTimer -= dt;
      if (m.thoughtTimer <= 0 && m.state !== "shopping") m.thought = null;
      return true;
    });

    state.timers.save -= dt;
    if (state.timers.save <= 0) {
      saveGame();
      state.timers.save = 5;
    }
    updateConnectivity();
  }

  function drawThought(entity, icon, yOffset = -42) {
    if (!icon) return;
    const p = worldToScreen(entity.x, entity.y + yOffset);
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1f3875";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0f1d45";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, p.x, p.y + 0.5);
  }

  function drawSpriteOrFallback(type, x, y, w, h, fallbackColor) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(w / 100, h / 100);

    if (type === "shipSmall" || type === "shipMedium" || type === "shipLarge") {
      const hullColor = type === "shipSmall" ? "#5aa8ff" : type === "shipMedium" ? "#9e74ff" : "#ffc86c";
      ctx.fillStyle = hullColor;
      ctx.beginPath();
      ctx.moveTo(44, -26);
      ctx.lineTo(-40, -18);
      ctx.lineTo(-48, 0);
      ctx.lineTo(-40, 18);
      ctx.lineTo(44, 26);
      ctx.lineTo(50, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(238, 248, 255, 0.9)";
      ctx.beginPath();
      ctx.ellipse(10, 0, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(70, 20, 110, 0.35)";
      ctx.fillRect(-28, -3, 30, 6);
    } else if (type === "pirate") {
      ctx.fillStyle = "#8e43ff";
      ctx.fillRect(-42, -24, 84, 48);
      ctx.fillStyle = "#d9a3ff";
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.lineTo(26, -8);
      ctx.lineTo(-26, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1d0f35";
      ctx.fillRect(-16, -8, 32, 16);
    } else if (type === "dock") {
      ctx.fillStyle = "#3b9bff";
      ctx.fillRect(-46, -22, 92, 44);
      ctx.fillStyle = "#92d8ff";
      ctx.fillRect(-30, -10, 60, 20);
      ctx.fillStyle = "#163f82";
      ctx.fillRect(-8, -28, 16, 56);
    } else if (type === "market") {
      ctx.fillStyle = "#37d9ff";
      ctx.fillRect(-40, -20, 80, 40);
      ctx.fillStyle = "#b7fbff";
      ctx.beginPath();
      ctx.moveTo(-46, -6);
      ctx.lineTo(46, -6);
      ctx.lineTo(34, -26);
      ctx.lineTo(-34, -26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1f4f82";
      ctx.fillRect(-10, -2, 20, 18);
    } else if (type === "hunter") {
      ctx.fillStyle = "#ff7396";
      ctx.fillRect(-42, -22, 84, 44);
      ctx.fillStyle = "#ffd2e0";
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(22, -10);
      ctx.lineTo(-22, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#732340";
      ctx.fillRect(-6, -10, 12, 30);
    } else if (type === "kraken") {
      ctx.fillStyle = "rgba(159, 98, 255, 0.92)";
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * 20, Math.sin(angle) * 20 + 16, 12, 26, angle * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ab6eff";
      ctx.beginPath();
      ctx.ellipse(0, -8, 32, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0d6ff";
      ctx.beginPath();
      ctx.arc(-10, -12, 4, 0, Math.PI * 2);
      ctx.arc(10, -12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4e2f73";
      ctx.fillRect(-10, -2, 20, 4);
    } else {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(-50, -50, 100, 100);
    }
    ctx.restore();
  }

  function drawBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#09112a");
    grad.addColorStop(0.5, "#172453");
    grad.addColorStop(1, "#251a54");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const laneTop = worldToScreen(TRAFFIC_X - 110, 0);
    const laneBottom = worldToScreen(TRAFFIC_X + 110, WORLD_H);
    ctx.fillStyle = "rgba(80, 130, 255, 0.14)";
    ctx.fillRect(laneTop.x, laneTop.y, laneBottom.x - laneTop.x, laneBottom.y - laneTop.y);
    ctx.strokeStyle = "rgba(70, 200, 255, 0.35)";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(worldToScreen(TRAFFIC_X, 0).x, worldToScreen(TRAFFIC_X, 0).y);
    ctx.lineTo(worldToScreen(TRAFFIC_X, WORLD_H).x, worldToScreen(TRAFFIC_X, WORLD_H).y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRoutes() {
    const nodes = state.buildings.filter((b) => BUILDING_TYPES[b.type].connectable);
    ctx.lineWidth = 3;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (dist(a, b) > LINK_RANGE) continue;
        const pa = worldToScreen(a.x, a.y);
        const pb = worldToScreen(b.x, b.y);
        ctx.strokeStyle = a.connected && b.connected ? "#4ef0ff" : "#2c4069";
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
  }

  function drawBuildings() {
    for (const b of state.buildings) {
      const def = BUILDING_TYPES[b.type];
      const p = worldToScreen(b.x, b.y);
      ctx.globalAlpha = b.connected ? 1 : 0.42;
      if (b.type === "pirate") drawSpriteOrFallback("pirate", b.x, b.y, 72, 54, def.color);
      else if (b.type === "dock") drawSpriteOrFallback("dock", b.x, b.y, 78, 56, def.color);
      else if (b.type === "market") drawSpriteOrFallback("market", b.x, b.y, 66, 56, def.color);
      else if (b.type === "hunter") drawSpriteOrFallback("hunter", b.x, b.y, 76, 56, def.color);
      else {
        ctx.fillStyle = "#2ec8ff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, def.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (b.type === "pirate") {
        ctx.strokeStyle = "rgba(157,121,255,0.22)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, pirateRange(b) * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawThought(b, b.thought, -50);
    }
  }

  function drawShips() {
    for (const s of state.ships) {
      if (s.classId === "small") drawSpriteOrFallback("shipSmall", s.x, s.y, 52, 30, "#76b6ff");
      if (s.classId === "medium") drawSpriteOrFallback("shipMedium", s.x, s.y, 68, 36, "#ba8cff");
      if (s.classId === "large") drawSpriteOrFallback("shipLarge", s.x, s.y, 86, 42, "#ffd176");
      drawThought(s, s.thought, -28);
    }
  }

  function drawRaiders() {
    for (const r of state.raiders) {
      const p = worldToScreen(r.x, r.y);
      ctx.fillStyle = "#ff73d7";
      ctx.beginPath();
      ctx.moveTo(p.x + 9, p.y);
      ctx.lineTo(p.x - 8, p.y - 5);
      ctx.lineTo(p.x - 8, p.y + 5);
      ctx.closePath();
      ctx.fill();
      drawThought(r, r.thought, -24);
    }
  }

  function drawMerchants() {
    for (const m of state.merchants) {
      const p = worldToScreen(m.x, m.y);
      ctx.fillStyle = "#d0f5ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      drawThought(m, m.thought, -26);
    }
  }

  function drawKrakens() {
    for (const k of state.krakens) {
      drawSpriteOrFallback("kraken", k.x, k.y, 124, 118, "#9a60ff");
      const p = worldToScreen(k.x, k.y);
      ctx.strokeStyle = "rgba(255,82,131,0.17)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, k.radius * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
      drawThought(k, "⚠", -66);
    }
  }

  function drawHunters() {
    for (const h of state.hunters) {
      const p = worldToScreen(h.x, h.y);
      ctx.fillStyle = "#63f8ff";
      ctx.beginPath();
      ctx.moveTo(p.x + 10, p.y);
      ctx.lineTo(p.x - 8, p.y - 6);
      ctx.lineTo(p.x - 8, p.y + 6);
      ctx.closePath();
      ctx.fill();
      drawThought(h, h.thought, -26);
    }
  }

  function render() {
    drawBackground();
    drawRoutes();
    drawBuildings();
    drawShips();
    drawRaiders();
    drawMerchants();
    drawKrakens();
    drawHunters();
    if (ui.placementMode) {
      ctx.fillStyle = "rgba(38, 210, 255, 0.9)";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Placement: ${BUILDING_TYPES[ui.placementMode].name}`, 14, 28);
    }
    if (isPaused()) {
      ctx.fillStyle = "rgba(8, 14, 36, 0.24)";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function pickBuildingAt(worldX, worldY) {
    let hit = null;
    for (const b of state.buildings) {
      const r = BUILDING_TYPES[b.type].radius + 24;
      if (Math.hypot(b.x - worldX, b.y - worldY) < r) hit = b;
    }
    return hit;
  }

  function pointerToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleTap(worldX, worldY) {
    if (ui.placementMode) {
      const ok = placeBuilding(ui.placementMode, worldX, worldY, false);
      if (ok) setTicker(`${BUILDING_TYPES[ui.placementMode].name} constructed.`);
      return;
    }
    const b = pickBuildingAt(worldX, worldY);
    if (b) openUpgrade(b);
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    touchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });
    if (touchState.pointers.size === 1) {
      camera.dragging = true;
      camera.dragStartX = e.clientX;
      camera.dragStartY = e.clientY;
      camera.startX = camera.x;
      camera.startY = camera.y;
    } else if (touchState.pointers.size === 2) {
      const pts = [...touchState.pointers.values()];
      touchState.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      touchState.pinchStartZoom = camera.zoom;
    }
  }

  function onPointerMove(e) {
    const p = touchState.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (touchState.pointers.size === 2) {
      const pts = [...touchState.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (touchState.pinchStartDist > 0) camera.zoom = clamp((d / touchState.pinchStartDist) * touchState.pinchStartZoom, 0.65, 1.8);
      return;
    }
    if (!camera.dragging) return;
    const dx = (e.clientX - camera.dragStartX) / camera.zoom;
    const dy = (e.clientY - camera.dragStartY) / camera.zoom;
    camera.x = clamp(camera.startX - dx, 0, WORLD_W - window.innerWidth / camera.zoom);
    camera.y = clamp(camera.startY - dy, 0, WORLD_H - window.innerHeight / camera.zoom);
    if (Math.abs(dx) + Math.abs(dy) > 8) p.moved = true;
  }

  function onPointerUp(e) {
    const p = touchState.pointers.get(e.pointerId);
    if (!p) return;
    if (!p.moved && touchState.pointers.size <= 2 && !isPaused()) {
      const w = pointerToWorld(e);
      handleTap(w.x, w.y);
    }
    touchState.pointers.delete(e.pointerId);
    if (!touchState.pointers.size) camera.dragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    const old = camera.zoom;
    camera.zoom = clamp(camera.zoom - Math.sign(e.deltaY) * 0.08, 0.65, 1.8);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = sx / old + camera.x;
    const wy = sy / old + camera.y;
    camera.x = clamp(wx - sx / camera.zoom, 0, WORLD_W - window.innerWidth / camera.zoom);
    camera.y = clamp(wy - sy / camera.zoom, 0, WORLD_H - window.innerHeight / camera.zoom);
  }

  function saveGame() {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        gold: state.gold,
        buildings: state.buildings,
        stats: state.stats,
        camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
        idSeq,
      }),
    );
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.buildings)) return false;
      state.gold = data.gold ?? state.gold;
      state.buildings = data.buildings;
      state.stats = { ...state.stats, ...(data.stats || {}) };
      camera.x = data.camera?.x ?? camera.x;
      camera.y = data.camera?.y ?? camera.y;
      camera.zoom = data.camera?.zoom ?? camera.zoom;
      idSeq = data.idSeq ?? idSeq;
      updateConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  function loop(ts) {
    const dt = clamp((ts - lastTs) / 1000, 0, MAX_DELTA_TIME);
    lastTs = ts;
    if (!isPaused()) {
      updateSimulation(dt);
      cycleTicker(dt);
    }
    goldEl.textContent = Math.floor(state.gold).toLocaleString();
    render();
    requestAnimationFrame(loop);
  }

  function initEvents() {
    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    menuBtn.addEventListener("click", openMenu);
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
    document.getElementById("close-menu").addEventListener("click", closeMenu);
    document.getElementById("close-menu-2").addEventListener("click", closeMenu);
    document.getElementById("upgrade-close").addEventListener("click", closeUpgrade);
    document.getElementById("upgrade-buy").addEventListener("click", upgradeSelected);
    window.addEventListener("beforeunload", saveGame);
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!upgradeOverlay.classList.contains("hidden")) return closeUpgrade();
      if (ui.menuOpen) return closeMenu();
      ui.placementMode = null;
    });
  }

  function initializeGame() {
    resizeCanvas();
    initEvents();
    if (!loadGame()) spawnInitialBuildings();
    recordStatsHistory(0, true);
    if (state.timers.kraken <= 0) state.timers.kraken = rand(32, 55);
    updateConnectivity();
    setTab("build");
    setTicker(TICKER_MESSAGES[0]);
    requestAnimationFrame(loop);
  }

  initializeGame();
})();
