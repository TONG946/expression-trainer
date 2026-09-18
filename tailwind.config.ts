import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 移动端优先：内容区默认铺满，桌面端居中收窄
      maxWidth: {
        content: "1200px",
        card: "720px",
      },
    },
  },
  plugins: [],
};

export default config;
