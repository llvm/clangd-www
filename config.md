# Configuration

The configuration mechanism is new in clangd 11, and more options will be
exposed in this way in future.
{:.v11}

{% include toc.md %}

## Files

Configuration is stored in YAML files. These are either:

- **project configuration**: a file named `.clangd` in the source tree.
  (clangd searches in all parent directories of the active file).

  Generally this should be used for shared and checked-in settings.

  (Existing _directories_ named `.clangd` can be deleted.
  These were used for temporary storage by clangd before version 11.)

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

Changes should take effect immediately as you continue to edit code.

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

```yaml
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

```yaml
CompileFlags:                     # Tweak the parse settings
  Add: [-xc++, -Wall]             # treat all files as C++, enable more warnings
  Remove: -W*                     # strip all other warning-related flags
  Compiler: clang++               # Change argv[0] of compile flags to `clang++`
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
  removed along with any arguments. Synonyms like `--include-directory=`
  will also be removed.
- Otherwise, if the value ends in `*` (like `-DFOO=*`) then any argument
  with the prefix will be removed.
- Otherwise any argument exactly matching the value is removed.

In all cases, `-Xclang` is also removed where needed.

Example:

- Command: `clang++ --include-directory=/usr/include -DFOO=42 foo.cc`
- Configuration: `Remove: [-I, -DFOO=*]`
- Result: `clang++ foo.cc`

Flags added by the same CompileFlags entry will not be removed.

### CompilationDatabase
{:.v12}

Directory to search for compilation database (compile_commands.json etc).
Valid values are:
- A single path to a directory (absolute, or relative to the fragment)
- Ancestors: search all parent directories (the default)
- None: do not use a compilation database, just default flags.

### Compiler
{:.v14}

String to replace the executable name in the compile flags. The name controls
flag parsing (clang vs clang-cl), target inference (gcc-arm-noneabi) etc.

If the option matches a glob mentioned in `--query-driver`, then it'll be
invoked for extraction of include paths.

## Index

Controls how clangd understands code outside the current file.

```yaml
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
{:.v12}

Used to define an external index source:

- On-disk monolithic index produced by `clangd-indexer` or
- Address of a [remote-index-server](/guides/remote-index).

`MountPoint` can be used to specify source root for the index. This is necessary
to handle relative path conversions. Overall schema looks like this:

```yaml
Index:
  External:
    File: /abs/path/to/an/index.idx
    # OR
    Server: my.index.server.com:50051
    MountPoint: /files/under/this/project/
```

- Exactly one of `File` or `Server` needs to be specified.
- `MountPoint` defaults to location of the config fragment if not provided, must
  be absolute in global config and relative in local config.
- Declaring an `External` index disables background-indexing implicitly for
  files under the `MountPoint`. Users can turn it back on, by explicitly
  mentioning `Background: Build` in a later fragment.

### StandardLibrary
{:.v15}

Controls whether clangd eagerly indexes the standard library (to give
code completions of standard library symbols on an empty file). Sample block
(default).

```
Index:
  StandardLibrary: No
```

## Style

Describes the style of the codebase, beyond formatting.

### FullyQualifiedNamespaces

Namespaces that should always be fully qualified, meaning no "using"
declarations, always spell out the whole name (with or without leading::). 
All nested namespaces are affected as well.
Affects availability of the AddUsing tweak.

## Diagnostics
{:.v12}

### Suppress

Diagnostic codes that should be suppressed.

Valid values are:

- `'*'`, to disable all diagnostics
- diagnostic codes exposed by clangd (e.g `unknown_type`, `-Wunused-result`)
- clang internal diagnostic codes (e.g. `err_unknown_type`)
- warning categories (e.g. `unused-result`)
- clang-tidy check names (e.g. `bugprone-narrowing-conversions`)

This is a simple filter. Diagnostics can be controlled in other ways
(e.g. by disabling a clang-tidy check, or the `-Wunused` compile flag).
This often has other advantages, such as skipping some analysis.

### ClangTidy

Configure how clang-tidy runs over your files.

The settings are merged with any settings found in .clang-tidy
configuration files with the ones from clangd configs taking precedence.

#### Add

List of [checks](https://clang.llvm.org/extra/clang-tidy/checks/list.html).
These can be globs, for example `Add: 'bugprone-*'`.

#### Remove

List of checks to disable, can be globs.

This takes precedence over Add, this supports enabling all checks from a module apart from some specific checks.

Example to use all modernize module checks apart from use trailing return type:

```yaml
Diagnostics:
  ClangTidy:
    Add: modernize*
    Remove: modernize-use-trailing-return-type
```

#### CheckOptions

Key-value pairs of options for clang-tidy checks.
Available options for all checks can be found [here](https://clang.llvm.org/extra/clang-tidy/checks/list.html).

Note the format here is slightly different to `.clang-tidy` configuration
files as we don't specify `key: <key>, value: <value>`. Instead just use
`<key>: <value>`

```yaml
Diagnostics:
  ClangTidy:
    CheckOptions:
      readability-identifier-naming.VariableCase: CamelCase
```

### UnusedIncludes
{:.v14}

Enables Include Cleaner's [unused includes
diagnostics](/design/include-cleaner). Possible values: `None` (default),
`Strict`.

```yaml
Diagnostics:
  UnusedIncludes: Strict
```

## Completion
{:.v13}

### AllScopes
Whether code completion should include suggestions from scopes that are
not visible. The required scope prefix will be inserted.

## InlayHints
{:.v14}

Configures the behaviour of the inlay-hints feature. Sample block (default):

```yaml
InlayHints:
  Designators: Yes
  Enabled: Yes
  ParameterNames: Yes
  DeducedTypes: Yes
```

### Enabled
{:.v14}

A boolean that enables/disables the inlay-hints feature for all kinds, when
disabled, configuration for specific kinds are ignored.

### ParameterNames
{:.v14}

A boolean that enables/disables inlay-hints for parameter names in function
calls.

### DeducedTypes
{:.v14}

A boolean that enables/disables inlay-hints for deduced types.

### Designators
{:.v14}

A boolean that enables/disables inlay-hints for designators in aggregate initialization. (eg: `Designators: true`: `std::vector<int> arr = {[0]= 1, [1]= 2}` ; `Designators: false`: `std::vector<int> arr = {1, 2}`)

## Hover
{:.v14}

Configures contents of the hover cards. Sample block (default):

```yaml
Hover:
  ShowAKA: No
```

### ShowAKA
{:.v14}

A boolean that controls printing of desugared types, e.g:
`vector<int>::value_type (aka int)`
