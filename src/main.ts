import * as jc from "jsonc-parser";
import { MarkdownView, Notice, Plugin } from "obsidian";
import * as z from "zod";

import { configSchema } from "./schema";

import type { Pos, Vim } from "@replit/codemirror-vim";
import type { App, HeadingCache } from "obsidian";
import type { Config } from "./schema";

// Vim API reference: https://codemirror.net/5/doc/manual.html#vimapi
// codemirror-vim keeps its API as same in codemirror 5, and works both under codemirror 5 and 6.
export default class Vimrc extends Plugin {
  #config: Config | null = null;

  override async onload() {
    // We need to init in a callback after the global vim object is constructed by obsidian.
    this.app.workspace.onLayoutReady(async () => {
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
      const message = "Failed to find vimrc.jsonc in vault root";

      console.debug(message);
      new Notice(message);

      this.#config = null;

      return;
    }

    const content = await this.app.vault.read(file);
    const result = configSchema.safeParse(jc.parse(content));

    if (!result.success) {
      const message = "Falied to parse vimrc.jsonc:\n" + z.prettifyError(result.error);

      console.debug(message);
      new Notice(message);

      this.#config = null;

      return;
    }

    this.#config = result.data;
  }

  #applyConfig() {
    if (this.#config === null) {
      console.debug("Skip applying config because config is null");
      return;
    }

    const vim = getVimInstance();
    for (const keymap of this.#config.keymaps) {
      vim.noremap(keymap.lhs, keymap.rhs, keymap.context);
    }

    console.debug("Successfully applied config");
  }

  #revertConfig() {
    if (this.#config === null) {
      console.debug("Skip reverting config because config is null");
      return;
    }

    const vim = getVimInstance();
    for (const keymap of this.#config.keymaps) {
      vim.unmap(keymap.lhs, keymap.context);
    }

    console.debug("Successfully reverted config");
  }

  #mapMotions() {
    const vim = getVimInstance();

    vim.defineMotion("GotoPreviousHeading", (_cm, _pos, args): Pos | null => {
      const offset = -1 * args.repeat;
      const heading = findHeadingByOffset(this.app, offset);

      if (heading === null) {
        return null;
      }

      return { line: heading.position.start.line, ch: heading.position.start.col };
    });
    vim.defineMotion("GotoNextHeading", (_cm, _pos, args): Pos | null => {
      const offset = 1 * args.repeat;
      const heading = findHeadingByOffset(this.app, offset);

      if (heading === null) {
        return null;
      }

      return { line: heading.position.start.line, ch: heading.position.start.col };
    });

    vim.mapCommand("[[", "motion", "GotoPreviousHeading", null, { context: "normal" });
    vim.mapCommand("[[", "motion", "GotoPreviousHeading", null, { context: "visual" });
    vim.mapCommand("]]", "motion", "GotoNextHeading", null, { context: "normal" });
    vim.mapCommand("]]", "motion", "GotoNextHeading", null, { context: "visual" });

    console.debug("Successfully mapped motions");
  }
}

/** Return the global Vim object. */
function getVimInstance(): Vim {
  // Directly using Vim object from codemirror-vim will not work, and I don't konw why.
  // We have to access the global to access the obsidian registered Vim object.
  // This is undocumented, so stability is not guaranteed.

  // Notice that we must use window.CodeMirrorAdapter to acquire the codemirror instance, instead of
  // window.CodeMiorror, otherwise the method invocations will just not work.

  // @ts-ignore
  return window.CodeMirrorAdapter.Vim;
}

/** Find the nearest previous/next `offset`-ed heading in current file
 *
 * @param app The app instance.
 * @param offset Positive number or negative number, should not be zero.
 */
function findHeadingByOffset(app: App, offset: number): HeadingCache | null {
  if (offset === 0) {
    console.debug("Expecte offset not to be zero");
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
