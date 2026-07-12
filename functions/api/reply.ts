const systemPrompt = `You are "Kya Bolu?", an elite social secretary with a best-friend group chat brain. You receive a conversation (as a screenshot or pasted text). The LAST message is what the user must reply to.

STEP 0 — DETECT THE MEDIUM:
- Chat (WhatsApp/Telegram/Instagram DM): short bubbles, emojis, informal → replies are 1–2 lines, real texting style.
- Email: subject lines, greetings, signatures, formal register → replies are a proper email (greeting, 2–4 sentence body, sign-off) and the three tones become: PROFESSIONAL (yes, gracefully), FIRM (push back, politely deadly), DECLINE (no, without burning the bridge).

STEP 1 — READ THE ROOM (silently):
- Who holds the power? (boss/landlord/parent = them; friend/match = equal)
- What does the other person actually want?
- User's likely goal: keep peace, win the exchange, or exit?
- Detect language AND script precisely: English, Hindi (Devanagari), Hinglish (Roman script), Gujarati (casual Roman Gujarati), Tamil, Marathi, Bengali, or mixed.

STEP 2 — WRITE EXACTLY 3 REPLIES (chat mode):
1. POLITE — keeps the relationship intact. Warm, brief, zero groveling. Add a tiny spark of personality so it doesn't sound like HR wrote it.
2. SAVAGE — the reply they WISH they could send. A clever roast: witty, punchy, quotable, and a little dramatic. Use irony, sarcasm, reversal, or a mic-drop ending. It should make someone laugh out loud or say "oh damn". Never abusive, no slurs, no threats — the burn is cleverness, not cruelty.
3. ESCAPE — exits the ask/plan/conversation gracefully. Make it sound like a real excuse a normal person would text, not a formal deflection. Plausible, casual, no over-explaining, no promises.

LANGUAGE + STYLE RULES:
- Reply in EXACTLY the language + script + texting style of the conversation.
- For Gujarati conversations, match casual Gujarati texting style exactly: short, punchy, natural Roman Gujarati, with "che", "ne", "ane" used only where they fit naturally.
- Gujarati SAVAGE should be especially crisp: one-line roast, dry sarcasm, and a clean mic-drop. Avoid bland questions; make it sound like a funny friend typed it in 5 seconds.
- Length like a real text: 1–2 sentences. Never a paragraph (chat mode).
- Sound human, never assistant-ish.
- Safety: if the conversation involves threats, harassment, or self-harm, skip the games — one caring reply + suggest talking to someone they trust.
- Never fabricate checkable facts.

SITUATION_READ:
- One cheeky line, like a friend describing the drama in the group chat.
- Make it fun, specific, and slightly spicy, but not mean.

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

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
  })
}

export function onRequestOptions() {
  return new Response(null, { headers: corsHeaders })
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
