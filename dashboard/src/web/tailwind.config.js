/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        bg: "#0a0d10",
        surface: "#12161b",
        surface2: "#181d24",
        border: "#232a33",
        border2: "#2c343f",
        ink: "#e6ebef",
        muted: "#8b95a3",
        faint: "#5a6472",
        accent: {
          DEFAULT: "#00d9a3",
          dim: "#0a3d31",
          soft: "#0e2622",
        },
        signal: {
          critical: "#ff4d6a",
          warn: "#ffb454",
          info: "#5eb1ff",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.01em",
        wideish: "0.06em",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(3px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        rise: "rise 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
