# Feature modules

A feature often needs to participate in several parts of clangd: handle an
editor request, inspect an AST, and offer a code action. A **feature module**
groups these parts into one component. It implements the [FeatureModule]
interface, and clangd calls its hooks at the appropriate points.

Modules can be useful for project-specific tooling or integrations maintained
outside clangd. They share clangd's parsing and scheduling infrastructure, so
they can work with the editor's current files without running a separate
language server.

Feature modules are C++ extensions built and linked into a custom clangd binary.
The registry discovers linked modules; it does not load plugins from a path or
from `.clangd` configuration. Modules depend on clangd's internal C++ interfaces
and should be built against the version of clangd they extend. They are unrelated
to C++ language modules.

{% include toc.md %}

## How modules fit into clangd

[FeatureModule.h][FeatureModule] defines the extension hooks and the collection
that owns modules, `FeatureModuleSet`. There are two integration layers:

- [ClangdLSPServer] connects modules to the editor through `initializeLSP()`.
  Modules can register handlers and advertise capabilities.
- [ClangdServer] supplies shared facilities, passes modules into parsing and
  code-action operations, and coordinates shutdown.

A module can also expose ordinary C++ methods for an application embedding
[ClangdServer]. Such an interface should work without `initializeLSP()` being
called, since an embedder need not use LSP.

### Facilities

When [ClangdServer] constructs a module, it calls `initialize()` with a
`FeatureModule::Facilities` value:

```c++
struct Facilities {
  TUScheduler &Scheduler;
  const SymbolIndex *Index;
  const ThreadsafeFS &FS;
};
```

The module stores this internally and exposes the components through protected
accessors. They are available from module handlers and hooks after
`initialize()` has run, but they are not available in the module constructor.
The same module can therefore be used without an LSP server until it needs
these server-owned services.

The three facilities provide:

- `scheduler()` returns the [TUScheduler], which manages open files and schedules
  work on their ASTs and preambles.
- `index()` returns the [SymbolIndex] for queries across the codebase. It can be
  null when no index is available.
- `fs()` returns the [ThreadsafeFS] for creating filesystem views rooted at a
  compile command's working directory and reading files consistently across
  worker threads.

Use the scheduler to access the AST and contents of an open file: these account
for unsaved editor changes that a filesystem read would miss. For example,
[TUScheduler]::`runWithAST()` schedules a callback with an `InputsAndAST`, or an
error if an AST cannot be supplied. See [threads and request handling] and
[the clangd index] for more about these facilities. The [Code walkthrough]
also describes how requests flow through [ClangdLSPServer], [ClangdServer], and
[TUScheduler].

The facilities are deliberately narrow. A module does not receive ownership of
the scheduler, index, or filesystem, and must not retain them after the server
is destroyed. The index may be null when clangd has no configured index. The
filesystem is shared and threadsafe, but ASTs returned by the scheduler remain
thread-confined: use them only in the callback that receives them.

## Lifetime and threading

In the clangd executable, the lifetime is:

1. [ClangdMain.cpp] constructs a `FeatureModuleSet` from the registry and passes
   a pointer to it through the server options. The set owns the modules and
   outlives the LSP server.
2. When the editor sends `initialize`, [ClangdLSPServer] constructs
   [ClangdServer], which calls the non-virtual `FeatureModule::initialize()` to
   supply the shared facilities. The accessors must not be used before this
   step, such as in a module's constructor.
3. [ClangdLSPServer] then calls each module's `initializeLSP()` with the client's
   raw capabilities and the server capabilities being assembled. Use this hook
   to bind handlers and negotiate capabilities before normal requests begin.
4. During normal operation, clangd dispatches requests and calls module hooks.
5. At shutdown, [ClangdServer] destroys its scheduler, waiting for its request
   threads to finish. It then calls `stop()` on all modules, followed by
   `blockUntilIdle(Deadline::infinity())` on each module.
6. The module set destroys the modules after the LSP server is destroyed.

Module entry points normally run on the main thread. However,
`contributeTweaks()` and `astListeners()` may be called on worker threads, and
callbacks scheduled through [TUScheduler] run asynchronously. A module must
synchronize any mutable state shared across these calls. Avoid blocking the
main thread with expensive work.

A module with its own background work must implement the shutdown hooks.
`stop()` requests cancellation without blocking and must tolerate repeated
calls. `blockUntilIdle()` waits for work to finish, returning false if its
deadline expires. Tests also call it without first calling `stop()`, so becoming
idle must not require shutting down. Since the scheduler is already destroyed
when the server calls `stop()`, module-owned workers must not depend on it
during this phase.

The derived module must also clean up its workers if it is destroyed without a
server ever being constructed. Calls to virtual methods from the base-class
destructor do not dispatch to derived overrides.

## Extension points

### LSP methods, notifications, and commands

`initializeLSP()` runs while handling the editor's `initialize` request, after
clangd binds its built-in handlers and before it sends the initialization
response. This is the point to inspect client capabilities, advertise the
module's capabilities, and use [LSPBinder] to connect handlers:

- `method()` binds a request handler that receives parameters and a reply
  callback.
- `notification()` binds a handler with no reply.
- `command()` binds a command handled through `workspace/executeCommand`.
- `outgoingMethod()` and `outgoingNotification()` create callable objects for
  sending requests and notifications to the editor.

The binder converts between JSON and C++ types. Custom parameter types need
`fromJSON()` support, and result types need `toJSON()` support. Outgoing calls
have the reverse requirements. Complete each request's reply callback with
either a result or an error, including when work fails or is cancelled.

For example, this module implements a small counter. It follows the
`MathModule` example in [ClangdLSPServerTests.cpp][LSP tests]:

```c++
#include "FeatureModule.h"
#include "LSPBinder.h"
#include "TUScheduler.h"

namespace clang::clangd {
class CounterModule final : public FeatureModule {
  int Value = 0;
  OutgoingNotification<int> Changed;

  void initializeLSP(LSPBinder &Bind, const llvm::json::Object &ClientCaps,
                     llvm::json::Object &ServerCaps) override {
    Bind.notification("example/add", this, &CounterModule::add);
    Bind.method("example/get", this, &CounterModule::get);
    Changed = Bind.outgoingNotification("example/changed");
    ServerCaps["exampleCounterProvider"] = true;
  }

  void add(const int &Amount) {
    Value += Amount;
    Changed(Value);
  }

  void get(const std::nullptr_t &, Callback<int> Reply) {
    scheduler().runQuick(
        "CounterModule::get", "",
        [Reply = std::move(Reply), Snapshot = Value]() mutable {
          Reply(Snapshot);
        });
  }
};
} // namespace clang::clangd
```

The incoming handlers access `Value` on the main thread. The scheduled callback
captures a snapshot, so it does not race with subsequent notifications. This
example uses `runQuick()` to illustrate scheduling; an immediate reply would
also suffice for such a small calculation.

The method names and capability here are illustrative protocol extensions.
The editor needs corresponding support to use them. Real modules should check
relevant client capabilities before sending custom messages, advertise their
own capabilities, and choose names that do not collide with existing handlers.
Registered commands are included in clangd's `executeCommandProvider` capability
automatically.

These bindings let a module expose a custom AST query, accept settings from an
editor extension, send analysis results, or ask the editor to apply an edit.
Binding a name already in the handler table replaces its handler, so a module
can also override an existing method. This replaces the whole handler rather
than chaining it; the module must implement the protocol behavior clients
expect for that method.

For example, a module can customize hover text by binding
`textDocument/hover` and reusing clangd's hover implementation:

1. Schedule work with `scheduler().runWithAST()` for the requested file.
2. In the callback, obtain the formatting style with
   `getFormatStyleForFile()` and call `clangd::getHover()` with the AST, cursor
   position, style, and `index()`.
3. Convert the resulting `HoverInfo` to an LSP `Hover`, preserve its `SymRange`,
   and add the module's text to the output of `HoverInfo::present()`.
4. Reply with the hover, no result when nothing is under the cursor, or the
   error returned by the scheduler.

The existing [ClangdServer]::`findHover()` and [ClangdLSPServer]::`onHover()` show
these steps. An override must also honor the client's supported content format
(Markdown or plain text) and choose an appropriate request invalidation policy.
This can add project-specific explanations to the editor's existing hover UI
without requiring a custom LSP method or editor extension.

### Code actions

`contributeTweaks(std::vector<std::unique_ptr<Tweak>> &)` runs whenever clangd
collects tweaks in [Tweak.cpp]. First clangd instantiates the built-in tweak
registry, then it passes the same vector to each module in set iteration order.
The vector therefore contains the built-in tweaks and any changes made by
earlier modules.

The interface allows a module to append new [Tweak] instances, erase existing
ones, or replace them. This can provide project-specific refactorings, hide
actions unsuitable for a codebase, or substitute a customized implementation.
Removal only affects entries already in the vector: a later module can add
another entry. Replacement should remove the old entry before adding one with
the same ID, since applying an action selects the first matching ID.

For example, a module can remove a tweak by ID (with [Tweak] and
[STLExtras.h] included):

```c++
void contributeTweaks(std::vector<std::unique_ptr<Tweak>> &Out) override {
  llvm::erase_if(Out, [](const std::unique_ptr<Tweak> &T) {
    return llvm::StringRef(T->id()) == "SwapIfBranches";
  });
}
```

There are two call paths:

- When enumerating code actions, `prepareTweaks()` collects tweaks, applies the
  configured filter, and calls `prepare()` to check each action against the
  selection. Keep `prepare()` cheap because many actions are considered.
- When applying an action, `prepareTweak()` collects a fresh set, finds the
  requested ID, and calls `prepare()` again before `apply()` computes the
  effect. Removing a tweak therefore also prevents applying it through this
  path, even if the editor previously offered it.

The hook may run repeatedly and on worker threads. Do not rely on retaining the
same tweak instance between enumeration and application. Store any persistent
state in the module with appropriate synchronization. The `ContributesTweak`
test in [FeatureModulesTests.cpp][hook tests] demonstrates adding an action.

A standalone code action can use the existing tweak registry. A feature module
is useful when the action also needs module-owned state or other extension
points.

### Parsing and diagnostics

Override `astListeners()` to return a new `ASTListener` for each build that the
module wants to observe. clangd requests listeners separately when building a
main-file [ParsedAST] and a [preamble][Preamble], before setting up the
diagnostic callbacks for that build. Returning null opts out of that build.
Opening a file or updating it can trigger these builds; an editor request that
uses a cached AST does not itself create a listener. A reused preamble does
not trigger a new preamble build or listener.

A listener is destroyed when its build finishes, including on an early return
after a build failure. It does not live as long as the resulting AST.

Each listener's callbacks run on one thread, but different builds can run
concurrently. Keep per-build state in the listener, and synchronize any state
shared with the module or with other listeners.

#### Before executing the frontend action

`beforeExecute(CompilerInstance &)` runs after `BeginSourceFile()` succeeds and
before the frontend action's `Execute()` starts parsing. The preprocessor,
AST context, and AST consumer already exist. In a main-file build, clangd has
also installed its own parsing callbacks and clang-tidy preprocessor checks.
In a preamble build, the hook is forwarded through Clang's
`PreambleCallbacks::BeforeExecute()`.

This timing lets a module configure the compiler objects for the upcoming
parse. For example, it can:

- Attach `PPCallbacks` through `CI.getPreprocessor().addPPCallbacks()` to
  observe includes, macro definitions and expansions, or conditional directives.
- Adjust preprocessor behavior. The `BeforeExecute` test in
  [FeatureModulesTests.cpp][hook tests] suppresses missing-include errors and
  checks includes in both the preamble and the main-file body.
- Add an AST consumer to inspect declarations as they are parsed or analyze the
  translation unit when parsing finishes. This can run custom checks, gather
  information for later requests, or emit diagnostics through Clang's
  diagnostics engine.

To add a consumer, transfer the existing consumer into a [MultiplexConsumer]
together with the module's consumer. Keeping the existing consumer is essential:
it performs clangd's declaration collection or preamble generation. This example
emits a warning at each top-level function declaration to make the callback's
effect visible. A real check would restrict this to declarations that violate
its rule:

```c++
#include "FeatureModule.h"
#include "clang/AST/ASTConsumer.h"
#include "clang/AST/Decl.h"
#include "clang/Basic/Diagnostic.h"
#include "clang/Frontend/CompilerInstance.h"
#include "clang/Frontend/MultiplexConsumer.h"

namespace clang::clangd {
class AnalysisModule final : public FeatureModule {
  class AnalysisConsumer : public ASTConsumer {
    DiagnosticsEngine &Diags;
    unsigned WarningID;

  public:
    explicit AnalysisConsumer(DiagnosticsEngine &Diags)
        : Diags(Diags),
          WarningID(Diags.getCustomDiagID(DiagnosticsEngine::Warning,
                                        "example check: function %0")) {}

    bool HandleTopLevelDecl(DeclGroupRef Decls) override {
      for (Decl *D : Decls)
        if (auto *FD = llvm::dyn_cast<FunctionDecl>(D))
          Diags.Report(FD->getLocation(), WarningID) << FD->getNameAsString();
      return true; // Continue parsing.
    }
  };

  struct Listener : ASTListener {
    void beforeExecute(CompilerInstance &CI) override {
      std::vector<std::unique_ptr<ASTConsumer>> Consumers;
      Consumers.push_back(CI.takeASTConsumer());
      Consumers.push_back(
          std::make_unique<AnalysisConsumer>(CI.getDiagnostics()));
      CI.setASTConsumer(
          std::make_unique<MultiplexConsumer>(std::move(Consumers)));
    }
  };

  std::unique_ptr<ASTListener> astListeners() override {
    return std::make_unique<Listener>();
  }
};
} // namespace clang::clangd
```

For `void process();`, this produces `example check: function process` at the
function name. Reporting through the compiler's diagnostics engine sends the
warning through clangd's diagnostic collection, including `sawDiagnostic()`.
The consumer runs for both preamble and main-file builds. This simple loop only
checks function declarations delivered directly to `HandleTopLevelDecl()`;
checks that need declarations nested in namespaces or other AST nodes can use
a `RecursiveASTVisitor` or AST matchers.

The compiler instance owns the installed consumer. Do not let it retain
references to listener-local data beyond the listener's lifetime; use shared
ownership for state that must survive the build. `setASTConsumer()` initializes
the wrapper with the existing AST context, and the wrapper forwards that call
to its children, including the original consumer. Consumers composed this way
must tolerate repeated initialization.

This hook runs after the frontend's initial setup, so installing a wrapper does
not redo earlier setup of AST mutation or deserialization listeners. The
example adds ordinary AST consumer callbacks for the upcoming parse.
Likewise, preprocessor callbacks observe events delivered after installation;
they do not cause the contents of a reused preamble to be preprocessed again.

#### Observing and modifying diagnostics

`sawDiagnostic(const clang::Diagnostic &, clangd::Diag &)` is called by
[StoreDiags] while recording a primary diagnostic. clangd has filled in its
message, severity, source range, and diagnostic ID, but has not yet collected
the diagnostic's fix-its and subsequent notes. The hook is not called separately
for those notes. It may run during compiler setup before `beforeExecute()`,
during parsing, or during analysis performed after parsing.

The Clang diagnostic supplies the original ID, arguments, location, and fix-it
hints. The mutable `clangd::Diag` is the representation clangd will later
process and publish. A module can:

- Rewrite the message to provide project-specific guidance, or change the
  displayed severity.
- Set `Severity` to `DiagnosticsEngine::Ignored` to suppress the diagnostic and
  its associated notes, as shown by `SuppressDiags` in
  [FeatureModulesTests.cpp][hook tests]. This affects reporting; it does not
  undo an error's effect on Clang's parsing or error state.
- Add a custom fix to `Diag.Fixes`, or record information to offer a related
  tweak later. Clang's fix-its and notes are added after this hook, so this is
  not a callback over a fully assembled diagnostic and its fixes.

For example, this listener method promotes warnings to errors in the editor
and adds explanatory text, while leaving other severities alone. It requires
`Diagnostics.h` for the definition of `clangd::Diag` ([Diag]):

```c++
void sawDiagnostic(const clang::Diagnostic &, clangd::Diag &D) override {
  if (D.Severity == DiagnosticsEngine::Warning) {
    D.Severity = DiagnosticsEngine::Error;
    D.Message = "Project policy: " + D.Message;
  }
}
```

Combined with the consumer above, the example warning becomes an error reading
`Project policy: example check: function process`. A production policy can
select particular diagnostics using the original diagnostic's ID and arguments
instead of changing every warning.

Listeners are called in module set order with the same diagnostic, so later
modules see earlier modifications. Further diagnostic processing and filtering
still happens after these calls; the hook does not directly publish to LSP.
Diagnostics from a reused preamble are reused too, rather than replayed through
new listeners on each main-file build.

These hooks are wired into `ParsedAST` and preamble construction. They are not
a general callback for every compiler invocation or every diagnostic clangd
publishes: features that produce diagnostics outside this path do not
automatically pass through `sawDiagnostic()`.
In particular, background indexing has its own parsing path and does not call
these module hooks. An AST consumer installed here therefore does not run
project-wide simply because background indexing is enabled.

## Installing a module

### Registration in the clangd executable

Register a default-constructible module with `FeatureModuleRegistry`, for
example in the same source file as `CounterModule`:

```c++
namespace clang::clangd {
static FeatureModuleRegistry::Add<CounterModule>
    RegisterCounter("example-counter", "Example counter feature");
} // namespace clang::clangd
```

At startup, `FeatureModuleSet::fromRegistry()`, implemented in
[FeatureModule.cpp], instantiates every registered module. The registry name
and description identify the module in verbose logs; they do not provide an
enable/disable setting.

The translation unit containing the registration must be linked into the
`clangd` executable. Add the source or its object-library objects to the target
in [tool/CMakeLists.txt][tool build]. Merely putting the registration into a
static archive may allow the linker to omit it if nothing references that
object. [FeatureModulesRegistryTests.cpp][registry tests] shows registration
and discovery in a test executable.

The current [ClangdMain.cpp] constructs the registry-backed set on the LSP
startup path, after the early return for `--check`. Thus `clangd --check` does
not instantiate these registered modules.

### Explicit installation by an embedder

An application embedding [ClangdServer] can construct its own set, including
modules that require constructor arguments. For example, with the
`CounterModule` definition above and [ClangdServer] included:

```c++
clang::clangd::FeatureModuleSet Modules;
Modules.add(std::make_unique<clang::clangd::CounterModule>());
clang::clangd::ClangdServer::Options Opts;
Opts.FeatureModules = &Modules;
// Construct the server with Opts and keep Modules alive until it is destroyed.
```

The typed `add()` overload requires a `final` class derived from `FeatureModule`
and rejects a second module of the same type. These modules can be retrieved
with `Modules.get<CounterModule>()` or
`Server.featureModule<CounterModule>()`, allowing calls to a module's public
C++ interface.

The overload taking `std::unique_ptr<FeatureModule>` only adds the module to the
collection. It does not enable lookup by concrete type or reject duplicate
types. Registry-created modules use this overload, so they cannot be retrieved
through `featureModule<T>()`.

## Examples and testing

The LLVM checkout contains small executable examples in its unit tests:

- [FeatureModulesTests.cpp][hook tests] tests tweak contributions, diagnostic
  suppression, and preprocessor changes through `TestTU::FeatureModules`.
- [FeatureModulesRegistryTests.cpp][registry tests] tests static registration
  and instantiation through `fromRegistry()`.
- [ClangdLSPServerTests.cpp][LSP tests] tests incoming and outgoing LSP messages,
  diagnostic modification visible to the client, and a module with its own
  worker thread (`FeatureModulesThreadingTest`).

[FeatureModule]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/FeatureModule.h
[FeatureModule.cpp]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/FeatureModule.cpp
[ClangdMain.cpp]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/tool/ClangdMain.cpp
[ClangdLSPServer]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/ClangdLSPServer.h
[ClangdServer]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/ClangdServer.h
[LSPBinder]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/LSPBinder.h
[Tweak]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/refactor/Tweak.h
[Tweak.cpp]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/refactor/Tweak.cpp
[MultiplexConsumer]: https://github.com/llvm/llvm-project/blob/main/clang/include/clang/Frontend/MultiplexConsumer.h
[StoreDiags]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/Diagnostics.h
[ParsedAST]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/ParsedAST.h
[Preamble]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/Preamble.h
[tool build]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/tool/CMakeLists.txt
[hook tests]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/unittests/FeatureModulesTests.cpp
[registry tests]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/unittests/FeatureModulesRegistryTests.cpp
[LSP tests]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/unittests/ClangdLSPServerTests.cpp
[TUScheduler]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/TUScheduler.h
[SymbolIndex]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/index/Index.h
[ThreadsafeFS]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/support/ThreadsafeFS.h
[Diag]: https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/Diagnostics.h
[STLExtras.h]: https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/STLExtras.h
[Code walkthrough]: /design/code
[threads and request handling]: /design/threads
[the clangd index]: /design/indexing
