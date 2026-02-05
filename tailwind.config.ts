import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fire: {
          red: "#DC2626",
          orange: "#EA580C",
          yellow: "#F59E0B",
          dark: "#1C1917",
        },
      },
    },
  },
  plugins: [],
};

export default config;
