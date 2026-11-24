<script setup lang="ts">
import Modal from './Modal.vue'
import { app, LEGEND_FONTS, SCALE_FONTS } from '../stores/app'
import { fmtOffset, TIMEZONES, tzMenuLabel, tzOffsetSec } from '../lib/timezone'

// Вид графиков (крупные шрифты, таймер свечи) и объём позиции из депозита и риска
function num(e: Event): number {
  const v = parseFloat((e.target as HTMLInputElement).value.replace(',', '.').replace(/\s/g, ''))
  return isFinite(v) && v >= 0 ? v : 0
}
</script>

<template>
  <Modal title="Вид и размер позиции" :width="400" @close="app.viewOpen = false">
    <div class="vd">
      <div class="vd-title">Шрифты</div>
      <label class="vd-row">
        <span>Шкалы цены и времени<small class="muted">и подписи рисунков</small></span>
        <select v-model.number="app.view.scaleFont" class="field">
          <option v-for="f in SCALE_FONTS" :key="f" :value="f">{{ f }} px{{ f === 11 ? ' — обычный' : '' }}</option>
        </select>
      </label>
      <label class="vd-row">
        <span>Легенда и ATR<small class="muted">цены свечи, ATR, таблица ATR</small></span>
        <select v-model.number="app.view.legendFont" class="field">
          <option v-for="f in LEGEND_FONTS" :key="f" :value="f">{{ f }} px{{ f === 12 ? ' — обычный' : '' }}</option>
        </select>
      </label>
      <label class="vd-row check">
        <input v-model="app.view.countdown" type="checkbox" />
        <span>Время до закрытия свечи на шкале цены<small class="muted">под последней ценой, как в TradingView</small></span>
      </label>
      <label class="vd-row">
        <span>Часовой пояс<small class="muted">время на внутридневных графиках</small></span>
        <select v-model="app.view.tz" class="field">
          <option v-for="z in TIMEZONES" :key="z.id" :value="z.id">{{ z.id === 'local' ? `${z.name} (${fmtOffset(tzOffsetSec(z.id))})` : tzMenuLabel(z) }}</option>
        </select>
      </label>
      <label class="vd-row check">
        <input v-model="app.view.thinBars" type="checkbox" />
        <span>Тонкие бары<small class="muted">при увеличении бары не толстеют — удобнее смотреть хаи и лои</small></span>
      </label>
      <label class="vd-row check">
        <input v-model="app.view.priceLine" type="checkbox" />
        <span>Линия текущей цены<small class="muted">горизонтальная линия от последнего бара; цена и таймер на шкале остаются</small></span>
      </label>

      <div class="vd-title">Размер позиции</div>
      <label class="vd-row">
        <span>Депозит, $</span>
        <input class="field" inputmode="decimal" :value="app.risk.deposit || ''" placeholder="например, 1000" @change="app.risk.deposit = num($event)" />
      </label>
      <label class="vd-row">
        <span>Риск на сделку, % депозита<small class="muted">столько теряется, если сработает стоп</small></span>
        <input class="field" inputmode="decimal" :value="app.risk.pct" @change="app.risk.pct = Math.min(100, num($event))" />
      </label>
      <p class="muted">
        Объём позиции = депозит × риск % ÷ расстояние до стопа. Он появляется в подписи позиции на графике и в её панели.
        <template v-if="app.risk.deposit > 0">Риск на сделку сейчас — {{ +((app.risk.deposit * app.risk.pct) / 100).toFixed(2) }} $.</template>
      </p>
      <div class="vd-actions">
        <button class="btn primary" @click="app.viewOpen = false">Готово</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.vd {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
}
.vd-title {
  font-weight: 600;
  margin-top: 4px;
}
.vd-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vd-row > span {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.vd-row small {
  font-size: 11px;
}
.vd-row .field {
  width: 130px;
}
.vd-row.check {
  cursor: pointer;
}
p {
  margin: 0;
  font-size: 12px;
}
.vd-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}
</style>
