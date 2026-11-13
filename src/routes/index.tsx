import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeftRight, Landmark, Newspaper, RefreshCw, Shield, Trash2, Wallet } from "lucide-react";
import { loadBoard, lookupBtc, type Board, type MonthPoint } from "@/lib/board.functions";

export const Route = createFileRoute("/")({
  loader: () => loadBoard(),
  component: Home,
});

function money(value: number | null, currency: "BRL" | "USD", digits = 2) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function tone(value: number | null, upIsBad = false) {
  if (value == null || value === 0) return "text-fg";
  const bad = upIsBad ? value > 0 : value < 0;
  return bad ? "text-fall" : "text-rise";
}

function Home() {
  const initial = Route.useLoaderData();
  const [board, setBoard] = useState<Board>(initial);
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState("");
  const [address, setAddress] = useState("");
  const [wallets, setWallets] = useState<{ address: string; btc: number | null; error?: string }[]>([]);
  const [walletsReady, setWalletsReady] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const next = await loadBoard();
      setBoard(next);
    } catch {
      setBoard((prev) => ({ ...prev, notes: ["Falha ao atualizar o painel"] }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("comando-wallets") || "[]") as string[];
      if (Array.isArray(saved)) {
        setWallets(saved.filter((item) => typeof item === "string").map((item) => ({ address: item, btc: null })));
      }
    } catch {
      /* ignore broken storage */
    } finally {
      setWalletsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!walletsReady) return;
    localStorage.setItem("comando-wallets", JSON.stringify(wallets.map((item) => item.address)));
  }, [wallets, walletsReady]);

  useEffect(() => {
    if (!walletsReady) return;
    const pending = wallets.filter((item) => item.btc == null && !item.error);
    if (!pending.length) return;
    let cancelled = false;
    for (const item of pending) {
      void lookupBtc({ data: { address: item.address } })
        .then((result) => {
          if (cancelled) return;
          setWallets((prev) => prev.map((row) => (row.address === item.address ? { address: item.address, btc: result.btc } : row)));
        })
        .catch(() => {
          if (cancelled) return;
          setWallets((prev) => prev.map((row) => (row.address === item.address ? { ...row, error: "Não foi possível ler" } : row)));
        });
    }
    return () => {
      cancelled = true;
    };
    // Only resolve addresses that were already saved when the page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletsReady]);

  async function addWallet() {
    const next = address.trim();
    if (!next || wallets.some((item) => item.address === next)) return;
    setAddress("");
    setWallets((prev) => [{ address: next, btc: null }, ...prev].slice(0, 8));
    try {
      const result = await lookupBtc({ data: { address: next } });
      setWallets((prev) => prev.map((item) => (item.address === next ? { address: next, btc: result.btc } : item)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível ler";
      setWallets((prev) => prev.map((item) => (item.address === next ? { ...item, error: message } : item)));
    }
  }

  useEffect(() => {
    if (!board.updatedAt) return;
    setClock(new Date(board.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }, [board.updatedAt]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-gold uppercase">Atalaia</p>
          <h1 className="font-display text-4xl leading-none text-fg">Central de Comando</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Dólar oficial, cripto, Selic e a expansão do dinheiro. Vermelho no M2 é pressão de preço. Verde é respiro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gold px-4 text-sm font-semibold text-bg"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {clock ? `Atualizado ${clock}` : "Atualizar"}
        </button>
      </header>

      {board.notes.length > 0 && (
        <p className="mb-4 rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">
          {board.notes.join(" · ")}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PriceCard label="Dólar oficial" hint="PTAX venda" value={money(board.usdBrl, "BRL", 4)} />
        <PriceCard label="Bitcoin" hint="desde a abertura" value={money(board.btcUsd, "USD", 0)} change={board.btcDay} />
        <PriceCard label="Bitcoin em real" hint="BTC × PTAX" value={money(board.btcBrl, "BRL", 0)} />
        <PriceCard label="XRP" hint="desde a abertura" value={money(board.xrpUsd, "USD", 4)} change={board.xrpDay} />
      </section>

      <FxDesk rate={board.usdBrl} />

      <section className="mt-3 grid gap-3 md:grid-cols-3">
        <article className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs text-muted">Selic meta</p>
          <p className="mt-1 font-display text-4xl text-fg">{pct(board.selic, 2).replace("+", "")}</p>
          <p className="mt-1 text-xs text-muted">ao ano, definida pelo Copom</p>
        </article>
        <article className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs text-muted">IPCA oficial, 12 meses</p>
          <p className={`mt-1 font-display text-4xl ${tone(board.ipca12, true)}`}>{pct(board.ipca12)}</p>
          <p className="mt-1 text-xs text-muted">índice de preços ao consumidor</p>
        </article>
        <article className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs text-muted">M2 no ano, Brasil × EUA</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Brasil</p>
              <p className={`font-display text-3xl ${tone(board.m2brYtd, true)}`}>{pct(board.m2brYtd)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">EUA</p>
              <p className={`font-display text-3xl ${tone(board.m2usYtd, true)}`}>{pct(board.m2usYtd)}</p>
            </div>
          </div>
        </article>
      </section>

      <MoneyBlock
        title="M2 Brasil"
        kicker="Quanto o dinheiro em circulação cresceu"
        ytd={board.m2brYtd}
        months={board.m2br}
        empty={loading ? "Buscando o Banco Central…" : "Sem série do M2 brasileiro."}
      />
      <MoneyBlock
        title="M2 Estados Unidos"
        kicker="Mesma leitura, para comparar a pressão lá fora"
        ytd={board.m2usYtd}
        months={board.m2us}
        empty={loading ? "Buscando o Federal Reserve…" : "Sem série do M2 americano."}
        footnote="Paraguai não publica API aberta. O agregado oficial fica no site do Banco Central do Paraguai."
        footnoteHref="https://www.bcp.gov.py/en/agregados-monetarios"
      />

      {board.ipca.length > 0 && (
        <section className="mt-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">IPCA mês a mês</h2>
          <p className="mt-1 text-xs text-muted">Inflação oficial de preços. Use junto com o M2 para reajustar.</p>
          <MonthRow months={board.ipca} />
        </section>
      )}

      <section className="mt-6 grid gap-3 lg:grid-cols-5">
        <article className="rounded-card border border-line bg-surface p-4 lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <Newspaper className="size-4 text-gold" />
            <h2 className="text-sm font-semibold">Notícias de impacto</h2>
          </div>
          {board.news.length === 0 ? (
            <p className="text-sm text-muted">{loading ? "Buscando manchetes…" : "Nenhuma manchete agora."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {board.news.map((item) => (
                <li key={item.link} className="py-3 first:pt-0 last:pb-0">
                  <a href={item.link} target="_blank" rel="noreferrer" className="block text-sm leading-snug text-fg hover:text-gold">
                    {item.title}
                  </a>
                  <p className="mt-1 text-xs text-muted">{item.source}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-card border border-line bg-surface p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="size-4 text-gold" />
            <h2 className="text-sm font-semibold">Endereços Bitcoin</h2>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addWallet();
            }}
          >
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Cole um endereço"
              aria-label="Endereço Bitcoin"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none placeholder:text-muted"
            />
            <button type="submit" className="h-11 rounded-full bg-raised px-4 text-sm font-semibold text-fg">
              Ver
            </button>
          </form>
          <ul className="mt-3 space-y-2">
            {wallets.length === 0 && <li className="text-sm text-muted">Nenhum endereço salvo neste aparelho.</li>}
            {wallets.map((item) => (
              <li key={item.address} className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-muted">{item.address}</p>
                  <p className="text-sm font-semibold">
                    {item.error ? item.error : item.btc == null ? "lendo…" : `${item.btc.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} BTC`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remover endereço"
                  onClick={() => setWallets((prev) => prev.filter((row) => row.address !== item.address))}
                  className="grid size-11 place-items-center text-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mt-3 rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="size-4 text-gold" />
          <h2 className="text-sm font-semibold">Movimento recente na rede</h2>
        </div>
        {board.moves.length === 0 ? (
          <a href="https://mempool.space" target="_blank" rel="noreferrer" className="text-sm text-gold">
            Abrir mempool.space
          </a>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {board.moves.map((move) => (
              <li key={move.id} className="rounded-xl bg-raised px-3 py-2">
                <p className="font-mono text-xs text-muted">{move.id}…</p>
                <p className="text-sm font-semibold">{move.btc.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} BTC</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LinkTile href="https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm" icon={<Landmark className="size-4" />} label="Tesouro Direto" />
        <LinkTile href="https://cybermap.kaspersky.com/pt" icon={<Shield className="size-4" />} label="Mapa de ameaças" />
        <LinkTile href="https://downdetector.com.br/" icon={<Activity className="size-4" />} label="Quedas de serviço" />
        <LinkTile href="https://mempool.space" icon={<Wallet className="size-4" />} label="Mempool" />
      </nav>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Fontes: Banco Central (PTAX, Selic, IPCA, M2 27810), Kraken, Federal Reserve via FRED e Google Notícias.
        O M2 sai com atraso de algumas semanas. O dólar em real do Bitcoin usa a PTAX do dia, não o câmbio de mesa.
      </p>
    </main>
  );
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatAmount(value: number, digits: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function FxDesk({ rate }: { rate: number | null }) {
  const [usd, setUsd] = useState("100");
  const [brl, setBrl] = useState("");
  const edited = useRef<"usd" | "brl">("usd");

  useEffect(() => {
    if (rate == null) return;
    if (edited.current === "usd") {
      const amount = parseAmount(usd);
      setBrl(amount == null ? "" : formatAmount(amount * rate, 2));
    } else {
      const amount = parseAmount(brl);
      setUsd(amount == null ? "" : formatAmount(amount / rate, 2));
    }
    // Só recalcula quando a PTAX muda. A digitação já atualiza o outro lado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  function writeUsd(value: string) {
    edited.current = "usd";
    setUsd(value);
    if (rate == null) return;
    const amount = parseAmount(value);
    setBrl(amount == null ? "" : formatAmount(amount * rate, 2));
  }

  function writeBrl(value: string) {
    edited.current = "brl";
    setBrl(value);
    if (rate == null) return;
    const amount = parseAmount(value);
    setUsd(amount == null ? "" : formatAmount(amount / rate, 2));
  }

  function swap() {
    edited.current = edited.current === "usd" ? "brl" : "usd";
    setUsd(brl);
    setBrl(usd);
  }

  const inverse = rate ? 1 / rate : null;

  return (
    <section className="mt-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Cotar dólar e real</h2>
          <p className="mt-1 text-xs text-muted">Digite de um lado. O outro acompanha na hora.</p>
        </div>
        <p className="text-xs text-muted">
          {rate == null
            ? "PTAX indisponível"
            : `1 USD = ${money(rate, "BRL", 4)} · 1 BRL = ${money(inverse, "USD", 4)}`}
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-muted">Dólar</span>
          <input
            inputMode="decimal"
            value={usd}
            onChange={(event) => writeUsd(event.target.value)}
            aria-label="Valor em dólar"
            className="h-11 w-full rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none"
          />
        </label>
        <button
          type="button"
          onClick={swap}
          aria-label="Inverter dólar e real"
          className="grid size-11 shrink-0 place-items-center self-end rounded-full bg-raised text-gold"
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-muted">Real</span>
          <input
            inputMode="decimal"
            value={brl}
            onChange={(event) => writeBrl(event.target.value)}
            aria-label="Valor em real"
            className="h-11 w-full rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {["1", "10", "100", "1000"].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => writeUsd(preset)}
            className="h-11 shrink-0 rounded-full bg-raised px-4 text-sm text-fg"
          >
            US$ {preset}
          </button>
        ))}
      </div>
    </section>
  );
}

function PriceCard({ label, hint, value, change }: { label: string; hint: string; value: string; change?: number | null }) {
  return (
    <article className="rounded-card border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none tracking-tight text-fg">{value}</p>
      <p className={`mt-2 text-xs ${change == null ? "text-muted" : tone(change)}`}>
        {change == null ? hint : `${pct(change)} ${hint}`}
      </p>
    </article>
  );
}

function MoneyBlock({
  title,
  kicker,
  ytd,
  months,
  empty,
  footnote,
  footnoteHref,
}: {
  title: string;
  kicker: string;
  ytd: number | null;
  months: MonthPoint[];
  empty: string;
  footnote?: string;
  footnoteHref?: string;
}) {
  return (
    <section className="mt-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted">{kicker}</p>
        </div>
        <p className="text-right">
          <span className="block text-xs text-muted">no ano</span>
          <span className={`font-display text-3xl ${tone(ytd, true)}`}>{pct(ytd)}</span>
        </p>
      </div>
      {months.length === 0 ? <p className="mt-3 text-sm text-muted">{empty}</p> : <MonthRow months={months} />}
      {footnote && footnoteHref && (
        <a href={footnoteHref} target="_blank" rel="noreferrer" className="mt-3 block text-xs text-gold">
          {footnote}
        </a>
      )}
    </section>
  );
}

function MonthRow({ months }: { months: MonthPoint[] }) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {months.map((month) => (
        <div key={month.label} className="min-w-20 shrink-0 rounded-xl bg-raised px-3 py-2 text-center">
          <p className="text-xs text-muted">{month.label}</p>
          <p className={`text-sm font-semibold ${tone(month.pct, true)}`}>{pct(month.pct)}</p>
        </div>
      ))}
    </div>
  );
}

function LinkTile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-fg"
    >
      <span className="text-gold">{icon}</span>
      {label}
    </a>
  );
}
