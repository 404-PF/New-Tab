import { readFileSync } from 'fs';

// Mirrors LIQUID_GLASS_ENABLED in src/ui/liquid-glass.js. Tests that exercise the
// enabled effect are skipped while the feature is temporarily disabled and run
// again automatically once the flag is set back to true.
const source = readFileSync('src/ui/liquid-glass.js', 'utf8');
export const LIQUID_GLASS_ENABLED = /const LIQUID_GLASS_ENABLED = true;/.test(source);
export const itWhenLiquidEnabled = LIQUID_GLASS_ENABLED ? it : it.skip;
export const itWhenLiquidDisabled = LIQUID_GLASS_ENABLED ? it.skip : it;
