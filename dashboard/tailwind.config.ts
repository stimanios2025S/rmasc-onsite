import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        fond: '#F4F6FB',
        indigo: { DEFAULT: '#3B4BB9', fonce: '#2E3C9E', clair: '#E8EAFA' },
        vert: { menthe: '#20C997', clair: '#E2FBF2' },
        rouge: { corail: '#FF5252', clair: '#FFE5E5' },
      },
    },
  },
  plugins: [],
};

export default config;
