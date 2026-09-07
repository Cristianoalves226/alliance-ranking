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
  const fileInputRef = useRef(null);

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
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

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

    const cleanName = (raw) => {
      return raw
        .replace(pointsRegex, ' ')
        .replace(/^\d+[ºª°.]?\s*/i, '')
        .replace(/^(#?\d+[ºª°.]?\s*)+/i, '')
        .replace(/[^\p{L}\p{N}\s\-_.@Øø]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

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
      const letters = (n.match(/\p{L}/gu) || []).length;
      if (letters < 3) return false;
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
      if (isValidName(n)) {
        nameList.push({ lineIndex: i, name: n });
      }
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
        results.push({
          name: namePart,
          alliance: defaultAlliance || '',
          points: p.points,
          source: p.line
        });
      }
    }

    const map = new Map();
    for (const r of results) {
      const key = r.name.toLowerCase().replace(/\s+/g, '');
      if (!map.has(key) || map.get(key).points < r.points) {
        map.set(key, r);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.points - a.points);
  };

  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let width = img.width;
          let height = img.height;
          const scale = 2;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          canvas.width = width;
          canvas.height = height;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            gray = (gray - 128) * 1.8 + 128;
            gray = 255 - gray;
            gray = Math.max(0, Math.min(255, gray));
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              if (blob) resolve(blob);
              else reject(new Error('Falha ao processar imagem'));
            },
            'image/png',
            0.95
          );
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
  };

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
        setOcrProgress({
          current: i + 1,
          total: images.length,
          status: `Preparando imagem ${i + 1} de ${images.length}...`
        });

        try {
          const processedBlob = await preprocessImage(img.file);

          setOcrProgress({
            current: i + 1,
            total: images.length,
            status: `Lendo imagem ${i + 1} de ${images.length}...`
          });

          const result = await Tesseract.recognize(processedBlob, 'eng', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setOcrProgress((prev) => ({
                  ...prev,
                  status: `Lendo imagem ${i + 1} de ${images.length} (${Math.round((m.progress || 0) * 100)}%)`
                }));
              }
            }
          });

          const text = result?.data?.text || '';
          const parsed = parseTextToPlayers(text);

          allRaw.push({ name: img.name, text });
          console.log(`Imagem ${i + 1} extraiu ${parsed.length} jogadores`, parsed.map(p => p.name));
          allExtracted.push(...parsed);
        } catch (err) {
          console.error(`Erro na imagem ${i + 1}:`, err);
          allRaw.push({ name: img.name, text: `[Erro ao processar: ${err.message}]` });
        }
      }
    } catch (err) {
      console.error('Erro geral no OCR:', err);
      allRaw.push({ name: 'sistema', text: `[Erro geral: ${err.message}]` });
    }

    const map = new Map();
    for (const r of allExtracted) {
      const key = r.name.toLowerCase().replace(/\s+/g, '');
      if (!map.has(key) || map.get(key).points < r.points) {
        map.set(key, r);
      }
    }
    const finalList = Array.from(map.values()).sort((a, b) => b.points - a.points);

    console.log('Total final extraído:', finalList.length, finalList);

    setRawTexts(allRaw.length > 0 ? allRaw : [{ name: 'resultado', text: 'Nenhum texto foi lido.' }]);
    setExtracted(finalList);
    setOcrProgress(null);
    setIsProcessing(false);

    if (finalList.length > 0) {
      setPlayers((prev) => {
        const existing = new Set(prev.map((p) => p.name.toLowerCase().replace(/\s+/g, '')));
        const newOnes = finalList
          .filter((p) => p.name && p.name.trim().length > 1)
          .filter((p) => !existing.has(p.name.toLowerCase().replace(/\s+/g, '')))
          .map((p) => ({
            name: p.name.trim(),
            alliance: (p.alliance || defaultAlliance || 'Sem aliança').trim(),
            points: Number(p.points) || 0
          }));
        return [...prev, ...newOnes];
      });
    }
  };

  const updateExtracted = (index, field, value) => {
    setExtracted((prev) => {
      const copy = [...prev];
      let val = value;
      if (field === 'points') {
        val = Number(String(value).replace(/\./g, '')) || 0;
      }
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const removeExtracted = (index) => {
    setExtracted((prev) => prev.filter((_, i) => i !== index));
  };

  const clearRanking = () => {
    if (confirm('Tem certeza que deseja limpar todo o ranking?')) {
      setPlayers([]);
    }
  };

  const formatPoints = (n) => {
    return Number(n || 0).toLocaleString('pt-BR');
  };

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
        <div>
          <small>Jogadores</small>
          <strong>{players.length}</strong>
        </div>
        <div>
          <small>Alianças</small>
          <strong>{new Set(players.map((p) => p.alliance)).size}</strong>
        </div>
        <div>
          <small>Pontos totais</small>
          <strong>{formatPoints(ranking.reduce((s, p) => s + (p.points || 0), 0))}</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Importar via prints (OCR)</h2>
        <p className="muted">
          Envie os prints da <strong>Classificação da Batalha da Aliança</strong>.
          Assim que o sistema terminar de ler, os jogadores são lançados automaticamente na tabela.
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
        </div>

        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            Selecionar prints
          </button>

          {images.length > 0 && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={processOCR}
                disabled={isProcessing}
              >
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
                <button type="button" className="remove-img" onClick={() => removeImage(i)} title="Remover">
                  ×
                </button>
                <span className="img-name">{img.name}</span>
              </div>
            ))}
          </div>
        )}

        {ocrProgress && (
          <div className="ocr-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
              />
            </div>
            <p>{ocrProgress.status}</p>
          </div>
        )}

        {!isProcessing && rawTexts.length > 0 && (
          <div className="extracted-section">
            {extracted.length > 0 ? (
              <>
                <h3 style={{ color: '#15803d' }}>
                  ✓ {extracted.length} jogador(es) lidos e já adicionados ao ranking
                </h3>
                <p className="muted" style={{ marginBottom: 12 }}>
                  Os dados já foram lançados na tabela abaixo. Você ainda pode revisar os nomes.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Nome</th>
                        <th>Aliança</th>
                        <th>Pontos</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {extracted.map((p, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>
                            <input value={p.name} onChange={(e) => updateExtracted(i, 'name', e.target.value)} />
                          </td>
                          <td>
                            <input value={p.alliance} onChange={(e) => updateExtracted(i, 'alliance', e.target.value)} />
                          </td>
                          <td>
                            <input value={formatPoints(p.points)} onChange={(e) => updateExtracted(i, 'points', e.target.value)} />
                          </td>
                          <td>
                            <button type="button" className="btn-danger-sm" onClick={() => removeExtracted(i)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="extracted-actions">
                  <button type="button" className="btn-secondary" onClick={() => setExtracted([])}>
                    Fechar esta lista
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '16px 0' }}>
                <h3 style={{ color: '#b91c1c' }}>Nenhum jogador foi reconhecido automaticamente</h3>
                <p className="muted">
                  O OCR leu o texto, mas não conseguiu identificar nomes + pontos com segurança.
                  Veja o texto bruto abaixo e cadastre manualmente se precisar.
                </p>
              </div>
            )}

            <details className="raw-text" open={extracted.length === 0}>
              <summary>
                {extracted.length === 0
                  ? 'Texto bruto lido pelo OCR (use para cadastrar manualmente)'
                  : 'Ver texto bruto lido pelo OCR (debug)'}
              </summary>
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
            <p className="muted">Ordenado por pontos da Batalha da Aliança</p>
          </div>
          {players.length > 0 && (
            <button type="button" className="btn-danger-sm" onClick={clearRanking}>
              Limpar ranking
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Aliança</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>
                    Nenhum jogador cadastrado ainda.
                  </td>
                </tr>
              ) : (
                ranking.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}º</td>
                    <td><b>{p.name}</b></td>
                    <td>{p.alliance}</td>
                    <td><b>{formatPoints(p.points)}</b></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Cadastrar jogador manualmente</h2>
        <p className="muted">Use quando o OCR errar algum nome ou ponto.</p>
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
