import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FireChem | חיזוי תגובות כימיות",
  description: "כלי חיזוי תגובות כימיות עבור לוחמי אש - מבוסס IBM RXN AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <header className="w-full py-4 px-6 flex items-center justify-between border-b border-fire-orange/20">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔥</span>
            <div>
              <h1 className="text-xl font-bold text-fire-yellow">
                FireChem
              </h1>
              <p className="text-xs text-stone-400">
                חיזוי תגובות כימיות | לוחמי אש
              </p>
            </div>
          </div>
          <span className="text-sm text-stone-500">
            Powered by IBM RXN
          </span>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="text-center py-4 text-xs text-stone-600">
          © 2025 FireChem — כלי עזר בלבד, אינו מחליף שיקול דעת מקצועי
        </footer>
      </body>
    </html>
  );
}
