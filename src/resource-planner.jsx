import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

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
    engineBg: "#151a2b", intakeBg: "#13161f",
  },
  light: {
    bg: "#f0f4fb", surface: "#ffffff", card: "#ffffff", border: "#dde3f0",
    accent: "#2563eb", accent2: "#059669", accent3: "#d97706",
    text: "#1a1f36", muted: "#7c86a2", danger: "#dc2626",
    success: "#059669", warning: "#b45309",
    inputBg: "#f0f4fb", shadow: "0 2px 12px rgba(0,0,0,0.07)",
    engineBg: "#e8eef8", intakeBg: "#e4eaf6",
  },
};

/* ═══════════════════════════════════════════════
   CURRENCY
═══════════════════════════════════════════════ */
const SYMBOLS  = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const FX_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.5 }; // fallback
let liveFxRates = { ...FX_RATES };

async function fetchLiveRates() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,INR");
    if (!res.ok) return;
    const data = await res.json();
    if (data.rates) {
      liveFxRates = { USD: 1, ...data.rates };
    }
  } catch (_) { /* silently fall back to hardcoded */ }
}

const toFx    = (usd, cur) => usd * (liveFxRates[cur] ?? FX_RATES[cur]);
const fromFx  = (val, cur) => val / (liveFxRates[cur] ?? FX_RATES[cur]);
const fmt     = (usd, sym, cur) => `${sym}${Math.round(toFx(usd, cur)).toLocaleString("en-IN")}`;
const fmtRate = (usd, sym, cur) => { const v = toFx(usd, cur); return `${sym}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`; };
const fmtP    = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const r2      = (n) => parseFloat(n.toFixed(4));
const calcWSR = (rate, margin) => parseFloat((rate / (1 - margin / 100)).toFixed(4));

/* ═══════════════════════════════════════════════
   DEFAULT DATA
═══════════════════════════════════════════════ */
const defaultRoles = [
  { id: 1, name: "SME", rate: 275, wsr: calcWSR(275, 30), hoursPerWeek: 40, weekAllocations: [0.1, 0.1, 0.1, 0.1] },
  { id: 2, name: "BA",  rate: 55,  wsr: calcWSR(55,  30), hoursPerWeek: 40, weekAllocations: [0.5, 0.5, 0.5, 0.5] },
  { id: 3, name: "QA",  rate: 24,  wsr: calcWSR(24,  30), hoursPerWeek: 40, weekAllocations: [1,   1,   1,   1  ] },
];
let nextId = 10;

function marginColor(margin, target, C) {
  if (margin >= target + 5) return C.success;
  if (margin >= target)     return C.accent2;
  if (margin >= target - 5) return C.warning;
  return C.danger;
}

/* ═══════════════════════════════════════════════
   CLAUDE API CALL
═══════════════════════════════════════════════ */
async function callClaude(apiKey, messages, maxTokens = 1500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

/* ═══════════════════════════════════════════════
   FILE HELPERS
═══════════════════════════════════════════════ */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function fileToExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        resolve(csv);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ═══════════════════════════════════════════════
   PARSE AI RESPONSE
═══════════════════════════════════════════════ */
function parseAIResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  const data = JSON.parse(match[0]);
  const roles = (data.roles || []).map((r, i) => ({
    id: nextId++,
    name: r.name || `Role ${i + 1}`,
    rate: parseFloat(r.rate) || 50,
    wsr:  parseFloat(r.wsr)  || calcWSR(parseFloat(r.rate) || 50, 30),
    hoursPerWeek: parseInt(r.hoursPerWeek) || 40,
    weekAllocations: Array.isArray(r.weekAllocations)
      ? r.weekAllocations.map(v => Math.min(1, Math.max(0, parseFloat(v) || 0)))
      : Array(parseInt(data.numWeeks) || 4).fill(1),
  }));
  return { roles, numWeeks: parseInt(data.numWeeks) || 4, projectType: data.projectType || "" };
}

/* ═══════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════ */
function Badge({ children, color, size = 11 }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: size,
      fontWeight: 700, letterSpacing: "0.05em", fontFamily: "monospace", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function NumInput({ value, onChange, min = 0, step = 0.1, extraStyle = {}, C, highlight }) {
  return (
    <input type="number" value={value} min={min} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        background: highlight ? highlight + "18" : C.inputBg,
        border: `1px solid ${highlight || C.border}`,
        borderRadius: 6, color: C.text, padding: "4px 8px",
        fontSize: 13, width: "100%", outline: "none", textAlign: "right",
        fontFamily: "'JetBrains Mono', monospace", transition: "border 0.2s", ...extraStyle,
      }}
    />
  );
}

function RateInput({ usdValue, onUsdChange, currency, C, highlight }) {
  const displayVal = parseFloat(toFx(usdValue, currency).toFixed(2));
  const step = currency === "INR" ? 10 : 0.5;
  return (
    <NumInput value={displayVal} onChange={v => onUsdChange(r2(fromFx(v, currency)))}
      step={step} min={0} C={C} highlight={highlight} />
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
      }}>{children}</button>
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
      }}>{children}</button>
  );
}

function ApplyBtn({ onClick, children, C, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: disabled ? C.muted + "44"
          : hov ? `linear-gradient(135deg,${C.accent},${C.accent2})`
          : `linear-gradient(135deg,${C.accent}cc,${C.accent2}cc)`,
        border: "none", borderRadius: 8, color: disabled ? C.muted : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "10px 24px", fontSize: 14, fontWeight: 700,
        fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.15s",
        boxShadow: (!disabled && hov) ? `0 4px 16px ${C.accent}55` : "none",
      }}>{children}</button>
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
      fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.25s", whiteSpace: "nowrap",
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

function CurrencyBar({ currency, setCurrency, C, ratesReady }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {["USD","EUR","GBP","INR"].map(c => {
        const active = currency === c;
        return (
          <button key={c} onClick={() => setCurrency(c)} style={{
            background: active ? C.accent + "22" : "transparent",
            border: `1px solid ${active ? C.accent : C.border}`,
            borderRadius: 6, color: active ? C.accent : C.muted,
            cursor: "pointer", padding: "4px 10px", fontSize: 12,
            fontWeight: 600, transition: "all 0.15s", position: "relative",
          }}>
            {c}
            {c === "USD" && (
              <span style={{
                position: "absolute", top: -5, right: -5,
                background: C.accent2, color: "#fff", fontSize: 8,
                fontWeight: 800, borderRadius: 4, padding: "1px 3px", lineHeight: 1.4,
              }}>BASE</span>
            )}
          </button>
        );
      })}
      {currency !== "USD" && (
        <span style={{
          fontSize: 10, color: ratesReady ? C.accent2 : C.muted, fontFamily: "monospace",
          background: C.surface, border: `1px solid ${ratesReady ? C.accent2 + "44" : C.border}`,
          borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
          transition: "all 0.3s",
        }}>
          {ratesReady
            ? `1 USD = ${liveFxRates[currency]?.toFixed(4)} ${currency} · live`
            : `1 USD = ${FX_RATES[currency]} ${currency} · loading…`}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ label, open, onToggle, badge, badgeColor, C }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      marginBottom: open ? 10 : 20, paddingBottom: 8,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "transparent", border: "none", cursor: "pointer", padding: 0, color: C.text,
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20, borderRadius: 5,
          background: open ? C.accent + "22" : C.surface,
          border: `1px solid ${open ? C.accent + "66" : C.border}`,
          color: open ? C.accent : C.muted, fontSize: 9, fontWeight: 900, flexShrink: 0,
        }}>{open ? "▾" : "▸"}</span>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
          color: open ? C.text : C.muted, fontFamily: "'Space Grotesk',sans-serif",
        }}>{label}</span>
      </button>
      {badge && (
        <span style={{
          fontSize: 10, color: badgeColor || C.muted, fontFamily: "monospace", fontWeight: 600,
          background: (badgeColor || C.muted) + "18", border: `1px solid ${(badgeColor || C.muted)}33`,
          borderRadius: 4, padding: "1px 7px",
        }}>{badge}</span>
      )}
      <div style={{ flex: 1, height: 1, background: C.border, marginLeft: 4 }} />
    </div>
  );
}

const TH = (C, w, color) => ({
  padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 700,
  color: color || C.muted, letterSpacing: "0.08em", whiteSpace: "nowrap", width: w, minWidth: w,
});
const TD = { padding: "7px 10px", verticalAlign: "middle" };

/* ═══════════════════════════════════════════════
   MARGIN ENGINE
═══════════════════════════════════════════════ */
function MarginEngine({ roles, setRoles, targetMargin, setTargetMargin, stats, sym, currency, C }) {
  const [mode, setMode] = useState("wsr");
  const overallMargin = useMemo(() => {
    const rev  = stats.reduce((a, s) => a + s.revenue, 0);
    const cost = stats.reduce((a, s) => a + s.cost, 0);
    return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
  }, [stats]);
  const gap = overallMargin - targetMargin;

  const applyToAll = () => setRoles(prev => prev.map(r =>
    mode === "wsr"
      ? { ...r, wsr:  r2(r.rate / (1 - targetMargin / 100)) }
      : { ...r, rate: r2(r.wsr  * (1 - targetMargin / 100)) }
  ));
  const applyToRole = (id) => setRoles(prev => prev.map(r => {
    if (r.id !== id) return r;
    return mode === "wsr"
      ? { ...r, wsr:  r2(r.rate / (1 - targetMargin / 100)) }
      : { ...r, rate: r2(r.wsr  * (1 - targetMargin / 100)) };
  }));

  return (
    <div style={{
      background: C.engineBg, border: `1.5px solid ${C.accent}44`,
      borderRadius: 14, padding: "20px 22px", marginBottom: 24,
      boxShadow: `0 0 0 1px ${C.accent}22, ${C.shadow}`,
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>🎯</span>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:C.text }}>Margin Engine</div>
            <div style={{ fontSize:11, color:C.muted }}>Set target · reverse-engineer WSR or CBR</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, letterSpacing:"0.06em", marginBottom:2 }}>CURRENT</div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:800, color:marginColor(overallMargin,targetMargin,C) }}>
              {overallMargin.toFixed(1)}%
            </span>
          </div>
          <div style={{ fontSize:20, color:C.muted }}>→</div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, letterSpacing:"0.06em", marginBottom:2 }}>TARGET</div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <input type="number" value={targetMargin} min={0} max={99} step={1}
                onChange={e => setTargetMargin(parseFloat(e.target.value)||0)}
                style={{
                  background:C.inputBg, border:`2px solid ${C.accent}`,
                  borderRadius:8, color:C.accent, padding:"4px 8px",
                  fontSize:18, fontWeight:800, width:72, outline:"none",
                  textAlign:"center", fontFamily:"'JetBrains Mono',monospace",
                }}
              />
              <span style={{ color:C.accent, fontSize:18, fontWeight:800 }}>%</span>
            </div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, letterSpacing:"0.06em", marginBottom:2 }}>GAP</div>
            <Badge color={gap>=0?C.success:C.danger} size={14}>{fmtP(gap)}</Badge>
          </div>
        </div>
      </div>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ fontSize:12, color:C.muted, fontWeight:600 }}>Solve for:</div>
        {[
          { key:"wsr", label:"🔧 Adjust WSR", desc:"Keep CBR fixed" },
          { key:"rate",label:"🔧 Adjust CBR",  desc:"Keep WSR fixed" },
        ].map(opt=>(
          <button key={opt.key} onClick={()=>setMode(opt.key)} style={{
            background: mode===opt.key ? C.accent+"22" : "transparent",
            border:`1.5px solid ${mode===opt.key?C.accent:C.border}`,
            borderRadius:8, color:mode===opt.key?C.accent:C.muted,
            cursor:"pointer", padding:"6px 14px", fontSize:12, fontWeight:600,
            fontFamily:"'Space Grotesk',sans-serif", transition:"all 0.15s",
          }}>
            {opt.label}<span style={{fontSize:10,marginLeft:6,opacity:0.7}}>({opt.desc})</span>
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted }}>
            {mode==="wsr" ? `WSR = CBR ÷ (1 − ${targetMargin}%)` : `CBR = WSR × (1 − ${targetMargin}%)`}
          </span>
          <ApplyBtn onClick={applyToAll} C={C}>Apply to All Roles →</ApplyBtn>
        </div>
      </div>
      <div style={{ marginTop:14, display:"flex", gap:8, flexWrap:"wrap" }}>
        {roles.map((r,i) => {
          const s = stats[i]; const mc = marginColor(s.margin,targetMargin,C);
          return (
            <div key={r.id} style={{
              background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
              padding:"8px 12px", display:"flex", alignItems:"center", gap:10, flex:"1 1 170px",
            }}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:C.text}}>{r.name}</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>
                  {fmtRate(r.rate,sym,currency)} CBR → {fmtRate(r.wsr,sym,currency)} WSR &nbsp;
                  <span style={{color:mc,fontWeight:700}}>{s.margin.toFixed(1)}%</span>
                </div>
              </div>
              <button onClick={()=>applyToRole(r.id)} style={{
                background:C.accent+"22", border:`1px solid ${C.accent}44`,
                borderRadius:6, color:C.accent, cursor:"pointer",
                padding:"4px 10px", fontSize:11, fontWeight:600,
                fontFamily:"'Space Grotesk',sans-serif", whiteSpace:"nowrap",
              }}>Apply</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AI MARGIN COMMENTARY
═══════════════════════════════════════════════ */
function MarginCommentary({ roles, stats, totalCostUSD, totalRevenueUSD, overallMargin, targetMargin, sym, currency, apiKey, C }) {
  const [commentary, setCommentary] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!apiKey) { setCommentary("⚠️ Please enter your Anthropic API key in the Intake page."); return; }
    setLoading(true); setCommentary("");
    try {
      const summary = roles.map((r, i) => {
        const s = stats[i];
        return `${r.name}: CBR ${fmtRate(r.rate,"$","USD")}/h, WSR ${fmtRate(r.wsr,"$","USD")}/h, ${s.hours}h total, margin ${s.margin.toFixed(1)}%`;
      }).join("\n");
      const text = await callClaude(apiKey, [{
        role: "user",
        content: `You are a resource planning advisor. Analyse this project plan and give a concise 3-4 sentence plain English commentary. Focus on margin health, risks, and one actionable recommendation. Be direct, no fluff.\n\nTarget margin: ${targetMargin}%\nOverall margin: ${overallMargin.toFixed(1)}%\nTotal cost: $${Math.round(totalCostUSD)}\nTotal revenue: $${Math.round(totalRevenueUSD)}\n\nRole breakdown:\n${summary}`,
      }], 600);
      setCommentary(text);
    } catch (e) { setCommentary(`❌ Error: ${e.message}`); }
    setLoading(false);
  }

  return (
    <div style={{
      background: C.engineBg, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "16px 20px", marginBottom: 20,
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: commentary ? 12 : 0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{fontSize:16}}>💬</span>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:C.text}}>AI Commentary</div>
            <div style={{fontSize:11,color:C.muted}}>Plain English analysis of your numbers</div>
          </div>
        </div>
        <button onClick={generate} disabled={loading} style={{
          background: loading ? "transparent" : `linear-gradient(135deg,${C.accent}cc,${C.accent2}cc)`,
          border: loading ? `1px solid ${C.border}` : "none",
          borderRadius: 8, color: loading ? C.muted : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
          padding: "7px 16px", fontSize: 12, fontWeight: 700,
          fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.15s",
        }}>
          {loading ? "⏳ Analysing..." : "✨ Generate"}
        </button>
      </div>
      {commentary && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "12px 16px", marginTop: 12,
          fontSize: 13, lineHeight: 1.7, color: C.text,
        }}>{commentary}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SMART ROLE SUGGESTER
═══════════════════════════════════════════════ */
function RoleSuggester({ roles, setRoles, numWeeks, targetMargin, projectType, apiKey, C }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [projectDesc, setProjectDesc] = useState(projectType || "");

  async function suggest() {
    if (!apiKey) { alert("Please enter your Anthropic API key in the Intake page."); return; }
    setLoading(true); setSuggestions(null);
    try {
      const existing = roles.map(r => r.name).join(", ");
      const text = await callClaude(apiKey, [{
        role: "user",
        content: `You are a resource planning expert. For this project, suggest missing roles and flag any gaps. Return ONLY valid JSON, no other text.

Project type: ${projectDesc || "software delivery project"}
Existing roles: ${existing}
Number of weeks: ${numWeeks}
Target margin: ${targetMargin}%

Return JSON format:
{
  "suggestions": [
    { "name": "Role Name", "reason": "Why this role is needed", "rate": 60, "wsr": 85, "hoursPerWeek": 40, "weekAllocations": [0.5,0.5,0.5,0.5] }
  ],
  "gaps": ["gap 1", "gap 2"],
  "observation": "one sentence overall observation"
}`,
      }], 800);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) setSuggestions(JSON.parse(match[0]));
    } catch (e) { alert(`Error: ${e.message}`); }
    setLoading(false);
  }

  function addRole(s) {
    setRoles(prev => [...prev, {
      id: nextId++, name: s.name,
      rate: parseFloat(s.rate) || 50,
      wsr:  parseFloat(s.wsr)  || calcWSR(parseFloat(s.rate) || 50, targetMargin),
      hoursPerWeek: parseInt(s.hoursPerWeek) || 40,
      weekAllocations: Array.isArray(s.weekAllocations) ? s.weekAllocations : Array(numWeeks).fill(1),
    }]);
  }

  return (
    <div style={{
      background: C.engineBg, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "16px 20px", marginBottom: 20,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>🤖</span>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:C.text}}>Smart Role Suggester</div>
          <div style={{fontSize:11,color:C.muted}}>AI identifies missing roles for your project</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" value={projectDesc} onChange={e=>setProjectDesc(e.target.value)}
          placeholder="Describe your project (e.g. e-commerce migration, CRM rollout...)"
          style={{
            flex:1, minWidth:200, background:C.inputBg, border:`1px solid ${C.border}`,
            borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13,
            outline:"none", fontFamily:"'Space Grotesk',sans-serif",
          }}
        />
        <button onClick={suggest} disabled={loading} style={{
          background: loading ? "transparent" : `linear-gradient(135deg,${C.accent}cc,${C.accent2}cc)`,
          border: loading ? `1px solid ${C.border}` : "none",
          borderRadius: 8, color: loading ? C.muted : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
          padding: "8px 18px", fontSize: 12, fontWeight: 700,
          fontFamily: "'Space Grotesk',sans-serif", whiteSpace:"nowrap",
        }}>{loading ? "⏳ Thinking..." : "✨ Suggest Roles"}</button>
      </div>
      {suggestions && (
        <div style={{marginTop:14}}>
          {suggestions.observation && (
            <div style={{
              background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
              padding:"10px 14px", marginBottom:10, fontSize:12, color:C.text, lineHeight:1.6,
            }}>💡 {suggestions.observation}</div>
          )}
          {suggestions.gaps?.length > 0 && (
            <div style={{marginBottom:10,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Gaps identified:</span>
              {suggestions.gaps.map((g,i)=><Badge key={i} color={C.warning}>{g}</Badge>)}
            </div>
          )}
          {suggestions.suggestions?.map((s,i)=>(
            <div key={i} style={{
              background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
              padding:"10px 14px", marginBottom:8,
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
            }}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text}}>{s.name}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.reason}</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginTop:2}}>
                  ${s.rate}/h CBR · ${s.wsr}/h WSR
                </div>
              </div>
              <button onClick={()=>addRole(s)} style={{
                background:C.accent2+"22", border:`1px solid ${C.accent2}44`,
                borderRadius:6, color:C.accent2, cursor:"pointer",
                padding:"6px 12px", fontSize:12, fontWeight:700,
                fontFamily:"'Space Grotesk',sans-serif", whiteSpace:"nowrap",
              }}>+ Add Role</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAGE 1 — INTAKE (always light mode)
═══════════════════════════════════════════════ */
const FILE_TYPE_BADGES = [
  { ext: "PNG", label: "Image", bg: "#fff8e6", color: "#d97706" },
  { ext: "JPG", label: "Image", bg: "#fef0f0", color: "#dc2626" },
  { ext: "GIF", label: "Image", bg: "#fdf4ff", color: "#9333ea" },
  null,
  { ext: "CSV", label: "Data",  bg: "#edfff6", color: "#059669" },
  { ext: "TXT", label: "Data",  bg: "#f0f4ff", color: "#4f46e5" },
  { ext: "XLS", label: "Excel", bg: "#e8f5e9", color: "#2e7d32" },
];
const EXT_COLORS = {
  png:  { bg: "#fff8e6", color: "#d97706" },
  jpg:  { bg: "#fef0f0", color: "#dc2626" },
  jpeg: { bg: "#fef0f0", color: "#dc2626" },
  gif:  { bg: "#fdf4ff", color: "#9333ea" },
  webp: { bg: "#f0f4ff", color: "#4f46e5" },
  csv:  { bg: "#edfff6", color: "#059669" },
  xlsx: { bg: "#e8f5e9", color: "#2e7d32" },
  txt:  { bg: "#f0f4ff", color: "#4f46e5" },
};


/* ═══════════════════════════════════════════════
   LANDING PAGE (calm.com style)
═══════════════════════════════════════════════ */
const landingKeyframes = `
  @keyframes breatheOuter {
    0%,100% { transform:translate(-50%,-50%) scale(1); opacity:.5; }
    50%      { transform:translate(-50%,-50%) scale(1.12); opacity:.85; }
  }
  @keyframes breatheInner {
    0%,100% { transform:translate(-50%,-50%) scale(1); opacity:.6; }
    50%      { transform:translate(-50%,-50%) scale(1.1); opacity:.95; }
  }
  @keyframes iconFloat {
    0%,100% { transform:translateY(0); }
    50%      { transform:translateY(-6px); }
  }
  @keyframes landingNameFade {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes landingFadeOut {
    from { opacity:1; }
    to   { opacity:0; }
  }
`;

function LandingPage({ onEnter }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = landingKeyframes;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleClick = () => {
    setExiting(true);
    setTimeout(() => onEnter(), 500);
  };

  return (
    <div onClick={handleClick} style={{
      width:"100vw", height:"100vh", background:"#dde8f2",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      cursor:"pointer", position:"relative", overflow:"hidden",
      animation: exiting ? "landingFadeOut 0.5s ease forwards" : "none",
      userSelect:"none",
    }}>
      {/* Outer breathing ring */}
      <div style={{
        position:"absolute", width:360, height:360, borderRadius:"50%",
        background:"rgba(255,255,255,0.3)", top:"50%", left:"50%",
        animation:"breatheOuter 5s ease-in-out infinite", pointerEvents:"none",
      }}/>
      {/* Inner breathing ring */}
      <div style={{
        position:"absolute", width:240, height:240, borderRadius:"50%",
        background:"rgba(255,255,255,0.42)", top:"50%", left:"50%",
        animation:"breatheInner 5s ease-in-out infinite 0.3s", pointerEvents:"none",
      }}/>
      {/* Floating icon */}
      <div style={{ position:"relative", zIndex:2, animation:"iconFloat 5s ease-in-out infinite" }}>
        <div style={{
          width:88, height:88, background:"#1a3356", borderRadius:22,
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 12px 40px rgba(26,51,86,0.2)",
        }}>
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
            <rect x="5"  y="24" width="10" height="20" rx="2.5" fill="#4caf7d"/>
            <rect x="20" y="14" width="10" height="30" rx="2.5" fill="#e8453c"/>
            <rect x="35" y="7"  width="10" height="37" rx="2.5" fill="#2196f3"/>
          </svg>
        </div>
      </div>
      {/* App name */}
      <div style={{
        position:"relative", zIndex:2, marginTop:22,
        fontSize:11, letterSpacing:"0.16em", textTransform:"uppercase",
        color:"#8aaac4", fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif",
        fontWeight:500, animation:"landingNameFade 1.2s ease 0.4s both",
      }}>
        Resource Effort Planner
      </div>
    </div>
  );
}

// Intake always uses light palette — dark toggle only affects the planner
const IL = THEMES.light;

function IntakePage({ onLoad, onSkip, apiKey, setApiKey, dark, setDark }) {
  const [file, setFile]               = useState(null);
  const [pasteText, setPasteText]     = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [dragOver, setDragOver]       = useState(false);
  const fileRef                       = useRef();

  const ACCEPTED = ".png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.xlsx,.xls";

  function handleFile(f) { if (!f) return; setFile(f); setError(""); }
  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  }

  const isImage  = file && file.type.startsWith("image/");
  const isExcel  = file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"));
  const fileExt  = file ? file.name.split(".").pop().toLowerCase() : "";
  const fileClr  = EXT_COLORS[fileExt] || { bg: "#f1f5f9", color: "#64748b" };
  const fileSize = file
    ? (file.size > 1048576 ? (file.size / 1048576).toFixed(1) + " MB" : Math.round(file.size / 1024) + " KB")
    : "";

  const canSubmit = !!file || pasteText.trim().length > 0;
  const [analysisStep, setAnalysisStep] = useState(-1); // -1=idle, 0-3=steps, 4=done
  const [parsedResult, setParsedResult] = useState(null);

  async function analyse() {
    setError("");
    if (!apiKey) { setError("Please enter your Anthropic API key below."); return; }
    if (!canSubmit) { setError("Please upload a file or paste your table first."); return; }
    setLoading(true);
    setAnalysisStep(0);
    try {
      const systemPrompt = `You are a resource planning data extractor. Extract role data and return ONLY valid JSON, no other text, no markdown fences.

Return this exact format:
{
  "roles": [
    { "name": "Role Name", "rate": 50, "wsr": 71.43, "hoursPerWeek": 40, "weekAllocations": [0.5,0.5,0.5,0.5] }
  ],
  "numWeeks": 4,
  "projectType": "brief description"
}

Rules:
- rate = CBR per hour in USD. Convert if needed.
- wsr = WSR per hour in USD. If not given, calculate as rate / 0.70.
- weekAllocations = array of 0-1 values per week.
- If week data not given, fill weekAllocations with 1 for each week.
- If numWeeks not clear, use 4.`;

      let messages;
      if (file && isImage) {
        const b64 = await fileToBase64(file);
        messages = [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: file.type, data: b64 } },
          { type: "text", text: `${systemPrompt}\n\nExtract from this image. Project context: ${projectDesc || "not provided"}` },
        ]}];
      } else {
        const rawContent = file
          ? (isExcel ? await fileToExcel(file) : await fileToText(file))
          : pasteText;
        messages = [{ role: "user", content: `${systemPrompt}\n\nExtract from this data. Project context: ${projectDesc || "not provided"}\n\nData:\n${rawContent}` }];
      }

      setAnalysisStep(1);
      const text = await callClaude(apiKey, messages, 1500);
      setAnalysisStep(2);
      const parsed = parseAIResponse(text);
      if (!parsed.roles.length) throw new Error("No roles found. Try a different format.");
      setAnalysisStep(3);
      setTimeout(() => { setAnalysisStep(4); setParsedResult(parsed); setLoading(false); }, 500);
    } catch (e) {
      setError(`❌ ${e.message}`);
      setAnalysisStep(-1);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#dde8f2", color: IL.text,
      fontFamily: "'Space Grotesk','Segoe UI',sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>

      {/* ── Top bar ── */}
      <div style={{
        background: "#1a3356", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="8" width="4" height="8" rx="1" fill="#4caf7d"/>
              <rect x="7" y="5" width="4" height="11" rx="1" fill="#e8453c"/>
              <rect x="13" y="2" width="4" height="14" rx="1" fill="#2196f3"/>
            </svg>
          </div>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Resource Effort Planner</span>
        </div>
        <button onClick={onSkip} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8, color: "#8aaac4", cursor: "pointer",
            padding: "6px 14px", fontSize: 12, fontFamily: "'Space Grotesk',sans-serif",
          }}>Skip → Open blank planner</button>
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "36px 20px",
      }}>
        <div style={{ width: "100%", maxWidth: 620 }}>

          {/* Side by side zones */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>

            {/* Drop zone */}
            <div
              onClick={() => !file && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                background: "#fff",
                border: `2px ${file ? "solid" : "dashed"} ${dragOver ? "#3b82f6" : file ? "#059669" : "#c5d6e8"}`,
                borderRadius: 16, padding: "24px 16px",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 16,
                cursor: file ? "default" : "pointer",
                transition: "all 0.15s",
                background: dragOver ? "#f0f8ff" : file ? "#f0fdf8" : "#fff",
                minHeight: 200,
              }}
            >
              <input ref={fileRef} type="file" accept={ACCEPTED} style={{ display: "none" }}
                onChange={e => handleFile(e.target.files?.[0])} />

              <div style={{
                width: 46, height: 46, borderRadius: 13,
                background: file ? "#d1fae5" : dragOver ? "#dbeafe" : "#e8f0f7",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}>
                {file ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
                    <path d="M13 17V6M13 6L9 10M13 6L17 10" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 20v1a1 1 0 001 1h16a1 1 0 001-1v-1" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )}
              </div>

              {file ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#f0fdf8", border: "1px solid #a7f3d0",
                  borderRadius: 10, padding: "8px 12px", width: "100%",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: fileClr.bg, color: fileClr.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>{fileExt.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#065f46", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                    <div style={{ fontSize: 10, color: "#6ee7b7" }}>{fileSize}</div>
                  </div>
                  <div onClick={e => { e.stopPropagation(); setFile(null); }}
                    style={{ color: "#6ee7b7", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                  {FILE_TYPE_BADGES.map((ft, i) => ft === null ? (
                    <div key="sep" style={{ width: 1, height: 28, background: "#e2eaf2", margin: "0 2px", alignSelf: "center" }}/>
                  ) : (
                    <div key={ft.ext} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{
                        width: 33, height: 33, borderRadius: 8,
                        background: ft.bg, color: ft.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700,
                      }}>{ft.ext}</div>
                      <span style={{ fontSize: 8, color: "#94a3b8", fontWeight: 500 }}>{ft.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Paste zone */}
            <div style={{
              background: "#fff", border: "2px dashed #c5d6e8",
              borderRadius: 16, padding: "24px 16px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              minHeight: 200,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 13, background: "#e8f0f7",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
                  <rect x="7" y="3" width="10" height="4" rx="1.5" stroke="#3b82f6" strokeWidth="1.8"/>
                  <rect x="5" y="6" width="16" height="17" rx="2.5" stroke="#3b82f6" strokeWidth="1.8"/>
                  <path d="M9 13h8M9 16.5h5" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={"Paste table data here…\n\nRole  Rate  W1  W2  W3\nSME   275   0.1 0.1 0.1\nBA    55    0.5 0.5 0.5"}
                style={{
                  width: "100%", flex: 1, minHeight: 100,
                  border: `1px solid ${pasteText ? "#059669" : "#d0dbe8"}`,
                  borderRadius: 10, background: "#f8fafc",
                  resize: "none", padding: "8px 10px",
                  fontSize: 11, color: "#334155",
                  fontFamily: "'JetBrains Mono',monospace",
                  outline: "none", lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
            </div>
          </div>



          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 12, background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626",
            }}>{error}</div>
          )}

          {/* CTA — hidden during analysis */}
          {analysisStep === -1 && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <ApplyBtn onClick={analyse} disabled={!canSubmit} C={IL}>
                ✨ Analyse &amp; Load into Planner →
              </ApplyBtn>
            </div>
          )}

          {/* STEP-BY-STEP ANALYSIS PANEL */}
          {analysisStep >= 0 && (
            <div style={{
              background: "#fff", border: "1px solid #dde3f0",
              borderRadius: 16, overflow: "hidden", marginBottom: 20,
            }}>
              {/* Steps */}
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { icon: "📂", label: "Reading your file",         sub: ["Preparing data…",           "File ready · sending to AI"] },
                  { icon: "🤖", label: "AI analysing structure",    sub: ["Waiting…",                  "Identifying roles, rates and weeks…"] },
                  { icon: "📊", label: "Extracting role data",      sub: ["Waiting…",                  "Parsing allocations and hours…"] },
                  { icon: "✅", label: "Ready to load",             sub: ["Waiting…",                  "Review and confirm below"] },
                ].map((step, i) => {
                  const isDone   = analysisStep > i;
                  const isActive = analysisStep === i;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      opacity: isDone || isActive ? 1 : 0.3,
                      transition: "opacity 0.4s",
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13,
                        background: isDone ? "#d1fae5" : isActive ? "#dbeafe" : "#f1f5f9",
                        border: `1.5px solid ${isDone ? "#a7f3d0" : isActive ? "#93c5fd" : "#e2e8f0"}`,
                        animation: isActive ? "pulse 1s ease-in-out infinite" : "none",
                      }}>{step.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? "#065f46" : isActive ? "#1d4ed8" : "#334155" }}>
                          {step.label}
                        </div>
                        <div style={{ fontSize: 11, color: isDone ? "#6ee7b7" : isActive ? "#93c5fd" : "#94a3b8", marginTop: 1 }}>
                          {isDone || isActive ? step.sub[1] : step.sub[0]}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Role preview cards — shown after step 4 */}
              {analysisStep === 4 && parsedResult && (
                <div style={{ padding: "14px 18px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                    {parsedResult.roles.length} roles detected · {parsedResult.numWeeks} weeks
                    {parsedResult.projectType ? ` · ${parsedResult.projectType}` : ""}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 14 }}>
                    {parsedResult.roles.map((r, i) => (
                      <div key={i} style={{
                        background: "#fff", border: "1px solid #e2e8f0",
                        borderRadius: 10, padding: "10px 12px",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>{r.name}</div>
                        {[
                          ["CBR", `$${r.rate}/h`],
                          ["WSR", `$${r.wsr}/h`],
                          ["Alloc", `${r.weekAllocations?.[0] ?? 1} / wk`],
                        ].map(([lbl, val]) => (
                          <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                            <span>{lbl}</span>
                            <span style={{ color: "#334155", fontWeight: 600, fontFamily: "monospace" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => onLoad(parsedResult, projectDesc)} style={{
                    width: "100%", background: "#059669", color: "#fff", border: "none",
                    borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    fontFamily: "'Space Grotesk',sans-serif", transition: "background 0.15s",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Load into Planner
                  </button>
                  <button onClick={() => { setAnalysisStep(-1); setParsedResult(null); }} style={{
                    width: "100%", background: "transparent", border: "1px solid #d0dbe8",
                    borderRadius: 10, padding: "8px", fontSize: 12, color: "#64748b",
                    cursor: "pointer", marginTop: 6, fontFamily: "'Space Grotesk',sans-serif",
                  }}>
                    Edit before loading
                  </button>
                </div>
              )}
            </div>
          )}

          <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }`}</style>

          {/* API key */}
          <div style={{
            background: "#fff", border: "1px solid #dde3f0",
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 12, color: "#7c86a2", marginBottom: 8, fontWeight: 600 }}>
              🔑 Anthropic API Key
              <span style={{ fontWeight: 400, marginLeft: 6 }}>
                — needed for AI features. Get one at{" "}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                  console.anthropic.com
                </a>
              </span>
            </div>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: "100%", background: "#f0f4fb",
                border: `1px solid ${apiKey ? "#059669" : "#dde3f0"}`,
                borderRadius: 8, color: IL.text, padding: "8px 12px", fontSize: 13,
                outline: "none", fontFamily: "'JetBrains Mono',monospace", boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 11, color: "#7c86a2", marginTop: 6 }}>
              🔒 Your key is never stored or sent anywhere except directly to Anthropic's API.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAGE 2 — PLANNER
═══════════════════════════════════════════════ */
function PlannerPage({ roles, setRoles, numWeeks, setNumWeeks, loadedFromAI, projectType, apiKey, onBack, onGenerateSOW, onSOWLibrary, dark, setDark, C }) {
  const [currency, setCurrency]           = useState("USD");
  const [ratesReady, setRatesReady]       = useState(false);

  useEffect(() => {
    fetchLiveRates().then(() => setRatesReady(true));
  }, []);
  const [weekLabels, setWeekLabels]       = useState(() => Array.from({length: numWeeks}, (_,i) => `W${i+1}`));
  const [editLabel, setEditLabel]         = useState(null);
  const [sprintHours, setSH]              = useState(40);
  const [showSettings, setShowSet]        = useState(false);
  const [showTable, setShowTable]         = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSuggester, setShowSuggester] = useState(false);
  const [showAI, setShowAI]               = useState(false);
  const [expandedRows, setExpandedRows]   = useState({});
  const [targetMargin, setTM]             = useState(30);
  const [marginMode, setMarginMode]       = useState("wsr");
  const sym = SYMBOLS[currency];

  function changeWeeks(n) {
    const nw = Math.max(1, Math.min(52, n));
    setNumWeeks(nw);
    setWeekLabels(p => { const a=[...p]; while(a.length<nw) a.push(`W${a.length+1}`); return a.slice(0,nw); });
    setRoles(p => p.map(r => {
      const a=[...r.weekAllocations];
      while(a.length<nw) a.push(a[a.length-1]??1);
      return {...r, weekAllocations:a.slice(0,nw)};
    }));
  }

  const upd  = (id,f,v) => setRoles(p=>p.map(r=>r.id===id?{...r,[f]:v}:r));
  const updW = (id,wi,v) => setRoles(p=>p.map(r=>{
    if(r.id!==id) return r; const a=[...r.weekAllocations]; a[wi]=v; return {...r,weekAllocations:a};
  }));
  const addR = () => setRoles(p=>[...p,{
    id:nextId++, name:"New Role",
    rate:fromFx(50,currency), wsr:fromFx(r2(50/(1-targetMargin/100)),currency),
    hoursPerWeek:sprintHours, weekAllocations:Array(numWeeks).fill(1),
  }]);
  const delR  = id => setRoles(p=>p.filter(r=>r.id!==id));
  const fillW = (id,v) => setRoles(p=>p.map(r=>r.id===id?{...r,weekAllocations:Array(numWeeks).fill(v)}:r));
  const toggleRow = (id) => setExpandedRows(p=>({...p,[id]:!p[id]}));

  const applyMargin = (id) => setRoles(prev => prev.map(r => {
    if (id && r.id !== id) return r;
    return marginMode === "wsr"
      ? { ...r, wsr: r2(r.rate / (1 - targetMargin / 100)) }
      : { ...r, rate: r2(r.wsr * (1 - targetMargin / 100)) };
  }));

  const stats = useMemo(()=>roles.map(r=>{
    const total=r.weekAllocations.slice(0,numWeeks).reduce((a,b)=>a+b,0);
    const hours=total*(r.hoursPerWeek??sprintHours);
    const cost=hours*r.rate; const revenue=hours*r.wsr;
    return {total,hours,cost,revenue,margin:revenue>0?((revenue-cost)/revenue)*100:0};
  }),[roles,numWeeks,sprintHours]);

  const totalCostUSD    = stats.reduce((a,s)=>a+s.cost,0);
  const totalRevenueUSD = stats.reduce((a,s)=>a+s.revenue,0);
  const totalHours      = stats.reduce((a,s)=>a+s.hours,0);
  const overallMargin   = totalRevenueUSD>0?((totalRevenueUSD-totalCostUSD)/totalRevenueUSD)*100:0;
  const gap             = overallMargin - targetMargin;
  const BAR_COLORS      = [C.accent,C.accent2,C.accent3,"#c084fc","#f472b6"];

  const gapColor = gap >= 5 ? C.success : gap >= 0 ? C.accent2 : gap >= -5 ? C.warning : C.danger;
  const gapLabel = (gap >= 0 ? "+" : "") + gap.toFixed(1) + "%";

  return (
    <div style={{
      minHeight:"100vh", background:C.bg, color:C.text,
      fontFamily:"'Space Grotesk','Segoe UI',sans-serif",
      position:"relative", transition:"background 0.25s,color 0.25s",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>

      {/* ── TOP BAR ── */}
      <div style={{
        padding:"12px 24px", display:"flex", alignItems:"center",
        justifyContent:"space-between", borderBottom:`1px solid ${C.border}`,
        background:C.card, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{
            background:"transparent", border:`1px solid ${C.border}`,
            borderRadius:8, color:C.muted, cursor:"pointer",
            padding:"5px 12px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif",
            display:"flex", alignItems:"center", gap:5, transition:"all 0.15s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}
          >← Intake</button>
          <div style={{width:1,height:22,background:C.border}}/>
          <div style={{
            width:28,height:28,borderRadius:7,fontSize:14,
            background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>⚡</div>
          <span style={{fontWeight:700,fontSize:14}}>Resource Effort Planner</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <ThemeToggle dark={dark} setDark={setDark} C={C}/>
          <CurrencyBar currency={currency} setCurrency={setCurrency} C={C} ratesReady={ratesReady}/>
          <button onClick={onSOWLibrary} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", padding:"5px 11px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif", whiteSpace:"nowrap" }}>📄 SOW Library</button>
          <button onClick={onGenerateSOW} style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:7, color:"#fff", cursor:"pointer", padding:"6px 14px", fontSize:12, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif", whiteSpace:"nowrap" }}>+ Generate SOW</button>
          <IconBtn onClick={()=>setShowSet(s=>!s)} title="Settings" color={C.accent} C={C}>⚙</IconBtn>
        </div>
      </div>

      <div style={{padding:"20px 24px 80px"}}>

        {/* ── SETTINGS ── */}
        {showSettings && (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:20,display:"flex",gap:24,flexWrap:"wrap",alignItems:"flex-end",boxShadow:C.shadow}}>
            <div>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:"0.06em",marginBottom:6}}>WEEKS</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <IconBtn onClick={()=>changeWeeks(numWeeks-1)} color={C.danger} C={C}>−</IconBtn>
                <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,minWidth:28,textAlign:"center"}}>{numWeeks}</span>
                <IconBtn onClick={()=>changeWeeks(numWeeks+1)} color={C.accent2} C={C}>+</IconBtn>
              </div>
            </div>
            <div style={{minWidth:130}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:"0.06em",marginBottom:6}}>DEFAULT HRS/WEEK</div>
              <NumInput value={sprintHours} onChange={setSH} min={1} step={1} C={C}/>
            </div>
          </div>
        )}

        {/* ── SUMMARY CARDS ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:12}}>
          {[
            {label:"Total Revenue", value:fmt(totalRevenueUSD,sym,currency), color:C.accent2, icon:"📈", pct:Math.min(100,totalRevenueUSD/200000*100)},
            {label:"Total Cost",    value:fmt(totalCostUSD,sym,currency),    color:C.accent3, icon:"💸", pct:Math.min(100,totalCostUSD/200000*100)},
            {label:"Overall Margin",value:`${overallMargin.toFixed(1)}%`,   color:gapColor,  icon:"🎯", pct:Math.min(100,overallMargin)},
            {label:"Total Hours",   value:`${totalHours.toLocaleString()}h`, color:C.accent,  icon:"⏱", pct:Math.min(100,totalHours/1000*100)},
            {label:"Roles",         value:roles.length,                       color:C.muted,   icon:"👥", pct:Math.min(100,roles.length/10*100)},
          ].map(card=>(
            <div key={card.label} style={{
              background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
              padding:"14px 16px", boxShadow:C.shadow, position:"relative", overflow:"hidden",
              transition:"border-color 0.2s",
            }}>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em",marginBottom:6,textTransform:"uppercase"}}>{card.icon} {card.label}</div>
              <div style={{fontSize:22,fontWeight:700,color:card.color,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-1px",lineHeight:1}}>{card.value}</div>
              {card.label === "Overall Margin" && (
                <div style={{fontSize:10,color:C.muted,marginTop:4}}>{gapLabel} vs target</div>
              )}
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:C.border}}>
                <div style={{height:"100%",width:`${card.pct}%`,background:card.color,transition:"width 0.5s"}}/>
              </div>
            </div>
          ))}
        </div>

        {/* ── MARGIN ENGINE (inline) ── */}
        <div style={{
          background:C.engineBg, border:`1px solid ${C.accent}33`,
          borderRadius:12, padding:"14px 18px", marginBottom:20,
          display:"flex", alignItems:"center", gap:16, flexWrap:"wrap",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em",marginBottom:3,textTransform:"uppercase"}}>Current</div>
              <span style={{fontSize:26,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-1px",color:gapColor}}>{overallMargin.toFixed(1)}%</span>
            </div>
            <div style={{fontSize:18,color:C.border}}>→</div>
            <div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em",marginBottom:3,textTransform:"uppercase"}}>Target</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="number" value={targetMargin} min={0} max={99} step={1}
                  onChange={e=>setTM(parseFloat(e.target.value)||0)}
                  style={{background:C.inputBg,border:`2px solid ${C.accent}`,borderRadius:7,color:C.accent,padding:"3px 6px",fontSize:20,fontWeight:800,width:68,outline:"none",textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}}
                />
                <span style={{color:C.accent,fontSize:20,fontWeight:800}}>%</span>
              </div>
            </div>
            <div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em",marginBottom:3,textTransform:"uppercase"}}>Gap</div>
              <span style={{fontSize:13,fontWeight:700,fontFamily:"monospace",padding:"3px 10px",borderRadius:5,background:gapColor+"22",color:gapColor,border:`1px solid ${gapColor}44`}}>{gapLabel}</span>
            </div>
          </div>

          <div style={{flex:1,minWidth:200}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:5}}>
              <span>0%</span>
              <span>Target {targetMargin}% · Current {overallMargin.toFixed(1)}%</span>
              <span>100%</span>
            </div>
            <div style={{height:7,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:9}}>
              <div style={{height:"100%",width:`${Math.min(100,overallMargin)}%`,background:gapColor,borderRadius:4,transition:"width 0.4s,background 0.4s"}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              {[{key:"wsr",label:"🔧 Adjust WSR"},{key:"rate",label:"🔧 Adjust CBR"}].map(opt=>(
                <button key={opt.key} onClick={()=>setMarginMode(opt.key)} style={{
                  flex:1,background:marginMode===opt.key?C.accent+"22":"transparent",
                  border:`1px solid ${marginMode===opt.key?C.accent:C.border}`,
                  borderRadius:6,color:marginMode===opt.key?C.accent:C.muted,
                  cursor:"pointer",padding:"5px 6px",fontSize:10,fontFamily:"'Space Grotesk',sans-serif",transition:"all 0.15s",
                }}>{opt.label}</button>
              ))}
              <button onClick={()=>applyMargin(null)} style={{
                background:`linear-gradient(135deg,${C.accent}cc,${C.accent2}cc)`,
                border:"none",borderRadius:6,color:"#fff",cursor:"pointer",
                padding:"5px 14px",fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",whiteSpace:"nowrap",
              }}>Apply to All →</button>
            </div>
          </div>
        </div>

        {/* ── RESOURCE LOADING ── */}
        <SectionHeader label="RESOURCE LOADING" open={showTable} onToggle={()=>setShowTable(s=>!s)} badge={`${roles.length} roles · ${numWeeks} weeks`} C={C}/>
        {showTable && (<>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflowX:"auto",marginBottom:14,boxShadow:C.shadow}}>
            <table style={{borderCollapse:"collapse",tableLayout:"auto"}}>
              <thead>
                <tr style={{background:C.surface}}>
                  {/* LEFT FROZEN */}
                  <th style={{...TH(C,110),position:"sticky",left:0,zIndex:4,background:C.surface}}>ROLE</th>
                  <th style={{...TH(C,72),position:"sticky",left:110,zIndex:4,background:C.surface}}>CBR ({sym})</th>
                  <th style={{...TH(C,72,C.accent2),position:"sticky",left:182,zIndex:4,background:C.surface}}>WSR ({sym})</th>
                  <th style={{...TH(C,70,marginColor(overallMargin,targetMargin,C)),position:"sticky",left:254,zIndex:4,background:C.surface,boxShadow:`4px 0 8px ${C.bg}aa`}}>MARGIN</th>
                  {/* SCROLLABLE WEEKS */}
                  {weekLabels.map((w,i)=>(
                    <th key={i} style={{...TH(C,54),minWidth:54,maxWidth:54,textAlign:"center",cursor:"pointer"}}
                      onClick={()=>setEditLabel(i)}>
                      {editLabel===i?(
                        <input autoFocus value={w}
                          onChange={e=>setWeekLabels(p=>p.map((l,j)=>j===i?e.target.value:l))}
                          onBlur={()=>setEditLabel(null)}
                          onKeyDown={e=>e.key==="Enter"&&setEditLabel(null)}
                          style={{background:"transparent",border:"none",color:C.accent,width:40,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,outline:`1px solid ${C.accent}`,borderRadius:3,padding:"1px 3px"}}
                        />
                      ):(
                        <span style={{borderBottom:`1px dashed ${C.border}`}}>{w}</span>
                      )}
                    </th>
                  ))}
                  {/* RIGHT FROZEN */}
                  <th style={{...TH(C,66,C.accent),position:"sticky",right:172,zIndex:4,background:C.surface,textAlign:"right",boxShadow:`-4px 0 8px ${C.bg}aa`}}>HRS/WK</th>
                  <th style={{...TH(C,82,C.accent),position:"sticky",right:90,zIndex:4,background:C.surface,textAlign:"right"}}>HOURS</th>
                  <th style={{...TH(C,90,C.accent3),position:"sticky",right:0,zIndex:4,background:C.surface,textAlign:"right"}}>COST</th>
                  <th style={{...TH(C,90,C.accent2),position:"sticky",right:0,zIndex:4,background:C.surface,textAlign:"right",paddingRight:8}} colSpan={2}>REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role,ri)=>{
                  const s=stats[ri]; const mc=marginColor(s.margin,targetMargin,C);
                  const expanded=!!expandedRows[role.id];
                  const rowBg = expanded ? C.surface : "transparent";
                  const stickyBg = expanded ? C.surface : C.card;
                  return (
                    <>
                      <tr key={role.id}
                        style={{borderTop:`1px solid ${C.border}`,transition:"background 0.1s",background:rowBg}}
                        onMouseEnter={e=>{e.currentTarget.style.background=C.surface; e.currentTarget.querySelectorAll(".sticky-cell").forEach(c=>c.style.background=C.surface);}}
                        onMouseLeave={e=>{e.currentTarget.style.background=rowBg; e.currentTarget.querySelectorAll(".sticky-cell").forEach(c=>c.style.background=stickyBg);}}
                      >
                        {/* LEFT FROZEN CELLS */}
                        <td className="sticky-cell" onClick={()=>toggleRow(role.id)} style={{...TD,position:"sticky",left:0,zIndex:2,background:stickyBg,cursor:"pointer",minWidth:110}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:9,color:C.muted,display:"inline-block",transition:"transform 0.2s",transform:expanded?"rotate(90deg)":"rotate(0deg)",flexShrink:0}}>▶</span>
                            <span style={{fontWeight:700,fontSize:13}}>{role.name}</span>
                          </div>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",left:110,zIndex:2,background:stickyBg,minWidth:72}}>
                          <RateInput usdValue={role.rate} onUsdChange={v=>upd(role.id,"rate",v)} currency={currency} C={C}/>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",left:182,zIndex:2,background:stickyBg,minWidth:72}}>
                          <RateInput usdValue={role.wsr} onUsdChange={v=>upd(role.id,"wsr",v)} currency={currency} C={C} highlight={C.accent2}/>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",left:254,zIndex:2,background:stickyBg,minWidth:70,boxShadow:`4px 0 8px ${C.bg}aa`}}>
                          <Badge color={mc} size={12}>{s.margin.toFixed(1)}%</Badge>
                        </td>
                        {/* SCROLLABLE WEEK CELLS */}
                        {role.weekAllocations.slice(0,numWeeks).map((w,wi)=>(
                          <td key={wi} style={{...TD,minWidth:54,maxWidth:54,padding:"6px 5px"}}>
                            <NumInput value={w} onChange={v=>updW(role.id,wi,Math.min(1,Math.max(0,v)))}
                              step={0.1} C={C}
                              extraStyle={{color:w===1?C.accent2:w===0?C.muted:C.text,width:44,textAlign:"center"}}/>
                          </td>
                        ))}
                        {/* RIGHT FROZEN CELLS */}
                        <td className="sticky-cell" style={{...TD,position:"sticky",right:172,zIndex:2,background:stickyBg,minWidth:66,textAlign:"right",boxShadow:`-4px 0 8px ${C.bg}aa`}}>
                          <NumInput value={role.hoursPerWeek??sprintHours} onChange={v=>upd(role.id,"hoursPerWeek",v)} step={1} min={1} C={C} extraStyle={{width:52,textAlign:"center"}}/>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",right:90,zIndex:2,background:stickyBg,minWidth:82,textAlign:"right"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.accent,fontSize:12}}>{s.hours}h</span>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",right:0,zIndex:2,background:stickyBg,minWidth:90,textAlign:"right"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.accent3,fontSize:12}}>{fmt(s.cost,sym,currency)}</span>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",right:0,zIndex:2,background:stickyBg,minWidth:90,textAlign:"right"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.accent2,fontSize:12}}>{fmt(s.revenue,sym,currency)}</span>
                        </td>
                        <td className="sticky-cell" style={{...TD,position:"sticky",right:0,zIndex:2,background:stickyBg,paddingLeft:4,paddingRight:8}}>
                          <div style={{display:"flex",gap:2}}>
                            <IconBtn onClick={()=>fillW(role.id,role.weekAllocations[0])} title="Fill all weeks" color={C.accent} C={C}>↔</IconBtn>
                            <IconBtn onClick={()=>delR(role.id)} title="Delete role" color={C.danger} C={C}>✕</IconBtn>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={role.id+"_ex"} style={{borderTop:`1px solid ${C.border}`}}>
                          <td colSpan={4 + numWeeks + 5} style={{padding:0,background:C.surface}}>
                            <div style={{padding:"12px 16px 14px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}>
                              <div>
                                <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.06em",marginBottom:4,textTransform:"uppercase"}}>Role Name</div>
                                <TextInput value={role.name} onChange={v=>upd(role.id,"name",v)} extraStyle={{fontWeight:600}} C={C}/>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"flex-end",gridColumn:"span 2"}}>
                                <button onClick={()=>fillW(role.id,role.weekAllocations[0])} style={{background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:6,color:C.accent,cursor:"pointer",padding:"5px 10px",fontSize:11,fontFamily:"'Space Grotesk',sans-serif"}}>↔ Fill all weeks</button>
                                <button onClick={()=>applyMargin(role.id)} style={{background:C.accent2+"22",border:`1px solid ${C.accent2}44`,borderRadius:6,color:C.accent2,cursor:"pointer",padding:"5px 10px",fontSize:11,fontFamily:"'Space Grotesk',sans-serif"}}>🎯 Apply margin</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
                  <td style={{...TD,position:"sticky",left:0,zIndex:2,background:C.surface,fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.05em",minWidth:110}} colSpan={4}>TOTALS</td>
                  {Array(numWeeks).fill(null).map((_,i)=><td key={i} style={{...TD,minWidth:54}}/>)}
                  <td style={{...TD,position:"sticky",right:172,zIndex:2,background:C.surface,boxShadow:`-4px 0 8px ${C.bg}aa`}}/>
                  <td style={{...TD,position:"sticky",right:90,zIndex:2,background:C.surface,textAlign:"right"}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:C.accent,fontWeight:700}}>{totalHours}h</span></td>
                  <td style={{...TD,position:"sticky",right:0,zIndex:2,background:C.surface,textAlign:"right"}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:C.accent3}}>{fmt(totalCostUSD,sym,currency)}</span></td>
                  <td style={{...TD,position:"sticky",right:0,zIndex:2,background:C.surface,textAlign:"right"}} colSpan={2}><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:13,color:C.accent2}}>{fmt(totalRevenueUSD,sym,currency)}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:24}}>
            <button onClick={addR} style={{background:`linear-gradient(135deg,${C.accent}22,${C.accent2}22)`,border:`1px solid ${C.accent}`,color:C.accent,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Space Grotesk',sans-serif",display:"flex",alignItems:"center",gap:6}}>+ Add Role</button>
            <Btn onClick={()=>changeWeeks(numWeeks+1)} C={C} accent={C.accent2}>+ Add Week</Btn>
            {numWeeks>1&&<Btn onClick={()=>changeWeeks(numWeeks-1)} C={C} accent={C.danger}>− Remove Week</Btn>}
            <span style={{marginLeft:"auto",color:C.muted,fontSize:11}}>💡 Role/CBR/WSR/Margin frozen left · Hours/Cost/Revenue frozen right · Weeks scroll in the middle</span>
          </div>
        </>)}

        {/* ── SMART ROLE SUGGESTER ── */}
        <SectionHeader label="SMART ROLE SUGGESTER" open={showSuggester} onToggle={()=>setShowSuggester(s=>!s)} badge="AI" badgeColor={C.accent} C={C}/>
        {showSuggester && <RoleSuggester roles={roles} setRoles={setRoles} numWeeks={numWeeks} targetMargin={targetMargin} projectType={projectType} apiKey={apiKey} C={C}/>}

        {/* ── ROLE BREAKDOWN (bar chart) ── */}
        <SectionHeader label="ROLE BREAKDOWN" open={showBreakdown} onToggle={()=>setShowBreakdown(s=>!s)} badge={`${roles.length} roles`} C={C}/>
        {showBreakdown && (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 20px",marginBottom:20,boxShadow:C.shadow}}>
            <div style={{display:"flex",gap:14,marginBottom:14}}>
              {[{label:"Cost",color:C.accent3},{label:"Revenue",color:C.accent2}].map(l=>(
                <div key={l.label} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.muted}}>
                  <div style={{width:9,height:9,borderRadius:2,background:l.color}}/>
                  {l.label}
                </div>
              ))}
            </div>
            {roles.map((r,i)=>{
              const s=stats[i];
              const mc=marginColor(s.margin,targetMargin,C);
              const maxVal=Math.max(...stats.map(x=>x.revenue),1);
              const costPct=s.cost/maxVal*100;
              const revPct=s.revenue/maxVal*100;
              return (
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:36,fontSize:11,color:C.text,fontWeight:600,flexShrink:0}}>{r.name}</div>
                  <div style={{flex:1,height:26,background:C.surface,borderRadius:5,overflow:"hidden",display:"flex"}}>
                    <div style={{width:`${costPct}%`,background:C.accent3+"44",borderRight:`2px solid ${C.accent3}`,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:4,transition:"width 0.5s"}}>
                      <span style={{fontSize:9,fontWeight:700,color:C.accent3,whiteSpace:"nowrap"}}>{fmt(s.cost,sym,currency)}</span>
                    </div>
                    <div style={{width:`${revPct-costPct}%`,background:C.accent2+"22",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:4,transition:"width 0.5s"}}>
                      <span style={{fontSize:9,fontWeight:700,color:C.accent2,whiteSpace:"nowrap"}}>{fmt(s.revenue,sym,currency)}</span>
                    </div>
                  </div>
                  <div style={{width:76,textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:mc}}>{s.margin.toFixed(1)}%</div>
                    <div style={{fontSize:9,color:C.muted}}>{s.hours}h</div>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,flexWrap:"wrap",gap:8}}>
              <span>Total Cost <span style={{color:C.accent3,fontWeight:700,fontFamily:"monospace"}}>{fmt(totalCostUSD,sym,currency)}</span></span>
              <span>Total Revenue <span style={{color:C.accent2,fontWeight:700,fontFamily:"monospace"}}>{fmt(totalRevenueUSD,sym,currency)}</span></span>
              <span>Overall Margin <span style={{color:gapColor,fontWeight:700,fontFamily:"monospace"}}>{overallMargin.toFixed(1)}%</span></span>
            </div>
          </div>
        )}
      </div>

      {/* ── FLOATING AI COMMENTARY BUTTON ── */}
      <div style={{position:"fixed",bottom:24,right:24,zIndex:200}}>
        {showAI && (
          <div style={{
            position:"absolute",bottom:52,right:0,width:280,
            background:C.card,border:`1px solid ${C.border}`,
            borderRadius:14,padding:16,boxShadow:C.shadow,
            animation:"fadeUp 0.2s ease",
          }}>
            <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <button onClick={()=>setShowAI(false)} style={{float:"right",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:14,lineHeight:1}}>✕</button>
            <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>💬 AI Commentary</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Plain English analysis of your numbers</div>
            <MarginCommentary roles={roles} stats={stats} totalCostUSD={totalCostUSD} totalRevenueUSD={totalRevenueUSD} overallMargin={overallMargin} targetMargin={targetMargin} sym={sym} currency={currency} apiKey={apiKey} C={C}/>
          </div>
        )}
        <button onClick={()=>setShowAI(s=>!s)} style={{
          background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
          border:"none",borderRadius:28,color:"#fff",
          padding:"10px 18px",fontSize:13,fontWeight:700,
          cursor:"pointer",display:"flex",alignItems:"center",gap:7,
          boxShadow:`0 4px 16px ${C.accent}55`,fontFamily:"'Space Grotesk',sans-serif",
          transition:"transform 0.15s",
        }}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.04)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
        >
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 1L9 5.5H14L10 8.3l1.5 4.2L7.5 9.8 3.5 12.5 5 8.3 1 5.5h5L7.5 1z" fill="white"/></svg>
          AI Commentary
        </button>
      </div>

    </div>
  );
}


/* ═══════════════════════════════════════════════
   SOW — STORAGE UTILITIES
═══════════════════════════════════════════════ */
const SOW_LIST_KEY = "rp_sow_library";
const newSowId = () => "sow_" + Date.now();

function loadSowList() {
  try { return JSON.parse(localStorage.getItem(SOW_LIST_KEY) || "[]"); }
  catch { return []; }
}
function saveSowList(list) { localStorage.setItem(SOW_LIST_KEY, JSON.stringify(list)); }
function loadSowData(id) {
  try { return JSON.parse(localStorage.getItem("rp_sow_" + id) || "null"); }
  catch { return null; }
}
function saveSowData(id, data) { localStorage.setItem("rp_sow_" + id, JSON.stringify(data)); }
function deleteSowById(id) {
  localStorage.removeItem("rp_sow_" + id);
  saveSowList(loadSowList().filter(s => s.id !== id));
}

/* ── Template definitions ── */
const SOW_TEMPLATES = {
  t1: {
    name: "Template 1 — Narrative Style",
    sections: [
      { id: "confidentiality",   title: "Confidentiality Notice",    ai: false, auto: false },
      { id: "executiveSummary",  title: "Executive Summary",          ai: true,  auto: false },
      { id: "background",        title: "Background",                 ai: true,  auto: false },
      { id: "scope",             title: "High Level Scope",           ai: true,  auto: false },
      { id: "assumptions",       title: "Assumptions",                ai: true,  auto: false },
      { id: "outOfScope",        title: "Out of Scope",               ai: true,  auto: false },
      { id: "resourceDetails",   title: "Resource Details",           ai: false, auto: true  },
      { id: "term",              title: "Term & Termination",         ai: false, auto: false },
      { id: "financialCharges",  title: "Financial Charges",          ai: false, auto: true  },
      { id: "acceptanceCriteria",title: "Acceptance Criteria",        ai: false, auto: false },
      { id: "signatures",        title: "Signatures",                 ai: false, auto: false, special: "sig" },
    ],
  },
  t2: {
    name: "Template 2 — Formal Numbered Style",
    sections: [
      { id: "sowIntro",          title: "SOW Introduction",           ai: false, auto: false },
      { id: "term",              title: "Term",                       ai: false, auto: false },
      { id: "servicesDelivs",   title: "Services and Deliverables",  ai: true,  auto: false },
      { id: "standards",         title: "Standards and Procedures",   ai: false, auto: false },
      { id: "subcontractors",    title: "Subcontractors",             ai: false, auto: false },
      { id: "termination",       title: "Termination",                ai: false, auto: false },
      { id: "financialCharges",  title: "Fees and Expenses",          ai: false, auto: true  },
      { id: "paymentSchedule",   title: "Payment Schedule",           ai: false, auto: true  },
      { id: "resourceDetails",   title: "Resource Details",           ai: false, auto: true  },
      { id: "additionalTerms",   title: "Additional Terms",           ai: false, auto: false },
      { id: "resourceTermination", title: "Resource Termination",     ai: false, auto: false },
      { id: "signatures",        title: "Signatures",                 ai: false, auto: false, special: "sig" },
    ],
  },
  t3: {
    name: "Template 3 — Change Order",
    sections: [
      { id: "coIntro",           title: "Change Order Introduction",  ai: false, auto: false },
      { id: "descChanges",       title: "Description of Changes",     ai: true,  auto: false },
      { id: "budgetTable",       title: "Change Order Budget",        ai: false, auto: true  },
      { id: "paymentSchedule",   title: "Payment Schedule",           ai: false, auto: true  },
      { id: "contractSummary",   title: "Contract Summary",           ai: false, auto: true  },
      { id: "resourceTermination", title: "Resource Termination",     ai: false, auto: false },
      { id: "signatures",        title: "Signatures",                 ai: false, auto: false, special: "sig" },
    ],
  },
};

const DEFAULT_CONTENT = {
  confidentiality: "CONFIDENTIALITY: The information contained in this document shall be deemed Confidential Information to both parties. It shall not be disclosed, duplicated, or used for any purpose other than that stated herein, in whole or in part, without prior written consent of the other party.",
  term: "The term of this Statement of Work shall commence on or about [Start Date] (the \"Start Date\") and end by [End Date] (the \"End Date\"), subject always to the applicable provisions of the Agreement.\n\nCancellation & Termination: Either party may cancel or terminate this Agreement by giving a prior written notice of no less than 30 days in advance.",
  standards: "Vendor will provide the Services and Deliverables described in this SOW in compliance with the Client's Standard Operating Procedures and Work Instructions as well as relevant regulations.",
  subcontractors: "Vendor will not use subcontractors to provide any of the Services.",
  termination: "This SOW will commence on the Effective Date and shall continue in full force and effect until completion of the Services or earlier termination in accordance with the terms of the Master Service Agreement. Any resource release or termination shall require a minimum of 30 days' written notice by either party.",
  acceptanceCriteria: "Upon completion of service, [Vendor] will provide a written notice of completion to [Client]. [Client] has the right to inspect any such deliverables and will have 15 days from the date of delivery to accept or reject in writing.",
  resourceTermination: "Any resource release or termination shall require a minimum of 30 days' written notice by either party. Billing will continue through the notice period unless agreed otherwise.",
  additionalTerms: "N/A",
  subcontractors_t2: "Vendor will not use subcontractors to provide any of the Services.",
  sowIntro: "This Statement of Work (\"SOW\") effective as of [Effective Date] is issued pursuant to the Master Services Agreement (the \"Agreement\") between [Client Name] and [Vendor Name] and incorporates all the terms and conditions therein.",
  coIntro: "This Change Order (\"CO\") is entered into and made effective as of [CO Effective Date] and sets forth the changes to Services pursuant to Statement of Work #[SOW Number] entered into as of [SOW Date] between [Client Name] and [Vendor Name].",
};

function blankSow(template) {
  const sections = {};
  SOW_TEMPLATES[template].sections.forEach(s => {
    sections[s.id] = DEFAULT_CONTENT[s.id] || "";
  });
  return {
    template,
    projectInfo: { projectName:"", clientName:"", clientContact:"", clientEmail:"", location:"", msaDate:"", effectiveDate:"", startDate:"", endDate:"", sowNumber:"", invoiceEmail:"", paymentDays:"" },
    docHistory: [{ version:"1.0", author:"", date:"", description:"First draft" }],
    sections,
    signatories: { clientName:"", clientTitle:"", clientDate:"", vendorName:"", vendorTitle:"", vendorDate:"", vendorAddress:"", vendorPhone:"" },
  };
}

/* ═══════════════════════════════════════════════
   SOW LIBRARY PAGE
═══════════════════════════════════════════════ */
function SOWLibraryPage({ onBack, onOpen, onNew, dark, C }) {
  const [list, setList] = useState(() => loadSowList());

  function handleDelete(id) {
    if (!window.confirm("Delete this SOW? This cannot be undone.")) return;
    deleteSowById(id);
    setList(loadSowList());
  }

  const tplLabel = id => SOW_TEMPLATES[id]?.name.split("—")[0].trim() || id;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Space Grotesk',sans-serif", transition:"background 0.25s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>

      {/* Top bar */}
      <div style={{ padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.border}`, background:C.card, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, cursor:"pointer", padding:"5px 12px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif" }}>← Planner</button>
          <div style={{ width:1, height:22, background:C.border }}/>
          <span style={{ fontWeight:700, fontSize:14 }}>SOW Library</span>
        </div>
        <button onClick={onNew} style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:8, color:"#fff", padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Space Grotesk',sans-serif" }}>
          + New SOW
        </button>
      </div>

      <div style={{ padding:"28px 24px" }}>
        {list.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 20px" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>📄</div>
            <div style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:8 }}>No SOWs yet</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>Create your first SOW from the planner page</div>
            <button onClick={onNew} style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:8, color:"#fff", padding:"10px 24px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Space Grotesk',sans-serif" }}>
              + Create New SOW
            </button>
          </div>
        ) : (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", boxShadow:C.shadow }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:C.surface }}>
                  {["SOW Name","Client","Template","Version","Last Edited","Actions"].map(h => (
                    <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.07em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((sow, i) => (
                  <tr key={sow.id} style={{ borderTop:`1px solid ${C.border}`, cursor:"pointer", transition:"background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding:"12px 16px", fontWeight:600, fontSize:13 }} onClick={() => onOpen(sow.id)}>{sow.name || "Untitled SOW"}</td>
                    <td style={{ padding:"12px 16px", fontSize:12, color:C.muted }} onClick={() => onOpen(sow.id)}>{sow.client || "—"}</td>
                    <td style={{ padding:"12px 16px" }} onClick={() => onOpen(sow.id)}>
                      <span style={{ fontSize:10, background:C.accent+"22", color:C.accent, borderRadius:4, padding:"2px 8px", fontWeight:600 }}>{tplLabel(sow.template)}</span>
                    </td>
                    <td style={{ padding:"12px 16px", fontSize:12, fontFamily:"monospace", color:C.accent2, fontWeight:700 }} onClick={() => onOpen(sow.id)}>v{sow.version}</td>
                    <td style={{ padding:"12px 16px", fontSize:11, color:C.muted }} onClick={() => onOpen(sow.id)}>{new Date(sow.lastEdited).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</td>
                    <td style={{ padding:"12px 16px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => onOpen(sow.id)} style={{ background:C.accent+"22", border:`1px solid ${C.accent}44`, borderRadius:6, color:C.accent, cursor:"pointer", padding:"4px 10px", fontSize:11, fontWeight:600, fontFamily:"'Space Grotesk',sans-serif" }}>Open</button>
                        <button onClick={() => handleDelete(sow.id)} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, cursor:"pointer", padding:"4px 10px", fontSize:11, fontFamily:"'Space Grotesk',sans-serif" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SOW BUILDER PAGE
═══════════════════════════════════════════════ */
function SOWBuilderPage({ sowId: initialId, plannerData, onBack, onLibrary, apiKey, dark, C }) {
  const isNew = !initialId;
  const [sowId_]  = useState(() => initialId || newSowId());
  const sowId     = sowId_;
  const [template, setTemplate] = useState("t1");
  const [projectInfo, setPI]    = useState({ projectName:"", clientName:"", clientContact:"", clientEmail:"", location:"", msaDate:"", effectiveDate:"", startDate:"", endDate:"", sowNumber:"", invoiceEmail:"", paymentDays:"45" });
  const [docHistory, setDH]     = useState([{ version:"1.0", author:"", date:"", description:"First draft" }]);
  const [sections, setSections] = useState({});
  const [signatories, setSig]   = useState({ clientName:"", clientTitle:"", clientDate:"", vendorName:"", vendorTitle:"", vendorDate:"", vendorAddress:"", vendorPhone:"" });
  const [openSecs, setOpenSecs] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [aiSuggestion, setAiSug] = useState({});
  const [saved, setSaved]       = useState(false);

  // Load existing or init blank
  useEffect(() => {
    if (!isNew) {
      const data = loadSowData(sowId);
      if (data) {
        setTemplate(data.template || "t1");
        setPI(data.projectInfo || {});
        setDH(data.docHistory || []);
        setSections(data.sections || {});
        setSig(data.signatories || {});
        const open = {};
        SOW_TEMPLATES[data.template || "t1"].sections.forEach(s => { open[s.id] = true; });
        setOpenSecs(open);
      }
    } else {
      const blank = blankSow("t1");
      setSections(blank.sections);
      const open = {};
      SOW_TEMPLATES["t1"].sections.forEach(s => { open[s.id] = true; });
      setOpenSecs(open);
    }
  }, []);

  function switchTemplate(t) {
    setTemplate(t);
    const blank = blankSow(t);
    setSections(prev => ({ ...blank.sections, ...prev }));
    const open = {};
    SOW_TEMPLATES[t].sections.forEach(s => { open[s.id] = true; });
    setOpenSecs(open);
  }

  function save() {
    const data = { id: sowId, template, projectInfo, docHistory, sections, signatories };
    saveSowData(sowId, data);
    const list = loadSowList();
    const existing = list.findIndex(s => s.id === sowId);
    const meta = { id: sowId, name: projectInfo.projectName || "Untitled SOW", client: projectInfo.clientName || "—", template, version: docHistory[docHistory.length-1]?.version || "1.0", lastEdited: new Date().toISOString() };
    if (existing >= 0) list[existing] = meta; else list.unshift(meta);
    saveSowList(list);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function generateAI(secId, secTitle) {
    if (!apiKey) { alert("Please enter your Anthropic API key first."); return; }
    setAiLoading(p => ({ ...p, [secId]: true }));
    setAiSug(p => ({ ...p, [secId]: "" }));
    try {
      const context = `Project: ${projectInfo.projectName || "N/A"}\nClient: ${projectInfo.clientName || "N/A"}\nProject Type: ${plannerData?.projectType || "N/A"}\nRoles: ${plannerData?.roles?.map(r => r.name).join(", ") || "N/A"}\nTotal Revenue: ${plannerData ? fmt(plannerData.totalRevenue, "$", "USD") : "N/A"}\nTotal Hours: ${plannerData?.totalHours || "N/A"}h\nStart: ${projectInfo.startDate || "N/A"}  End: ${projectInfo.endDate || "N/A"}`;
      const current = sections[secId] || "";
      const text = await callClaude(apiKey, [{ role:"user", content:`You are a professional SOW writer. Write the "${secTitle}" section for a Statement of Work. Be concise, professional, and specific. Use [placeholders] for any client-specific details that need to be filled in. Do not use generic filler text.\n\nContext:\n${context}\n\nCurrent content (improve this if provided, otherwise write from scratch):\n${current}\n\nReturn only the section text, no headings or labels.` }], 600);
      setAiSug(p => ({ ...p, [secId]: text }));
    } catch (e) { alert("AI error: " + e.message); }
    setAiLoading(p => ({ ...p, [secId]: false }));
  }

  function acceptSuggestion(secId) {
    setSections(p => ({ ...p, [secId]: aiSuggestion[secId] }));
    setAiSug(p => ({ ...p, [secId]: "" }));
  }

  // Build resource table rows from planner data
  const resourceRows = plannerData?.roles?.map((r, i) => {
    const s = plannerData.stats[i];
    return { role: r.name, rate: fmtRate(r.wsr, "$", "USD"), hours: s.hours };
  }) || [];

  // Build financial table rows (by role)
  const financialRows = plannerData?.roles?.map((r, i) => {
    const s = plannerData.stats[i];
    return { role: r.name, rate: fmtRate(r.wsr, "$", "USD"), hours: s.hours, amount: fmt(s.revenue, "$", "USD") };
  }) || [];

  function downloadPDF() {
    window.print();
  }

  function downloadWord() {
    const tpl = SOW_TEMPLATES[template];
    const rows = resourceRows.map(r => `<tr><td>${r.role}</td><td></td><td></td><td>${r.rate}</td><td>${r.hours}h</td></tr>`).join("");
    const fRows = financialRows.map(r => `<tr><td>${r.role}</td><td>${r.rate}</td><td>${r.hours}h</td><td>${r.amount}</td></tr>`).join("");
    const histRows = docHistory.map((h, i) => `<tr><td>${i+1}</td><td>${h.version}</td><td>${h.author}</td><td>${h.date}</td><td>${h.description}</td></tr>`).join("");

    let body = `
      <h1>Statement of Work</h1>
      <h2>${projectInfo.projectName || "[Project Name]"}</h2>
      <table border="1" cellpadding="6" cellspacing="0" style="width:100%;margin-bottom:20px">
        <tr><td><b>Project Name</b></td><td>${projectInfo.projectName || ""}</td></tr>
        <tr><td><b>Client</b></td><td>${projectInfo.clientName || ""}</td></tr>
        <tr><td><b>Location</b></td><td>${projectInfo.location || ""}</td></tr>
        <tr><td><b>Client Contact</b></td><td>${projectInfo.clientContact || ""} ${projectInfo.clientEmail ? "\u003c" + projectInfo.clientEmail + "\u003e" : ""}</td></tr>
      </table>
      <h3>Document History</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="width:100%;margin-bottom:20px">
        <tr><th>S No.</th><th>Version</th><th>Author</th><th>Date</th><th>Description</th></tr>
        ${histRows}
      </table>
    `;

    tpl.sections.forEach((sec, i) => {
      body += `<h2>${i+1}. ${sec.title}</h2>\n`;
      if (sec.auto && sec.id === "resourceDetails") {
        body += `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;margin-bottom:20px"><tr><th>Role</th><th>Name</th><th>Email</th><th>Rate/hr</th><th>Total Hours</th></tr>${rows}</table>`;
      } else if (sec.auto && (sec.id === "financialCharges" || sec.id === "budgetTable")) {
        body += `<table border="1" cellpadding="6" cellspacing="0" style="width:100%;margin-bottom:20px"><tr><th>Role</th><th>Rate/hr</th><th>Hours</th><th>Amount</th></tr>${fRows}<tr><td colspan="2"><b>Total</b></td><td><b>${plannerData?.totalHours || ""}h</b></td><td><b>${plannerData ? fmt(plannerData.totalRevenue,"$","USD") : ""}</b></td></tr></table>`;
        if (sections.invoicingTerms) body += `<p>${(sections.invoicingTerms||"").replace(/\n/g,"<br/>")}</p>`;
      } else if (sec.special === "sig") {
        body += `<table border="1" cellpadding="12" cellspacing="0" style="width:100%"><tr><th>[Client Name]</th><th>[Vendor Name]</th></tr><tr><td>Name: ${signatories.clientName || ""}<br/>Title:<br/>Date:<br/>Signature:<br/><br/></td><td>Name: ${signatories.vendorName || ""}<br/>Title: ${signatories.vendorTitle || ""}<br/>Date: ${signatories.vendorDate || ""}<br/>Signature:<br/><br/></td></tr></table>`;
      } else {
        body += `<p>${(sections[sec.id] || "").replace(/\n/g,"<br/>")}</p>`;
      }
    });

    const html = `<html><head><meta charset="UTF-8"><style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;margin:2cm}h1{font-size:20pt;color:#1a3356}h2{font-size:14pt;color:#2563eb;border-bottom:1px solid #dde3f0;padding-bottom:4px}h3{font-size:12pt}table{border-collapse:collapse}td,th{padding:6px 10px}th{background:#f0f4fb;font-weight:bold}</style></head><body>${body}</body></html>`;
    const blob = new Blob([html], { type:"application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (projectInfo.projectName || "SOW") + ".doc";
    a.click(); URL.revokeObjectURL(url);
  }

  const secDefs = SOW_TEMPLATES[template]?.sections || [];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Space Grotesk',sans-serif", transition:"background 0.25s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
      <style>{`@media print { .no-print { display:none!important; } body { background:white; } }`}</style>

      {/* Top bar */}
      <div className="no-print" style={{ padding:"11px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.border}`, background:C.card, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", padding:"5px 11px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif" }}>← Planner</button>
          <button onClick={onLibrary} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, color:C.muted, cursor:"pointer", padding:"5px 11px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif" }}>📄 SOW Library</button>
          <div style={{ width:1, height:22, background:C.border }}/>
          <span style={{ fontWeight:700, fontSize:14 }}>SOW Builder</span>
          {saved && <span style={{ fontSize:11, color:C.accent2, background:C.accent2+"22", borderRadius:4, padding:"2px 8px" }}>✓ Saved</span>}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={template} onChange={e => switchTemplate(e.target.value)} style={{ background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"6px 12px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif", outline:"none" }}>
            {Object.entries(SOW_TEMPLATES).map(([k,v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <button onClick={save} style={{ background:C.accent+"22", border:`1px solid ${C.accent}`, borderRadius:7, color:C.accent, cursor:"pointer", padding:"6px 14px", fontSize:12, fontWeight:600, fontFamily:"'Space Grotesk',sans-serif" }}>Save</button>
          <button onClick={downloadPDF} style={{ background:C.accent3+"22", border:`1px solid ${C.accent3}`, borderRadius:7, color:C.accent3, cursor:"pointer", padding:"6px 14px", fontSize:12, fontWeight:600, fontFamily:"'Space Grotesk',sans-serif" }}>↓ PDF</button>
          <button onClick={downloadWord} style={{ background:C.accent2+"22", border:`1px solid ${C.accent2}`, borderRadius:7, color:C.accent2, cursor:"pointer", padding:"6px 14px", fontSize:12, fontWeight:600, fontFamily:"'Space Grotesk',sans-serif" }}>↓ Word</button>
        </div>
      </div>

      <div style={{ padding:"20px 24px 60px" }}>

        {/* Project info */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 18px", marginBottom:14, boxShadow:C.shadow }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:12 }}>Project Information</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
            {[
              ["projectName","Project Name"], ["clientName","Client / Customer"], ["clientContact","Client Contact Name"],
              ["clientEmail","Client Contact Email"], ["location","Location"], ["sowNumber","SOW Number"],
              ["msaDate","MSA Reference Date","date"], ["effectiveDate","SOW Effective Date","date"],
              ["startDate","Start Date","date"], ["endDate","End Date","date"],
              ["invoiceEmail","Invoice Email"], ["paymentDays","Payment Terms (days)"],
            ].map(([key, label, type]) => (
              <div key={key}>
                <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                <input type={type || "text"} value={projectInfo[key] || ""} onChange={e => setPI(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width:"100%", background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, padding:"6px 8px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif", outline:"none" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Document history */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:14, boxShadow:C.shadow }}>
          <div style={{ padding:"11px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.07em", textTransform:"uppercase" }}>Document History</span>
            <button onClick={() => setDH(p => [...p, { version:`${p.length+1}.0`, author:"", date:"", description:"" }])}
              style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, cursor:"pointer", padding:"3px 10px", fontSize:11, fontFamily:"'Space Grotesk',sans-serif" }}>+ Add Version</button>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.surface }}>
                {["#","Version","Author","Date","Description"].map(h => (
                  <th key={h} style={{ padding:"7px 14px", textAlign:"left", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docHistory.map((row, i) => (
                <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:"6px 14px", fontSize:12, color:C.muted, width:30 }}>{i+1}</td>
                  {["version","author","date","description"].map(f => (
                    <td key={f} style={{ padding:"6px 14px" }}>
                      <input type={f==="date"?"date":"text"} value={row[f]||""} onChange={e => setDH(p => p.map((r,j) => j===i ? {...r,[f]:e.target.value} : r))}
                        style={{ border:"none", background:"transparent", fontSize:12, color:C.text, width:"100%", outline:"none", fontFamily:f==="version"?"monospace":"'Space Grotesk',sans-serif" }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sections */}
        {secDefs.map((sec, idx) => {
          const open = !!openSecs[sec.id];
          return (
            <div key={sec.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:10, overflow:"hidden", boxShadow:C.shadow }}>
              <div onClick={() => setOpenSecs(p => ({...p,[sec.id]:!p[sec.id]}))}
                style={{ padding:"12px 18px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", userSelect:"none" }}>
                <div style={{ width:18, height:18, borderRadius:4, background:open?C.accent+"22":C.surface, border:`1px solid ${open?C.accent+"66":C.border}`, color:open?C.accent:C.muted, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:900, flexShrink:0 }}>{open?"▾":"▸"}</div>
                <span style={{ fontSize:10, color:C.muted, fontWeight:700, minWidth:20 }}>{idx+1}.</span>
                <span style={{ fontSize:13, fontWeight:600, flex:1 }}>{sec.title}</span>
                {sec.auto && <span style={{ fontSize:10, background:C.accent2+"22", color:C.accent2, borderRadius:4, padding:"2px 8px", fontWeight:600 }}>✓ Auto from Planner</span>}
                {sec.ai && (
                  <button onClick={e => { e.stopPropagation(); generateAI(sec.id, sec.title); }}
                    disabled={aiLoading[sec.id]}
                    style={{ background:"transparent", border:`1px solid ${C.accent}44`, borderRadius:6, color:C.accent, cursor:"pointer", padding:"3px 10px", fontSize:11, fontFamily:"'Space Grotesk',sans-serif", display:"flex", alignItems:"center", gap:4 }}>
                    {aiLoading[sec.id] ? "⏳ Writing..." : "✨ AI Assist"}
                  </button>
                )}
              </div>

              {open && (
                <div style={{ padding:"0 18px 16px", borderTop:`1px solid ${C.border}` }}>

                  {/* AI suggestion box */}
                  {aiSuggestion[sec.id] && (
                    <div style={{ background:C.accent+"11", border:`1px solid ${C.accent}44`, borderRadius:8, padding:"12px 14px", margin:"12px 0" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.accent, letterSpacing:"0.05em", marginBottom:6 }}>✨ AI SUGGESTION</div>
                      <div style={{ fontSize:12, color:C.text, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{aiSuggestion[sec.id]}</div>
                      <div style={{ display:"flex", gap:8, marginTop:10 }}>
                        <button onClick={() => acceptSuggestion(sec.id)} style={{ background:C.accent, border:"none", borderRadius:6, color:"#fff", padding:"5px 14px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Space Grotesk',sans-serif" }}>✓ Accept</button>
                        <button onClick={() => setAiSug(p => ({...p,[sec.id]:""}))} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Space Grotesk',sans-serif" }}>Discard</button>
                      </div>
                    </div>
                  )}

                  {/* Auto-populated: Resource table */}
                  {sec.auto && sec.id === "resourceDetails" && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>The table below is auto-populated from the planner. Add resource names and emails.</div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:C.surface }}>
                          {["Role","Name","Email","Rate / hr (Sell)","Total Hours"].map(h => <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {resourceRows.map((r, i) => (
                            <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                              <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.role}</td>
                              <td style={{ padding:"8px 12px" }}><input style={{ border:"none", background:C.inputBg, borderRadius:4, padding:"3px 6px", fontSize:12, color:C.text, width:130, fontFamily:"'Space Grotesk',sans-serif", outline:"none" }} placeholder="Resource name"/></td>
                              <td style={{ padding:"8px 12px" }}><input style={{ border:"none", background:C.inputBg, borderRadius:4, padding:"3px 6px", fontSize:12, color:C.text, width:170, fontFamily:"'Space Grotesk',sans-serif", outline:"none" }} placeholder="email@company.com"/></td>
                              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2, fontWeight:700 }}>{r.rate}</td>
                              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent }}>{r.hours}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Auto-populated: Financial table */}
                  {sec.auto && (sec.id === "financialCharges" || sec.id === "budgetTable" || sec.id === "paymentSchedule") && (
                    <div style={{ marginTop:12 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:C.surface }}>
                          {["Role","Rate/hr ($)","Total Hours","Amount ($)"].map(h => <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {financialRows.map((r, i) => (
                            <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                              <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.role}</td>
                              <td style={{ padding:"8px 12px", fontFamily:"monospace" }}>{r.rate}</td>
                              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent }}>{r.hours}h</td>
                              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2, fontWeight:700 }}>{r.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr style={{ borderTop:`2px solid ${C.border}`, background:C.surface }}>
                          <td colSpan={2} style={{ padding:"8px 12px", fontSize:11, color:C.muted, fontWeight:700 }}>TOTAL</td>
                          <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent, fontWeight:700 }}>{plannerData?.totalHours || 0}h</td>
                          <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2, fontWeight:800, fontSize:14 }}>{plannerData ? fmt(plannerData.totalRevenue,"$","USD") : "$0"}</td>
                        </tr></tfoot>
                      </table>
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:4 }}>Invoicing Terms</div>
                        <textarea value={sections.invoicingTerms||""} onChange={e => setSections(p=>({...p,invoicingTerms:e.target.value}))} rows={3}
                          placeholder="e.g. This is a time and materials contract. Invoices to be submitted monthly to [invoice email]. Payment within [X] days."
                          style={{ width:"100%", background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"8px 10px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif", resize:"vertical", outline:"none", lineHeight:1.6, boxSizing:"border-box" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Contract summary for CO */}
                  {sec.auto && sec.id === "contractSummary" && (
                    <div style={{ marginTop:12 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:C.surface }}>
                          {["Document","Effective Date","Value (USD)","Total Contract (USD)"].map(h => <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          <tr style={{ borderTop:`1px solid ${C.border}` }}>
                            <td style={{ padding:"8px 12px" }}>SOW #{projectInfo.sowNumber || "[#]"}</td>
                            <td style={{ padding:"8px 12px" }}>{projectInfo.effectiveDate || "—"}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2 }}>—</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2 }}>{plannerData ? fmt(plannerData.totalRevenue,"$","USD") : "—"}</td>
                          </tr>
                          <tr style={{ borderTop:`1px solid ${C.border}`, background:C.surface }}>
                            <td style={{ padding:"8px 12px", fontWeight:700 }}>Change Order #1</td>
                            <td style={{ padding:"8px 12px" }}>{projectInfo.startDate || "—"}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2, fontWeight:700 }}>{plannerData ? fmt(plannerData.totalRevenue,"$","USD") : "—"}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.accent2, fontWeight:800 }}>{plannerData ? fmt(plannerData.totalRevenue * 2,"$","USD") : "—"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Signatures */}
                  {sec.special === "sig" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:12 }}>
                      {[
                        { label:"Client", keys:["clientName","clientTitle","clientDate"] },
                        { label:"Vendor", keys:["vendorName","vendorTitle","vendorDate"] },
                      ].map(party => (
                        <div key={party.label} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:14 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.07em", textTransform:"uppercase", textAlign:"center", padding:"5px", background:C.surface, borderRadius:5, marginBottom:10 }}>{party.label}</div>
                          {party.keys.map(k => (
                            <div key={k} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <span style={{ fontSize:11, color:C.muted, width:50, flexShrink:0 }}>{k.replace(/([A-Z])/g," $1").split(" ").slice(1).join(" ") || "Name"}:</span>
                              <input value={signatories[k]||""} onChange={e => setSig(p=>({...p,[k]:e.target.value}))} type={k.includes("Date")?"date":"text"}
                                style={{ flex:1, border:"none", background:C.inputBg, borderRadius:4, padding:"3px 6px", fontSize:12, color:C.text, fontFamily:"'Space Grotesk',sans-serif", outline:"none" }}
                              />
                            </div>
                          ))}
                          <div style={{ borderBottom:`1px solid ${C.text}`, minHeight:48, marginTop:16 }}/>
                          <div style={{ fontSize:10, color:C.muted, marginTop:4, textAlign:"center" }}>Signature</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Regular editable text section */}
                  {!sec.auto && sec.special !== "sig" && (
                    <textarea value={sections[sec.id]||""} onChange={e => setSections(p=>({...p,[sec.id]:e.target.value}))} rows={5}
                      placeholder={`Enter content for ${sec.title}...`}
                      style={{ width:"100%", background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, padding:"10px 12px", fontSize:12, fontFamily:"'Space Grotesk',sans-serif", resize:"vertical", outline:"none", lineHeight:1.7, boxSizing:"border-box", marginTop:12, transition:"border-color 0.15s" }}
                      onFocus={e => e.target.style.borderColor=C.accent}
                      onBlur={e => e.target.style.borderColor=C.border}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [dark, setDark]         = useState(false);
  const C                        = THEMES[dark ? "dark" : "light"];
  const [page, setPage]         = useState("landing");
  const [roles, setRoles]       = useState(defaultRoles);
  const [numWeeks, setNumWeeks] = useState(4);
  const [loadedFromAI, setLoaded] = useState(false);
  const [projectType, setPT]    = useState("");
  const [apiKey, setApiKey]     = useState("");
  const [sowOpenId, setSowOpenId] = useState(null);

  const stats = useMemo(() => roles.map(r => {
    const total = r.weekAllocations.slice(0, numWeeks).reduce((a, b) => a + b, 0);
    const hours = total * (r.hoursPerWeek ?? 40);
    const cost = hours * r.rate; const revenue = hours * r.wsr;
    return { total, hours, cost, revenue, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
  }), [roles, numWeeks]);

  const plannerData = {
    roles, stats, numWeeks, projectType,
    totalHours: stats.reduce((a, s) => a + s.hours, 0),
    totalRevenue: stats.reduce((a, s) => a + s.revenue, 0),
    totalCost: stats.reduce((a, s) => a + s.cost, 0),
  };

  function handleLoad({ roles: r, numWeeks: nw, projectType: pt }) {
    setRoles(r); setNumWeeks(nw); setPT(pt); setLoaded(true); setPage("planner");
  }
  function handleSkip() {
    setRoles(defaultRoles); setNumWeeks(4); setLoaded(false); setPage("planner");
  }

  if (page === "landing") {
    return <LandingPage onEnter={() => setPage("intake")} />;
  }
  if (page === "intake") {
    return <IntakePage onLoad={handleLoad} onSkip={handleSkip}
      apiKey={apiKey} setApiKey={setApiKey} dark={dark} setDark={setDark}/>;
  }
  if (page === "sow-library") {
    return <SOWLibraryPage
      onBack={() => setPage("planner")}
      onOpen={id => { setSowOpenId(id); setPage("sow-builder"); }}
      onNew={() => { setSowOpenId(null); setPage("sow-builder"); }}
      dark={dark} C={C}/>;
  }
  if (page === "sow-builder") {
    return <SOWBuilderPage
      sowId={sowOpenId}
      plannerData={plannerData}
      onBack={() => setPage("planner")}
      onLibrary={() => setPage("sow-library")}
      apiKey={apiKey} dark={dark} C={C}/>;
  }
  return <PlannerPage roles={roles} setRoles={setRoles}
    numWeeks={numWeeks} setNumWeeks={setNumWeeks}
    loadedFromAI={loadedFromAI} projectType={projectType}
    apiKey={apiKey} onBack={() => setPage("intake")}
    onGenerateSOW={() => { setSowOpenId(null); setPage("sow-builder"); }}
    onSOWLibrary={() => setPage("sow-library")}
    dark={dark} setDark={setDark} C={C}/>;
}
