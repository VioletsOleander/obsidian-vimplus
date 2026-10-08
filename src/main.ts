import * as jc from "jsonc-parser";
import { MarkdownView, Notice, Plugin } from "obsidian";
import * as z from "zod";

import { configSchema } from "./schema";
import { Vim } from "./vim";

import type { Pos } from "@replit/codemirror-vim";
import type { App, HeadingCache } from "obsidian";

import type { Config } from "./schema";

export default class Vimrc extends Plugin {
  #vim!: Vim;
  #config: Config | null = null;

  override async onload() {
    // We need to init in a callback after the global vim object is constructed by obsidian.
    this.app.workspace.onLayoutReady(async () => {
      this.#vim = new Vim();

      await this.#loadConfig();
      this.#applyConfig();

      this.#mapMotions();
    });

    this.addCommand({
      id: "reload-vimrc",
      name: "Reload vimrc",
      callback: async () => {
        this.#revertConfig();

        await this.#loadConfig();
        this.#applyConfig();
      },
    });
    this.addCommand({
      id: "unload-vimrc",
      name: "Unload vimrc",
      callback: async () => {
        this.#revertConfig();
      },
    });
  }

  async #loadConfig() {
    const file = this.app.vault.getFileByPath("vimrc.jsonc");

    if (file === null) {
      new Notice("Failed to find vimrc.jsonc in vault root");
      this.#config = null;

      return;
    }

    const content = await this.app.vault.read(file);
    const result = configSchema.safeParse(jc.parse(content));

    if (!result.success) {
      new Notice("Falied to parse vimrc.jsonc:\n" + z.prettifyError(result.error));
      this.#config = null;

      return;
    }

    this.#config = result.data;
  }

  #applyConfig() {
    if (this.#config === null) {
      return;
    }

    if (this.#config.unmaps !== undefined) {
      for (const unmap of this.#config.unmaps) {
        this.#vim.unmap(unmap);
      }
    }

    if (this.#config.keymaps !== undefined) {
      for (const keymap of this.#config.keymaps) {
        this.#vim.noremap(keymap);
      }
    }
  }

  #revertConfig() {
    // map is revertable but unmap is not revertable
    // well, theoretically unmap is revertable, by remap the default keymap defined in
    // https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim-core/vim.js
    if (this.#config === null || this.#config.keymaps === undefined) {
      return;
    }

    if (this.#config.keymaps !== undefined) {
      for (const keymap of this.#config.keymaps) {
        this.#vim.unmap({ lhs: keymap.lhs, context: keymap.context });
      }
    }
  }

  #mapMotions() {
    this.#vim.api.defineMotion("GotoPreviousHeading", (_cm, _pos, args): Pos | null => {
      const offset = -1 * args.repeat;
      const heading = findHeadingByOffset(this.app, offset);

      if (heading === null) {
        return null;
      }

      return { line: heading.position.start.line, ch: heading.position.start.col };
    });
    this.#vim.api.defineMotion("GotoNextHeading", (_cm, _pos, args): Pos | null => {
      const offset = 1 * args.repeat;
      const heading = findHeadingByOffset(this.app, offset);

      if (heading === null) {
        return null;
      }

      return { line: heading.position.start.line, ch: heading.position.start.col };
    });

    // By default map normal, visual, operator pending mode.
    this.#vim.api.mapCommand("[[", "motion", "GotoPreviousHeading", null, {});
    this.#vim.api.mapCommand("]]", "motion", "GotoNextHeading", null, {});
  }
}

/** Find the nearest previous/next `offset`-ed heading in current file
 *
 * @param app The app instance.
 * @param offset Positive number or negative number, should not be zero.
 */
function findHeadingByOffset(app: App, offset: number): HeadingCache | null {
  if (offset === 0) {
    return null;
  }

  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view === null) {
    return null;
  }

  const file = view.file;
  if (file === null) {
    return null;
  }

  const headings = app.metadataCache.getFileCache(file)?.headings;
  if (headings === undefined || headings.length == 0) {
    return null;
  }

  const cursorLine = view.editor.getCursor().line;

  if (offset < 0) {
    // Find the index of the first heading before current cursor.
    let index = -1;
    for (let i = headings.length - 1; i >= 0; i--) {
      const heading = headings[i];

      if (heading === undefined) {
        console.debug("Expected heading not to be undefined");
        return null;
      }

      if (heading.position.start.line < cursorLine) {
        index = i;
        break;
      }
    }

    // If no heading before current cursor, no jump.
    if (index === -1) {
      return null;
    }

    index = Math.max(0, index + offset + 1);
    return headings[index] ?? null;
  } else {
    // Find the index of the first heading after current cursor.
    let index = headings.length;
    for (const [i, heading] of headings.entries()) {
      if (heading.position.start.line > cursorLine) {
        index = i;
        break;
      }
    }

    // If no heading after current cursor, no jump.
    if (index === headings.length) {
      return null;
    }

    index = Math.min(headings.length - 1, index + offset - 1);
    return headings[index] ?? null;
  }
}
