'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#3b5bdb', // J - blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Single source of truth for valid skin values (must stay in sync with the
// <option> values in index.html and the [data-skin="..."] blocks in style.css).
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

// Mixes a hex color with white (amount > 0) or black (amount < 0), amount clamped to [-1, 1].
// Results are memoized since pixel-skin rendering calls this per block, every frame.
const mixColorCache = new Map();
function mixColor(hex, amount) {
  amount = Math.max(-1, Math.min(1, amount));
  const key = hex + '|' + amount;
  const cached = mixColorCache.get(key);
  if (cached) return cached;

  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  const result = `rgb(${r}, ${g}, ${b})`;
  mixColorCache.set(key, result);
  return result;
}

const PASTEL_COLORS = COLORS.map(c => (c ? mixColor(c, 0.45) : null));

// Draws a rounded rect path, falling back to manual arcs when ctx.roundRect is unavailable.
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

// Draws a small checkerboard sub-square texture over an already-filled block.
function drawPixelTexture(context, px, py, s, color) {
  const sub = Math.max(3, Math.floor(s / 6));
  const dark = mixColor(color, -0.3);
  context.fillStyle = dark;
  let rowToggle = false;
  for (let yy = 0; yy < s; yy += sub) {
    let colToggle = rowToggle;
    for (let xx = 0; xx < s; xx += sub) {
      if (colToggle) {
        const w = Math.min(sub, s - xx);
        const h = Math.min(sub, s - yy);
        context.fillRect(px + xx, py + yy, w, h);
      }
      colToggle = !colToggle;
    }
    rowToggle = !rowToggle;
  }
  context.strokeStyle = mixColor(color, -0.45);
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const highscoresListEl = document.getElementById('highscores-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesRecordEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntryEl = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

const HIGHSCORES_KEY = 'tetris-highscores';
const RECORDS_KEY = 'tetris-records';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let themeColors = { gridLine: '#22222e', blockHighlight: 'rgba(255,255,255,0.12)' };
let currentSkin = 'retro';
let combo, maxCombo, pendingScoreEntry;

function readThemeColors() {
  const style = getComputedStyle(document.documentElement);
  themeColors = {
    gridLine: style.getPropertyValue('--grid-line').trim() || '#22222e',
    blockHighlight: style.getPropertyValue('--block-highlight').trim() || 'rgba(255,255,255,0.12)',
  };
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
  readThemeColors();
  if (current) draw();
  if (next) drawNext();
}

function initTheme() {
  if (!themeToggle) return;

  let saved = 'dark';
  try {
    saved = localStorage.getItem('tetris-theme') || 'dark';
  } catch {}

  applyTheme(saved);
  themeToggle.checked = saved === 'light';
  themeToggle.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'light' : 'dark';
    applyTheme(theme);
    try {
      localStorage.setItem('tetris-theme', theme);
    } catch {}
  });
}

function applySkin(skin) {
  currentSkin = SKINS.includes(skin) ? skin : 'retro';
  document.documentElement.dataset.skin = currentSkin;
  readThemeColors();
  if (current) draw();
  if (next) drawNext();
}

function initSkin() {
  let saved = 'retro';
  try {
    saved = localStorage.getItem('tetris-skin') || 'retro';
  } catch {}

  applySkin(saved);
  if (skinSelect) {
    skinSelect.value = currentSkin;
    skinSelect.addEventListener('change', () => {
      applySkin(skinSelect.value);
      try {
        localStorage.setItem('tetris-skin', currentSkin);
      } catch {}
    });
  }
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function loadHighScores() {
  const parsed = readJSON(HIGHSCORES_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

function saveHighScores(list) {
  writeJSON(HIGHSCORES_KEY, list);
}

function loadRecords() {
  const parsed = readJSON(RECORDS_KEY);
  return {
    bestCombo: parsed && Number.isFinite(parsed.bestCombo) ? parsed.bestCombo : 0,
    maxLines: parsed && Number.isFinite(parsed.maxLines) ? parsed.maxLines : 0,
  };
}

function saveRecords(records) {
  writeJSON(RECORDS_KEY, records);
}

function qualifiesForHighScore(candidateScore, list) {
  const scores = list || loadHighScores();
  if (scores.length < MAX_HIGHSCORES) return true;
  const lowest = scores[scores.length - 1];
  return candidateScore > (lowest ? lowest.score : 0);
}

function addHighScore(name, entryScore, entryLines, entryLevel) {
  const list = loadHighScores();
  const entry = { name: name || 'AAA', score: entryScore, lines: entryLines, level: entryLevel };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighScores(trimmed);
  return { list: trimmed, index: trimmed.indexOf(entry) };
}

function resetRecords() {
  // The reset button only lives in the sidebar, which is only reachable while
  // a round is actively running (not paused, not game-over) since the overlay
  // covers the whole panel otherwise. window.confirm() blocks the main thread,
  // so suspend the drop loop around it — otherwise the wall-clock time the
  // dialog was open gets credited as drop time on the very next frame,
  // causing a jarring instant drop/lock the moment the dialog closes.
  // (Deliberately not reusing togglePause()/#overlay here: its "resume"
  // branch doesn't re-hide the overlay, which would leave the board stuck
  // behind it — a separate pre-existing gap, orthogonal to this fix.)
  const wasRunning = !paused && !gameOver;
  if (wasRunning) cancelAnimationFrame(animId);
  const confirmed = window.confirm('¿Seguro que deseas borrar los récords guardados?');
  if (wasRunning) {
    lastTime = performance.now();
    dropAccum = 0;
    animId = requestAnimationFrame(loop);
  }
  if (!confirmed) return;
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
    localStorage.removeItem(RECORDS_KEY);
  } catch {}
  renderRecords();
}

function renderRecords(highlightIndex, listOverride) {
  const list = listOverride || loadHighScores();
  const records = loadRecords();

  highscoresListEl.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin registros';
    highscoresListEl.appendChild(li);
  } else {
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      if (i === highlightIndex) li.classList.add('highlight');

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `${i + 1}.`;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = (entry && entry.name) || 'AAA';

      const scoreVal = document.createElement('span');
      scoreVal.className = 'score';
      scoreVal.textContent = Number((entry && entry.score) || 0).toLocaleString();

      li.appendChild(rank);
      li.appendChild(name);
      li.appendChild(scoreVal);
      highscoresListEl.appendChild(li);
    });
  }

  bestComboEl.textContent = records.bestCombo;
  maxLinesRecordEl.textContent = records.maxLines;
}

function sanitizeName(rawName) {
  const trimmed = rawName.trim();
  // Slice by Unicode code points (not UTF-16 code units) so an emoji or other
  // astral character near the limit doesn't get split into an orphan surrogate.
  const chars = Array.from(trimmed || 'AAA');
  return chars.slice(0, 10).join('').toUpperCase();
}

function handleSaveScore() {
  if (!pendingScoreEntry) return;
  const name = sanitizeName(playerNameInput.value);
  const { list, index } = addHighScore(name, pendingScoreEntry.score, pendingScoreEntry.lines, pendingScoreEntry.level);
  pendingScoreEntry = null;
  nameEntryEl.classList.add('hidden');
  renderRecords(index, list);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;

  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  if (currentSkin === 'neon') {
    const color = COLORS[colorIndex];
    context.shadowBlur = 12;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    context.fillStyle = themeColors.blockHighlight;
    context.fillRect(px, py, s, 4);
  } else if (currentSkin === 'pastel') {
    const color = PASTEL_COLORS[colorIndex];
    const r = Math.min(6, s / 4);
    roundedRectPath(context, px, py, s, s, r);
    context.fillStyle = color;
    context.fill();
    // Clip the highlight bar to the same rounded silhouette so its square
    // corners don't poke out past the body's rounded corners.
    context.save();
    roundedRectPath(context, px, py, s, s, r);
    context.clip();
    context.fillStyle = themeColors.blockHighlight;
    context.fillRect(px, py, s, 4);
    context.restore();
  } else if (currentSkin === 'pixel') {
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    drawPixelTexture(context, px, py, s, color);
  } else {
    // retro (default)
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.fillStyle = themeColors.blockHighlight;
    context.fillRect(px, py, s, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.gridLine;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const records = loadRecords();
  let recordsUpdated = false;
  if (maxCombo > records.bestCombo) { records.bestCombo = maxCombo; recordsUpdated = true; }
  if (lines > records.maxLines) { records.maxLines = lines; recordsUpdated = true; }
  if (recordsUpdated) saveRecords(records);

  const highScoreList = loadHighScores();
  if (qualifiesForHighScore(score, highScoreList)) {
    pendingScoreEntry = { score, lines, level };
    playerNameInput.value = '';
    nameEntryEl.classList.remove('hidden');
    setTimeout(() => playerNameInput.focus(), 0);
  } else {
    pendingScoreEntry = null;
    nameEntryEl.classList.add('hidden');
  }
  renderRecords(undefined, highScoreList);

  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseOverlay.classList.remove('hidden');
  }
}

function loop(ts) {
  // A lockPiece() -> spawn() -> endGame() call can happen from inside a loop()
  // invocation that is already past this point in its own call stack; that
  // in-flight call still falls through to its own requestAnimationFrame at the
  // bottom, which would overwrite endGame()'s cancelAnimationFrame with a new
  // scheduled frame. Bail out immediately once the game is over so the loop
  // actually stops instead of ticking (and re-running endGame()) every frame.
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  combo = 0;
  maxCombo = 0;
  pendingScoreEntry = null;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntryEl.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

function handleRestart() {
  // The restart button stays visible in the same overlay as the name-entry
  // form. If a just-finished run qualified for the top 5 but the player
  // clicks Reiniciar instead of Guardar, auto-save it (with whatever name is
  // currently typed, defaulting to "AAA") rather than silently losing it.
  if (pendingScoreEntry) handleSaveScore();
  init();
}

restartBtn.addEventListener('click', handleRestart);
saveScoreBtn.addEventListener('click', handleSaveScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    handleSaveScore();
  }
});
resetRecordsBtn.addEventListener('click', resetRecords);
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', handleRestart);
controlsToggleBtn.addEventListener('click', () => {
  pauseControls.classList.toggle('hidden');
});
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
});

initTheme();
initSkin();
init();
renderRecords();
