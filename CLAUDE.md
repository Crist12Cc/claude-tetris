# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript using HTML5 Canvas. No build tools, no package manager, no external dependencies — just three files:

- `index.html` — DOM structure: `#board` canvas (300×600, 10×20 grid of 30px blocks), `#next-canvas` for the next-piece preview, HUD elements (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — all game logic (~300 lines, single file, no modules).

## Running the game

There is no build or test process. Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`. To verify a change works, open the page in a browser and play — there are no automated tests.

## Architecture (`game.js`)

Everything lives in one file with module-level `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — no classes, no state management library.

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or an integer 1–7 indexing into `COLORS`/`PIECES` for the piece type that occupies it.
- **Pieces**: `PIECES` defines the 7 tetrominoes as square matrices. Rotation (`rotateCW`) is a transpose + row-reverse, not a lookup table of rotation states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells; used for movement, rotation, and ghost-piece projection.
- **Wall kicks** (`tryRotate`): after rotating, tries horizontal offsets `[0, -1, 1, -2, 2]` until one doesn't collide, else the rotation is discarded. This is a simplified, non-SRS kick table.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row once `dropAccum >= dropInterval`.
- **Locking & clearing**: `lockPiece` → `merge` (bakes the current piece into `board`) → `clearLines` (scans bottom-up, splices full rows, unshifts empty ones at the top) → `spawn` (promotes `next` to `current`, generates a new `next`, and calls `endGame` if the new piece immediately collides).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points per cell dropped, soft drop adds 1 point per row.
- **Leveling/speed**: level increments every 10 cleared lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece (`ghostY()` projects straight down, drawn at `globalAlpha = 0.2`), and the falling piece, every frame. `drawNext()` renders the preview canvas separately.

Input is handled by a single `keydown` listener (arrows to move/rotate/soft-drop, `Space` for hard drop, `P` to pause); it early-returns when paused or game-over except for the pause key itself.

## Tunable constants

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, and `dropInterval` (initial value) are defined at the top of `game.js`. If `COLS`, `ROWS`, or `BLOCK` change, the `#board` canvas `width`/`height` in `index.html` must be updated to match (`COLS × BLOCK` and `ROWS × BLOCK`).
