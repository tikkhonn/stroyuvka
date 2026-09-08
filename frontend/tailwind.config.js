/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        vka: {
          navy: "#2A3F5F",
          "navy-light": "#54657F",
          gold: "#E6BD75",
          "gold-light": "#EBCA91",
          gray: "#A4AEBE",
          "gray-50": "#D2D7DF",
          cream: "#F3F5F8",
        },
      },
      fontFamily: {
        serif: ["Magistral", "Montserrat", "system-ui", "sans-serif"],
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      boxShadow: {
        vka: "0 4px 24px -4px rgba(42, 63, 95, 0.12)",
        "vka-lg": "0 20px 50px -12px rgba(42, 63, 95, 0.2)",
        "vka-glow": "0 0 40px -8px rgba(230, 189, 117, 0.4)",
      },
      animation: {
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
