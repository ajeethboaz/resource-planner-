import { useState, useMemo } from "react";

/* ═══════════════════════════════════════════════
   THEMES
═══════════════════════════════════════════════ */
const THEMES = {
  dark: {
    bg: "#0f1117", surface: "#181c27", card: "#1e2333", border: "#2a3050",
    accent: "#4f8ef7", accent2: "#38d9a9", accent3: "#f7924f",
    text: "#e8eaf6", muted: "#6b7599", danger: "#f76f6f",
    success: "#38d9a9", warning: "#f7c94f",
    inputBg: "#0f1117", shadow: "0 4px 24px rgba(0,0,0,0.4)",
    engineBg: "#151a2b",
  },
  light: {
    bg: "#f0f4fb", surface: "#ffffff", card: "#ffffff", border: "#dde3f0",
    accent: "#2563eb", accent2: "#059669", accent3: "#d97706",
    text: "#1a1f36", muted: "#7c86a2", danger: "#dc2626",
    success: "#059669", warning: "#b45309",
    inputBg: "#f0f4fb", shadow: "0 2px 12px rgba(0,0,0,0.07)",
    engineBg: "#e8eef8",
  },
};

/* ═══════════════════════════════════════════════
   CURRENCY — all internal values stored in USD
   FX rates: 1 USD → X units of target currency
═══════════════════════════════════════════════ */
const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const FX_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.5 };

// Convert USD → display currency
const toFx = (usd, cur) => usd * FX_RATES[cur];
// Convert display currency → USD
const fromFx = (val, cur) => val / FX_RATES[cur];
// Format a USD value in the selected display currency
const fmt = (usd, sym, cur) =>
  `${sym}${Math.round(toFx(usd, cur)).toLocaleString("en-IN")}`;
// Format a per-hour rate (USD) for display, 2 decimals
const fmtRate = (usd, sym, cur) => {
  const v = toFx(usd, cur);
  return `${sym}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
};

const fmtP = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const r2 = (n) => parseFloat(n.toFixed(4));

/* ═══════════════════════════════════════════════
   INITIAL DATA  (USD values)
═══════════════════════════════════════════════ */
const calcWSR = (rate, margin) => parseFloat((rate / (1 - margin / 100)).toFixed(4));

const initialRoles = [
  { id: 1, name: "SME", rate: 275, wsr: calcWSR(275, 30), hoursPerWeek: 40, weekAllocations: [0.1, 0.1, 0.1, 0.1] },
  { id: 2, name: "BA", rate: 55, wsr: calcWSR(55, 30), hoursPerWeek: 40, weekAllocations: [0.5, 0.5, 0.5, 0.5] },
  { id: 3, name: "QA", rate: 24, wsr: calcWSR(24, 30), hoursPerWeek: 40, weekAllocations: [1, 1, 1, 1] },
];

let nextId = 4;

function marginColor(margin, target, C) {
  if (margin >= target + 5) return C.success;
  if (margin >= target) return C.accent2;
  if (margin >= target - 5) return C.warning;
  return C.danger;
}

/* ═══════════════════════════════════════════════
   REUSABLE UI COMPONENTS
═══════════════════════════════════════════════ */
function Badge({ children, color, size = 11 }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: size,
      fontWeight: 700, letterSpacing: "0.05em", fontFamily: "monospace",
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// Raw numeric input — caller handles FX conversion
function NumInput({ value, onChange, min = 0, step = 0.1, extraStyle = {}, C, highlight }) {
  return (
    <input type="number" value={value} min={min} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        background: highlight ? highlight + "18" : C.inputBg,
        border: `1px solid ${highlight || C.border}`,
        borderRadius: 6, color: C.text, padding: "4px 8px",
        fontSize: 13, width: "100%", outline: "none", textAlign: "right",
        fontFamily: "'JetBrains Mono', monospace", transition: "border 0.2s",
        ...extraStyle,
      }}
    />
  );
}

// Currency-aware rate input: displays in current currency, stores in USD
function RateInput({ usdValue, onUsdChange, currency, C, highlight }) {
  const displayVal = parseFloat(toFx(usdValue, currency).toFixed(2));
  const step = currency === "INR" ? 10 : 0.5;
  return (
    <NumInput
      value={displayVal}
      onChange={v => onUsdChange(r2(fromFx(v, currency)))}
      step={step}
      min={0}
      C={C}
      highlight={highlight}
    />
  );
}

function TextInput({ value, onChange, C, extraStyle = {} }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6,
        color: C.text, padding: "4px 8px", fontSize: 13, width: "100%",
        outline: "none", fontFamily: "'Space Grotesk', sans-serif", ...extraStyle,
      }}
    />
  );
}

function IconBtn({ onClick, title, children, color, C }) {
  const [hov, setHov] = useState(false);
  const col = color || C.muted;
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? col + "22" : "transparent",
        border: `1px solid ${hov ? col : "transparent"}`,
        borderRadius: 6, color: hov ? col : C.muted,
        cursor: "pointer", padding: "4px 8px", fontSize: 14,
        transition: "all 0.15s", lineHeight: 1,
      }}
    >{children}</button>
  );
}

function Btn({ onClick, children, accent, C }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? (accent || C.accent) + "22" : "transparent",
        border: `1px solid ${hov ? (accent || C.accent) : C.border}`,
        borderRadius: 8, color: hov ? (accent || C.accent) : C.muted,
        cursor: "pointer", padding: "7px 16px", fontSize: 13,
        fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.15s",
      }}
    >{children}</button>
  );
}

function ApplyBtn({ onClick, children, C }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov
          ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})`
          : `linear-gradient(135deg, ${C.accent}cc, ${C.accent2}cc)`,
        border: "none", borderRadius: 8, color: "#fff",
        cursor: "pointer", padding: "8px 18px", fontSize: 13, fontWeight: 700,
        fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.15s",
        boxShadow: hov ? `0 4px 16px ${C.accent}55` : "none",
      }}
    >{children}</button>
  );
}

function ThemeToggle({ dark, setDark, C }) {
  return (
    <button onClick={() => setDark(d => !d)} style={{
      display: "flex", alignItems: "center", gap: 8,
      background: dark ? "#ffffff12" : "#00000008",
      border: `1px solid ${C.border}`, borderRadius: 20,
      cursor: "pointer", padding: "5px 14px 5px 10px",
      color: C.text, fontSize: 12, fontWeight: 600,
      fontFamily: "'Space Grotesk', sans-serif",
      transition: "all 0.25s", whiteSpace: "nowrap",
    }}>
      <span style={{
        display: "inline-block", width: 34, height: 19,
        background: dark ? C.accent : "#c5cfe8",
        borderRadius: 10, position: "relative", transition: "background 0.25s", flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 3, left: dark ? 17 : 3,
          width: 13, height: 13, borderRadius: "50%", background: "#fff",
          transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }} />
      </span>
      <span>{dark ? "🌙 Dark" : "☀️ Light"}</span>
    </button>
  );
}

function CurrencyBar({ currency, setCurrency, C }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {["USD", "EUR", "GBP", "INR"].map(c => {
        const active = currency === c;
        const isBase = c === "USD";
        return (
          <button key={c} onClick={() => setCurrency(c)} style={{
            background: active ? C.accent + "22" : "transparent",
            border: `1px solid ${active ? C.accent : C.border}`,
            borderRadius: 6,
            color: active ? C.accent : C.muted,
            cursor: "pointer", padding: "4px 10px", fontSize: 12,
            fontWeight: 600, transition: "all 0.15s",
            position: "relative",
          }}>
            {c}
            {isBase && (
              <span style={{
                position: "absolute", top: -5, right: -5,
                background: C.accent2, color: "#fff",
                fontSize: 8, fontWeight: 800,
                borderRadius: 4, padding: "1px 3px", lineHeight: 1.4,
              }}>BASE</span>
            )}
          </button>
        );
      })}
      {currency !== "USD" && (
        <span style={{
          fontSize: 10, color: C.muted, fontFamily: "monospace",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
        }}>
          1 USD = {FX_RATES[currency]} {currency}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TABLE STYLE HELPERS
═══════════════════════════════════════════════ */
const TH = (C, w, color) => ({
  padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 700,
  color: color || C.muted, letterSpacing: "0.08em", whiteSpace: "nowrap",
  width: w, minWidth: w,
});
const TD = { padding: "7px 10px", verticalAlign: "middle" };

/* ═══════════════════════════════════════════════
   COLLAPSIBLE SECTION HEADER
═══════════════════════════════════════════════ */
function SectionHeader({ label, open, onToggle, badge, badgeColor, C }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      marginBottom: open ? 10 : 20,
      paddingBottom: 8,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "transparent", border: "none", cursor: "pointer",
        padding: 0, color: C.text,
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20, borderRadius: 5,
          background: open ? C.accent + "22" : C.surface,
          border: `1px solid ${open ? C.accent + "66" : C.border}`,
          color: open ? C.accent : C.muted,
          fontSize: 9, fontWeight: 900,
          transition: "all 0.2s",
          transform: open ? "none" : "none",
          flexShrink: 0,
        }}>{open ? "▾" : "▸"}</span>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
          color: open ? C.text : C.muted,
          fontFamily: "'Space Grotesk',sans-serif",
          transition: "color 0.2s",
        }}>{label}</span>
      </button>
      {badge && (
        <span style={{
          fontSize: 10, color: badgeColor || C.muted,
          fontFamily: "monospace", fontWeight: 600,
          background: (badgeColor || C.muted) + "18",
          border: `1px solid ${(badgeColor || C.muted)}33`,
          borderRadius: 4, padding: "1px 7px",
        }}>{badge}</span>
      )}
      <div style={{ flex: 1, height: 1, background: C.border, marginLeft: 4 }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MARGIN ENGINE PANEL
   — all logic in USD; only display converts
═══════════════════════════════════════════════ */
function MarginEngine({ roles, setRoles, targetMargin, setTargetMargin, stats, sym, currency, C }) {
  const [mode, setMode] = useState("wsr");

  const overallMargin = useMemo(() => {
    const rev = stats.reduce((a, s) => a + s.revenue, 0);
    const cost = stats.reduce((a, s) => a + s.cost, 0);
    return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
  }, [stats]);

  const gap = overallMargin - targetMargin;

  function applyToAll() {
    setRoles(prev => prev.map(r => {
      if (mode === "wsr") return { ...r, wsr: r2(r.rate / (1 - targetMargin / 100)) };
      else return { ...r, rate: r2(r.wsr * (1 - targetMargin / 100)) };
    }));
  }

  function applyToRole(id) {
    setRoles(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (mode === "wsr") return { ...r, wsr: r2(r.rate / (1 - targetMargin / 100)) };
      else return { ...r, rate: r2(r.wsr * (1 - targetMargin / 100)) };
    }));
  }

  return (
    <div style={{
      background: C.engineBg,
      border: `1.5px solid ${C.accent}44`,
      borderRadius: 14, padding: "20px 22px", marginBottom: 24,
      boxShadow: `0 0 0 1px ${C.accent}22, ${C.shadow}`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Margin Engine</div>
            <div style={{ fontSize: 11, color: C.muted }}>Set target · reverse-engineer WSR or CBR · all logic in USD</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>CURRENT</div>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 800, color: marginColor(overallMargin, targetMargin, C) }}>
              {overallMargin.toFixed(1)}%
            </span>
          </div>
          <div style={{ fontSize: 20, color: C.muted }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>TARGET</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="number" value={targetMargin} min={0} max={99} step={1}
                onChange={e => setTargetMargin(parseFloat(e.target.value) || 0)}
                style={{
                  background: C.inputBg, border: `2px solid ${C.accent}`,
                  borderRadius: 8, color: C.accent, padding: "4px 8px",
                  fontSize: 18, fontWeight: 800, width: 72, outline: "none",
                  textAlign: "center", fontFamily: "'JetBrains Mono',monospace",
                }}
              />
              <span style={{ color: C.accent, fontSize: 18, fontWeight: 800 }}>%</span>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>GAP</div>
            <Badge color={gap >= 0 ? C.success : C.danger} size={14}>{fmtP(gap)}</Badge>
          </div>
        </div>
      </div>

      {/* mode + apply */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Solve for:</div>
        {[
          { key: "wsr", label: "🔧 Adjust WSR", desc: "Keep CBR fixed" },
          { key: "rate", label: "🔧 Adjust CBR", desc: "Keep WSR fixed" },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMode(opt.key)} style={{
            background: mode === opt.key ? C.accent + "22" : "transparent",
            border: `1.5px solid ${mode === opt.key ? C.accent : C.border}`,
            borderRadius: 8, color: mode === opt.key ? C.accent : C.muted,
            cursor: "pointer", padding: "6px 14px", fontSize: 12, fontWeight: 600,
            fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.15s",
          }}>
            {opt.label}
            <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>({opt.desc})</span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.muted }}>
            {mode === "wsr"
              ? `WSR = CBR ÷ (1 − ${targetMargin}%)`
              : `CBR = WSR × (1 − ${targetMargin}%)`}
          </span>
          <ApplyBtn onClick={applyToAll} C={C}>Apply to All Roles →</ApplyBtn>
        </div>
      </div>

      {/* per-role chips */}
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {roles.map((r, i) => {
          const s = stats[i];
          const mc = marginColor(s.margin, targetMargin, C);
          return (
            <div key={r.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "8px 12px", display: "flex", alignItems: "center", gap: 10,
              flex: "1 1 170px",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.text }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
                  {fmtRate(r.rate, sym, currency)} CBR → {fmtRate(r.wsr, sym, currency)} WSR &nbsp;
                  <span style={{ color: mc, fontWeight: 700 }}>{s.margin.toFixed(1)}%</span>
                </div>
              </div>
              <button onClick={() => applyToRole(r.id)} style={{
                background: C.accent + "22", border: `1px solid ${C.accent}44`,
                borderRadius: 6, color: C.accent, cursor: "pointer",
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                fontFamily: "'Space Grotesk',sans-serif", whiteSpace: "nowrap",
              }}>Apply</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function ResourcePlanner() {
  const [dark, setDark] = useState(true);
  const C = THEMES[dark ? "dark" : "light"];
  const [roles, setRoles] = useState(initialRoles);
  const [numWeeks, setNumWeeks] = useState(4);
  const [currency, setCurrency] = useState("USD");
  const [weekLabels, setWeekLabels] = useState(["W1", "W2", "W3", "W4"]);
  const [editLabel, setEditLabel] = useState(null);
  const [sprintHours, setSH] = useState(40);
  const [showSettings, setShowSet] = useState(false);
  const [showEngine, setShowEngine] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [targetMargin, setTM] = useState(30);
  const sym = SYMBOLS[currency];

  function changeWeeks(n) {
    const nw = Math.max(1, Math.min(52, n));
    setNumWeeks(nw);
    setWeekLabels(p => { const a = [...p]; while (a.length < nw) a.push(`W${a.length + 1}`); return a.slice(0, nw); });
    setRoles(p => p.map(r => {
      const a = [...r.weekAllocations];
      while (a.length < nw) a.push(a[a.length - 1] ?? 1);
      return { ...r, weekAllocations: a.slice(0, nw) };
    }));
  }

  const upd = (id, f, v) => setRoles(p => p.map(r => r.id === id ? { ...r, [f]: v } : r));
  const updW = (id, wi, v) => setRoles(p => p.map(r => {
    if (r.id !== id) return r;
    const a = [...r.weekAllocations]; a[wi] = v; return { ...r, weekAllocations: a };
  }));
  const addR = () => setRoles(p => [...p, {
    id: nextId++, name: "New Role",
    rate: fromFx(50, currency),          // store USD equivalent
    wsr: fromFx(r2(50 / (1 - targetMargin / 100)), currency),
    hoursPerWeek: sprintHours,
    weekAllocations: Array(numWeeks).fill(1),
  }]);
  const delR = id => setRoles(p => p.filter(r => r.id !== id));
  const fillW = (id, v) => setRoles(p => p.map(r => r.id === id ? { ...r, weekAllocations: Array(numWeeks).fill(v) } : r));

  // All stats computed in USD
  const stats = useMemo(() => roles.map(r => {
    const total = r.weekAllocations.slice(0, numWeeks).reduce((a, b) => a + b, 0);
    const hours = total * (r.hoursPerWeek ?? sprintHours);
    const cost = hours * r.rate;
    const revenue = hours * r.wsr;
    const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
    return { total, hours, cost, revenue, margin };
  }), [roles, numWeeks, sprintHours]);

  const totalCostUSD = stats.reduce((a, s) => a + s.cost, 0);
  const totalRevenueUSD = stats.reduce((a, s) => a + s.revenue, 0);
  const totalHours = stats.reduce((a, s) => a + s.hours, 0);
  const overallMargin = totalRevenueUSD > 0 ? ((totalRevenueUSD - totalCostUSD) / totalRevenueUSD) * 100 : 0;
  const BAR_COLORS = [C.accent, C.accent2, C.accent3, "#c084fc", "#f472b6"];

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Space Grotesk','Segoe UI',sans-serif",
      padding: "28px 20px", transition: "background 0.25s,color 0.25s",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, fontSize: 18,
              background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>⚡</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Resource Effort PlannerV2.1</h1>
          </div>
          <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>
            Sprint-based cost & margin estimator · {numWeeks} weeks · {roles.length} roles
            {currency !== "USD" && (
              <span style={{ marginLeft: 8, color: C.accent, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
                · All values in {currency} (1 USD = {FX_RATES[currency]} {currency})
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ThemeToggle dark={dark} setDark={setDark} C={C} />
          <CurrencyBar currency={currency} setCurrency={setCurrency} C={C} />
          <IconBtn onClick={() => setShowSet(s => !s)} title="Settings" color={C.accent} C={C}>⚙</IconBtn>
        </div>
      </div>

      {/* ── SETTINGS ── */}
      {showSettings && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 20, marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap",
          alignItems: "flex-end", boxShadow: C.shadow,
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>WEEKS</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <IconBtn onClick={() => changeWeeks(numWeeks - 1)} color={C.danger} C={C}>−</IconBtn>
              <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, minWidth: 28, textAlign: "center" }}>{numWeeks}</span>
              <IconBtn onClick={() => changeWeeks(numWeeks + 1)} color={C.accent2} C={C}>+</IconBtn>
            </div>
          </div>
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>DEFAULT HRS/WEEK</div>
            <NumInput value={sprintHours} onChange={setSH} min={1} step={1} C={C} />
          </div>
        </div>
      )}

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Revenue", value: fmt(totalRevenueUSD, sym, currency), color: C.accent2, icon: "📈" },
          { label: "Total Cost", value: fmt(totalCostUSD, sym, currency), color: C.accent3, icon: "💸" },
          { label: "Overall Margin", value: `${overallMargin.toFixed(1)}%`, color: marginColor(overallMargin, targetMargin, C), icon: "🎯" },
          { label: "Total Hours", value: `${totalHours.toLocaleString()}h`, color: C.accent, icon: "⏱" },
          { label: "Roles", value: roles.length, color: C.muted, icon: "👥" },
        ].map(card => (
          <div key={card.label} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "12px 18px", flex: "1 1 110px", minWidth: 110,
            boxShadow: C.shadow, transition: "background 0.25s",
          }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>
              {card.icon} {card.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color, fontFamily: "'JetBrains Mono',monospace" }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ══ 1. RESOURCE LOADING ══════════════════════════════ */}
      <SectionHeader
        label="RESOURCE LOADING"
        open={showTable}
        onToggle={() => setShowTable(s => !s)}
        badge={`${roles.length} roles · ${numWeeks} weeks`}
        C={C}
      />
      {showTable && (<>
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          overflow: "auto", marginBottom: 14, boxShadow: C.shadow,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                <th style={TH(C, 150)}>ROLE</th>
                <th style={TH(C, 90)}>CBR ({sym})</th>
                <th style={TH(C, 90, C.accent2)}>WSR ({sym})</th>
                <th style={TH(C, 76, marginColor(overallMargin, targetMargin, C))}>MARGIN %</th>
                <th style={TH(C, 76)}>HRS/WK</th>
                {weekLabels.map((w, i) => (
                  <th key={i} style={TH(C, 66)}>
                    {editLabel === i ? (
                      <input autoFocus value={w}
                        onChange={e => setWeekLabels(p => p.map((l, j) => j === i ? e.target.value : l))}
                        onBlur={() => setEditLabel(null)}
                        onKeyDown={e => e.key === "Enter" && setEditLabel(null)}
                        style={{
                          background: "transparent", border: "none", color: C.accent,
                          width: 46, textAlign: "center", fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 11, fontWeight: 700, outline: `1px solid ${C.accent}`,
                          borderRadius: 4, padding: "2px 4px",
                        }}
                      />
                    ) : (
                      <span style={{ cursor: "pointer", borderBottom: `1px dashed ${C.border}` }}
                        title="Click to rename" onClick={() => setEditLabel(i)}>{w}</span>
                    )}
                  </th>
                ))}
                <th style={TH(C, 60, C.accent2)}>TOTAL</th>
                <th style={TH(C, 66, C.accent)}>HOURS</th>
                <th style={TH(C, 92, C.accent3)}>COST</th>
                <th style={TH(C, 92, C.accent2)}>REVENUE</th>
                <th style={TH(C, 44)}></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, ri) => {
                const s = stats[ri];
                const mc = marginColor(s.margin, targetMargin, C);
                return (
                  <tr key={role.id}
                    style={{ borderTop: `1px solid ${C.border}`, transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={TD}>
                      <TextInput value={role.name} onChange={v => upd(role.id, "name", v)}
                        extraStyle={{ fontWeight: 600, fontSize: 14 }} C={C} />
                    </td>
                    <td style={TD}>
                      <RateInput usdValue={role.rate} onUsdChange={v => upd(role.id, "rate", v)} currency={currency} C={C} />
                    </td>
                    <td style={TD}>
                      <RateInput usdValue={role.wsr} onUsdChange={v => upd(role.id, "wsr", v)} currency={currency} C={C} highlight={C.accent2} />
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      <Badge color={mc} size={12}>{s.margin.toFixed(1)}%</Badge>
                    </td>
                    <td style={TD}>
                      <NumInput value={role.hoursPerWeek ?? sprintHours} onChange={v => upd(role.id, "hoursPerWeek", v)} step={1} min={1} C={C} />
                    </td>
                    {role.weekAllocations.slice(0, numWeeks).map((w, wi) => (
                      <td key={wi} style={TD}>
                        <NumInput value={w}
                          onChange={v => updW(role.id, wi, Math.min(1, Math.max(0, v)))}
                          step={0.1} C={C}
                          extraStyle={{ color: w === 1 ? C.accent2 : w === 0 ? C.muted : C.text }}
                        />
                      </td>
                    ))}
                    <td style={{ ...TD, textAlign: "right" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.accent2, fontSize: 13 }}>
                        {s.total.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.accent, fontSize: 12 }}>
                        {s.hours}h
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: C.accent3, fontSize: 13 }}>
                        {fmt(s.cost, sym, currency)}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.accent2, fontSize: 13 }}>
                        {fmt(s.revenue, sym, currency)}
                      </span>
                    </td>
                    <td style={TD}>
                      <div style={{ display: "flex", gap: 2 }}>
                        <IconBtn onClick={() => fillW(role.id, role.weekAllocations[0])} title="Fill all weeks" color={C.accent} C={C}>↔</IconBtn>
                        <IconBtn onClick={() => delR(role.id)} title="Delete role" color={C.danger} C={C}>✕</IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}`, background: C.surface }}>
                <td colSpan={4} style={{ ...TD, fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.05em" }}>TOTALS</td>
                <td colSpan={1 + numWeeks} style={TD} />
                <td style={{ ...TD, textAlign: "right" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.accent2 }}>
                    {stats.reduce((a, s) => a + s.total, 0).toFixed(1)}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.accent, fontWeight: 700 }}>
                    {totalHours}h
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.accent3 }}>
                    {fmt(totalCostUSD, sym, currency)}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 14, color: C.accent2 }}>
                    {fmt(totalRevenueUSD, sym, currency)}
                  </span>
                </td>
                <td style={TD} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* actions sit inside the Resource Loading section */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
          <button onClick={addR} style={{
            background: `linear-gradient(135deg,${C.accent}22,${C.accent2}22)`,
            border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 8,
            padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600,
            fontFamily: "'Space Grotesk',sans-serif", display: "flex", alignItems: "center", gap: 6,
          }}>+ Add Role</button>
          <Btn onClick={() => changeWeeks(numWeeks + 1)} C={C} accent={C.accent2}>+ Add Week</Btn>
          {numWeeks > 1 && <Btn onClick={() => changeWeeks(numWeeks - 1)} C={C} accent={C.danger}>− Remove Week</Btn>}
          <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>
            💡 Click week headers to rename · ↔ fills all weeks · CBR & WSR auto-convert per currency
          </span>
        </div>
      </>)}

      {/* ══ 2. MARGIN ENGINE ═════════════════════════════════ */}
      <SectionHeader
        label="MARGIN ENGINE"
        open={showEngine}
        onToggle={() => setShowEngine(s => !s)}
        badge={`Target ${targetMargin}% · Current ${overallMargin.toFixed(1)}%`}
        badgeColor={marginColor(overallMargin, targetMargin, C)}
        C={C}
      />
      {showEngine && (
        <MarginEngine
          roles={roles} setRoles={setRoles}
          targetMargin={targetMargin} setTargetMargin={setTM}
          stats={stats} sym={sym} currency={currency} C={C}
        />
      )}

      {/* ══ 3. ROLE BREAKDOWN ════════════════════════════════ */}
      <SectionHeader
        label="ROLE BREAKDOWN"
        open={showBreakdown}
        onToggle={() => setShowBreakdown(s => !s)}
        badge={`${roles.length} roles`}
        C={C}
      />
      {showBreakdown && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {roles.map((r, i) => {
            const s = stats[i];
            const revPct = totalRevenueUSD > 0 ? (s.revenue / totalRevenueUSD * 100).toFixed(1) : 0;
            const col = BAR_COLORS[i % BAR_COLORS.length];
            const mc = marginColor(s.margin, targetMargin, C);
            return (
              <div key={r.id} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "12px 16px", flex: "1 1 160px", minWidth: 160, boxShadow: C.shadow,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</span>
                  <Badge color={mc}>{s.margin.toFixed(1)}%</Badge>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${revPct}%`, background: col, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: col }}>
                  {fmt(s.revenue, sym, currency)}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontFamily: "monospace" }}>
                  Cost {fmt(s.cost, sym, currency)} · {s.hours}h
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, fontFamily: "monospace" }}>
                  {fmtRate(r.rate, sym, currency)}/h CBR · {fmtRate(r.wsr, sym, currency)}/h WSR
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
