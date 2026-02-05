/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך ReactionT5 ב-Hugging Face Space
 * גרסה 5 - App Router + ReactionT5 (חינמי, ללא API Key)
 */

import { NextRequest, NextResponse } from "next/server";

// === שנה את ה-URL הזה לכתובת ה-Space שלך ===
const HF_SPACE_URL =
  "https://roiez-fire-chem-predict.hf.space/api/predict";
// אחרי שתיצור את ה-Space, החלף YOUR-USERNAME בשם המשתמש שלך ב-HF
// לדוגמה: https://roiez1-fire-chem-predict.hf.space/api/predict

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { smiles1, smiles2 } = body;

    if (!smiles1 || !smiles2) {
      return NextResponse.json({
        success: false,
        error: "חסרים נתוני SMILES של שני החומרים",
      });
    }

    console.log("Calling ReactionT5 with:", smiles1, "+", smiles2);

    // קריאה ל-Hugging Face Space API (Gradio)
    const response = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [smiles1, smiles2],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("HF Space error:", response.status, errText);

      // אם ה-Space ישן (cold start), ננסה להעיר אותו
      if (response.status === 503) {
        return NextResponse.json({
          success: false,
          error:
            "המודל מתחיל לעבוד (cold start) — נסה שוב בעוד 30 שניות",
        });
      }

      return NextResponse.json({
        success: false,
        error: `שגיאה מהשרת: ${response.status}`,
      });
    }

    const result = await response.json();

    // Gradio מחזיר { data: [result_string] }
    const predictionJson = result?.data?.[0];
    if (!predictionJson) {
      return NextResponse.json({
        success: false,
        error: "לא התקבלה תשובה מהמודל",
      });
    }

    // Parse the JSON string from the model
    let prediction;
    try {
      prediction =
        typeof predictionJson === "string"
          ? JSON.parse(predictionJson)
          : predictionJson;
    } catch {
      return NextResponse.json({
        success: false,
        error: "תשובה לא תקינה מהמודל",
      });
    }

    // העברת התוצאה לקליינט
    return NextResponse.json(prediction);
  } catch (e: any) {
    console.error("API Error:", e.message);
    return NextResponse.json({
      success: false,
      error: `שגיאה: ${e.message}`,
    });
  }
}
