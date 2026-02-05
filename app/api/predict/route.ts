/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך ReactionT5 (Hugging Face Space)
 * + טבלת תאימות כימית + זיהוי תוצר דרך PubChem
 * v5 - Next.js App Router
 */

import { NextRequest, NextResponse } from "next/server";
import chemicals from "@/data/chemicals.json";
import compatibility from "@/data/compatibility.json";

const HF_SPACE_URL =
  "https://roiez-fire-chem-predict.hf.space/gradio_api/call/predict";

/* ───────── helpers ───────── */

function findChemical(smiles: string) {
  return chemicals.find((c) => c.smiles === smiles);
}

function getCompatibility(cat1: string, cat2: string) {
  const rules = (compatibility as any).rules as any[];
  return rules.find(
    (r) =>
      (r.group1 === cat1 && r.group2 === cat2) ||
      (r.group1 === cat2 && r.group2 === cat1)
  );
}

/* ───────── main handler ───────── */

export async function POST(req: NextRequest) {
  try {
    const { smiles1, smiles2 } = await req.json();

    if (!smiles1 || !smiles2) {
      return NextResponse.json(
        { error: "חסרים נתוני SMILES של שני החומרים" },
        { status: 400 }
      );
    }

    /* ── 1. Find chemicals in our DB ── */
    const chem1 = findChemical(smiles1);
    const chem2 = findChemical(smiles2);
    const cat1 = chem1?.category_en || "Unknown";
    const cat2 = chem2?.category_en || "Unknown";

    /* ── 2. Get compatibility rule ── */
    const rule = getCompatibility(cat1, cat2);

    /* ── 3. Call HF Space for reaction prediction ── */
    // Step A: Submit
    const submitRes = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [smiles1, smiles2] }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `שגיאה בחיבור למודל (${submitRes.status})`,
          compatibility: rule || null,
        },
        { status: 200 }
      );
    }

    const submitData = await submitRes.json();
    const eventId = submitData?.event_id;

    if (!eventId) {
      return NextResponse.json(
        {
          error: "לא התקבל מזהה מהמודל",
          compatibility: rule || null,
        },
        { status: 200 }
      );
    }

    // Step B: Poll for result
    const resultRes = await fetch(`${HF_SPACE_URL}/${eventId}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    });

    const resultText = await resultRes.text();

    // Parse SSE response - find the "data:" line with JSON
    let predictionJson: any = null;
    const lines = resultText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            predictionJson = JSON.parse(parsed[0]);
          }
        } catch {
          // not JSON, skip
        }
      }
    }

    if (!predictionJson || !predictionJson.success) {
      return NextResponse.json(
        {
          error: "המודל לא הצליח לחזות תוצר",
          compatibility: rule || null,
        },
        { status: 200 }
      );
    }

    /* ── 4. Build response ── */
    return NextResponse.json({
      // Prediction result
      product: predictionJson.product,
      confidence: predictionJson.confidence,
      reactionSmiles: predictionJson.reactionSmiles,
      allPredictions: predictionJson.allPredictions || [],

      // Product identification from PubChem
      productInfo: predictionJson.productInfo || null,

      // Compatibility data
      compatibility: rule
        ? {
            level: rule.level,
            icon: rule.icon,
            hazards_he: rule.hazards_he,
            hazards_en: rule.hazards_en,
            description_he: rule.description_he,
            gases: rule.gases,
          }
        : null,

      // Reactant info
      reactants: {
        chem1: chem1
          ? {
              name_he: chem1.name_he,
              name_en: chem1.name_en,
              formula: chem1.formula,
              category_he: chem1.category_he,
              category_en: chem1.category_en,
              hazards: chem1.hazards,
            }
          : null,
        chem2: chem2
          ? {
              name_he: chem2.name_he,
              name_en: chem2.name_en,
              formula: chem2.formula,
              category_he: chem2.category_he,
              category_en: chem2.category_en,
              hazards: chem2.hazards,
            }
          : null,
      },
    });
  } catch (e: any) {
    console.error("Predict API error:", e);
    return NextResponse.json(
      { error: `שגיאה: ${e.message}` },
      { status: 500 }
    );
  }
}
