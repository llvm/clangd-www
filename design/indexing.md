# The clangd index

The index stores information about the whole codebase. It's used to provide LSP
features where the AST af the current file doesn't have the information we need.

## Exposed data

- `Symbol`s are the primary objects managed by the index. A function, variable,
  class, or macro is a Symbol, and each one has an opaque `SymbolID`.
  Two declarations of the same thing will produce the same `SymbolID` and thus
  be merged into one `Symbol`.

  Symbols have names, declaration/definition locations, documentation, and a
  bunch of attributes used for code completion.

  They can be looked up by ID, or fuzzy-searched by name.

- `Ref`s are uses of a symbol in code, such as a call to a function.
  They are edges between a `Symbol` and a location in some file.

  They can be looked up by SymbolID.

- `Relation`s describe related symbols, such as a class that inherits another.
  They are edges between two `Symbol`s, labeled with a relation kind.

  They are looked up using one of the `Symbols` and the kind.

## Implementations

`SymbolIndex` is an interface, and clangd maintains several instances.
These are stitched together using `MergedIndex`, which layers one index on top
of another. Code implementing features sees only a single combined index.

### `FileIndex` ("dynamic index")

This is the top layer, and includes symbols from the files that have been opened
and the headers they include. This is used:

- to provide code completions for symbols at global scope in header files.
  (This is more efficient than deserializing big parts of the preamble).
- to ensure cross-references for the files you're working on are available, even
  if the background index hasn't finished yet
- to ensure locations of definitions/references aren't stale despite actively
  editing the file

The `FileIndex` class stores data from each file separately. When a file is
parsed, the TUScheduler invokes a callback which adds the AST to the index.
(In fact, there is a separate storage and callback for expensive-and-rare
preamble rebuilds vs cheap-and-frequent main-file rebuilds).

### `BackgroundIndex`

As the name suggests, this parses all files in the project in the background
to build a complete index. This is used:

- to ensure full coverage of the codebase
- to capture references inside template instantiations, which are disabled
  elsewhere in clangd for performance reasons

The `BackgroundIndex` maintains a thread-pool, and when a compilation database
is found, the compile command for each source file is placed on a queue.

Before indexing each file, the index checks for a cached `*.idx` file on disk.
After indexing, it writes this file. This avoids reindexing on startup if
nothing changed since last time.
These files are located in `.clangd/index/` next to `compile_commands.json`,
or in `~/.clangd/index` for headers with no CDB, such as the standard library.

### Static index

The (optional) static index is built outside clangd. It would typically cover
the whole codebase. This is used:

- to avoid waiting for the background index to build
- to allow the background index to be disabled for large projects, saving
  CPU/RAM/battery

With the `-index-file` option, clangd will load an index produced by the
`clangd-indexer` tool.
In future, we hope to support a remote RPC-based static index which can be
shared between developers on large projects.
