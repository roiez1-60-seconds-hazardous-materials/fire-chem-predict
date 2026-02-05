"use client";

import { useState } from "react";
import chemicals from "@/data/chemicals.json";

type Chemical = (typeof chemicals)[number];

interface PredictionResult {
  product: string;
  confidence: number | null;
  reactionSmiles: string;
}

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

      if (!data.success) {
        setError(data.error || "שגיאה לא צפויה");
      } else {
        setResult({
          product: data.product || "לא ידוע",
          confidence: data.confidence ?? null,
          reactionSmiles: data.reactionSmiles || `${chem1}.${chem2}`,
        });
      }
    } catch {
      setError("שגיאת תקשורת — נסה שוב");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-fire-yellow mb-2">
          חיזוי תגובה כימית
        </h2>
        <p className="text-stone-400 text-sm">
          בחר שני חומרים וקבל את התוצר הצפוי — מופעל ע&quot;י ReactionT5
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
                {c.name_he} | {c.name_en} | CAS: {c.cas}
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
                {c.name_he} | {c.name_en} | CAS: {c.cas}
              </option>
            ))}
          </select>
        </div>

        {/* Selected info cards */}
        {(chem1 || chem2) && (
          <div className="flex gap-3 flex-wrap mt-2">
            {chem1 &&
              (() => {
                const c = getChemBySmiles(chem1);
                return c ? (
                  <span className="px-3 py-1 rounded-full bg-fire-orange/20 text-fire-yellow text-sm">
                    🧪 {c.name_he} ({c.formula})
                  </span>
                ) : null;
              })()}
            {chem2 &&
              (() => {
                const c = getChemBySmiles(chem2);
                return c ? (
                  <span className="px-3 py-1 rounded-full bg-fire-orange/20 text-fire-yellow text-sm">
                    🧪 {c.name_he} ({c.formula})
                  </span>
                ) : null;
              })()}
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
            מחשב תגובה... (עלול לקחת עד 30 שניות)
          </span>
        ) : (
          "🔥 חזה תגובה"
        )}
      </button>

      {/* Error message */}
      {error && (
        <div className="glass-card p-4 border-red-500/40 text-center">
          <p className="text-red-400">⚠️ {error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="glass-card p-6 space-y-4 border-fire-yellow/30">
          <h3 className="text-fire-yellow font-bold text-lg text-center">
            ✅ תוצאת החיזוי
          </h3>

          <div className="bg-stone-800/60 rounded-lg p-4 space-y-3">
            {/* Product SMILES */}
            <div>
              <span className="text-stone-400 text-sm">תוצר (SMILES):</span>
              <p className="text-xl font-mono text-fire-orange mt-1 break-all">
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

            {/* Reaction */}
            <div>
              <span className="text-stone-400 text-sm">תגובה מלאה:</span>
              <p className="text-sm font-mono text-stone-300 mt-1 break-all">
                {result.reactionSmiles} → {result.product}
              </p>
            </div>
          </div>

          <p className="text-xs text-stone-500 text-center">
            ⚠️ תוצאה זו מבוססת על מודל ReactionT5 AI — יש לאמת מול גורם
            מקצועי
          </p>
        </div>
      )}
    </div>
  );
}
