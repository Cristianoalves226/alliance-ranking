# Alliance Ranking

Sistema web de ranking de alianças e jogadores.

## Funcionalidades

- Login administrativo com Supabase Auth
- Cadastro de temporadas
- Cadastro de alianças com imagem
- Cadastro de jogadores e pontuações
- Ranking público compartilhável
- Exportação para Excel
- Geração de imagem do ranking
- Gráficos e histórico
- Deploy automático no GitHub Pages

## Desenvolvimento

```bash
npm install
npm run dev
```

## Variáveis de ambiente

Crie um arquivo `.env` com:

```env
VITE_SUPABASE_URL= sua_url
VITE_SUPABASE_ANON_KEY= sua_chave_publica
```

Nunca publique chaves secretas ou service role keys.
