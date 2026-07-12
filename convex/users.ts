import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
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

    if (existing) return existing;

    const now = Date.now();
    const id = await ctx.db.insert("users", {
      email,
      tone_profile: "balanced, witty, low-drama",
      sessionCount: 0,
      createdAt: now,
      updatedAt: now,
    });

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
      tone_profile: args.tone_profile.trim() || "balanced, witty, low-drama",
      updatedAt: Date.now(),
    });
  },
});
