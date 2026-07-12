import 'dotenv/config'

import express from 'express'
import multer from 'multer'
import OpenAI from 'openai'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 5173)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

interface ReplyCard {
  tone: string
  text: string
}

interface ReplyPayload {
  language: string
  situation_read: string
  replies: ReplyCard[]
}

const replySchema = {
  name: 'kya_bolu_reply_options',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['language', 'situation_read', 'replies'],
    properties: {
      language: {
        type: 'string',
        description: 'Detected language or code-mix, such as English, Hindi, Hinglish, Spanish.',
      },
      situation_read: {
        type: 'string',
        description: 'Brief read of the conversation dynamics and what the user should respond to.',
      },
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

function extractJson(content: string): ReplyPayload {
  try {
    return JSON.parse(content) as ReplyPayload
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]) as ReplyPayload
    }
    throw new Error('OpenAI returned a non-JSON response.')
  }
}

function validateReplyPayload(payload: ReplyPayload): ReplyPayload {
  if (
    !payload ||
    typeof payload.language !== 'string' ||
    typeof payload.situation_read !== 'string' ||
    !Array.isArray(payload.replies) ||
    payload.replies.length !== 3 ||
    payload.replies.some((reply) => typeof reply?.tone !== 'string' || typeof reply?.text !== 'string')
  ) {
    throw new Error('OpenAI response did not match the expected reply shape.')
  }

  return payload
}

const app = express()
app.use(express.json({ limit: '10mb' }))

app.post('/api/reply', upload.single('image'), async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    const image = req.file

    if (!text && !image) {
      return res.status(400).json({ error: 'Upload a screenshot or paste conversation text first.' })
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' })
    }

    const systemPrompt = await readFile(resolve(root, 'prompts/tone-engine.md'), 'utf8')
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          text ||
          'Read this chat screenshot. Infer the context, language, and best reply options from the visible conversation.',
      },
    ]

    if (image) {
      const dataUrl = `data:${image.mimetype};base64,${image.buffer.toString('base64')}`
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      })
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent as never },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: replySchema,
      },
      temperature: 0.8,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned an empty response.')
    }

    return res.json(validateReplyPayload(extractJson(content)))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    console.error('/api/reply failed:', error)
    return res.status(500).json({ error: message })
  }
})

if (!isProduction) {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
} else {
  const distPath = resolve(root, 'dist')
  app.use(express.static(distPath))
  app.use((_req, res) => {
    res.sendFile(resolve(distPath, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Kya Bolu? running at http://localhost:${port}`)
})
