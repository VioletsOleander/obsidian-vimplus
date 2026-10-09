import type { Vim as CodeMirrorVimAPI } from "@replit/codemirror-vim";

import type { Keymap, Unmap } from "./vimrc";

// Vim API reference: https://codemirror.net/5/doc/manual.html#vimapi
// codemirror-vim keeps its API as same in codemirror 5, and works both under codemirror 5 and 6.

export class Vim {
  api: CodeMirrorVimAPI;

  constructor() {
    // Directly using Vim object from codemirror-vim will not work, and I don't konw why.
    // We have to access the global to access the obsidian registered Vim object.
    // This is undocumented, so stability is not guaranteed.

    // Notice that we must use window.CodeMirrorAdapter to acquire the codemirror instance, instead of
    // window.CodeMiorror, otherwise the method invocations will just not work.

    // @ts-ignore
    this.api = window.CodeMirrorAdapter.Vim;
  }

  map(keymap: Keymap) {
    // @ts-ignore
    this.api.map(keymap.lhs, keymap.rhs, keymap.context);
  }

  noremap(keymap: Keymap) {
    // Passing undefined context is actually allowed, see:
    // https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim-core/vim.js#L4138
    // According to docs, passing undefined context is equivalent to map in normal, visual, operator
    // pending mode.

    // @ts-ignore
    this.api.noremap(keymap.lhs, keymap.rhs, keymap.context);
  }

  unmap(unmap: Unmap) {
    // @ts-ignore
    this.api.unmap(unmap.lhs, unmap.context);
  }
}
