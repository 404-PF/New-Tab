// src/features/games/pacman.js - Pac-Man Maze Game
(function () {
  'use strict';

  const MAZE_ID = 'maze-1';
  const CELL_SIZE = 20;
  const MAX_LIVES = 3;
  const MAX_QUEUED_TURNS = 2;
  const DOT_SCORE = 10;
  const PELLET_SCORE = 50;
  const GHOST_SCORES = [200, 400, 800, 1600];
  const BASE_PACMAN_SPEED = 4.5;
  const MAX_PACMAN_SPEED = 7.5;
  const PACMAN_SPEED_STEP = 0.3;
  const BASE_GHOST_SPEED = 4.0;
  const MAX_GHOST_SPEED = 7.0;
  const GHOST_SPEED_STEP = 0.35;
  const FRIGHTENED_GHOST_SPEED = 2.8;
  const EATEN_GHOST_SPEED = 12;
  const BASE_FRIGHTENED_MS = 7000;
  const MIN_FRIGHTENED_MS = 2000;
  const FRIGHTENED_MS_STEP = 500;
  const RESPAWN_INVULNERABLE_MS = 2000;
  const EATEN_HOUSE_MS = 1200;
  const HOUSE_EXIT = { x: 9, y: 7 };
  const DOOR_TILE = { x: 9, y: 8 };
  const MAX_MODE_MS = 1000000000;
  const DIRS = ['up', 'down', 'left', 'right'];
  const DIR_ORDER = ['up', 'left', 'down', 'right'];
  const DIR_DELTA = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const SCATTER_MS = 7000;
  const CHASE_MS = 20000;
  const MODE_SEQUENCE = [
    { mode: 'scatter', ms: SCATTER_MS },
    { mode: 'chase', ms: CHASE_MS },
    { mode: 'scatter', ms: SCATTER_MS },
    { mode: 'chase', ms: CHASE_MS },
    { mode: 'scatter', ms: 5000 },
    { mode: 'chase', ms: MAX_MODE_MS }
  ];
  const HOUSE_SPAWNS = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 10, y: 10 },
    { x: 9, y: 11 }
  ];
  const HOUSE_RELEASE_STAGGER_MS = [0, 800, 1600, 2400];
  const PACMAN_SPAWN = { x: 9, y: 13 };
  const GHOST_DEFS = [
    { color: '#ff2b3c', corner: { x: 1, y: 1 } },
    { color: '#ffb3de', corner: { x: 17, y: 1 } },
    { color: '#00e5e5', corner: { x: 1, y: 20 } },
    { color: '#ffb830', corner: { x: 17, y: 20 } }
  ];

  // Maze legend: '#' wall, '.' dot, 'o' power pellet, ' ' corridor,
  // 'D' ghost-house door (ghosts only), 'H' ghost-house interior (ghosts only).
  const MAZE_ROWS = [
    '###################',
    '#........#........#',
    '#o##.###.#.###.##o#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.###.#.###.####',
    '####.#.......#.####',
    '####.#.##D##.#.####',
    '#......#HHH#......#',
    '#.####.#HHH#.####.#',
    '#......#HHH#......#',
    '#.##.#.#####.#.##.#',
    '#....#.......#....#',
    '####.#.#.#.#.#.####',
    '#......#...#......#',
    '#.##.#.#.#.#.#.##.#',
    '#o.......#.......o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '###################'
  ];

  let container = null;
  let stage = null;
  let canvas = null;
  let ctx = null;
  let scoreEl = null;
  let instructionsEl = null;
  let bgCache = null;
  let readyScreen = null;
  const stateOverlay = window.gamesHelpers.createStateOverlay('games-pacman-overlay');

  let grid = [];
  let gridRows = 0;
  let gridCols = 0;
  let dots = [];
  let dotsRemaining = 0;
  let pacman = null;
  let ghosts = [];
  let queue = [];
  let score = 0;
  let lives = MAX_LIVES;
  let level = 1;
  let clockMs = 0;
  let frightenedUntil = 0;
  let frightenedChain = 0;
  let invulnerableUntil = 0;
  let modeIndex = 0;
  let modeMsLeft = MODE_SEQUENCE[0].ms;
  let started = false;
  let paused = false;
  let manualPause = false;
  let gameOver = false;
  let rafId = null;
  let lastFrameAt = 0;
  let touchActive = false;
  let touchStart = null;

  const { tr, nowMs } = window.gamesHelpers;

  function reducedMotion() {
    return !!window.prefersReducedMotion?.();
  }

  function speedForLevel(levelValue) {
    const lvl = Math.max(1, Number.isFinite(levelValue) ? levelValue : 1);
    return {
      pacman: Math.min(MAX_PACMAN_SPEED, BASE_PACMAN_SPEED + (lvl - 1) * PACMAN_SPEED_STEP),
      ghost: Math.min(MAX_GHOST_SPEED, BASE_GHOST_SPEED + (lvl - 1) * GHOST_SPEED_STEP),
      frightened: FRIGHTENED_GHOST_SPEED,
      eaten: EATEN_GHOST_SPEED
    };
  }

  function frightenedMsForLevel(levelValue) {
    const lvl = Math.max(1, Number.isFinite(levelValue) ? levelValue : 1);
    return Math.max(MIN_FRIGHTENED_MS, BASE_FRIGHTENED_MS - (lvl - 1) * FRIGHTENED_MS_STEP);
  }

  // ===================== Maze =====================

  function parseMaze(rows) {
    const parsed = rows.map(function (row) { return row.split(''); });
    const width = parsed.length > 0 ? parsed[0].length : 0;
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].length !== width) return null;
    }
    return parsed;
  }

  function tileChar(c, r) {
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return '#';
    return grid[r][c];
  }

  function isHouseChar(ch) {
    return ch === 'H' || ch === 'D';
  }

  function isPacmanWalkable(c, r) {
    const ch = tileChar(c, r);
    return ch !== '#' && ch !== 'H' && ch !== 'D';
  }

  function isGhostWalkable(c, r, allowHouse) {
    const ch = tileChar(c, r);
    if (ch === '#') return false;
    if (isHouseChar(ch)) return !!allowHouse;
    return true;
  }

  function tileOf(ent) {
    return { x: Math.round(ent.x), y: Math.round(ent.y) };
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function isValidDirection(dir) {
    return DIRS.indexOf(dir) !== -1;
  }

  // Validates the parsed maze: rectangular, known characters, at least one
  // dot and one pellet, every pacman-walkable tile reachable from spawn, and
  // an enclosed ghost house with a usable door.
  function validateMazeData(rows) {
    const parsed = parseMaze(rows);
    if (!parsed || parsed.length === 0 || parsed[0].length === 0) {
      return { ok: false, errors: ['maze must be a non-empty rectangle'] };
    }
    const errors = [];
    const h = parsed.length;
    const w = parsed[0].length;
    let dotCount = 0;
    let pelletCount = 0;
    let doorCount = 0;
    let houseCount = 0;
    let spawnDot = false;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = parsed[r][c];
        if ('#.o DH'.indexOf(ch) === -1) {
          errors.push('unknown maze character at ' + c + ',' + r);
        }
        if (ch === '.') dotCount++;
        if (ch === 'o') pelletCount++;
        if (ch === 'D') doorCount++;
        if (ch === 'H') houseCount++;
      }
    }

    const spawnCh = parsed[PACMAN_SPAWN.y] && parsed[PACMAN_SPAWN.y][PACMAN_SPAWN.x];
    if (!spawnCh || spawnCh === '#' || spawnCh === 'H' || spawnCh === 'D') {
      errors.push('pacman spawn is not on a walkable tile');
      spawnDot = true;
    } else if (spawnCh === '.' || spawnCh === 'o') {
      spawnDot = true;
    }
    if (doorCount !== 1) errors.push('maze must contain exactly one ghost-house door');
    if (houseCount === 0) errors.push('maze must contain a ghost house');
    if (dotCount + pelletCount - (spawnDot ? 1 : 0) <= 0) errors.push('maze must contain at least one dot');
    if (pelletCount === 0) errors.push('maze must contain at least one power pellet');

    // BFS over pacman-walkable tiles from spawn (door and house excluded).
    if (!errors.some(function (e) { return e.indexOf('spawn') !== -1; })) {
      const seen = new Set();
      const stack = [{ x: PACMAN_SPAWN.x, y: PACMAN_SPAWN.y }];
      seen.add(PACMAN_SPAWN.x + ',' + PACMAN_SPAWN.y);
      while (stack.length > 0) {
        const cur = stack.pop();
        DIRS.forEach(function (dir) {
          const nx = cur.x + DIR_DELTA[dir].x;
          const ny = cur.y + DIR_DELTA[dir].y;
          const key = nx + ',' + ny;
          if (seen.has(key) || nx < 0 || ny < 0 || nx >= w || ny >= h) return;
          const ch = parsed[ny][nx];
          if (ch === '#' || ch === 'H' || ch === 'D') return;
          seen.add(key);
          stack.push({ x: nx, y: ny });
        });
      }
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const ch = parsed[r][c];
          if (ch === '#' || ch === 'H' || ch === 'D') continue;
          if (!seen.has(c + ',' + r)) {
            errors.push('unreachable walkable tile at ' + c + ',' + r);
          }
        }
      }
    }

    // Ghost spawns must sit on house interior tiles.
    HOUSE_SPAWNS.forEach(function (spawn, i) {
      const ch = parsed[spawn.y] && parsed[spawn.y][spawn.x];
      if (ch !== 'H') errors.push('ghost spawn ' + i + ' is not inside the house');
    });
    if (tileCharOn(parsed, DOOR_TILE.x, DOOR_TILE.y) !== 'D') {
      errors.push('ghost-house door is not at the expected tile');
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function tileCharOn(parsed, c, r) {
    if (r < 0 || r >= parsed.length || c < 0 || c >= parsed[0].length) return '#';
    return parsed[r][c];
  }

  function freshDots() {
    const result = grid.map(function (row, r) {
      return row.map(function (ch, c) {
        if (ch !== '.' && ch !== 'o') return 0;
        // No dot under the pacman spawn tile.
        if (c === PACMAN_SPAWN.x && r === PACMAN_SPAWN.y) return 0;
        return 1;
      });
    });
    let total = 0;
    result.forEach(function (row) {
      row.forEach(function (v) { total += v; });
    });
    return { dots: result, total: total };
  }

  // ===================== Entities =====================

  function makeEntity(x, y, dir) {
    return { x: x, y: y, dir: dir, a: { x: x, y: y }, b: null };
  }

  function makeGhost(index) {
    const spawn = HOUSE_SPAWNS[index];
    return {
      index: index,
      x: spawn.x,
      y: spawn.y,
      dir: 'up',
      a: { x: spawn.x, y: spawn.y },
      b: null,
      eaten: false,
      inHouse: true,
      releaseAt: clockMs + HOUSE_RELEASE_STAGGER_MS[index]
    };
  }

  function applyNext(ent, from, dir) {
    const delta = DIR_DELTA[dir];
    ent.a = { x: from.x, y: from.y };
    ent.b = { x: from.x + delta.x, y: from.y + delta.y };
    ent.dir = dir;
    return ent.b;
  }

  function reverseEntity(ent) {
    if (!ent.b) return false;
    const oldA = ent.a;
    ent.a = ent.b;
    ent.b = oldA;
    ent.dir = OPPOSITE[ent.dir];
    return true;
  }

  function advanceEntity(ent, dist, chooseNext, onArrive) {
    let remaining = dist;
    let guard = 0;
    while (remaining > 1e-9 && guard < 64) {
      guard++;
      if (!ent.b) {
        const next = chooseNext(ent);
        if (!next) return;
      }
      const dx = ent.b.x - ent.a.x;
      const dy = ent.b.y - ent.a.y;
      const p = Math.abs(ent.x - ent.a.x) + Math.abs(ent.y - ent.a.y);
      const stepTo = 1 - p;
      if (remaining < stepTo) {
        ent.x += dx * remaining;
        ent.y += dy * remaining;
        remaining = 0;
      } else {
        ent.x = ent.b.x;
        ent.y = ent.b.y;
        remaining -= stepTo;
        ent.a = { x: ent.b.x, y: ent.b.y };
        ent.b = null;
        if (onArrive(ent) === true) return;
      }
    }
  }

  function canWalkPacman(from, dir) {
    return isPacmanWalkable(from.x + DIR_DELTA[dir].x, from.y + DIR_DELTA[dir].y);
  }

  function canWalkGhost(from, dir, allowHouse) {
    return isGhostWalkable(from.x + DIR_DELTA[dir].x, from.y + DIR_DELTA[dir].y, allowHouse);
  }

  function queueTurn(dir) {
    if (!isValidDirection(dir) || !pacman) return;
    const effective = queue.length > 0 ? queue[queue.length - 1] : pacman.dir;
    if (dir === effective) return;
    if (pacman.b && dir === OPPOSITE[pacman.dir]) {
      reverseEntity(pacman);
      queue.length = 0;
      return;
    }
    if (queue.length >= MAX_QUEUED_TURNS) return;
    queue.push(dir);
  }

  function pacmanChooseNext() {
    const from = tileOf(pacman);
    while (queue.length > 0) {
      const dir = queue.shift();
      if (canWalkPacman(from, dir)) return applyNext(pacman, from, dir);
    }
    if (pacman.dir && canWalkPacman(from, pacman.dir)) {
      return applyNext(pacman, from, pacman.dir);
    }
    return null;
  }

  function isFrightened() {
    return clockMs < frightenedUntil;
  }

  function currentMode() {
    return MODE_SEQUENCE[Math.min(modeIndex, MODE_SEQUENCE.length - 1)].mode;
  }

  function chaseTarget(index) {
    const p = tileOf(pacman);
    if (index === 0) return p;
    if (index === 1) {
      const d = DIR_DELTA[pacman.dir] || DIR_DELTA.left;
      return { x: p.x + d.x * 4, y: p.y + d.y * 4 };
    }
    if (index === 2) {
      const blinky = ghosts[0] ? tileOf(ghosts[0]) : p;
      const d = DIR_DELTA[pacman.dir] || DIR_DELTA.left;
      const ahead = { x: p.x + d.x * 2, y: p.y + d.y * 2 };
      return { x: ahead.x + (ahead.x - blinky.x), y: ahead.y + (ahead.y - blinky.y) };
    }
    const dist = Math.abs(p.x - ghosts[0].x) + Math.abs(p.y - ghosts[0].y);
    return dist > 8 ? p : GHOST_DEFS[index].corner;
  }

  // Direction from the pool whose next tile is nearest the target
  // (squared distance; ties keep the earlier direction).
  function closestDirection(pool, from, target) {
    let best = pool[0];
    let bestDist = Infinity;
    for (const dir of pool) {
      const dx = from.x + DIR_DELTA[dir].x - target.x;
      const dy = from.y + DIR_DELTA[dir].y - target.y;
      if (dx * dx + dy * dy < bestDist) {
        bestDist = dx * dx + dy * dy;
        best = dir;
      }
    }
    return best;
  }

  function pickDirToward(from, target, currentDir, allowHouse) {
    let pool = DIR_ORDER.filter(function (dir) {
      return dir !== OPPOSITE[currentDir] && canWalkGhost(from, dir, allowHouse);
    });
    if (pool.length === 0) {
      pool = DIR_ORDER.filter(function (dir) { return canWalkGhost(from, dir, allowHouse); });
    }
    if (pool.length === 0) return null;
    return closestDirection(pool, from, target);
  }

  function ghostChooseNext(ghost) {
    const from = tileOf(ghost);
    const def = GHOST_DEFS[ghost.index];

    if (ghost.inHouse) {
      if (clockMs < ghost.releaseAt) return null;
      if (from.x !== DOOR_TILE.x) {
        const dir = from.x < DOOR_TILE.x ? 'right' : 'left';
        if (canWalkGhost(from, dir, true)) return applyNext(ghost, from, dir);
        return null;
      }
      if (from.y > HOUSE_EXIT.y) {
        if (canWalkGhost(from, 'up', true)) return applyNext(ghost, from, 'up');
        return null;
      }
      ghost.inHouse = false;
    }

    if (ghost.eaten) {
      if (from.x === HOUSE_EXIT.x && from.y === HOUSE_EXIT.y) {
        if (canWalkGhost(from, 'down', true)) return applyNext(ghost, from, 'down');
        return null;
      }
      const dir = pickDirToward(from, HOUSE_EXIT, ghost.dir, true);
      if (dir) return applyNext(ghost, from, dir);
      return null;
    }

    let pool = DIR_ORDER.filter(function (dir) {
      return dir !== OPPOSITE[ghost.dir] && canWalkGhost(from, dir, false);
    });
    if (pool.length === 0) {
      pool = DIR_ORDER.filter(function (dir) { return canWalkGhost(from, dir, false); });
    }
    if (pool.length === 0) return null;

    if (isFrightened()) {
      const pick = pool[Math.floor(window.GameRegistry.secureRandom() * pool.length)];
      return applyNext(ghost, from, pick);
    }

    let target;
    const mode = currentMode();
    if (mode === 'scatter') {
      target = def.corner;
    } else {
      target = chaseTarget(ghost.index);
    }

    return applyNext(ghost, from, closestDirection(pool, from, target));
  }

  function ghostSpeed(ghost) {
    const speeds = speedForLevel(level);
    if (ghost.eaten) return speeds.eaten;
    if (ghost.inHouse) return speeds.ghost * 0.5;
    if (isFrightened()) return speeds.frightened;
    return speeds.ghost;
  }

  // ===================== Game flow =====================

  function eatDotAt(c, r) {
    if (dots[r][c] !== 1) return;
    dots[r][c] = 0;
    dotsRemaining--;
    if (tileChar(c, r) === 'o') {
      score += PELLET_SCORE;
      frightenedUntil = clockMs + frightenedMsForLevel(level);
      frightenedChain = 0;
    } else {
      score += DOT_SCORE;
    }
    if (dotsRemaining <= 0) {
      nextLevel();
    }
    updateScoreHud();
  }

  // Returns true when the level advanced (entities were reset mid-step), so
  // advanceEntity stops driving the stale entity reference.
  function onPacmanArrive() {
    const tile = tileOf(pacman);
    const levelBefore = level;
    eatDotAt(tile.x, tile.y);
    return level !== levelBefore;
  }

  function onGhostArrive(ghost) {
    const tile = tileOf(ghost);
    if (ghost.eaten && tile.x === DOOR_TILE.x && tile.y === DOOR_TILE.y) {
      ghost.eaten = false;
      ghost.inHouse = true;
      ghost.releaseAt = clockMs + EATEN_HOUSE_MS;
    }
  }

  function resetPositions() {
    pacman = makeEntity(PACMAN_SPAWN.x, PACMAN_SPAWN.y, 'left');
    queue = [];
    ghosts = GHOST_DEFS.map(function (_def, i) { return makeGhost(i); });
  }

  function resetDots() {
    const fresh = freshDots();
    dots = fresh.dots;
    dotsRemaining = fresh.total;
  }

  function resetState() {
    score = 0;
    lives = MAX_LIVES;
    level = 1;
    clockMs = 0;
    frightenedUntil = 0;
    frightenedChain = 0;
    invulnerableUntil = 0;
    modeIndex = 0;
    modeMsLeft = MODE_SEQUENCE[0].ms;
    started = false;
    paused = false;
    manualPause = false;
    gameOver = false;
    resetDots();
    resetPositions();
    updateScoreHud();
  }

  function nextLevel() {
    level += 1;
    resetDots();
    resetPositions();
    frightenedUntil = 0;
    frightenedChain = 0;
    modeIndex = 0;
    modeMsLeft = MODE_SEQUENCE[0].ms;
  }

  function respawnAfterLifeLost() {
    resetPositions();
    frightenedUntil = 0;
    frightenedChain = 0;
    invulnerableUntil = clockMs + RESPAWN_INVULNERABLE_MS;
  }

  function loseLife() {
    if (gameOver) return;
    lives -= 1;
    if (lives <= 0) {
      endRun();
      return;
    }
    respawnAfterLifeLost();
    updateScoreHud();
  }

  function eatGhost(ghost) {
    const points = GHOST_SCORES[Math.min(frightenedChain, GHOST_SCORES.length - 1)];
    frightenedChain += 1;
    ghost.eaten = true;
    ghost.b = null;
    ghost.a = tileOf(ghost);
    score += points;
    updateScoreHud();
  }

  function endRun() {
    if (gameOver) return;
    gameOver = true;
    paused = false;
    manualPause = false;
    stopAnimation();
    window.gamesHelpers.recordRunResult('pacman', score);
    window.GameRegistry?.clearSave?.('pacman');
    updateScoreHud();
    draw();
  }

  function checkCollisions() {
    if (clockMs < invulnerableUntil) return;
    for (let i = 0; i < ghosts.length; i++) {
      const ghost = ghosts[i];
      if (ghost.eaten || ghost.inHouse) continue;
      const dx = ghost.x - pacman.x;
      const dy = ghost.y - pacman.y;
      if (dx * dx + dy * dy <= 0.55 * 0.55) {
        if (isFrightened()) {
          eatGhost(ghost);
        } else {
          loseLife();
          return;
        }
      }
    }
  }

  function update(dt) {
    if (!started || paused || gameOver || !pacman) return;
    clockMs += dt * 1000;

    if (!isFrightened()) {
      frightenedChain = 0;
      modeMsLeft -= dt * 1000;
      while (modeMsLeft <= 0 && modeIndex < MODE_SEQUENCE.length - 1) {
        modeIndex += 1;
        modeMsLeft += MODE_SEQUENCE[modeIndex].ms;
      }
      if (modeMsLeft < 0) modeMsLeft = 0;
    }

    const speeds = speedForLevel(level);
    advanceEntity(pacman, speeds.pacman * dt, pacmanChooseNext, onPacmanArrive);
    if (gameOver) return;
    ghosts.forEach(function (ghost) {
      advanceEntity(ghost, ghostSpeed(ghost) * dt, function (g) {
        return ghostChooseNext(g);
      }, function (g) {
        onGhostArrive(g);
      });
    });
    checkCollisions();
  }

  // ===================== Rendering =====================

  function buildBackgroundCache() {
    const offscreen = document.createElement('canvas');
    offscreen.width = gridCols * CELL_SIZE;
    offscreen.height = gridRows * CELL_SIZE;
    const bgCtx = offscreen.getContext('2d');
    if (!bgCtx) return null;

    bgCtx.fillStyle = '#05060f';
    bgCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    const inset = 3;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (grid[r][c] !== '#') continue;
        const x = c * CELL_SIZE;
        const y = r * CELL_SIZE;
        bgCtx.fillStyle = 'rgba(33, 33, 222, 0.16)';
        bgCtx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        bgCtx.strokeStyle = '#3b3bff';
        bgCtx.lineWidth = 2;
        bgCtx.beginPath();
        if (tileChar(c, r - 1) !== '#') {
          bgCtx.moveTo(x + inset, y + inset);
          bgCtx.lineTo(x + CELL_SIZE - inset, y + inset);
        }
        if (tileChar(c, r + 1) !== '#') {
          bgCtx.moveTo(x + inset, y + CELL_SIZE - inset);
          bgCtx.lineTo(x + CELL_SIZE - inset, y + CELL_SIZE - inset);
        }
        if (tileChar(c - 1, r) !== '#') {
          bgCtx.moveTo(x + inset, y + inset);
          bgCtx.lineTo(x + inset, y + CELL_SIZE - inset);
        }
        if (tileChar(c + 1, r) !== '#') {
          bgCtx.moveTo(x + CELL_SIZE - inset, y + inset);
          bgCtx.lineTo(x + CELL_SIZE - inset, y + CELL_SIZE - inset);
        }
        bgCtx.stroke();
      }
    }

    // Ghost-house door.
    bgCtx.fillStyle = '#ffb8de';
    bgCtx.fillRect(
      DOOR_TILE.x * CELL_SIZE + 2,
      DOOR_TILE.y * CELL_SIZE + CELL_SIZE / 2 - 2,
      CELL_SIZE - 4,
      4
    );

    return offscreen;
  }

  function px(ent) {
    return { x: (ent.x + 0.5) * CELL_SIZE, y: (ent.y + 0.5) * CELL_SIZE };
  }

  function drawDots() {
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (dots[r][c] !== 1) continue;
        const cx = (c + 0.5) * CELL_SIZE;
        const cy = (r + 0.5) * CELL_SIZE;
        const pellet = grid[r][c] === 'o';
        ctx.fillStyle = pellet ? '#ffe4b5' : '#ffd27f';
        ctx.beginPath();
        ctx.arc(cx, cy, pellet ? 6 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPacman() {
    if (clockMs < invulnerableUntil && Math.floor(clockMs / 150) % 2 === 1) return;
    const pos = px(pacman);
    const angleMap = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const rotation = angleMap[pacman.dir] ?? 0;
    const mouth = reducedMotion()
      ? 0.22 * Math.PI
      : Math.abs(Math.sin(clockMs / 110)) * 0.32 * Math.PI;
    const radius = CELL_SIZE / 2 - 2;
    ctx.fillStyle = '#ffd83d';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, radius, rotation + mouth, rotation - mouth + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ghost) {
    const def = GHOST_DEFS[ghost.index];
    const pos = px(ghost);
    const radius = CELL_SIZE / 2 - 2;
    const frightened = !ghost.eaten && !ghost.inHouse && isFrightened();
    const frightLeft = frightenedUntil - clockMs;
    const blinkWhite = frightened && frightLeft < 1000 && Math.floor(clockMs / 150) % 2 === 1;

    if (!ghost.eaten) {
      ctx.fillStyle = frightened ? (blinkWhite ? '#ffffff' : '#2121de') : def.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 1, radius, Math.PI, 0);
      ctx.lineTo(pos.x + radius, pos.y + radius - 3);
      const scallops = 3;
      const step = (radius * 2) / scallops;
      for (let i = 0; i < scallops; i++) {
        const sx = pos.x + radius - step * (i + 0.5);
        ctx.arc(sx, pos.y + radius - 3, step / 2, 0, Math.PI, true);
      }
      ctx.lineTo(pos.x - radius, pos.y - 1);
      ctx.closePath();
      ctx.fill();
    }

    if (frightened) {
      ctx.strokeStyle = blinkWhite ? '#2121de' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const mouthY = pos.y + 2;
      ctx.moveTo(pos.x - 5, mouthY);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(pos.x - 5 + (i + 0.5) * 2.5, mouthY + (i % 2 === 0 ? -2.5 : 2.5));
        ctx.lineTo(pos.x - 5 + (i + 1) * 2.5, mouthY);
      }
      ctx.stroke();
      return;
    }

    // Eyes indicate movement direction.
    const delta = DIR_DELTA[ghost.dir] || DIR_DELTA.left;
    [-3.5, 3.5].forEach(function (offset) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x + offset, pos.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2121de';
      ctx.beginPath();
      ctx.arc(pos.x + offset + delta.x * 1.4, pos.y - 2 + delta.y * 1.4, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function draw() {
    if (!ctx || !pacman) return;
    if (bgCache) ctx.drawImage(bgCache, 0, 0);
    else {
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawDots();
    ghosts.forEach(drawGhost);
    drawPacman();
    syncStateOverlay();
  }

  function updateScoreHud() {
    if (!scoreEl) return;
    const stats = window.GameRegistry?.getStats?.('pacman') || {};
    const highScore = Math.max(Number.isSafeInteger(stats.highScore) ? stats.highScore : 0, score);
    scoreEl.textContent =
      tr('gamesScore') + ': ' + score +
      '  ·  ' + tr('gamesHighScore') + ': ' + highScore +
      '  ·  ' + tr('gamesLevel') + ': ' + level +
      '  ·  ' + tr('gamesLives') + ': ' + Math.max(0, lives);
  }

  function stateOverlayOptions(kind) {
    if (kind === 'paused') return { text: tr('gamesPaused') };
    return {
      text: tr('gamesGameOver'),
      statsHtml: tr('gamesScore') + ': ' + score,
      sub: tr('gamesPressSpace')
    };
  }

  function syncStateOverlay() {
    let kind = null;
    if (gameOver) kind = 'game-over';
    else if (paused) kind = 'paused';
    stateOverlay.sync(stage, kind, stateOverlayOptions);
  }

  // ===================== Animation loop =====================

  function stopAnimation() {
    if (rafId !== null) window.cancelAnimationFrame?.(rafId);
    rafId = null;
  }

  function frame(timestamp) {
    rafId = null;
    if (!started || paused || gameOver) return;
    // Clamp the step to 50 ms so a stalled tab cannot tunnel through walls.
    update(Math.min(Math.max(0, timestamp - lastFrameAt) / 1000, 0.05));
    lastFrameAt = timestamp;
    if (gameOver) return;
    draw();
    rafId = window.requestAnimationFrame(frame);
  }

  function startAnimation() {
    stopAnimation();
    if (typeof window.requestAnimationFrame !== 'function') return;
    lastFrameAt = nowMs();
    rafId = window.requestAnimationFrame(frame);
  }

  // ===================== Save / restore =====================

  function isValidEndpoint(point, allowHouse) {
    return !!point && typeof point === 'object' &&
      Number.isInteger(point.x) && Number.isInteger(point.y) &&
      isGhostWalkable(point.x, point.y, allowHouse);
  }

  function areAdjacent(p, q) {
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
  }

  function validateEntityPosition(value, allowHouse) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false;
    if (!isValidDirection(value.dir)) return false;
    const cx = Math.round(value.x);
    const cy = Math.round(value.y);
    if (cx < 0 || cy < 0 || cx >= gridCols || cy >= gridRows) return false;
    if (!isGhostWalkable(cx, cy, allowHouse)) return false;
    const fx = Math.abs(value.x - cx);
    const fy = Math.abs(value.y - cy);
    if (fx < 1e-6 && fy < 1e-6) {
      // At a tile centre the endpoints are optional, but restoration trusts
      // them for movement, so any that are present must be valid too.
      const hasA = value.a !== null && value.a !== undefined;
      const hasB = value.b !== null && value.b !== undefined;
      if (!hasA && !hasB) return true;
      if (!isValidEndpoint(value.a, allowHouse)) return false;
      if (!hasB) return true;
      return isValidEndpoint(value.b, allowHouse) && areAdjacent(value.a, value.b);
    }
    // Mid-corridor: exactly one axis fractional, endpoints walkable and adjacent.
    if (!isValidEndpoint(value.a, allowHouse) || !isValidEndpoint(value.b, allowHouse)) return false;
    if (!areAdjacent(value.a, value.b)) return false;
    const minX = Math.min(value.a.x, value.b.x);
    const maxX = Math.max(value.a.x, value.b.x);
    const minY = Math.min(value.a.y, value.b.y);
    const maxY = Math.max(value.a.y, value.b.y);
    const between = value.x >= minX - 1e-6 && value.x <= maxX + 1e-6 &&
      value.y >= minY - 1e-6 && value.y <= maxY + 1e-6;
    const axisAligned = (fx < 1e-6 || fy < 1e-6);
    return between && axisAligned;
  }

  function validateSavedState(savedState) {
    if (!savedState || typeof savedState !== 'object' || Array.isArray(savedState)) return false;
    if (savedState.mazeId !== MAZE_ID) return false;
    if (!Number.isSafeInteger(savedState.level) || savedState.level < 1) return false;
    if (!Number.isSafeInteger(savedState.score) || savedState.score < 0) return false;
    if (!Number.isSafeInteger(savedState.lives) || savedState.lives < 1 || savedState.lives > MAX_LIVES) return false;
    if (!isFiniteNumber(savedState.clockMs) || savedState.clockMs < 0) return false;
    if (!isFiniteNumber(savedState.frightenedUntil) || savedState.frightenedUntil < 0) return false;
    if (!Number.isSafeInteger(savedState.frightenedChain) || savedState.frightenedChain < 0) return false;
    if (!isFiniteNumber(savedState.invulnerableUntil) || savedState.invulnerableUntil < 0) return false;
    if (!Number.isSafeInteger(savedState.modeIndex) || savedState.modeIndex < 0 ||
        savedState.modeIndex >= MODE_SEQUENCE.length) return false;
    if (!isFiniteNumber(savedState.modeMsLeft) || savedState.modeMsLeft < 0) return false;

    if (!validateEntityPosition(savedState.pacman, false)) return false;
    if (savedState.pacman.queuedDirs !== undefined) {
      if (!Array.isArray(savedState.pacman.queuedDirs) ||
          savedState.pacman.queuedDirs.length > MAX_QUEUED_TURNS) return false;
      for (let i = 0; i < savedState.pacman.queuedDirs.length; i++) {
        if (!isValidDirection(savedState.pacman.queuedDirs[i])) return false;
      }
    }

    if (!Array.isArray(savedState.ghosts) || savedState.ghosts.length !== GHOST_DEFS.length) return false;
    for (let i = 0; i < savedState.ghosts.length; i++) {
      const ghost = savedState.ghosts[i];
      if (!ghost || typeof ghost !== 'object' || Array.isArray(ghost)) return false;
      if (typeof ghost.eaten !== 'boolean' || typeof ghost.inHouse !== 'boolean') return false;
      if (!isFiniteNumber(ghost.releaseAt) || ghost.releaseAt < 0) return false;
      if (!validateEntityPosition(ghost, ghost.eaten || ghost.inHouse)) return false;
      // Live ghosts must not sit on Pac-Man's tile.
      if (!ghost.eaten && !ghost.inHouse && savedState.pacman &&
          Math.round(ghost.x) === Math.round(savedState.pacman.x) &&
          Math.round(ghost.y) === Math.round(savedState.pacman.y) &&
          Math.abs(ghost.x - savedState.pacman.x) < 0.5 &&
          Math.abs(ghost.y - savedState.pacman.y) < 0.5) {
        return false;
      }
    }

    if (!Array.isArray(savedState.dots) || savedState.dots.length !== gridRows) return false;
    let remaining = 0;
    for (let r = 0; r < gridRows; r++) {
      const row = savedState.dots[r];
      if (!Array.isArray(row) || row.length !== gridCols) return false;
      for (let c = 0; c < gridCols; c++) {
        const v = row[c];
        if (v !== 0 && v !== 1) return false;
        if (v === 1) {
          // A remaining dot may only sit on a tile the maze marks as dot-capable.
          if (grid[r][c] !== '.' && grid[r][c] !== 'o') return false;
          if (c === PACMAN_SPAWN.x && r === PACMAN_SPAWN.y) return false;
          remaining++;
        }
      }
    }
    if (remaining <= 0) return false;

    return true;
  }

  function applyRestoredState(savedState) {
    if (!validateSavedState(savedState)) return false;

    dots = savedState.dots.map(function (row) { return row.slice(); });
    dotsRemaining = savedState.dots.reduce(function (sum, row) {
      return sum + row.reduce(function (s, v) { return s + v; }, 0);
    }, 0);
    score = savedState.score;
    lives = savedState.lives;
    level = savedState.level;
    clockMs = savedState.clockMs;
    frightenedUntil = savedState.frightenedUntil;
    frightenedChain = savedState.frightenedChain;
    invulnerableUntil = savedState.invulnerableUntil;
    modeIndex = savedState.modeIndex;
    modeMsLeft = savedState.modeMsLeft;
    started = false;
    paused = false;
    manualPause = false;
    gameOver = false;

    pacman = {
      x: savedState.pacman.x,
      y: savedState.pacman.y,
      dir: savedState.pacman.dir,
      a: savedState.pacman.a ? { x: savedState.pacman.a.x, y: savedState.pacman.a.y } : { x: Math.round(savedState.pacman.x), y: Math.round(savedState.pacman.y) },
      b: savedState.pacman.b ? { x: savedState.pacman.b.x, y: savedState.pacman.b.y } : null
    };
    // Keep the turns queued at save time so Continue resumes the same move.
    queue = Array.isArray(savedState.pacman.queuedDirs) ? savedState.pacman.queuedDirs.slice() : [];
    ghosts = savedState.ghosts.map(function (ghost, i) {
      return {
        index: i,
        x: ghost.x,
        y: ghost.y,
        dir: ghost.dir,
        a: ghost.a ? { x: ghost.a.x, y: ghost.a.y } : { x: Math.round(ghost.x), y: Math.round(ghost.y) },
        b: ghost.b ? { x: ghost.b.x, y: ghost.b.y } : null,
        eaten: ghost.eaten,
        inHouse: ghost.inHouse,
        releaseAt: ghost.releaseAt
      };
    });

    updateScoreHud();
    return true;
  }

  function serialize() {
    if (!started || gameOver || !pacman) return null;
    return {
      mazeId: MAZE_ID,
      level: level,
      score: score,
      lives: lives,
      clockMs: clockMs,
      pacman: {
        x: pacman.x,
        y: pacman.y,
        dir: pacman.dir,
        a: pacman.a ? { x: pacman.a.x, y: pacman.a.y } : null,
        b: pacman.b ? { x: pacman.b.x, y: pacman.b.y } : null,
        queuedDirs: queue.slice()
      },
      ghosts: ghosts.map(function (ghost) {
        return {
          x: ghost.x,
          y: ghost.y,
          dir: ghost.dir,
          a: ghost.a ? { x: ghost.a.x, y: ghost.a.y } : null,
          b: ghost.b ? { x: ghost.b.x, y: ghost.b.y } : null,
          eaten: ghost.eaten,
          inHouse: ghost.inHouse,
          releaseAt: ghost.releaseAt
        };
      }),
      dots: dots.map(function (row) { return row.slice(); }),
      frightenedUntil: frightenedUntil,
      frightenedChain: frightenedChain,
      invulnerableUntil: invulnerableUntil,
      modeIndex: modeIndex,
      modeMsLeft: Math.min(modeMsLeft, MAX_MODE_MS)
    };
  }

  // ===================== Input =====================

  function handleKeydown(e) {
    if (window.gamesHelpers.isEditableTarget(e.target)) return;

    // Swallow the browser default (page scroll) for game control keys even
    // when the event itself is dropped below: a held direction key or Space
    // would otherwise scroll the page behind the game (#876).
    window.gamesHelpers.suppressGameKeyScroll(e);
    if (!started || window.gamesHelpers.shouldIgnoreKey(e)) return;

    if (gameOver) {
      window.gamesHelpers.handleRestartSpace(e, resetAndStart);
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (manualPause) {
        resumeFromManualPause();
      } else {
        paused = true;
        manualPause = true;
        stopAnimation();
        draw();
      }
      return;
    }

    const dir = window.gamesHelpers.parseDirection(e);
    if (dir) {
      e.preventDefault();
      queueTurn(dir);
    }
  }

  function handleTouchStart(e) {
    touchActive = !!(e.touches && e.touches.length === 1);
    if (touchActive) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStart = null;
    }
  }

  function handleTouchEnd(e) {
    if (!touchActive || !touchStart || !e.changedTouches || e.changedTouches.length === 0) {
      touchActive = false;
      touchStart = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchActive = false;
    touchStart = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      queueTurn(dx > 0 ? 'right' : 'left');
    } else {
      queueTurn(dy > 0 ? 'down' : 'up');
    }
  }

  // ===================== Lifecycle =====================

  function resetAndStart() {
    resetState();
    started = true;
    paused = false;
    manualPause = false;
    updateScoreHud();
    draw();
    startAnimation();
    try { canvas?.focus(); } catch (_e) { /* ignore */ }
  }

  function resumeFromManualPause() {
    if (!started || gameOver) return;
    manualPause = false;
    paused = false;
    startAnimation();
    draw();
  }

  function init(containerEl, savedState) {
    container = containerEl;

    grid = parseMaze(MAZE_ROWS);
    gridRows = grid.length;
    gridCols = grid[0].length;
    const validation = validateMazeData(MAZE_ROWS);
    if (!validation.ok) {
      console.warn('pacman: built-in maze failed validation', validation.errors);
    }

    scoreEl = document.createElement('div');
    scoreEl.className = 'games-score-display games-pacman-score';
    container.appendChild(scoreEl);

    stage = document.createElement('div');
    stage.className = 'games-pacman-stage';

    canvas = document.createElement('canvas');
    canvas.width = gridCols * CELL_SIZE;
    canvas.height = gridRows * CELL_SIZE;
    canvas.className = 'games-pacman-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', tr('gamesPacman'));
    canvas.tabIndex = 0;

    ctx = canvas.getContext('2d');
    bgCache = ctx ? buildBackgroundCache() : null;

    stage.appendChild(canvas);
    container.appendChild(stage);

    instructionsEl = document.createElement('div');
    instructionsEl.className = 'games-instructions games-pacman-instructions';
    instructionsEl.textContent = tr('gamesPacmanControls');
    container.appendChild(instructionsEl);

    resetState();
    let restoredRun = false;
    if (savedState) {
      restoredRun = applyRestoredState(savedState);
      if (!restoredRun) {
        window.GameRegistry?.clearSave?.('pacman');
        resetState();
      }
    }

    updateScoreHud();
    draw();

    toggleInputListeners(true);
    readyScreen = window.gamesHelpers.createReadyScreen(stage, {
      text: tr('gamesReady'),
      sub: tr('gamesReadyStart'),
      buttonText: tr(restoredRun ? 'gamesContinue' : 'gamesStart'),
      onStart: restoredRun ? continueRestoredRun : resetAndStart
    });
    if (!readyScreen) resetAndStart();
  }

  function continueRestoredRun() {
    started = true;
    paused = false;
    manualPause = false;
    draw();
    startAnimation();
    try { canvas.focus(); } catch (_e) { /* ignore */ }
  }

  function toggleInputListeners(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('keydown', handleKeydown);
    if (!canvas) return;
    canvas[method]('touchstart', handleTouchStart, { passive: true });
    canvas[method]('touchend', handleTouchEnd, { passive: true });
  }

  function destroy() {
    if (readyScreen) {
      try { readyScreen.remove(); } catch (_e) { /* ignore */ }
      readyScreen = null;
    }

    started = false;
    stopAnimation();
    stateOverlay.clear();

    toggleInputListeners(false);

    if (container) container.innerHTML = '';

    container = null;
    stage = null;
    canvas = null;
    ctx = null;
    scoreEl = null;
    instructionsEl = null;
    bgCache = null;
    pacman = null;
    ghosts = [];
    queue = [];
    dots = [];
    dotsRemaining = 0;
    touchActive = false;
    touchStart = null;
  }

  function pause() {
    if (!started || gameOver) return;
    if (!paused) manualPause = false;
    paused = true;
    stopAnimation();
    draw();
  }

  function resume() {
    if (!started || gameOver || manualPause) return;
    paused = false;
    startAnimation();
    draw();
  }

  window.GameRegistry?.register({
    id: 'pacman',
    name: 'gamesPacman',
    description: 'gamesPacmanDesc',
    icon: '👻',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume,
    serialize: serialize
  });

  window.__pacmanTest = {
    validateMaze: function () { return validateMazeData(MAZE_ROWS); },
    validateMazeData: validateMazeData,
    validateSavedState: validateSavedState,
    applyRestoredState: applyRestoredState,
    serialize: serialize,
    tick: function (dt) {
      // Test-only: force the simulation to advance even when the ready
      // screen is gating `started`, so specs can drive update() directly.
      if (!started && !gameOver) started = true;
      update(dt);
      draw();
    },
    setPositions: function (positions) {
      if (positions.pacman && pacman) {
        const p = positions.pacman;
        pacman.x = p.x !== undefined ? p.x : pacman.x;
        pacman.y = p.y !== undefined ? p.y : pacman.y;
        pacman.dir = p.dir || pacman.dir;
        pacman.a = { x: Math.round(pacman.x), y: Math.round(pacman.y) };
        pacman.b = null;
        if (p.queuedDirs) queue = p.queuedDirs.slice();
      }
      if (Array.isArray(positions.ghosts)) {
        positions.ghosts.forEach(function (g, i) {
          const ghost = ghosts[i];
          if (!ghost) return;
          ghost.x = g.x !== undefined ? g.x : ghost.x;
          ghost.y = g.y !== undefined ? g.y : ghost.y;
          ghost.dir = g.dir || ghost.dir;
          ghost.a = { x: Math.round(ghost.x), y: Math.round(ghost.y) };
          ghost.b = null;
          if (g.eaten !== undefined) ghost.eaten = g.eaten;
          if (g.inHouse !== undefined) ghost.inHouse = g.inHouse;
          if (g.releaseAt !== undefined) ghost.releaseAt = g.releaseAt;
        });
      }
    },
    setFrightened: function (ms) {
      frightenedUntil = clockMs + ms;
      frightenedChain = 0;
    },
    getState: function () {
      return {
        score: score,
        lives: lives,
        level: level,
        clockMs: clockMs,
        dotsRemaining: dotsRemaining,
        started: started,
        paused: paused,
        manualPause: manualPause,
        gameOver: gameOver,
        frightened: isFrightened(),
        frightenedChain: frightenedChain,
        mode: currentMode(),
        queuedDirs: queue.slice(),
        pacman: pacman ? { x: pacman.x, y: pacman.y, dir: pacman.dir } : null,
        ghosts: ghosts.map(function (ghost) {
          return {
            x: ghost.x,
            y: ghost.y,
            dir: ghost.dir,
            eaten: ghost.eaten,
            inHouse: ghost.inHouse
          };
        })
      };
    },
    forceGameOver: endRun,
    speedForLevel: speedForLevel,
    frightenedMsForLevel: frightenedMsForLevel,
    constants: {
      cellSize: CELL_SIZE,
      maxLives: MAX_LIVES,
      maxQueuedTurns: MAX_QUEUED_TURNS,
      dotScore: DOT_SCORE,
      pelletScore: PELLET_SCORE,
      ghostScores: GHOST_SCORES.slice(),
      basePacmanSpeed: BASE_PACMAN_SPEED,
      maxPacmanSpeed: MAX_PACMAN_SPEED,
      pacmanSpeedStep: PACMAN_SPEED_STEP,
      baseGhostSpeed: BASE_GHOST_SPEED,
      maxGhostSpeed: MAX_GHOST_SPEED,
      ghostSpeedStep: GHOST_SPEED_STEP,
      frightenedGhostSpeed: FRIGHTENED_GHOST_SPEED,
      eatenGhostSpeed: EATEN_GHOST_SPEED,
      baseFrightenedMs: BASE_FRIGHTENED_MS,
      minFrightenedMs: MIN_FRIGHTENED_MS,
      frightenedMsStep: FRIGHTENED_MS_STEP,
      respawnInvulnerableMs: RESPAWN_INVULNERABLE_MS,
      mazeId: MAZE_ID,
      gridRows: gridRows || MAZE_ROWS.length,
      gridCols: gridCols || MAZE_ROWS[0].length,
      pacmanSpawn: { x: PACMAN_SPAWN.x, y: PACMAN_SPAWN.y },
      houseExit: { x: HOUSE_EXIT.x, y: HOUSE_EXIT.y },
      doorTile: { x: DOOR_TILE.x, y: DOOR_TILE.y }
    }
  };
})();
