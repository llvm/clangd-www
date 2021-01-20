# clangd code walkthrough

This describes the critical parts of clangd and roughly what they do.
It may get out of date from time to time, please
[file a bug](https://github.com/llvm/clangd-www/issues)!
It mostly starts at the outside and works it way inward.

The clangd code lives in the [llvm-project] repository under
[clang-tools-extra/clangd][clangd]. We'll also mention some dependencies in
other parts of llvm-project (such as clang).

Links below point to the [woboq] code browser. It has nice cross-referenced
navigation, but may show a slightly outdated version of the code.

{% include toc.md %}

## Starting up and managing files

### Entry point and JSON-RPC

The `clangd` binary itself has its [main()] entrypoint in `tool/ClangdMain.cpp`.
This mostly parses flags and hooks `ClangdLSPServer` up to its dependencies.

One vital dependency is [JSONTransport] which speaks the JSON-RPC protocol
over stdin/stdout. LSP is layered on top of this [Transport] abstraction.
(There's also an Apple XPC transport in the [xpc/] directory).

We call `ClangdLSPServer.run()` to start the loop, and it synchronously
processes messages until the client disconnects. Calls to the large
non-threadsafe singletons (`ClangdLSPServer`, `ClangdServer`, `TUScheduler`)
all happen on the main thread.
See [threads and request handling].

### Language Server Protocol

[ClangdLSPServer] handles the LSP protocol details. Incoming requests are routed
to some method on this class using a lookup table, and then implemented
by dispatching them to the contained `ClangdServer`.

The incoming JSON requests are mapped onto structs defined in [Protocol.h].
In the simplest cases these are just forwarded to the appropriate method on
`ClangdServer` - we use the LSP structs as vocabulary types for most things.

In other cases there's some gap between LSP and what seems to be a sensible C++
API, so `ClangdLSPServer` has some real work to do.

### ClangdServer and TUScheduler

The [ClangdServer] class is best thought of as the C++ API to clangd.
Features tend to be implemented as stateless, synchronous functions ("give me
hover information from this AST at offset 25"). ClangdServer exposes them as
stateful, asynchronous functions ("compute hover information for the latest
version of Foo.cpp at offset 25, call back when done") which is the LSP model.

[TUScheduler] is responsible for keeping track of the latest version of each
file, building and caching ASTs and preambles as inputs, and providing threads
to run requests on in an appropriate sequence. (More details in
[threads and request handling]).
It also pushes certain events to `ClangdServer` via [ParsingCallbacks], to
allow emitting diagnostics and indexing ASTs.

`ClangdServer` is fairly mechanical for the most part. The features are
implemented in various other files, and the scheduling and AST building is
done by `TUScheduler`, so largely it just binds these together.
`TUScheduler` doesn't know about particular features (except diagnostics).

### Compile commands

Like other clang-based tools, clangd uses clang's command-line syntax as its
interface to configure parse options (like include directories).
The arguments are obtained from a [tooling::CompilationDatabase], typically
built by reading `compile_commands.json` from a nearby directory.
[GlobalCompilationDatabase] is responsible for finding and caching such
databases, and for providing "fallback" commands when none are found.

Various heuristic tweaks are applied to these commands to make them more likely
to work, particularly on Mac. These live in [CommandMangler].

## Features

### Diagnostics

During parsing, clang emits diagnostics through a `DiagnosticConsumer` callback.
clangd's [StoreDiags] implementation converts them into [Diag] objects,
which capture the relationships between diagnostics, fixes, and notes.
These are exposed in `ParsedAST`.
(clang-tidy diagnostics are generated separately in `buildAST()`, but also end
up captured by `StoreDiags` and exposed in the same way).

[IncludeFixer] attempts to add automatic fixes to certain diagnostics by using
the index to find headers that should be included.

`TUScheduler` has a logic to determine when a `ParsedAST`'s diagnostics are
"correct enough" to emit, and when a new build is needed for this purpose.
It then triggers `ClangdServer::onMainAST`, which calls
`ClangdLSPServer::onDiagnosticsReady`, which sends them to the client.

### AST-based features

Most clangd requests are handled by inspecting a `ParsedAST`, and maybe the
index. Examples are [locateSymbolAt()] (go-to-definition) and [getHover()].

These features are spread across various files, but are easy to find from their
callsites in `ClangdServer`.

### Code completion (and signature help)

Code completion does not follow the usual pattern for AST-based features.
Instead there's a dedicated parse of the current file with a callback when the
completion point is reached.
The core completion logic is implemented in clang's [SemaCodeComplete.cpp] and
has access to information not present in the AST, such as name-lookup structures
and parser state.

[CodeComplete.h] is mostly concerned with running clang in this mode,
combining clang's results with index-based results, applying ranking, and
converting to LSP's data model.

The ranking is mostly implemented in [Quality.h], and the name-matching
is done by [FuzzyMatcher].

### Code actions

Most code actions are provided by `Tweak`s. These are small plugins that
implement the [Tweak] interface. They live in the [refactor/tweaks] directory
and are registered through the linker. Given a selection, they can (quickly)
determine whether they apply there and (maybe slowly) generate the actual edits.
The LSP code-actions flow is built out of these primitives.

## Feature infrastructure

### Parsing and ASTs

The representation of a parsed file in clangd is [ParsedAST].
As the name suggests this is mostly used to access Clang's AST
(`clang::ASTContext`), but extends it by:

 - recording and exposing information gathered from callbacks (e.g. diagnostics)
 - encapsulating the other objects (e.g. SourceManager and Preprocessor) and
   keeps them alive with the correct lifetime

`ParsedAST::build()` is where we run the clang parser.
Some low-level bits (creating `CompilerInstance`) are in [Compiler.h]
instead, and are reused when we run clang without retaining an AST (code
completion, indexing, preambles).

The [PreambleData] structure similarly extends Clang's `PrecompiledPreamble`
class with extra recorded information. It contains the AST of included headers
and is only rebuilt when those headers change. The preamble is large, it's kept
on disk by default and parts are deserialized on demand.

### Abstractions over clang AST

Several tasks come up in various features and we have reusable solutions:

- [SelectionTree] identifies the AST nodes corresponding to a point or range
  in the source code.
  Used in go-to-definition, code actions, and many other features.
- [targetDecl()] identifies the declaration an AST node refers to.
  Used e.g. in go-to-definition.
- [findExplicitReferences()] traverses a chunk of AST and lists declarations
  referenced. Used e.g. in find-references and rename. Should be used for
  indexing, one day.

### Index

Operations that need information outside the current file/AST make use of
[the clangd index], which is in the [index/] directory.

[SymbolIndex] is the index interface exposed to consuming features, and
describes the data/queries they should provide. (`Symbol`, `Ref`, etc).
It has several implementations used as building-blocks:

- [MemIndex] is a simple in-memory implementation that's cheap to construct.
- [Dex] is a more complex one with a scalable fuzzyFind search.
- [MergedIndex] combines indexes, merging results.
- [IndexClient] is a client for a remote index service over grpc.

[SymbolCollector] extracts indexable data from a translation unit.
[index/Serialization.h] defines a binary format to store/load index data.

These building blocks are used to provide clangd index data:

- [BackgroundIndex] runs `SymbolCollector` over project files in background
  threads, periodically combining the results into an exposed `Dex` index.
  Index data is also written to disk and only reindexed when these are stale.
- [FileIndex] stores the index information from all opened files and their
  preambles, running SymbolCollector on ASTs after they are rebuilt. It is a
  `MergedIndex` of a `Dex` of the preambles and a `MemIndex` of the main-file
  symbols. This is also known as the "dynamic index".
- The "static index" is configured in `main` and may be a
  simple index file (generated by [indexer/IndexerMain.cpp]) loaded into `Dex`,
  a `RemoteIndex`, or nothing at all.

## Dependencies

### Clang libraries

Clang code structure is a huge topic, but the most important pieces for clangd:

- AST: [clang/AST/] defines the data structures that represent parsed C++
  code, such the [Decl], [Stmt], and [Type] hierarchies. [RecursiveASTVisitor]
  is the generic mechanism to walk an AST.
- Preambles: [PrecompiledPreamble] wraps a serialized partial AST that can be
  lazy-loaded from disk, clangd relies *heavily* on this optimization.
- Preprocessor: at the token level, the [Preprocessor] handles directives and
  macro expansion, and we use [PPCallbacks] hooks to listen for events.

### Clang-tools libraries

clangd shares code with other tools derived from the Clang compiler, these
libraries live outside clangd.

- [syntax::TokenBuffer] captures token-boundary and preprocessing information
  that clang itself doesn't preserve.
- [clang/Index/] implements an indexing-oriented traversal of Clang ASTs, which
  is used in clangd index.
- [clang/Format/] is the clang-format logic used to satisfy formatting requests
  and also to format newly-inserted code.
- [tooling::CompilationDatabase] is the foundation for clangd integration
  with build systems.

### General support libraries

Like most LLVM code, clangd heavily uses [llvm/ADT/] and [llvm/Support/] to
supplement the standard library. We try to avoid other LLVM dependencies.

clangd has its own [support/] library, conceptually similar to `llvm/Support`.
It contains libraries that are general-purpose, but not a good fit for llvm as a
whole (too opinionated, or focused on multithreading). The most prominent:

- [ThreadsafeFS] addresses the problems with llvm's FileSystem abstraction for
  multithreaded programs.
- [Context] is used to passing certain "ambient" data around within the current
  thread, and automatically propagating it when scheduling on another thread.
  (It is related to dynamically-scoped variables, and thread-local storage).
  It's used for certain settings like overriding LSP encoding, for tracking
  actions across threads, request cancellation and more.
- [support/Logger.h] provides a concise, threadsafe logging API and lets
  embedders handle logs.
- [support/Trace.h] allows instrumentation of clangd implementation with
  events and metrics for performance analysis etc.

## Testing

Most of the tests are in the [unittests/] directory (despite being a mix of unit
and integration tests). Test files are mostly named after the file they're
testing, and use the [googletest] framework.

Some helpers are widely shared between tests:

- [TestTU] lets tests tersely specify code for a test case, and can prepare
  `ParsedAST` and other structures needed for testing features on that code.
- [Annotations] recognizes code examples with marked points and ranges.
  This is used e.g. to specify tests for "go to definition".

clangd has a small number of black-box tests in [test/]. These use LLVM [lit]
and [FileCheck] to drive the clangd binary and verify output. They smoke-test
clangd as an LSP server, and test a few hard-to-isolate features.

[FileCheck]: https://llvm.org/docs/CommandGuide/FileCheck.html
[googletest]: https://github.com/google/googletest
[lit]: https://llvm.org/docs/CommandGuide/lit.html
[llvm-project]: https://github.com/llvm/llvm-project
[woboq]: https://code.woboq.org/llvm/clang-tools-extra/clangd/

[threads and request handling]: /design/threads.html
[the clangd index]: /design/indexing.html

[clangd]: https://code.woboq.org/llvm/clang-tools-extra/clangd/
[index/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/
[test/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/test/
[refactor/tweaks/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/refactor/tweaks/
[support/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/support/
[unittests/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/unittests/
[xpc/]: https://code.woboq.org/llvm/clang-tools-extra/clangd/xpc/

[llvm/ADT/]: https://code.woboq.org/llvm/llvm/include/llvm/ADT/
[llvm/Support/]: https://code.woboq.org/llvm/llvm/include/llvm/Support/
[clang/AST/]: https://code.woboq.org/llvm/clang/include/clang/AST/
[clang/Index/]: https://code.woboq.org/llvm/clang/include/clang/Index/
[clang/Format/]: https://code.woboq.org/llvm/clang/include/clang/Format/

[CodeComplete.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/CodeComplete.h.html
[Compiler.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Compiler.h.html
[Protocol.h]:https://code.woboq.org/llvm/clang-tools-extra/clangd/Protocol.h.html
[Quality.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Quality.h.html
[index/Serialization.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/Serialization.h.html
[indexer/IndexerMain.cpp]: https://code.woboq.org/llvm/clang-tools-extra/clangd/indexer/IndexerMain.h.html
[support/Logger.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/support/Logger.h.html
[support/Trace.h]: https://code.woboq.org/llvm/clang-tools-extra/clangd/support/Trace.h.html

[SemaCodeComplete.cpp]: https://code.woboq.org/llvm/clang/lib/Sema/SemaCodeComplete.cpp.html

[Annotations]: https://code.woboq.org/llvm/clang-tools-extra/clangd/unittests/Annotations.h.html#clang::clangd::Annotations
[BackgroundIndex]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/Background.h.html#clang::clangd::BackgroundIndex
[ClangdLSPServer]: https://code.woboq.org/llvm/clang-tools-extra/clangd/ClangdLSPServer.h.html#clang::clangd::ClangdLSPServer
[ClangdServer]: https://code.woboq.org/llvm/clang-tools-extra/clangd/ClangdServer.h.html#clang::clangd::ClangdServer
[CommandMangler]: https://code.woboq.org/llvm/clang-tools-extra/clangd/CompileCommands.h.html#clang::clangd::CommandMangler
[Context]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Context.h.html#clang::clangd::Context
[Dex]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/dex/Dex.h.html#clang::clangd::dex::Dex
[Diag]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Diagnostics.h.html#clang::clangd::Diag
[FileIndex]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/FileIndex.h.html#clang::clangd::FileIndex
[FuzzyMatcher]: https://code.woboq.org/llvm/clang-tools-extra/clangd/FuzzyMatch.h.html#clang::clangd::FuzzyMatcher
[GlobalCompilationDatabase]: https://code.woboq.org/llvm/clang-tools-extra/clangd/GlobalCompilationDatabase.h.html#clang::clangd::GlobalCompilationDatabase
[IncludeFixer]: https://code.woboq.org/llvm/clang-tools-extra/clangd/IncludeFixer.h.html#clang::clangd::IncludeFixer
[IndexClient]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/remote/Client.cpp.html#clang::clangd::remote::(anonymousnamespace)::IndexClient
[JSONTransport]: https://code.woboq.org/llvm/clang-tools-extra/clangd/JSONTransport.cpp.html#clang::clangd::(anonymousnamespace)::JSONTransport
[MemIndex]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/MemIndex.h.html#clang::clangd::MemIndex
[MergedIndex]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/Merge.h.html#clang::clangd::MergedIndex
[ParsedAST]: https://code.woboq.org/llvm/clang-tools-extra/clangd/ParsedAST.h.html#clang::clangd::ParsedAST
[ParsingCallbacks]: https://code.woboq.org/llvm/clang-tools-extra/clangd/TUScheduler.h.html#clang::clangd::ParsingCallbacks
[PreambleData]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Preamble.h.html#clang::clangd::PreambleData
[SelectionTree]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Selection.h.html#clang::clangd::SelectionTree
[StoreDiags]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Diagnostics.h.html#clang::clangd::StoreDiags
[SymbolCollector]: https://code.woboq.org/llvm/clang-tools-extra/clangd/index/SymbolCollector.h.html#clang::clangd::SymbolCollector
[SymbolIndex]: https://code.woboq.org/llvm/clang-tools-extra/clang-include-fixer/SymbolIndex.h.html#clang::include_fixer::SymbolIndex
[TUScheduler]: https://code.woboq.org/llvm/clang-tools-extra/clangd/TUScheduler.h.html#clang::clangd::TUScheduler
[TestTU]: https://code.woboq.org/llvm/clang-tools-extra/clangd/unittests/TestTU.h.html#clang::clangd::TestTU
[ThreadsafeFS]: https://code.woboq.org/llvm/clang-tools-extra/clangd/support/ThreadsafeFS.h.html#clang::clangd::ThreadsafeFS
[Transport]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Transport.h.html#clang::clangd::Transport
[Tweak]: https://code.woboq.org/llvm/clang-tools-extra/clangd/refactor/Tweak.h.html#clang::clangd::Tweak
[findExplicitReferences()]: https://code.woboq.org/llvm/clang-tools-extra/clangd/FindTarget.h.html
[getHover()]: https://code.woboq.org/llvm/clang-tools-extra/clangd/Hover.h.html
[locateSymbolAt()]: https://code.woboq.org/llvm/clang-tools-extra/clangd/XRefs.h.html
[main()]: https://code.woboq.org/llvm/clang-tools-extra/clangd/tool/ClangdMain.cpp.html#main
[targetDecl()]: https://code.woboq.org/llvm/clang-tools-extra/clangd/FindTarget.h.html

[Decl]: https://code.woboq.org/llvm/clang/include/clang/AST/DeclBase.h.html#clang::Decl
[Stmt]: https://code.woboq.org/llvm/clang/include/clang/AST/Stmt.h.html#clang::Stmt
[Type]: https://code.woboq.org/llvm/clang/include/clang/AST/Type.h.html#clang::Type
[Preprocessor]: https://code.woboq.org/llvm/clang/include/clang/Lex/Preprocessor.h.html#clang::Preprocessor
[PPCallbacks]: https://code.woboq.org/llvm/clang/include/clang/Lex/PPCallbacks.h.html#clang::PPCallbacks
[RecursiveASTVisitor]: https://code.woboq.org/llvm/clang/include/clang/AST/RecursiveASTVisitor.h.html#clang::RecursiveASTVisitor
[PrecompiledPreamble]: https://code.woboq.org/llvm/clang/include/clang/Frontend/PrecompiledPreamble.h.html#clang::PrecompiledPreamble
[syntax::TokenBuffer]: https://code.woboq.org/llvm/clang/include/clang/Tooling/Syntax/Tokens.h.html#clang::syntax::TokenBuffer
[tooling::CompilationDatabase]: https://code.woboq.org/llvm/clang/include/clang/Tooling/CompilationDatabase.h.html#clang::tooling::CompilationDatabase
