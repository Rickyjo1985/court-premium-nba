import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

const KEY = "court_nba_history_v1";
const BASE = 115.6;
const name = team => team?.full_name || team?.name || "Equipa";
const same = (a, b) => String(a) === String(b);
const date = value => value
  ? new Date(value).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" })
  : "Data por confirmar";
const time = value => value
  ? new Date(value).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" })
  : "Hora por confirmar";

function final(game) {
  const status = String(game?.status || "").toLowerCase();
  const state = String(game?.status_state || "").toLowerCase();
  const home = game?.home_team_score;
  const away = game?.visitor_team_score;
  return (state === "final" || status === "final" || status.startsWith("final/"))
    && home !== null && home !== undefined
    && away !== null && away !== undefined
    && Number.isFinite(Number(home)) && Number.isFinite(Number(away));
}

function marketInfo(pick) {
  const market = String(pick.market || "").trim();
  const winner = market.match(/^Vitória\s+(.+)$/i);
  if (winner) {
    const selected = winner[1].trim().toLocaleLowerCase("pt-PT");
    if (selected === String(pick.home || "").trim().toLocaleLowerCase("pt-PT")) {
      return { key: "winner-home", label: "Vitória da equipa da casa" };
    }
    if (selected === String(pick.away || "").trim().toLocaleLowerCase("pt-PT")) {
      return { key: "winner-away", label: "Vitória da equipa visitante" };
    }
    return { key: "winner", label: "Vitória de equipa" };
  }
  const total = market.match(/Total\s+(acima|abaixo)\s+de\s+(\d+(?:\.\d+)?)\s+pontos?/i);
  if (total) {
    const direction = total[1].toLowerCase();
    const line = Number(total[2]).toFixed(1);
    return { key: `total-${direction}-${line}`, label: `Total ${direction} de ${line} pontos` };
  }
  return { key: market || "other", label: market || "Outros mercados" };
}

function model(games) {
  const finals = games.filter(final);
  const values = finals.flatMap(game => [+game.home_team_score, +game.visitor_team_score]).filter(Number.isFinite);
  const base = (values.reduce((sum, value) => sum + value, 0) + BASE * 20) / (values.length + 20);

  const form = team => {
    const recent = finals
      .filter(game => same(game.home_team?.id, team?.id) || same(game.visitor_team?.id, team?.id))
      .sort((a, b) => new Date(b.datetime || b.date) - new Date(a.datetime || a.date))
      .slice(0, 8);
    let pointsFor = 0, pointsAgainst = 0, wins = 0;
    recent.forEach(game => {
      const isHome = same(game.home_team?.id, team?.id);
      const scored = +(isHome ? game.home_team_score : game.visitor_team_score);
      const conceded = +(isHome ? game.visitor_team_score : game.home_team_score);
      pointsFor += scored;
      pointsAgainst += conceded;
      if (scored > conceded) wins += 1;
    });
    const count = recent.length;
    return {
      n: count,
      pf: (pointsFor + base * 3) / (count + 3),
      pa: (pointsAgainst + base * 3) / (count + 3),
      wr: (wins + 1.5) / (count + 3)
    };
  };

  return games.filter(game => !final(game) && !game.postponed).map(game => {
    const home = form(game.home_team);
    const away = form(game.visitor_team);
    const homePoints = (home.pf + away.pa) / 2 + 2;
    const awayPoints = (away.pf + home.pa) / 2;
    const total = homePoints + awayPoints;
    const difference = homePoints - awayPoints;
    const sample = Math.min(home.n, away.n);
    let market;

    if (difference >= 4) market = `Vitória ${name(game.home_team)}`;
    else if (difference <= -4) market = `Vitória ${name(game.visitor_team)}`;
    else if (total >= 232) market = "Total acima de 224.5 pontos";
    else if (total < 220) market = "Total abaixo de 224.5 pontos";
    else market = "Total acima de 219.5 pontos";

    const signal = Math.abs(difference) * 1.5 + Math.abs(home.wr - away.wr) * 10;
    const score = Math.max(50, Math.min(82, Math.round(
      50 + Math.min(18, signal) * Math.min(1, 0.35 + sample / 10) + Math.min(8, sample)
    )));
    return {
      ...game,
      pred: {
        market, score, total: Math.round(total),
        hp: Math.round(homePoints), ap: Math.round(awayPoints),
        nh: home.n, na: away.n
      }
    };
  });
}

function settle(pick, game) {
  if (!final(game)) return null;
  const homeScore = +game.home_team_score;
  const awayScore = +game.visitor_team_score;
  const totalScore = homeScore + awayScore;
  const market = String(pick.market || "");
  const winner = market.match(/^Vitória\s+(.+)$/i);

  if (winner) {
    if (homeScore === awayScore) return null;
    const actualWinner = name(homeScore > awayScore ? game.home_team : game.visitor_team);
    return actualWinner.trim().toLowerCase() === winner[1].trim().toLowerCase() ? "ACERTO" : "FALHA";
  }

  const total = market.match(/Total\s+(acima|abaixo)\s+de\s+(\d+(?:\.\d+)?)\s+pontos?/i);
  if (total) {
    const line = +total[2];
    if (totalScore === line) return "ANULADO";
    const won = total[1].toLowerCase() === "acima" ? totalScore > line : totalScore < line;
    return won ? "ACERTO" : "FALHA";
  }
  return null;
}

export default function Home() {
  const [games, setGames] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("Hoje");
  const [historyFilter, setHistoryFilter] = useState("Todos");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [gamesReady, setGamesReady] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/games");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Não foi possível carregar os jogos.");
      setGames(json.games || []);
    } catch (err) {
      setError(err.message || "Erro ao carregar jogos NBA.");
    } finally {
      setGamesReady(true);
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      setHistory([]);
    } finally {
      setHistoryReady(true);
    }
    load();
    const interval = setInterval(() => load(true), 10 * 60 * 1000 + 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!historyReady || !gamesReady || !history.length || !games.length) return;
    let changed = false;
    const next = history.map(pick => {
      if (pick.status !== "PENDENTE") return pick;
      const game = games.find(item => same(item.id, pick.id));
      if (!game) return pick;
      const result = settle(pick, game);
      if (!result) return pick;
      changed = true;
      return {
        ...pick,
        status: result,
        finalScore: `${game.home_team_score} — ${game.visitor_team_score}`,
        settledAt: new Date().toISOString()
      };
    });
    if (changed) {
      setHistory(next);
      localStorage.setItem(KEY, JSON.stringify(next));
    }
  }, [games, history, historyReady, gamesReady]);

  const predictions = model(games);
  const isoDate = value => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value);
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));

  let shown = predictions;
  if (tab === "Hoje") shown = predictions.filter(game => (game.date || "").slice(0, 10) === today);
  if (tab === "Amanhã") shown = predictions.filter(game => (game.date || "").slice(0, 10) === tomorrow);
  if (tab === "Top 6") shown = predictions.filter(game => game.pred).sort((a, b) => b.pred.score - a.pred.score).slice(0, 6);
  if (tab === "Próximos jogos") shown = predictions;
  if (tab === "Concluídos") shown = games.filter(final);

  const completed = history.filter(pick => ["ACERTO", "FALHA", "ANULADO"].includes(pick.status));
  const graded = history.filter(pick => ["ACERTO", "FALHA"].includes(pick.status));
  const hits = graded.filter(pick => pick.status === "ACERTO").length;
  const marketStats = useMemo(() => {
    const groups = new Map();
    graded.forEach(pick => {
      const info = marketInfo(pick);
      const group = groups.get(info.key) || { key: info.key, label: info.label, hits: 0, misses: 0 };
      if (pick.status === "ACERTO") group.hits += 1;
      else group.misses += 1;
      groups.set(info.key, group);
    });
    return [...groups.values()]
      .map(group => {
        const count = group.hits + group.misses;
        return { ...group, count, rate: count ? group.hits / count * 100 : 0 };
      })
      .sort((a, b) => b.hits - a.hits || b.rate - a.rate || b.count - a.count);
  }, [history]);

  const bestByHits = marketStats[0] || null;
  const enoughSample = marketStats.filter(group => group.count >= 5).sort((a, b) => b.rate - a.rate || b.count - a.count);
  const bestByRate = enoughSample[0] || marketStats.slice().sort((a, b) => b.rate - a.rate || b.count - a.count)[0] || null;
  const marketOptions = [...new Map(history.map(pick => {
    const info = marketInfo(pick);
    return [info.key, info];
  })).values()];
  const filteredHistory = historyFilter === "Todos"
    ? history
    : history.filter(pick => marketInfo(pick).key === historyFilter);

  function save(game) {
    if (!game.pred || history.some(pick => same(pick.id, game.id))) return;
    const next = [{
      id: game.id, date: game.datetime || game.date,
      home: name(game.home_team), away: name(game.visitor_team),
      market: game.pred.market, score: game.pred.score, status: "PENDENTE"
    }, ...history];
    setHistory(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  return <>
    <Head><title>Court Premium | NBA</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
    <main>
      <header>
        <div className="logo">🏀</div>
        <div className="brand"><h1>COURT <span>PREMIUM</span></h1><small>Estatísticas e prognósticos NBA</small></div>
        <button className="refresh" onClick={() => load()}>↻ Atualizar</button>
        <button className="logout" onClick={async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/login"; }}>Sair</button>
      </header>

      <nav>
        {["Hoje", "Amanhã", "Próximos jogos", "Top 6", "Concluídos", "Mercados", "Histórico"].map(item =>
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>
        )}
      </nav>

      <section className="stats">
        <article><small>JOGOS CARREGADOS</small><strong>{games.length}</strong></article>
        <article><small>PROGNÓSTICOS GUARDADOS</small><strong>{history.length}</strong></article>
        <article><small>TAXA DE ACERTO</small><strong className="green">{graded.length ? (hits / graded.length * 100).toFixed(1) + "%" : "—"}</strong></article>
        <article><small>CONCLUÍDOS</small><strong>{completed.length}</strong></article>
      </section>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="empty">A carregar jogos NBA…</p> : tab === "Histórico" ? (
        <section className="panel">
          <div className="panel-heading"><h2>Histórico de prognósticos</h2>
            <label className="filter-label">Filtrar mercado
              <select value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}>
                <option value="Todos">Todos os mercados</option>
                {marketOptions.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <p className="filter-summary">A mostrar {filteredHistory.length} de {history.length} prognósticos guardados.</p>
          {filteredHistory.length ? filteredHistory.map(pick =>
            <p className="history" key={pick.id}>
              <strong>{pick.home} — {pick.away}</strong><br />
              <small>{date(pick.date)} · {marketInfo(pick).label} · Score {pick.score}/100</small><br />
              <span className={`outcome ${String(pick.status).toLowerCase()}`}>{pick.status}</span>
              {pick.finalScore && <span className="final-score"> · Resultado final: {pick.finalScore}</span>}
            </p>
          ) : <p>Não existem prognósticos para este filtro.</p>}
          <p className="privacy-note">O histórico fica neste browser. Os resultados são sincronizados quando abres/atualizas o portal e periodicamente enquanto a página está aberta.</p>
        </section>
      ) : tab === "Mercados" ? (
        <section className="panel">
          <h2>Desempenho por mercado</h2>
          <p className="privacy-note">A análise considera apenas prognósticos liquidados como ACERTO ou FALHA. Os ANULADOS e PENDENTES não entram nas percentagens.</p>
          {marketStats.length ? <>
            <div className="market-highlights">
              <article className="market-highlight">
                <small>MAIS ACERTOS</small>
                <strong>{bestByHits.label}</strong>
                <span>{bestByHits.hits} acertos em {bestByHits.count} prognósticos · {bestByHits.rate.toFixed(1)}%</span>
              </article>
              <article className="market-highlight">
                <small>{enoughSample.length ? "MELHOR TAXA (MÍN. 5)" : "MELHOR TAXA (AMOSTRA PEQUENA)"}</small>
                <strong>{bestByRate.label}</strong>
                <span>{bestByRate.hits} acertos em {bestByRate.count} prognósticos · {bestByRate.rate.toFixed(1)}%</span>
              </article>
            </div>
            <div className="market-table-wrap">
              <table className="market-table">
                <thead><tr><th>Mercado</th><th>Acertos</th><th>Falhas</th><th>Total</th><th>Taxa</th></tr></thead>
                <tbody>{marketStats.map(group =>
                  <tr key={group.key}>
                    <td>{group.label}</td><td className="green">{group.hits}</td><td className="red">{group.misses}</td><td>{group.count}</td><td><strong>{group.rate.toFixed(1)}%</strong></td>
                  </tr>
                )}</tbody>
              </table>
            </div>
            <p className="privacy-note">“Mais acertos” ordena pelo número absoluto de vitórias. “Melhor taxa” exige pelo menos 5 prognósticos quando existe amostra suficiente; com menos dados, o destaque é apenas provisório.</p>
          </> : <p className="empty">Ainda não há prognósticos liquidados suficientes para comparar mercados. Guarda prognósticos e volta aqui quando os jogos terminarem.</p>}
        </section>
      ) : (
        <section className="grid">
          {shown.map(game =>
            <article className="card" key={game.id}>
              <div className="meta">NBA <span>{date(game.datetime || game.date)} · {time(game.datetime)}</span></div>
              <div className="teams"><b>{name(game.home_team)}</b><span>VS</span><b>{name(game.visitor_team)}</b></div>
              {tab === "Concluídos" ? <h2 className="result">{game.home_team_score} — {game.visitor_team_score}</h2>
                : game.pred ? <div className="pick">
                  <small>PROGNÓSTICO ESTATÍSTICO</small><h2>{game.pred.market}</h2>
                  <p>Estimativa: {game.pred.hp} — {game.pred.ap} · Total {game.pred.total}</p>
                  <div className="score">{game.pred.score}/100</div><div className="bar"><i style={{ width: game.pred.score + "%" }} /></div>
                  <p className="caution">Score experimental, não é uma probabilidade calibrada. Amostra recente: {game.pred.nh} jogos (casa) / {game.pred.na} (visitante).</p>
                  <button className="save" disabled={history.some(pick => same(pick.id, game.id))} onClick={() => save(game)}>
                    {history.some(pick => same(pick.id, game.id)) ? "Guardado ✓" : "Guardar prognóstico"}
                  </button>
                </div> : <p className="muted">Não foi possível gerar prognóstico para este jogo.</p>}
            </article>
          )}
        </section>
      )}

      {!loading && !shown.length && !["Histórico", "Mercados"].includes(tab) && <p className="empty">Não foram encontrados jogos nesta secção.</p>}
      <footer>Dados: BALLDONTLIE · Previsões experimentais, sem garantia de resultado. Histórico local deste browser.</footer>
    </main>

    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0;background:#0b1222;color:#f8fafc;font-family:Arial,sans-serif}main{max-width:1120px;margin:auto;padding:0 18px 30px}
      header{display:flex;align-items:center;gap:12px;padding:22px 0;border-bottom:1px solid #334155}.logo{background:#fbbf24;border-radius:12px;padding:11px;font-size:24px}.brand{flex:1}
      h1{font-size:19px;margin:0}h1 span{color:#fbbf24}header small{color:#94a3b8;font-size:11px}.refresh,.logout{background:transparent;color:#cbd5e1;border:1px solid #334155;padding:9px;border-radius:8px}
      nav{display:flex;gap:7px;overflow:auto;border-bottom:1px solid #334155}nav button{white-space:nowrap;background:transparent;border:0;color:#94a3b8;padding:16px 10px;cursor:pointer}nav .active{color:#fbbf24;border-bottom:2px solid #fbbf24}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.stats article,.panel{background:#1e293b;border:1px solid #334155;border-radius:15px;padding:17px}.stats small{font-size:9px;color:#94a3b8;display:block}.stats strong{display:block;font-size:25px;margin-top:8px}.green{color:#34d399}.red{color:#f87171}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:17px}.meta{display:flex;justify-content:space-between;gap:8px;color:#fbbf24;font-size:10px}.meta span{color:#94a3b8;text-align:right}
      .teams{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;text-align:center;min-height:90px}.teams b{font-size:13px}.teams span{font-size:10px;color:#64748b}
      .pick{background:#0f172a;border:1px solid #10b98133;border-radius:12px;padding:14px}.pick small{font-size:9px;color:#34d399}.pick h2{font-size:16px;margin:8px 0}.pick p,.muted{font-size:11px;color:#94a3b8}.score{color:#34d399;font-size:21px;font-weight:bold}
      .bar{height:5px;background:#334155;border-radius:8px;margin:10px 0}.bar i{display:block;height:100%;background:#10b981;border-radius:8px}.caution{font-size:10px!important;line-height:1.5}
      .save{width:100%;padding:11px;background:#fbbf24;border:0;border-radius:8px;font-weight:bold;cursor:pointer}.save:disabled{opacity:.6}.empty,.error{padding:20px;background:#1e293b;border-radius:12px;color:#94a3b8}.error{color:#fca5a5}
      .panel-heading{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap}.panel h2{margin-top:0}.filter-label{display:grid;gap:6px;color:#94a3b8;font-size:11px}.filter-label select{background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:9px;min-width:210px}.filter-summary{color:#94a3b8;font-size:11px}
      .history{padding:12px 0;border-bottom:1px solid #334155;font-size:13px;line-height:1.7}.history small{color:#94a3b8}.outcome{font-size:11px;font-weight:bold}.outcome.acerto{color:#34d399}.outcome.falha{color:#f87171}.outcome.anulado{color:#fbbf24}.outcome.pendente{color:#cbd5e1}.final-score{font-size:11px;color:#cbd5e1}.privacy-note{font-size:11px;color:#94a3b8;line-height:1.5}.result{text-align:center}
      .market-highlights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}.market-highlight{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:15px;display:grid;gap:8px}.market-highlight small{color:#94a3b8;font-size:9px}.market-highlight strong{font-size:15px;color:#fbbf24}.market-highlight span{font-size:11px;color:#cbd5e1}
      .market-table-wrap{overflow-x:auto}.market-table{width:100%;border-collapse:collapse;font-size:12px}.market-table th,.market-table td{text-align:left;padding:12px 9px;border-bottom:1px solid #334155;white-space:nowrap}.market-table th{color:#94a3b8;font-weight:normal}
      footer{text-align:center;color:#64748b;font-size:10px;line-height:1.5;padding:25px 0}
      @media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.market-highlights{grid-template-columns:1fr}main{padding:0 10px 25px}h1{font-size:16px}.refresh{font-size:11px;padding:8px}.logout{padding:8px}}
    `}</style>
  </>;
}
