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
  const [visionApiKey, setVisionApiKey] = useState(() => localStorage.getItem('visionApiKey') || '');
  const fileInputRef = useRef(null);

  const saveVisionKey = (key) => {
    setVisionApiKey(key);
    if (key) localStorage.setItem('visionApiKey', key);
    else localStorage.removeItem('visionApiKey');
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        resolve(String(result).split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

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
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Vision API: ${res.status} — ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return (
      data?.responses?.[0]?.fullTextAnnotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description ||
      ''
    );
  };

  const ranking = [...players].sort((a, b) => (b.points || 0) - (a.points || 0));

  const addPlayer = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPlayers([
      ...players,
      {
        name: name.trim(),
        alliance: alliance.trim() || defaultAlliance || 'Sem aliança',
        points: Number(String(points).replace(/\./g, '')) || 0
      }
    ]);
    setName('');
    setPoints('');
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    const previews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }));
    setImages((prev) => [...prev, ...previews]);
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
      'normal', 'extremo', 'lenda', 'necessário', 'necessario', 'velocidade',
      'supervisão', 'supervisao', 'silêncio', 'silencio', 'recomendado',
      'pts', 'pontos', 'melhores', 'da', 'de', 'do', 'e', 'o', 'a',
      'sua posição', 'sua posicao', 'minha aliança', 'minha alianca',
      'seu ranking', 'ranking geral', 'classificacao da batalha'
    ]);

    const cleanName = (raw) =>
      raw
        .replace(pointsRegex, ' ')
        .replace(/^\d+[ºª°.]?\s*/i, '')
        .replace(/^(#?\d+[ºª°.]?\s*)+/i, '')
        .replace(/[^\p{L}\p{N}\s\-_.@Øø]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isValidName = (n) => {
      if (!n || n.length < 3 || n.length > 32) return false;
      const lower = n.toLowerCase();
      if (noiseWords.has(lower)) return false;
      if (/^\d+$/.test(n)) return false;
      if (lower.includes('posição') || lower.includes('posicao')) return false;
      if (lower.includes('ranking') || lower.includes('classifica')) return false;
      if (lower.includes('aliança') || lower.includes('alianca')) return false;
      if (lower.includes('fechar') || lower.includes('melhores')) return false;
      if (lower.includes('batalha') || lower.includes('pontos')) return false;
      if (!/\p{L}/u.test(n)) return false;
      if ((n.match(/\p{L}/gu) || []).length < 3) return false;
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
      let best = null;
      let bestDist = 99;
      for (const n of nameList) {
        if (usedNames.has(n.lineIndex)) continue;
        const dist = p.lineIndex - n.lineIndex;
        if (dist >= -1 && dist <= 3 && Math.abs(dist) < bestDist) {
          if (dist >= 0 || best === null) {
            best = n;
            bestDist = Math.abs(dist);
          }
        }
      }
      let namePart = best ? best.name : cleanName(p.line);
      if (isValidName(namePart)) {
        if (best) usedNames.add(best.lineIndex);
      } else {
        namePart = '???';
      }
      results.push({
        name: namePart,
        alliance: defaultAlliance || '',
        points: p.points,
        source: p.line
      });
    }

    const map = new Map();
    for (const r of results) {
      const key = r.name === '???' ? 'pts_' + r.points : r.name.toLowerCase().replace(/\s+/g, '');
      if (!map.has(key) || map.get(key).points < r.points) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => b.points - a.points);
  };

  const preprocessImage = (file) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const width = Math.round(img.width * 2);
          const height = Math.round(img.height * 2);
          canvas.width = width;
          canvas.height = height;
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
            if (blob) resolve(blob);
            else reject(new Error('Falha ao processar imagem'));
          }, 'image/png', 0.95);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Falha ao carregar imagem'));
      };
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
          if (visionApiKey.trim()) {
            setOcrProgress({
              current: i + 1,
              total: images.length,
              status: `Google Vision — imagem ${i + 1} de ${images.length}...`
            });
            text = await recognizeWithVision(img.file, visionApiKey.trim());
          } else {
            setOcrProgress({
              current: i + 1,
              total: images.length,
              status: `Preparando imagem ${i + 1} de ${images.length}...`
            });
            const processedBlob = await preprocessImage(img.file);
            setOcrProgress({
              current: i + 1,
              total: images.length,
              status: `Tesseract — imagem ${i + 1} de ${images.length}...`
            });
            const result = await Tesseract.recognize(processedBlob, 'eng', {
              logger: (m) => {
                if (m.status === 'recognizing text') {
                  setOcrProgress((prev) => ({
                    ...prev,
                    status: `Tesseract — imagem ${i + 1} (${Math.round((m.progress || 0) * 100)}%)`
                  }));
                }
              }
            });
            text = result?.data?.text || '';
          }

          const parsed = parseTextToPlayers(text);
          allRaw.push({ name: img.name, text });
          console.log(`Imagem ${i + 1}: ${parsed.length} jogadores`, parsed.map((p) => p.name));
          allExtracted.push(...parsed);
        } catch (err) {
          console.error(`Erro imagem ${i + 1}:`, err);
          allRaw.push({ name: img.name, text: `[Erro: ${err.message}]` });
        }
      }
    } catch (err) {
      console.error('Erro geral:', err);
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
        const newOnes = finalList
          .filter((p) => p.points > 0)
          .map((p) => {
            let n = (p.name || '').trim();
            if (!n || n === '???') {
              unknown += 1;
              n = `Jogador ${unknown}`;
            }
            return {
              name: n,
              alliance: (p.alliance || defaultAlliance || 'Sem aliança').trim(),
              points: Number(p.points) || 0
            };
          })
          .filter((p) => !existing.has(p.name.toLowerCase().replace(/\s+/g, '')));
        return [...prev, ...newOnes];
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

  const clearRanking = () => {
    if (confirm('Tem certeza que deseja limpar todo o ranking?')) setPlayers([]);
  };

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
          Envie os prints da <strong>Classificação da Batalha da Aliança</strong>.
          Com <strong>Google Vision API</strong> a leitura fica bem mais precisa.
          Sem a chave, usa Tesseract (local).
        </p>

        <div className="form" style={{ marginBottom: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>Aliança padrão</label>
            <input
              value={defaultAlliance}
              onChange={(e) => setDefaultAlliance(e.target.value)}
              placeholder="Ex: OsRenegados Br"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#64748b' }}>
              Google Vision API Key {visionApiKey ? '✓' : '(opcional)'}
            </label>
            <input
              type="password"
              value={visionApiKey}
              onChange={(e) => saveVisionKey(e.target.value.trim())}
              placeholder="Cole sua API key aqui"
              autoComplete="off"
            />
          </div>
        </div>
        {!visionApiKey && (
          <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>
            Sem API key → Tesseract. Com API key → Google Vision (recomendado).
            A chave fica só no seu navegador.
          </p>
        )}

        <div className="upload-area">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
          <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            Selecionar prints
          </button>
          {images.length > 0 && (
            <>
              <button type="button" className="btn-primary" onClick={processOCR} disabled={isProcessing}>
                {isProcessing ? 'Processando...' : `Ler ${images.length} print${images.length > 1 ? 's' : ''}`}
              </button>
              <button type="button" className="btn-danger" onClick={clearImages} disabled={isProcessing}>
                Limpar imagens
              </button>
            </>
          )}
        </div>

        {images.length > 0 && (
          <div className="image-preview-grid">
            {images.map((img, i) => (
              <div key={i} className="image-preview">
                <img src={img.url} alt={img.name} />
                <button type="button" className="remove-img" onClick={() => removeImage(i)} title="Remover">×</button>
                <span className="img-name">{img.name}</span>
              </div>
            ))}
          </div>
        )}

        {ocrProgress && (
          <div className="ocr-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }} />
            </div>
            <p>{ocrProgress.status}</p>
          </div>
        )}

        {!isProcessing && rawTexts.length > 0 && (
          <div className="extracted-section">
            {extracted.length > 0 ? (
              <>
                <h3 style={{ color: '#15803d' }}>✓ {extracted.length} registro(s) — revise os nomes</h3>
                <p className="muted" style={{ marginBottom: 12 }}>
                  Já lançados no ranking. Corrija nomes se aparecer "Jogador 1" ou "???".
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>Nome</th><th>Aliança</th><th>Pontos</th><th></th></tr>
                    </thead>
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
                <div className="extracted-actions">
                  <button type="button" className="btn-secondary" onClick={() => setExtracted([])}>Fechar lista</button>
                </div>
              </>
            ) : (
              <div style={{ padding: '16px 0' }}>
                <h3 style={{ color: '#b91c1c' }}>Nenhum dado reconhecido</h3>
                <p className="muted">Veja o texto bruto abaixo.</p>
              </div>
            )}
            <details className="raw-text" open={extracted.length === 0}>
              <summary>{extracted.length === 0 ? 'Texto bruto do OCR' : 'Ver texto bruto'}</summary>
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
            <h2>Ranking de jogadores</h2>
            <p className="muted">Ordenado por pontos</p>
          </div>
          {players.length > 0 && (
            <button type="button" className="btn-danger-sm" onClick={clearRanking}>Limpar ranking</button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Jogador</th><th>Aliança</th><th>Pontos</th></tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>Nenhum jogador ainda.</td></tr>
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
        <h2>Cadastrar jogador manualmente</h2>
        <p className="muted">Use para corrigir ou completar nomes.</p>
        <form onSubmit={addPlayer} className="form">
          <input placeholder="Nome do jogador" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Aliança" value={alliance} onChange={(e) => setAlliance(e.target.value)} />
          <input placeholder="Pontos (ex: 138123031)" value={points} onChange={(e) => setPoints(e.target.value)} />
          <button type="submit">Adicionar jogador</button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
