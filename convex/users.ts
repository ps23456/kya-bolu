import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const defaultToneProfile = "balanced, witty, low-drama";
const adminEmails = new Set(["priyanshishah106@gmail.com"]);

function newUser(now: number, email: string, telegramChatId?: string) {
  return {
    email,
    telegramChatId,
    paid: adminEmails.has(email),
    tone_profile: defaultToneProfile,
    tone_profile_memory: [],
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique();
  },
});

export const getByTelegramChatId = query({
  args: { telegramChatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegram_chat_id", (q) => q.eq("telegramChatId", args.telegramChatId))
      .unique();
  },
});

export const getOrCreate = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      if (adminEmails.has(email) && existing.paid !== true) {
        await ctx.db.patch(existing._id, { paid: true, updatedAt: Date.now() });
        return await ctx.db.get(existing._id);
      }
      return existing;
    }

    const id = await ctx.db.insert("users", newUser(Date.now(), email));
    return await ctx.db.get(id);
  },
});

export const getOrCreateTelegram = mutation({
  args: {
    email: v.string(),
    telegramChatId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        paid: adminEmails.has(email) ? true : existing.paid,
        telegramChatId: args.telegramChatId,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("users", newUser(now, email, args.telegramChatId));
    return await ctx.db.get(id);
  },
});

export const updateToneProfile = mutation({
  args: {
    email: v.string(),
    tone_profile: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique();

    if (!user) throw new Error("User not found.");

    await ctx.db.patch(user._id, {
      tone_profile: args.tone_profile.trim() || defaultToneProfile,
      updatedAt: Date.now(),
    });
  },
});
