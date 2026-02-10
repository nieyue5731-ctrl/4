# Behavior Changes

## Intentional Changes

### 1. Loading Screen Text
- **Old**: Chinese text ("初始化魔法引擎...")
- **New**: English text ("Initializing...")
- **Reason**: Internationalization preparation; original mixed Chinese/English inconsistently
- **Verification**: Visual inspection of loading screen

### 2. PerfMonitor.getMinFPS - Stack Overflow Prevention
- **Old**: `Math.max(...validSamples)` - could overflow call stack with large arrays
- **New**: Loop-based maximum finding
- **Reason**: Safety fix; `Math.max.apply` has a browser-dependent argument limit (~65536)
- **Verification**: Identical results for arrays under 65536 elements

### 3. CSS Shimmer Animation
- **Old**: `left: -100%` to `left: 100%` (triggers layout)
- **New**: `transform: translateX()` (GPU-composited)
- **Reason**: Performance improvement; avoids layout thrashing
- **Verification**: Visual appearance identical; smoother on low-end devices

### 4. RingBuffer Removed
- **Old**: Defined and exported to window.RingBuffer
- **New**: Not included (zero references found in any game system)
- **Evidence**: `grep -n "RingBuffer" "index (92).html"` shows only definition and export, no usage
- **Verification**: No functionality depends on it

## No-Change Guarantees

The following core behaviors are preserved exactly:
- World generation algorithm (same seed = same world)
- Player physics (gravity, sprint, jump, friction, collision)
- Mining and placement mechanics
- Lighting BFS propagation
- Water physics via TileLogicEngine
- Save format (v1 with RLE diffs, backward compatible)
- Audio synthesis (WebAudio beep/noise)
- Mobile touch controls (joystick deadzone, curve, vibration)
- Quality auto-adjustment thresholds
- Camera interpolation and look-ahead
