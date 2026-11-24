import { describe, expect, it } from 'vitest'
import { DONATE_METHODS, shouldPulse } from '../src/lib/donate'


describe('донат', () => {
  it('сердечко стучит раз в полторы минуты, а после открытия окна — раз в 15 минут', () => {
    const now = 1_000_000_000
    expect(shouldPulse({ first: 0, pulsed: now - 60_000, opened: false }, now)).toBe(false)
    expect(shouldPulse({ first: 0, pulsed: now - 91_000, opened: false }, now)).toBe(true)
    expect(shouldPulse({ first: 0, pulsed: now - 5 * 60_000, opened: true }, now)).toBe(false)
    expect(shouldPulse({ first: 0, pulsed: now - 16 * 60_000, opened: true }, now)).toBe(true)
  })

  it('адреса кошельков — в правильном формате своих сетей', () => {
    const by = (id: string) => DONATE_METHODS.find((t) => t.id === id)!
    expect(by('trc20').address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
    expect(by('bep20').address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(by('erc20').address).toBe(by('bep20').address)
    expect(by('pay').address).toMatch(/^https:\/\/app\.binance\.com\//)
  })
})
