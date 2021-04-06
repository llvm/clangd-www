# Design of clangd

A language server's main responsibilites are:

 - keeping track of open files and unsaved changes
 - providing the editor with up-to-date diagnostics (warnings/errors)
 - responding to requests from the editor (such as go-to-definition)

Most of the design documentation focuses on the concepts, if you're interested
in the implementation we try to keep the code well-documented.

[code walkthrough](/design/code.html)
{:.main-article}

## Request handling

clangd is based on the `clang` compiler, and at its core runs the clang parser
in a loop. The parser produces diagnostics as it encounters problems, and the
end result is a [clang AST]. The AST is saved to answer queries like "what kind
of symbol is under the cursor".

[clang AST]: https://clang.llvm.org/docs/IntroductionToTheClangAST.html

There is one such loop for each open file. The `TUScheduler` class manages a
collection of `ASTWorker`s, each running on its own thread. Most operations run
on these threads, though code completion is a notable exception.

[threads and request handling](/design/threads.html)
{:.main-article}

## Index

C/C++/Objective-C are designed so that you can parse one source file at a time,
without needing to see the whole program. This means that the resulting AST
lacks certain information:

- if you call a function, we can find a declaration for it, but we may not
  have seen its definition
- there's no way to find all the references to a struct you defined
- code completion can suggest variables that are in scope, but not those
  where you'd need to add an `#include`

To solve this, clangd maintains a database of symbols found anywhere in the
program, called the index. This is extracted from each open file as it is
parsed, and also by parsing the whole project in the background.

[the clangd index](/design/indexing.html)
{:.main-article}
