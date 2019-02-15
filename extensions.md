# Protocol extensions

clangd supports some features that are not in the official
[Language Server Protocol specification](https://microsoft.github.io/language-server-protocol/specification).

We try to do this sparingly. The most important considerations are:
- **Editor support**: How many users will the feature be available to?
- **Standardization**: Is the feature stable? is it likely to be adopted by more
  editors over time?
- **Utility**: Does the feature provide a lot of value?
- **Complexity**: Is this hard to implement in clangd, or constrain future work?
  Is the protocol complicated?

These extensions may evolve or disappear over time. If you use them, try to
recover gracefully if the structures aren't what's expected.

{% include toc.md %} 

## Switch between source/header
{:.v6}

Lets editors switch between the main source file (`*.cpp`) and header (`*.h`).

**New client->server request**: `textDocument/switchSourceHeader`.
  - Params: `TextDocumentIdentifier`: an open file.
  - Result: `string`: the URI of the corresponding header (if a source file was
    provided) or source file (if a header was provided).

If the corresponding file can't be determined, `""` is returned.
[bug?](https://github.com/clangd/clangd/issues/12)

## File status
{:.v8}

Provides information about activity on clangd's per-file worker thread.
This can be relevant to users as building the AST blocks many other operations.

**New server->client notification**: `textDocument/clangd.fileStatus`
  - Sent when the current activity for a file changes. Replaces previous
    activity for that file.
  - Params: `FileStatus` object with properties:
    - `uri : string`: the document whose status is being updated.
    - `state : string`: human-readable information about current activity.

**New initialization option**: `initializationOptions.clangdFileStatus : bool`
  - Enables receiving `textDocument/clangd.fileStatus` notifications.

## Compilation commands
{:.v8}

clangd relies on having accurate compilation commands to correctly interpret a
file. Typically these are discovered via a `compile_commands.json` file in
a parent directory. These extensions allow editors to supply the commands over
LSP instead.

**New initialization option**: `initializationOptions.compilationDatabasePath : string`
  - Specifies the directory containing the compilation database (e.g.
    `compile_commands.json`). This path will be used for all files, instead of
    searching their ancestor directories.

**New initialization option**: `initializationOptions.fallbackFlags : string[]`
  - Controls the flags used when no specific compile command is found.
    The compile command will be approximately `clang $FILE $fallbackFlags` in
    this case.

**New configuration setting**: `settings.compilationDatabaseChanges : {string: CompileCommand}`
  - Provides compile commands for files. This can also be provided on startup as
    `initializationOptions.compilationDatabaseChanges`.
  - Keys are file paths (Not URIs! [bug?](https://github.com/clangd/clangd/issues/13))
  - Values are `{workingDirectory: string, compilationCommand: string[]}`

## Force diagnostics generation
{:.v7}

Clangd does not regenerate diagnostics for every version of a file (e.g. after
every keystroke), as that would be too slow. Its heuristics ensure:
 - diagnostics do not get too stale
 - if you stop editing, diagnostics will catch up
This extension allows editors to force diagnostics to be generated/not generated
at a particular revision.

**New property of `textDocument/didChange` request**: `wantDiagnostics : bool`
 - if true, diagnostics will be produced for exactly this version.
 - if false, diagnostics will not be produced for this version, even if there
   are no further edits.
 - if unset, diagnostics will be produced for this version or some subsequent
   one in a bounded amount of time.

## Diagnostic categories
{:.v8}

Clang groups diagnostics into categories (e.g. "Inline Assembly Issue").
Clangd can emit these categories for interested editors.

**New property of `Diagnostic` object**: `category : string`:
 - A human-readable name for a group of related diagnostics.
   Diagnostics with the same code will always have the same category.

**New client capability**: `textDocument.publishDiagnostics.categorySupport`:
 - Requests that clangd send `Diagnostic.category`.

## Inline fixes for diagnostics
{:.v8}

LSP specifies that code actions for diagnostics (fixes) are retrieved
asynchronously using `textDocument/codeAction`. However clangd always computes
these eagerly, and providing them alongside diagnostics can improve the UX in
editors.

**New property of `Diagnostic` object**: `codeActions : CodeAction[]`:
 - All the code actions that address this diagnostic.

**New client capability**: `textDocument.publishDiagnostics.codeActionsInline : bool`
 - Requests that clangd send `Diagnostic.codeActions`.

## Symbol info request
{:.v8}

This attempts to resolve the symbol under the cursor, without retrieving
further information (like definition location, which may require consulting an
index). This was added to support integration with indexes outside clangd.

**New client->server request**: `textDocument/symbolInfo`:
 - Params: `TextDocumentPositionParams`
 - Response: `SymbolDetails`, an object with properties:
   - `name : string` the unqualified name of the symbol
   - `containerName : string` the enclosing namespace, class etc (without
     trailing `::`)
   - `usr : string`: the clang-specific "unified symbol resolution" identifier
   - `id : string?`: the clangd-specific opaque symbol ID


