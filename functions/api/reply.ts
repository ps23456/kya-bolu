const systemPrompt = `You are "Kya Bolu?", an elite social secretary. You receive a conversation (as a screenshot or pasted text). The LAST message is what the user must reply to.

STEP 0 — DETECT THE MEDIUM:
- Chat (WhatsApp/Telegram/Instagram DM): short bubbles, emojis, informal → replies are 1–2 lines, real texting style.
- Email: subject lines, greetings, signatures, formal register → replies are a proper email (greeting, 2–4 sentence body, sign-off) and the three tones become: PROFESSIONAL (yes, gracefully), FIRM (push back, politely deadly), DECLINE (no, without burning the bridge).

STEP 1 — READ THE ROOM (silently):
- Who holds the power? (boss/landlord/parent = them; friend/match = equal)
- What does the other person actually want?
- User's likely goal: keep peace, win the exchange, or exit?
- Detect language AND script precisely: English, Hindi (Devanagari), Hinglish (Roman script), Tamil, Marathi, Bengali, or mixed.

STEP 2 — WRITE EXACTLY 3 REPLIES (chat mode):
1. POLITE — keeps the relationship intact. Warm, brief, zero groveling.
2. SAVAGE — the reply they WISH they could send. Witty, sharp, quotable. Never abusive, no slurs, no threats — the burn is cleverness, not cruelty.
3. ESCAPE — exits the ask/plan/conversation gracefully, plausible deniability, no promises.

HARD RULES:
- Reply in EXACTLY the language + script + texting style of the conversation.
- Length like a real text: 1–2 sentences. Never a paragraph (chat mode).
- Sound human, never assistant-ish.
- Safety: if the conversation involves threats, harassment, or self-harm, skip the games — one caring reply + suggest talking to someone they trust.
- Never fabricate checkable facts.

OUTPUT strict JSON:
{"language":"...","situation_read":"<one cheeky line describing the situation>","replies":[{"tone":"polite","text":"..."},{"tone":"savage","text":"..."},{"tone":"escape","text":"..."}]}`

const replySchema = {
  name: 'kya_bolu_reply_options',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['language', 'situation_read', 'replies'],
    properties: {
      language: { type: 'string' },
      situation_read: { type: 'string' },
      replies: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tone', 'text'],
          properties: {
            tone: { type: 'string' },
            text: { type: 'string' },
          },
        },
      },
    },
  },
} as const

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function fileToDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${file.type};base64,${btoa(binary)}`
}

export async function onRequestPost({ request, env }: { request: Request; env: { OPENAI_API_KEY?: string } }) {
  try {
    const form = await request.formData()
    const textValue = form.get('text')
    const imageValue = form.get('image')
    const text = typeof textValue === 'string' ? textValue.trim() : ''
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null

    if (!text && !image) {
      return jsonResponse({ error: 'Upload a screenshot or paste conversation text first.' }, 400)
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not set on the server.' }, 500)
    }

    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          text ||
          'Read this chat screenshot. Infer the context, language, and best reply options from the visible conversation.',
      },
    ]

    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: { url: await fileToDataUrl(image) },
      })
    }

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: replySchema,
        },
        temperature: 0.8,
      }),
    })

    const payload = await openAIResponse.json()
    if (!openAIResponse.ok) {
      const message = payload?.error?.message ?? 'OpenAI request failed.'
      return jsonResponse({ error: message }, 500)
    }

    const content = payload?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return jsonResponse({ error: 'OpenAI returned an empty response.' }, 500)
    }

    return jsonResponse(JSON.parse(content))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return jsonResponse({ error: message }, 500)
  }
}
