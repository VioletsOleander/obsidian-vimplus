import * as jsonc from "jsonc-parser";
import { MarkdownView, Notice, Plugin } from "obsidian";
import * as z from "zod";

import { Vim } from "./vim";
import { vimrcSchema } from "./vimrc";

import type { Pos } from "@replit/codemirror-vim";
import type { App, HeadingCache, PluginManifest } from "obsidian";

import type { Keymap, Vimrc } from "./vimrc";

// Codemirror default keymaps, used to revert unmap.
// According to https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim-core/vim.js#L2043,
// to make sure unmap for default keymaps work, unmap should has the exact context as the default keymap.
// For example, for <Space>, the unmap must have undefined context.
const defaultKeymaps: Keymap[] = [
  { lhs: "<Space>", rhs: "l" },
];

export default class VimPlus extends Plugin {
  #vim: Vim;
  #vimrc: Vimrc | null;
  #motions: string[] | null;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);

    this.#vim = new Vim();
    this.#vimrc = null;
    this.#motions = null;
  }

  override async onload() {
    // Defer to layout ready to ensure vimrc.jsonc will be founded.
    this.app.workspace.onLayoutReady(async () => {
      await this.#loadVimrc();
      this.#loadMotions();
    });

    this.addCommand({
      id: "reload-vimrc",
      name: "Reload vimrc",
      callback: async () => {
        // Codemirror mantains keymaps in a hidden global array "defaultKeymaps", and defining or removing
        // keymaps is equivalent to inserting and removing items to that array.
        // There is no deduplication mechnism, so define a keymap multiple times will result in many duplicate items in that array.
        this.#unloadVimrc();
        await this.#loadVimrc();
      },
    });

    this.addCommand({
      id: "unload-vimrc",
      name: "Unload vimrc",
      callback: async () => {
        this.#unloadVimrc();
      },
    });
  }

  override onunload() {
    this.#unloadVimrc();
    this.#unloadMotions();
  }

  async #loadVimrc() {
    if (this.#vimrc !== null) {
      return;
    }

    const file = this.app.vault.getFileByPath("vimrc.jsonc");
    if (file === null) {
      new Notice("Failed to find vimrc.jsonc in vault root");
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const result = vimrcSchema.safeParse(jsonc.parse(content));
    if (!result.success) {
      new Notice("Falied to parse vimrc.jsonc:\n" + z.prettifyError(result.error));
      return;
    }

    const vimrc = result.data;

    if (vimrc.unmaps !== undefined) {
      for (const unmap of vimrc.unmaps) {
        this.#vim.unmap(unmap);
      }
    }

    if (vimrc.keymaps !== undefined) {
      for (const keymap of vimrc.keymaps) {
        this.#vim.noremap(keymap);
      }
    }

    this.#vimrc = vimrc;
  }

  #unloadVimrc() {
    if (this.#vimrc === null) {
      return;
    }

    if (this.#vimrc.unmaps !== undefined) {
      for (const unmap of this.#vimrc.unmaps) {
        const keymap = defaultKeymaps.find((keymap) => {
          return keymap.lhs === unmap.lhs;
        });

        if (keymap !== undefined) {
          this.#vim.map(keymap);
        }
      }
    }

    if (this.#vimrc.keymaps !== undefined) {
      for (const keymap of this.#vimrc.keymaps) {
        this.#vim.unmap({ lhs: keymap.lhs, context: keymap.context });
      }
    }

    this.#vimrc = null;
  }

  #loadMotions() {
    if (this.#motions !== null) {
      return;
    }

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

    // By default, map in normal, visual, operator pending mode.
    this.#vim.api.mapCommand("[[", "motion", "GotoPreviousHeading", null, {});
    this.#vim.api.mapCommand("]]", "motion", "GotoNextHeading", null, {});

    this.#motions = ["[[", "]]"];
  }

  #unloadMotions() {
    if (this.#motions === null) {
      return;
    }

    for (const motion of this.#motions) {
      this.#vim.unmap({ lhs: motion });
    }

    this.#motions = null;
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
