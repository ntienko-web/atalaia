import { createServerFn } from "@tanstack/react-start";

export type MonthPoint = { label: string; pct: number };
export type NewsItem = { title: string; source: string; link: string };
export type Move = { id: string; btc: number };

export type Board = {
  updatedAt: string;
  usdBrl: number | null;
  btcUsd: number | null;
  btcBrl: number | null;
  xrpUsd: number | null;
  btcDay: number | null;
  xrpDay: number | null;
  selic: number | null;
  ipca12: number | null;
  ipca: MonthPoint[];
  m2br: MonthPoint[];
  m2brYtd: number | null;
  m2us: MonthPoint[];
  m2usYtd: number | null;
  news: NewsItem[];
  moves: Move[];
  notes: string[];
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

async function getText(url: string, ms = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json, application/xml, text/xml, */*", "user-agent": "CentralComando/1.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(url: string, ms = 12000): Promise<T | null> {
  const text = await getText(url, ms);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function brDate(raw: string): Date | null {
  const [dd, mm, yyyy] = raw.split("/");
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

function labelFromDate(d: Date): string {
  return `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function monthlyPct(points: { date: Date; value: number }[], take = 8): MonthPoint[] {
  const sorted = [...points].sort((a, b) => b.date.getTime() - a.date.getTime());
  const out: MonthPoint[] = [];
  for (let i = 0; i < sorted.length - 1 && out.length < take; i++) {
    const curr = sorted[i];
    const prev = sorted[i + 1];
    if (!prev || prev.value === 0) continue;
    out.push({
      label: labelFromDate(curr.date),
      pct: ((curr.value - prev.value) / prev.value) * 100,
    });
  }
  return out;
}

function ytd(points: { date: Date; value: number }[], year: number): number | null {
  const sorted = [...points].sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = sorted.find((p) => p.date.getFullYear() === year);
  const base =
    sorted.find((p) => p.date.getFullYear() === year - 1 && p.date.getMonth() === 11) ??
    sorted.find((p) => p.date.getFullYear() === year - 1);
  if (!latest || !base || base.value === 0) return null;
  return ((latest.value - base.value) / base.value) * 100;
}

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'");
}

function parseNews(xml: string): NewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const news: NewsItem[] = [];
  for (const item of items) {
    const block = item[1] ?? "";
    const title = decode(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
    const link = decode(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    if (!title || !link) continue;
    const cut = title.lastIndexOf(" - ");
    news.push({
      title: cut > 0 ? title.slice(0, cut) : title,
      source: cut > 0 ? title.slice(cut + 3) : "Google Notícias",
      link,
    });
    if (news.length >= 10) break;
  }
  return news;
}

type SgsRow = { data: string; valor: string };

function sgsPoints(rows: SgsRow[] | null): { date: Date; value: number }[] {
  if (!rows) return [];
  return rows
    .map((row) => {
      const date = brDate(row.data);
      const value = num(row.valor);
      if (!date || value == null) return null;
      return { date, value };
    })
    .filter((row): row is { date: Date; value: number } => row != null);
}

export const loadBoard = createServerFn({ method: "GET" }).handler(async (): Promise<Board> => {
  const notes: string[] = [];
  const year = 2026;

  const [ptaxRaw, krakenRaw, selicRaw, ipcaRaw, ipca12Raw, m2brRaw, m2usRaw, newsXml, movesRaw] =
    await Promise.all([
      getJson<SgsRow[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json"),
      getJson<{
        error: string[];
        result?: Record<string, { c?: string[]; o?: string }>;
      }>("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,XRPUSD"),
      getJson<SgsRow[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"),
      getJson<SgsRow[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/8?formato=json"),
      getJson<SgsRow[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json"),
      getJson<SgsRow[]>("https://api.bcb.gov.br/dados/serie/bcdata.sgs.27810/dados/ultimos/16?formato=json"),
      getJson<{ data?: { period: string; value: number }[] }>(
        "https://starwell.dev/api/starwell/v1/sources/fred/series/M2SL/observations?latest=16",
      ),
      getText(
        "https://news.google.com/rss/search?q=economia+OR+selic+OR+inflacao+OR+bitcoin+OR+cambio+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419",
        14000,
      ),
      getJson<{ txid?: string; value?: number }[]>("https://mempool.space/api/mempool/recent", 7000),
    ]);

  const usdBrl = num(ptaxRaw?.[0]?.valor);
  if (usdBrl == null) notes.push("Dólar oficial indisponível");

  const pairs = krakenRaw?.result ?? {};
  const btc = pairs.XXBTZUSD ?? pairs.XBTUSD;
  const xrp = pairs.XXRPZUSD ?? pairs.XRPUSD;
  const btcUsd = num(btc?.c?.[0]);
  const xrpUsd = num(xrp?.c?.[0]);
  const btcOpen = num(btc?.o);
  const xrpOpen = num(xrp?.o);
  if (btcUsd == null || xrpUsd == null) notes.push("Cotações de cripto indisponíveis");

  const day = (last: number | null, open: number | null) =>
    last != null && open != null && open !== 0 ? ((last - open) / open) * 100 : null;

  const m2brPoints = sgsPoints(m2brRaw);
  const m2usPoints = (m2usRaw?.data ?? [])
    .map((row) => {
      const date = new Date(row.period);
      const value = num(row.value);
      if (Number.isNaN(date.getTime()) || value == null) return null;
      return { date, value };
    })
    .filter((row): row is { date: Date; value: number } => row != null);

  const ipcaPoints = sgsPoints(ipcaRaw);
  const ipca = [...ipcaPoints]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 6)
    .map((row) => ({ label: labelFromDate(row.date), pct: row.value }));

  if (!m2brPoints.length) notes.push("M2 do Brasil indisponível");
  if (!m2usPoints.length) notes.push("M2 dos EUA indisponível");
  if (!newsXml) notes.push("Notícias indisponíveis");

  const moves = (movesRaw ?? [])
    .filter((tx) => tx.txid && typeof tx.value === "number")
    .slice(0, 5)
    .map((tx) => ({ id: String(tx.txid).slice(0, 10), btc: Number(tx.value) / 1e8 }));

  return {
    updatedAt: new Date().toISOString(),
    usdBrl,
    btcUsd,
    btcBrl: btcUsd != null && usdBrl != null ? btcUsd * usdBrl : null,
    xrpUsd,
    btcDay: day(btcUsd, btcOpen),
    xrpDay: day(xrpUsd, xrpOpen),
    selic: num(selicRaw?.[0]?.valor),
    ipca12: num(ipca12Raw?.[0]?.valor),
    ipca,
    m2br: monthlyPct(m2brPoints),
    m2brYtd: ytd(m2brPoints, year),
    m2us: monthlyPct(m2usPoints),
    m2usYtd: ytd(m2usPoints, year),
    news: newsXml ? parseNews(newsXml) : [],
    moves,
    notes,
  };
});

export const lookupBtc = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const address =
      typeof input === "object" && input && "address" in input
        ? String((input as { address: unknown }).address).trim()
        : "";
    if (!/^[a-zA-Z0-9]{14,120}$/.test(address)) {
      throw new Error("Endereço inválido");
    }
    return { address };
  })
  .handler(async ({ data }) => {
    const raw = await getJson<{
      chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    }>(`https://blockstream.info/api/address/${encodeURIComponent(data.address)}`, 12000);
    const funded = raw?.chain_stats?.funded_txo_sum;
    const spent = raw?.chain_stats?.spent_txo_sum;
    if (typeof funded !== "number" || typeof spent !== "number") {
      throw new Error("Não foi possível ler esse endereço");
    }
    return { address: data.address, btc: (funded - spent) / 1e8 };
  });
