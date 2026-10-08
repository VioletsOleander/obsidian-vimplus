import * as z from "zod";

export const keymapSchema = z.object(
  {
    lhs: z.string(),
    rhs: z.string(),
    context: z.optional(z.union([z.literal("normal"), z.literal("visual"), z.literal("insert")])),
  },
);

export const unmapSchema = z.object({
  lhs: z.string(),
  context: z.optional(z.union([z.literal("normal"), z.literal("visual"), z.literal("insert")])),
});

export const configSchema = z.object(
  {
    keymaps: z.optional(z.array(keymapSchema)),
    unmaps: z.optional(z.array(unmapSchema)),
  },
);

export type Keymap = z.infer<typeof keymapSchema>;
export type Unmap = z.infer<typeof unmapSchema>;
export type Config = z.infer<typeof configSchema>;
