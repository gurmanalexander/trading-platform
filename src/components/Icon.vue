<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
</script>

<script lang="ts">
// Штриховые значки 24×24: интерфейсные — из набора Lucide, инструменты рисования — свои (см. scripts/gen-icons.mjs).
import { ICONS } from './icons'
</script>

<template>
  <svg
    class="icon"
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
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
