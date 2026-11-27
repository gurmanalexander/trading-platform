import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Ширина элемента в пикселях; обновляется при изменении размеров */
export function useWidth(el: Ref<HTMLElement | null>, initial = 600) {
  const width = ref(initial)
  let ro: ResizeObserver | null = null
  onMounted(() => {
    if (!el.value) return
    width.value = el.value.clientWidth || initial
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) width.value = w
    })
    ro.observe(el.value)
  })
  onBeforeUnmount(() => ro?.disconnect())
  return width
}

/** «Круглые» отметки оси: 3–5 значений, покрывающих диапазон */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12))
  return out
}
