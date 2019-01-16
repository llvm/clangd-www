# Getting started

To use clangd, you need:
 - clangd installed
 - a plugin for your editor
 - to tell clangd how your project is built

## Installing clangd

Most distributions include clangd in a `clang-tools` package, or in the full
`llvm` distribution.

- **Debian/Ubuntu:** `sudo apt-get install clang-tools`
- **Mac:** `brew install llvm`
- **Windows:** Download LLVM from [releases.llvm.org](http://releases.llvm.org/download.html)

`clangd --version` should print `clangd version 7.0.0` or later.

## Editor plugins

Language Server plugins are available for many editors, and in principle clangd
should work with any of them, though feature set and interface may vary.

Here are some plugins we know work well with clangd.

- **Vim**
  - [LanguageClient-neovim](https://github.com/autozimu/LanguageClient-neovim)
    has [instructions for using clangd](https://github.com/autozimu/LanguageClient-neovim/wiki/Clangd).
  - we're working on making clangd work with YouCompleteMe: [Valloric/ycmd/issues/1114](https://github.com/Valloric/ycmd/issues/1114)
- **Emacs**:
  - [lsp-mode](https://github.com/emacs-lsp/lsp-mode) with [lsp-clangd](https://github.com/emacs-lsp/lsp-clangd)
  - [eglot](https://github.com/joaotavora/eglot) can be configured to work with clangd
- **VSCode**: [vscode-clangd](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd) can be installed from within VSCode.
- **Sublime Text**: [tomv564/LSP](https://github.com/tomv564/LSP) works with clangd out of the box

If you don't have strong feelings about an editor, we suggest you try out
[VSCode](https://code.visualstudio.com/), it has excellent language server
support and most faithfully demonstrates what clangd can do.

## Project setup

To understand your source code, clangd needs to know your build flags.
(This is just a fact of life in C++, source files are not self-contained).

By default, clangd will assume your code is built as `clangd some_file.cc`,
and you'll probably get spurious errors about missing `#include`d files, etc.
There are a couple of ways to fix this.

### `compile_commands.json`

This file provides compile commands for every source file in a project.
Clangd will look in the parent directories of the files you edit looking for it.

If you have a `CMake`-based project, CMake can generate this file. You should
enable it with:

```cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=1```

`compile_commands.json` will be written to your build directory, you should
symlink it (or simply copy it) to the root of your source tree.

Other tools can also generate this file. See [the compile_commands.json
specification](https://clang.llvm.org/docs/JSONCompilationDatabase.html).

### `compile_flags.txt`

If all files in a project use the same build flags, you can put those
flags one-per-line in `compile_flags.txt` in your source root.

Clangd will assume the compile command is `clang $FLAGS some_file.cc`.
