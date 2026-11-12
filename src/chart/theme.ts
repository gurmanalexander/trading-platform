import type { Theme } from '../stores/app'

export interface ChartColors {
  bg: string
  text: string
  muted: string
  grid: string
  border: string
  up: string
  down: string
  cross: string
  crossLabel: string
  line: string
  accent: string
  alert: string
}

const dark: ChartColors = {
  bg: '#0e1116',
  text: '#aab2c0',
  muted: '#5b6577',
  grid: '#191e27',
  border: '#232a36',
  up: '#1fb28a',
  down: '#f0566b',
  cross: '#6b7689',
  crossLabel: '#2b3444',
  line: '#4c8dff',
  accent: '#4c8dff',
  alert: '#e8a838',
}

const light: ChartColors = {
  bg: '#ffffff',
  text: '#4a5364',
  muted: '#9aa3b2',
  grid: '#f0f2f5',
  border: '#e1e5eb',
  up: '#12997a',
  down: '#e0445c',
  cross: '#8a93a3',
  crossLabel: '#3a4353',
  line: '#2f6fe4',
  accent: '#2f6fe4',
  alert: '#c98a1a',
}

export const chartColors = (theme: Theme): ChartColors => (theme === 'light' ? light : dark)

/** '#rrggbb' -> 'rgba(r,g,b,a)' */
export function withAlpha(hex: string, a: number): string {
  if (hex.length !== 7 || hex[0] !== '#') return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
