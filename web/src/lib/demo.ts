// DEMO DATA ONLY. Deterministic sample extraction from a sample product page.
// This is not a live API response. Every result is labelled as demo in the UI.

export type FieldStatus = "valid" | "low" | "missing";
export type Mode = "auto" | "custom";

export type ExtractField = {
  key: string;
  label: string;
  value: string | number | null;
  confidence: number; // 0..1
  status: FieldStatus;
  source: string | null; // DOM node the value came from
  snippet: string | null; // page text the value came from
  highlight: string | null; // exact substring of snippet that holds the value
};

export type ExtractResult = {
  url: string;
  mode: Mode;
  prompt: string;
  blocked: string | null;
  fields: ExtractField[];
  durationMs: number;
};

type Catalog = Omit<ExtractField, "status" | "label"> & { label: string };

const CATALOG: Record<string, Catalog> = {
  product_name: {
    key: "product_name",
    label: "Product name",
    value: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    confidence: 0.99,
    source: "h1#productTitle",
    snippet: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones, Black. Industry-leading noise cancellation.",
    highlight: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
  },
  brand: {
    key: "brand",
    label: "Brand",
    value: "Sony",
    confidence: 0.98,
    source: "meta[itemprop=brand]",
    snippet: "Brand: Sony  ·  Model: WH-1000XM5  ·  Type: Over-ear",
    highlight: "Sony",
  },
  price: {
    key: "price",
    label: "Price (INR)",
    value: 24990,
    confidence: 0.97,
    source: "span.a-price-whole",
    snippet: "Deal price ₹24,990  ·  M.R.P. ₹34,990 (29% off)",
    highlight: "₹24,990",
  },
  rating: {
    key: "rating",
    label: "Rating",
    value: 4.5,
    confidence: 0.98,
    source: "span[data-hook=rating-out-of-text]",
    snippet: "4.5 out of 5 stars  ·  12,450 ratings",
    highlight: "4.5 out of 5",
  },
  review_count: {
    key: "review_count",
    label: "Number of reviews",
    value: 12450,
    confidence: 0.96,
    source: "span#acrCustomerReviewText",
    snippet: "4.5 out of 5 stars  ·  12,450 ratings",
    highlight: "12,450 ratings",
  },
  availability: {
    key: "availability",
    label: "Availability",
    value: "In Stock",
    confidence: 0.99,
    source: "div#availability span",
    snippet: "In stock. Ships in 1–2 business days.",
    highlight: "In stock",
  },
  color: {
    key: "color",
    label: "Colour",
    value: "Black",
    confidence: 0.91,
    source: "div#variation_color_name",
    snippet: "Colour: Black",
    highlight: "Black",
  },
  warranty: {
    key: "warranty",
    label: "Warranty",
    value: null,
    confidence: 0,
    source: null,
    snippet: null,
    highlight: null,
  },
};

const DEFAULT_AUTO = ["product_name", "brand", "price", "rating", "review_count", "availability", "color", "warranty"];

// plain-English field names -> catalog keys
const ALIASES: [RegExp, string][] = [
  [/name|title/, "product_name"],
  [/brand/, "brand"],
  [/price|cost/, "price"],
  [/rating|stars/, "rating"],
  [/review/, "review_count"],
  [/avail|stock/, "availability"],
  [/colou?r/, "color"],
  [/warrant/, "warranty"],
];

function fieldFromCatalog(key: string, label?: string): ExtractField {
  const c = CATALOG[key];
  const missing = c.value === null;
  return {
    key: c.key,
    label: label ?? c.label,
    value: c.value,
    confidence: c.confidence,
    source: c.source,
    snippet: c.snippet,
    highlight: c.highlight,
    status: missing ? "missing" : c.confidence >= 0.9 ? "valid" : "low",
  };
}

function unknownField(label: string): ExtractField {
  return {
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    label,
    value: null,
    confidence: 0,
    status: "missing",
    source: null,
    snippet: null,
    highlight: null,
  };
}

function parsePrompt(prompt: string): string[] {
  return prompt
    .replace(/^\s*extract\s+/i, "")
    .replace(/\.$/, "")
    .split(/,|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function buildResult(url: string, mode: Mode, prompt: string): ExtractResult {
  const blocked = /login|signin|sign-in|captcha/i.test(url)
    ? "Sign-in wall detected on this page"
    : null;

  let fields: ExtractField[];

  if (blocked) {
    fields = DEFAULT_AUTO.map((k) => ({ ...fieldFromCatalog(k), value: null, status: "missing" as const, confidence: 0, snippet: null, highlight: null, source: null }));
  } else if (mode === "auto") {
    fields = DEFAULT_AUTO.map((k) => fieldFromCatalog(k));
  } else {
    const seen = new Set<string>();
    fields = parsePrompt(prompt).map((label) => {
      const hit = ALIASES.find(([re]) => re.test(label.toLowerCase()));
      if (!hit || seen.has(hit[1])) {
        const f = unknownField(label);
        seen.add(f.key);
        return f;
      }
      seen.add(hit[1]);
      return fieldFromCatalog(hit[1], label.charAt(0).toUpperCase() + label.slice(1));
    });
  }

  return { url, mode, prompt, blocked, fields, durationMs: 4200 };
}

export function formatValue(f: ExtractField): string {
  if (f.value === null) return "null";
  if (typeof f.value === "number") {
    if (f.key === "price") return "₹" + f.value.toLocaleString("en-IN");
    return f.value.toLocaleString("en-IN");
  }
  return f.value;
}

export function toJSON(r: ExtractResult) {
  const data: Record<string, string | number | null> = {};
  for (const f of r.fields) data[f.key] = f.value;
  return {
    _demo: true,
    source_url: r.url,
    mode: r.mode,
    status: r.blocked ? "blocked" : "success",
    blocked_reason: r.blocked,
    schema_validation: r.fields.every((f) => f.status !== "low") ? "valid" : "valid_with_warnings",
    missing_fields: r.fields.filter((f) => f.value === null).map((f) => f.key),
    data,
    fields: r.fields.map((f) => ({
      key: f.key,
      value: f.value,
      confidence: Number(f.confidence.toFixed(2)),
      status: f.status,
      evidence: f.snippet,
    })),
  };
}

const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function toCSV(r: ExtractResult): string {
  const rows = r.fields.map((f) =>
    [f.key, f.value === null ? "" : String(f.value), f.confidence.toFixed(2), f.status, f.snippet ?? ""].map((c) => esc(c)).join(",")
  );
  return ["field,value,confidence,status,evidence", ...rows].join("\n");
}

export function toMarkdown(r: ExtractResult): string {
  const lines = [
    "# Extraction result (demo)",
    "",
    `Source: ${r.url}`,
    "",
    "| Field | Value | Confidence | Status |",
    "| --- | --- | --- | --- |",
    ...r.fields.map((f) => `| ${f.label} | ${f.value === null ? "null" : formatValue(f)} | ${f.confidence ? Math.round(f.confidence * 100) + "%" : "—"} | ${f.status} |`),
  ];
  return lines.join("\n");
}
