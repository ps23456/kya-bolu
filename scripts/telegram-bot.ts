import 'dotenv/config'

import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'

interface ReplyOption {
  tone: string
  text: string
}

interface ReplyResponse {
  language: string
  situation_read: string
  replies: ReplyOption[]
}

const token = process.env.TELEGRAM_BOT_TOKEN
const replyEndpoint = process.env.BOT_REPLY_ENDPOINT ?? 'https://kya-bolu.pages.dev/api/reply'
const convexUrl = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL

if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.')
if (!convexUrl) throw new Error('CONVEX_URL or VITE_CONVEX_URL is not set.')

const bot = new Telegraf(token)
const convex = new ConvexHttpClient(convexUrl)
const FREE_SESSION_LIMIT = 3
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const getByTelegramChatId = makeFunctionReference<'query'>('users:getByTelegramChatId')
const getOrCreateTelegram = makeFunctionReference<'mutation'>('users:getOrCreateTelegram')
const recordSession = makeFunctionReference<'mutation'>('sessions:record')

const chatIdOf = (ctx: { chat?: { id: number | string } }) => String(ctx.chat?.id ?? '')

function formatReplies(result: ReplyResponse) {
  const [polite, savage, escape] = result.replies
  return [
    `🟢 POLITE\n${polite?.text ?? 'No polite reply generated.'}`,
    `🔥 SAVAGE\n${savage?.text ?? 'No savage reply generated.'}`,
    `🔵 ESCAPE\n${escape?.text ?? 'No escape reply generated.'}`,
  ].join('\n\n')
}

async function userForChat(chatId: string) {
  return await convex.query(getByTelegramChatId, { telegramChatId: chatId })
}

async function ensureEmail(ctx: Context) {
  const user = await userForChat(chatIdOf(ctx))
  if (user) return user

  await ctx.reply('Welcome to Kya Bolu? 💬\nSend your email first, then forward a chat message or screenshot here.')
  return null
}

async function saveEmail(ctx: Context, email: string) {
  const user = await convex.mutation(getOrCreateTelegram, {
    email,
    telegramChatId: chatIdOf(ctx),
  })
  await ctx.reply(`Saved ${user?.email ?? email}. Now send or forward a message/screenshot and I’ll draft POLITE / SAVAGE / ESCAPE replies.`)
}

async function screenshotFormData(ctx: Context) {
  const message = ctx.message as { photo?: Array<{ file_id: string }>; caption?: string } | undefined
  const photo = message?.photo?.at(-1)
  if (!photo) return null

  const link = await ctx.telegram.getFileLink(photo.file_id)
  const response = await fetch(link)
  if (!response.ok) throw new Error('Could not download Telegram screenshot.')

  const blob = await response.blob()
  const form = new FormData()
  form.append('image', blob, 'telegram-screenshot.jpg')
  if (message?.caption?.trim()) form.append('text', message.caption.trim())
  return form
}

async function textFormData(text: string) {
  const form = new FormData()
  form.append('text', text)
  return form
}

async function callReplyEndpoint(form: FormData) {
  const response = await fetch(replyEndpoint, { method: 'POST', body: form })
  const payload = (await response.json()) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'Kya Bolu API failed.')
  return payload as ReplyResponse
}

bot.start(async (ctx) => {
  await ctx.reply('Kya Bolu? is ready 💬\nSend your email to start. After that, forward a text message or screenshot.')
})

bot.on('message', async (ctx) => {
  try {
    const chatId = chatIdOf(ctx)
    const message = ctx.message as { text?: string; caption?: string; photo?: Array<{ file_id: string }> }
    const text = message.text?.trim() ?? message.caption?.trim() ?? ''

    const user = await userForChat(chatId)
    if (!user && emailPattern.test(text)) {
      await saveEmail(ctx, text)
      return
    }

    const readyUser = user ?? (await ensureEmail(ctx))
    if (!readyUser) return

    if (readyUser.sessionCount >= FREE_SESSION_LIMIT) {
      await ctx.reply('🚧 UPGRADE\nYou’ve used your 3 free Kya Bolu? sessions. Unlimited replies are coming soon.')
      return
    }

    const form = message.photo?.length ? await screenshotFormData(ctx) : text ? await textFormData(text) : null
    if (!form) {
      await ctx.reply('Send or forward a chat message, or upload a screenshot.')
      return
    }

    await ctx.reply('Reading the vibe...')
    const result = await callReplyEndpoint(form)
    await convex.mutation(recordSession, {
      userId: readyUser._id,
      inputText: text || '[telegram screenshot]',
      detectedLanguage: result.language,
      replies: result.replies,
    })

    await ctx.reply(`${result.situation_read}\n\n${formatReplies(result)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    await ctx.reply(`Could not cook replies: ${message}`)
  }
})

await bot.telegram.deleteWebhook()
const me = await bot.telegram.getMe()
console.log(`Kya Bolu Telegram bot running as @${me.username}`)
await bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
