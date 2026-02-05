/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך IBM RXN for Chemistry
 * גרסה 4 - תיקון 401 עם ניסיון פורמטים שונים של Authorization
 */

export default async function handler(req, res) {
  console.log("=== DEBUG START v4 ===");

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
    console.log("API Key prefix:", apiKey ? apiKey.substring(0, 4) + "..." : "none");
    console.log("SMILES1:", smiles1);
    console.log("SMILES2:", smiles2);

    if (!smiles1 || !smiles2) {
      return sendError("חסרים נתוני SMILES של שני החומרים");
    }

    if (!apiKey) {
      return sendError("חסר מפתח API של IBM RXN");
    }

    const reactionSmiles = `${smiles1}.${smiles2}`;

    // ננסה כמה שילובים של URL + פורמט Authorization
    const attempts = [
      {
        url: "https://rxn.app.accelerate.science/rxn/api/api/v1",
        auth: apiKey,
        label: "accelerate + raw key",
      },
      {
        url: "https://rxn.app.accelerate.science/rxn/api/api/v1",
        auth: `Bearer ${apiKey}`,
        label: "accelerate + Bearer",
      },
      {
        url: "https://rxn.res.ibm.com/rxn/api/api/v1",
        auth: apiKey,
        label: "ibm + raw key",
      },
      {
        url: "https://rxn.res.ibm.com/rxn/api/api/v1",
        auth: `Bearer ${apiKey}`,
        label: "ibm + Bearer",
      },
    ];

    let lastError = "";

    for (const attempt of attempts) {
      console.log(`\n--- Trying: ${attempt.label} ---`);

      try {
        // בדיקת חיבור - ניסיון ליצור פרויקט
        const projectRes = await fetch(`${attempt.url}/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: attempt.auth,
          },
          body: JSON.stringify({ name: `CP_${Date.now()}` }),
        });

        console.log(`${attempt.label} - Project status:`, projectRes.status);

        if (projectRes.status === 401 || projectRes.status === 403) {
          lastError = `${attempt.label}: שגיאת הרשאה (${projectRes.status})`;
          continue;
        }

        if (!projectRes.ok) {
          let body = "";
          try { body = await projectRes.text(); } catch {}
          console.log(`${attempt.label} - Error body:`, body.substring(0, 200));
          lastError = `${attempt.label}: שגיאה ${projectRes.status}`;
          continue;
        }

        // הצלחנו! נמשיך עם הפורמט הזה
        console.log(`=== FOUND WORKING FORMAT: ${attempt.label} ===`);

        let projectData;
        try {
          projectData = await projectRes.json();
        } catch {
          lastError = "תשובה לא JSON";
          continue;
        }

        console.log("Project data:", JSON.stringify(projectData).substring(0, 300));

        const projectId =
          projectData?.payload?.id ||
          projectData?.payload?.project_id ||
          projectData?.id;

        if (!projectId) {
          lastError = "לא התקבל מזהה פרויקט";
          continue;
        }

        console.log("Project ID:", projectId);

        // --- שליחת חיזוי ---
        console.log("Sending prediction:", reactionSmiles);
        const predictRes = await fetch(
          `${attempt.url}/predictions/${projectId}/predict-reaction`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: attempt.auth,
            },
            body: JSON.stringify({ reaction_smiles: reactionSmiles }),
          }
        );

        console.log("Predict status:", predictRes.status);
        let predictText = "";
        try { predictText = await predictRes.text(); } catch {}
        console.log("Predict body:", predictText.substring(0, 400));

        if (!predictRes.ok) {
          return sendError(`שגיאה בחיזוי (${predictRes.status}): ${predictText.substring(0, 100)}`);
        }

        let predictData;
        try { predictData = JSON.parse(predictText); } catch {
          return sendError("תשובת חיזוי לא JSON");
        }

        const predictionId =
          predictData?.payload?.id ||
          predictData?.prediction_id ||
          predictData?.id;

        if (!predictionId) {
          return sendError("לא התקבל מזהה חיזוי", {
            response: predictText.substring(0, 200),
          });
        }

        console.log("Prediction ID:", predictionId);

        // --- המתנה לתוצאות ---
        for (let poll = 0; poll < 10; poll++) {
          await new Promise((r) => setTimeout(r, 3000));
          console.log(`Poll ${poll + 1}/10`);

          try {
            const resultRes = await fetch(
              `${attempt.url}/predictions/${projectId}/${predictionId}`,
              { headers: { Authorization: attempt.auth } }
            );

            if (!resultRes.ok) continue;

            const resultText = await resultRes.text();
            let resultData;
            try { resultData = JSON.parse(resultText); } catch { continue; }

            const payload =
              resultData?.payload ||
              resultData?.response?.payload ||
              resultData;

            const results = payload?.attempts || [];

            if (results.length > 0) {
              return sendSuccess({
                productSmiles: results[0].smiles || "",
                confidence: results[0].confidence || 0,
                reactionSmiles,
                allAttempts: results.slice(0, 5),
                authMethod: attempt.label,
              });
            }
          } catch (e) {
            console.log(`Poll error:`, e.message);
          }
        }

        return sendError("תם הזמן - לא התקבלו תוצאות. נסה שוב");
      } catch (e) {
        console.log(`${attempt.label} failed:`, e.message);
        lastError = `${attempt.label}: ${e.message}`;
        continue;
      }
    }

    // כל הניסיונות נכשלו
    return sendError(
      `כל ניסיונות ההתחברות נכשלו. ייתכן שמפתח ה-API שגוי או שפג תוקפו. ` +
      `נסה ליצור מפתח חדש ב: https://rxn.app.accelerate.science/rxn/account/keys\n` +
      `שגיאה אחרונה: ${lastError}`
    );
  } catch (e) {
    console.error("CRITICAL:", e.message, e.stack);
    return res.status(200).json({
      success: false,
      error: `שגיאה קריטית: ${e.message}`,
    });
  }
}
