import { useState, useMemo } from "react";

const THEMES = {
  dark: {
    bg: "#0f1117",
    surface: "#181c27",
    card: "#1e2333",
    border: "#2a3050",
    accent: "#4f8ef7",
    accent2: "#38d9a9",
    accent3: "#f7924f",
    text: "#e8eaf6",
    muted: "#6b7599",
    danger: "#f76f6f",
    inputBg: "#0f1117",
    shadow: "0 4px 24px rgba(0,0,0,0.4)",
  },
  light: {
    bg: "#f0f4fb",
    surface: "#ffffff",
    card: "#ffffff",
    border: "#dde3f0",
    accent: "#2563eb",
    accent2: "#059669",
    accent3: "#d97706",
    text: "#1a1f36",
    muted: "#7c86a2",
    danger: "#dc2626",
    inputBg: "#f0f4fb",
    shadow: "0 2px 12px rgba(0,0,0,0.07)",
  },
};

const initialRoles = [
  { id: 1, name: "SME", rate: 275, hoursPerWeek: 40, weekAllocations: [0.1, 0.1, 0.1, 0.1] },
  { id: 2, name: "BA",  rate: 55,  hoursPerWeek: 40, weekAllocations: [0.5, 0.5, 0.5, 0.5] },
  { id: 3, name: "QA",  rate: 24,  hoursPerWeek: 40, weekAllocations: [1,   1,   1,   1  ] },
];

let nextId = 4;
const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
function fmt(n, sym) { return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }

/* ── small reusable components ─────────────────────────── */

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 10px", fontSize: 11,
      fontWeight: 700, letterSpacing: "0.06em", fontFamily: "monospace",
    }}>{children}</span>
  );
}

function NumInput({ value, onChange, min = 0, step = 0.1, extraStyle = {}, C }) {
  return (
    <input type="number" value={value} min={min} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6,
        color: C.text, padding: "4px 8px", fontSize: 13, width: "100%",
        outline: "none", textAlign: "right",
        fontFamily: "'JetBrains Mono', monospace", ...extraStyle,
      }}
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

function Btn({ onClick, children, accent, C, extraStyle = {} }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? (accent || C.accent) + "22" : "transparent",
        border: `1px solid ${hov ? (accent || C.accent) : C.border}`,
        borderRadius: 8, color: hov ? (accent || C.accent) : C.muted,
        cursor: "pointer", padding: "7px 16px", fontSize: 13,
        fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.15s", ...extraStyle,
      }}
    >{children}</button>
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

/* ── theme toggle pill ──────────────────────────────────── */
function ThemeToggle({ dark, setDark, C }) {
  return (
    <button onClick={() => setDark(d => !d)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        background: dark ? "#ffffff12" : "#00000008",
        border: `1px solid ${C.border}`, borderRadius: 20,
        cursor: "pointer", padding: "5px 14px 5px 10px",
        color: C.text, fontSize: 12, fontWeight: 600,
        fontFamily: "'Space Grotesk', sans-serif",
        transition: "all 0.25s", whiteSpace: "nowrap",
      }}
    >
      {/* sliding pill */}
      <span style={{
        display: "inline-block", width: 34, height: 19,
        background: dark ? C.accent : "#c5cfe8",
        borderRadius: 10, position: "relative", transition: "background 0.25s",
        flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 3,
          left: dark ? 17 : 3,
          width: 13, height: 13, borderRadius: "50%",
          background: "#fff", transition: "left 0.25s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }} />
      </span>
      <span>{dark ? "🌙 Dark" : "☀️ Light"}</span>
    </button>
  );
}

/* ── currency bar ───────────────────────────────────────── */
function CurrencyBar({ currency, setCurrency, C }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {["USD","EUR","GBP","INR"].map(c => (
        <button key={c} onClick={() => setCurrency(c)} style={{
          background: currency === c ? C.accent + "22" : "transparent",
          border: `1px solid ${currency === c ? C.accent : C.border}`,
          borderRadius: 6, color: currency === c ? C.accent : C.muted,
          cursor: "pointer", padding: "4px 10px", fontSize: 12,
          fontWeight: 600, transition: "all 0.15s",
        }}>{c}</button>
      ))}
    </div>
  );
}

/* ── table helpers ──────────────────────────────────────── */
const TH = (C, w) => ({
  padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
  color: C.muted, letterSpacing: "0.08em", whiteSpace: "nowrap", width: w, minWidth: w,
});
const TD = { padding: "8px 12px", verticalAlign: "middle" };

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function ResourcePlanner() {
  const [dark, setDark]           = useState(true);
  const C                          = THEMES[dark ? "dark" : "light"];
  const [roles, setRoles]          = useState(initialRoles);
  const [numWeeks, setNumWeeks]    = useState(4);
  const [currency, setCurrency]    = useState("USD");
  const [weekLabels, setWeekLabels]= useState(["W1","W2","W3","W4"]);
  const [editLabel, setEditLabel]  = useState(null);
  const [sprintHours, setSH]       = useState(40);
  const [showSettings, setShowSet] = useState(false);
  const sym = SYMBOLS[currency];

  /* week count changes */
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

  const upd   = (id, f, v) => setRoles(p => p.map(r => r.id===id ? {...r,[f]:v} : r));
  const updW  = (id, wi, v) => setRoles(p => p.map(r => {
    if(r.id!==id) return r;
    const a=[...r.weekAllocations]; a[wi]=v; return {...r,weekAllocations:a};
  }));
  const addR  = () => setRoles(p=>[...p,{id:nextId++,name:"New Role",rate:50,hoursPerWeek:sprintHours,weekAllocations:Array(numWeeks).fill(1)}]);
  const delR  = id => setRoles(p=>p.filter(r=>r.id!==id));
  const fillW = (id,v)=>setRoles(p=>p.map(r=>r.id===id?{...r,weekAllocations:Array(numWeeks).fill(v)}:r));

  const stats = useMemo(()=>roles.map(r=>{
    const total=r.weekAllocations.slice(0,numWeeks).reduce((a,b)=>a+b,0);
    const hours=total*(r.hoursPerWeek??sprintHours);
    return {total, hours, cost:hours*r.rate};
  }),[roles,numWeeks,sprintHours]);

  const grandTotal  = stats.reduce((a,s)=>a+s.cost,0);
  const totalHours  = stats.reduce((a,s)=>a+s.hours,0);
  const BAR_COLORS  = [C.accent, C.accent2, C.accent3, "#c084fc", "#f472b6"];

  /* ── render ─────────────────────────────────────────── */
  return (
    <div style={{
      minHeight:"100vh", background:C.bg, color:C.text,
      fontFamily:"'Space Grotesk','Segoe UI',sans-serif",
      padding:"32px 24px", transition:"background 0.25s, color 0.25s",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>

      {/* ── header ── */}
      <div style={{marginBottom:28,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
            <div style={{
              width:36,height:36,borderRadius:10,fontSize:18,
              background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>⚡</div>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,letterSpacing:"-0.02em"}}>
              Resource Effort Planner
            </h1>
          </div>
          <p style={{margin:0,color:C.muted,fontSize:13}}>
            Sprint-based cost estimator · {numWeeks} weeks · {roles.length} roles
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <ThemeToggle dark={dark} setDark={setDark} C={C}/>
          <CurrencyBar currency={currency} setCurrency={setCurrency} C={C}/>
          <IconBtn onClick={()=>setShowSet(s=>!s)} title="Settings" color={C.accent} C={C}>⚙</IconBtn>
        </div>
      </div>

      {/* ── settings panel ── */}
      {showSettings && (
        <div style={{
          background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
          padding:20, marginBottom:24, display:"flex", gap:24,
          flexWrap:"wrap", alignItems:"flex-end", boxShadow:C.shadow,
        }}>
          <div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:"0.06em",marginBottom:6}}>NUMBER OF WEEKS</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <IconBtn onClick={()=>changeWeeks(numWeeks-1)} color={C.danger} C={C}>−</IconBtn>
              <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,minWidth:28,textAlign:"center"}}>{numWeeks}</span>
              <IconBtn onClick={()=>changeWeeks(numWeeks+1)} color={C.accent2} C={C}>+</IconBtn>
            </div>
          </div>
          <div style={{minWidth:140}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:"0.06em",marginBottom:6}}>DEFAULT HRS/WEEK</div>
            <NumInput value={sprintHours} onChange={setSH} min={1} step={1} C={C}/>
          </div>
          <div style={{color:C.muted,fontSize:12,maxWidth:260}}>
            Default hours/week is used when adding new roles. You can override per-role in the table.
          </div>
        </div>
      )}

      {/* ── summary cards ── */}
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
        {[
          {label:"Total Cost",   value:fmt(grandTotal,sym),         color:C.accent2, icon:"💰"},
          {label:"Total Hours",  value:`${totalHours.toLocaleString()}h`, color:C.accent,  icon:"⏱"},
          {label:"Roles",        value:roles.length,                 color:C.accent3, icon:"👥"},
          {label:"Sprints",      value:numWeeks,                     color:C.muted,   icon:"📅"},
        ].map(card=>(
          <div key={card.label} style={{
            background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
            padding:"14px 20px", flex:"1 1 120px", minWidth:120,
            boxShadow:C.shadow, transition:"background 0.25s",
          }}>
            <div style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:"0.06em",marginBottom:4}}>
              {card.icon} {card.label.toUpperCase()}
            </div>
            <div style={{fontSize:22,fontWeight:700,color:card.color,fontFamily:"'JetBrains Mono',monospace"}}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── table ── */}
      <div style={{
        background:C.card, border:`1px solid ${C.border}`, borderRadius:14,
        overflow:"auto", marginBottom:16, boxShadow:C.shadow,
      }}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead>
            <tr style={{background:C.surface,transition:"background 0.25s"}}>
              <th style={TH(C,160)}>ROLE</th>
              <th style={TH(C,80)}>RATE ({sym})</th>
              <th style={TH(C,80)}>HRS/WK</th>
              {weekLabels.map((w,i)=>(
                <th key={i} style={TH(C,70)}>
                  {editLabel===i ? (
                    <input autoFocus value={w}
                      onChange={e=>setWeekLabels(p=>p.map((l,j)=>j===i?e.target.value:l))}
                      onBlur={()=>setEditLabel(null)}
                      onKeyDown={e=>e.key==="Enter"&&setEditLabel(null)}
                      style={{
                        background:"transparent",border:"none",color:C.accent,
                        width:50,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",
                        fontSize:11,fontWeight:700,outline:`1px solid ${C.accent}`,
                        borderRadius:4,padding:"2px 4px",
                      }}
                    />
                  ):(
                    <span style={{cursor:"pointer",borderBottom:`1px dashed ${C.border}`}}
                      title="Click to rename" onClick={()=>setEditLabel(i)}>{w}</span>
                  )}
                </th>
              ))}
              <th style={{...TH(C,70),color:C.accent2}}>TOTAL</th>
              <th style={{...TH(C,70),color:C.accent}}>HOURS</th>
              <th style={{...TH(C,90),color:C.accent3}}>COST</th>
              <th style={TH(C,50)}></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role,ri)=>{
              const s=stats[ri];
              return (
                <tr key={role.id}
                  style={{borderTop:`1px solid ${C.border}`,transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >
                  <td style={TD}>
                    <TextInput value={role.name} onChange={v=>upd(role.id,"name",v)}
                      extraStyle={{fontWeight:600,fontSize:14}} C={C}/>
                  </td>
                  <td style={TD}><NumInput value={role.rate} onChange={v=>upd(role.id,"rate",v)} step={1} C={C}/></td>
                  <td style={TD}><NumInput value={role.hoursPerWeek??sprintHours} onChange={v=>upd(role.id,"hoursPerWeek",v)} step={1} min={1} C={C}/></td>
                  {role.weekAllocations.slice(0,numWeeks).map((w,wi)=>(
                    <td key={wi} style={TD}>
                      <NumInput value={w}
                        onChange={v=>updW(role.id,wi,Math.min(1,Math.max(0,v)))}
                        step={0.1} C={C}
                        extraStyle={{color:w===1?C.accent2:w===0?C.muted:C.text}}
                      />
                    </td>
                  ))}
                  <td style={{...TD,textAlign:"right"}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.accent2,fontSize:14}}>
                      {s.total.toFixed(1)}
                    </span>
                  </td>
                  <td style={{...TD,textAlign:"right"}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.accent,fontSize:13}}>
                      {s.hours}h
                    </span>
                  </td>
                  <td style={{...TD,textAlign:"right"}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.accent3,fontSize:14}}>
                      {fmt(s.cost,sym)}
                    </span>
                  </td>
                  <td style={TD}>
                    <div style={{display:"flex",gap:2}}>
                      <IconBtn onClick={()=>fillW(role.id,role.weekAllocations[0])} title="Fill all weeks with first value" color={C.accent} C={C}>↔</IconBtn>
                      <IconBtn onClick={()=>delR(role.id)} title="Delete role" color={C.danger} C={C}>✕</IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
              <td colSpan={3+numWeeks} style={{...TD,fontSize:12,color:C.muted,fontWeight:700,letterSpacing:"0.05em"}}>
                TOTALS
              </td>
              <td style={{...TD,textAlign:"right"}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.accent2}}>
                  {stats.reduce((a,s)=>a+s.total,0).toFixed(1)}
                </span>
              </td>
              <td style={{...TD,textAlign:"right"}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.accent,fontWeight:700}}>
                  {totalHours}h
                </span>
              </td>
              <td style={{...TD,textAlign:"right"}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:16,color:C.accent3}}>
                  {fmt(grandTotal,sym)}
                </span>
              </td>
              <td style={TD}/>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── actions ── */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={addR} style={{
          background:`linear-gradient(135deg,${C.accent}22,${C.accent2}22)`,
          border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8,
          padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600,
          fontFamily:"'Space Grotesk',sans-serif", display:"flex", alignItems:"center", gap:6,
        }}>+ Add Role</button>
        <Btn onClick={()=>changeWeeks(numWeeks+1)} C={C} accent={C.accent2}>+ Add Week</Btn>
        {numWeeks>1 && <Btn onClick={()=>changeWeeks(numWeeks-1)} C={C} accent={C.danger}>− Remove Week</Btn>}
        <span style={{marginLeft:"auto",color:C.muted,fontSize:12}}>
          💡 Click week headers to rename · ↔ fills all weeks with first value
        </span>
      </div>

      {/* ── cost breakdown ── */}
      <div style={{marginTop:28}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:12}}>
          COST BREAKDOWN
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {roles.map((r,i)=>{
            const s=stats[i];
            const pct=grandTotal>0?(s.cost/grandTotal*100).toFixed(1):0;
            const col=BAR_COLORS[i%BAR_COLORS.length];
            return (
              <div key={r.id} style={{
                background:C.card, border:`1px solid ${C.border}`, borderRadius:10,
                padding:"12px 16px", flex:"1 1 140px", minWidth:140,
                boxShadow:C.shadow, transition:"background 0.25s",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontWeight:700,fontSize:14}}>{r.name}</span>
                  <Badge color={col}>{pct}%</Badge>
                </div>
                <div style={{height:4,background:C.border,borderRadius:2,marginBottom:8}}>
                  <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:2,transition:"width 0.3s"}}/>
                </div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:700,color:col}}>
                  {fmt(s.cost,sym)}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {s.hours}h · {sym}{r.rate}/h
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
