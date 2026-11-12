import { app, type ColorKey, type Theme } from '../stores/app'

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
  bg: '#0f1217',
  text: '#c5ccd8',
  muted: '#667085',
  grid: '#1d232e',
  border: '#2a3240',
  up: '#26a69a',
  down: '#ef5350',
  cross: '#7b869a',
  crossLabel: '#323c4e',
  line: '#3d8bff',
  accent: '#3d8bff',
  alert: '#f5a623',
}

const light: ChartColors = {
  bg: '#ffffff',
  text: '#2a3140',
  muted: '#9aa3b2',
  grid: '#eef0f4',
  border: '#dfe3ea',
  up: '#089981',
  down: '#f23645',
  cross: '#8a93a3',
  crossLabel: '#3a4353',
  line: '#2962ff',
  accent: '#2962ff',
  alert: '#e08e00',
}

const BASE: Record<Theme, ChartColors> = { dark, light }

/** Стандартное значение настраиваемого цвета — для окна настройки и кнопки сброса */
export const defaultColor = (theme: Theme, key: ColorKey): string => BASE[theme][key]

/** Цвета графика: стандартные для темы плюс то, что пользователь задал сам */
export function chartColors(theme: Theme): ChartColors {
  const custom = app.colors[theme]
  const out = { ...BASE[theme], ...custom }
  // акцентный цвет — он же цвет линейного графика
  if (custom.accent) out.line = custom.accent
  return out
}

/** '#rrggbb' -> 'rgba(r,g,b,a)' */
export function withAlpha(hex: string, a: number): string {
  if (hex.length !== 7 || hex[0] !== '#') return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
