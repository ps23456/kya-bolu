import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
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

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [conversationText, setConversationText] = useState('')
  const [result, setResult] = useState<ReplyResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : ''), [image])
  const hasInput = Boolean(image || conversationText.trim())

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

      setResult(data as ReplyResponse)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not generate replies.')
    } finally {
      setIsLoading(false)
    }
  }

  async function copyReply(text: string, index: number) {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    window.setTimeout(() => setCopiedIndex(null), 1400)
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">screenshots in, comebacks out</p>
        <h1>Kya Bolu?</h1>
        <p className="tagline">Never leave anyone on read. Or do — stylishly.</p>
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
          Or paste the conversation
        </label>
        <textarea
          id="conversation-text"
          value={conversationText}
          onChange={(event) => setConversationText(event.target.value)}
          placeholder={'Them: kal mil rahe ho?\nYou: ...'}
        />

        {error && <p className="error-message">{error}</p>}

        <button className="submit-button" type="submit" disabled={!hasInput || isLoading}>
          {isLoading ? 'Cooking replies...' : 'Tell me what to say'}
        </button>
      </form>

      {result && (
        <section className="results-card" aria-live="polite">
          <div className="readout">
            <span>{result.language}</span>
            <p>{result.situation_read}</p>
          </div>

          <div className="reply-grid">
            {result.replies.map((reply, index) => (
              <article className="reply-card" key={`${reply.tone}-${reply.text}`}>
                <div>
                  <p className="tone">{reply.tone}</p>
                  <p className="reply-text">{reply.text}</p>
                </div>
                <button type="button" onClick={() => void copyReply(reply.text, index)}>
                  {copiedIndex === index ? 'Copied!' : 'Copy'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

export default App
