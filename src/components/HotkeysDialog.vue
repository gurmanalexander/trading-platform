<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { HOTKEY_GROUPS, parseKeys } from '../lib/hotkeys'

// Справка по клавишам: группы-карточки, клавиши — «колпачками», сверху — поиск по описанию и клавишам.
const query = ref('')
const input = ref<HTMLInputElement>()
onMounted(() => nextTick(() => input.value?.focus()))

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return HOTKEY_GROUPS.map((g) => ({
    ...g,
    rows: g.keys
      .filter(([k, text]) => !q || text.toLowerCase().includes(q) || k.toLowerCase().replace(/[{}]/g, '').includes(q))
      .map(([k, text]) => ({ id: k + text, alts: parseKeys(k), text })),
  })).filter((g) => g.rows.length)
})
</script>

<template>
  <Modal title="Горячие клавиши" :width="940" @close="app.hotkeysOpen = false">
    <div class="hk-top">
      <Icon name="search" :size="16" />
      <input ref="input" v-model="query" class="field" placeholder="Найти: «уровень», «список», «Alt»…" autocomplete="off" />
    </div>
    <div class="hk scroll">
      <section v-for="g in groups" :key="g.title" class="card">
        <header>
          <span class="ico"><Icon :name="g.icon" :size="16" /></span>
          <h3>{{ g.title }}</h3>
        </header>
        <p v-if="g.hint && !query" class="muted hint">{{ g.hint }}</p>
        <div v-for="r in g.rows" :key="r.id" class="row">
          <span class="keys">
            <template v-for="(alt, ai) in r.alts" :key="ai">
              <i v-if="ai" class="or">или</i>
              <span class="combo">
                <template v-for="(p, pi) in alt" :key="pi">
                  <i v-if="pi && p.key && alt[pi - 1].key" class="plus">+</i>
                  <kbd v-if="p.key">{{ p.text }}</kbd>
                  <span v-else class="act">{{ p.text }}</span>
                </template>
              </span>
            </template>
          </span>
          <span class="what">{{ r.text }}</span>
        </div>
      </section>
      <p v-if="!groups.length" class="muted none">Ничего не нашлось. Попробуйте другое слово.</p>
    </div>
  </Modal>
</template>

<style scoped>
.hk-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  flex: none;
}
.hk-top .field {
  flex: 1;
  border: 0;
  background: none;
  padding: 0;
  height: 28px;
}
.hk {
  columns: 2 380px;
  column-gap: 14px;
  padding: 14px 16px 6px;
}
.card {
  break-inside: avoid;
  margin: 0 0 14px;
  padding: 10px 12px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.card header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ico {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}
h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.hint {
  margin: 0 0 6px;
  font-size: 12px;
}
.row {
  display: grid;
  grid-template-columns: minmax(120px, auto) 1fr;
  gap: 4px 12px;
  align-items: center;
  padding: 5px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.keys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}
kbd {
  display: inline-block;
  min-width: 24px;
  padding: 2px 7px;
  font: 600 12px/1.4 var(--font);
  text-align: center;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-width: 2.5px;
  border-radius: 6px;
  white-space: nowrap;
}
.act {
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  white-space: nowrap;
}
.plus,
.or {
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
}
.or {
  margin: 0 2px;
}
.what {
  font-size: 13px;
  line-height: 1.35;
}
.none {
  padding: 30px;
  text-align: center;
}
@media (max-width: 719px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
