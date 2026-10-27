# Court Premium NBA

Projeto Next.js independente do painel de futebol.

## Deploy
1. Importa este repositório na Vercel.
2. Configura as variáveis de ambiente:
   - `BALLDONTLIE_API_KEY` — chave BALLDONTLIE
   - `LOGIN_USERNAME` — utilizador de login
   - `LOGIN_PASSWORD` — palavra-passe
   - `AUTH_SECRET` — segredo aleatório forte para JWT
3. Faz um novo deployment depois de alterar variáveis ou código.

Chave da API: https://www.balldontlie.io/
Documentação: https://docs.balldontlie.io/

## Funcionalidades
- Jogos NBA e resultados da API BALLDONTLIE, com cache de 10 minutos e paginação até 300 jogos por atualização.
- Prognósticos experimentais. Quando existem poucos jogos recentes, o cálculo combina os dados disponíveis com uma média de referência da liga, em vez de ocultar a previsão. A pontuação apresentada não é uma probabilidade calibrada.
- Histórico de prognósticos guardado no `localStorage` do browser/dispositivo.
- Liquidação automática como `ACERTO` ou `FALHA` (ou `ANULADO` quando aplicável) quando um resultado final está disponível. A página atualiza os dados a cada 10 minutos enquanto estiver aberta e também sincroniza ao abrir ou atualizar manualmente.

## Limitações importantes
- O histórico não está sincronizado entre browsers/dispositivos e não é guardado numa base de dados no servidor.
- Como o histórico é local, a atualização automática só consegue liquidar prognósticos nesse browser quando o portal está aberto ou é aberto novamente; não executa em segundo plano com o browser fechado.
- Os prognósticos são estimativas simples e experimentais, não garantem resultados e não devem ser interpretados como probabilidades reais.
- A API gratuita tem limite de pedidos; os resultados são cacheados para reduzir chamadas.
