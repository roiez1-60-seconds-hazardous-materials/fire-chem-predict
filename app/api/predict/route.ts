/**
 * API Route: /api/predict
 * v8 - with debug logging for PubChem search
 */

import { NextRequest, NextResponse } from "next/server";
import chemicals from "@/data/chemicals.json";
import compatibility from "@/data/compatibility.json";

const HF_SPACE_URL =
  "https://roiez-fire-chem-predict.hf.space/gradio_api/call";

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
  "Water Reactive", "Acids", "Bases", "Oxidizers", "Gases", "Water",
];

function isOrganicReaction(cat1: string, cat2: string): boolean {
  const c1NonOrg = NON_ORGANIC_CATEGORIES.includes(cat1);
  const c2NonOrg = NON_ORGANIC_CATEGORIES.includes(cat2);
  if (c1NonOrg && c2NonOrg) return false;
  return true;
}

/* ───────── PubChem direct search ───────── */

async function searchPubChem(query: string) {
  console.log("=== PubChem Search START ===");
  console.log("Query:", query);

  try {
    // Step 1: Get CID
    const encoded = encodeURIComponent(query.trim());
    const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/cids/JSON`;
    console.log("CID URL:", cidUrl);

    const cidRes = await fetch(cidUrl);
    console.log("CID Response status:", cidRes.status);

    if (!cidRes.ok) {
      const errBody = await cidRes.text();
      console.log("CID Error body:", errBody.substring(0, 200));
      return null;
    }

    const cidData = await cidRes.json();
    const cid = cidData?.IdentifierList?.CID?.[0];
    console.log("CID found:", cid);

    if (!cid) return null;

    const result: any = {
      cid,
      pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      name: null, formula: null, cas: null, smiles: null,
    };

    // Step 2: Get properties
    const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/CanonicalSMILES,IUPACName,MolecularFormula/JSON`;
    console.log("Props URL:", propsUrl);

    const propsRes = await fetch(propsUrl);
    console.log("Props Response status:", propsRes.status);

    if (propsRes.ok) {
      const propsData = await propsRes.json();
      const prop = propsData?.PropertyTable?.Properties?.[0];
      console.log("Props data:", JSON.stringify(prop).substring(0, 200));
      if (prop) {
        result.smiles = prop.CanonicalSMILES || prop.ConnectivitySMILES || prop.IsomericSMILES || null;
        result.name = prop.IUPACName || null;
        result.formula = prop.MolecularFormula || null;
      }
    }

    // Step 3: Get synonyms
    const synUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`;
    const synRes = await fetch(synUrl);
    console.log("Synonyms Response status:", synRes.status);

    if (synRes.ok) {
      const synData = await synRes.json();
      const synonyms = synData?.InformationList?.Information?.[0]?.Synonym || [];
      console.log("First 3 synonyms:", synonyms.slice(0, 3));

      for (const syn of synonyms.slice(0, 50)) {
        if (/^\d{2,7}-\d{2}-\d$/.test(syn)) {
          result.cas = syn;
          break;
        }
      }
      for (const syn of synonyms.slice(0, 10)) {
        if (!/^\d{2,7}-\d{2}-\d$/.test(syn) && syn.length < 80) {
          result.name = syn;
          break;
        }
      }
    }

    console.log("Final result:", JSON.stringify(result).substring(0, 300));
    console.log("=== PubChem Search END ===");
    return result;
  } catch (e: any) {
    console.error("PubChem search error:", e.message);
    return null;
  }
}

/* ───────── main handler ───────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("=== API Called ===", "action:", body.action || "predict");

    if (body.action === "search") {
      return handleSearch(body.query);
    }

    const { smiles1, smiles2, chem1Custom, chem2Custom } = body;

    if (!smiles1 || !smiles2) {
      return NextResponse.json(
        { error: "חסרים נתוני SMILES של שני החומרים" },
        { status: 400 }
      );
    }

    const chem1 = findChemical(smiles1);
    const chem2 = findChemical(smiles2);
    const cat1 = chem1?.category_en || chem1Custom?.category_en || "Unknown";
    const cat2 = chem2?.category_en || chem2Custom?.category_en || "Unknown";
    const rule = getCompatibility(cat1, cat2);
    const organic = isOrganicReaction(cat1, cat2);

    let predictionData: any = null;

    if (organic) {
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
              { method: "GET", headers: { Accept: "text/event-stream" } }
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
                } catch { }
              }
            }
          }
        }
      } catch (e) {
        console.error("HF prediction error:", e);
      }
    }

    const response: any = {
      compatibility: rule
        ? {
            level: rule.level, icon: rule.icon,
            hazards_he: rule.hazards_he, hazards_en: rule.hazards_en,
            description_he: rule.description_he, gases: rule.gases,
          }
        : null,
      isOrganic: organic,
      reactants: {
        chem1: chem1
          ? { name_he: chem1.name_he, name_en: chem1.name_en, formula: chem1.formula, category_he: chem1.category_he, category_en: chem1.category_en, hazards: chem1.hazards }
          : chem1Custom || null,
        chem2: chem2
          ? { name_he: chem2.name_he, name_en: chem2.name_en, formula: chem2.formula, category_he: chem2.category_he, category_en: chem2.category_en, hazards: chem2.hazards }
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
    return NextResponse.json({ error: `שגיאה: ${e.message}` }, { status: 500 });
  }
}

/* ───────── Search handler ───────── */

async function handleSearch(query: string) {
  console.log("=== handleSearch called ===", "query:", query);

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "יש להזין לפחות 2 תווים" }, { status: 400 });
  }

  try {
    const q = query.trim().toLowerCase();
    console.log("Searching local DB for:", q);

    const localMatch = chemicals.find(
      (c) =>
        c.name_en.toLowerCase().includes(q) ||
        c.name_he.includes(q) ||
        c.cas === q.trim() ||
        c.formula.toLowerCase() === q
    );

    if (localMatch) {
      console.log("Found in local DB:", localMatch.name_en);
      return NextResponse.json({
        success: true, source: "local",
        name: localMatch.name_en, name_he: localMatch.name_he,
        formula: localMatch.formula, cas: localMatch.cas,
        smiles: localMatch.smiles, category_en: localMatch.category_en,
        category_he: localMatch.category_he, hazards: localMatch.hazards,
      });
    }

    console.log("Not in local DB, searching PubChem...");
    const pubchemResult = await searchPubChem(query.trim());
    console.log("PubChem result:", pubchemResult ? "found" : "not found");
    console.log("SMILES:", pubchemResult?.smiles);

    if (!pubchemResult || !pubchemResult.smiles) {
      console.log("=== Search FAILED ===");
      return NextResponse.json({
        success: false,
        error: `לא נמצא חומר: ${query}`,
      });
    }

    console.log("=== Search SUCCESS ===");
    return NextResponse.json({
      success: true, source: "pubchem",
      name: pubchemResult.name, formula: pubchemResult.formula,
      cas: pubchemResult.cas, smiles: pubchemResult.smiles,
      pubchemUrl: pubchemResult.pubchemUrl, cid: pubchemResult.cid,
      category_en: "Unknown", category_he: "לא ידוע", hazards: [],
    });
  } catch (e: any) {
    console.error("Search error:", e.message);
    return NextResponse.json({ success: false, error: `שגיאה: ${e.message}` });
  }
}
