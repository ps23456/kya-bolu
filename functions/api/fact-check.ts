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

function extractClaim(conversation: string) {
  const lines = conversation
    .split(/\n|(?<=\.)\s+(?=[A-Z][^:]{1,30}:)/)
    .map((line) => line.trim())
    .filter(Boolean)

  const lastLine = lines.at(-1) ?? conversation.trim()
  return lastLine.replace(/^[^:]{1,40}:\s*/, '').trim()
}

function fallbackMessage(answer: string) {
  const clean = answer.replace(/\s+/g, ' ').trim()
  if (!clean) return "Couldn't verify — sus either way 🕵️"
  return clean.startsWith('✅') || clean.startsWith('❌') ? clean : `✅ ${clean}`
}

export async function onRequestPost({ request, env }: { request: Request; env: { LINKUP_API_KEY?: string } }) {
  try {
    if (!env.LINKUP_API_KEY) {
      return jsonResponse({ error: 'LINKUP_API_KEY is not set on the server.' }, 500)
    }

    const body = (await request.json()) as { conversation?: string }
    const conversation = body.conversation?.trim()

    if (!conversation) {
      return jsonResponse({ error: 'Conversation text is required.' }, 400)
    }

    const claim = extractClaim(conversation)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)

    const response = await fetch('https://api.linkup.so/v1/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.LINKUP_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        q: `Fact-check this excuse or claim using current web results: "${claim}". Reply in one casual sentence. Start with ✅ if web results support it, or ❌ if results do not support it / no reports are found.`,
        depth: 'standard',
        outputType: 'sourcedAnswer',
        includeInlineCitations: false,
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return jsonResponse({ error: 'Could not verify.' }, 500)
    }

    const payload = (await response.json()) as { answer?: string }
    return jsonResponse({ claim, result: fallbackMessage(payload.answer ?? '') })
  } catch {
    return jsonResponse({ error: 'Could not verify.' }, 500)
  }
}
