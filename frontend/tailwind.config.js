/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#060221',
          cyan: '#12abf0',
          'cyan-light': '#e8f6fe',
          'cyan-hover': '#0e96d6',
          pink: '#ed3e97',
          'pink-light': '#fde8f2',
          'pink-hover': '#d4357f',
          yellow: '#fcf627',
          'yellow-light': '#fefde6',
        },
      },
    },
  },
  plugins: [],
}
