import { Notice, Plugin } from "obsidian";
import * as z from "zod";

import { configSchema } from "./schema";

import type { Vim } from "@replit/codemirror-vim";
import type { App, PluginManifest } from "obsidian";
import type { Config } from "./schema";

// Vim API reference: https://codemirror.net/5/doc/manual.html#vimapi
// codemirror-vim keeps its API as in codemirror 5, and works with codemirror-6.
export default class Vimrc extends Plugin {
  config: Config | null;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.config = null;
  }

  override async onload() {
    this.app.workspace.onLayoutReady(async () => {
      // We need to init in a callback after the global vim object is constructed by obsidian.
      await this.loadConfig();
      this.applyConfig();
    });

    this.addCommand({
      id: "reload-vimrc",
      name: "Reload vimrc",
      callback: async () => {
        this.revertConfig();

        await this.loadConfig();
        this.applyConfig();
      },
    });

    this.addCommand({
      id: "unload-vimrc",
      name: "Unload vimrc",
      callback: async () => {
        this.revertConfig();
      },
    });
  }

  private async loadConfig() {
    const file = this.app.vault.getFileByPath("vimrc.json");

    if (file === null) {
      const message = "Failed to find vimrc.json in vault root";

      console.log(message);
      new Notice(message);

      this.config = null;
      return;
    }

    const content = await this.app.vault.read(file);
    const result = configSchema.safeParse(JSON.parse(content));

    if (!result.success) {
      const message = "Falied to parse vimrc.json:\n" + z.prettifyError(result.error);

      console.log(message);
      new Notice(message);

      this.config = null;
      return;
    }

    this.config = result.data;
  }

  private applyConfig() {
    if (this.config === null) {
      console.log("Skip applying config because config is null");
      return;
    }

    // Directly using Vim object from codemirror-vim will not work, and I don't konw why.
    // We have to access the global to access the obsidian registered Vim object.
    // This is undocumented, so stability is not guaranteed.

    // @ts-expect-error, no type
    const vim = window.CodeMirrorAdapter.Vim as Vim;

    for (const keymap of this.config.keymaps) {
      vim.noremap(keymap.lhs, keymap.rhs, keymap.context);
    }

    console.log("Successfully applied config");
  }

  private revertConfig() {
    if (this.config === null) {
      console.log("Skip reverting config because config is null");
      return;
    }

    // @ts-expect-error, no type
    const vim = window.CodeMirrorAdapter.Vim as Vim;

    for (const keymap of this.config.keymaps) {
      vim.unmap(keymap.lhs, keymap.context);
    }

    console.log("Successfully reverted config");
  }
}
