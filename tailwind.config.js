/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        echo: {
          bg: "#0a0a0a",
          surface: "#1a1a2e",
          primary: "#6c63ff",
          accent: "#00d4aa",
          text: "#e0e0e0",
          muted: "#666680",
          danger: "#ff4757",
          wave: "#4ecdc4",
          match: "#ff6b6b",
        },
      },
    },
  },
  plugins: [],
};
