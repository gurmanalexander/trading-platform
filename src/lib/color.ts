/** Цвет «#rgb», «#rrggbb» или «rgb(a)(…)» → [r, g, b] 0…255; null — не разобрали */
function parseColor(c: string): [number, number, number] | null {
  const s = c.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [...m[1]].map((ch) => parseInt(ch + ch, 16)) as [number, number, number]
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s)
  if (m) {
    const n = parseInt(m[1], 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s)
  return m ? [+m[1], +m[2], +m[3]] : null
}

/**
 * Цвет текста на плашке цвета bg: белый на тёмном и насыщенном, тёмный на светлом —
 * иначе на светлых барах (например, белых) подпись цены пропадает.
 */
export function textOn(bg: string): string {
  const rgb = parseColor(bg)
  if (!rgb) return '#fff'
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // тёмный текст — только на светлых плашках (белые, светло-серые бары): зелёный и красный, как в TradingView, — с белым
  return lum > 0.5 ? '#131722' : '#fff'
}
