/**
 * API Route: /api/predict
 * v6 - עם הסתרת AI לתגובות לא-אורגניות + חיפוש PubChem
 */

import { NextRequest, NextResponse } from "next/server";
import chemicals from "@/data/chemicals.json";
import compatibility from "@/data/compatibility.json";

const HF_SPACE_URL =
  "https://roiez-fire-chem-predict.hf.space/gradio_api/call";

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

const NON_ORGANIC_CATEGORIES = [
  "Water Reactive",
  "Acids",
  "Bases",
  "Oxidizers",
  "Gases",
  "Water",
];

function isOrganicReaction(cat1: string, cat2: string): boolean {
  const c1NonOrg = NON_ORGANIC_CATEGORIES.includes(cat1);
  const c2NonOrg = NON_ORGANIC_CATEGORIES.includes(cat2);
  if (c1NonOrg && c2NonOrg) return false;
  return true;
}

/* ───────── main handler ───────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // --- Search endpoint ---
    if (body.action === "search") {
      return handleSearch(body.query);
    }

    // --- Predict endpoint ---
    const { smiles1, smiles2, chem1Custom, chem2Custom } = body;

    if (!smiles1 || !smiles2) {
      return NextResponse.json(
        { error: "חסרים נתוני SMILES של שני החומרים" },
        { status: 400 }
      );
    }

    /* ── 1. Find chemicals in our DB ── */
    const chem1 = findChemical(smiles1);
    const chem2 = findChemical(smiles2);
    const cat1 = chem1?.category_en || chem1Custom?.category_en || "Unknown";
    const cat2 = chem2?.category_en || chem2Custom?.category_en || "Unknown";

    /* ── 2. Get compatibility rule ── */
    const rule = getCompatibility(cat1, cat2);

    /* ── 3. Check if organic reaction ── */
    const organic = isOrganicReaction(cat1, cat2);

    let predictionData: any = null;

    if (organic) {
      /* ── 4. Call HF Space for reaction prediction ── */
      try {
        const submitRes = await fetch(`${HF_SPACE_URL}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: [smiles1, smiles2] }),
        });

        if (submitRes.ok) {
          const submitData = await submitRes.json();
          const eventId = submitData?.event_id;

          if (eventId) {
            const resultRes = await fetch(
              `${HF_SPACE_URL}/predict/${eventId}`,
              {
                method: "GET",
                headers: { Accept: "text/event-stream" },
              }
            );

            const resultText = await resultRes.text();
            const lines = resultText.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                    predictionData = JSON.parse(parsed[0]);
                  }
                } catch {
                  // skip
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("HF prediction error:", e);
      }
    }

    /* ── 5. Build response ── */
    const response: any = {
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

      isOrganic: organic,

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
          : chem1Custom || null,
        chem2: chem2
          ? {
              name_he: chem2.name_he,
              name_en: chem2.name_en,
              formula: chem2.formula,
              category_he: chem2.category_he,
              category_en: chem2.category_en,
              hazards: chem2.hazards,
            }
          : chem2Custom || null,
      },
    };

    if (organic && predictionData?.success) {
      response.product = predictionData.product;
      response.confidence = predictionData.confidence;
      response.reactionSmiles = predictionData.reactionSmiles;
      response.allPredictions = predictionData.allPredictions || [];
      response.productInfo = predictionData.productInfo || null;
    } else if (organic) {
      response.error = "המודל לא הצליח לחזות תוצר";
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error("Predict API error:", e);
    return NextResponse.json(
      { error: `שגיאה: ${e.message}` },
      { status: 500 }
    );
  }
}

/* ───────── Search handler ───────── */

async function handleSearch(query: string) {
  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "יש להזין שם חומר או מספר CAS (לפחות 2 תווים)" },
      { status: 400 }
    );
  }

  try {
    const q = query.trim().toLowerCase();
    const localMatch = chemicals.find(
      (c) =>
        c.name_en.toLowerCase().includes(q) ||
        c.name_he.includes(q) ||
        c.cas === q.trim() ||
        c.formula.toLowerCase() === q
    );

    if (localMatch) {
      return NextResponse.json({
        success: true,
        source: "local",
        name: localMatch.name_en,
        name_he: localMatch.name_he,
        formula: localMatch.formula,
        cas: localMatch.cas,
        smiles: localMatch.smiles,
        category_en: localMatch.category_en,
        category_he: localMatch.category_he,
        hazards: localMatch.hazards,
      });
    }

    // Not in local DB → search PubChem via HF Space
    const submitRes = await fetch(`${HF_SPACE_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [query.trim()] }),
    });

    if (!submitRes.ok) {
      return NextResponse.json({
        success: false,
        error: "שגיאה בחיבור לשירות החיפוש",
      });
    }

    const submitData = await submitRes.json();
    const eventId = submitData?.event_id;

    if (!eventId) {
      return NextResponse.json({
        success: false,
        error: "שגיאה בשירות החיפוש",
      });
    }

    const resultRes = await fetch(`${HF_SPACE_URL}/search/${eventId}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    });

    const resultText = await resultRes.text();
    let searchResult: any = null;

    const lines = resultText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            searchResult = JSON.parse(parsed[0]);
          }
        } catch {
          // skip
        }
      }
    }

    if (!searchResult?.success) {
      return NextResponse.json({
        success: false,
        error: searchResult?.error || `לא נמצא חומר: ${query}`,
      });
    }

    return NextResponse.json({
      success: true,
      source: "pubchem",
      name: searchResult.name,
      formula: searchResult.formula,
      cas: searchResult.cas,
      smiles: searchResult.smiles,
      pubchemUrl: searchResult.pubchemUrl,
      cid: searchResult.cid,
      category_en: "Unknown",
      category_he: "לא ידוע",
      hazards: [],
    });
  } catch (e: any) {
    console.error("Search error:", e);
    return NextResponse.json({
      success: false,
      error: `שגיאה בחיפוש: ${e.message}`,
    });
  }
}
