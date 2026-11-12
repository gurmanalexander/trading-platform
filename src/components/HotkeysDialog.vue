<script setup lang="ts">
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { HOTKEY_GROUPS } from '../lib/hotkeys'
</script>

<template>
  <Modal title="Горячие клавиши" :width="640" @close="app.hotkeysOpen = false">
    <div class="hk scroll">
      <section v-for="g in HOTKEY_GROUPS" :key="g.title">
        <h3>{{ g.title }}</h3>
        <dl>
          <template v-for="[key, text] in g.keys" :key="key">
            <dt><kbd>{{ key }}</kbd></dt>
            <dd>{{ text }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.hk {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 6px 24px;
  padding: 10px 16px 16px;
}
h3 {
  margin: 8px 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 10px;
  margin: 0;
  align-items: baseline;
}
dd {
  margin: 0;
}
kbd {
  font: inherit;
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  white-space: nowrap;
}
</style>
