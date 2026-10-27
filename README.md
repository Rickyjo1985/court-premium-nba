# Court Premium NBA

Projeto Next.js separado do painel de futebol.

## Deploy
1. Cria um repositório GitHub novo (ex.: `court-premium-nba`) e carrega o conteúdo desta pasta para a raiz.
2. Importa esse repositório na Vercel.
3. Configura estas variáveis de ambiente:
   - `BALLDONTLIE_API_KEY` — chave BALLDONTLIE
   - `LOGIN_USERNAME` — utilizador de login
   - `LOGIN_PASSWORD` — palavra-passe
   - `AUTH_SECRET` — segredo aleatório forte para JWT
4. Faz redeploy.

Chave da API: https://www.balldontlie.io/

## Notas
- A API gratuita tem limite de 5 pedidos/minuto; os jogos são guardados em cache por 10 minutos.
- A estimativa usa resultados recentes de jogos disponíveis. É experimental, não uma probabilidade calibrada.
- O histórico é guardado apenas no browser/dispositivo.
- Esta versão inicial guarda prognósticos mas ainda não confirma automaticamente acertos/falhas.
