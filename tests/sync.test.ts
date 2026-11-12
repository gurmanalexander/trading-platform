import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { APP_KIND, deriveKeys, docOf, newSyncCode, newer, seal, signEvent, unseal, validSyncCode } from '../src/lib/nostr'

describe('синхронизация: ключи, шифрование, события', () => {
  it('код синхронизации — 32 случайных байта', () => {
    const a = newSyncCode()
    expect(validSyncCode(a)).toBe(true)
    expect(newSyncCode()).not.toBe(a)
    expect(validSyncCode('короткий')).toBe(false)
    expect(validSyncCode(a.slice(1))).toBe(false)
  })

  it('из одного кода на разных устройствах получаются одни и те же ключи', async () => {
    const code = newSyncCode()
    const a = await deriveKeys(code)
    const b = await deriveKeys(code)
    expect(a.pk).toBe(b.pk)
    expect(a.pk).toMatch(/^[0-9a-f]{64}$/)
    expect((await deriveKeys(newSyncCode())).pk).not.toBe(a.pk)
  })

  it('зашифрованное читается тем же кодом и не читается другим', async () => {
    const a = await deriveKeys(newSyncCode())
    const text = JSON.stringify({ ts: 1, v: { lists: ['Наблюдаю', 'Сделки'], long: 'длинный текст '.repeat(60) } })
    const sealed = await seal(a.aes, text)
    expect(sealed).not.toContain('Наблюдаю')
    expect(await unseal(a.aes, sealed)).toBe(text)
    // короткий текст идёт без сжатия
    expect(await unseal(a.aes, await seal(a.aes, 'x'))).toBe('x')
    const other = await deriveKeys(newSyncCode())
    await expect(unseal(other.aes, sealed)).rejects.toThrow()
  })

  it('событие подписано по правилам протокола', async () => {
    const keys = await deriveKeys(newSyncCode())
    const ev = signEvent(keys, 'tvx:lists', 'содержимое', 1_800_000_000)
    expect(ev.kind).toBe(APP_KIND)
    expect(docOf(ev)).toBe('tvx:lists')
    expect(schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey))).toBe(true)
  })

  it('побеждает более позднее изменение; при равном времени выбор одинаков на обоих устройствах', () => {
    expect(newer({ ts: 2, json: 'a' }, { ts: 1, json: 'b' })).toBe(true)
    expect(newer({ ts: 1, json: 'a' }, { ts: 2, json: 'b' })).toBe(false)
    expect(newer({ ts: 5, json: 'b' }, { ts: 5, json: 'a' })).toBe(true)
    expect(newer({ ts: 5, json: 'a' }, { ts: 5, json: 'b' })).toBe(false)
  })
})
