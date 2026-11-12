import { toast } from '../stores/app'
import { shareLink } from './setup'

/** Копирует ссылку на текущий график; на телефоне открывает системное «Поделиться» */
export async function copyShareLink() {
  const url = shareLink()
  // системное окно «Поделиться» есть на телефонах; на компьютере удобнее сразу буфер
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ url })
      return
    } catch {
      /* пользователь закрыл окно — тогда просто копируем */
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast('Ссылка скопирована')
  } catch {
    prompt('Ссылка на график', url)
  }
}
