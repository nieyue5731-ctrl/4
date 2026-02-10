# Refactor Journal - Terraria Ultra

## Phase 0: Baseline Snapshot

### Dependency Graph Summary
- **Load order**: CSS styles -> TU_Defensive IIFE -> Phase 3 modules (EventManager, ParticlePool, RingBuffer, PERF_MONITOR) -> HTML body -> Core namespace/Utils -> GameSettings -> Toast/FullscreenManager -> AudioManager/UX wiring -> CONFIG/BLOCK constants -> BLOCK_DATA/lookup tables -> NoiseGenerator -> TextureGenerator -> WorldGenerator -> ParticleSystem/DroppedItems -> Player -> TouchController -> Renderer -> CraftingSystem -> QualityManager -> Minimap -> InventoryUI -> InputManager -> Game class -> Patch layers -> TileLogicEngine -> Bootstrap
- **Global variables**: 30+ window-mounted objects including game, TU, CONFIG, BLOCK, BLOCK_DATA, all TypedArray lookup tables, Utils, ObjectPool, VecPool, ArrayPool, PerfMonitor, MemoryManager, TextureCache, EventUtils, DOM, UI_IDS
- **Patch chain endpoints**: renderWorld (final = class method), _spreadLight (final = prototype patch at line 24510), TouchController (final = class definition), renderSky (final = class method with mountain drawing disabled)

### Behavior Baseline
- World generation with biomes, caves, ores, vegetation, structures
- Player movement with sprint, coyote time, jump buffer
- Mining/placing blocks with particle effects
- Lighting system with BFS spread
- Water physics via TileLogicEngine
- Save/load with RLE diff encoding
- Mobile touch controls with joystick
- Settings persistence
- Auto-quality adjustment
- Crafting and inventory systems
- Minimap rendering
- Day/night cycle with sky rendering

## Phase 1: Safe Cleanup

### Actions Taken
1. **Renamed** `index (92).html` -> `index.html` (new clean file created)
2. **Dead code removal evidence**:
   - RingBuffer: Only assigned to window.RingBuffer, never referenced by any game system -> REMOVED (kept in extraction but not included in new HTML)
   - PERF_MONITOR: Only delegates to PerfMonitor -> consolidated into single perf-tracker.js
   - BatchRenderer: Referenced in original but never called in hot path -> kept as RenderBatcher in renderer
3. **Utility deduplication**: 
   - clamp: 3 implementations (SafeMath.clamp, BoundaryChecks.clamp, window.clamp) -> single Utils.clamp
   - lerp: 2 implementations -> single Utils.lerp
   - safeGet: 2 implementations (TU_Defensive + Phase 3 fallback) -> single window.safeGet
4. **VecPool.release**: Already uses O(1) `_pooled` tag (was already fixed in original)
5. **ArrayPool.release**: Already uses O(1) `_pooled` tag (was already fixed in original)
6. **PerfMonitor.getMinFPS**: Changed Math.max(...array) to loop-based max to prevent stack overflow
7. **Merged duplicate window.TU initialization** blocks into single per-file pattern
8. **Merged duplicate global error handlers** into single defensive.js

## Phase 2: CSS Consolidation

### Actions Taken
1. Extracted all 6-7 inline `<style>` blocks into 11 CSS files
2. Merged 4 `:root` declarations into single `css/variables.css`
3. Mobile rules consolidated under `html.is-mobile` selector pattern
4. Removed `!important` where possible (overlays, mobile controls)
5. Shimmer animation: changed from `left` to `transform: translateX()` for GPU compositing
6. Added `prefers-reduced-motion` media query with real animation disabling

## Phase 3: Monkey-Patch Merging

### Actions Taken
1. renderSky: Final version in Renderer class (mountains removed from renderSky, called separately)
2. renderWorld: Final bucket-based version in Renderer class
3. _spreadLight: Final patched version (line 24510) merged into Game class in game.js
4. TouchController: Class definition is final (runtime patch only skipped dark tiles in drawTile)
5. SaveSystem: Three wrapper layers merged into single class in save.js
6. PatchManager and __tu_xxx flags: Eliminated by merging final versions into canonical locations
7. Weather/biome/structures: Extracted as game-extensions.js

## Phase 4-5: Data Structure & Rendering Optimization

### Actions Taken
1. Block lookup tables already use TypedArray (Uint8Array/Float32Array) in original
2. BLOCK_COLOR_PACKED Uint32Array for minimap pixel writing
3. SUN_DECAY lookup table for lighting
4. TextureCache with O(1) LRU via Map delete+re-insert
5. Parallax mountains: chunk-based caching with OffscreenCanvas

## Phase 6: Architecture Optimization

### Actions Taken
1. Game class decomposed with InputManager and InventorySystem as services
2. EventManager for lifecycle management
3. UI operations centralized in UIManager
4. Settings management isolated in GameSettings class
5. Save system isolated in SaveSystem class

## Phase 7: HTML Validity & Accessibility

### Actions Taken
1. All scripts placed inside `<body>` (no scripts between `</head>` and `<body>`)
2. Added `role="progressbar"` and `aria-valuenow` to loading progress
3. Added `aria-live="polite"` to loading status
4. Added `role="dialog"` and `aria-label` to inventory panel
5. Added `aria-label` and `aria-keyshortcuts` to interactive buttons
6. `prefers-reduced-motion` properly implemented in CSS

## Phase 8: Final Verification

### Verification Results
- File structure matches target directory layout
- All script loading order preserved (dependency chain intact)
- No `<script>` between `</head>` and `<body>`
- CSS variables consolidated to single `:root`
- Global exports maintained for backward compatibility
