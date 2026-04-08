import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forge: "#1C1C1A",
        charcoal: "#2E2D2A",
        ash: "#3D3C38",
        slate: "#5C5A54",
        ember: "#C0632A",
        flame: "#E07840",
        parchment: "#F0EDE6",
        dust: "#9C9A94",
        crisis: "#6B4C5A",
      },
      fontFamily: {
        serif: ["Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
