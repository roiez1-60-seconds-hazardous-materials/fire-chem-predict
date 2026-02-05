/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך IBM RXN for Chemistry
 * גרסה 3 - תיקון 502 + טיפול שגיאות מלא
 */

export default async function handler(req, res) {
  console.log("=== DEBUG START ===");

  // תמיד מחזירים 200 כדי למנוע 502 מ-Vercel
  const sendError = (message, debug = {}) => {
    console.log("=== ERROR ===", message);
    return res.status(200).json({ success: false, error: message, debug });
  };

  const sendSuccess = (data) => {
    console.log("=== SUCCESS ===");
    return res.status(200).json({ success: true, ...data });
  };

  try {
    if (req.method !== "POST") {
      return sendError("Method not allowed");
    }

    const { smiles1, smiles2, apiKey } = req.body || {};

    console.log("API Key exists:", !!apiKey);
    console.log("API Key length:", apiKey ? apiKey.length : 0);
    console.log("SMILES1:", smiles1);
    console.log("SMILES2:", smiles2);

    if (!smiles1 || !smiles2) {
      return sendError("חסרים נתוני SMILES של שני החומרים");
    }

    if (!apiKey) {
      return sendError("חסר מפתח API של IBM RXN");
    }

    // ננסה קודם URL חדש, ואם לא עובד - הישן
    const URLS = [
      "https://rxn.app.accelerate.science/rxn/api/api/v1",
      "https://rxn.res.ibm.com/rxn/api/api/v1",
    ];

    const reactionSmiles = `${smiles1}.${smiles2}`;
    let lastError = "";

    for (const RXN_BASE_URL of URLS) {
      console.log("Trying URL:", RXN_BASE_URL);

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

        console.log("Project status:", projectRes.status);

        if (projectRes.status === 401) {
          console.log("RXN Error: 401");
          lastError = `שגיאת הרשאה (401). בדוק שמפתח ה-API תקין. URL: ${RXN_BASE_URL}`;
          continue;
        }

        if (!projectRes.ok) {
          let errBody = "";
          try { errBody = await projectRes.text(); } catch {}
          console.log("Project error:", errBody.substring(0, 300));
          lastError = `שגיאה ביצירת פרויקט (${projectRes.status})`;
          continue;
        }

        let projectData;
        try {
          projectData = await projectRes.json();
        } catch (e) {
          lastError = "תשובת השרת לא JSON";
          continue;
        }

        console.log("Project response:", JSON.stringify(projectData).substring(0, 300));

        const projectId =
          projectData?.payload?.id ||
          projectData?.payload?.project_id ||
          projectData?.id;

        if (!projectId) {
          lastError = "לא התקבל מזהה פרויקט";
          continue;
        }

        console.log("Project ID:", projectId);

        // --- שלב 2: שליחת חיזוי ---
        console.log("Step 2: Predicting:", reactionSmiles);
        const predictRes = await fetch(
          `${RXN_BASE_URL}/predictions/${projectId}/predict-reaction`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: apiKey,
            },
            body: JSON.stringify({ reaction_smiles: reactionSmiles }),
          }
        );

        console.log("Predict status:", predictRes.status);

        let predictText = "";
        try { predictText = await predictRes.text(); } catch {}
        console.log("Predict response:", predictText.substring(0, 500));

        if (!predictRes.ok) {
          return sendError(
            `שגיאה בחיזוי (${predictRes.status}): ${predictText.substring(0, 100)}`
          );
        }

        let predictData;
        try {
          predictData = JSON.parse(predictText);
        } catch {
          return sendError("Predict response not JSON: " + predictText.substring(0, 100));
        }

        const predictionId =
          predictData?.payload?.id ||
          predictData?.prediction_id ||
          predictData?.id;

        if (!predictionId) {
          return sendError("לא התקבל מזהה חיזוי", {
            keys: Object.keys(predictData),
          });
        }

        console.log("Prediction ID:", predictionId);

        // --- שלב 3: המתנה לתוצאות ---
        console.log("Step 3: Polling...");

        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((r) => setTimeout(r, 3000));
          console.log(`Poll ${attempt + 1}/10`);

          try {
            const resultRes = await fetch(
              `${RXN_BASE_URL}/predictions/${projectId}/${predictionId}`,
              { headers: { Authorization: apiKey } }
            );

            if (!resultRes.ok) continue;

            const resultText = await resultRes.text();
            console.log(`Poll ${attempt + 1}:`, resultText.substring(0, 300));

            let resultData;
            try { resultData = JSON.parse(resultText); } catch { continue; }

            const payload =
              resultData?.payload ||
              resultData?.response?.payload ||
              resultData;

            const attempts = payload?.attempts || [];

            if (attempts.length > 0) {
              return sendSuccess({
                productSmiles: attempts[0].smiles || "",
                confidence: attempts[0].confidence || 0,
                reactionSmiles,
                allAttempts: attempts.slice(0, 5),
              });
            }
          } catch (pollErr) {
            console.log(`Poll error:`, pollErr.message);
          }
        }

        return sendError("תם הזמן - השרת לא החזיר תוצאות. נסה שוב");

      } catch (urlError) {
        console.log(`URL failed:`, urlError.message);
        lastError = urlError.message;
        continue;
      }
    }

    return sendError(`לא הצלחתי להתחבר ל-IBM RXN: ${lastError}`);

  } catch (criticalError) {
    console.error("=== CRITICAL ===", criticalError.message);
    return res.status(200).json({
      success: false,
      error: `שגיאה קריטית: ${criticalError.message}`,
    });
  }
}
