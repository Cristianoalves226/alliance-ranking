# Alliance Ranking

Sistema web de ranking de alianças e jogadores.

## Funcionalidades

- **Importação por OCR**: envie prints (capturas de tela) do ranking e o sistema lê o texto automaticamente
- Cadastro manual de jogadores
- Ranking público ordenado por pontuação total
- Estatísticas rápidas (total de jogadores, alianças e pontos)
- Exportação para Excel (planejado)
- Geração de imagem do ranking (planejado)
- Login administrativo com Supabase Auth (próxima etapa)
- Cadastro de temporadas e alianças com imagem (próxima etapa)
- Deploy automático no GitHub Pages

## Como usar a importação por OCR

1. Clique em **Selecionar prints**
2. Escolha uma ou várias imagens (prints do ranking do jogo)
3. Clique em **Ler X prints**
4. Aguarde o processamento (pode demorar alguns segundos por imagem)
5. Revise os dados extraídos na tabela
6. Corrija nomes, alianças ou pontos se necessário
7. Clique em **Adicionar jogador(es) ao ranking**

> O OCR usa Tesseract.js (roda no navegador). A qualidade depende da nitidez do print e do layout do jogo. Sempre revise antes de confirmar.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Variáveis de ambiente

Crie um arquivo `.env` com:

```env
VITE_SUPABASE_URL=sua_url
VITE_SUPABASE_ANON_KEY=sua_chave_publica
```

Nunca publique chaves secretas ou service role keys.
