# Threads and request handling

Our main goals in handling incoming requests are:

- respond to requests as quickly as possible (don't block on unrelated work)
- provide diagnostics as soon as possible once the user stops typing
- handle requests using the expected version the of the file
- use a predictable and bounded amount of CPU and RAM

Some constraints are provided by clang:

- Clang supports parsing the preamble (initial `#include`s) separately for
  better incremental performance.
- Initial build of the preamble can be extremely slow - tens of seconds.
  Incremental AST builds (with an up-to-date preamble) are fast (sub-second).
- Once built, the preamble is threadsafe (it's just immutable bytes).
  However ASTs are not threadsafe, even for read-only operations.

## Life of a request

An LSP message like `textDocument/definition` or `textDocument/didChange` is
decoded by `ClangdLSPServer` and dispatched to the appropriate function on
`ClangdServer`. This happens on the main thread, ClangdServer is not threadsafe.
Therefore, its methods should not block - that would block incoming messages
which could be independent (code completion in a different file) or relevant
(cancelling a slow request).

Instead, they determine the affected file and place the action on `TUScheduler`.
This class maintains a set of `ASTWorker`s, each is responsible for one file.
The `ASTWorker` has a queue of operations, and a thread consuming them:

- throwing away operations that are obsolete:
  - reads that have been cancelled
  - writes immediately followed by writes (e.g. two consecutive keystrokes)
- executing the first operation that is still valid:
  - writes: rebuilding the AST (and preamble if needed), publishing diagnostics
  - reads: passing the AST to the action callback

This ensures there's only one AST and one preamble per open file, operations on
one file don't block another, and that reads see exactly the writes issued
before them.

## Debouncing

For files that rebuild relatively slowly, starting to build as soon as we see
the first change isn't ideal.

Suppose the user quickly types `foo();`. Building after the `f` is typed means:

- we'll always see a diagnostic "unknown identifier `f`", which is annoying.
- we'll never see the correct diagnostics until after 2 rebuilds

To address this, writes are debounced: rebuilding doesn't start until either a
read is received or a short deadline expires (user stopped typing).

## Code completion

Unlike typical requests like go-to-definition, code completion does not use
the pre-built AST. Clang doesn't do a great job of preserving the AST around
incomplete code, and completion can make good use of transient parser state.
We run a fresh parse with clang's completion API enabled, which injects a
"code completion" token into the token stream, and invokes a callback once the
parser hits it.

As this doesn't reuse the AST, it can run on a separate thread rather than the
ASTWorker. It does use the preamble, but we don't wait for it to be up-to-date.
Since completion is extremely time sensitive, it just uses whichever is
immediately available.
