import { describe, expect, it } from 'vitest'
import { DONATE_METHODS, shouldPulse } from '../src/lib/donate'

const DAY = 86_400_000

describe('донат', () => {
  it('кнопка оживает не раньше чем через 2 дня использования и не чаще раза в 4 дня', () => {
    const now = 100 * DAY
    expect(shouldPulse({ first: now - DAY, pulsed: 0, opened: false }, now)).toBe(false)
    expect(shouldPulse({ first: now - 3 * DAY, pulsed: 0, opened: false }, now)).toBe(true)
    expect(shouldPulse({ first: now - 30 * DAY, pulsed: now - 2 * DAY, opened: false }, now)).toBe(false)
    expect(shouldPulse({ first: now - 30 * DAY, pulsed: now - 5 * DAY, opened: false }, now)).toBe(true)
  })

  it('после того как окно доната открыли, кнопка больше не анимируется', () => {
    expect(shouldPulse({ first: 0, pulsed: 0, opened: true }, 100 * DAY)).toBe(false)
  })

  it('адреса кошельков — в правильном формате своих сетей', () => {
    const by = (id: string) => DONATE_METHODS.find((t) => t.id === id)!
    expect(by('trc20').address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
    expect(by('bep20').address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(by('erc20').address).toBe(by('bep20').address)
    expect(by('pay').address).toMatch(/^https:\/\/app\.binance\.com\//)
  })
})
