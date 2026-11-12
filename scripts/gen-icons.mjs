// Собирает src/components/icons.ts: значки интерфейса берутся из набора Lucide (ISC),
// а торговые инструменты, которых там нет, нарисованы вручную в том же штриховом стиле.
// Запуск: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** имя в приложении → имя значка Lucide */
const LUCIDE = {
  search: 'search',
  plus: 'plus',
  x: 'x',
  check: 'check',
  star: 'star',
  bell: 'bell',
  bellRing: 'bell-ring',
  trash: 'trash-2',
  eye: 'eye',
  eyeOff: 'eye-off',
  sliders: 'sliders-horizontal',
  sun: 'sun',
  moon: 'moon',
  monitor: 'monitor',
  maximize: 'maximize',
  minimize: 'minimize',
  expand: 'expand',
  shrink: 'shrink',
  cursor: 'mouse-pointer-2',
  rect: 'rectangle-horizontal',
  measure: 'ruler',
  magnet: 'magnet',
  pencil: 'pencil',
  list: 'list',
  candles: 'chart-candlestick',
  line: 'chart-line',
  area: 'chart-area',
  chart: 'chart-candlestick',
  chevron: 'chevron-down',
  next: 'chevron-right',
  sortUp: 'chevron-up',
  sortDown: 'chevron-down',
  skip: 'chevrons-right',
  fx: 'activity',
  panel: 'panel-right',
  share: 'share-2',
  camera: 'camera',
  gear: 'settings',
  note: 'sticky-note',
  checklist: 'list-checks',
  undo: 'undo-2',
  redo: 'redo-2',
  paste: 'clipboard-paste',
  more: 'ellipsis',
  stack: 'rows-3',
  up: 'arrow-up',
  down: 'arrow-down',
  link: 'link-2',
  template: 'layout-template',
  save: 'save',
  keyboard: 'keyboard',
  filter: 'list-filter',
  funnel: 'funnel',
  refresh: 'refresh-cw',
  copy: 'copy',
  pin: 'pin',
  text: 'type',
  qr: 'qr-code',
  dashboard: 'layout-dashboard',
  download: 'download',
  columns: 'columns-3',
  checkAll: 'check-check',
  grip: 'grip-vertical',
  cloud: 'cloud',
  cloudOff: 'cloud-off',
  phone: 'smartphone',
  listPlus: 'list-plus',
  external: 'external-link',
  target: 'crosshair',
  gauge: 'gauge',
  trendUp: 'trending-up',
  trendDown: 'trending-down',
  bookmark: 'bookmark',
  help: 'circle-help',
  close: 'x',
  trigger: 'bell-ring',
  wifi: 'wifi',
  wifiOff: 'wifi-off',
  info: 'info',
  clock: 'clock',
  layers: 'layers',
}

/** нарисованные вручную (24×24, штрих) */
const CUSTOM = {
  'layout-1': '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  'layout-2h': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14"/>',
  'layout-2v': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 12h16"/>',
  'layout-4': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14M4 12h16"/>',
  trend: '<path d="M6.2 17.8L17.8 6.2"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',
  ray: '<path d="M6.3 16.9L21 8"/><circle cx="5" cy="17.7" r="1.8"/><circle cx="13" cy="12.8" r="1.8"/>',
  hline: '<path d="M3 12h7M14 12h7"/><circle cx="12" cy="12" r="2"/>',
  hray: '<path d="M8 12h13"/><circle cx="6" cy="12" r="2"/>',
  vline: '<path d="M12 3v7M12 14v7"/><circle cx="12" cy="12" r="2"/>',
  cross: '<path d="M3 12h18M12 3v18"/>',
  fib: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/>',
  hollow: '<path d="M8 3v3M8 14v4M6 6h4v8H6zM16 6v4M16 17v4M14 10h4v7h-4z"/>',
  bars: '<path d="M7 4v16M7 8H4M7 15h3M17 4v16M17 6h-3M17 12h3"/>',
  long: '<path d="M4 20h16M4 13h16"/><path d="M12 10V4M9 7l3-3 3 3"/>',
  short: '<path d="M4 4h16M4 11h16"/><path d="M12 14v6M9 17l3 3 3-3"/>',
  // метка списка: вымпел без древка, закрашенный
  flag: '<path d="M5 5h14l-3.5 7 3.5 7H5z" fill="currentColor" stroke-linejoin="round"/>',
  // все окна раскладки сразу
  windows: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
}

const out = {}
for (const [name, file] of Object.entries(LUCIDE)) {
  const svg = readFileSync(join(root, 'node_modules/lucide-static/icons', file + '.svg'), 'utf8')
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
  out[name] = inner.replace(/\s*\n\s*/g, '').replace(/ \/>/g, '/>').trim()
}
Object.assign(out, CUSTOM)

const body = Object.keys(out)
  .sort()
  .map((k) => `  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(out[k]).replace(/'/g, "\\'").replace(/^"|"$/g, "'").replace(/\\"/g, '"')},`)
  .join('\n')
writeFileSync(
  join(root, 'src/components/icons.ts'),
  `// Файл собран скриптом scripts/gen-icons.mjs — не правьте вручную.\n// Значки интерфейса — Lucide (https://lucide.dev, лицензия ISC); инструменты рисования — свои.\nexport const ICONS: Record<string, string> = {\n${body}\n}\n`,
)
console.log('icons:', Object.keys(out).length)
