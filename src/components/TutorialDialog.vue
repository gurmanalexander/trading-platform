<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import { app } from '../stores/app'

// Обучение: видео-обзор терминала с оглавлением. Файлы лежат рядом с приложением (public/help)
// и загружаются, только когда окно открыли.
interface Chapter {
  /** секунда начала */
  t: number
  title: string
}
const base = import.meta.env.BASE_URL + 'help/'
const video = ref<HTMLVideoElement>()
const chapters = ref<Chapter[]>([])
const current = ref(0)
const failed = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(base + 'chapters.json')
    if (res.ok) chapters.value = await res.json()
  } catch {
    /* без оглавления видео всё равно можно смотреть */
  }
})

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
  <Modal title="Обучение" :width="1180" @close="app.tutorialOpen = false">
    <div class="tu">
      <div class="player">
        <video ref="video" controls playsinline preload="metadata" :src="base + 'tvx-obzor.mp4'" @timeupdate="onTime" @error="failed = true">
          <track kind="subtitles" srclang="ru" label="Русские" :src="base + 'tvx-obzor.vtt'" />
        </video>
        <p v-if="failed" class="muted note">Видео не загрузилось. Проверьте соединение и откройте окно ещё раз.</p>
        <p v-else class="muted note">Обзор идёт от простого к сложному. Выберите часть справа — видео перейдёт к ней. Субтитры включаются кнопкой в проигрывателе.</p>
      </div>
      <nav class="toc scroll" aria-label="Части обзора">
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
  background: var(--accent-soft);
  color: var(--accent);
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
