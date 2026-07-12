const voiceId = 'pNInz6obpgDQGcFmaJgB'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function onRequestPost({ request, env }: { request: Request; env: { ELEVENLABS_API_KEY?: string } }) {
  try {
    if (!env.ELEVENLABS_API_KEY) {
      return jsonResponse({ error: 'ELEVENLABS_API_KEY is not set on the server.' }, 500)
    }

    const body = (await request.json()) as { text?: string }
    const text = body.text?.trim()

    if (!text) {
      return jsonResponse({ error: 'Text is required.' }, 400)
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.36,
          similarity_boost: 0.82,
          style: 0.72,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      return jsonResponse({ error: 'Could not load audio.' }, 500)
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return jsonResponse({ error: 'Could not load audio.' }, 500)
  }
}
