import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Tesseract from 'tesseract.js';
import './styles.css';

const demoPlayers = [
  { name: 'xcris21', alliance: 'OsRenegados Br', points: 138123031 },
  { name: 'AgenteArcangel14', alliance: 'OsRenegados Br', points: 120736893 },
  { name: 'alexanDDre 02', alliance: 'OsRenegados Br', points: 111379740 }
];

function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [name, setName] = useState('');
  const [alliance, setAlliance] = useState('OsRenegados Br');
  const [points, setPoints] = useState('');
  const [images, setImages] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [extracted, setExtracted] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawTexts, setRawTexts] = useState([]);
  const [defaultAlliance, setDefaultAlliance] = useState('OsRenegados Br');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('geminiKey') || '');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('openaiKey') || '');
  const [visionApiKey, setVisionApiKey] = useState(() => localStorage.getItem('visionApiKey') || '');
  const fileInputRef = useRef(null);

  const saveKey = (storageKey, setter) => (value) => {
    setter(value);
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const EXTRACT_PROMPT = `Você está lendo um print do ranking do jogo (Batalha da Aliança).
Extraia TODOS os jogadores/alianças visíveis com nome e pontos.
Retorne APENAS um JSON válido (sem markdown), neste formato:
{"players":[{"name":"nome","points":123456,"alliance":""}]}
Regras:
- points: só números inteiros (sem pontos/vírgulas)
- name: nome do jogador ou da aliança como aparece na tela
- ignore títulos como "RANKING", "SUA POSIÇÃO", "FECHAR"
- se não tiver aliança, use string vazia`;

  const recognizeWithGemini = async (file, apiKey) => {
    const base64 = await fileToBase64(file);
    const mime = file.type || 'image/jpeg';
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
    let lastErr = '';
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: EXTRACT_PROMPT },
                { inline_data: { mime_type: mime, data: base64 } }
              ]
            }],
            generationConfig: { temperature: 0.1 }
          })
        }
      );
      if (res.ok) {
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      lastErr = await res.text();
      if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(lastErr)) break;
      if (res.status === 401 || res.status === 403) break;
    }
    throw new Error(`Gemini: ${lastErr.slice(0, 220)}`);
  };

  const recognizeWithGPT4o = async (file, apiKey) => {
    const base64 = await fileToBase64(file);
    const mime = file.type || 'image/jpeg';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
          ]
        }]
      })
    });
    if (!res.ok) throw new Error(`GPT-4o: ${res.status} — ${(await res.text()).slice(0, 220)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  };

  const recognizeWithVision = async (file, apiKey) => {
    const base64 = await fileToBase64(file);
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['pt', 'en'] }
          }]
        })
      }
    );
    if (!res.ok) throw new Error(`Vision API: ${res.status} — ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.responses?.[0]?.fullTextAnnotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description || '';
  };

  const ranking = [...players].sort((a, b) => (b.points || 0) - (a.points || 0));

  const addPlayer = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPlayers([...players, {
      name: name.trim(),
      alliance: alliance.trim() || defaultAlliance || 'Sem aliança',
      points: Number(String(points).replace(/\./g, '')) || 0
    }]);
    setName('');
    setPoints('');
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => [...prev, ...files.map((file) => ({
      file, url: URL.createObjectURL(file), name: file.name
    }))]);
    e.target.value = '';
  };

  const removeImage = (index) => {
    setImages((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].url);
      copy.splice(index, 1);
      return copy;
    });
  };

  const clearImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setExtracted([]);
    setRawTexts([]);
    setOcrProgress(null);
  };

  const parseTextToPlayers = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const pointsRegex = /(\d{1,3}(?:[.\s,]\d{3}){1,5}|\d{6,})\s*(?:pts\.?|pontos)?/i;
    const noiseWords = new Set([
      'ranking', 'geral', 'sua', 'aliança', 'alianca', 'posição', 'posicao',
      'minha', 'seu', 'classificação', 'classificacao', 'batalha', 'fechar',
      'normal', 'extremo', 'lenda', 'pts', 'pontos', 'melhores', 'da', 'de', 'do', 'e', 'o', 'a',
      'sua posição', 'sua posicao', 'minha aliança', 'minha alianca',
      'seu ranking', 'ranking geral', 'classificacao da batalha'
    ]);
    const cleanName = (raw) =>
      raw.replace(pointsRegex, ' ').replace(/^\d+[ºª°.]?\s*/i, '')
        .replace(/^(#?\d+[ºª°.]?\s*)+/i, '')
        .replace(/[^\p{L}\p{N}\s\-_.@Øø]/gu, ' ').replace(/\s+/g, ' ').trim();
    const isValidName = (n) => {
      if (!n || n.length < 3 || n.length > 32) return false;
      const lower = n.toLowerCase();
      if (noiseWords.has(lower) || /^\d+$/.test(n)) return false;
      if (['posição','posicao','ranking','classifica','aliança','alianca','fechar','melhores','batalha','pontos'].some((x) => lower.includes(x))) return false;
      if (!/\p{L}/u.test(n) || (n.match(/\p{L}/gu) || []).length < 3) return false;
      return true;
    };
    const pointsList = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pointsRegex);
      if (!match) continue;
      const pointsVal = Number(match[1].replace(/[.\s,]/g, ''));
      if (pointsVal < 5000) continue;
      pointsList.push({ lineIndex: i, points: pointsVal, line: lines[i] });
    }
    const nameList = [];
    for (let i = 0; i < lines.length; i++) {
      const n = cleanName(lines[i]);
      if (isValidName(n)) nameList.push({ lineIndex: i, name: n });
    }
    const results = [];
    const usedNames = new Set();
    for (const p of pointsList) {
      let best = null, bestDist = 99;
      for (const n of nameList) {
        if (usedNames.has(n.lineIndex)) continue;
        const dist = p.lineIndex - n.lineIndex;
        if (dist >= -1 && dist <= 3 && Math.abs(dist) < bestDist) {
          if (dist >= 0 || best === null) { best = n; bestDist = Math.abs(dist); }
        }
      }
      let namePart = best ? best.name : cleanName(p.line);
      if (isValidName(namePart)) { if (best) usedNames.add(best.lineIndex); }
      else namePart = '???';
      results.push({ name: namePart, alliance: defaultAlliance || '', points: p.points, source: p.line });
    }
    const map = new Map();
    for (const r of results) {
      const key = r.name === '???' ? 'pts_' + r.points : r.name.toLowerCase().replace(/\s+/g, '');
      if (!map.has(key) || map.get(key).points < r.points) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => b.points - a.points);
  };

  const parseModelResponse = (text) => {
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const obj = JSON.parse(cleaned.slice(start, end + 1));
        const list = obj.players || obj.jogadores || [];
        if (Array.isArray(list) && list.length > 0) {
          return list.map((p) => ({
            name: String(p.name || p.nome || '').trim(),
            alliance: String(p.alliance || p.alianca || defaultAlliance || '').trim(),
            points: Number(String(p.points || p.pontos || '0').replace(/[.\s,]/g, '')) || 0
          })).filter((p) => p.name && p.points >= 1000);
        }
      }
    } catch (_) {}
    return parseTextToPlayers(text);
  };

  const preprocessImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const width = Math.round(img.width * 2);
        const height = Math.round(img.height * 2);
        canvas.width = width; canvas.height = height;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          gray = (gray - 128) * 1.8 + 128;
          gray = 255 - gray;
          gray = Math.max(0, Math.min(255, gray));
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob); else reject(new Error('Falha ao processar imagem'));
        }, 'image/png', 0.95);
      } catch (err) { URL.revokeObjectURL(objectUrl); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Falha ao carregar imagem')); };
    img.src = objectUrl;
  });

  const processOCR = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setExtracted([]);
    setRawTexts([]);
    setOcrProgress({ current: 0, total: images.length, status: 'Iniciando...' });
    const allExtracted = [];
    const allRaw = [];
    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          let text = '';
          let useStructured = false;
          if (geminiKey.trim()) {
            setOcrProgress({ current: i + 1, total: images.length, status: `Gemini — imagem ${i + 1} de ${images.length}...` });
            text = await recognizeWithGemini(img.file, geminiKey.trim());
            useStructured = true;
          } else if (openaiKey.trim()) {
            setOcrProgress({ current: i + 1, total: images.length, status: `GPT-4o — imagem ${i + 1} de ${images.length}...` });
            text = await recognizeWithGPT4o(img.file, openaiKey.trim());
            useStructured = true;
          } else if (visionApiKey.trim()) {
            setOcrProgress({ current: i + 1, total: images.length, status: `Google Vision — imagem ${i + 1} de ${images.length}...` });
            text = await recognizeWithVision(img.file, visionApiKey.trim());
          } else {
            setOcrProgress({ current: i + 1, total: images.length, status: `Preparando imagem ${i + 1}...` });
            const processedBlob = await preprocessImage(img.file);
            setOcrProgress({ current: i + 1, total: images.length, status: `Tesseract — imagem ${i + 1}...` });
            const result = await Tesseract.recognize(processedBlob, 'eng', {
              logger: (m) => {
                if (m.status === 'recognizing text') {
                  setOcrProgress((prev) => ({ ...prev, status: `Tesseract — imagem ${i + 1} (${Math.round((m.progress || 0) * 100)}%)` }));
                }
              }
            });
            text = result?.data?.text || '';
          }
          const parsed = useStructured ? parseModelResponse(text) : parseTextToPlayers(text);
          allRaw.push({ name: img.name, text });
          allExtracted.push(...parsed);
        } catch (err) {
          console.error(err);
          allRaw.push({ name: img.name, text: `[Erro: ${err.message}]` });
        }
      }
    } catch (err) {
      allRaw.push({ name: 'sistema', text: `[Erro: ${err.message}]` });
    }
    const map = new Map();
    for (const r of allExtracted) {
      const key = r.name === '???' ? 'pts_' + r.points : r.name.toLowerCase().replace(/\s+/g, '');
      if (!map.has(key) || map.get(key).points < r.points) map.set(key, r);
    }
    const finalList = Array.from(map.values()).sort((a, b) => b.points - a.points);
    setRawTexts(allRaw.length ? allRaw : [{ name: 'resultado', text: 'Nenhum texto lido.' }]);
    setExtracted(finalList);
    setOcrProgress(null);
    setIsProcessing(false);
    if (finalList.length > 0) {
      setPlayers((prev) => {
        const existing = new Set(prev.map((p) => p.name.toLowerCase().replace(/\s+/g, '')));
        let unknown = 0;
        return [...prev, ...finalList.filter((p) => p.points > 0).map((p) => {
          let n = (p.name || '').trim();
          if (!n || n === '???') { unknown += 1; n = `Jogador ${unknown}`; }
          return { name: n, alliance: (p.alliance || defaultAlliance || 'Sem aliança').trim(), points: Number(p.points) || 0 };
        }).filter((p) => !existing.has(p.name.toLowerCase().replace(/\s+/g, '')))];
      });
    }
  };

  const updateExtracted = (index, field, value) => {
    setExtracted((prev) => {
      const copy = [...prev];
      let val = value;
      if (field === 'points') val = Number(String(value).replace(/\./g, '')) || 0;
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };
  const removeExtracted = (index) => setExtracted((prev) => prev.filter((_, i) => i !== index));
  const clearRanking = () => { if (confirm('Limpar todo o ranking?')) setPlayers([]); };
  const formatPoints = (n) => Number(n || 0).toLocaleString('pt-BR');

  return (
    <main className="app">
      <header>
        <div>
          <span className="eyebrow">BATALHA DA ALIANÇA</span>
          <h1>Alliance Ranking</h1>
          <p>Importação automática de ranking via prints</p>
        </div>
        <span className="season">Temporada atual</span>
      </header>

      <section className="stats">
        <div><small>Jogadores</small><strong>{players.length}</strong></div>
        <div><small>Alianças</small><strong>{new Set(players.map((p) => p.alliance)).size}</strong></div>
        <div><small>Pontos totais</small><strong>{formatPoints(ranking.reduce((s, p) => s + (p.points || 0), 0))}</strong></div>
      </section>

      <section className="panel">
        <h2>Importar via prints (OCR)</h2>
        <p className="muted">
          Prioridade: <strong>Gemini</strong> → GPT-4o → Vision → Tesseract.
          Chaves AQ. do AI Studio são suportadas.
        </p>
        <div className="form" style={{ marginBottom: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>Aliança padrão</label>
            <input value={defaultAlliance} onChange={(e) => setDefaultAlliance(e.target.value)} placeholder="Ex: OsRenegados Br" />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>Gemini API Key {geminiKey ? '✓' : '(recomendado)'}</label>
            <input type="password" value={geminiKey} onChange={(e) => saveKey('geminiKey', setGeminiKey)(e.target.value.trim())} placeholder="AQ.... ou AIza..." autoComplete="off" />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>OpenAI API Key {openaiKey ? '✓' : ''}</label>
            <input type="password" value={openaiKey} onChange={(e) => saveKey('openaiKey', setOpenaiKey)(e.target.value.trim())} placeholder="sk-..." autoComplete="off" />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>Google Vision Key {visionApiKey ? '✓' : ''}</label>
            <input type="password" value={visionApiKey} onChange={(e) => saveKey('visionApiKey', setVisionApiKey)(e.target.value.trim())} placeholder="Cloud Vision" autoComplete="off" />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Gemini free: https://aistudio.google.com/apikey — chave fica só no navegador
        </p>

        <div className="upload-area">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
          <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>Selecionar prints</button>
          {images.length > 0 && (
            <>
              <button type="button" className="btn-primary" onClick={processOCR} disabled={isProcessing}>
                {isProcessing ? 'Processando...' : `Ler ${images.length} print${images.length > 1 ? 's' : ''}`}
              </button>
              <button type="button" className="btn-danger" onClick={clearImages} disabled={isProcessing}>Limpar</button>
            </>
          )}
        </div>

        {images.length > 0 && (
          <div className="image-preview-grid">
            {images.map((img, i) => (
              <div key={i} className="image-preview">
                <img src={img.url} alt={img.name} />
                <button type="button" className="remove-img" onClick={() => removeImage(i)}>×</button>
                <span className="img-name">{img.name}</span>
              </div>
            ))}
          </div>
        )}

        {ocrProgress && (
          <div className="ocr-progress">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }} /></div>
            <p>{ocrProgress.status}</p>
          </div>
        )}

        {!isProcessing && rawTexts.length > 0 && (
          <div className="extracted-section">
            {extracted.length > 0 ? (
              <>
                <h3 style={{ color: '#15803d' }}>✓ {extracted.length} registro(s)</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Nome</th><th>Aliança</th><th>Pontos</th><th></th></tr></thead>
                    <tbody>
                      {extracted.map((p, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td><input value={p.name} onChange={(e) => updateExtracted(i, 'name', e.target.value)} /></td>
                          <td><input value={p.alliance} onChange={(e) => updateExtracted(i, 'alliance', e.target.value)} /></td>
                          <td><input value={formatPoints(p.points)} onChange={(e) => updateExtracted(i, 'points', e.target.value)} /></td>
                          <td><button type="button" className="btn-danger-sm" onClick={() => removeExtracted(i)}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setExtracted([])}>Fechar</button>
              </>
            ) : (
              <div style={{ padding: '16px 0' }}>
                <h3 style={{ color: '#b91c1c' }}>Nenhum dado reconhecido</h3>
              </div>
            )}
            <details className="raw-text" open={extracted.length === 0}>
              <summary>Texto/JSON bruto</summary>
              {rawTexts.map((r, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <strong>{r.name}</strong>
                  <pre>{r.text || '(vazio)'}</pre>
                </div>
              ))}
            </details>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Ranking</h2>
            <p className="muted">Ordenado por pontos</p>
          </div>
          {players.length > 0 && <button type="button" className="btn-danger-sm" onClick={clearRanking}>Limpar</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Jogador</th><th>Aliança</th><th>Pontos</th></tr></thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>Vazio</td></tr>
              ) : ranking.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}º</td>
                  <td><b>{p.name}</b></td>
                  <td>{p.alliance}</td>
                  <td><b>{formatPoints(p.points)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Cadastro manual</h2>
        <form onSubmit={addPlayer} className="form">
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Aliança" value={alliance} onChange={(e) => setAlliance(e.target.value)} />
          <input placeholder="Pontos" value={points} onChange={(e) => setPoints(e.target.value)} />
          <button type="submit">Adicionar</button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
