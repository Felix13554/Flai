/**
 * api/ai-proxy.js — Vercel Serverless Function
 *
 * Replaces: netlify/functions/ai-proxy.js
 * Old URL:  /.netlify/functions/ai-proxy
 * New URL:  /api/ai-proxy
 *
 * Proxies AI requests server-side so:
 *  1. API keys are never exposed to the browser
 *  2. Gemini domain-allowlist restrictions don't apply (server origin)
 *  3. GROQ is available as fallback with the server-side key
 *
 * POST /api/ai-proxy
 * Body: { systemPrompt: string, history: [{role, content}] }
 * Response: { text: string } | { error: string }
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || process.env.VITE_GROQ_API_KEY   || '';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function callGemini(systemPrompt, history) {
  if (!GEMINI_API_KEY) throw new Error('No Gemini key');
  const contents = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
  const res = await withTimeout(fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  }), 15_000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini empty response');
  return text;
}

async function callGroq(modelId, systemPrompt, history) {
  if (!GROQ_API_KEY) throw new Error('No Groq key');
  const res = await withTimeout(fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  }), 15_000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq/${modelId} ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Groq/${modelId} empty`);
  return text;
}

export default async function handler(req, res) {
  // Set CORS headers on every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let systemPrompt, history;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    systemPrompt = body.systemPrompt;
    history      = body.history;
    if (!systemPrompt || !Array.isArray(history)) throw new Error('Invalid body');
  } catch (err) {
    return res.status(400).json({ error: 'Bad request: ' + err.message });
  }

  const errors = [];

  // Try Gemini first
  try {
    const text = await callGemini(systemPrompt, history);
    return res.status(200).json({ text });
  } catch (err) {
    errors.push(`Gemini: ${err.message}`);
    console.warn('[ai-proxy] Gemini failed:', err.message);
  }

  // Fallback through Groq models
  for (const model of GROQ_MODELS) {
    try {
      const text = await callGroq(model, systemPrompt, history);
      return res.status(200).json({ text });
    } catch (err) {
      errors.push(`Groq/${model}: ${err.message}`);
      console.warn(`[ai-proxy] Groq/${model} failed:`, err.message);
    }
  }

  console.error('[ai-proxy] All providers failed:', errors);
  return res.status(502).json({ error: 'All AI providers failed', details: errors });
}
