// Что зритель видит поверх приложения: курсор (в безоконном браузере его нет), след щелчка,
// подсказку нажатых клавиш и заставку главы. Всё — вне приложения, слой не ловит указатель.

export const overlay = () => {
  const css = `
  #tut-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
  #tut-cursor{position:absolute;left:0;top:0;width:26px;height:26px;transform:translate(-3px,-2px);transition:opacity .2s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
  #tut-cursor.touch{width:34px;height:34px;transform:translate(-17px,-17px)}
  .tut-ripple{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #4c8dff;animation:tut-r .55s ease-out forwards}
  @keyframes tut-r{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}
  #tut-keys{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);display:flex;gap:6px;opacity:0;transition:opacity .25s}
  #tut-keys.on{opacity:1}
  #tut-keys kbd{font:600 20px/1 inherit;padding:9px 14px;border-radius:9px;background:rgba(20,24,33,.88);color:#fff;border:1px solid rgba(255,255,255,.25);box-shadow:0 4px 18px rgba(0,0,0,.35)}
  #tut-keys span{align-self:center;color:#fff;font:600 18px inherit;text-shadow:0 1px 3px #000}
  #tut-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(12,15,22,.72);opacity:0;transition:opacity .35s;backdrop-filter:blur(3px)}
  #tut-card.on{opacity:1}
  #tut-card div{text-align:center;color:#fff}
  #tut-card small{display:block;font:500 20px inherit;opacity:.7;margin-bottom:10px;letter-spacing:.06em;text-transform:uppercase}
  #tut-card b{font:700 46px/1.15 inherit}
  `
  const arrow = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.5 11.2-6.6 1.2 3.8 7.1-3 1.5-3.7-7.2-4.9 4.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`
  const dot = `<svg viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="13" fill="rgba(255,255,255,.55)" stroke="rgba(20,20,20,.6)" stroke-width="2"/></svg>`
  function mount() {
    if (document.getElementById('tut-layer')) return
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    const layer = document.createElement('div')
    layer.id = 'tut-layer'
    layer.innerHTML = `<div id="tut-cursor">${window.__tutTouch ? dot : arrow}</div><div id="tut-keys"></div><div id="tut-card"><div><small></small><b></b></div></div>`
    document.body.appendChild(layer)
    const cur = layer.querySelector('#tut-cursor')
    if (window.__tutTouch) {
      cur.classList.add('touch')
      cur.style.opacity = '0'
    }
    const at = (x, y) => (cur.style.left = x + 'px') && (cur.style.top = y + 'px')
    const ripple = (x, y) => {
      const r = document.createElement('div')
      r.className = 'tut-ripple'
      r.style.left = x + 'px'
      r.style.top = y + 'px'
      layer.appendChild(r)
      setTimeout(() => r.remove(), 600)
    }
    addEventListener('mousemove', (e) => at(e.clientX, e.clientY), true)
    addEventListener('pointermove', (e) => at(e.clientX, e.clientY), true)
    addEventListener('pointerdown', (e) => {
      at(e.clientX, e.clientY)
      ripple(e.clientX, e.clientY)
      if (window.__tutTouch) cur.style.opacity = '1'
    }, true)
    addEventListener('pointerup', () => {
      if (window.__tutTouch) setTimeout(() => (cur.style.opacity = '0'), 250)
    }, true)
  }
  let keysTimer = 0
  /** Подсказка клавиш: ['Alt', 'H'] */
  window.__tutKeys = (keys) => {
    mount()
    const box = document.getElementById('tut-keys')
    box.innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('<span>+</span>')
    box.classList.add('on')
    clearTimeout(keysTimer)
    keysTimer = setTimeout(() => box.classList.remove('on'), 1700)
  }
  /** Заставка главы; null — убрать */
  window.__tutCard = (small, title) => {
    mount()
    const card = document.getElementById('tut-card')
    if (!title) return card.classList.remove('on')
    card.querySelector('small').textContent = small
    card.querySelector('b').textContent = title
    card.classList.add('on')
  }
  /** Курсор — в точку, без событий страницы (например, после перезагрузки) */
  window.__tutCursor = (x, y) => {
    mount()
    const cur = document.getElementById('tut-cursor')
    cur.style.left = x + 'px'
    cur.style.top = y + 'px'
  }
  if (document.body) mount()
  else addEventListener('DOMContentLoaded', mount)
}
