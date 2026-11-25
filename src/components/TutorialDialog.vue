<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app } from '../stores/app'
import { i18n, LANGS, t, type Lang } from '../lib/i18n'

// Обучение: видео-обзор терминала с оглавлением. Файлы лежат рядом с приложением (public/help)
// и загружаются, только когда окно открыли. Обзор записан на двух языках (scripts/tutorial):
// по умолчанию — на языке интерфейса, переключатель над оглавлением выбирает другой.
interface Chapter {
  /** секунда начала */
  t: number
  title: string
}
const base = import.meta.env.BASE_URL + 'help/'
const FILES: Record<Lang, { video: string; vtt: string; chapters: string; label: string }> = {
  ru: { video: 'tvx-obzor.mp4', vtt: 'tvx-obzor.vtt', chapters: 'chapters.json', label: 'Русские' },
  en: { video: 'tvx-overview.mp4', vtt: 'tvx-overview.vtt', chapters: 'chapters.en.json', label: 'English' },
}
const lang = ref<Lang>(i18n.lang)
const video = ref<HTMLVideoElement>()
const chapters = ref<Chapter[]>([])
const current = ref(0)
const failed = ref(false)

watch(
  lang,
  async (l) => {
    failed.value = false
    current.value = 0
    chapters.value = []
    try {
      const res = await fetch(base + FILES[l].chapters)
      if (res.ok && l === lang.value) chapters.value = await res.json()
    } catch {
      /* без оглавления видео всё равно можно смотреть */
    }
  },
  { immediate: true },
)

function jump(c: Chapter) {
  const v = video.value
  if (!v) return
  v.currentTime = c.t
  v.play().catch(() => {})
}
function onTime() {
  const t = video.value?.currentTime ?? 0
  let i = 0
  chapters.value.forEach((c, k) => {
    if (c.t <= t + 0.3) i = k
  })
  current.value = i
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
</script>

<template>
  <Modal :title="t('Обучение')" :width="1180" @close="app.tutorialOpen = false">
    <div class="tu">
      <div class="player">
        <video :key="lang" ref="video" controls playsinline preload="metadata" :src="base + FILES[lang].video" @timeupdate="onTime" @error="failed = true">
          <!-- субтитры включены сразу: в них — пояснения к каждому шагу -->
          <track kind="subtitles" default :srclang="lang" :label="t(FILES[lang].label)" :src="base + FILES[lang].vtt" />
        </video>
        <p v-if="failed" class="muted note">{{ t('Видео не загрузилось. Проверьте соединение и откройте окно ещё раз.') }}</p>
        <p v-else class="muted note">{{ t('Обзор идёт от простого к сложному. Выберите часть справа — видео перейдёт к ней. Субтитры выключаются кнопкой в проигрывателе.') }}</p>
      </div>
      <nav class="toc scroll" :aria-label="t('Части обзора')">
        <div class="langs" role="group" :aria-label="t('Язык видео')">
          <button v-for="l in LANGS" :key="l.id" :class="{ on: lang === l.id }" @click="lang = l.id">{{ l.label }}</button>
        </div>
        <button v-for="(c, i) in chapters" :key="c.t" :class="{ on: i === current }" @click="jump(c)">
          <Icon name="play" :size="15" />
          <span>{{ c.title }}</span>
          <i>{{ mmss(c.t) }}</i>
        </button>
      </nav>
    </div>
  </Modal>
</template>

<style scoped>
.tu {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  gap: 14px;
  padding: 14px 16px 16px;
  min-height: 0;
}
video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.note {
  margin: 8px 0 0;
  font-size: 12px;
}
.toc {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: min(62vh, 620px);
}
.langs {
  display: flex;
  gap: 2px;
  padding: 2px;
  margin-bottom: 6px;
  border-radius: 7px;
  background: var(--hover);
}
.toc .langs button {
  flex: 1;
  justify-content: center;
  padding: 4px 8px;
  font-size: 12px;
}
.toc .langs button.on {
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}
.toc button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 13px;
  color: var(--muted);
}
.toc button:hover {
  background: var(--hover);
  color: var(--text);
}
.toc button.on {
  background: var(--sel-bg);
  color: var(--sel);
}
.toc span {
  flex: 1;
  min-width: 0;
}
.toc i {
  font-style: normal;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 899px) {
  .tu {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .toc {
    max-height: none;
  }
}
</style>
