/**
 * VisualSectionEditor.tsx  v3.3
 *
 * Changes over v3.2:
 *   - FIXED: Elements can now be dragged vertically
 *   - Added GRID_ROWS = 20 (5% increments) — mirrors the 12-column x-axis system
 *   - Added pctToRow() and snapToRow() helpers
 *   - gridRow now explicitly set on every element in renderCanvas AND generateTSX
 *   - y snaps to 20-row boundaries during drag (same as x snaps to columns)
 *   - generateTSX wrapper CSS now includes grid-template-rows: repeat(20, auto)
 *   - gap changed to '8px 16px' (row-gap 8px, col-gap 16px) for tighter vertical flow
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Type, Image as ImageIcon, Trash2, ChevronUp, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  Eye, Code2, Layers, Settings, RotateCcw, Copy,
  Lock, Unlock, Columns, Paintbrush, LayoutTemplate, Move, RefreshCw, Link,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import CodeProjectRenderer from './CodeProjectRenderer';
import ImageUpload from './ImageUpload';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ElementType = 'text' | 'image' | 'button';
export type EditorMode = 'standard' | 'code';
export type ViewMode = 'visual' | 'split' | 'code';

/** Unit used for element height on the canvas */
export type HeightUnit = 'px' | '%';

export interface VisualElement {
  id: string;
  type: ElementType;
  x: number;       // % 0-100
  y: number;       // % 0-100
  width: number;   // % 0-100
  height: number;  // px or %, 0 = auto
  heightUnit?: HeightUnit; // 'px' (default) | '%'
  content: string;
  style: ElementStyle;
  locked: boolean;
  zIndex: number;
  /** For buttons: href/link target */
  href?: string;
  /** For buttons: action type */
  actionType?: 'none' | 'navigate' | 'external' | 'scroll';
  /** For images: raw SVG markup instead of a URL */
  svgContent?: string;
  /** For CSS-class-based elements: the className they use */
  className?: string;
  /** For CSS-class-based elements: the CSS selector this element's styles come from */
  cssSelector?: string;
}

export interface ElementStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  padding?: number;
  opacity?: number;
  objectFit?: 'cover' | 'contain' | 'fill';
  lineHeight?: number;
  letterSpacing?: number;
}

export interface BackgroundConfig {
  type: 'color' | 'image' | 'gradient';
  color: string;
  imageUrl?: string;
  imageOpacity: number;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
}

export interface VisualSection {
  id: string;
  background: BackgroundConfig;
  elements: VisualElement[];
  minHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface VisualSectionEditorProps {
  mode: EditorMode;
  initialData?: {
    title: string;
    description: string;
    image_url?: string;
    image_url_2?: string;
    image_url_3?: string;
  };
  initialCode?: string;
  initialComponentName?: string;
  onSave: (result: {
    codeFile: { filename: string; language: 'tsx'; content: string };
    images: string[];
    componentName: string;
  }) => void;
  onRevertToStandard?: () => void;
  onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Babel loader
// ─────────────────────────────────────────────────────────────────────────────

let _babelReady = false;
let _babelPromise: Promise<void> | null = null;

function ensureBabel(): Promise<void> {
  if (_babelReady) return Promise.resolve();
  if (_babelPromise) return _babelPromise;
  _babelPromise = new Promise((resolve, reject) => {
    if ((window as any).Babel?.packages?.parser) { _babelReady = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js';
    s.onload = () => { _babelReady = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Babel'));
    document.head.appendChild(s);
  });
  return _babelPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONTS = ['sans-serif','serif','monospace','Georgia','Palatino','Garamond','Arial','Helvetica','Verdana','Trebuchet MS','Impact'];
const SNAP_THRESHOLD = 8;
const GRID_COLS = 12;
const GRID_ROWS = 20; // ← NEW: 20 rows = 5% increments for vertical placement

const VE_MARKER_START = '// @ve-data:';
const VE_MARKER_END   = '// @ve-end';

function uid() { return Math.random().toString(36).slice(2, 10); }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// Grid column helpers — identical to generateTSX
function pctToCol(pct: number) {
  return Math.max(1, Math.min(GRID_COLS, Math.round((pct / 100) * GRID_COLS) + 1));
}
function pctToColEnd(x: number, w: number) {
  return Math.max(2, Math.min(GRID_COLS + 1, Math.round(((x + w) / 100) * GRID_COLS) + 1));
}
// Snap an x% value to the nearest column boundary
function snapToCol(pct: number): number {
  const colSize = 100 / GRID_COLS;
  return Math.round(pct / colSize) * colSize;
}

// ── NEW: Grid row helpers — mirrors column helpers ────────────────────────────
function pctToRow(pct: number): number {
  return Math.max(1, Math.min(GRID_ROWS, Math.round((pct / 100) * GRID_ROWS) + 1));
}
// Snap a y% value to the nearest row boundary
function snapToRow(pct: number): number {
  const rowSize = 100 / GRID_ROWS;
  return Math.round(pct / rowSize) * rowSize;
}

// ─────────────────────────────────────────────────────────────────────────────
// TSX code generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateTSX(section: VisualSection, name: string): string {
  const bg = section.background;

  const statePayload = JSON.stringify({ section, name }, null, 0);
  const chunks: string[] = [];
  for (let i = 0; i < statePayload.length; i += 120) chunks.push(statePayload.slice(i, i+120));
  const stateBlock = [VE_MARKER_START, ...chunks.map(c => `// ${c}`), VE_MARKER_END].join('\n');

  const cls = `ve_${name.toLowerCase().replace(/[^a-z0-9]/g,'')}`;

  const bgValue = bg.type === 'gradient'
    ? `linear-gradient(${bg.gradientAngle??135}deg, ${bg.gradientFrom??'#1a1a2e'}, ${bg.gradientTo??'#16213e'})`
    : bg.color;

  // Sort elements top-to-bottom, left-to-right (same as canvas)
  const flowEls = [...section.elements].sort((a, b) => a.y - b.y || a.x - b.x);

  const elStyles: string[] = [];
  const elJSX: string[] = [];

  const hasNavigateButton = flowEls.some(el => el.type === 'button' && el.actionType === 'navigate' && el.href);

  flowEls.forEach((el, i) => {
    const elCls = `${cls}_e${i}`;
    const colStart = pctToCol(el.x);
    const colEnd   = pctToColEnd(el.x, el.width);
    const safeEnd  = colEnd <= colStart ? colStart + 1 : colEnd;
    const rowStart = pctToRow(el.y); // ← NEW: explicit row placement

    // ← UPDATED: now includes grid-row
    elStyles.push(`.${elCls}{grid-column:${colStart}/${safeEnd};grid-row:${rowStart};}`);

    const opacity = el.style.opacity ?? 1;
    const heightUnit = el.heightUnit ?? 'px';
    const heightStyle = el.height > 0
      ? `height:${el.height}${heightUnit};`
      : '';

    if (el.type === 'text') {
      const css = [
        `font-size:${el.style.fontSize??16}px`,
        `font-family:${el.style.fontFamily??'sans-serif'}`,
        `font-weight:${el.style.fontWeight??'normal'}`,
        `font-style:${el.style.fontStyle??'normal'}`,
        `text-decoration:${el.style.textDecoration??'none'}`,
        `text-align:${el.style.textAlign??'left'}`,
        `color:${el.style.color??'#ffffff'}`,
        `line-height:${el.style.lineHeight??1.5}`,
        `letter-spacing:${el.style.letterSpacing??0}px`,
        `opacity:${opacity}`,
        `white-space:pre-wrap`,
        el.style.backgroundColor ? `background-color:${el.style.backgroundColor}` : '',
        el.style.padding ? `padding:${el.style.padding}px;border-radius:${el.style.borderRadius??0}px` : '',
        heightStyle,
      ].filter(Boolean).join(';');
      elStyles.push(`.${elCls}{${css}}`);
      const txt = el.content.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\${/g,'\\${');
      elJSX.push(`      <div className="${elCls}">${txt}</div>`);

    } else if (el.type === 'image') {
      const css = [
        `display:block`, `width:100%`, `max-width:100%`,
        el.height > 0 ? `height:${el.height}${heightUnit}` : '',
        `object-fit:${el.style.objectFit??'cover'}`,
        `border-radius:${el.style.borderRadius??0}px`,
        `opacity:${opacity}`,
      ].filter(Boolean).join(';');
      elStyles.push(`.${elCls}{${css}}`);
      if (el.svgContent) {
        const safeSvg = el.svgContent.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\${/g,'\\${');
        elJSX.push(`      <div className="${elCls}" dangerouslySetInnerHTML={{ __html: \`${safeSvg}\` }} />`);
      } else {
        elJSX.push(`      <img src="${el.content}" alt="" className="${elCls}" />`);
      }

    } else if (el.type === 'button') {
      const p = el.style.padding ?? 12;
      const css = [
        `display:inline-flex`, `align-items:center`, `justify-content:center`,
        `padding:${p}px ${p*2}px`,
        `border-radius:${el.style.borderRadius??8}px`,
        `background-color:${el.style.backgroundColor??'#0F52BA'}`,
        `color:${el.style.color??'#ffffff'}`,
        `font-size:${el.style.fontSize??16}px`,
        `font-weight:${el.style.fontWeight??'bold'}`,
        `font-family:${el.style.fontFamily??'sans-serif'}`,
        `cursor:pointer`, `border:none`,
        `opacity:${opacity}`,
        heightStyle,
      ].filter(Boolean).join(';');
      elStyles.push(`.${elCls}{${css}}`);
      const label = el.content.replace(/"/g,'\\"');
      if (el.actionType === 'navigate' && el.href) {
        elJSX.push(`      <button className="${elCls}" onClick={() => navigate('${el.href}')}>${label}</button>`);
      } else if (el.actionType === 'external' && el.href) {
        elJSX.push(`      <a href="${el.href}" target="_blank" rel="noopener noreferrer" className="${elCls}" style={{textDecoration:'none'}}>${label}</a>`);
      } else if (el.actionType === 'scroll' && el.href) {
        elJSX.push(`      <button className="${elCls}" onClick={() => { const t=document.querySelector('${el.href}'); if(t) t.scrollIntoView({behavior:'smooth'}); }}>${label}</button>`);
      } else {
        elJSX.push(`      <button className="${elCls}">${label}</button>`);
      }
    }
  });

  const { top: padT, right: padR, bottom: padB, left: padL } = section.padding;

  const tabletPlacement = flowEls.map((el, i) => {
    const c1 = Math.max(1, Math.round((el.x / 100) * 6) + 1);
    const c2 = Math.min(7, Math.round(((el.x + el.width) / 100) * 6) + 1);
    const r1 = pctToRow(el.y);
    return `.${cls}_e${i}{grid-column:${c1}/${c2 <= c1 ? c1+1 : c2};grid-row:${r1};}`;
  }).join('');

  const mobilePlacement = flowEls.map((el, i) => {
    const r1 = pctToRow(el.y);
    return `.${cls}_e${i}{grid-column:1/-1;width:100%;grid-row:${r1};}`;
  }).join('');

  const bgImgCss = bg.type === 'image' && bg.imageUrl
    ? `.${cls}_bg{position:absolute;inset:0;background-image:url(${bg.imageUrl});background-size:${bg.backgroundSize??'cover'};background-position:${bg.backgroundPosition??'center'};opacity:${(bg.imageOpacity/100).toFixed(2)};z-index:0;pointer-events:none;}`
    : '';

  // ← UPDATED: grid-template-rows added, gap split to 8px row / 16px col
  const css = `.${cls}_wrap{position:relative;width:100%;box-sizing:border-box;min-height:${section.minHeight}px;padding:${padT}px ${padR}px ${padB}px ${padL}px;background:${bgValue};display:grid;grid-template-columns:repeat(${GRID_COLS},1fr);grid-template-rows:repeat(${GRID_ROWS},auto);gap:8px 16px;align-items:start;}${bgImgCss}${elStyles.join('')}@media(max-width:900px){.${cls}_wrap{grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(${GRID_ROWS},auto);padding:${Math.round(padT*.8)}px ${Math.round(padR*.6)}px ${Math.round(padB*.8)}px ${Math.round(padL*.6)}px;gap:8px 12px;}${tabletPlacement}}@media(max-width:600px){.${cls}_wrap{grid-template-columns:1fr;grid-template-rows:repeat(${GRID_ROWS},auto);min-height:unset;padding:${Math.round(padT*.6)}px 16px ${Math.round(padB*.6)}px 16px;gap:8px 12px;}${mobilePlacement}}`;

  const bgImgJSX = bg.type === 'image' && bg.imageUrl
    ? `\n      <div className="${cls}_bg" />`
    : '';

  const navigateImport = hasNavigateButton
    ? `import { useNavigate } from 'react-router-dom';\n`
    : '';
  const navigateHook = hasNavigateButton
    ? `\n  const navigate = useNavigate();`
    : '';

  return `${stateBlock}
${navigateImport}const ${name} = () => {${navigateHook}
  return (
    <div className="${cls}_wrap">
      <style>{\`${css}\`}</style>${bgImgJSX}
${elJSX.join('\n')}
    </div>
  );
};

export default ${name};`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCSSValue(val: string): number {
  return parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
}

function parseStyleObject(node: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (!node || node.type !== 'JSXExpressionContainer') return result;
  const expr = node.expression;
  if (!expr || expr.type !== 'ObjectExpression') return result;
  for (const prop of expr.properties ?? []) {
    if (prop.type !== 'ObjectProperty') continue;
    const key = prop.key?.name ?? prop.key?.value ?? '';
    let value = '';
    if (prop.value?.type === 'StringLiteral') value = prop.value.value;
    else if (prop.value?.type === 'NumericLiteral') value = String(prop.value.value);
    else if (prop.value?.type === 'TemplateLiteral') value = prop.value.quasis?.[0]?.value?.cooked ?? '';
    if (key && value !== '') result[key] = value;
  }
  return result;
}

function getJSXText(node: any): string {
  if (!node?.children) return '';
  return node.children.map((c: any) => {
    if (c.type === 'JSXText') return c.value.trim();
    if (c.type === 'JSXExpressionContainer' && c.expression?.type === 'StringLiteral') return c.expression.value;
    if (c.type === 'JSXExpressionContainer' && c.expression?.type === 'TemplateLiteral') return c.expression.quasis?.[0]?.value?.cooked ?? '';
    return '';
  }).join(' ').trim();
}

function getAttr(node: any, name: string): any {
  return node?.openingElement?.attributes?.find((a: any) => a?.name?.name === name);
}

function getAttrStringValue(node: any, name: string): string {
  const attr = getAttr(node, name);
  if (!attr) return '';
  if (attr.value?.type === 'StringLiteral') return attr.value.value;
  if (attr.value?.type === 'JSXExpressionContainer') {
    const e = attr.value.expression;
    if (e?.type === 'StringLiteral') return e.value;
    if (e?.type === 'TemplateLiteral') return e.quasis?.[0]?.value?.cooked ?? '';
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS class-based component parser
// ─────────────────────────────────────────────────────────────────────────────

export interface CSSRule { selector: string; property: string; value: string; }

export function extractCSSRules(tsxCode: string): CSSRule[] {
  const match = tsxCode.match(/(?:const|let|var)\s+\w*[Ss]tyl\w*\s*=\s*`([\s\S]*?)`/);
  if (!match) return [];
  const css = match[1];
  const rules: CSSRule[] = [];
  const blockRe = /([^{}@]+)\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const decls = m[2].split(';').map(d => d.trim()).filter(Boolean);
    for (const decl of decls) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      rules.push({ selector, property: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim() });
    }
  }
  return rules;
}

export function applyCSSTweak(tsxCode: string, selector: string, property: string, newValue: string): string {
  return tsxCode.replace(
    /(?<=(?:const|let|var)\s+\w*[Ss]tyl\w*\s*=\s*`)([\s\S]*?)(?=`)/,
    (css) => {
      const selEsc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const propEsc = property.replace(/-/g, '\\-');
      const blockRe = new RegExp(`(${selEsc}\\s*\\{[^{}]*?)${propEsc}\\s*:\\s*[^;]+;`);
      if (blockRe.test(css)) {
        return css.replace(blockRe, `$1${property}: ${newValue};`);
      }
      const addRe = new RegExp(`(${selEsc}\\s*\\{)`);
      if (addRe.test(css)) {
        return css.replace(addRe, `$1\n      ${property}: ${newValue};`);
      }
      return css;
    }
  );
}

function parseCSSToMap(css: string): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  const blockRe = /([^{}@]+)\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const props = new Map<string, string>();
    m[2].split(';').forEach(decl => {
      const colon = decl.indexOf(':');
      if (colon < 0) return;
      props.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
    });
    map.set(selector, props);
  }
  return map;
}

function cssToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function resolveClassStyles(className: string, cssMap: Map<string, Map<string, string>>): Record<string, string> {
  const result: Record<string, string> = {};
  const candidates = [`.${className}`, className];
  for (const [sel, props] of cssMap) {
    const stripped = sel.replace(/\s+/g, ' ').trim();
    if (candidates.some(c => stripped === c || stripped.endsWith(c))) {
      for (const [k, v] of props) {
        result[cssToCamel(k)] = v;
      }
    }
  }
  return result;
}

export function parseCSSClassTSXToCanvas(tsxCode: string): VisualSection | null {
  const Babel = (window as any).Babel;
  if (!Babel?.packages?.parser) return null;

  const cssMatch = tsxCode.match(/(?:const|let|var)\s+\w*[Ss]tyl\w*\s*=\s*`([\s\S]*?)`/);
  if (!cssMatch) return null;

  const cssMap = parseCSSToMap(cssMatch[1]);
  if (cssMap.size === 0) return null;

  let ast: any;
  try {
    ast = Babel.packages.parser.parse(tsxCode, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch { return null; }

  const section: VisualSection = {
    id: uid(),
    background: { type: 'color', color: '#262626', imageOpacity: 80 },
    elements: [],
    minHeight: 500,
    padding: { top: 48, right: 40, bottom: 48, left: 40 },
  };

  let elementIndex = 0;

  function getClassNames(node: any): string[] {
    const attr = getAttr(node, 'className');
    if (!attr) return [];
    if (attr.value?.type === 'StringLiteral') return attr.value.value.split(/\s+/).filter(Boolean);
    if (attr.value?.type === 'JSXExpressionContainer') {
      const e = attr.value.expression;
      if (e?.type === 'StringLiteral') return e.value.split(/\s+/).filter(Boolean);
      if (e?.type === 'TemplateLiteral') return (e.quasis?.[0]?.value?.cooked ?? '').split(/\s+/).filter(Boolean);
    }
    return [];
  }

  function getInlineStyle(node: any): Record<string, string> {
    const styleAttr = getAttr(node, 'style');
    if (!styleAttr?.value) return {};
    return parseStyleObject(styleAttr.value);
  }

  function walk(node: any, depth = 0): void {
    if (!node || typeof node !== 'object') return;
    if (node.type !== 'JSXElement') {
      if (Array.isArray(node)) node.forEach((c: any) => walk(c, depth));
      else {
        for (const key of Object.keys(node)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach((c: any) => walk(c, depth));
          else if (child && typeof child === 'object' && child.type) walk(child, depth);
        }
      }
      return;
    }

    const tag = node.openingElement?.name?.name ?? '';
    const classes = getClassNames(node);
    const inlineS = getInlineStyle(node);

    if (depth <= 2 && tag === 'div' && inlineS.backgroundColor) {
      section.background.color = inlineS.backgroundColor;
      section.background.type = 'color';
    }

    if (tag === 'div' && classes.some(c => c.includes('container') || c.includes('wrap'))) {
      const resolved = classes.reduce((acc, cls) => ({ ...acc, ...resolveClassStyles(cls, cssMap) }), {} as Record<string, string>);
      if (resolved.padding) {
        const padVal = parseCSSValue(resolved.padding);
        section.padding = { top: padVal, right: padVal, bottom: padVal, left: padVal };
      }
      if (resolved.paddingTop) section.padding.top = parseCSSValue(resolved.paddingTop);
      if (resolved.paddingBottom) section.padding.bottom = parseCSSValue(resolved.paddingBottom);
      if (resolved.paddingLeft) section.padding.left = parseCSSValue(resolved.paddingLeft);
      if (resolved.paddingRight) section.padding.right = parseCSSValue(resolved.paddingRight);
    }

    if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
      const text = getJSXText(node);
      if (text) {
        const resolved = classes.reduce((acc, cls) => ({ ...acc, ...resolveClassStyles(cls, cssMap) }), {} as Record<string, string>);
        const isTitle = tag === 'h1' || classes.some(c => c.includes('title') || c.includes('heading'));
        const cssSelector = classes.find(c => cssMap.has(`.${c}`)) ?? classes[0] ?? '';
        section.elements.push({
          id: uid(), type: 'text',
          x: isTitle ? 5 : 5 + (elementIndex % 4) * 23,
          y: isTitle ? 5 : 20 + Math.floor(elementIndex / 4) * 35,
          width: isTitle ? 80 : 20,
          height: 0, heightUnit: 'px', locked: false, zIndex: elementIndex + 1,
          content: text, className: classes[0],
          cssSelector: cssSelector ? `.${cssSelector}` : '',
          style: {
            fontSize: parseCSSValue(resolved.fontSize ?? (tag === 'h1' ? '36px' : tag === 'h2' ? '28px' : '20px')),
            fontWeight: (resolved.fontWeight === '700' || resolved.fontWeight === 'bold' ? 'bold' : 'normal') as any,
            color: resolved.color ?? '#ffffff', fontFamily: resolved.fontFamily ?? 'sans-serif',
            textAlign: (resolved.textAlign as any) ?? 'left',
            lineHeight: parseFloat(resolved.lineHeight ?? '1.2') || 1.2,
            letterSpacing: parseCSSValue(resolved.letterSpacing ?? '0'),
          },
        });
        elementIndex++;
        return;
      }
    }

    if (tag === 'p') {
      const text = getJSXText(node);
      if (text) {
        const resolved = classes.reduce((acc, cls) => ({ ...acc, ...resolveClassStyles(cls, cssMap) }), {} as Record<string, string>);
        const cssSelector = classes.find(c => cssMap.has(`.${c}`)) ?? classes[0] ?? '';
        section.elements.push({
          id: uid(), type: 'text',
          x: 5 + (elementIndex % 4) * 23,
          y: 35 + Math.floor((elementIndex - 1) / 4) * 35,
          width: 20, height: 0, heightUnit: 'px', locked: false, zIndex: elementIndex + 1,
          content: text, className: classes[0],
          cssSelector: cssSelector ? `.${cssSelector}` : '',
          style: {
            fontSize: parseCSSValue(resolved.fontSize ?? '14px'),
            color: resolved.color ?? '#d4d4d4', fontFamily: resolved.fontFamily ?? 'sans-serif',
            textAlign: (resolved.textAlign as any) ?? 'left',
            lineHeight: parseFloat(resolved.lineHeight ?? '1.6') || 1.6,
          },
        });
        elementIndex++;
        return;
      }
    }

    if (tag === 'button') {
      const text = getJSXText(node);
      const resolved = classes.reduce((acc, cls) => ({ ...acc, ...resolveClassStyles(cls, cssMap) }), {} as Record<string, string>);
      const cssSelector = classes.find(c => cssMap.has(`.${c}`)) ?? classes[0] ?? '';
      section.elements.push({
        id: uid(), type: 'button',
        x: 5, y: 80, width: 20, height: 0, heightUnit: 'px', locked: false, zIndex: elementIndex + 1,
        content: text || 'Button', className: classes[0],
        cssSelector: cssSelector ? `.${cssSelector}` : '',
        style: {
          fontSize: parseCSSValue(resolved.fontSize ?? '16px'), fontWeight: 'bold',
          color: resolved.color ?? '#ffffff', backgroundColor: resolved.backgroundColor ?? '#0F52BA',
          borderRadius: parseCSSValue(resolved.borderRadius ?? '8px'),
          padding: parseCSSValue(resolved.padding ?? '12px'),
        },
      });
      elementIndex++;
      return;
    }

    if (tag === 'img') {
      const src = getAttrStringValue(node, 'src');
      const resolved = classes.reduce((acc, cls) => ({ ...acc, ...resolveClassStyles(cls, cssMap) }), {} as Record<string, string>);
      section.elements.push({
        id: uid(), type: 'image',
        x: 60, y: 10, width: 35, height: parseCSSValue(resolved.height ?? '200px'), heightUnit: 'px',
        locked: false, zIndex: elementIndex + 1, content: src, className: classes[0], cssSelector: '',
        style: { borderRadius: parseCSSValue(resolved.borderRadius ?? '0'), objectFit: 'cover', opacity: 1 },
      });
      elementIndex++;
      return;
    }

    for (const child of node.children ?? []) walk(child, depth + 1);
  }

  walk(ast);

  const textEls = section.elements.filter(e => e.type === 'text');
  const bigTitle = textEls.find(e => e.style.fontSize && e.style.fontSize >= 28);

  if (bigTitle) { bigTitle.x = 5; bigTitle.y = 5; bigTitle.width = 85; }

  const cardItems = section.elements.filter(e => e !== bigTitle);
  if (cardItems.length > 0) {
    const cols = Math.min(cardItems.length, 4);
    const colW = Math.floor(85 / cols);
    cardItems.forEach((el, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      el.x = 5 + col * colW;
      el.y = bigTitle ? 25 + row * 28 : 5 + row * 28;
      el.width = colW - 2;
    });
  }

  if (section.elements.length === 0) return null;
  return section;
}


// ─────────────────────────────────────────────────────────────────────────────
// Fast state extraction — @ve-data block
// ─────────────────────────────────────────────────────────────────────────────

export function extractVEData(tsxCode: string): { section: VisualSection; name: string } | null {
  const startIdx = tsxCode.indexOf(VE_MARKER_START);
  const endIdx   = tsxCode.indexOf(VE_MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const block = tsxCode.slice(startIdx + VE_MARKER_START.length, endIdx);
  const json = block
    .split('\n')
    .map(line => line.replace(/^\/\/ ?/, ''))
    .join('');

  try {
    const parsed = JSON.parse(json) as { section: VisualSection; name: string };
    if (!parsed?.section?.elements) return null;
    return {
      name: parsed.name,
      section: {
        ...parsed.section,
        id: uid(),
        elements: parsed.section.elements.map(el => ({
          ...el,
          id: uid(),
          heightUnit: el.heightUnit ?? 'px',
        })),
      },
    };
  } catch { return null; }
}

export function parseTSXToCanvas(tsxCode: string): VisualSection | null {
  const fast = extractVEData(tsxCode);
  if (fast) return fast.section;

  const Babel = (window as any).Babel;
  if (!Babel?.packages?.parser) return null;

  if (/(?:const|let|var)\s+\w*[Ss]tyl\w*\s*=\s*`/.test(tsxCode)) {
    const classResult = parseCSSClassTSXToCanvas(tsxCode);
    if (classResult) return classResult;
  }

  let ast: any;
  try {
    ast = Babel.packages.parser.parse(tsxCode, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch { return null; }

  const section: VisualSection = {
    id: uid(),
    background: { type: 'color', color: '#262626', imageOpacity: 80 },
    elements: [],
    minHeight: 400,
    padding: { top: 48, right: 40, bottom: 48, left: 40 },
  };
  let zIndex = 1;

  function extractBackground(node: any): boolean {
    if (node.type !== 'JSXElement') return false;
    const tag = node.openingElement?.name?.name ?? '';
    if (tag !== 'div') return false;
    const style = parseStyleObject(getAttr(node, 'style')?.value);
    const bg = style.backgroundColor ?? style.background ?? '';
    if (!bg) return false;
    if (bg.includes('linear-gradient')) {
      section.background.type = 'gradient';
      const colors = bg.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
      section.background.gradientFrom = colors[0] ?? '#1a1a2e';
      section.background.gradientTo = colors[1] ?? '#16213e';
    } else {
      section.background.type = 'color';
      section.background.color = bg;
    }
    if (style.minHeight) section.minHeight = parseCSSValue(style.minHeight);
    return true;
  }

  function walk(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'JSXElement') {
      const tag = node.openingElement?.name?.name ?? '';
      const styleAttr = getAttr(node, 'style');
      const style = parseStyleObject(styleAttr?.value);

      if (tag === 'style') return;

      if (tag === 'div' && style.backgroundImage && style.position === 'absolute') {
        const m = style.backgroundImage.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (m?.[1]) {
          section.background.type = 'image';
          section.background.imageUrl = m[1];
          section.background.imageOpacity = parseFloat(style.opacity ?? '0.8') * 100;
          if (style.backgroundSize) section.background.backgroundSize = style.backgroundSize as any;
        }
        return;
      }

      if (tag === 'div' && style.backgroundColor) {
        extractBackground(node);
        for (const child of node.children ?? []) walk(child);
        return;
      }

      if (style.position === 'absolute') {
        const x = parseCSSValue(style.left ?? '5');
        const y = parseCSSValue(style.top ?? '5');
        const w = parseCSSValue(style.width ?? '40');
        const op = parseFloat(style.opacity ?? '1') || 1;

        if (tag === 'img') {
          section.elements.push({
            id: uid(), type: 'image', x, y, width: w,
            height: parseCSSValue(style.height ?? '0'), heightUnit: 'px',
            locked: false, zIndex: zIndex++, content: getAttrStringValue(node, 'src'),
            style: { objectFit: (style.objectFit ?? 'cover') as any, borderRadius: parseCSSValue(style.borderRadius ?? '0'), opacity: op },
          });
          return;
        }
        if (tag === 'button') {
          section.elements.push({
            id: uid(), type: 'button', x, y, width: w, height: 0, heightUnit: 'px',
            locked: false, zIndex: zIndex++, content: getJSXText(node),
            style: {
              backgroundColor: style.backgroundColor ?? '#0F52BA', color: style.color ?? '#ffffff',
              fontSize: parseCSSValue(style.fontSize ?? '16'),
              fontWeight: (style.fontWeight === 'bold' || style.fontWeight === '700' ? 'bold' : 'normal') as any,
              borderRadius: parseCSSValue(style.borderRadius ?? '8'), padding: parseCSSValue(style.padding ?? '12'),
              fontFamily: style.fontFamily ?? 'sans-serif', opacity: op,
            },
          });
          return;
        }
        const text = getJSXText(node);
        if (text) {
          section.elements.push({
            id: uid(), type: 'text', x, y, width: w, height: 0, heightUnit: 'px',
            locked: false, zIndex: zIndex++, content: text,
            style: {
              fontSize: parseCSSValue(style.fontSize ?? '16'), fontFamily: style.fontFamily ?? 'sans-serif',
              fontWeight: (style.fontWeight === 'bold' || style.fontWeight === '700' ? 'bold' : 'normal') as any,
              fontStyle: (style.fontStyle === 'italic' ? 'italic' : 'normal') as any,
              textDecoration: (style.textDecoration === 'underline' ? 'underline' : 'none') as any,
              textAlign: (style.textAlign ?? 'left') as any, color: style.color ?? '#ffffff',
              lineHeight: parseFloat(style.lineHeight ?? '1.5') || 1.5, letterSpacing: parseCSSValue(style.letterSpacing ?? '0'),
              backgroundColor: style.backgroundColor, padding: style.padding ? parseCSSValue(style.padding) : undefined,
              borderRadius: style.borderRadius ? parseCSSValue(style.borderRadius) : undefined, opacity: op,
            },
          });
          return;
        }
      }

      for (const child of node.children ?? []) walk(child);
      return;
    }

    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && child.type) walk(child);
    }
  }

  walk(ast);

  if (section.elements.length === 0 && section.background.type === 'color' && section.background.color === '#262626') {
    return null;
  }
  return section;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline TSX Style Extraction & Editing
// ─────────────────────────────────────────────────────────────────────────────

export interface InlineStyleDef {
  elementName: string; path: string; styles: Record<string,string|number>;
  isAbsolute?: boolean; bounds?: {left:number;top:number;width:number;height:number};
}

export function extractInlineStyles(tsxCode: string): InlineStyleDef[] {
  const Babel = (window as any).Babel;
  if (!Babel?.packages?.parser) return [];
  let ast: any;
  try { ast = Babel.packages.parser.parse(tsxCode, {sourceType:'module',plugins:['jsx','typescript']}); }
  catch { return []; }
  const inlineStyles: InlineStyleDef[] = [];
  let pathCounter = 0;
  function walk(node: any, depth = 0): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') {
      const tag = node.openingElement?.name?.name ?? '';
      const styleAttr = node.openingElement?.attributes?.find((a:any) => a?.name?.name === 'style');
      if (styleAttr?.value?.type === 'JSXExpressionContainer') {
        const expr = styleAttr.value.expression;
        if (expr?.type === 'ObjectExpression') {
          const styles: Record<string,string|number> = {};
          let isAbsolute = false;
          const bounds = {left:0,top:0,width:0,height:0};
          expr.properties?.forEach((prop:any) => {
            if (prop.type !== 'ObjectProperty') return;
            const key = prop.key?.name ?? prop.key?.value ?? '';
            let value: string|number = '';
            if (prop.value?.type === 'StringLiteral') value = prop.value.value;
            else if (prop.value?.type === 'NumericLiteral') value = prop.value.value;
            if (key && value !== '') {
              styles[key] = value;
              if (key === 'position' && value === 'absolute') isAbsolute = true;
              if (key === 'left') bounds.left = parseFloat(String(value));
              if (key === 'top') bounds.top = parseFloat(String(value));
              if (key === 'width') bounds.width = parseFloat(String(value));
              if (key === 'height') bounds.height = parseFloat(String(value));
            }
          });
          if (Object.keys(styles).length > 0) {
            inlineStyles.push({elementName:tag,path:`${tag}_${pathCounter++}`,styles,isAbsolute,bounds:isAbsolute?bounds:undefined});
          }
        }
      }
      for (const child of node.children ?? []) walk(child, depth + 1);
      return;
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(c => walk(c, depth));
      else if (child && typeof child === 'object' && child.type) walk(child, depth);
    }
  }
  walk(ast);
  return inlineStyles;
}

export function applyInlineStyleTweak(tsxCode:string,path:string,property:string,newValue:string|number):string {
  const valueStr = typeof newValue === 'string' ? `'${newValue}'` : String(newValue);
  const propPattern = new RegExp(`(${property}\\s*:\\s*)(['"]?[^,}]+['"]?)`,'g');
  return tsxCode.replace(propPattern, `$1${valueStr}`);
}

export function updateInlineStyleMultiple(tsxCode:string,path:string,updates:Record<string,string|number>):string {
  let result = tsxCode;
  Object.entries(updates).forEach(([prop,val]) => { result = applyInlineStyleTweak(result,path,prop,val); });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared UI atoms
// ─────────────────────────────────────────────────────────────────────────────

const CP: React.FC<{value:string;onChange:(v:string)=>void;label:string}> = ({value,onChange,label}) => (
  <div className="flex items-center gap-2">
    <label className="text-xs text-neutral-400 w-20 flex-shrink-0">{label}</label>
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input type="color" value={value||'#ffffff'} onChange={e=>onChange(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-neutral-600 bg-transparent p-0 flex-shrink-0" />
      <input type="text" value={value||''} onChange={e=>onChange(e.target.value)} className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white font-mono min-w-0" placeholder="#ffffff" />
    </div>
  </div>
);

const SL: React.FC<{value:number;onChange:(v:number)=>void;label:string;min?:number;max?:number;step?:number;unit?:string}> = ({value,onChange,label,min=0,max=100,step=1,unit=''}) => (
  <div className="flex items-center gap-2">
    <label className="text-xs text-neutral-400 w-20 flex-shrink-0">{label}</label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="flex-1 accent-primary" />
    <span className="text-xs text-white w-12 text-right">{value}{unit}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const VisualSectionEditor: React.FC<VisualSectionEditorProps> = ({
  mode, initialData, initialCode, initialComponentName, onSave, onRevertToStandard, onCancel,
}) => {
  const navigate = useNavigate();

  const buildInitial = useCallback((): VisualSection => {
    const els: VisualElement[] = [];
    let z = 1;
    if (initialData) {
      if (initialData.title) els.push({id:uid(),type:'text',x:5,y:8,width:55,height:0,heightUnit:'px',locked:false,zIndex:z++,content:initialData.title,style:{fontSize:36,fontWeight:'bold',color:'#ffffff',fontFamily:'sans-serif',textAlign:'left',lineHeight:1.2}});
      if (initialData.description) els.push({id:uid(),type:'text',x:5,y:32,width:50,height:0,heightUnit:'px',locked:false,zIndex:z++,content:initialData.description.replace(/<[^>]+>/g,''),style:{fontSize:16,color:'#d4d4d4',fontFamily:'sans-serif',textAlign:'left',lineHeight:1.6}});
      if (initialData.image_url) els.push({id:uid(),type:'image',x:58,y:5,width:38,height:0,heightUnit:'px',locked:false,zIndex:z++,content:initialData.image_url,style:{borderRadius:8,objectFit:'cover',opacity:1}});
      [initialData.image_url_2,initialData.image_url_3].filter(Boolean).forEach((u,i)=>{els.push({id:uid(),type:'image',x:58+i*20,y:62,width:18,height:0,heightUnit:'px',locked:false,zIndex:z++,content:u!,style:{borderRadius:6,objectFit:'cover',opacity:1}});});
    }
    return {id:uid(),background:{type:'color',color:'#262626',imageOpacity:80},elements:els,minHeight:400,padding:{top:48,right:40,bottom:48,left:40}};
  }, [initialData]);

  const [section, setSection] = useState<VisualSection>(buildInitial);
  const [selId, setSelId] = useState<string|null>(null);
  const [panel, setPanel] = useState<'layers'|'background'|'element'|'css'|'inline'>('layers');
  const [viewMode, setViewMode] = useState<ViewMode>(mode==='code' ? 'split' : 'visual');
  const [preview, setPreview] = useState(false);
  const [compName, setCompName] = useState(initialComponentName??'VisualSection');
  const [code, setCode] = useState(initialCode??'');
  const [parsingCanvas, setParsingCanvas] = useState(false);
  const [babelLoading, setBabelLoading] = useState(!!initialCode);
  const codeWasManuallyEdited = useRef(!!initialCode);
  const [snapLines, setSnapLines] = useState<{x:number[];y:number[]}>({x:[],y:[]});
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPriority, setSnapPriority] = useState<'canvas'|'element'>('canvas');
  const [deviceWidth, setDeviceWidth] = useState<number|null>(null);
  const [draggedInlineId, setDraggedInlineId] = useState<string|null>(null);
  const [cssFilterSel, setCssFilterSel] = useState('');
  const inlineDragOffset = useRef({x:0,y:0});

  const isClassBased = useMemo(() => {
    const src = mode === 'code' ? code : '';
    return /(?:const|let|var)\s+\w*[Ss]tyl\w*\s*=\s*`/.test(src);
  }, [code, mode]);

  const cssRules = useMemo(() => isClassBased ? extractCSSRules(code) : [], [code, isClassBased]);

  const inlineStyles = useMemo(() => {
    if (mode !== 'code' || isClassBased) return [];
    return extractInlineStyles(code);
  }, [code, mode, isClassBased]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStartPos = useRef({x:0,y:0});
  const dragOffset = useRef({x:0,y:0});
  const dragId = useRef<string|null>(null);

  const resizing = useRef(false);
  const resizeId = useRef<string|null>(null);
  const resizeEdge = useRef<'right'|'bottom'|'corner'>('right');
  const resizeStart = useRef({mouseX:0,mouseY:0,origW:0,origH:0});

  const selEl = useMemo(() => section.elements.find(e=>e.id===selId)??null, [section.elements,selId]);

  useEffect(() => {
    if (!initialCode) return;

    const fast = extractVEData(initialCode);
    if (fast) {
      const restoredName = fast.name || compName;
      setSection(fast.section);
      setCompName(restoredName);
      codeWasManuallyEdited.current = false;
      setCode(generateTSX(fast.section, restoredName));
      setBabelLoading(false);
      return;
    }

    ensureBabel().then(() => {
      const parsed = parseTSXToCanvas(initialCode);
      if (parsed) {
        setSection(parsed);
        codeWasManuallyEdited.current = false;
        setCode(generateTSX(parsed, compName));
      } else {
        codeWasManuallyEdited.current = true;
      }
      setBabelLoading(false);
    }).catch(() => {
      codeWasManuallyEdited.current = true;
      setBabelLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseFromCode = () => {
    setParsingCanvas(true);

    const fast = extractVEData(code);
    if (fast) {
      setSection(fast.section);
      setCompName(fast.name || compName);
      setSelId(null);
      codeWasManuallyEdited.current = false;
      toast.success('Canvas restored from embedded data');
      setParsingCanvas(false);
      return;
    }

    ensureBabel().then(() => {
      const parsed = parseTSXToCanvas(code);
      if (parsed) {
        setSection(parsed);
        setSelId(null);
        codeWasManuallyEdited.current = false;
        toast.success('Canvas updated from code');
      } else {
        toast.error('Could not parse — ensure this is a Visual Editor generated component');
      }
      setParsingCanvas(false);
    }).catch(() => {
      toast.error('Babel failed to load');
      setParsingCanvas(false);
    });
  };

  useEffect(() => {
    if (isClassBased) return;
    if (codeWasManuallyEdited.current) return;
    setCode(generateTSX(section, compName));
  }, [section, compName, isClassBased]);

  // ── Element CRUD ──────────────────────────────────────────────────────────
  const addEl = (type: ElementType) => {
    const maxZ = Math.max(...section.elements.map(e=>e.zIndex), 0);
    const defaultW = type==='image' ? 35 : type==='button' ? 20 : 45;

    let bestX = 5, bestY = 5;
    outer: for (let y = 5; y <= 80; y += 10) {
      for (let x = 5; x <= 100 - defaultW; x += 5) {
        const newL = x, newR = x + defaultW, newT = y, newB = y + 15;
        const overlaps = section.elements.some(el => {
          const elR = el.x + el.width, elB = el.y + (el.height > 0 ? (el.height / (section.minHeight||400)) * 100 : 15);
          return !(newR <= el.x || newL >= elR || newB <= el.y || newT >= elB);
        });
        if (!overlaps) { bestX = x; bestY = y; break outer; }
      }
    }

    const el: VisualElement = {
      id:uid(), type, x:bestX, y:bestY, width:defaultW, height:0, heightUnit:'px', locked:false, zIndex:maxZ+1,
      content: type==='text'?'New text':type==='button'?'Button':'',
      style: type==='text'?{fontSize:18,color:'#ffffff',fontFamily:'sans-serif',textAlign:'left',lineHeight:1.5}
        :type==='button'?{fontSize:16,fontWeight:'bold',color:'#ffffff',backgroundColor:'#0F52BA',borderRadius:8,padding:12}
        :{borderRadius:8,objectFit:'cover',opacity:1},
    };
    setSection(s=>({...s,elements:[...s.elements,el]}));
    setSelId(el.id); setPanel('element');
  };
  const delEl = (id:string) => { setSection(s=>({...s,elements:s.elements.filter(e=>e.id!==id)})); if(selId===id)setSelId(null); };
  const dupEl = (id:string) => {
    const el=section.elements.find(e=>e.id===id); if(!el)return;
    const maxZ=Math.max(...section.elements.map(e=>e.zIndex));
    const ne={...el,id:uid(),x:el.x+2,y:el.y+2,zIndex:maxZ+1};
    setSection(s=>({...s,elements:[...s.elements,ne]})); setSelId(ne.id);
  };
  const updEl = (id:string,u:Partial<VisualElement>) => setSection(s=>({...s,elements:s.elements.map(e=>e.id===id?{...e,...u}:e)}));
  const updSt = (id:string,u:Partial<ElementStyle>) => setSection(s=>({...s,elements:s.elements.map(e=>e.id===id?{...e,style:{...e.style,...u}}:e)}));
  const mvZ = (id:string,dir:'up'|'down') => {
    const els=[...section.elements].sort((a,b)=>a.zIndex-b.zIndex);
    const i=els.findIndex(e=>e.id===id);
    if(dir==='up'&&i<els.length-1)[els[i].zIndex,els[i+1].zIndex]=[els[i+1].zIndex,els[i].zIndex];
    else if(dir==='down'&&i>0)[els[i].zIndex,els[i-1].zIndex]=[els[i-1].zIndex,els[i].zIndex];
    setSection(s=>({...s,elements:els}));
  };

  const calculateSnapLines = useCallback((dragEl: VisualElement, canvasRect: DOMRect) => {
    if (!snapEnabled) { setSnapLines({x:[],y:[]}); return; }

    const T = SNAP_THRESHOLD;
    const dL = dragEl.x, dT = dragEl.y, dR = dragEl.x + dragEl.width;
    const dCX = dragEl.x + dragEl.width / 2;
    const elHPct = dragEl.height > 0 ? (dragEl.height / canvasRect.height) * 100 : 10;
    const dB = dragEl.y + elHPct, dCY = dragEl.y + elHPct / 2;

    const canvasX: number[] = [], canvasY: number[] = [];
    const elemX: number[] = [],   elemY: number[] = [];

    [0, 50, 100].forEach(g => {
      if (Math.abs(dL - g) < T || Math.abs(dR - g) < T || Math.abs(dCX - g) < T) canvasX.push(g);
    });
    [0, 50, 100].forEach(g => {
      if (Math.abs(dT - g) < T || Math.abs(dB - g) < T || Math.abs(dCY - g) < T) canvasY.push(g);
    });

    section.elements.forEach(el => {
      if (el.id === dragEl.id) return;
      const eL = el.x, eT = el.y, eR = el.x + el.width;
      const eHPct = el.height > 0 ? (el.height / canvasRect.height) * 100 : 10;
      const eB = el.y + eHPct, eCX = el.x + el.width / 2, eCY = el.y + eHPct / 2;
      if (Math.abs(dL-eL)<T) elemX.push(eL);
      if (Math.abs(dR-eR)<T) elemX.push(eR);
      if (Math.abs(dL-eR)<T) elemX.push(eR);
      if (Math.abs(dR-eL)<T) elemX.push(eL);
      if (Math.abs(dCX-eCX)<T) elemX.push(eCX);
      if (Math.abs(dT-eT)<T) elemY.push(eT);
      if (Math.abs(dB-eB)<T) elemY.push(eB);
      if (Math.abs(dT-eB)<T) elemY.push(eB);
      if (Math.abs(dB-eT)<T) elemY.push(eT);
      if (Math.abs(dCY-eCY)<T) elemY.push(eCY);
    });

    const mergeWithPriority = (primary: number[], secondary: number[]) => {
      const set = new Set(primary);
      secondary.forEach(v => set.add(v));
      return [...set].sort((a, b) => {
        const aInPrimary = primary.includes(a);
        const bInPrimary = primary.includes(b);
        if (aInPrimary && !bInPrimary) return 1;
        if (!aInPrimary && bInPrimary) return -1;
        return a - b;
      });
    };

    const allX = snapPriority === 'canvas'
      ? mergeWithPriority(canvasX, elemX)
      : mergeWithPriority(elemX, canvasX);
    const allY = snapPriority === 'canvas'
      ? mergeWithPriority(canvasY, elemY)
      : mergeWithPriority(elemY, canvasY);

    setSnapLines({ x: allX, y: allY });
  }, [section.elements, snapEnabled, snapPriority]);

  // ── Drag & Resize ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e:React.MouseEvent,id:string) => {
    if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
    e.stopPropagation();
    const el=section.elements.find(x=>x.id===id);
    if(!el||el.locked||preview) return;
    setSelId(id); setPanel('element');
    const r=canvasRef.current?.getBoundingClientRect();
    if(!r) return;
    // Store offset as % so dragging is in % space
    dragOffset.current={
      x: e.clientX - r.left - (el.x / 100) * r.width,
      y: e.clientY - r.top  - (el.y / 100) * r.height,
    };
    dragStartPos.current={x:e.clientX,y:e.clientY};
    dragId.current=id; dragging.current=true; dragMoved.current=false;
  },[section.elements,preview]);

  const onResizeDown = useCallback((e: React.MouseEvent, id: string, edge: 'right'|'bottom'|'corner') => {
    if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
    e.preventDefault(); e.stopPropagation();
    const el = section.elements.find(x => x.id === id);
    if (!el) return;
    resizing.current = true;
    resizeId.current = id;
    resizeEdge.current = edge;
    resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, origW: el.width, origH: el.height || 80 };
    setSelId(id); setPanel('element');
  }, [section.elements]);

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (draggedInlineId && mode === 'code') {
        const def = inlineStyles.find(d => d.path === draggedInlineId);
        if (!def || !def.bounds) return;
        const newLeft = e.clientX - inlineDragOffset.current.x;
        const newTop = e.clientY - inlineDragOffset.current.y;
        const updated = updateInlineStyleMultiple(code, draggedInlineId, {
          left: `${Math.round(newLeft)}px`, top: `${Math.round(newTop)}px`,
        });
        codeWasManuallyEdited.current = true;
        setCode(updated);
        return;
      }
      if (resizing.current && resizeId.current) {
        const canvas = canvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dx = e.clientX - resizeStart.current.mouseX;
        const dy = e.clientY - resizeStart.current.mouseY;
        if (resizeEdge.current === 'right' || resizeEdge.current === 'corner') {
          // Snap width to column boundaries
          const rawW = resizeStart.current.origW + (dx / rect.width) * 100;
          const colSize = 100 / GRID_COLS;
          const snappedW = Math.round(rawW / colSize) * colSize;
          const newW = clamp(snappedW, colSize, 98);
          updEl(resizeId.current, {width: Math.round(newW)});
        }
        if (resizeEdge.current === 'bottom' || resizeEdge.current === 'corner') {
          const newH = clamp(resizeStart.current.origH + dy, 20, 1200);
          updEl(resizeId.current, {height: Math.round(newH)});
        }
        return;
      }
      if (!dragging.current || !dragId.current) return;
      const dx0 = e.clientX - dragStartPos.current.x;
      const dy0 = e.clientY - dragStartPos.current.y;
      if (!dragMoved.current && Math.sqrt(dx0*dx0+dy0*dy0) < 3) return;
      dragMoved.current = true;
      const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;

      // Compute raw % position
      let xPct = ((e.clientX - r.left - dragOffset.current.x) / r.width) * 100;
      let yPct = ((e.clientY - r.top  - dragOffset.current.y) / r.height) * 100;

      // ← UPDATED: snap both axes when snap is enabled
      if (snapEnabled) {
        xPct = snapToCol(xPct);
        yPct = snapToRow(yPct); // ← NEW: snap y to row boundaries
      }

      xPct = clamp(Math.round(xPct), 0, 95);
      yPct = clamp(Math.round(yPct), 0, 95);
      updEl(dragId.current, {x: xPct, y: yPct});
    };
    const up = () => {
      dragging.current=false; dragId.current=null; dragMoved.current=false;
      resizing.current=false; resizeId.current=null;
      setDraggedInlineId(null); setSnapLines({x:[],y:[]});
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
  }, [section.elements, draggedInlineId, inlineStyles, code, mode, snapLines, calculateSnapLines, snapEnabled, snapPriority]);

  const collectImages = (): string[] => {
    const urls=new Set<string>();
    const base=import.meta.env.VITE_SUPABASE_URL??'';
    const add=(u?:string|null)=>{if(u&&base&&u.includes(base))urls.add(u);};
    add(section.background.imageUrl);
    section.elements.filter(e=>e.type==='image').forEach(e=>add(e.content));
    (code.match(/https?:\/\/[^\s"'`]+supabase[^\s"'`]*/g)??[]).forEach(u=>add(u));
    return Array.from(urls);
  };

  const handleSave = () => {
    const finalCode = (isClassBased || (codeWasManuallyEdited.current && section.elements.length === 0))
      ? code
      : generateTSX(section, compName);
    onSave({
      codeFile: { filename: 'component.tsx', language: 'tsx', content: finalCode },
      images: collectImages(),
      componentName: compName,
    });
  };

  const switchView = (next: ViewMode) => {
    if (next !== 'visual' && !isClassBased && !codeWasManuallyEdited.current) {
      setCode(generateTSX(section, compName));
    }
    setViewMode(next);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Panel render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderLayersPanel = () => (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Layers</p>
      {[...section.elements].sort((a,b)=>b.zIndex-a.zIndex).map(el=>(
        <div key={el.id} onClick={()=>{setSelId(el.id);setPanel('element');}}
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${selId===el.id?'bg-primary/20 border border-primary/40':'hover:bg-neutral-700 border border-transparent'}`}>
          {el.type==='text'&&<Type size={11} className="text-blue-400 flex-shrink-0"/>}
          {el.type==='image'&&<ImageIcon size={11} className="text-green-400 flex-shrink-0"/>}
          {el.type==='button'&&<Code2 size={11} className="text-yellow-400 flex-shrink-0"/>}
          <span className="text-xs text-white truncate flex-1">{el.type==='image'?'Image':el.content.slice(0,20)}{el.content.length>20&&el.type!=='image'?'…':''}</span>
          {el.locked&&<Lock size={9} className="text-neutral-500"/>}
          <button onClick={e=>{e.stopPropagation();delEl(el.id);}} className="p-0.5 hover:text-red-400 text-neutral-500 transition-colors"><Trash2 size={10}/></button>
        </div>
      ))}
      {section.elements.length===0&&<p className="text-xs text-neutral-500 text-center py-4">No elements yet.<br/>Use "Add" in the toolbar.</p>}
    </div>
  );

  const renderBgPanel = () => (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Background</p>
      <div className="flex gap-1">
        {(['color','image','gradient'] as const).map(t=>(
          <button key={t} onClick={()=>setSection(s=>({...s,background:{...s.background,type:t}}))}
            className={`flex-1 py-1 text-xs rounded capitalize transition-colors ${section.background.type===t?'bg-primary text-white':'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
          >{t}</button>
        ))}
      </div>
      {section.background.type==='color'&&<CP value={section.background.color} onChange={v=>setSection(s=>({...s,background:{...s.background,color:v}}))} label="Color"/>}
      {section.background.type==='gradient'&&<>
        <CP value={section.background.gradientFrom??'#1a1a2e'} onChange={v=>setSection(s=>({...s,background:{...s.background,gradientFrom:v}}))} label="From"/>
        <CP value={section.background.gradientTo??'#16213e'} onChange={v=>setSection(s=>({...s,background:{...s.background,gradientTo:v}}))} label="To"/>
        <SL value={section.background.gradientAngle??135} onChange={v=>setSection(s=>({...s,background:{...s.background,gradientAngle:v}}))} label="Angle" max={360} unit="°"/>
      </>}
      {section.background.type==='image'&&<>
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Background Image</label>
          <ImageUpload bucket="home-sections" currentImageUrl={section.background.imageUrl}
            onImageUploaded={(url)=>setSection(s=>({...s,background:{...s.background,type:'image',imageUrl:url||undefined}}))}
            defaultCustomName="bg"/>
        </div>
        <SL value={section.background.imageOpacity} onChange={v=>setSection(s=>({...s,background:{...s.background,imageOpacity:v}}))} label="Opacity" unit="%"/>
        <CP value={section.background.color} onChange={v=>setSection(s=>({...s,background:{...s.background,color:v}}))} label="Overlay"/>
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400 w-20">Size</label>
          <select value={section.background.backgroundSize??'cover'} onChange={e=>setSection(s=>({...s,background:{...s.background,backgroundSize:e.target.value as any}}))}
            className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white">
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="auto">Auto</option>
          </select>
        </div>
      </>}
      <hr className="border-neutral-700"/>
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Canvas</p>
      <SL value={section.minHeight} onChange={v=>setSection(s=>({...s,minHeight:v}))} label="Min height" min={200} max={900} step={10} unit="px"/>
      <p className="text-xs text-neutral-600 -mt-1">Canvas grows automatically beyond min height to fit all content.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {(['top','right','bottom','left'] as const).map(side=>(
          <div key={side} className="flex items-center gap-1">
            <label className="text-xs text-neutral-400 capitalize w-8">{side}</label>
            <input type="number" value={section.padding[side]} min={0}
              onChange={e=>setSection(s=>({...s,padding:{...s.padding,[side]:Number(e.target.value)}}))}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white min-w-0"/>
          </div>
        ))}
      </div>
    </div>
  );

  const renderElPanel = () => {
    if(!selEl) return <p className="text-xs text-neutral-500 text-center py-8">Select an element to edit</p>;
    const u=(p:Partial<VisualElement>)=>updEl(selEl.id,p);
    const us=(p:Partial<ElementStyle>)=>updSt(selEl.id,p);
    const heightUnit = selEl.heightUnit ?? 'px';

    // Compute current column/row span for display
    const colStart = pctToCol(selEl.x);
    const colEnd = pctToColEnd(selEl.x, selEl.width);
    const safeEnd = colEnd <= colStart ? colStart + 1 : colEnd;
    const rowStart = pctToRow(selEl.y); // ← NEW

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Element</span>
          <div className="flex gap-1">
            <button onClick={()=>u({locked:!selEl.locked})} className={`p-1 rounded ${selEl.locked?'text-yellow-400':'text-neutral-400 hover:text-white'}`}>{selEl.locked?<Lock size={11}/>:<Unlock size={11}/>}</button>
            <button onClick={()=>dupEl(selEl.id)} className="p-1 rounded text-neutral-400 hover:text-white"><Copy size={11}/></button>
            <button onClick={()=>delEl(selEl.id)} className="p-1 rounded text-neutral-400 hover:text-red-400"><Trash2 size={11}/></button>
          </div>
        </div>

        {/* Grid column + row indicator */}
        <div className="bg-neutral-900 rounded px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <Columns size={10} className="text-neutral-500 flex-shrink-0"/>
          <span className="text-xs text-neutral-400">Col:</span>
          <span className="text-xs font-mono text-blue-300">{colStart}→{safeEnd}</span>
          <span className="text-xs text-neutral-600 mx-1">|</span>
          <span className="text-xs text-neutral-400">Row:</span>
          <span className="text-xs font-mono text-green-300">{rowStart}</span>
          <span className="text-xs text-neutral-600">/ {GRID_ROWS}</span>
        </div>

        {selEl.className&&(
          <div className="bg-purple-900/30 border border-purple-500/30 rounded px-2 py-1.5">
            <p className="text-xs text-purple-300">CSS Class: <code className="font-mono">.{selEl.className}</code></p>
            <p className="text-xs text-neutral-500 mt-0.5">Use CSS tab to edit the stylesheet.</p>
          </div>
        )}

        {/* Position & Size */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* X position — snaps to column boundaries */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-neutral-400 uppercase w-3">X</label>
            <input type="number" value={Math.round(selEl.x)} onChange={e=>u({x: clamp(snapToCol(Number(e.target.value)), 0, 95)})}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white min-w-0"/>
            <span className="text-xs text-neutral-500">%</span>
          </div>
          {/* Y position — snaps to row boundaries */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-neutral-400 uppercase w-3">Y</label>
            <input type="number" value={Math.round(selEl.y)} onChange={e=>u({y: clamp(snapToRow(Number(e.target.value)), 0, 95)})}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white min-w-0"/>
            <span className="text-xs text-neutral-500">%</span>
          </div>
          {/* Width — snaps to column boundaries */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-neutral-400 w-3">W</label>
            <input type="number" value={Math.round(selEl.width)} onChange={e=>u({width: clamp(snapToCol(Number(e.target.value)), 100/GRID_COLS, 100)})}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white min-w-0"/>
            <span className="text-xs text-neutral-500">%</span>
          </div>
          {/* Height */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-neutral-400 w-3">H</label>
            <input type="number" value={selEl.height||0} onChange={e=>u({height:Number(e.target.value)})}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white min-w-0" placeholder="auto"/>
            <button
              onClick={() => u({ heightUnit: heightUnit === 'px' ? '%' : 'px' })}
              title={`Switch to ${heightUnit === 'px' ? '%' : 'px'}`}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-mono border transition-colors bg-neutral-700 border-neutral-500 text-neutral-200 hover:bg-neutral-600"
            >{heightUnit}</button>
          </div>
        </div>
        <p className="text-xs text-neutral-600 -mt-1">
          X/W snap to 12 cols · Y snaps to 20 rows · H=0 is auto
        </p>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400 w-20">Order</label>
          <button onClick={()=>mvZ(selEl.id,'up')} className="p-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"><ChevronUp size={11}/></button>
          <button onClick={()=>mvZ(selEl.id,'down')} className="p-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"><ChevronDown size={11}/></button>
        </div>
        <SL value={(selEl.style.opacity??1)*100} onChange={v=>us({opacity:v/100})} label="Opacity" unit="%"/>
        <hr className="border-neutral-700"/>
        {(selEl.type==='text'||selEl.type==='button')&&<>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Content</label>
            <textarea value={selEl.content} onChange={e=>u({content:e.target.value})}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white resize-none" rows={3}/>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400 w-20">Font</label>
            <select value={selEl.style.fontFamily??'sans-serif'} onChange={e=>us({fontFamily:e.target.value})}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white">
              {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <SL value={selEl.style.fontSize??16} onChange={v=>us({fontSize:v})} label="Size" min={8} max={120} unit="px"/>
          <SL value={selEl.style.lineHeight??1.5} onChange={v=>us({lineHeight:v})} label="Line height" min={1} max={3} step={0.1}/>
          <SL value={selEl.style.letterSpacing??0} onChange={v=>us({letterSpacing:v})} label="Letter sp." min={-5} max={20} unit="px"/>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-neutral-400 w-20">Style</label>
            <button onClick={()=>us({fontWeight:selEl.style.fontWeight==='bold'?'normal':'bold'})} className={`p-1.5 rounded ${selEl.style.fontWeight==='bold'?'bg-primary text-white':'bg-neutral-700 text-neutral-300'}`}><Bold size={11}/></button>
            <button onClick={()=>us({fontStyle:selEl.style.fontStyle==='italic'?'normal':'italic'})} className={`p-1.5 rounded ${selEl.style.fontStyle==='italic'?'bg-primary text-white':'bg-neutral-700 text-neutral-300'}`}><Italic size={11}/></button>
            <button onClick={()=>us({textDecoration:selEl.style.textDecoration==='underline'?'none':'underline'})} className={`p-1.5 rounded ${selEl.style.textDecoration==='underline'?'bg-primary text-white':'bg-neutral-700 text-neutral-300'}`}><Underline size={11}/></button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-neutral-400 w-20">Align</label>
            {(['left','center','right'] as const).map(a=>{
              const I=a==='left'?AlignLeft:a==='center'?AlignCenter:AlignRight;
              return <button key={a} onClick={()=>us({textAlign:a})} className={`p-1.5 rounded ${selEl.style.textAlign===a?'bg-primary text-white':'bg-neutral-700 text-neutral-300'}`}><I size={11}/></button>;
            })}
          </div>
          <CP value={selEl.style.color??'#ffffff'} onChange={v=>us({color:v})} label="Text color"/>
          <CP value={selEl.style.backgroundColor??''} onChange={v=>us({backgroundColor:v||undefined})} label="BG color"/>
          {selEl.style.backgroundColor&&<>
            <SL value={selEl.style.padding??0} onChange={v=>us({padding:v})} label="Padding" max={48} unit="px"/>
            <SL value={selEl.style.borderRadius??0} onChange={v=>us({borderRadius:v})} label="Radius" max={48} unit="px"/>
          </>}
        </>}
        {selEl.type==='image'&&<>
          <div>
            <div className="flex gap-1 mb-2">
              <button onClick={()=>u({svgContent:undefined})} className={`flex-1 py-1 text-xs rounded transition-colors ${!selEl.svgContent?'bg-primary text-white':'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>Upload</button>
              <button onClick={()=>u({svgContent:selEl.svgContent??'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0F52BA"/></svg>'})} className={`flex-1 py-1 text-xs rounded transition-colors ${selEl.svgContent?'bg-primary text-white':'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>SVG Code</button>
            </div>
            {selEl.svgContent ? (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">SVG Markup</label>
                <textarea value={selEl.svgContent} onChange={e=>u({svgContent:e.target.value})} className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-xs text-white font-mono resize-none" rows={6} placeholder="<svg ...>...</svg>"/>
              </div>
            ) : (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Image</label>
                <ImageUpload bucket="home-sections" currentImageUrl={selEl.content}
                  onImageUploaded={(url)=>updEl(selEl.id,{content:url,svgContent:undefined})} defaultCustomName="element"/>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400 w-20">Fit</label>
            <select value={selEl.style.objectFit??'cover'} onChange={e=>us({objectFit:e.target.value as any})} className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white">
              <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
            </select>
          </div>
          <SL value={selEl.style.borderRadius??0} onChange={v=>us({borderRadius:v})} label="Radius" max={80} unit="px"/>
        </>}
        {selEl.type==='button'&&<>
          <CP value={selEl.style.backgroundColor??'#0F52BA'} onChange={v=>us({backgroundColor:v})} label="BG color"/>
          <SL value={selEl.style.padding??12} onChange={v=>us({padding:v})} label="Padding" max={40} unit="px"/>
          <SL value={selEl.style.borderRadius??8} onChange={v=>us({borderRadius:v})} label="Radius" max={50} unit="px"/>
          <hr className="border-neutral-700"/>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Action</label>
            <select value={selEl.actionType??'none'} onChange={e=>u({actionType:e.target.value as any})}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white mb-2">
              <option value="none">None</option>
              <option value="navigate">Navigate (internal page)</option>
              <option value="external">External link (new tab)</option>
              <option value="scroll">Scroll to element</option>
            </select>
            {selEl.actionType==='navigate'&&(
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Page path</label>
                <input type="text" value={selEl.href??''} onChange={e=>u({href:e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white font-mono"
                  placeholder="/booking"/>
                <p className="text-xs text-neutral-500 mt-1">Uses React Router — no full page reload</p>
              </div>
            )}
            {selEl.actionType==='external'&&(
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">URL</label>
                <input type="text" value={selEl.href??''} onChange={e=>u({href:e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white font-mono"
                  placeholder="https://example.com"/>
                <p className="text-xs text-neutral-500 mt-1">Opens in a new tab</p>
              </div>
            )}
            {selEl.actionType==='scroll'&&(
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">CSS selector</label>
                <input type="text" value={selEl.href??''} onChange={e=>u({href:e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white font-mono"
                  placeholder="#section-id"/>
                <p className="text-xs text-neutral-500 mt-1">e.g. #contact, .hero-section</p>
              </div>
            )}
          </div>
        </>}
      </div>
    );
  };

  const renderCSSPanel = () => {
    const selectors = [...new Set(cssRules.map(r => r.selector))];
    const filtered = cssFilterSel ? cssRules.filter(r => r.selector === cssFilterSel) : cssRules;
    const tweak = (selector: string, property: string, newValue: string) => {
      setCode(applyCSSTweak(code, selector, property, newValue));
      codeWasManuallyEdited.current = true;
    };
    if (cssRules.length===0) return (
      <p className="text-xs text-neutral-500 text-center py-6">No CSS template literal found.<br/>This panel works with components that use<br/><code className="text-neutral-400">const styles = `...`</code></p>
    );
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">CSS Rules</p>
        <p className="text-xs text-neutral-500">Edit CSS classes. Changes sync to code instantly.</p>
        <select value={cssFilterSel} onChange={e=>setCssFilterSel(e.target.value)}
          className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-white">
          <option value="">All selectors</option>
          {selectors.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filtered.map((rule,i)=>{
            const isColor=/color/i.test(rule.property)&&/^#|^rgb|^hsl|^[a-z]+$/.test(rule.value.trim());
            return (
              <div key={i} className="bg-neutral-900 rounded px-2 py-1.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-purple-300 font-mono truncate flex-1" title={rule.selector}>{rule.selector}</span>
                  <span className="text-xs text-blue-300 font-mono">{rule.property}</span>
                </div>
                {isColor?(
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={rule.value.startsWith('#')?rule.value:'#ffffff'}
                      onChange={e=>tweak(rule.selector,rule.property,e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-neutral-600 bg-transparent p-0"/>
                    <input type="text" defaultValue={rule.value}
                      onBlur={e=>tweak(rule.selector,rule.property,e.target.value)}
                      className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white font-mono min-w-0"/>
                  </div>
                ):(
                  <input type="text" defaultValue={rule.value}
                    onBlur={e=>tweak(rule.selector,rule.property,e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white font-mono"/>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderInlinePanel = () => {
    if(inlineStyles.length===0) return (
      <p className="text-xs text-neutral-500 text-center py-6">No inline style objects found.<br/>This panel edits TSX elements with<br/><code className="text-neutral-400">style=&#123;&#123;...&#125;&#125;</code> props</p>
    );
    const tweak=(path:string,property:string,newValue:string|number)=>{
      setCode(applyInlineStyleTweak(code,path,property,newValue));
      codeWasManuallyEdited.current=true;
    };
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Inline Styles</p>
        <p className="text-xs text-neutral-500">Edit style objects from TSX elements.</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {inlineStyles.map((def,i)=>(
            <div key={i} className={`rounded p-2 space-y-1.5 ${def.isAbsolute?'bg-blue-900/20 border-2 border-blue-500/30':'bg-neutral-900'}`}>
              <div className="flex items-center gap-2">
                <Code2 size={10} className="text-blue-400"/>
                <span className="text-xs font-mono text-blue-300">&lt;{def.elementName}&gt;</span>
              </div>
              {Object.entries(def.styles).map(([prop,val])=>{
                const isColor=/color/i.test(prop)&&typeof val==='string'&&/^#|^rgb|^hsl/.test(val);
                return (
                  <div key={prop} className="grid grid-cols-2 gap-1.5 items-center">
                    <span className="text-xs font-mono text-neutral-400 truncate">{prop}</span>
                    {isColor?(
                      <div className="flex items-center gap-1">
                        <input type="color" value={typeof val==='string'&&val.startsWith('#')?val:'#ffffff'}
                          onChange={e=>tweak(def.path,prop,e.target.value)} className="w-6 h-6 rounded cursor-pointer border border-neutral-600 p-0"/>
                        <input type="text" defaultValue={String(val)} onBlur={e=>tweak(def.path,prop,e.target.value)}
                          className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-xs text-white font-mono min-w-0"/>
                      </div>
                    ):(
                      <input type="text" defaultValue={String(val)} onBlur={e=>tweak(def.path,prop,e.target.value)}
                        className="bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white font-mono"/>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderResizeHandles = (id: string) => (
    <>
      <div onMouseDown={e=>onResizeDown(e,id,'right')} onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'50%',right:-5,transform:'translateY(-50%)',width:10,height:30,background:'#0F52BA',borderRadius:3,cursor:'ew-resize',zIndex:10001}} title="Resize width (snaps to columns)"/>
      <div onMouseDown={e=>onResizeDown(e,id,'bottom')} onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:-5,left:'50%',transform:'translateX(-50%)',width:30,height:10,background:'#0F52BA',borderRadius:3,cursor:'ns-resize',zIndex:10001}} title="Resize height"/>
      <div onMouseDown={e=>onResizeDown(e,id,'corner')} onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:-5,right:-5,width:12,height:12,background:'#0F52BA',borderRadius:2,cursor:'nwse-resize',zIndex:10001}} title="Resize both"/>
    </>
  );

  // ── renderCanvas — uses CSS Grid identical to generateTSX output ──────────
  const renderCanvas = () => {
    const bg = section.background;

    const bgCss: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box',
      minHeight: `${section.minHeight}px`,
      padding: `${section.padding.top}px ${section.padding.right}px ${section.padding.bottom}px ${section.padding.left}px`,
      backgroundColor: bg.type === 'color' ? bg.color : bg.type === 'gradient' ? undefined : bg.color,
      backgroundImage: bg.type === 'gradient'
        ? `linear-gradient(${bg.gradientAngle ?? 135}deg,${bg.gradientFrom ?? '#1a1a2e'},${bg.gradientTo ?? '#16213e'})`
        : undefined,
      // ← UPDATED: 12-col × 20-row grid, matching generateTSX exactly
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
      gridTemplateRows: `repeat(${GRID_ROWS}, auto)`,
      gap: '8px 16px',
      alignItems: 'start',
      cursor: 'default',
    };

    // Sort elements same as generateTSX: top-to-bottom, left-to-right
    const flowEls = [...section.elements].sort((a, b) => a.y - b.y || a.x - b.x);

    return (
      <div ref={canvasRef} style={bgCss} onClick={() => setSelId(null)}>
        {/* Background image overlay */}
        {bg.type === 'image' && bg.imageUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${bg.imageUrl})`,
            backgroundSize: bg.backgroundSize ?? 'cover',
            backgroundPosition: bg.backgroundPosition ?? 'center',
            opacity: bg.imageOpacity / 100,
            zIndex: 0, pointerEvents: 'none',
          }} />
        )}

        {/* Column guide overlay — 12 columns */}
        {!preview && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gap: '8px 16px',
            padding: `${section.padding.top}px ${section.padding.right}px ${section.padding.bottom}px ${section.padding.left}px`,
            boxSizing: 'border-box',
          }}>
            {Array.from({ length: GRID_COLS }).map((_, i) => (
              <div key={i} style={{
                borderLeft: '1px dashed rgba(255,255,255,0.05)',
                borderRight: i === GRID_COLS - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none',
              }} />
            ))}
          </div>
        )}

        {/* Elements — explicitly placed in grid by col + row */}
        {flowEls.map(el => {
          const isSel = selId === el.id && !preview;
          const colStart = pctToCol(el.x);
          const colEnd   = pctToColEnd(el.x, el.width);
          const safeEnd  = colEnd <= colStart ? colStart + 1 : colEnd;
          const rowStart = pctToRow(el.y); // ← NEW: explicit row placement
          const heightUnit = el.heightUnit ?? 'px';

          const gridStyle: React.CSSProperties = {
            gridColumn: `${colStart} / ${safeEnd}`,
            gridRow: rowStart, // ← NEW: this is what makes vertical movement work
            position: 'relative',
            zIndex: el.zIndex,
            opacity: el.style.opacity ?? 1,
            outline: isSel ? '2px solid #0F52BA' : 'none',
            outlineOffset: '2px',
            cursor: el.locked || preview ? 'default' : 'grab',
            userSelect: 'none',
            boxSizing: 'border-box',
            ...(el.height > 0 ? { height: `${el.height}${heightUnit}` } : {}),
          };

          const stopClick = (e: React.MouseEvent) => e.stopPropagation();

          const dragLabel = isSel && (
            <div style={{
              position: 'absolute', top: -20, left: 0,
              background: '#0F52BA', color: 'white', fontSize: 10,
              padding: '1px 6px', borderRadius: 3,
              display: 'flex', alignItems: 'center', gap: 3,
              whiteSpace: 'nowrap', zIndex: 10002, pointerEvents: 'none',
            }}>
              <Move size={8} />
              col {colStart}–{safeEnd} · row {rowStart}
            </div>
          );

          // ── Text ────────────────────────────────────────────────────────────
          if (el.type === 'text') {
            return (
              <div
                key={el.id}
                style={{
                  ...gridStyle,
                  fontSize: `${el.style.fontSize ?? 16}px`,
                  fontFamily: el.style.fontFamily ?? 'sans-serif',
                  fontWeight: el.style.fontWeight ?? 'normal',
                  fontStyle: el.style.fontStyle ?? 'normal',
                  textDecoration: el.style.textDecoration ?? 'none',
                  textAlign: el.style.textAlign ?? 'left',
                  color: el.style.color ?? '#ffffff',
                  lineHeight: el.style.lineHeight ?? 1.5,
                  letterSpacing: `${el.style.letterSpacing ?? 0}px`,
                  backgroundColor: el.style.backgroundColor,
                  padding: el.style.padding ? `${el.style.padding}px` : undefined,
                  borderRadius: el.style.borderRadius ? `${el.style.borderRadius}px` : undefined,
                  whiteSpace: 'pre-wrap',
                  overflow: el.height > 0 ? 'hidden' : undefined,
                }}
                onMouseDown={e => onMouseDown(e, el.id)}
                onClick={stopClick}
              >
                {el.content}
                {dragLabel}
                {isSel && renderResizeHandles(el.id)}
              </div>
            );
          }

          // ── Image ──────────────────────────────────────────────────────────
          if (el.type === 'image') {
            return (
              <div
                key={el.id}
                style={{
                  ...gridStyle,
                  display: 'block',
                  overflow: 'hidden',
                  borderRadius: `${el.style.borderRadius ?? 0}px`,
                }}
                onMouseDown={e => onMouseDown(e, el.id)}
                onClick={stopClick}
              >
                {el.svgContent
                  ? <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: el.svgContent }} />
                  : <img
                      src={el.content || ''}
                      alt=""
                      draggable={false}
                      style={{
                        width: '100%',
                        height: el.height > 0 ? `${el.height}${heightUnit}` : 'auto',
                        objectFit: el.style.objectFit ?? 'cover',
                        borderRadius: `${el.style.borderRadius ?? 0}px`,
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                }
                {isSel && <>{dragLabel}{renderResizeHandles(el.id)}</>}
              </div>
            );
          }

          // ── Button ─────────────────────────────────────────────────────────
          if (el.type === 'button') {
            const p = el.style.padding ?? 12;
            return (
              <div
                key={el.id}
                style={{
                  ...gridStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${p}px ${p * 2}px`,
                  borderRadius: `${el.style.borderRadius ?? 8}px`,
                  backgroundColor: el.style.backgroundColor ?? '#0F52BA',
                  color: el.style.color ?? '#ffffff',
                  fontSize: `${el.style.fontSize ?? 16}px`,
                  fontWeight: el.style.fontWeight ?? 'bold',
                  fontFamily: el.style.fontFamily ?? 'sans-serif',
                  border: 'none',
                  gap: 4,
                }}
                onMouseDown={e => onMouseDown(e, el.id)}
                onClick={stopClick}
              >
                {el.content}
                {el.actionType === 'navigate' && el.href && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 3 }}>→</span>}
                {el.actionType === 'external'  && el.href && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 3 }}>🔗</span>}
                {el.actionType === 'scroll'    && el.href && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 3 }}>↓</span>}
                {dragLabel}
                {isSel && renderResizeHandles(el.id)}
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderCodePane = () => (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700 flex-shrink-0 flex-wrap">
        <Code2 size={13} className="text-blue-400"/>
        <span className="text-xs font-mono text-blue-300">component.tsx</span>
        <span className="ml-auto text-xs text-neutral-500">TSX · React</span>
        {viewMode==='split' && (
          <button
            onClick={()=>{
              codeWasManuallyEdited.current=false;
              setCode(generateTSX(section,compName));
            }}
            title="Replace code with current canvas elements"
            className="flex items-center gap-1 px-2 py-0.5 bg-primary hover:bg-primary/80 rounded text-xs text-white transition-colors font-medium"
          >
            <RefreshCw size={10}/> Sync canvas → code
          </button>
        )}
      </div>
      <textarea value={code} onChange={e=>{codeWasManuallyEdited.current=true;setCode(e.target.value);}}
        className="flex-1 w-full bg-neutral-950 text-neutral-100 font-mono text-xs px-4 py-3 outline-none resize-none leading-relaxed"
        spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="// TSX component code"/>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const showCanvas = viewMode==='visual'||viewMode==='split';
  const showCode   = viewMode==='code'||viewMode==='split';
  const showPanel  = showCanvas && !preview;

  const panelTabs: Array<[string, string, any]> = [
    ['layers','Layers',Layers],
    ['background','BG',Settings],
    ['element','Element',Type],
    ...(mode==='code' && isClassBased ? [['css','CSS',Code2] as [string,string,any]] : []),
    ...(mode==='code' && !isClassBased && inlineStyles.length>0 ? [['inline','Inline',Code2] as [string,string,any]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900" style={{fontFamily:'sans-serif'}}>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 border-b border-neutral-700 flex-shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"/>
          <span className="text-sm font-semibold text-white">Visual {mode==='code'?'Code ':'Section '}Editor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-neutral-400">Name:</span>
          <input value={compName} onChange={e=>setCompName(e.target.value.replace(/[^a-zA-Z0-9]/g,''))}
            className="bg-neutral-700 border border-neutral-600 rounded px-2 py-0.5 text-xs text-white font-mono w-36"/>
        </div>
        {showCanvas&&(
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500">Add:</span>
            {([['text','Text',Type],['image','Img',ImageIcon],['button','Btn',Code2]] as const).map(([t,lbl,Icon])=>(
              <button key={t} onClick={()=>addEl(t as ElementType)} className="flex items-center gap-1 px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs text-neutral-300 transition-colors"><Icon size={11}/>{lbl}</button>
            ))}
            <div className="ml-1 w-px h-4 bg-neutral-600"/>
            <button onClick={()=>setSnapEnabled(s=>!s)} title={snapEnabled ? 'Disable column snapping' : 'Enable column snapping'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${snapEnabled?'bg-red-600/30 text-red-300 border border-red-600/40':'bg-neutral-700 text-neutral-500 border border-neutral-600'}`}>
              <Columns size={11}/>
              {snapEnabled ? 'Snap on' : 'Snap off'}
            </button>
            <div className="ml-1 w-px h-4 bg-neutral-600"/>
            {([{w:null,label:'Desktop',icon:'🖥'},{w:900,label:'Tablet',icon:'📱'},{w:390,label:'Mobile',icon:'📲'}] as const).map(d=>(
              <button key={String(d.w)} onClick={()=>setDeviceWidth(d.w)} title={d.label+(d.w?` (${d.w}px)`:'')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${deviceWidth===d.w?'bg-primary text-white':'bg-neutral-700 text-neutral-400 hover:text-white'}`}>{d.icon}</button>
            ))}
          </div>
        )}
        {mode==='code'&&(
          <div className="flex items-center gap-0.5 bg-neutral-700 rounded-lg p-0.5">
            {([['visual','Visual',Paintbrush],['split','Split',Columns],['code','Code',Code2]] as const).map(([k,lbl,Icon])=>(
              <button key={k} onClick={()=>switchView(k as ViewMode)} className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${viewMode===k?'bg-primary text-white':'text-neutral-300 hover:text-white'}`}><Icon size={11}/>{lbl}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {mode==='standard'&&onRevertToStandard&&(
            <button onClick={()=>{if(confirm('Revert to standard section?'))onRevertToStandard();}} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"><LayoutTemplate size={13}/> Revert to Standard</button>
          )}
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"><X size={13}/> Cancel</button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs bg-primary text-white hover:bg-primary/90 font-semibold transition-colors"><Code2 size={13}/> Save as Code</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {showCanvas&&(
          <div className={`flex flex-col overflow-hidden ${viewMode==='split'?'w-1/2 border-r border-neutral-700':'flex-1'}`}>
            <div className="flex items-center border-b border-neutral-700 bg-neutral-800 flex-shrink-0">
              <button onClick={()=>setPreview(false)} className={`flex items-center gap-1.5 px-4 py-2 text-xs transition-colors border-b-2 ${!preview?'border-primary text-white':'border-transparent text-neutral-400 hover:text-neutral-200'}`}><Paintbrush size={11}/> {isClassBased && mode==='code' ? 'Live + CSS Edit' : 'Edit Canvas'}</button>
              <button onClick={()=>setPreview(true)} className={`flex items-center gap-1.5 px-4 py-2 text-xs transition-colors border-b-2 ${preview?'border-green-400 text-white':'border-transparent text-neutral-400 hover:text-neutral-200'}`}><Eye size={11}/> Live Preview</button>
              {!isClassBased && !preview && (
                <button onClick={parseFromCode} disabled={parsingCanvas} className="ml-auto mr-2 flex items-center gap-1 px-2.5 py-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded text-xs text-white transition-colors"><RefreshCw size={10} className={parsingCanvas?'animate-spin':''}/> {parsingCanvas?'Parsing…':'Parse from code'}</button>
              )}
              {isClassBased && !preview && (
                <button onClick={()=>setPanel('css')} className="ml-auto mr-2 flex items-center gap-1 px-2.5 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white transition-colors"><Code2 size={10}/> Edit CSS →</button>
              )}
            </div>
            {/* Canvas scroll area */}
            <div className="flex-1 overflow-auto bg-neutral-950">
              {mode==='code' && isClassBased ? (
                <div className="w-full relative">
                  <CodeProjectRenderer files={[{ filename:'component.tsx', language:'tsx', content: code }]}/>
                  {!preview && section.elements.length > 0 && (
                    <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5}}>
                      <p className="text-center text-xs text-neutral-600 mt-2 bg-neutral-900/70 py-1 mx-auto w-fit px-3 rounded">
                        CSS class component — use <strong className="text-purple-400">CSS tab</strong> or <strong className="text-blue-400">Element tab</strong> to edit styles
                      </p>
                    </div>
                  )}
                </div>
              ) : preview ? (
                <div className="w-full p-4 flex flex-col items-center">
                  {deviceWidth && (
                    <div className="flex items-center justify-center gap-2 mb-2 w-full" style={{maxWidth:deviceWidth}}>
                      <div className="h-px flex-1 bg-neutral-700"/>
                      <span className="text-xs text-neutral-500 font-mono">{deviceWidth===390?'📲 Mobile':'📱 Tablet'} — {deviceWidth}px</span>
                      <div className="h-px flex-1 bg-neutral-700"/>
                    </div>
                  )}
                  <div style={{width: deviceWidth ? `${deviceWidth}px` : '100%', maxWidth:'100%', transition:'width 0.3s'}}>
                    <CodeProjectRenderer files={[{ filename:'component.tsx', language:'tsx', content: isClassBased ? code : generateTSX(section, compName) }]}/>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  {babelLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
                      <p className="text-xs text-neutral-400">Loading canvas elements…</p>
                    </div>
                  ) : (
                    <>
                      {deviceWidth && (
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <div className="h-px flex-1 bg-neutral-700"/>
                          <span className="text-xs text-neutral-500 font-mono">{deviceWidth===390?'📲 Mobile':'📱 Tablet'} — {deviceWidth}px</span>
                          <div className="h-px flex-1 bg-neutral-700"/>
                        </div>
                      )}
                      {/* Canvas wrapper */}
                      <div
                        className="mx-auto shadow-2xl border border-neutral-700 overflow-visible relative transition-all duration-300"
                        style={{
                          maxWidth: deviceWidth ?? 1200,
                          minWidth: deviceWidth ?? 320,
                          width: deviceWidth ? `${deviceWidth}px` : '100%',
                        }}
                      >
                        {renderCanvas()}
                      </div>
                      <p className="text-center text-xs text-neutral-600 mt-2">
                        Click to select · Drag to move (snaps to 12-col × 20-row grid) · Drag blue handles to resize
                        {section.elements.length === 0 && initialCode ? ' · Elements not parsed? Click "Parse from code"' : ''}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showCode&&(
          <div className={viewMode==='split'?'w-1/2 flex flex-col overflow-hidden':'flex-1 flex flex-col overflow-hidden'}>
            {renderCodePane()}
          </div>
        )}

        {showPanel&&(
          <div ref={panelRef} id="vse-right-panel" className="w-60 flex-shrink-0 bg-neutral-800 border-l border-neutral-700 flex flex-col overflow-hidden" style={{position:'relative',zIndex:200}}>
            <div className="flex border-b border-neutral-700">
              {panelTabs.map(([k,lbl,Icon])=>(
                <button key={k} onClick={() => setPanel(k as any)} className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors gap-0.5 ${panel===k?'text-white border-b-2 border-primary':'text-neutral-400 hover:text-neutral-200'}`}>
                  <Icon size={13}/>{lbl}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {panel==='layers'&&renderLayersPanel()}
              {panel==='background'&&renderBgPanel()}
              {panel==='element'&&renderElPanel()}
              {panel==='css'&&renderCSSPanel()}
              {panel==='inline'&&renderInlinePanel()}
            </div>
            <div className="p-2.5 border-t border-neutral-700">
              <button onClick={()=>{if(confirm('Reset canvas to initial state?')){setSection(buildInitial());setSelId(null);}}}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-white transition-colors">
                <RotateCcw size={11}/> Reset Canvas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualSectionEditor;
