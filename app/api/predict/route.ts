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

    // אם אין PROJECT_ID - ניצור פרויקט חדש
    let projectId = RXN_PROJECT_ID;
    
    if (!projectId) {
      // יצירת פרויקט חדש
      const createProjectRes = await fetch(`${RXN_BASE_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RXN_API_KEY}`,  // ✅ תוקן: הוספת Bearer
        },
        body: JSON.stringify({ name: `FireChem_${Date.now()}` }),
      });

      if (!createProjectRes.ok) {
        const errText = await createProjectRes.text();
        console.error("Create project error:", createProjectRes.status, errText);
        return NextResponse.json(
          { error: `שגיאה ביצירת פרויקט (${createProjectRes.status})` },
          { status: 502 }
        );
      }

      const projectData = await createProjectRes.json();
      projectId = projectData?.payload?.id || projectData?.payload?.project_id;
      
      if (!projectId) {
        return NextResponse.json(
          { error: "לא ניתן ליצור פרויקט" },
          { status: 502 }
        );
      }
      console.log("Created project:", projectId);
    }

    // 3. Build reaction SMILES: "reactant1.reactant2"
    const reactionSmiles = `${smiles1}.${smiles2}`;
    console.log("Reaction SMILES:", reactionSmiles);

    // 4. Call IBM RXN - submit prediction
    const predictRes = await fetch(
      `${RXN_BASE_URL}/predictions/${projectId}/predict-reaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RXN_API_KEY}`,  // ✅ תוקן: הוספת Bearer
        },
        body: JSON.stringify({ reaction_smiles: reactionSmiles }),
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
    console.log("Predict response:", JSON.stringify(predictData).substring(0, 200));
    
    const predictionId = predictData?.prediction_id || predictData?.payload?.id;
    if (!predictionId) {
      return NextResponse.json(
        { error: "לא התקבל מזהה חיזוי" },
        { status: 502 }
      );
    }
    console.log("Prediction ID:", predictionId);

    // 5. Wait & fetch results (poll every 2s, max 30s)
    let results = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      
      const resultRes = await fetch(
        `${RXN_BASE_URL}/predictions/${projectId}/${predictionId}`,
        {
          headers: { "Authorization": `Bearer ${RXN_API_KEY}` },  // ✅ תוקן: הוספת Bearer
        }
      );

      if (resultRes.ok) {
        const data = await resultRes.json();
        const attempts = data?.response?.payload?.attempts || data?.payload?.attempts;
        if (attempts?.length > 0) {
          results = attempts[0];
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
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "שגיאה בשרת" },
      { status: 500 }
    );
  }
}
