"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  FileText,
  Globe,
  Info,
  Link2,
  Loader2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  buildResult,
  formatValue,
  toCSV,
  toJSON,
  toMarkdown,
  type ExtractField,
  type ExtractResult,
  type Mode,
} from "@/lib/demo";

const STEPS = [
  { label: "Connecting to webpage", detail: "Resolving host, applying safety rules" },
  { label: "Fetching page content", detail: "Downloading the public page" },
  { label: "Cleaning HTML into Markdown", detail: "Stripping scripts, navigation and ads" },
  { label: "AI extracting requested fields", detail: "Mapping page content to your schema" },
  { label: "Validating structured output", detail: "Schema check, one retry on errors" },
  { label: "Attaching source evidence", detail: "Linking every value to its snippet" },
  { label: "Extraction complete", detail: "Results ready" },
];

const EXAMPLES = [
  { label: "Sony WH-1000XM5 product page", url: "https://example.com/product" },
  { label: "Login-protected page", url: "https://app.example.com/login" },
];

const DEFAULT_PROMPT = "Extract product name, price, rating, number of reviews and availability.";

function normalizeUrl(raw: string): { url?: string; error?: string } {
  const s = raw.trim();
  if (!s) return { error: "Paste a public page URL to begin." };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (!/^https?:$/.test(u.protocol)) return { error: "Only http and https pages are supported." };
  if (!u.hostname.includes(".")) return { error: "Enter a full domain, for example example.com/product." };
  if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(u.hostname))
    return { error: "Local and private addresses are blocked (SSRF check)." };
  return { url: u.toString() };
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function tokenize(line: string): ReactNode[] {
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    let cls = "text-zinc-200";
    if (m[1]) cls = m[2] ? "text-white font-medium" : "text-emerald-400/90";
    else if (tok === "null") cls = "text-zinc-600 italic";
    else if (tok === "true" || tok === "false") cls = "text-zinc-400";
    out.push(
      <span key={k++} className={cls}>
        {tok}
      </span>
    );
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export default function Page() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [step, setStep] = useState(0);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"json" | "markdown" | "csv">("json");
  const [toast, setToast] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // pipeline runner: advances one step at a time, then finishes
  useEffect(() => {
    if (runId === 0) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      i += 1;
      setStep(i);
      if (i < STEPS.length - 1) {
        timer = setTimeout(next, 620);
      } else {
        timer = setTimeout(() => setPhase("done"), 600);
      }
    };
    timer = setTimeout(next, 620);
    return () => clearTimeout(timer);
  }, [runId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const run = () => {
    const n = normalizeUrl(url);
    if (n.error || !n.url) {
      setError(n.error ?? "Invalid URL");
      return;
    }
    if (mode === "custom" && !prompt.trim()) {
      setError("Describe the fields you want, in plain English.");
      return;
    }
    setError(null);
    setUrl(n.url);
    setResult(buildResult(n.url, mode, prompt));
    setSelected(null);
    setStep(0);
    setPhase("running");
    setRunId((id) => id + 1);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const jsonText = useMemo(() => (result ? JSON.stringify(toJSON(result), null, 2) : ""), [result]);
  const mdText = useMemo(() => (result ? toMarkdown(result) : ""), [result]);
  const csvText = useMemo(() => (result ? toCSV(result) : ""), [result]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(label);
    } catch {
      setToast("Copy blocked by the browser");
    }
  };

  const done = phase === "done" && result;
  const selectedField = result?.fields.find((f) => f.key === selected) ?? null;
  const found = result ? result.fields.filter((f) => f.value !== null).length : 0;
  const withConf = result ? result.fields.filter((f) => f.value !== null) : [];
  const avgConf = withConf.length ? Math.round((withConf.reduce((s, f) => s + f.confidence, 0) / withConf.length) * 100) : 0;

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-white">
              <Braces size={15} className="text-black" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight">Beyond the Browser</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            demo mode · simulated data
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-16 text-center sm:pt-20">
          <p className="fade-up font-mono text-[12px] tracking-[0.16em] text-zinc-500">
            <span className="text-emerald-400">$</span> structured web extraction
            <span className="caret" />
          </p>
          <h1 className="fade-up mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl" style={{ animationDelay: "60ms" }}>
            Paste a link.{" "}
            <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              Get structured, AI-ready data.
            </span>
          </h1>
          <p className="fade-up mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400" style={{ animationDelay: "120ms" }}>
            Every value comes with the page snippet it was read from, a confidence score, and an explicit null when the page doesn&apos;t have it.
          </p>

          <div className="fade-up mt-9" style={{ animationDelay: "180ms" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
              className="rounded-xl border border-white/12 bg-[#080808] p-1.5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] transition focus-within:border-white/40"
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3">
                  <Link2 size={16} className="shrink-0 text-zinc-500" />
                  <input
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="https://example.com/product"
                    spellCheck={false}
                    aria-label="Public page URL"
                    className="h-11 w-full min-w-0 bg-transparent font-mono text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={phase === "running"}
                  className="group flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-[13.5px] font-medium text-black transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-60"
                >
                  {phase === "running" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Extract
                  <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                </button>
              </div>
            </form>
            {error && <p className="mt-2.5 text-left text-[12.5px] text-zinc-300">› {error}</p>}

            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="inline-flex rounded-lg border border-white/12 bg-white/[0.02] p-0.5 text-[12.5px]">
                {(["auto", "custom"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3.5 py-1.5 transition ${mode === m ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-200"}`}
                  >
                    {m === "auto" ? "Auto extraction" : "Custom fields"}
                  </button>
                ))}
              </div>

              {mode === "custom" && (
                <div className="fade-up w-full text-left">
                  <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                    Describe the fields in plain English
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-white/12 bg-[#080808] px-3.5 py-2.5 text-[14px] text-zinc-200 outline-none transition focus:border-white/40"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="font-mono text-[12px] text-zinc-600">try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => {
                      setUrl(ex.url);
                      setError(null);
                    }}
                    className="rounded-full border border-white/12 px-3 py-1 text-[12px] text-zinc-400 transition hover:border-white/40 hover:text-white"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* workspace */}
      <section ref={resultsRef} className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
        {phase === "running" && result && <Pipeline step={step} url={result.url} />}

        {done && result && (
          <div className="fade-up space-y-5">
            {/* demo banner */}
            <div className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-[12.5px] leading-relaxed text-zinc-300">
              <Info size={15} className="mt-0.5 shrink-0 text-zinc-400" />
              <span>
                <strong className="font-semibold text-white">Demo data.</strong> This is a simulated extraction from a sample Sony WH-1000XM5 page, used to show the workflow. It is not a live API response.
              </span>
            </div>

            {/* source + metadata */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <Globe size={13} /> source
                </div>
                <div className="mt-1 truncate font-mono text-[13.5px] text-zinc-200">{result.url}</div>
              </div>
              <div className="flex flex-wrap gap-2 font-mono text-[11.5px] text-zinc-400">
                <Chip>{result.mode === "auto" ? "auto schema" : "custom schema"}</Chip>
                <Chip>{(result.durationMs / 1000).toFixed(1)}s</Chip>
                <Chip>demo run</Chip>
              </div>
            </div>

            {result.blocked ? (
              <div className="rounded-2xl border border-white/15 bg-white/[0.02] p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={20} className="mt-0.5 shrink-0 text-zinc-300" />
                  <div>
                    <div className="font-medium text-white">Blocked: {result.blocked}</div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">
                      We don&apos;t sign in, bypass logins or solve CAPTCHAs. Every field is marked <code className="font-mono text-zinc-200">null</code>. Nothing was invented.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="Fields found" value={`${found} / ${result.fields.length}`} />
                <Tile label="Avg confidence" value={`${avgConf}%`} />
                <Tile label="Schema" value="Valid" accent />
                <Tile label="Missing" value={`${result.fields.length - found} null`} />
              </div>
            )}

            {!result.blocked && (
              <div className="grid gap-5 lg:grid-cols-12">
                {/* fields table */}
                <div className="rounded-2xl border border-white/[0.09] bg-[#070707] lg:col-span-7">
                  <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
                    <div className="text-[13px] font-medium">Extracted fields</div>
                    <div className="font-mono text-[11px] text-zinc-500">click a row for evidence</div>
                  </div>
                  <div className="scroll-thin overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-[13px]">
                      <thead>
                        <tr className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
                          <th className="px-5 py-2.5 font-medium">Field</th>
                          <th className="px-3 py-2.5 font-medium">Value</th>
                          <th className="px-3 py-2.5 font-medium">Confidence</th>
                          <th className="px-5 py-2.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.fields.map((f, i) => (
                          <FieldRow
                            key={f.key}
                            field={f}
                            index={i}
                            active={selected === f.key}
                            onClick={() => setSelected(f.key)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* evidence */}
                <div className="rounded-2xl border border-white/[0.09] bg-[#070707] lg:col-span-5">
                  <div className="border-b border-white/[0.08] px-5 py-3.5 text-[13px] font-medium">Source evidence</div>
                  <div className="p-5">
                    {!selectedField && (
                      <div className="grid place-items-center rounded-xl border border-dashed border-white/12 px-6 py-12 text-center">
                        <div className="text-[13.5px] text-zinc-200">Select a field</div>
                        <p className="mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-zinc-500">
                          See the exact page snippet and DOM node it was read from.
                        </p>
                      </div>
                    )}
                    {selectedField && <Evidence field={selectedField} />}
                  </div>
                </div>
              </div>
            )}

            {/* output */}
            <div className="rounded-2xl border border-white/[0.09] bg-[#070707]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-3 py-2.5">
                <div className="inline-flex rounded-lg border border-white/12 bg-white/[0.02] p-0.5 text-[12.5px]">
                  {(["json", "markdown", "csv"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-md px-3 py-1.5 transition ${tab === t ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      {t === "json" ? "JSON" : t === "markdown" ? "Markdown" : "CSV"}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ExportButton icon={Copy} onClick={() => copy(jsonText, "JSON copied")}>Copy JSON</ExportButton>
                  <ExportButton icon={Download} onClick={() => download("extraction.json", jsonText, "application/json")}>Download JSON</ExportButton>
                  <ExportButton icon={Download} onClick={() => download("extraction.csv", csvText, "text/csv")}>Download CSV</ExportButton>
                  <ExportButton icon={FileText} onClick={() => copy(mdText, "Markdown copied")}>Copy Markdown</ExportButton>
                </div>
              </div>
              <pre className="scroll-thin max-h-[420px] overflow-auto p-5 font-mono text-[12.5px] leading-[1.7] text-zinc-300">
                {tab === "json" && jsonText.split("\n").map((line, i) => <div key={i}>{tokenize(line)}</div>)}
                {tab === "markdown" && <div className="whitespace-pre text-zinc-300">{mdText}</div>}
                {tab === "csv" && <div className="whitespace-pre text-zinc-300">{csvText}</div>}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* toast */}
      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/15 bg-black px-4 py-2 font-mono text-[12.5px] text-zinc-100 shadow-2xl transition-all duration-300 ${toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      >
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" /> {toast}
        </span>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/12 px-2.5 py-1">{children}</span>;
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.09] bg-[#070707] px-4 py-3.5">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold tabular-nums tracking-tight ${accent ? "text-emerald-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

function ExportButton({ icon: Icon, onClick, children }: { icon: typeof Copy; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-zinc-300 transition hover:border-white/40 hover:bg-white/[0.05] hover:text-white active:scale-[0.97]"
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

function FieldRow({ field: f, index, active, onClick }: { field: ExtractField; index: number; active: boolean; onClick: () => void }) {
  const pct = Math.round(f.confidence * 100);
  const isNull = f.value === null;
  return (
    <tr
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className={`fade-up cursor-pointer border-t border-white/[0.06] transition ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
    >
      <td className="px-5 py-3">
        <div className={`font-medium ${active ? "text-white" : "text-zinc-200"}`}>{f.label}</div>
        <div className="font-mono text-[11px] text-zinc-600">{f.key}</div>
      </td>
      <td className="max-w-[220px] px-3 py-3">
        {isNull ? (
          <span className="font-mono text-zinc-500">null</span>
        ) : (
          <span className="text-zinc-100">{formatValue(f)}</span>
        )}
      </td>
      <td className="px-3 py-3">
        {isNull ? (
          <span className="text-zinc-600">—</span>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.1]">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${f.status === "low" ? "bg-zinc-500" : "bg-white"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-[12px] text-zinc-400">{pct}%</span>
          </div>
        )}
      </td>
      <td className="px-5 py-3">
        <StatusBadge status={f.status} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: ExtractField["status"] }) {
  if (status === "valid")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-400">
        <CheckCircle2 size={13} /> Valid
      </span>
    );
  if (status === "low")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-300">
        <TriangleAlert size={13} /> Low confidence
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500">
      <Circle size={12} /> Missing
    </span>
  );
}

function Evidence({ field: f }: { field: ExtractField }) {
  let body: ReactNode = null;
  if (f.snippet && f.highlight) {
    const i = f.snippet.indexOf(f.highlight);
    body = (
      <>
        {f.snippet.slice(0, i)}
        <mark className="ev">{f.highlight}</mark>
        {f.snippet.slice(i + f.highlight.length)}
      </>
    );
  }
  return (
    <div key={f.key} className="fade-up space-y-5">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{f.label}</div>
        <div className="mt-1.5 text-[22px] font-semibold tracking-tight text-white">
          {f.value === null ? <span className="font-mono text-zinc-500">null</span> : formatValue(f)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[12.5px]">
        <div className="rounded-lg border border-white/[0.09] px-3 py-2.5">
          <div className="text-zinc-500">Confidence</div>
          <div className="mt-0.5 tabular-nums text-zinc-100">{f.value === null ? "—" : `${Math.round(f.confidence * 100)}%`}</div>
        </div>
        <div className="rounded-lg border border-white/[0.09] px-3 py-2.5">
          <div className="text-zinc-500">Status</div>
          <div className="mt-0.5">
            <StatusBadge status={f.status} />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">source snippet</div>
        {f.snippet ? (
          <div className="rounded-xl border border-white/[0.09] bg-black p-4 text-[13.5px] leading-relaxed text-zinc-400">{body}</div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/12 p-4 text-[13px] text-zinc-500">
            Not found on the page. The value is set to <span className="font-mono">null</span> and not guessed.
          </div>
        )}
      </div>
      {f.source && (
        <div className="text-[12px] text-zinc-500">
          Source node <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] text-zinc-300">{f.source}</code>
        </div>
      )}
    </div>
  );
}

function Pipeline({ step, url }: { step: number; url: string }) {
  const pct = Math.round((step / (STEPS.length - 1)) * 100);
  return (
    <div className="fade-up grid gap-6 rounded-2xl border border-white/[0.09] bg-[#070707] p-6 md:grid-cols-[1fr_1.05fr] md:p-8">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          <span className="text-emerald-400">$</span> pipeline
        </div>
        <div className="mt-2 text-[20px] font-semibold tracking-tight">{STEPS[Math.min(step, STEPS.length - 1)].label}…</div>
        <div className="mt-1.5 truncate font-mono text-[12px] text-zinc-500">{url}</div>

        <div className="relative mt-7 h-44 overflow-hidden rounded-xl border border-white/[0.09] bg-black p-4">
          <div className="space-y-2.5">
            <div className="h-3 w-2/5 rounded bg-white/[0.14]" />
            <div className="h-2 w-full rounded bg-white/[0.06]" />
            <div className="h-2 w-11/12 rounded bg-white/[0.06]" />
            <div className="mt-3 flex gap-3">
              <div className="h-20 w-20 rounded-md bg-white/[0.07]" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-2.5 w-3/4 rounded bg-white/[0.12]" />
                <div className="h-2 w-1/2 rounded bg-white/[0.2]" />
                <div className="h-2 w-2/3 rounded bg-white/[0.06]" />
              </div>
            </div>
          </div>
          {step < STEPS.length - 1 && <div className="scanline" />}
        </div>

        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 font-mono text-[11.5px] tabular-nums text-zinc-500">{pct}%</div>
      </div>

      <ol className="space-y-1">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "pending";
          return (
            <li
              key={s.label}
              className={`relative flex items-start gap-3.5 overflow-hidden rounded-lg px-3.5 py-3 transition-colors duration-300 ${state === "active" ? "bg-white/[0.06]" : ""}`}
            >
              {state === "active" && <span className="shimmer absolute inset-0" />}
              <span className="mt-0.5 shrink-0">
                {state === "done" && <CheckCircle2 size={16} className="text-white" />}
                {state === "active" && <Loader2 size={16} className="animate-spin text-white" />}
                {state === "pending" && <Circle size={16} className="text-zinc-700" />}
              </span>
              <div className="relative min-w-0">
                <div className={`text-[13.5px] font-medium transition-colors ${state === "pending" ? "text-zinc-600" : "text-zinc-100"}`}>{s.label}</div>
                <div className={`text-[12px] transition-colors ${state === "pending" ? "text-zinc-700" : "text-zinc-500"}`}>{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
