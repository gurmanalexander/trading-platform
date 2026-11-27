import type { BridgeErrorCode } from '../core/protocol'
import { t } from './i18n'

/** Понятное объяснение ошибки моста или биржи — что случилось и что с этим делать */
export function explainError(code: BridgeErrorCode | undefined, message?: string): string {
  switch (code) {
    case 'absent':
      return t('Расширение-мост не отвечает. Проверьте, что оно установлено и включено.')
    case 'reload':
      return t('Расширение обновилось. Перезагрузите страницу.')
    case 'forbidden':
      return t('Мост не отвечает этому адресу сайта: он собран для другого адреса журнала.')
    case 'no-account':
      return t('Ключа этого счёта больше нет в расширении. Добавьте его заново.')
    case 'auth':
      return t('Биржа не принимает ключ: он удалён, истёк или привязан к другому IP-адресу. Создайте новый ключ и добавьте его в расширении.')
    case 'geo':
      return t('Биржа недоступна из вашего региона или сети.')
    case 'rate':
      return t('Биржа просит подождать: слишком много запросов. Обновление повторится позже.')
    case 'network':
      return t('Нет связи с биржей. Обновление повторится, когда появится интернет.')
    default:
      return message ? t('Биржа ответила ошибкой: {msg}', { msg: message }) : t('Не удалось обновить счёт.')
  }
}
