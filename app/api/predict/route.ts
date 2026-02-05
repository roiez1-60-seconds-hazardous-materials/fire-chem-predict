import { NextRequest, NextResponse } from "next/server";

const RXN_API_KEY = process.env.RXN_API_KEY || "";
const RXN_BASE_URL = "https://rxn.app.accelerate.science/rxn/api/api/v1";
const RXN_PROJECT_ID = process.env.RXN_PROJECT_ID || "";

export async function POST(req: NextRequest) {
  try {
    // 1. Parse input
    const { smiles1, smiles2 } = await req.json();

    // 2. Validate
    if (!smiles1 || !smiles2) {
      return NextResponse.json(
        { error: "יש לבחור שני חומרים" },
        { status: 400 }
      );
    }

    if (!RXN_API_KEY) {
      return NextResponse.json(
        { error: "API Key לא הוגדר" },
        { status: 500 }
      );
    }

    // 3. Build reaction SMILES: "reactant1.reactant2"
    const reactionSmiles = `${smiles1}.${smiles2}`;

    // 4. Call IBM RXN - submit prediction
    const predictRes = await fetch(
      `${RXN_BASE_URL}/predictions/${RXN_PROJECT_ID}/predict-reaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RXN_API_KEY}`,
        },
        body: JSON.stringify({ reactants: reactionSmiles }),
      }
    );

    if (!predictRes.ok) {
      const errText = await predictRes.text();
      console.error("RXN Error:", predictRes.status, errText);
      return NextResponse.json(
        { error: `שגיאה בשליחה ל-IBM RXN (${predictRes.status})` },
        { status: 502 }
      );
    }

    const predictData = await predictRes.json();
    const predictionId = predictData?.prediction_id;

    if (!predictionId) {
      return NextResponse.json(
        { error: "לא התקבל מזהה חיזוי" },
        { status: 502 }
      );
    }

    // 5. Wait & fetch results (poll every 2s, max 30s)
    let results = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const resultRes = await fetch(
        `${RXN_BASE_URL}/predictions/${RXN_PROJECT_ID}/predict-reaction/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${RXN_API_KEY}` },
        }
      );

      if (resultRes.ok) {
        const data = await resultRes.json();
        if (data?.response?.payload?.attempts?.length > 0) {
          results = data.response.payload.attempts[0];
          break;
        }
      }
    }

    // 6. Handle response
    if (!results) {
      return NextResponse.json(
        { error: "לא התקבלו תוצאות — נסה שוב" },
        { status: 504 }
      );
    }

    return NextResponse.json({
      status: "ok",
      product: results.smiles || "לא זוהה תוצר",
      confidence: results.confidence
        ? Math.round(results.confidence * 100)
        : null,
      reactionSmiles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "שגיאה בשרת" },
      { status: 500 }
    );
  }
}
