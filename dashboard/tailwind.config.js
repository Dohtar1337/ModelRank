export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0c0c0c',
        surface: '#141414',
        border: '#252525',
        primary: '#00ff88',
        secondary: '#ffaa00',
        danger: '#ff4444',
        info: '#00ddff'
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace']
      }
    }
  },
  plugins: []
}
