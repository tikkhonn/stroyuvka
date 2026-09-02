/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        vka: {
          navy: "#0b1f3a",
          "navy-light": "#123456",
          gold: "#c9a227",
          "gold-light": "#e8c547",
          cream: "#f8f6f0",
        },
      },
      fontFamily: {
        serif: ['"Times New Roman"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
