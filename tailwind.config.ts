import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "12px",
        xl: "16px"
      },
      colors: {
        slate: {
          50: "#F4F1EA",
          100: "#ECE5DA",
          200: "#DED4C7",
          300: "#C9B9A8",
          400: "#A09080",
          500: "#7B6F63",
          600: "#62564C",
          700: "#4B4038",
          800: "#302822",
          900: "#221B16",
          950: "#17120F"
        },
        coral: {
          50: "#FFF3EE",
          100: "#FBE2D7",
          200: "#F5C8B8",
          300: "#EEAA92",
          400: "#E28B6E",
          500: "#D97757",
          600: "#C96545",
          700: "#A95238",
          800: "#854231",
          900: "#69362A",
          950: "#3C1E18"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        serif: ["Instrument Serif", "ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"]
      },
      boxShadow: {
        soft: "0 18px 46px rgba(48, 40, 34, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
