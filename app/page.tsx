"use client";

import { useState } from "react";
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
  product: string;
  confidence: number | null;
  reactionSmiles: string;
  productInfo: ProductInfo | null;
  compatibility: CompatibilityInfo | null;
  error?: string;
  allPredictions?: { product: string; confidence: number | null }[];
  reactants?: {
    chem1: any;
    chem2: any;
  };
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

const levelStyles: Record<string, { bg: string; border: string; text: string; label: string }> = {
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
  const [chem1, setChem1] = useState("");
  const [chem2, setChem2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);

  const getChemBySmiles = (smiles: string): Chemical | undefined =>
    chemicals.find((c) => c.smiles === smiles);

  const handlePredict = async () => {
    if (!chem1 || !chem2) {
      setError("יש לבחור שני חומרים");
      return;
    }
    if (chem1 === chem2) {
      setError("יש לבחור שני חומרים שונים");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles1: chem1, smiles2: chem2 }),
      });

      const data = await res.json();

      if (data.error && !data.product) {
        setError(data.error);
        // Still show compatibility if available
        if (data.compatibility) {
          setResult(data);
        }
      } else {
        setResult(data);
      }
    } catch {
      setError("שגיאת תקשורת — נסה שוב");
    } finally {
      setLoading(false);
    }
  };

  const c1 = chem1 ? getChemBySmiles(chem1) : undefined;
  const c2 = chem2 ? getChemBySmiles(chem2) : undefined;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-fire-yellow mb-2">
          חיזוי תגובה כימית
        </h2>
        <p className="text-stone-400 text-sm">
          בחר שני חומרים וקבל את התוצר הצפוי + ניתוח תאימות
        </p>
      </div>

      {/* Chemical selectors */}
      <div className="glass-card p-6 space-y-5">
        <h3 className="text-fire-orange font-semibold text-lg mb-3">
          ⚗️ בחירת חומרים
        </h3>

        {/* Chemical 1 */}
        <div>
          <label className="block text-sm text-stone-300 mb-1">
            חומר ראשון
          </label>
          <select
            value={chem1}
            onChange={(e) => {
              setChem1(e.target.value);
              setError("");
              setResult(null);
            }}
            className="w-full p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none"
          >
            <option value="">— בחר חומר —</option>
            {chemicals.map((c) => (
              <option key={c.cas} value={c.smiles}>
                {c.name_he} | {c.name_en} | {c.formula}
              </option>
            ))}
          </select>
        </div>

        {/* Chemical 2 */}
        <div>
          <label className="block text-sm text-stone-300 mb-1">
            חומר שני
          </label>
          <select
            value={chem2}
            onChange={(e) => {
              setChem2(e.target.value);
              setError("");
              setResult(null);
            }}
            className="w-full p-3 rounded-lg bg-stone-800 border border-stone-600 text-stone-100 focus:border-fire-orange focus:outline-none"
          >
            <option value="">— בחר חומר —</option>
            {chemicals.map((c) => (
              <option key={c.cas} value={c.smiles}>
                {c.name_he} | {c.name_en} | {c.formula}
              </option>
            ))}
          </select>
        </div>

        {/* Selected chemicals info */}
        {(c1 || c2) && (
          <div className="space-y-2 mt-3">
            {c1 && (
              <div className="bg-stone-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-fire-yellow font-semibold">
                    🧪 {c1.name_he} ({c1.formula})
                  </span>
                  <span className="text-stone-400 text-xs">
                    {c1.category_he} | CAS: {c1.cas}
                  </span>
                </div>
                {c1.hazards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c1.hazards.map((h) => (
                      <span
                        key={h}
                        className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-500/30"
                      >
                        {hazardLabels[h] || h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {c2 && (
              <div className="bg-stone-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-fire-yellow font-semibold">
                    🧪 {c2.name_he} ({c2.formula})
                  </span>
                  <span className="text-stone-400 text-xs">
                    {c2.category_he} | CAS: {c2.cas}
                  </span>
                </div>
                {c2.hazards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c2.hazards.map((h) => (
                      <span
                        key={h}
                        className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-500/30"
                      >
                        {hazardLabels[h] || h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Predict button */}
      <button
        onClick={handlePredict}
        disabled={loading || !chem1 || !chem2}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
          loading || !chem1 || !chem2
            ? "bg-stone-700 text-stone-500 cursor-not-allowed"
            : "bg-gradient-to-l from-fire-red via-fire-orange to-fire-yellow text-white fire-glow cursor-pointer hover:scale-[1.02]"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            מחשב תגובה...
          </span>
        ) : (
          "🔥 חזה תגובה"
        )}
      </button>

      {/* Error message (without compatibility) */}
      {error && !result?.compatibility && (
        <div className="glass-card p-4 border-red-500/40 text-center">
          <p className="text-red-400">⚠️ {error}</p>
        </div>
      )}

      {/* ═══════ RESULTS ═══════ */}
      {result && (
        <div className="space-y-4">

          {/* ── Compatibility Card ── */}
          {result.compatibility && (() => {
            const style = levelStyles[result.compatibility.level];
            return (
              <div className={`glass-card p-5 ${style.border} ${style.bg} space-y-3`}>
                <h3 className={`font-bold text-lg text-center ${style.text}`}>
                  {style.label}
                </h3>
                <p className="text-stone-200 text-sm text-center leading-relaxed">
                  {result.compatibility.description_he}
                </p>

                {/* Hazards list */}
                {result.compatibility.hazards_he.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-stone-400 text-xs">סיכונים:</span>
                    <div className="flex flex-wrap gap-1">
                      {result.compatibility.hazards_he.map((h, i) => (
                        <span
                          key={i}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            result.compatibility!.level === "incompatible"
                              ? "bg-red-900/40 text-red-300 border-red-500/40"
                              : "bg-yellow-900/30 text-yellow-300 border-yellow-500/40"
                          }`}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gases */}
                {result.compatibility.gases.length > 0 && (
                  <div className="bg-stone-900/50 rounded-lg p-3 mt-2">
                    <span className="text-stone-400 text-xs">גזים צפויים:</span>
                    <div className="mt-1 space-y-1">
                      {result.compatibility.gases.map((g, i) => (
                        <p key={i} className="text-red-300 text-sm font-mono">
                          ☁️ {g}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Error with compatibility ── */}
          {error && result.compatibility && (
            <div className="glass-card p-4 border-yellow-500/40 text-center">
              <p className="text-yellow-400 text-sm">
                ⚠️ {error} — אבל ניתוח התאימות למעלה עדיין תקף
              </p>
            </div>
          )}

          {/* ── Prediction Result Card ── */}
          {result.product && (
            <div className="glass-card p-6 space-y-4 border-fire-yellow/30">
              <h3 className="text-fire-yellow font-bold text-lg text-center">
                ✅ תוצאת החיזוי (AI)
              </h3>

              <div className="bg-stone-800/60 rounded-lg p-4 space-y-3">
                {/* Product name from PubChem */}
                {result.productInfo?.name && (
                  <div>
                    <span className="text-stone-400 text-sm">שם התוצר:</span>
                    <p className="text-xl font-bold text-fire-orange mt-1">
                      {result.productInfo.name}
                    </p>
                  </div>
                )}

                {/* Product formula */}
                {result.productInfo?.formula && (
                  <div>
                    <span className="text-stone-400 text-sm">נוסחה מולקולרית:</span>
                    <p className="text-lg font-mono text-stone-200 mt-1">
                      {result.productInfo.formula}
                    </p>
                  </div>
                )}

                {/* CAS number */}
                {result.productInfo?.cas && (
                  <div>
                    <span className="text-stone-400 text-sm">מספר CAS:</span>
                    <p className="text-sm font-mono text-stone-300 mt-1">
                      {result.productInfo.cas}
                    </p>
                  </div>
                )}

                {/* Product SMILES */}
                <div>
                  <span className="text-stone-400 text-sm">SMILES:</span>
                  <p className="text-sm font-mono text-fire-orange mt-1 break-all">
                    {result.product}
                  </p>
                </div>

                {/* Confidence */}
                {result.confidence !== null && (
                  <div>
                    <span className="text-stone-400 text-sm">רמת ביטחון:</span>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-3 bg-stone-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-fire-red to-fire-yellow transition-all"
                          style={{ width: `${result.confidence}%` }}
                        />
                      </div>
                      <span className="text-fire-yellow font-bold">
                        {result.confidence}%
                      </span>
                    </div>
                  </div>
                )}

                {/* PubChem link */}
                {result.productInfo?.pubchemUrl && (
                  <div className="pt-2">
                    <a
                      href={result.productInfo.pubchemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                      🔗 צפה ב-PubChem →
                    </a>
                  </div>
                )}

                {/* Reaction */}
                <div className="border-t border-stone-700 pt-3 mt-2">
                  <span className="text-stone-400 text-sm">תגובה מלאה:</span>
                  <p className="text-xs font-mono text-stone-400 mt-1 break-all">
                    {result.reactionSmiles}
                  </p>
                </div>
              </div>

              <p className="text-xs text-stone-500 text-center">
                ⚠️ חיזוי AI מבוסס על מודל ReactionT5 (סינתזה אורגנית). תוצאות הן הערכה בלבד — יש לאמת מול גורם מקצועי.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}







