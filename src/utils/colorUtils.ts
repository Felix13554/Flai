/**
 * colorUtils.ts
 *
 * Reads CSS custom properties (--primary, --secondary, etc.) from :root,
 * derives perceptually-nice hover/active/light variants, and writes them
 * back as additional CSS variables so the whole app can use them.
 *
 * Call `syncDerivedColors()` once on mount and whenever site content changes.
 */

// ── Hex ↔ RGB helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// ── HSL helpers (needed for lightness-aware darkening) ──────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    case bn: h = ((rn - gn) / d + 4) / 6; break;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hn = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

// ── Derive variants ──────────────────────────────────────────────────────────

/**
 * Returns a darkened version of the colour — used for hover states.
 * Reduces lightness by `amount` (0–1). For very dark colours it lightens instead.
 */
function darken(hex: string, amount = 0.15): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(...rgb);
  // If the colour is already very dark, lighten slightly instead of darkening further
  const newL = l < 0.25 ? Math.min(l + amount * 0.6, 1) : Math.max(l - amount, 0);
  return rgbToHex(...hslToRgb(h, s, newL));
}

/**
 * Returns a lightened, low-opacity tint — used for focus rings / backgrounds.
 */
function tint(hex: string, opacity = 0.15): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

// ── Resolve a CSS variable to a concrete hex ─────────────────────────────────

function resolveCssVar(varName: string): string | null {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    if (!raw) return null;
    // Already a hex
    if (/^#[0-9a-fA-F]{3,6}$/.test(raw)) return raw;
    // Could be rgb(r g b) or rgb(r, g, b) — normalise via canvas
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = raw;
    const resolved = ctx.fillStyle; // browser normalises to #rrggbb
    if (/^#[0-9a-fA-F]{6}$/.test(resolved)) return resolved;
    return null;
  } catch {
    return null;
  }
}

// ── Main sync function ────────────────────────────────────────────────────────

export function syncDerivedColors(): void {
  const root = document.documentElement;

  const vars: Array<[string, string]> = [
    ['--primary',   '--primary'],
    ['--secondary', '--secondary'],
    ['--accent',    '--accent'],
    ['--success',   '--success'],
    ['--error',     '--error'],
  ];

  for (const [sourceVar] of vars) {
    const hex = resolveCssVar(sourceVar);
    if (!hex) continue;

    const baseName = sourceVar; // e.g. --primary

    // Hover: 15% darker (or lighter for very dark colours)
    root.style.setProperty(`${baseName}-hover`, darken(hex, 0.15));

    // Active / pressed: 22% darker
    root.style.setProperty(`${baseName}-active`, darken(hex, 0.22));

    // Tint (for focus rings, badge backgrounds, etc.)
    root.style.setProperty(`${baseName}-tint`, tint(hex, 0.15));
    root.style.setProperty(`${baseName}-tint-strong`, tint(hex, 0.25));
  }
}

// ── Auto-sync on content changes ─────────────────────────────────────────────

/**
 * Call this once to set up a listener that re-derives colours whenever
 * the admin updates site content (which might include colour values).
 */
export function setupColorSync(): () => void {
  // Initial sync
  syncDerivedColors();

  const handler = () => syncDerivedColors();
  window.addEventListener('adminSettingsChanged', handler);
  window.addEventListener('siteContentUpdated', handler);  // fire this from useSiteContent after saves

  return () => {
    window.removeEventListener('adminSettingsChanged', handler);
    window.removeEventListener('siteContentUpdated', handler);
  };
}