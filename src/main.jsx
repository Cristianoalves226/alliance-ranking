import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Tesseract from 'tesseract.js';
import './styles.css';

const demoPlayers = [
  { name: 'Jogador A', alliance: 'Aliança Alpha', battle: 8500, conquest: 12000 },
  { name: 'Jogador B', alliance: 'Aliança Beta', battle: 9200, conquest: 10000 },
  { name: 'Jogador C', alliance: 'Aliança Alpha', battle: 7800, conquest: 11500 }
];

function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [name, setName] = useState('');
  const [alliance, setAlliance] = useState('');
  const [battle, setBattle] = useState('');
  const [conquest, setConquest] = useState('');

  // OCR states
  const [images, setImages] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [extracted, setExtracted] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawTexts, setRawTexts] = useState([]);
  const fileInputRef = useRef(null);

  const ranking = [...players].sort((a, b) => (b.battle + b.conquest) - (a.battle + a.conquest));

  const addPlayer = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPlayers([
      ...players,
      {
        name: name.trim(),
        alliance: alliance.trim() || 'Sem aliança',
        battle: Number(battle) || 0,
        conquest: Number(conquest) || 0
      }
    ]);
    setName('');
    setAlliance('');
    setBattle('');
    setConquest('');
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
      .filter((l) => l.length > 1);

    const results = [];
    const numberRegex = /(\d{1,3}(?:[.,]\d{3})*|\d+)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const numbers = [...line.matchAll(numberRegex)].map((m) =>
        Number(m[0].replace(/[.,]/g, ''))
      );

      if (numbers.length >= 1) {
        let namePart = line
          .replace(numberRegex, ' ')
          .replace(/[^\p{L}\p{N}\s\-_.]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        namePart = namePart.replace(/^(#?\d+[ºª°.]?\s*)+/i, '').trim();

        if (namePart.length >= 2 && namePart.length < 40) {
          const battleVal = numbers[0] || 0;
          const conquestVal = numbers[1] || 0;

          let allianceVal = '';
          if (i > 0) {
            const prev = lines[i - 1];
            if (prev.length <= 12 && !/\d{3,}/.test(prev) && !/ranking|pontos|total|jogador/i.test(prev)) {
              allianceVal = prev;
            }
          }

          results.push({
            name: namePart,
            alliance: allianceVal || 'Sem aliança',
            battle: battleVal,
            conquest: conquestVal,
            source: line
          });
        }
      }
    }

    const unique = [];
    const seen = new Set();
    for (const r of results) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    return unique;
  };

  const processOCR = async () => {
    if (images.length === 0) return;

    setIsProcessing(true);
    setExtracted([]);
    setRawTexts([]);
    setOcrProgress({ current: 0, total: images.length, status: 'Iniciando...' });

    const allExtracted = [];
    const allRaw = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      setOcrProgress({
        current: i + 1,
        total: images.length,
        status: `Lendo imagem ${i + 1} de ${images.length}...`
      });

      try {
        const { data: { text } } = await Tesseract.recognize(img.file, 'por+eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress((prev) => ({
                ...prev,
                status: `Lendo imagem ${i + 1} de ${images.length} (${Math.round(m.progress * 100)}%)`
              }));
            }
          }
        });

        allRaw.push({ name: img.name, text });
        const parsed = parseTextToPlayers(text);
        allExtracted.push(...parsed);
      } catch (err) {
        console.error('Erro OCR:', err);
        allRaw.push({ name: img.name, text: `[Erro ao processar: ${err.message}]` });
      }
    }

    setRawTexts(allRaw);
    setExtracted(allExtracted);
    setOcrProgress(null);
    setIsProcessing(false);
  };

  const updateExtracted = (index, field, value) => {
    setExtracted((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeExtracted = (index) => {
    setExtracted((prev) => prev.filter((_, i) => i !== index));
  };

  const addExtractedToRanking = () => {
    const toAdd = extracted
      .filter((p) => p.name && p.name.trim().length > 1)
      .map((p) => ({
        name: p.name.trim(),
        alliance: (p.alliance || 'Sem aliança').trim(),
        battle: Number(p.battle) || 0,
        conquest: Number(p.conquest) || 0
      }));

    if (toAdd.length === 0) return;

    setPlayers((prev) => {
      const existing = new Set(prev.map((p) => p.name.toLowerCase()));
      const newOnes = toAdd.filter((p) => !existing.has(p.name.toLowerCase()));
      return [...prev, ...newOnes];
    });

    setExtracted([]);
  };

  const clearRanking = () => {
    if (confirm('Tem certeza que deseja limpar todo o ranking?')) {
      setPlayers([]);
    }
  };

  return (
    <main className="app">
      <header>
        <div>
          <span className="eyebrow">PLATAFORMA COMPETITIVA</span>
          <h1>Alliance Ranking</h1>
          <p>Ranking de jogadores e alianças</p>
        </div>
        <span className="season">Temporada 1</span>
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
          <strong>
            {ranking.reduce((s, p) => s + p.battle + p.conquest, 0).toLocaleString('pt-BR')}
          </strong>
        </div>
      </section>

      <section className="panel">
        <h2>Importar via prints (OCR)</h2>
        <p className="muted">
          Envie uma ou mais capturas de tela do ranking. O sistema vai ler o texto e tentar
          extrair os jogadores automaticamente. Depois você revisa e confirma.
        </p>

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

        {extracted.length > 0 && (
          <div className="extracted-section">
            <h3>Dados extraídos ({extracted.length}) — revise antes de adicionar</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Aliança</th>
                    <th>Batalha</th>
                    <th>Conquista</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={p.name}
                          onChange={(e) => updateExtracted(i, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={p.alliance}
                          onChange={(e) => updateExtracted(i, 'alliance', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={p.battle}
                          onChange={(e) => updateExtracted(i, 'battle', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={p.conquest}
                          onChange={(e) => updateExtracted(i, 'conquest', e.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn-danger-sm" onClick={() => removeExtracted(i)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="extracted-actions">
              <button type="button" className="btn-primary" onClick={addExtractedToRanking}>
                Adicionar {extracted.length} jogador(es) ao ranking
              </button>
              <button type="button" className="btn-secondary" onClick={() => setExtracted([])}>
                Descartar
              </button>
            </div>
          </div>
        )}

        {rawTexts.length > 0 && extracted.length === 0 && (
          <details className="raw-text">
            <summary>Ver texto bruto lido pelo OCR</summary>
            {rawTexts.map((r, i) => (
              <div key={i}>
                <strong>{r.name}</strong>
                <pre>{r.text}</pre>
              </div>
            ))}
          </details>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Ranking de jogadores</h2>
            <p className="muted">Classificação por pontuação total (Batalha + Conquista)</p>
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
                <th>Batalha</th>
                <th>Conquista</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>
                    Nenhum jogador cadastrado ainda
                  </td>
                </tr>
              ) : (
                ranking.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}º</td>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td>{p.alliance}</td>
                    <td>{p.battle.toLocaleString('pt-BR')}</td>
                    <td>{p.conquest.toLocaleString('pt-BR')}</td>
                    <td>
                      <b>{(p.battle + p.conquest).toLocaleString('pt-BR')}</b>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Cadastrar jogador manualmente</h2>
        <p className="muted">Use quando o OCR não capturar corretamente ou para ajustes pontuais.</p>
        <form onSubmit={addPlayer} className="form">
          <input
            placeholder="Nome do jogador"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Nome da aliança"
            value={alliance}
            onChange={(e) => setAlliance(e.target.value)}
          />
          <input
            type="number"
            min="0"
            placeholder="Batalha"
            value={battle}
            onChange={(e) => setBattle(e.target.value)}
          />
          <input
            type="number"
            min="0"
            placeholder="Conquista"
            value={conquest}
            onChange={(e) => setConquest(e.target.value)}
          />
          <button type="submit">Adicionar jogador</button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
