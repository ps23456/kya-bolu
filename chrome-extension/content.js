(() => {
  const API_URL = 'https://kya-bolu.pages.dev/api/reply'
  const ROOT_ID = 'kya-bolu-extension-root'

  let root
  let overlay
  let button

  function ensureRoot() {
    root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
      document.documentElement.appendChild(root)
    }
    return root
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
  }

  function readVisibleChat() {
    const messageNodes = Array.from(document.querySelectorAll('[data-pre-plain-text]'))
      .filter(isVisible)
      .slice(-30)

    const lines = messageNodes
      .map((node) => {
        const meta = node.getAttribute('data-pre-plain-text') ?? ''
        const authorMatch = meta.match(/\]\s*([^:]+):\s*$/)
        const author = authorMatch?.[1]?.trim()
        const text = Array.from(node.querySelectorAll('span.selectable-text, span[dir="auto"]'))
          .map((span) => span.textContent?.trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (!text) return ''
        return author ? `${author}: ${text}` : text
      })
      .filter(Boolean)

    return lines.join('\n')
  }

  function findComposer() {
    const candidates = Array.from(document.querySelectorAll('footer [contenteditable="true"], [contenteditable="true"][role="textbox"]'))
      .filter(isVisible)

    return candidates.at(-1) ?? null
  }

  function insertIntoComposer(text) {
    const composer = findComposer()
    if (!composer) {
      showOverlay({ error: 'Could not find WhatsApp input box.' })
      return
    }

    composer.focus()
    document.execCommand('selectAll', false)
    document.execCommand('insertText', false, text)
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  }

  function closeOverlay() {
    overlay?.remove()
    overlay = null
  }

  function chip(label, text, className) {
    const chipButton = document.createElement('button')
    chipButton.type = 'button'
    chipButton.className = `kb-chip ${className}`
    chipButton.innerHTML = `<strong>${label}</strong><span>${escapeHtml(text)}</span>`
    chipButton.addEventListener('click', () => insertIntoComposer(text))
    return chipButton
  }

  function showOverlay({ loading = false, error = '', result = null } = {}) {
    closeOverlay()
    overlay = document.createElement('section')
    overlay.className = 'kb-overlay'

    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'kb-close'
    close.textContent = '×'
    close.addEventListener('click', closeOverlay)
    overlay.appendChild(close)

    const title = document.createElement('p')
    title.className = 'kb-title'
    title.textContent = '💬 Kya Bolu?'
    overlay.appendChild(title)

    if (loading) {
      const loadingText = document.createElement('div')
      loadingText.className = 'kb-loading'
      loadingText.innerHTML = '<span></span>Reading the vibe...'
      overlay.appendChild(loadingText)
    } else if (error) {
      const errorText = document.createElement('p')
      errorText.className = 'kb-error'
      errorText.textContent = error
      overlay.appendChild(errorText)
    } else if (result) {
      const read = document.createElement('p')
      read.className = 'kb-read'
      read.textContent = result.situation_read || 'Pick your fighter.'
      overlay.appendChild(read)

      const replies = result.replies ?? []
      overlay.append(
        chip('🌿 POLITE', replies[0]?.text ?? '', 'polite'),
        chip('🔥 SAVAGE', replies[1]?.text ?? '', 'savage'),
        chip('🛟 ESCAPE', replies[2]?.text ?? '', 'escape'),
      )
    }

    ensureRoot().appendChild(overlay)
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
  }

  async function askKyaBolu() {
    const text = readVisibleChat()
    if (!text) {
      showOverlay({ error: 'Open a chat with visible messages first.' })
      return
    }

    showOverlay({ loading: true })

    try {
      const body = new FormData()
      body.append('text', text)
      const response = await fetch(API_URL, { method: 'POST', body })
      const result = await response.json()

      if (!response.ok) throw new Error(result.error || 'Could not read the vibe.')
      showOverlay({ result })
    } catch (error) {
      showOverlay({ error: error instanceof Error ? error.message : 'Could not read the vibe.' })
    }
  }

  function mountButton() {
    ensureRoot()
    if (button?.isConnected) return

    button = document.createElement('button')
    button.type = 'button'
    button.className = 'kb-float'
    button.textContent = '💬 Kya Bolu?'
    button.addEventListener('click', askKyaBolu)
    root.appendChild(button)
  }

  mountButton()
  const observer = new MutationObserver(mountButton)
  observer.observe(document.documentElement, { childList: true, subtree: true })
})()
