import { mutation } from "./_generated/server";
import { v } from "convex/values";

function summarizeMemory(inputText: string, language: string, replies: Array<{ tone: string; text: string }>) {
  const sample = inputText.replace(/\s+/g, " ").trim().slice(0, 180);
  const tones = replies.map((reply) => `${reply.tone}: ${reply.text}`).join(" | ").slice(0, 260);
  return `${language} — ${sample} → ${tones}`;
}

export const record = mutation({
  args: {
    userId: v.id("users"),
    inputText: v.string(),
    detectedLanguage: v.string(),
    replies: v.array(
      v.object({
        tone: v.string(),
        text: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found.");

    const now = Date.now();
    await ctx.db.insert("sessions", {
      userId: args.userId,
      inputText: args.inputText,
      detectedLanguage: args.detectedLanguage,
      replies: args.replies,
      createdAt: now,
    });

    const memory = summarizeMemory(args.inputText, args.detectedLanguage, args.replies);
    const tone_profile_memory = [memory, ...(user.tone_profile_memory ?? [])].slice(0, 3);

    await ctx.db.patch(args.userId, {
      tone_profile_memory,
      sessionCount: user.sessionCount + 1,
      updatedAt: now,
    });

    return user.sessionCount + 1;
  },
});
