import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    telegramChatId: v.optional(v.string()),
    paid: v.optional(v.boolean()),
    tone_profile: v.string(),
    tone_profile_memory: v.optional(v.array(v.string())),
    sessionCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_telegram_chat_id", ["telegramChatId"]),

  sessions: defineTable({
    userId: v.id("users"),
    inputText: v.string(),
    detectedLanguage: v.string(),
    replies: v.array(
      v.object({
        tone: v.string(),
        text: v.string(),
      }),
    ),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
