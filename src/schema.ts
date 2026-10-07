import * as z from "zod";

export const keymapSchema = z.object(
  {
    lhs: z.string(),
    rhs: z.string(),
    context: z.union([z.literal("normal"), z.literal("visual"), z.literal("insert")]),
  },
);

export const configSchema = z.object(
  {
    keymaps: z.array(keymapSchema),
  },
);

export type Keymap = z.infer<typeof keymapSchema>;
export type Config = z.infer<typeof configSchema>;
