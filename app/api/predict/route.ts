import { NextRequest, NextResponse } from "next/server";

const RXN_API_KEY = process.env.RXN_API_KEY || "";
const RXN_BASE_URL = "https://rxn.app.accelerate.science/rxn/api/api/v1";
const RXN_PROJECT_ID = process.env.RXN_PROJECT_ID || "";

export async function POST(req: NextRequest) {
  try {
    // 1. Parse input
    const { smiles1, smiles2 } = await req.json();

    // === DEBUG: הדפסת מידע בסיסי ===
    console.log("=== DEBUG START ===");
    console.log("API Key exists:", !!RXN_API_KEY);
    console.log("API Key length:", RXN_API_KEY.length);
    console.log("API Key starts with:", RXN_API_KEY.substring(0, 8) + "...");
    console.log("Project ID:", RXN_PROJECT_ID || "(empty)");
    console.log("SMILES1:", smiles1);
    console.log("SMILES2:", smiles2);
    console.log("===================");

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
          "Authorization": RXN_API_KEY,
        },
        body: JSON.stringify({ name: `FireChem_${Date.now()}` }),
      });

      // === DEBUG: תשובת יצירת פרויקט ===
      const createText = await createProjectRes.text();
      console.log("Create project status:", createProjectRes.status);
      console.log("Create project response:", createText.substring(0, 500));

      if (!createProjectRes.ok) {
        return NextResponse.json(
          { error: `שגיאה ביצירת פרויקט (${createProjectRes.status}): ${createText.substring(0, 100)}` },
          { status: 502 }
        );
      }

      const projectData = JSON.parse(createText);
      projectId = projectData?.payload?.id || projectData?.payload?.project_id;
      
      if (!projectId) {
        return NextResponse.json(
          { error: "לא ניתן ליצור פרויקט" },
          { status: 502 }
        );
      }
      console.log("Created project:", projectId);
    }

    // 3. Build reaction SMILES
    const reactionSmiles = `${smiles1}.${smiles2}`;
    console.log("Using Project ID:", projectId);
    console.log("Reaction SMILES:", reactionSmiles);

    // 4. Call IBM RXN - submit prediction
    const predictUrl = `${RXN_BASE_URL}/predictions/${projectId}/predict-reaction`;
    console.log("Predict URL:", predictUrl);

    const predictRes = await fetch(predictUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": RXN_API_KEY,
      },
      body: JSON.stringify({ reaction_smiles: reactionSmiles }),
    });

    // === DEBUG: תשובת חיזוי ===
    const predictText = await predictRes.text();
    console.log("Predict status:", predictRes.status);
    console.log("Predict response:", predictText.substring(0, 500));

    if (!predictRes.ok) {
      return NextResponse.json(
        { error: `RXN Error: ${predictRes.status} - ${predictText.substring(0, 200)}` },
        { status: 502 }
      );
    }

    const predictData = JSON.parse(predictText);
    const predictionId = predictData?.prediction_id || predictData?.payload?.id;
    if (!predictionId) {
      return NextResponse.json(
        { error: `לא התקבל מזהה חיזוי. Response: ${predictText.substring(0, 200)}` },
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
          headers: { "Authorization": RXN_API_KEY },
        }
      );

      // === DEBUG: תשובת polling ===
      const resultText = await resultRes.text();
      console.log(`Poll ${i + 1}: status=${resultRes.status}, body=${resultText.substring(0, 300)}`);

      if (resultRes.ok) {
        const data = JSON.parse(resultText);
        const attempts = data?.response?.payload?.attempts || data?.payload?.attempts;
        if (attempts?.length > 0) {
          results = attempts[0];
          console.log("SUCCESS! Got results:", JSON.stringify(results).substring(0, 200));
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
      { error: `שגיאה בשרת: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
