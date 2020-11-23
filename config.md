# Configuration

The configuration mechanism is new in clangd 11, and more options will be
exposed in this way in future.
{:.v11}

## Files

Configuration is stored in YAML files. These are either:

- **project configuration**: a file named `.clangd` in the source tree.
  (clangd searches in all parent directories of the active file).

  Generally this should be used for shared and checked-in settings.

- **user configuration**: a `config.yaml` file in an OS-specific directory:

  - *Windows*: `%LocalAppData%\clangd\config.yaml`, typically
    `C:\Users\Bob\AppData\Local\clangd\config.yaml`.

  - *macOS*: `~/Library/Preferences/clangd/config.yaml`

  - *Linux and others*: `$XDG_CONFIG_HOME/clangd/config.yaml`, typically
    `~/.config/clangd/config.yaml`.

  Private settings go here, and can be scoped to projects using `If` conditions.

Each file can contain multiple fragments separated by `---` lines. (This is
only useful if the fragments have different `If` conditions).

JSON is a subset of YAML, so you can use that syntax if you prefer.

Changes should take effect immediately as you continue to edit code. For now,
config file errors are reported only in the clangd logs.

## Loading and combining fragments

By default, user configuration applies to all files that are opened.
Project configuration applies to files under its tree (`proj/.clangd` configures
`proj/**`).

`If` conditions can further limit this, e.g. to configure only header files.

Configuration is combined when this is sensible. In case of conflicts, user
config has the highest precedence, then inner project, then outer project.

# Schema

At the top-level, a fragment is a key-value mapping that divides the document
into "blocks" of related options, each of which is a key-value mapping.

In most places where an array of scalar values can be specified, a single value
is also acceptable. e.g. `Add: -Wall` is equivalent to `Add: [-Wall]`.

## If

Conditions in the `If` block restrict when a fragment applies.

```
If:                               # Apply this config conditionally
  PathMatch: .*\.h                # to all headers...
  PathExclude: include/llvm-c/.*  # except those under include/llvm-c/
```

Each separate condition must match (combined with AND).
When one condition has multiple values, any may match (combined with OR).
e.g. `PathMatch: [foo/.*, bar/.*]` matches files in either directory.

Conditions based on a file's path use the following form:

- if the fragment came from a project directory, the path is relative
- if the fragment is global (e.g. user config), the path is absolute
- paths always use forward-slashes (UNIX-style)

If no file is being processed, these conditions will not match.

### PathMatch

The file being processed must fully match a regular expression.

### PathExclude

The file being processed must *not* fully match a regular expression.

## CompileFlags

Affects how a source file is parsed.

```
CompileFlags:                     # Tweak the parse settings
  Add: [-xc++ -Wall]              # treat all files as C++, enable more warnings
  Remove: -W*                     # strip all other warning-related flags
```

clangd emulates how clang would interpret a file.
By default, it behaves roughly as `clang $FILENAME`, but real projects usually
require setting the include path (with the `-I` flag), defining preprocessor
symbols, configuring warnings etc.

Often, a compilation database specifies these compile commands. clangd
searches for `compile_commands.json` in parents of the source file.

This section modifies how the compile command is constructed.

### Add

List of flags to append to the compile command.

### Remove

List of flags to remove from the compile command.

- If the value is a recognized clang flag (like `-I`) then it will be
  removed along with any arguments. Synonyms like `--include-dir=` will
  also be removed.
- Otherwise, if the value ends in `*` (like `-DFOO=*`) then any argument
  with the prefix will be removed.
- Otherwise any argument exactly matching the value is removed.

In all cases, `-Xclang` is also removed where needed.

Example:
- Command: `clang++ --include-directory=/usr/include -DFOO=42 foo.cc`
- Configuration: `Remove: [-I, -DFOO=*]`
- Result: `clang++ foo.cc`

Flags added by the same CompileFlags entry will not be removed.

## Index

Controls how clangd understands code outside the current file.

```
Index:
  Background: Skip     # Disable slow background indexing of these files.
```

clangd's indexes provide information about symbols that isn't available to
clang's parser, such as incoming references.

### Background

Whether files are built in the background to produce a project index.
This is checked for translation units only, not headers they include.
Legal values are `Build` (the default) or `Skip`.

### External

Used to define an external index source. This can be:
- An on-disk monolithic index produced by `clangd-indexer` or
- Address of a remote-index-server.
`MountPoint` can be used to specify source root for the index. This is necessary
to handle relative path conversions. Overall schema looks like this:

```
Index:
  External:
    File: /abs/path/to/an/index.idx
    Server: my.index.server.com:50051
    MountPoint: /files/under/this/project/
```

- Exactly one of `File` or `Server` needs to be specified.
- MountPoint defaults to location of the config fragment if not provided, must
  be absolute if declared in global(user) config and relative otherwise.
- Declaring an `External` index disables background-indexing implicitly for
  files under the `MountPoint`. Users can turn it back on, by explicitly
  mentioning `Background: Build` in a later on fragment.
