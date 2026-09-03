import EditableContent from './EditableContent';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Babel standalone — loaded once globally ──────────────────────────────────
let babelReady = false;
let babelPromise: Promise<void> | null = null;

function loadBabel(): Promise<void> {
  if (babelReady) return Promise.resolve();
  if (babelPromise) return babelPromise;
  babelPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js';
    s.onload = () => { babelReady = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return babelPromise;
}

function transpileTsx(code: string): string {
  const Babel = (window as any).Babel;
  if (!Babel) throw new Error('Babel not loaded');
  const result = Babel.transform(code, {
    presets: ['react', 'typescript'],
    plugins: ['transform-modules-commonjs'],
    filename: 'component.tsx',
  });
  return result.code ?? '';
}

// ─── require shim ─────────────────────────────────────────────────────────────
// Babel compiles every `import` into `require(...)`. We intercept those calls
// and hand back the real live objects from the host app's module graph.
//
// We build the shim *inside* evalComponent so that `navigate` (from the
// enclosing React tree) is captured fresh on every render cycle.
function makeRequire(navigate: ReturnType<typeof useNavigate>) {
  return function require(mod: string): any {
    if (mod === 'react' || mod === 'React') {
      return React;
    }
    if (mod === 'react-router-dom') {
      return {
        useNavigate: () => navigate,
        // Add more re-exports here as components need them
        Link: ({ to, children, ...rest }: any) =>
          React.createElement('a', {
            href: to,
            onClick: (e: any) => { e.preventDefault(); navigate(to); },
            ...rest,
          }, children),
        NavLink: ({ to, children, ...rest }: any) =>
          React.createElement('a', {
            href: to,
            onClick: (e: any) => { e.preventDefault(); navigate(to); },
            ...rest,
          }, children),
        useLocation: () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }),
        useParams: () => ({}),
      };
    }
    // Fallback — nothing else should be needed for self-contained TSX sections,
    // but throw a clear error rather than a cryptic undefined-is-not-a-function.
    throw new Error(
      `[CodeProjectRenderer] Cannot resolve module "${mod}". ` +
      `Add it to the require shim in CodeProjectRenderer.tsx.`
    );
  };
}

function evalComponent(
  transpiledCode: string,
  navigate: ReturnType<typeof useNavigate>
): React.ComponentType {
  const mod: { exports: any } = { exports: {} };
  const exportsObj = mod.exports;
  const require = makeRequire(navigate);

  // eslint-disable-next-line no-new-func
  new Function('React', 'require', 'exports', 'module', transpiledCode)(
    React, require, exportsObj, mod
  );

  const raw = mod.exports !== exportsObj ? mod.exports : exportsObj;

  const Component =
    (raw?.default && typeof raw.default === 'function') ? raw.default :
    (typeof raw === 'function') ? raw :
    null;

  if (!Component) {
    throw new Error(
      'No default export found. Make sure your component ends with:\nexport default MyComponent'
    );
  }

  return Component;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CodeFile {
  filename: string;
  language: string;
  content: string;
}

interface CodeProjectRendererProps {
  files: CodeFile[];
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
const CodeProjectRenderer: React.FC<CodeProjectRendererProps> = ({ files }) => {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(0);
  const [EvaledComponent, setEvaledComponent] = useState<React.ComponentType | null>(null);

  const htmlFile = files.find(f => f.language === 'html');
  const tsxFile  = files.find(f => f.language === 'tsx');

  // ── HTML mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!htmlFile) return;
    const doc = iframeRef.current?.contentDocument
             ?? iframeRef.current?.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(htmlFile.content);
    doc.close();
    setLoading(false);
  }, [htmlFile]);

  useEffect(() => {
    if (!htmlFile) return;
    const onMessage = (e: MessageEvent) => {
      const h = e.data?.iframeHeight ?? e.data?.height;
      if (typeof h === 'number' && h > 0) setIframeHeight(h);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [htmlFile]);

  useEffect(() => {
    if (!htmlFile) return;
    const onResize = () => {
      try { iframeRef.current?.contentWindow?.dispatchEvent(new Event('resize')); } catch (_) {}
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [htmlFile]);

  // ── TSX mode ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tsxFile || htmlFile) return;

    let cancelled = false;
    setError(null);
    setLoading(true);
    setEvaledComponent(null);

    (async () => {
      try {
        await loadBabel();
        if (cancelled) return;

        const transpiled = transpileTsx(tsxFile.content);
        if (cancelled) return;

        // Pass navigate so the require shim can capture it
        const Component = evalComponent(transpiled, navigate);
        if (!cancelled) {
          setEvaledComponent(() => Component);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Render error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // navigate is stable (React Router guarantees it), so it's safe in deps
  }, [tsxFile, htmlFile, navigate]);

  return (
    <div style={{ width: '100%' }}>
      {loading && !error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, color: '#888', fontSize: 14 }}>
          <EditableContent contentKey="code-project-renderer-rendering" fallback="Rendering…" />
        </div>
      )}
      {error && (
        <div style={{ padding: 16, background: '#2a1010', color: '#f87171', fontFamily: 'monospace', fontSize: 13, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong><EditableContent contentKey="code-project-renderer-render-error" fallback="Render error:" /></strong>{'\n'}{error}
        </div>
      )}

      {/* HTML mode */}
      {htmlFile && (
        <iframe
          ref={iframeRef}
          style={{ width: '100%', height: iframeHeight > 0 ? `${iframeHeight}px` : 'auto', minHeight: 100, border: 'none', display: 'block' }}
          sandbox="allow-scripts allow-same-origin"
          title="Code Section"
        />
      )}

      {/* TSX mode — rendered inside the host React tree so Router/DataContext etc. are available */}
      {!htmlFile && EvaledComponent && <EvaledComponent />}
    </div>
  );
};

export default CodeProjectRenderer;
