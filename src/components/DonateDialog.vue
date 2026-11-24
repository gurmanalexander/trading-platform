<script setup lang="ts">
import { onMounted } from 'vue'
import qrcode from 'qrcode-generator'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app, toast } from '../stores/app'
import { BINANCE_PAY, DONATE_TARGETS, markDonateOpened } from '../lib/donate'

// Поддержать проект: адреса кошельков USDT и Binance Pay — у каждого QR-код и кнопка «Скопировать»
onMounted(markDonateOpened)

function qr(text: string): string {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}

const cards = DONATE_TARGETS.map((t) => ({ ...t, svg: qr(t.address) }))
const paySvg = qr(BINANCE_PAY.link)

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} скопирован`)
  } catch {
    prompt('Скопируйте вручную', text)
  }
}
</script>

<template>
  <Modal title="Поддержать проект" :width="560" @close="app.donateOpen = false">
    <div class="dn scroll">
      <p class="lead">
        Терминал бесплатный и без рекламы. Если он помогает в торговле — можно поддержать разработку криптовалютой. Спасибо!
      </p>

      <div class="cards">
        <section v-for="c in cards" :key="c.id" class="card">
          <div class="head">
            <b>{{ c.coin }}</b>
            <span class="net">{{ c.network }}</span>
          </div>
          <div class="qr" v-html="c.svg" />
          <code class="addr">{{ c.address }}</code>
          <button class="btn primary sm" @click="copy(c.address, 'Адрес')"><Icon name="copy" :size="15" />Скопировать адрес</button>
          <p v-if="c.note" class="note muted">{{ c.note }}</p>
        </section>

        <section class="card">
          <div class="head">
            <b>Binance Pay</b>
            <span class="net">{{ BINANCE_PAY.name }} · без комиссии</span>
          </div>
          <div class="qr" v-html="paySvg" />
          <p class="note muted">Отсканируйте код приложением Binance или откройте ссылку на телефоне с Binance</p>
          <div class="pay-actions">
            <a class="btn primary sm" :href="BINANCE_PAY.link" target="_blank" rel="noopener">Открыть в Binance</a>
            <button class="btn sm" @click="copy(BINANCE_PAY.link, 'Ссылка')"><Icon name="copy" :size="15" />Ссылка</button>
          </div>
        </section>
      </div>

      <p class="warn">Отправляйте только <b>USDT</b> и только в указанной сети — перевод в другой сети не дойдёт.</p>
    </div>
  </Modal>
</template>

<style scoped>
.dn {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100dvh - 90px);
}
.lead {
  margin: 0;
  line-height: 1.45;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  min-width: 0;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}
.net {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
/* QR-код — всегда тёмный на белом: так его читает любая камера, и в тёмной теме тоже */
.qr {
  width: 140px;
  padding: 6px;
  border-radius: 8px;
  background: #fff;
  line-height: 0;
}
.qr :deep(svg) {
  width: 100%;
  height: auto;
}
.addr {
  width: 100%;
  font-size: 11.5px;
  word-break: break-all;
  text-align: center;
  user-select: all;
}
.note {
  margin: 0;
  font-size: 11.5px;
  text-align: center;
}
.pay-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
a.btn {
  text-decoration: none;
}
.warn {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
