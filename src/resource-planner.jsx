import { useState, useMemo, useRef } from "react";

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
const FX_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.5 };
const toFx    = (usd, cur) => usd * FX_RATES[cur];
const fromFx  = (val, cur) => val / FX_RATES[cur];
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

function CurrencyBar({ currency, setCurrency, C }) {
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
          fontSize: 10, color: C.muted, fontFamily: "monospace",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
        }}>1 USD = {FX_RATES[currency]} {currency}</span>
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
];
const EXT_COLORS = {
  png:  { bg: "#fff8e6", color: "#d97706" },
  jpg:  { bg: "#fef0f0", color: "#dc2626" },
  jpeg: { bg: "#fef0f0", color: "#dc2626" },
  gif:  { bg: "#fdf4ff", color: "#9333ea" },
  webp: { bg: "#f0f4ff", color: "#4f46e5" },
  csv:  { bg: "#edfff6", color: "#059669" },
  txt:  { bg: "#f0f4ff", color: "#4f46e5" },
};

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

  const ACCEPTED = ".png,.jpg,.jpeg,.gif,.webp,.csv,.txt";

  function handleFile(f) { if (!f) return; setFile(f); setError(""); }
  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  }

  const isImage  = file && file.type.startsWith("image/");
  const fileExt  = file ? file.name.split(".").pop().toLowerCase() : "";
  const fileClr  = EXT_COLORS[fileExt] || { bg: "#f1f5f9", color: "#64748b" };
  const fileSize = file
    ? (file.size > 1048576 ? (file.size / 1048576).toFixed(1) + " MB" : Math.round(file.size / 1024) + " KB")
    : "";

  const canSubmit = !!file || pasteText.trim().length > 0;

  async function analyse() {
    setError("");
    if (!apiKey) { setError("Please enter your Anthropic API key below."); return; }
    if (!canSubmit) { setError("Please upload a file or paste your table first."); return; }
    setLoading(true);
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
        const content = file ? await fileToText(file) : pasteText;
        messages = [{ role: "user", content: `${systemPrompt}\n\nExtract from this data. Project context: ${projectDesc || "not provided"}\n\nData:\n${content}` }];
      }

      const text   = await callClaude(apiKey, messages, 1500);
      const parsed = parseAIResponse(text);
      if (!parsed.roles.length) throw new Error("No roles found. Try a different format.");
      onLoad(parsed, projectDesc);
    } catch (e) { setError(`❌ ${e.message}`); }
    setLoading(false);
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

          {/* CTA */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <ApplyBtn onClick={analyse} disabled={loading} C={IL}>
              {loading ? "⏳ AI is reading your data..." : "✨ Analyse & Load into Planner →"}
            </ApplyBtn>
          </div>

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
function PlannerPage({ roles, setRoles, numWeeks, setNumWeeks, loadedFromAI, projectType, apiKey, onBack, dark, setDark, C }) {
  const [currency, setCurrency]           = useState("USD");
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
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{
            width:28,height:28,borderRadius:7,fontSize:14,
            background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>⚡</div>
          <span style={{fontWeight:700,fontSize:14}}>Resource Effort Planner</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <ThemeToggle dark={dark} setDark={setDark} C={C}/>
          <CurrencyBar currency={currency} setCurrency={setCurrency} C={C}/>
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

export default function App() {
  const [dark, setDark]         = useState(false);
  const C                        = THEMES[dark ? "dark" : "light"];
  const [page, setPage]         = useState("intake");
  const [roles, setRoles]       = useState(defaultRoles);
  const [numWeeks, setNumWeeks] = useState(4);
  const [loadedFromAI, setLoaded] = useState(false);
  const [projectType, setPT]    = useState("");
  const [apiKey, setApiKey]     = useState("");

  function handleLoad({ roles: r, numWeeks: nw, projectType: pt }) {
    setRoles(r); setNumWeeks(nw); setPT(pt); setLoaded(true); setPage("planner");
  }
  function handleSkip() {
    setRoles(defaultRoles); setNumWeeks(4); setLoaded(false); setPage("planner");
  }

  if (page === "intake") {
    return <IntakePage onLoad={handleLoad} onSkip={handleSkip}
      apiKey={apiKey} setApiKey={setApiKey} dark={dark} setDark={setDark}/>;
  }
  return <PlannerPage roles={roles} setRoles={setRoles}
    numWeeks={numWeeks} setNumWeeks={setNumWeeks}
    loadedFromAI={loadedFromAI} projectType={projectType}
    apiKey={apiKey} onBack={()=>setPage("intake")}
    dark={dark} setDark={setDark} C={C}/>;
}
