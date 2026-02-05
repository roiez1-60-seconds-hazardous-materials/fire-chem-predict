/**
 * API Route: /api/predict
 * חיזוי תגובה כימית דרך ReactionT5 ב-Hugging Face Space
 * גרסה 6 - תיקון Gradio API endpoint
 */

import { NextRequest, NextResponse } from "next/server";

const HF_SPACE_URL = "https://roiez-fire-chem-predict.hf.space";

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

    // שלב 1: שליחת הבקשה ל-Gradio API
    const callRes = await fetch(`${HF_SPACE_URL}/call/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [smiles1, smiles2],
      }),
    });

    if (!callRes.ok) {
      console.error("HF call error:", callRes.status);
      if (callRes.status === 503) {
        return NextResponse.json({
          success: false,
          error: "המודל מתעורר — נסה שוב בעוד 30 שניות",
        });
      }
      return NextResponse.json({
        success: false,
        error: `שגיאה מהשרת: ${callRes.status}`,
      });
    }

    const callData = await callRes.json();
    const eventId = callData?.event_id;

    if (!eventId) {
      return NextResponse.json({
        success: false,
        error: "לא התקבל מזהה בקשה מהמודל",
      });
    }

    // שלב 2: קבלת התוצאה (SSE stream)
    const resultRes = await fetch(`${HF_SPACE_URL}/call/predict/${eventId}`);

    if (!resultRes.ok) {
      return NextResponse.json({
        success: false,
        error: `שגיאה בקבלת תוצאה: ${resultRes.status}`,
      });
    }

    const resultText = await resultRes.text();

    // חיפוש שורת data: בתוצאה
    const dataLine = resultText
      .split("\n")
      .find((line) => line.startsWith("data:"));

    if (!dataLine) {
      return NextResponse.json({
        success: false,
        error: "לא התקבלה תשובה מהמודל",
      });
    }

    const jsonStr = dataLine.replace("data: ", "");
    const gradioResult = JSON.parse(jsonStr);

    // Gradio מחזיר מערך — האיבר הראשון הוא התוצאה שלנו
    const predictionStr = gradioResult?.[0];

    if (!predictionStr) {
      return NextResponse.json({
        success: false,
        error: "תשובה ריקה מהמודל",
      });
    }

    // Parse the JSON string
    const prediction =
      typeof predictionStr === "string"
        ? JSON.parse(predictionStr)
        : predictionStr;

    return NextResponse.json(prediction);
  } catch (e: any) {
    console.error("API Error:", e.message);
    return NextResponse.json({
      success: false,
      error: `שגיאה: ${e.message}`,
    });
  }
}
