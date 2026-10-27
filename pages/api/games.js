const API_KEY = process.env.BALLDONTLIE_API_KEY;
const CACHE_MS = 10 * 60 * 1000;
const MAX_PAGES = 3;
let cache = { at: 0, data: null };

export default async function handler(req, res) {
  if (!API_KEY) return res.status(500).json({ error: "Falta BALLDONTLIE_API_KEY na Vercel." });
  if (cache.data && Date.now() - cache.at < CACHE_MS) return res.status(200).json(cache.data);

  try {
    const now = new Date();
    const dates = [];
    for (let offset = -28; offset <= 7; offset += 1) {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() + offset);
      dates.push(day.toISOString().slice(0, 10));
    }

    const baseQuery = new URLSearchParams();
    dates.forEach(day => baseQuery.append("dates[]", day));
    baseQuery.set("per_page", "100");
    const games = [], seen = new Set();
    let cursor = null, warning = null;

    // A API limita cada página a 100 jogos; a paginação inclui mais resultados recentes.
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams(baseQuery);
      if (cursor !== null) query.set("cursor", String(cursor));
      const response = await fetch(`https://api.balldontlie.io/v1/games?${query.toString()}`, { headers: { Authorization: API_KEY } });
      const body = await response.json();
      if (!response.ok) {
        const message = response.status === 429 ? "Limite da API atingido; aguarda um minuto." : body.message || "Erro na API NBA.";
        if (games.length) { warning = message; break; }
        return res.status(response.status).json({ error: message });
      }
      (body.data || []).forEach(game => {
        const id = String(game.id);
        if (!seen.has(id)) { seen.add(id); games.push(game); }
      });
      cursor = body.meta?.next_cursor ?? null;
      if (cursor === null || !(body.data || []).length) break;
    }

    const data = { games, fetchedAt: new Date().toISOString(), ...(warning ? { warning } : {}) };
    cache = { at: Date.now(), data };
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=600");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: "Erro ao consultar jogos NBA." });
  }
}
