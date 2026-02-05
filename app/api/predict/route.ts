/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך IBM RXN for Chemistry
 * גרסה מתוקנת עם טיפול שגיאות משופר
 */

export default async function handler(req, res) {
  console.log("=== DEBUG START ===");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { smiles1, smiles2, apiKey } = req.body;

  console.log("API Key exists:", !!apiKey);
  console.log("API Key length:", apiKey ? apiKey.length : 0);
  console.log("SMILES1:", smiles1);
  console.log("SMILES2:", smiles2);

  // ולידציה
  if (!smiles1 || !smiles2) {
    return res.status(400).json({
      success: false,
      error: "חסרים נתוני SMILES של שני החומרים",
    });
  }

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: "חסר מפתח API של IBM RXN",
    });
  }

  const RXN_BASE_URL = "https://rxn.app.accelerate.science/rxn/api/api/v1";
  const reactionSmiles = `${smiles1}.${smiles2}`;

  try {
    // --- שלב 1: יצירת פרויקט ---
    console.log("Step 1: Creating project...");
    const projectRes = await fetch(`${RXN_BASE_URL}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ name: `ChemPredict_${Date.now()}` }),
    });

    console.log("Project response status:", projectRes.status);

    if (!projectRes.ok) {
      const errText = await projectRes.text();
      console.log("Project error response:", errText);
      return res.status(200).json({
        success: false,
        error: `שגיאה ביצירת פרויקט IBM RXN (${projectRes.status}): ${errText.substring(0, 200)}`,
      });
    }

    let projectData;
    try {
      projectData = await projectRes.json();
    } catch (parseErr) {
      console.log("Failed to parse project response as JSON");
      return res.status(200).json({
        success: false,
        error: "תשובת השרת לא בפורמט JSON - ייתכן שמפתח ה-API שגוי",
      });
    }

    console.log("Project data keys:", Object.keys(projectData));
    const projectId =
      projectData?.payload?.id ||
      projectData?.payload?.project_id ||
      projectData?.id;

    if (!projectId) {
      console.log("Full project response:", JSON.stringify(projectData).substring(0, 500));
      return res.status(200).json({
        success: false,
        error: "לא התקבל מזהה פרויקט מ-IBM RXN. בדוק את מפתח ה-API",
        debug: {
          status: projectRes.status,
          keys: Object.keys(projectData),
        },
      });
    }

    console.log("Project ID:", projectId);

    // --- שלב 2: שליחת חיזוי ---
    console.log("Step 2: Predicting reaction...", reactionSmiles);
    const predictUrl = `${RXN_BASE_URL}/predictions/${projectId}/predict-reaction`;
    console.log("Predict URL:", predictUrl);

    const predictRes = await fetch(predictUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ reaction_smiles: reactionSmiles }),
    });

    console.log("Predict response status:", predictRes.status);

    if (!predictRes.ok) {
      const errText = await predictRes.text();
      console.log("Predict error:", errText);
      return res.status(200).json({
        success: false,
        error: `שגיאה בשליחת חיזוי (${predictRes.status}): ${errText.substring(0, 200)}`,
      });
    }

    let predictData;
    try {
      predictData = await predictRes.json();
    } catch (parseErr) {
      return res.status(200).json({
        success: false,
        error: "תשובת החיזוי לא בפורמט JSON",
      });
    }

    console.log("Predict data keys:", Object.keys(predictData));
    const predictionId =
      predictData?.payload?.id ||
      predictData?.prediction_id ||
      predictData?.id;

    if (!predictionId) {
      console.log("Full predict response:", JSON.stringify(predictData).substring(0, 500));
      return res.status(200).json({
        success: false,
        error: "לא התקבל מזהה חיזוי. ייתכן ש-SMILES לא תקין",
        debug: {
          status: predictRes.status,
          reaction: reactionSmiles,
        },
      });
    }

    console.log("Prediction ID:", predictionId);

    // --- שלב 3: המתנה לתוצאות (עד 30 שניות) ---
    console.log("Step 3: Waiting for results...");
    let result = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));

      console.log(`Polling attempt ${attempt + 1}/10...`);

      const resultUrl = `${RXN_BASE_URL}/predictions/${projectId}/${predictionId}`;
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: apiKey },
      });

      console.log(`Poll ${attempt + 1} status:`, resultRes.status);

      if (!resultRes.ok) {
        console.log(`Poll ${attempt + 1} failed:`, resultRes.status);
        continue;
      }

      let resultData;
      try {
        resultData = await resultRes.json();
      } catch {
        console.log(`Poll ${attempt + 1} - not JSON`);
        continue;
      }

      const payload = resultData?.payload || resultData?.response?.payload || resultData;
      const attempts = payload?.attempts || [];

      console.log(`Poll ${attempt + 1} attempts:`, attempts.length);

      if (attempts.length > 0) {
        result = {
          success: true,
          productSmiles: attempts[0].smiles || "",
          confidence: attempts[0].confidence || 0,
          reactionSmiles,
          allAttempts: attempts.slice(0, 5), // מגביל ל-5 תוצאות
        };
        break;
      }
    }

    if (result) {
      console.log("=== SUCCESS ===", result.productSmiles);
      return res.status(200).json(result);
    } else {
      console.log("=== TIMEOUT - no results ===");
      return res.status(200).json({
        success: false,
        error: "תם הזמן - השרת לא החזיר תוצאות. נסה שוב",
      });
    }
  } catch (error) {
    console.error("=== CRITICAL ERROR ===", error.message);
    console.error("Stack:", error.stack);
    return res.status(200).json({
      success: false,
      error: `שגיאה כללית: ${error.message}`,
    });
  }
}
