import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const demoPlayers = [
  { name: 'Jogador A', alliance: 'Aliança Alpha', battle: 8500, conquest: 12000 },
  { name: 'Jogador B', alliance: 'Aliança Beta', battle: 9200, conquest: 10000 },
  { name: 'Jogador C', alliance: 'Aliança Alpha', battle: 7800, conquest: 11500 }
];

function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [name, setName] = useState('');
  const [alliance, setAlliance] = useState('Aliança Alpha');
  const [battle, setBattle] = useState('');
  const [conquest, setConquest] = useState('');
  const ranking = [...players].sort((a,b) => b.battle + b.conquest - (a.battle + a.conquest));
  const addPlayer = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPlayers([...players, { name, alliance, battle: Number(battle)||0, conquest: Number(conquest)||0 }]);
    setName(''); setBattle(''); setConquest('');
  };
  return <main className="app">
    <header><div><span className="eyebrow">PLATAFORMA COMPETITIVA</span><h1>Alliance Ranking</h1><p>Ranking de jogadores e alianças</p></div><span className="season">Temporada 1</span></header>
    <section className="stats"><div><small>Jogadores</small><strong>{players.length}</strong></div><div><small>Alianças</small><strong>{new Set(players.map(p=>p.alliance)).size}</strong></div><div><small>Pontos totais</small><strong>{ranking.reduce((s,p)=>s+p.battle+p.conquest,0).toLocaleString('pt-BR')}</strong></div></section>
    <section className="panel"><h2>Ranking de jogadores</h2><p className="muted">Classificação por pontuação total</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Aliança</th><th>Batalha</th><th>Conquista</th><th>Total</th></tr></thead><tbody>{ranking.map((p,i)=><tr key={i}><td>{i+1}º</td><td><b>{p.name}</b></td><td>{p.alliance}</td><td>{p.battle.toLocaleString('pt-BR')}</td><td>{p.conquest.toLocaleString('pt-BR')}</td><td><b>{(p.battle+p.conquest).toLocaleString('pt-BR')}</b></td></tr>)}</tbody></table></div></section>
    <section className="panel"><h2>Cadastrar jogador</h2><p className="muted">Protótipo inicial. A integração Supabase será configurada na próxima etapa.</p><form onSubmit={addPlayer} className="form"><input placeholder="Nome do jogador" value={name} onChange={e=>setName(e.target.value)} required/><input placeholder="Nome da aliança" value={alliance} onChange={e=>setAlliance(e.target.value)} required/><input type="number" min="0" placeholder="Batalha" value={battle} onChange={e=>setBattle(e.target.value)}/><input type="number" min="0" placeholder="Conquista" value={conquest} onChange={e=>setConquest(e.target.value)}/><button>Adicionar jogador</button></form></section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
