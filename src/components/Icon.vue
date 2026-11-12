<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
</script>

<script lang="ts">
// Набор штриховых значков 24×24. Один компонент вместо библиотеки иконок — меньше кода в сборке.
const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8z"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM4 4l16 16"/>',
  sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  'layout-1': '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  'layout-2h': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14"/>',
  'layout-2v': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 12h16"/>',
  'layout-4': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14M4 12h16"/>',
  cursor: '<path d="M6 3.5v15l4-3.8 2.6 5.8 2.2-1-2.6-5.7H18z"/>',
  trend: '<path d="M6.2 17.8L17.8 6.2"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',
  ray: '<path d="M6.3 16.9L21 8"/><circle cx="5" cy="17.7" r="1.8"/><circle cx="13" cy="12.8" r="1.8"/>',
  hline: '<path d="M3 12h7M14 12h7"/><circle cx="12" cy="12" r="2"/>',
  vline: '<path d="M12 3v7M12 14v7"/><circle cx="12" cy="12" r="2"/>',
  rect: '<rect x="4" y="7" width="16" height="10" rx="1"/>',
  fib: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/>',
  measure: '<path d="M4 16L16 4l4 4L8 20zM8 12l1.6 1.6M11 9l1.6 1.6M14 6l1.6 1.6"/>',
  magnet: '<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4"/>',
  pencil: '<path d="M4 20l1-4.5L16.5 4 20 7.5 8.5 19zM14 6.5l3.5 3.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  book: '<path d="M4 5h11M4 9h7M4 15h9M4 19h14"/>',
  candles: '<path d="M8 3v3M8 14v4M6 6h4v8H6zM16 6v4M16 17v4M14 10h4v7h-4z"/>',
  hollow: '<path d="M8 3v3M8 14v4M6 6h4v8H6zM16 6v4M16 17v4M14 10h4v7h-4z"/>',
  bars: '<path d="M7 4v16M7 8H4M7 15h3M17 4v16M17 6h-3M17 12h3"/>',
  line: '<path d="M3 17l5-6 4 3 8-9"/>',
  area: '<path d="M3 17l5-6 4 3 8-9v14H3z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  fx: '<path d="M3 17c3 0 3-10 6-10s3 10 6 10 3-6 6-6"/>',
  skip: '<path d="M6 6l6 6-6 6M13 6l6 6-6 6"/>',
  chart: '<path d="M4 4v16h16M8 15l3-4 3 2 5-7"/>',
  panel: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M15 5v14"/>',
  hray: '<path d="M8 12h13"/><circle cx="6" cy="12" r="2"/>',
  cross: '<path d="M3 12h18M12 3v18"/>',
  long: '<path d="M4 20h16M4 13h16"/><path d="M12 10V4M9 7l3-3 3 3"/>',
  short: '<path d="M4 4h16M4 11h16"/><path d="M12 14v6M9 17l3 3 3-3"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  bookmark: '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 114 1.8c-.9.7-1.7 1.2-1.7 2.4M12 16.8h.01"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  refresh: '<path d="M19 12a7 7 0 11-2.1-5M19 4v4h-4"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 011-1h9"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
  text: '<path d="M6 6h12M12 6v13M9.5 19h5"/>',
  monitor: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  sortUp: '<path d="M7 14l5-5 5 5"/>',
  sortDown: '<path d="M7 10l5 5 5-5"/>',
}
</script>

<template>
  <svg
    class="icon"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name] ?? ''"
  />
</template>

<style>
.icon {
  flex: none;
  display: block;
}
</style>
