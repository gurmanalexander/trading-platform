<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app, isPhone } from '../stores/app'
import { DONATE_METHODS, markDonateOpened, type DonateMethod } from '../lib/donate'
import { t } from '../lib/i18n'

// Поддержать проект. Сначала выбирают способ, потом видят только его: адрес, одну большую кнопку
// «Скопировать» и предупреждение про сеть. QR-код — только у выбранного способа: на компьютере рядом
// с адресом (сканировать телефоном), на телефоне — по кнопке, ведь свой экран телефоном не отсканируешь.
onMounted(markDonateOpened)

const method = ref<DonateMethod>(DONATE_METHODS[0])
const qrOpen = ref(false)
const showQr = computed(() => !isPhone.value || qrOpen.value)

const svgCache = new Map<string, string>()
const svg = computed(() => {
  const text = method.value.address
  let s = svgCache.get(text)
  if (!s) {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    s = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
    svgCache.set(text, s)
  }
  return s
})

/** Адрес частями: начало и конец выделены — по ним сверяют адрес после вставки в кошелёк */
const parts = computed(() => {
  const a = method.value.address
  return { head: a.slice(0, 6), mid: a.slice(6, -6), tail: a.slice(-6) }
})

const copied = ref(false)
let copiedTimer = 0
watch(method, () => {
  copied.value = false
  qrOpen.value = false
})
async function copy() {
  const text = method.value.address
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => (copied.value = false), 2200)
  } catch {
    prompt(t('Скопируйте адрес'), text)
  }
}

/** Переведённая фраза кусками: подстановки {name} выделяются жирным */
function rich(key: string, vars: Record<string, string>): { text: string; bold: boolean }[] {
  return t(key)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((p) => {
      const name = /^\{(\w+)\}$/.exec(p)?.[1]
      return name && name in vars ? { text: vars[name], bold: true } : { text: p, bold: false }
    })
}
const network = computed(() => t(method.value.network ?? ''))
const recipient = computed(() => rich('Получатель — {name}.', { name: t(method.value.sub) }))
const warning = computed(() => rich('Только {coin} и только в сети {network} — в другой сети перевод не дойдёт.', { coin: 'USDT', network: network.value }))
onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>

<template>
  <Modal :title="t('Поддержать проект')" :width="520" @close="app.donateOpen = false">
    <div class="dn">
      <div class="hero">
        <span class="hero-icon"><Icon name="heart" :size="22" /></span>
        <div class="hero-text">
          <b>{{ t('tvx бесплатный и без рекламы') }}</b>
          <span>{{ t('Если терминал помогает вам в торговле — поддержите его развитие. Любая сумма — это новые функции и исправления.') }}</span>
        </div>
      </div>

      <div class="methods" role="radiogroup" :aria-label="t('Способ перевода')">
        <button
          v-for="m in DONATE_METHODS"
          :key="m.id"
          class="method"
          :class="{ on: m.id === method.id }"
          role="radio"
          :aria-checked="m.id === method.id"
          @click="method = m"
        >
          <span class="m-title">{{ m.title }}</span>
          <span class="m-sub">
            {{ t(m.sub) }}
            <span v-if="m.tag" class="m-tag" :class="m.pay ? 'good' : 'meh'">{{ t(m.tag) }}</span>
          </span>
        </button>
      </div>

      <div class="detail" :class="{ 'with-qr': showQr }">
        <div class="d-main">
          <template v-if="method.pay">
            <p class="d-text">{{ t('Переведите любую сумму через Binance Pay — без комиссии, деньги приходят сразу.') }}</p>
            <a class="cta" :href="method.address" target="_blank" rel="noopener"><Icon name="external" :size="16" />{{ t('Открыть Binance Pay') }}</a>
            <p class="hint">
              <template v-for="(p, i) in recipient" :key="i"><b v-if="p.bold">{{ p.text }}</b><template v-else>{{ p.text }}</template></template>
              <template v-if="!isPhone"> {{ t('Или отсканируйте QR-код в приложении Binance.') }}</template>
            </p>
          </template>
          <template v-else>
            <span class="d-label">{{ t('Адрес USDT · {network}', { network }) }}</span>
            <code class="addr"><b>{{ parts.head }}</b>{{ parts.mid }}<b>{{ parts.tail }}</b></code>
            <button class="cta" :class="{ done: copied }" @click="copy">
              <Icon :name="copied ? 'check' : 'copy'" :size="16" />{{ copied ? t('Адрес скопирован') : t('Скопировать адрес') }}
            </button>
            <p class="warn">
              <Icon name="info" :size="14" />
              <span><template v-for="(p, i) in warning" :key="i"><b v-if="p.bold">{{ p.text }}</b><template v-else>{{ p.text }}</template></template></span>
            </p>
          </template>
        </div>
        <div v-if="showQr" class="d-qr">
          <div class="qr" v-html="svg" />
        </div>
      </div>
      <button v-if="isPhone" class="qr-toggle" @click="qrOpen = !qrOpen">
        <Icon name="qr" :size="15" />{{ qrOpen ? t('Скрыть QR-код') : t('Показать QR-код') }}
      </button>

      <p class="thanks">{{ t('Спасибо, что пользуетесь tvx') }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.dn {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
}

/* вступление: сердечко в мягком круге и пара строк, без давления */
.hero {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.hero-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #f0566b;
  background: rgba(240, 86, 107, 0.12);
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.4;
}
.hero-text b {
  font-size: 14.5px;
}
.hero-text span {
  color: var(--muted);
  font-size: 13px;
}

/* выбор способа: четыре плитки, выбранная — в цвете акцента */
.methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.method {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-height: 54px;
  padding: 8px 10px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.method:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.method.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg));
}
.m-title {
  font-weight: 600;
  font-size: 13.5px;
}
.m-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 12px;
  color: var(--muted);
}
.m-tag {
  padding: 0 6px;
  line-height: 17px;
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 600;
}
.m-tag.good {
  color: var(--up);
  background: color-mix(in srgb, var(--up) 14%, transparent);
}
.m-tag.meh {
  color: var(--muted);
  background: var(--hover);
}

/* выбранный способ: адрес, большая кнопка, предупреждение; QR — справа */
.detail {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border-radius: 12px;
  background: var(--hover);
}
.detail.with-qr {
  grid-template-columns: 1fr auto;
}
.d-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.d-label {
  font-size: 12px;
  color: var(--muted);
}
.d-text {
  margin: 0;
  line-height: 1.45;
}
.addr {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  user-select: all;
}
.addr b {
  color: var(--text);
  font-weight: 700;
}
.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  transition:
    background 0.15s,
    transform 0.1s;
}
.cta:hover {
  filter: brightness(1.08);
}
.cta:active {
  transform: scale(0.98);
}
.cta.done {
  background: var(--up);
}
.warn {
  display: flex;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
}
.warn :deep(svg) {
  flex: none;
  margin-top: 1px;
  color: var(--warn);
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
/* QR — всегда тёмный на белом: так его читает любая камера, и в тёмной теме тоже */
.d-qr {
  display: flex;
  justify-content: center;
}
.qr {
  width: 128px;
  padding: 8px;
  border-radius: 10px;
  background: #fff;
  line-height: 0;
}
.qr :deep(svg) {
  width: 100%;
  height: auto;
}
.qr-toggle {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--accent);
}
.thanks {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 719px) {
  .detail.with-qr {
    grid-template-columns: 1fr;
  }
  .qr {
    width: 180px;
  }
  .cta {
    height: 46px;
  }
}
</style>
