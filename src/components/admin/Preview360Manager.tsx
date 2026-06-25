/**
 * Preview360Manager.tsx
 *
 * Admin panel tab for generating downloadable 360° HTML preview files.
 *
 * The downloaded HTML is fully self-contained — it embeds Pannellum via CDN
 * and renders the panorama directly, with NO dependency on flai.dk or any
 * other Flai infrastructure. It contains no labels, hotspots or branding so
 * customers can embed it anywhere (WordPress, Squarespace, iframes, etc.).
 */

import EditableContent from '../EditableContent';
import React, { useState } from 'react';
import { Download, Globe, Trash2, Eye, EyeOff } from 'lucide-react';
import ImageUpload from '../ImageUpload';
import PanoramaViewer from '../PanoramaViewer';
import toast from 'react-hot-toast';

interface PreviewEntry {
  id: string;
  title: string;
  panoramaUrl: string;
  createdAt: string;
}

function buildSelfContainedHTML(_title: string, panoramaUrl: string): string {
  // _title is accepted for API compatibility but intentionally not rendered —
  // the output is label-free so it can be embedded on any customer site.
  const safeUrl = panoramaUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>360\xb0</title>

  <!-- Pannellum — loaded from CDN, no dependency on flai.dk -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css" />
  <script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"><\/script>

  <style>
    /* Reset so the viewer fills the entire host element, whether that is a
       browser tab or an <iframe> on a WordPress / Squarespace page. */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%; height: 100%;
      background: #000;
      overflow: hidden;
    }

    #viewer {
      width: 100%; height: 100%;
    }

    /* Remove Pannellum chrome that is irrelevant when embedded */
    .pnlm-fullscreen-toggle-button,
    .pnlm-compass,
    .pnlm-load-button p,
    .pnlm-about-msg { display: none !important; }

    .pnlm-load-button {
      background: transparent !important;
      box-shadow: none !important;
    }
  </style>
</head>
<body>
  <div id="viewer"></div>

  <script>
    pannellum.viewer('viewer', {
      type:         'equirectangular',
      panorama:     '${safeUrl}',
      autoLoad:     true,
      autoRotate:   -0.5,
      pitch:        0,
      yaw:          0,
      hfov:         100,
      minHfov:      50,
      maxHfov:      120,
      showControls: false,
      mouseZoom:    true,
      keyboardZoom: true,
      compass:      false,
      hotSpots:     []
    });
  <\/script>
</body>
</html>`;
}

function slugify(str: string): string {
  return str.toLowerCase()
    .replace(/[æä]/g,'ae').replace(/[øö]/g,'oe').replace(/[åü]/g,'aa')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'preview';
}

const Preview360Manager: React.FC = () => {
  const [title, setTitle]             = useState('');
  const [panoramaUrl, setPanoramaUrl] = useState('');
  const [previews, setPreviews]       = useState<PreviewEntry[]>([]);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const handleImageUploaded = (url: string) => {
    const raw = url.startsWith('panorama:') ? url.slice('panorama:'.length) : url;
    setPanoramaUrl(raw);
  };

  const downloadHTML = (entry: PreviewEntry) => {
    const html = buildSelfContainedHTML(entry.title, entry.panoramaUrl);
    const blob = new Blob([html], { type: 'text/html' });
    const href = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href, download: `${slugify(entry.title)}-360-preview.html` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
    toast.success('HTML-fil downloaded!');
  };

  const handleGenerate = () => {
    if (!title.trim()) { toast.error('Angiv en titel til previewet'); return; }
    if (!panoramaUrl)  { toast.error('Upload et 360° billede først'); return; }
    const entry: PreviewEntry = { id: crypto.randomUUID(), title: title.trim(), panoramaUrl, createdAt: new Date().toLocaleString('da-DK') };
    setPreviews(prev => [entry, ...prev]);
    downloadHTML(entry);
    setTitle('');
    setPanoramaUrl('');
  };

  return (
    <div className="space-y-8">

      <div>
        <h2 className="text-xl font-semibold mb-1"><EditableContent contentKey="preview360manager-360-preview-generator" fallback="360° Preview Generator" /></h2>
        <p className="text-neutral-400 text-sm">
          <EditableContent contentKey="preview360manager-upload-et-360-panoramabillede-og" fallback="Upload et 360° panoramabillede og generer en selvstændig HTML-fil til kunden.           Filen indeholder sin egen viewer og virker overalt — uden afhængighed af flai.dk." />
        </p>
      </div>

      <div className="bg-neutral-700/40 rounded-xl p-6 border border-neutral-600 space-y-5">
        <h3 className="font-medium text-white"><EditableContent contentKey="preview360manager-opret-nyt-preview" fallback="Opret nyt preview" /></h3>

        <div>
          <label className="block text-sm text-neutral-300 mb-1.5"><EditableContent contentKey="preview360manager-titel-kundenavn" fallback="Titel / kundenavn" /></label>
          <input
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-primary transition-colors"
            placeholder="F.eks. Villa Strandvej 12 — Luftfoto 360°"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1.5"><EditableContent contentKey="preview360manager-360-panoramabillede" fallback="360° Panoramabillede" /></label>
          <ImageUpload
            onImageUploaded={handleImageUploaded}
            currentImage={panoramaUrl ? `panorama:${panoramaUrl}` : undefined}
            bucket="portfolio"
            allow360={true}
          />
        </div>

        {panoramaUrl && (
          <div>
            <p className="text-xs text-neutral-400 mb-2"><EditableContent contentKey="preview360manager-live-preview-samme-viewer-kunden" fallback="Live preview (samme viewer kunden ser):" /></p>
            <div className="rounded-xl overflow-hidden" style={{ height: 240 }}>
              <PanoramaViewer
                url={panoramaUrl}
                autoRotate={0.4}
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!title.trim() || !panoramaUrl}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          <Download size={16} />
          <EditableContent contentKey="preview360manager-generer-download-html" fallback="Generer & Download HTML" />
        </button>
      </div>

      {previews.length > 0 && (
        <div>
          <h3 className="font-medium text-white mb-4"><EditableContent contentKey="preview360manager-genererede-previews-denne-session" fallback="Genererede previews (denne session)" /></h3>
          <div className="space-y-3">
            {previews.map(entry => (
              <div key={entry.id} className="bg-neutral-700/40 border border-neutral-600 rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                    <Globe size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{entry.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{entry.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      title={expandedId === entry.id ? 'Skjul preview' : 'Vis preview'}
                      className={`p-2 rounded-lg transition-colors ${expandedId === entry.id ? 'bg-primary/20 text-primary' : 'text-neutral-400 hover:text-white hover:bg-neutral-600'}`}
                    >
                      {expandedId === entry.id ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button onClick={() => downloadHTML(entry)} title="Download HTML igen" className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-600 transition-colors">
                      <Download size={16} />
                    </button>
                    <button onClick={() => { setPreviews(p => p.filter(x => x.id !== entry.id)); if (expandedId === entry.id) setExpandedId(null); }} title="Fjern fra listen" className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {expandedId === entry.id && (
                  <div className="border-t border-neutral-600" style={{ height: 320 }}>
                    <PanoramaViewer url={entry.panoramaUrl} autoRotate={0.4} className="w-full h-full !rounded-none" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-neutral-700/20 rounded-xl p-5 border border-neutral-600/50">
        <h4 className="text-sm font-semibold text-neutral-300 mb-3"><EditableContent contentKey="preview360manager-saadan-virker-det" fallback="Sådan virker det" /></h4>
        <ol className="text-sm text-neutral-400 space-y-1.5 list-decimal list-inside">
          <li><EditableContent contentKey="preview360manager-upload-et-360-equirectangulaert-billede" fallback="Upload et 360° equirectangulært billede — slå &quot;360° Panorama&quot; til i upload-feltet" /></li>
          <li><EditableContent contentKey="preview360manager-giv-previewet-en-titel-f" fallback="Giv previewet en titel, f.eks. kundens adresse" /></li>
          <li><EditableContent contentKey="preview360manager-klik-generer-download-html-filen" fallback="Klik &quot;Generer & Download HTML&quot; — filen downloades automatisk" /></li>
          <li><EditableContent contentKey="preview360manager-send-html-filen-til-kunden" fallback="Send HTML-filen til kunden per mail eller besked" /></li>
          <li><EditableContent contentKey="preview360manager-kunden-aabner-filen-direkte-i" fallback="Kunden åbner filen direkte i browseren — eller embedder den som en" /> <code className="text-neutral-300"><EditableContent contentKey="preview360manager-iframe" fallback="<iframe>" /></code> <EditableContent contentKey="preview360manager-paa-wordpress-squarespace-o-l" fallback="på WordPress, Squarespace o.l." /></li>
        </ol>
        <p className="text-xs text-neutral-500 mt-3">
          <EditableContent contentKey="preview360manager-filen-er-selvstaendig-og-afhaenger" fallback="Filen er selvstændig og afhænger ikke af flai.dk. Kunden skal blot have internetadgang til at hente billedet og Pannellum-vieweren fra CDN." />
        </p>
      </div>
    </div>
  );
};

export default Preview360Manager;
