import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import './App.css'

interface ReplyOption {
  tone: string
  text: string
}

interface ReplyResponse {
  language: string
  situation_read: string
  replies: ReplyOption[]
}

const FREE_SESSION_LIMIT = 3
const EMAIL_STORAGE_KEY = 'kya-bolu-email'

const replyStyles = [
  { title: 'POLITE', className: 'polite', emoji: '🌿' },
  { title: 'SAVAGE', className: 'savage', emoji: '🔥' },
  { title: 'ESCAPE', className: 'escape', emoji: '🛟' },
] as const

const loadingLines = [
  'Reading the vibe...',
  'Deciding how burnt they deserve to be...',
  'Crafting your escape...',
]

const normalizeEmail = (email: string) => email.trim().toLowerCase()

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [conversationText, setConversationText] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [activeEmail, setActiveEmail] = useState(() => localStorage.getItem(EMAIL_STORAGE_KEY) ?? '')
  const [toneDraft, setToneDraft] = useState('')
  const [result, setResult] = useState<ReplyResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [savageAudio, setSavageAudio] = useState<'idle' | 'loading' | 'error'>('idle')

  const user = useQuery(api.users.getByEmail, activeEmail ? { email: activeEmail } : 'skip')
  const getOrCreateUser = useMutation(api.users.getOrCreate)
  const updateToneProfile = useMutation(api.users.updateToneProfile)
  const recordSession = useMutation(api.sessions.record)

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : ''), [image])
  const hasInput = Boolean(image || conversationText.trim())
  const sessionsUsed = user?.sessionCount ?? 0
  const sessionsLeft = Math.max(0, FREE_SESSION_LIMIT - sessionsUsed)
  const isLimitReached = Boolean(user && sessionsUsed >= FREE_SESSION_LIMIT)

  useEffect(() => {
    if (user?.tone_profile) setToneDraft(user.tone_profile)
  }, [user?.tone_profile])

  function handleFiles(files: FileList | null) {
    const nextImage = files?.[0]
    if (!nextImage) return

    if (!nextImage.type.startsWith('image/')) {
      setError('Please upload an image screenshot.')
      return
    }

    setError('')
    setResult(null)
    setImage(nextImage)
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = normalizeEmail(emailInput)

    if (!email || !email.includes('@')) {
      setError('Drop a real email first.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const nextUser = await getOrCreateUser({ email })
      if (!nextUser) throw new Error('Could not create user.')
      localStorage.setItem(EMAIL_STORAGE_KEY, nextUser.email)
      setActiveEmail(nextUser.email)
      setToneDraft(nextUser.tone_profile)
      setEmailInput('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save email.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      setError('Add your email first.')
      return
    }

    if (isLimitReached) {
      setResult(null)
      setError('')
      return
    }

    if (!hasInput) {
      setError('Add a screenshot or paste the chat first.')
      return
    }

    setIsLoading(true)
    setError('')
    setResult(null)

    try {
      const body = new FormData()
      if (image) body.append('image', image)
      if (conversationText.trim()) body.append('text', conversationText.trim())

      const response = await fetch('/api/reply', {
        method: 'POST',
        body,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not generate replies.')
      }

      const nextResult = data as ReplyResponse
      setResult(nextResult)

      await recordSession({
        userId: user._id as Id<'users'>,
        inputText: conversationText.trim() || '[screenshot upload]',
        detectedLanguage: nextResult.language,
        replies: nextResult.replies,
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not generate replies.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToneSave() {
    if (!activeEmail) return
    await updateToneProfile({ email: activeEmail, tone_profile: toneDraft })
  }

  async function copyReply(text: string, index: number) {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    window.setTimeout(() => setCopiedIndex(null), 1400)
  }

  async function playSavage(text: string) {
    setSavageAudio('loading')

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) throw new Error('Could not load audio.')

      const url = URL.createObjectURL(await response.blob())
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      setSavageAudio('idle')
    } catch {
      setSavageAudio('error')
    }
  }

  function resetUser() {
    localStorage.removeItem(EMAIL_STORAGE_KEY)
    setActiveEmail('')
    setResult(null)
    setError('')
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">screenshots in, comebacks out</p>
        <h1>Kya Bolu?</h1>
        <p className="tagline">Never leave anyone on read. Or do — stylishly.</p>
        <p className="emoji-row" aria-label="mood menu">
          💬 📸 ⌨️ 🔥 🛟 ✨
        </p>
      </section>

      {!activeEmail && (
        <section className="composer-card email-card">
          <p className="mini-label">First one’s on the house. Three, actually.</p>
          <h2>Drop your email to start.</h2>
          <form onSubmit={handleEmailSubmit}>
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {error && <p className="error-message">{error}</p>}
            <button className="submit-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Unlock replies'}
            </button>
          </form>
        </section>
      )}

      {activeEmail && !user && (
        <section className="composer-card">
          <div className="loading-vibe" aria-live="polite">
            <span>Loading your vibe...</span>
            <span className="loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        </section>
      )}

      {user && (
        <>
          <section className="profile-card">
            <div>
              <p className="mini-label">{sessionsLeft} free session{sessionsLeft === 1 ? '' : 's'} left</p>
              <p className="user-email">{user.email}</p>
            </div>
            <label>
              Tone profile
              <input
                value={toneDraft}
                onBlur={() => void handleToneSave()}
                onChange={(event) => setToneDraft(event.target.value)}
                placeholder="balanced, witty, low-drama"
              />
            </label>
            <button type="button" className="ghost-button compact" onClick={resetUser}>
              Switch email
            </button>
          </section>

          <form className="composer-card" onSubmit={handleSubmit}>
            <label
              className={`drop-zone ${image ? 'has-image' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                handleFiles(event.dataTransfer.files)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handleFiles(event.target.files)}
              />
              {previewUrl ? (
                <img src={previewUrl} alt="Uploaded chat screenshot preview" />
              ) : (
                <span className="drop-copy">
                  <span className="drop-icons" aria-hidden="true">
                    <span>📸</span>
                    <span>⌨️</span>
                  </span>
                  <strong>Drop a chat screenshot</strong>
                  <small>or tap to open camera / gallery</small>
                </span>
              )}
            </label>

            {image && (
              <button type="button" className="ghost-button" onClick={() => setImage(null)}>
                Remove screenshot
              </button>
            )}

            <label className="text-input-label" htmlFor="conversation-text">
              <span aria-hidden="true">⌨️</span> Or paste the conversation
            </label>
            <textarea
              id="conversation-text"
              value={conversationText}
              onChange={(event) => setConversationText(event.target.value)}
              placeholder={'Them: kal mil rahe ho?\nYou: ...'}
            />

            {error && <p className="error-message">{error}</p>}

            {isLoading && (
              <div className="loading-vibe" aria-live="polite">
                <span className="loading-texts">
                  {loadingLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
                <span className="loading-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}

            <button className="submit-button" type="submit" disabled={(!hasInput && !isLimitReached) || isLoading}>
              {isLimitReached ? 'Upgrade to keep replying' : isLoading ? 'Summoning the perfect reply' : 'Tell me what to say'}
            </button>
          </form>
        </>
      )}

      {result && (
        <section className="results-card" aria-live="polite">
          <div className="readout">
            <span>{result.language}</span>
            <p>{result.situation_read}</p>
          </div>

          <div className="reply-grid">
            {result.replies.map((reply, index) => {
              const style = replyStyles[index] ?? replyStyles[0]

              return (
                <article className={`reply-card ${style.className}`} key={`${index}-${reply.text}`}>
                  <span className="card-emoji" aria-hidden="true">
                    {style.emoji}
                  </span>
                  <div>
                    <p className="tone">{style.title}</p>
                    <p className="reply-text">{reply.text}</p>
                  </div>
                  {index === 1 && (
                    <div className="voice-action">
                      <button type="button" className="voice-button" onClick={() => void playSavage(reply.text)} disabled={savageAudio === 'loading'}>
                        {savageAudio === 'loading' ? <span className="button-spinner" aria-hidden="true" /> : '🔊'}
                        {savageAudio === 'loading' ? 'Loading voice...' : 'Play savage'}
                      </button>
                      {savageAudio === 'error' && <small>coudnt load audio</small>}
                    </div>
                  )}
                  <button type="button" onClick={() => void copyReply(reply.text, index)}>
                    {copiedIndex === index ? 'COPIED!' : 'COPY'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {user && isLimitReached && !result && (
        <section className="upgrade-card" aria-live="polite">
          <p className="mini-label">Free replies used</p>
          <h2>You’ve got the taste. Now go unlimited.</h2>
          <p>Upgrade is coming next — for now, you’ve used your 3 free Kya Bolu? sessions.</p>
          <button className="submit-button" type="button">
            Join upgrade waitlist
          </button>
        </section>
      )}

      <footer>Built at Hermes Buildathon ⚡ by Priyanshi</footer>
    </main>
  )
}

export default App
