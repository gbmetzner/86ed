import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Use RGB channel variables so opacity modifiers (/20, /50 etc.) work
        'amber-pub': 'rgb(200 146 42 / <alpha-value>)',
        'warm': 'rgb(212 197 169 / <alpha-value>)',
        'dim': 'rgb(122 106 80 / <alpha-value>)',
        'bg': '#0a0705',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundColor: {
        'bg': '#0a0705',
      },
    },
  },
  plugins: [],
}

export default config
