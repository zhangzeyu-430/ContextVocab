import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#F4F8F5",
          100: "#E4EEE8",
          200: "#CBDCCE",
          500: "#567565",
          700: "#2F4B3D",
          900: "#1E332A"
        },
        accent: {
          100: "#E4F1E7",
          200: "#BDD8C3",
          500: "#4D7562",
          700: "#2F4E3F"
        }
      },
      boxShadow: {
        soft: "0 14px 34px rgba(30, 51, 42, 0.10)"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in": "fadeIn 380ms ease-out"
      }
    }
  },
  plugins: []
} satisfies Config;
