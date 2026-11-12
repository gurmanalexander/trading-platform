import { shallowRef } from 'vue'

/** Перекрестие, которое пользователь ведёт в одной из панелей, — остальные показывают его у себя */
export const crosshairBus = shallowRef<{ pane: number; key: string; time: number; price: number } | null>(null)

/** Момент времени в центре панели, которую прокручивает пользователь, — для синхронизации времени */
export const timeBus = shallowRef<{ pane: number; time: number; realtime: boolean } | null>(null)
