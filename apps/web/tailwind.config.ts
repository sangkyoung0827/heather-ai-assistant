import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#19202a",
        line: "#d7dde6",
        mist: "#f5f7fa",
        heather: {
          50: "#f2f8f7",
          100: "#dcefeb",
          300: "#8ccbc0",
          500: "#2f8f80",
          700: "#246f65",
          900: "#173f3b"
        },
        coral: "#d9614c",
        gold: "#c69a2f"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(25, 32, 42, 0.08)"
      }
    },
  },
  plugins: [],
};

export default config;
