import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fond: '#F4F6FB',
        indigo: { DEFAULT: '#3B4BB9', fonce: '#2E3C9E', clair: '#E8EAFA' },
        vert: { menthe: '#20C997', clair: '#E2FBF2' },
        rouge: { corail: '#FF5252', clair: '#FFE5E5' },
        texte: { principal: '#1E2235', secondaire: '#6B7294', teritaire: '#A8AEC5' },
        bordure: '#E5E8F0',
      },
    },
  },
  plugins: [],
};
export default config;
