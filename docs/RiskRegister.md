# Risk Register

## R1: Script Loading Order (HIGH)
- **Risk**: Multi-file loading may cause undefined references if order is wrong
- **Mitigation**: Script tags in index.html follow strict dependency order; all modules use `window.X` pattern for exports
- **Status**: Mitigated by careful ordering in HTML

## R2: CSS Specificity Changes (MEDIUM)
- **Risk**: Extracting inline styles to external files may change cascade order
- **Mitigation**: CSS files loaded in same order as original inline blocks; `:root` variables consolidated first
- **Status**: Mitigated

## R3: Monkey-Patch Merge Correctness (HIGH)
- **Risk**: Merging patched methods into canonical classes may miss the "last writer wins" version
- **Mitigation**: Traced each patch chain to identify final version; documented in RefactorJournal.md
- **Status**: Mitigated for identified patches; _spreadLight final version confirmed at line 24510

## R4: Global Variable Dependencies (MEDIUM)
- **Risk**: Some code depends on implicit global ordering (e.g., CONFIG must exist before BLOCK_DATA)
- **Mitigation**: Script loading order in HTML preserves original execution sequence
- **Status**: Mitigated

## R5: Line Extraction Accuracy (MEDIUM)
- **Risk**: sed-based extraction from original file may include/exclude wrong lines
- **Mitigation**: File sizes verified; line ranges cross-referenced with original section markers
- **Status**: Acceptable; manual review recommended for edge cases

## R6: Mobile Touch Events (LOW)
- **Risk**: CSS changes to mobile controls may affect touch target sizes
- **Mitigation**: CSS variables preserved (`--joy-size`, `--btn-size`); same CSS rules applied
- **Status**: Mitigated

## R7: Save Compatibility (LOW)
- **Risk**: Refactored SaveSystem may not load old saves
- **Mitigation**: SaveSystem.KEY unchanged; RLE and legacy array format parsing preserved exactly
- **Status**: Mitigated
