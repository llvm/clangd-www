# Frequently Asked Questions (FAQ)

## How do I install clangd?

Clangd is often distributed either within LLVM packages or in a separate
Clang-related packages (e.g.
[clang-tools](https://packages.ubuntu.com/search?keywords=clang-tools) on
Ubuntu). These packages (mostly) follow official LLVM releases, which are
released once every 6 months.

If you want to use new versions of clangd, you have several options:

- Download the binaries from our GitHub repository:
  - [Stable track](https://github.com/clangd/clangd/releases/latest) - follows
    the same release cycle as official LLVM releases and most distributions
  - [Weekly builds](https://github.com/clangd/clangd/releases) - not tested as
    thoroughly as official releases
- [Compile from sources](#how-do-i-build-clangd-from-sources).

## How do I check the clangd version I am using?

- Check the logs: clangd prints version on the first line. See your LSP client
  documentation on where to find them: e.g. VSCode has logs in the output panel,
  coc-clangd gives you the logs via `:CocCommand` into `workspace.showOutput`
- Run `clangd --version`. Note: the binary in your `$PATH` might not be the one
  used within the editor, checking logs is preferred.

## Can you give an example configuration file for clangd?

The [preferred way](https://clangd.llvm.org/config) to store clangd
configuration is through YAML files. Here's an example config you could use:

```yaml
CompileFlags:
  # Treat code as C++, use C++17 standard, enable more warnings.
  Add: [-xc++, -std=c++17, -Wall, -Wno-missing-prototypes]
  # Remove extra warnings specified in compile commands.
  # Single value is also acceptable, same as "Remove: [-mabi]"
  Remove: -mabi
Diagnostics:
  # Tweak Clang-Tidy checks.
  ClangTidy:
    Add: [performance*, modernize*, readability*]
    Remove: [modernize-use-trailing-return-type]
    CheckOptions:
      readability-identifier-naming.VariableCase: CamelCase
---
# Use Remote Index Service for LLVM.
If:
  # Note: This is a regexp, notice '.*' at the end of PathMatch string.
  PathMatch: /path/to/llvm/.*
Index:
  External:
    Server: clangd-index.llvm.org:5900
    MountPoint: /path/to/llvm/
```

## How do I build clangd from sources?

If you are a developer or downloading pre-built binaries is not an option, you
can [compile
clangd](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/README.md#building-and-testing-clangd)
from [LLVM
sources](https://github.com/llvm/llvm-project/tree/main/clang-tools-extra/clangd).
Follow [Getting
Started](https://llvm.org/docs/GettingStarted.html#getting-the-source-code-and-building-llvm)
instructions and make sure `LLVM_ENABLE_PROJECTS` has `clang;clang-tools-extra`
(e.g. `DLLVM_ENABLE_PROJECTS="clang;clang-tools-extra"`).

## How do I stop clangd from indexing certain folders?

```yaml
If:
  # Note: This is a regexp, notice '.*' at the end of PathMatch string.
  PathMatch: /my/project/large/dir/.*
Index:
  # Disable slow background indexing of these files.
  Background: Skip
```

## How do I make additional headers visible to clangd?

If you have some headers outside of the visibility of clangd, you can either
include individual headers (`-include=/headers/file.h`) or add
directories to the include path (`-I=/other/headers`). The easiest way to do
that is through configuration file:

```yaml
CompileFlags:
  Add: [-include=/headers/file.h, -I=/other/headers]
```

## Why does clangd not return all references for a symbol?

One of the potential reasons is that clangd has not indexed all the files in
your project. Please make sure all files are visible to clangd through the
project setup and `compile_commands.json`.

If you are sure all files are indexed and can be accessed: clangd limits the
number of returned results to prevent UI freezes by default.  If you have more
than a 1000 symbols and you would like to get through all of them, please pass
`--limit-references=0` to clangd invocation.

The same applies to the Remote Index Service but we are not respecting
`--limit-references=0` on the server side to prevent DDoS attacks.
