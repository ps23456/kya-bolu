import { mutation } from "./_generated/server";
import { v } from "convex/values";

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

    await ctx.db.patch(args.userId, {
      sessionCount: user.sessionCount + 1,
      updatedAt: now,
    });

    return user.sessionCount + 1;
  },
});
