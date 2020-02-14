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

## UTF-8 offsets
{:.v9}

LSP specifies that offsets within lines are in UTF-16 code units (for `Position`s and also delta-encoded document updates).
This unusual is an unfortunate legacy of VSCode's JavaScript implementation.

clangd allows clients to use UTF-8 offsets instead. This allows clients that always speak UTF-8 (in violation of the protocol) to work correctly, and those that are UTF-8 native to avoid unneccesary transcoding (which may be slow if implemented in e.g. vimscript).

**New client capability**: `offsetEncoding : string[]`:

  Lists the encodings the client supports, in preference order. It SHOULD include `"utf-16"`. If not present, it is assumed to be `["utf-16"]`
  
  Well-known encodings are:
  - `utf-8`: `character` counts bytes
  - `utf-16`: `character` counts code units
  - `utf-32`: `character` counts codepoints

**New InitializeResponse property**: `offsetEncoding: string`:
  - Specifies the encoding that was selected by the server, and should be used.
  - This should be one of the requested encodings, or `"utf-16"` if none ore supported.
  - Only sent if the client capability was specified (or the equivalent command-line flag `-offset-encoding=utf-8`).
  
**Advice for clients using this extension**:
  - clients that only support UTF-8 should send `offsetEncoding: ["utf-8"]` in their client capabilities.
    This will cause the server to use UTF-8 if supported.
  - clients that prefer UTF-8 but can use UTF-16 should send `offsetEncoding: ["utf-8", "utf-16"]` and observe the selected encoding in the `InitializeResponse`, defaulting to UTF-16 if it's not present.
    This will negotiate UTF-8 with servers that support it.
  - clients that prefer UTF-16 may send `offsetEncoding: ["utf-16"]` or simply not use the extension.
 
**Advice for servers using this extension**:
  - servers that only support UTF-8 should send `offsetEncoding: "utf-8"` in their InitializeResponse.
    This will enable UTF-8 in clients that support it.
  - servers that support both UTF-8 and UTF-16 should check whether the client capabilities mentions `"utf-8"` as supported, and use it if so. The selected encoding should be reported in the `InitializeResponse`.
    This allows UTF-8 to be used when the client prefers it.
  - servers that only support UTF-16 can add `offsetEncoding: "utf-16"` or simply not use the extension.

## Code completion scores
{:.v10}

LSP gives servers limited control over completion display order through the
`sortText` attribute. Clangd uses several signals such as number of usages to
ensure the most likely completions are near the top.

However as the user continues to type, editors filter and re-rank the results
on the client side. This re-ranking should take into account the signals from
the server, but LSP does not expose them.

**New CompletionItem property**: `score: number`:
  - The quality of the result, independent of how well it fuzzy-matches the word
    being completed. (Value is >= 0, higher is better).
  - Clients that fuzzy client-side filtering should multiply `score` by their
    fuzzy-match score and sort by the result.
  - Clients with non-fuzzy client-side filtering only should sort by `score`.
  - Clients that don't support client-side filtering should ignore this and
    use `sortText`, which incorporates `score` and fuzzy-matching.

