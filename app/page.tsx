"use client";

import { useState, useMemo } from "react";
import chemicals from "@/data/chemicals.json";

type Chemical = (typeof chemicals)[number];

interface ProductInfo {
  name: string | null;
  formula: string | null;
  cas: string | null;
  pubchemUrl: string | null;
  cid: number | null;
}

interface CompatibilityInfo {
  level: "incompatible" | "caution" | "compatible";
  icon: string;
  hazards_he: string[];
  hazards_en: string[];
  description_he: string;
  gases: string[];
}

interface PredictionResult {
  product?: string;
  confidence?: number | null;
  reactionSmiles?: string;
  productInfo?: ProductInfo | null;
  compatibility: CompatibilityInfo | null;
  isOrganic?: boolean;
  error?: string;
  allPredictions?: { product: string; confidence: number | null }[];
  reactants?: { chem1: any; chem2: any };
}

interface CustomChemical {
  name: string;
  formula: string;
  cas: string;
  smiles: string;
  pubchemUrl?: string;
  source: "pubchem";
  category_en: string;
  category_he: string;
}

const hazardLabels: Record<string, string> = {
  water_reactive: "💧 תגובתי למים",
  highly_flammable: "🔥 דליק מאוד",
  flammable: "🔥 דליק",
  corrosive: "⚗️ מאכל",
  toxic: "☠️ רעיל",
  highly_toxic: "💀 רעיל מאוד",
  fatal: "💀 קטלני",
  oxidizer: "⚡ מחמצן",
  explosive: "💥 נפיץ",
  carcinogen: "⚠️ מסרטן",
  irritant: "⚠️ מגרה",
  env_hazard: "🌍 מסוכן לסביבה",
  toxic_gas: "☁️ גז רעיל",
  compressed_gas: "🫧 גז דחוס",
  asphyxiant: "😶‍🌫️ חונק",
};

const levelStyles: Record<
  string,
  { bg: string; border: string; text: string; label: string }
> = {
  incompatible: {
    bg: "bg-red-900/40",
    border: "border-red-500/60",
    text: "text-red-400",
    label: "🔴 לא תואם — סכנה!",
  },
  caution: {
    bg: "bg-yellow-900/30",
    border: "border-yellow-500/50",
    text: "text-yellow-400",
    label: "🟡 זהירות — תגובה אפשרית",
  },
  compatible: {
    bg: "bg-green-900/30",
    border: "border-green-500/50",
    text: "text-green-400",
    label: "🟢 תואם — אין סכנה צפויה",
  },
};

export default function HomePage() {
  const [mode1, setMode1] = useState<"list" | "search">("list");
  const [mode2, setMode2] = useState<"list" | "search">("list");
  const [chem1, setChem1] = useState("");
  const [chem2, setChem2] = useState("");
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [searching1, setSearching1] = useState(false);
  const [searching2, setSearching2] = useState(false);
  const [custom1, setCustom1] = useState<CustomChemical | null>(null);
  const [custom2, setCustom2] = useState<CustomChemical | null>(null);
  const [searchError1, setSearchError1] = useState("");
  const [searchError2, setSearchError2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);

  const sortedChemicals = useMemo(
    () => [...chemicals].sort((a, b) => a.name_he.localeCompare(b.name_he, "he")),
    []
  );

  const getChemBySmiles = (smiles: string): Chemical | undefined =>
    chemicals.find((c) => c.smiles === smiles);

  const handleSearch = async (which: 1 | 2) => {
    const query = which === 1 ? search1 : search2;
    if (!query || query.trim().length < 2) return;

    if (which === 1) {
      setSearching1(true);
      setSearchError1("");
      setCustom1(null);
    } else {
      setSearching2(true);
      setSearchError2("");
      setCustom2(null);
    }

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: query.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        const custom: CustomChemical = {
          name: data.name || query,
          formula: data.formula || "",
          cas: data.cas || "",
          smiles: data.smiles,
          pubchemUrl: data.pubchemUrl,
          source: "pubchem",
          category_en: data.category_en || "Unknown",
          category_he: data.category_he || "לא ידוע",
        };

        if (which === 1) {
          setCustom1(custom);
          setChem1("");
        } else {
          setCustom2(custom);
          setChem2("");
        }

        if (data.source === "local") {
          if (which === 1) {
            setChem1(data.smiles);
            setMode1("list");
          } else {
            setChem2(data.smiles);
            setMode2("list");
          }
        }
      } else {
        if (which === 1) setSearchError1(data.error || "לא נמצא");
        else setSearchError2(data.error || "לא נמצא");
      }
    } catch {
      if (which === 1) setSearchError1("שגיאת תקשורת");
      else setSearchError2("שגיאת תקשורת");
    } finally {
      if (which === 1) setSearching1(false);
      else setSearching2(false);
    }
  };

  const getSmiles1 = () => (mode1 === "list" ? chem1 : custom1?.smiles || "");
  const getSmiles2 = () => (mode2 === "list" ? chem2 : custom2?.smiles || "");

  const getInfo1 = () => {
    if (mode1 === "list" && chem1) return getChemBySmiles(chem1);
    if (mode1 === "search" && custom1)
      return { name_he: custom1.name, name_en: custom1.name, formula: custom1.formula, cas: custom1.cas, category_he: custom1.category_he, hazards: [] as string[] };
    return undefined;
  };
  const getInfo2 = () => {
    if (mode2 === "list" && chem2) return getChemBySmiles(chem2);
    if (mode2 === "search" && custom2)
      return { name_he: custom2.name, name_en: custom2.name, formula: custom2.formula, cas: custom2.cas, category_he: custom2.category_he, hazards: [] as string[] };
    return undefined;
  };

  const handlePredict = async () => {
    const s1 = getSmiles1();
    const s2 = getSmiles2();
    if (!s1 || !s2) { setError("יש לבחור או לחפש שני חומרים"); return; }
    if (s1 === s2) { setError("יש לבחור שני חומרים שונים"); return; }

    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smiles1: s1,
          smiles2: s2,
          chem1Custom: mode1 === "search" && custom1 ? { category_en: custom1.category_en } : undefined,
          chem2Custom: mode2 === "search" && custom2 ? { category_en: custom2.category_en } : undefined,
        }),
      });

      const data = await res.json();
      if (data.error && !data.product && !data.compatibility) {
        setError(data.error);
      } else {
        setResult(data);
        if (data.error) setError(data.error);
      }
    } catch {
      setError("שגיאת תקשורת — נסה שוב");
    } finally {
      setLoading(false);
    }
  };

  const c1 = getInfo1();
  const c2 = getInfo2();
  const canPredict = !!getSmiles1() && !!getSmiles2();
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-fire-yellow mb-2">חיזוי תגובה כימית</h2>
        <p className="text-stone-400 text-sm">בחר שני חומרים מהרשימה או חפש כל חומר לפי שם / CAS</p>
      </div>

      <div className="glass-card p-6 space-y-5">
        <h3 className="text-fire-orange font-semibold text-lg mb-3">⚗️ בחירת חומרים</h3>

        {/* ── Chemical 1 ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-stone-300">חומר ראשון</label>
            <div className="flex gap-1">
              <button onClick={() => { setMode1("list"); setCustom1(null); setSearchError1(""); setResult(null); }} className={`text-xs px-2 py-1 rounded ${mode1 === "list" ? "bg-fire-orange text-white" : "bg-stone-700 text-stone-400"}`}>מהרשימה</button>
              <button onClick={() => { setMode1("search"); setChem1(""); setResult(null); }} className={`text-xs px-2 py-1 rounded ${mode1 === "search" ? "bg-fire-orange text-white" : "bg-stone-700 text-stone-400"}`}>🔍 חיפוש</button>
            </div>
          </div>

          {mode1 === "list" ? (
            <select value={chem1} onChange={(e) => { setChem1(e.target.value); setError(""); setResult(null); }} className="w-full p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none">
              <option value="">— בחר חומר —</option>
              {sortedChemicals.map((c) => (<option key={c.cas} value={c.smiles}>{c.name_he} | {c.name_en} | {c.formula}</option>))}
            </select>
          ) : (
            <div className="flex gap-2">
              <input type="text" value={search1} onChange={(e) => setSearch1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch(1)} placeholder="הקלד שם חומר או מספר CAS..." className="flex-1 p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none placeholder:text-stone-500" />
              <button onClick={() => handleSearch(1)} disabled={searching1 || search1.trim().length < 2} className="px-4 py-3 rounded-lg bg-fire-orange text-white font-bold disabled:bg-stone-700 disabled:text-stone-500">{searching1 ? "⏳" : "🔍"}</button>
            </div>
          )}
          {searchError1 && <p className="text-red-400 text-xs">⚠️ {searchError1}</p>}
          {custom1 && mode1 === "search" && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-2 text-sm">
              <span className="text-green-400">✅ נמצא: </span>
              <span className="text-stone-200">{custom1.name} | {custom1.formula} | CAS: {custom1.cas}</span>
            </div>
          )}
        </div>

        {/* ── Chemical 2 ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-stone-300">חומר שני</label>
            <div className="flex gap-1">
              <button onClick={() => { setMode2("list"); setCustom2(null); setSearchError2(""); setResult(null); }} className={`text-xs px-2 py-1 rounded ${mode2 === "list" ? "bg-fire-orange text-white" : "bg-stone-700 text-stone-400"}`}>מהרשימה</button>
              <button onClick={() => { setMode2("search"); setChem2(""); setResult(null); }} className={`text-xs px-2 py-1 rounded ${mode2 === "search" ? "bg-fire-orange text-white" : "bg-stone-700 text-stone-400"}`}>🔍 חיפוש</button>
            </div>
          </div>

          {mode2 === "list" ? (
            <select value={chem2} onChange={(e) => { setChem2(e.target.value); setError(""); setResult(null); }} className="w-full p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none">
              <option value="">— בחר חומר —</option>
              {sortedChemicals.map((c) => (<option key={c.cas} value={c.smiles}>{c.name_he} | {c.name_en} | {c.formula}</option>))}
            </select>
          ) : (
            <div className="flex gap-2">
              <input type="text" value={search2} onChange={(e) => setSearch2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch(2)} placeholder="הקלד שם חומר או מספר CAS..." className="flex-1 p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none placeholder:text-stone-500" />
              <button onClick={() => handleSearch(2)} disabled={searching2 || search2.trim().length < 2} className="px-4 py-3 rounded-lg bg-fire-orange text-white font-bold disabled:bg-stone-700 disabled:text-stone-500">{searching2 ? "⏳" : "🔍"}</button>
            </div>
          )}
          {searchError2 && <p className="text-red-400 text-xs">⚠️ {searchError2}</p>}
          {custom2 && mode2 === "search" && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-2 text-sm">
              <span className="text-green-400">✅ נמצא: </span>
              <span className="text-stone-200">{custom2.name} | {custom2.formula} | CAS: {custom2.cas}</span>
            </div>
          )}
        </div>

        {/* Selected chemicals info */}
        {(c1 || c2) && (
          <div className="space-y-2 mt-3">
            {c1 && (
              <div className="bg-stone-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-fire-yellow font-semibold">🧪 {c1.name_he} ({c1.formula})</span>
                  <span className="text-stone-400 text-xs">{c1.category_he} | CAS: {c1.cas}</span>
                </div>
                {c1.hazards && c1.hazards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c1.hazards.map((h: string) => (<span key={h} className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-500/30">{hazardLabels[h] || h}</span>))}
                  </div>
                )}
              </div>
            )}
            {c2 && (
              <div className="bg-stone-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-fire-yellow font-semibold">🧪 {c2.name_he} ({c2.formula})</span>
                  <span className="text-stone-400 text-xs">{c2.category_he} | CAS: {c2.cas}</span>
                </div>
                {c2.hazards && c2.hazards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c2.hazards.map((h: string) => (<span key={h} className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-500/30">{hazardLabels[h] || h}</span>))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Predict button */}
      <button onClick={handlePredict} disabled={loading || !canPredict} className={`w-full py-4 rounded-xl text-lg font-bold transition-all duration-300 ${loading || !canPredict ? "bg-stone-700 text-stone-500 cursor-not-allowed" : "bg-gradient-to-l from-fire-red via-fire-orange to-fire-yellow text-white fire-glow cursor-pointer hover:scale-[1.02]"}`}>
        {loading ? (<span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span>מחשב תגובה...</span>) : ("🔥 חזה תגובה")}
      </button>

      {error && !result?.compatibility && (
        <div className="glass-card p-4 border-red-500/40 text-center"><p className="text-red-400">⚠️ {error}</p></div>
      )}

      {/* ═══════ RESULTS ═══════ */}
      {result && (
        <div className="space-y-4">
          {/* Compatibility Card */}
          {result.compatibility && (() => {
            const style = levelStyles[result.compatibility.level];
            return (
              <div className={`glass-card p-5 ${style.border} ${style.bg} space-y-3`}>
                <h3 className={`font-bold text-lg text-center ${style.text}`}>{style.label}</h3>
                <p className="text-stone-200 text-sm text-center leading-relaxed">{result.compatibility.description_he}</p>
                {result.compatibility.hazards_he.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-stone-400 text-xs">סיכונים:</span>
                    <div className="flex flex-wrap gap-1">
                      {result.compatibility.hazards_he.map((h: string, i: number) => (
                        <span key={i} className={`text-xs px-2 py-1 rounded-full border ${result.compatibility!.level === "incompatible" ? "bg-red-900/40 text-red-300 border-red-500/40" : "bg-yellow-900/30 text-yellow-300 border-yellow-500/40"}`}>{h}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.compatibility.gases.length > 0 && (
                  <div className="bg-stone-900/50 rounded-lg p-3 mt-2">
                    <span className="text-stone-400 text-xs">גזים צפויים:</span>
                    <div className="mt-1 space-y-1">
                      {result.compatibility.gases.map((g: string, i: number) => (<p key={i} className="text-red-300 text-sm font-mono">☁️ {g}</p>))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {error && result.compatibility && (
            <div className="glass-card p-4 border-yellow-500/40 text-center">
              <p className="text-yellow-400 text-sm">⚠️ {error} — אבל ניתוח התאימות למעלה עדיין תקף</p>
            </div>
          )}

          {/* Non-organic disclaimer */}
          {result.isOrganic === false && (
            <div className="glass-card p-4 border-blue-500/30 bg-blue-900/20 text-center">
              <p className="text-blue-300 text-sm">ℹ️ תגובה זו אינה אורגנית — מודל ה-AI (ReactionT5) מתמחה בסינתזה אורגנית בלבד ולכן לא הופעל. ניתוח התאימות למעלה מבוסס על מאגר כללים כימיים.</p>
            </div>
          )}

          {/* AI Prediction Card (only for organic) */}
          {result.product && (
            <div className="glass-card p-6 space-y-4 border-fire-yellow/30">
              <h3 className="text-fire-yellow font-bold text-lg text-center">✅ תוצאת החיזוי (AI)</h3>
              <div className="bg-stone-800/60 rounded-lg p-4 space-y-3">
                {result.productInfo?.name && (<div><span className="text-stone-400 text-sm">שם התוצר:</span><p className="text-xl font-bold text-fire-orange mt-1">{result.productInfo.name}</p></div>)}
                {result.productInfo?.formula && (<div><span className="text-stone-400 text-sm">נוסחה מולקולרית:</span><p className="text-lg font-mono text-stone-200 mt-1">{result.productInfo.formula}</p></div>)}
                {result.productInfo?.cas && (<div><span className="text-stone-400 text-sm">מספר CAS:</span><p className="text-sm font-mono text-stone-300 mt-1">{result.productInfo.cas}</p></div>)}
                <div><span className="text-stone-400 text-sm">SMILES:</span><p className="text-sm font-mono text-fire-orange mt-1 break-all">{result.product}</p></div>
                {result.confidence !== null && result.confidence !== undefined && (
                  <div>
                    <span className="text-stone-400 text-sm">רמת ביטחון:</span>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-3 bg-stone-700 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-fire-red to-fire-yellow transition-all" style={{ width: `${result.confidence}%` }} /></div>
                      <span className="text-fire-yellow font-bold">{result.confidence}%</span>
                    </div>
                  </div>
                )}
                {result.productInfo?.pubchemUrl && (<div className="pt-2"><a href={result.productInfo.pubchemUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline">🔗 צפה ב-PubChem →</a></div>)}
                {result.reactionSmiles && (<div className="border-t border-stone-700 pt-3 mt-2"><span className="text-stone-400 text-sm">תגובה מלאה:</span><p className="text-xs font-mono text-stone-400 mt-1 break-all">{result.reactionSmiles}</p></div>)}
              </div>
              <p className="text-xs text-stone-500 text-center">⚠️ חיזוי AI מבוסס על מודל ReactionT5 (סינתזה אורגנית). תוצאות הן הערכה בלבד — יש לאמת מול גורם מקצועי.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
