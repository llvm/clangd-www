# Getting started

To use clangd, you need:
 - clangd installed
 - a plugin for your editor
 - to tell clangd how your project is built

## Installing clangd

You'll want a **recent** version of clangd: 7.0 was the first really usable
release, and 8.0 is much better.

After installing, `clangd --version` should print `clangd version 7.0.0` or later.

<details>
<summary markdown="span">Mac OS X</summary>
Clangd can be installed (along with LLVM) via [Homebrew](https://brew.sh):
```
brew install llvm
```

If you don't want to use homebrew, you can download the a binary release of
LLVM from [releases.llvm.org](http://releases.llvm.org/download.html).
Alongside `bin/clangd` you will need at least `lib/clang/*/include`:
```
cp clang+llvm-7.0.0/bin/clangd /usr/local/bin/clangd
cp -r clang+llvm-7.0.0/lib/clang/ /usr/loca/lib/
```
</details>

<details>
<summary markdown="span">Windows</summary>
Download the LLVM installer from [releases.llvm.org](http://releases.llvm.org/download.html)
</details>

<details>
<summary markdown="span">Debian/Ubuntu</summary>
Installing the `clang-tools` package will usually give you an old version.

Try to install the latest release (8.0):
```
sudo apt-get install clang-tools-8
```
If that's not found, at least `clang-tools-7` should be available.

This will install clangd as `/usr/bin/clangd-8`. Make it default:
```
sudo update-alternatives --install /usr/bin/clangd clangd /usr/bin/clangd-8 100
```
</details>

<details>
<summary markdown="span">Other systems</summary>
Most distributions include clangd in a `clang-tools` package, or in the full
`llvm` distribution.

For some platforms, binaries are also avaliable at [releases.llvm.org](http://releases.llvm.org/download.html)
</details>

## Editor plugins

Language Server plugins are available for many editors. In principle clangd
should work with any of them, though feature set and interface may vary.

Here are some plugins we know work well with clangd:

<details>
<summary markdown="span">Vim</summary>
[YouCompleteMe](https://valloric.github.io/YouCompleteMe/) can be installed with
clangd support. **This is not on by default**, you must install it with
`install.py --clangd-completer`.

We recommend letting clangd fully control code completion. In `.vimrc` add:
```
let g:ycm_clangd_uses_ycmd_caching = 0
```

You should see errors highlighted and completions as you type.

![Code completion in YouCompleteMe](ycm_completion.png)

YouCompleteMe supports many of clangd's features:

 - code completion
 - diagnostics and fixes (`:YcmCompleter FixIt`)
 - find declarations, references, and definitions (`:YcmCompleter GoTo` etc)
 - rename symbol (`:YcmCompleter RefactorRename`)

### Under the hood

- **Debug logs**: run `:YcmDebugInfo` to see clangd status, and `:YcmToggleLogs`
  to view clangd's debug logs.
- **Command-line flags**: Set `g:ycm_clangd_args` in `.vimrc`, e.g.:
```
let g:ycm_clangd_args = ['-log=verbose', '-pretty']
```
- **Alternate clangd binary**: set `g:ycm_clangd_binary_path` in `.vimrc`.

---

[LanguageClient-neovim](https://github.com/autozimu/LanguageClient-neovim)
also has [instructions for using clangd](https://github.com/autozimu/LanguageClient-neovim/wiki/Clangd),
and **may** be easier to install.
</details>

<details>
<summary markdown="span">Emacs</summary>
[lsp-mode](https://github.com/emacs-lsp/lsp-mode) supports clangd. You'll
probably want to install `flycheck`, `lsp-ui`, and `company-mode`.

[eglot](https://github.com/joaotavora/eglot) can be configured to work with clangd.
</details>

<details>
<summary markdown="span">Visual Studio Code</summary>
The official plugin is 
[vscode-clangd](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd)
and can be installed from within VSCode.

Choose **View** --> **Extensions**, then search for "clangd".

After restarting, you should see red underlines underneath errors, and
you should get rich code completions including e.g. function parameters.

![Code completion in VSCode](basic_completion.png)

vscode-clangd has excellent support for all clangd features, including:
 - code completion
 - diagnostics and fixes
 - find declarations, references, and definitions
 - find symbol in file (`Ctrl-P @foo`) or workspace (`Ctrl-P #foo`)
 - code actions

### Under the hood

- **Debug logs**: when clangd is running, you should see "Clang Language Server"
  in the dropdown of the Output panel (**View** -> **Output**).
- **Command-line flags**: these can be passed in the `clangd.arguments` array
  in your `settings.json`. (**File** -> **Preferences** -> **Settings**).
- **Alternate clangd binary**: set the `clangd.path` string in `settings.json`.
</details>

<details>
<summary markdown="span">Sublime Text</summary>
[tomv564/LSP](https://github.com/tomv564/LSP) works with clangd out of the box.
</details>

If you don't have strong feelings about an editor, we suggest you try out
[VSCode](https://code.visualstudio.com/), it has excellent language server
support and most faithfully demonstrates what clangd can do.

## Project setup

To understand your source code, clangd needs to know your build flags.
(This is just a fact of life in C++, source files are not self-contained).

By default, clangd will assume your code is built as `clang some_file.cc`,
and you'll probably get spurious errors about missing `#include`d files, etc.
There are a couple of ways to fix this.

### `compile_commands.json`

This file provides compile commands for every source file in a project.
It is usually generated by tools.
Clangd will look in the parent directories of the files you edit looking for it.

<details>
<summary markdown="span">CMake-based projects</summary>
If your project builds with CMake, it can generate this file. You should enable
it with:

```cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=1```

`compile_commands.json` will be written to your build directory.
You should symlink it (or simply copy it) to the root of your source tree, if
they are different.

```ln -s ~/myproject/compile_commands.json ~/myproject-build/```
</details>

<details>
<summary markdown="span">Other build systems, using Bear</summary>
[Bear](https://github.com/rizsotto/Bear) is a tool to generate a
compile_commands.json file by recording a complete build.

For a `make`-based build, you can run `make clean; bear make` to generate the
file (and run a clean build!).
</details>

Other tools can also generate this file. See [the compile_commands.json
specification](https://clang.llvm.org/docs/JSONCompilationDatabase.html).

### `compile_flags.txt`

If all files in a project use the same build flags, you can put those
flags one-per-line in `compile_flags.txt` in your source root.

Clangd will assume the compile command is `clang $FLAGS some_file.cc`.

Creating this file by hand is a reasonable place to start if your project is
quite simple.
