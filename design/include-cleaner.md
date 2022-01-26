# Include Cleaner

Manually managing includes in a C++ translation unit, especially in the face of
transitive inclusions, requires a lot of effort. Include Cleaner aims to
provide diagnostics to keep includes in an
[IWYU](https://include-what-you-use.org/)-clean state.

Include Cleaner is a IWYU-inspired feature in clangd that automates the process
of maintaining a necessary set of included headers. It now is available in
"preview" mode with an incomplete set of capabilities and can be enabled
through [configuration file](/config#UnusedIncludes). If you experience any
bugs, please submit a bug report in
[clangd/issues](https://github.com/clangd/clangd/issues).

{:.v14}

## How it works

Include Cleaner issues diagnostics fro includes that are present but not used
in the main file. When you open a file, clangd will analyze the symbols the
file uses and mark all headers defining these symbools as "used". The warnings
will be issues for the headers that are included but not marked as "used".
Example:

```c++
// foo.h
class Foo {};
```

```c++
// bar.h
class Bar {};
```

```c++
// main.cpp

#include "foo.h"
#include "bar.h" // <- Will be marked as unused and suggested to be removed.

int main() {
  Foo f;
}
```

Here, `main.cpp` only makes use of symbols from `foo.h` and removing `#include
"bar.h"` prevents unnecessary parsing of `bar.h` and allows breaking the
dependncy on it.

### Deciding what headers are used

Clangd relies on Clang AST to deduce which headers are used and which aren't,
the whole Include Cleaner decision process is described below.

#### Scanning the main file

First, Include Cleaner will build the AST for the main file (the file currently
opened in the editor). After the AST is built, Include Cleaner will recursively
visit the AST nodes and collect locations of all referenced symbols (e.g.
types, functions, global variables). The AST will contain macro and `auto`
expansions. For example, in this case, `foo.h` will be considered as used:

```c++
// foo.h

int foo() { return 42; }
```

```c++
// macro.h

#include "foo.h"

#define FOO foo
```

```c++
// main.cpp

#include "macro.h"

int main() {
  FOO();
}
```

This means that Include Cleaner is conservatively treating symbols in the
expanded code as usages as opposed to only explicitly spelled symbols.

Include Cleaner will also traverse the unexpanded macro tokens to see where
their definitions come from.

After the process is complete, the declaration and definition locations will be
collected and passed to the next stage.

#### Marking the headers as used

`SourceLocation` instances collected at the previous step will be converted to
`FileID`s and deduplicated. In this stage, it is important to attribute the
locations in some headers to their includes. Some of the `FileID`s correspond
to non self-contained headers, meaning the user should actually include their
parent rather than a header itself. Other important headers with this property
are the ones manually marked as private through `IWYU pragma: private`. For
them, the user explicitly asks includers to consider the public header.

After the responsible headers are collected, they only step left is producing
diagnostics for unused headers.

#### Issuing warnings

After most of the work is done, Include Cleaner needs to decide which headers
are not used in the main file. All inclusions are scanned and checked for
containing `IWYU pragma: keep`; if they do not, they are not used and will be
warned about.

### IWYU pragmas

IWYU tool offers a set of
[pragmas](https://github.com/include-what-you-use/include-what-you-use/blob/master/docs/IWYUPragmas.md),
the most notable of which are:

- `IWYU pragma: keep` indicates the inclusion should not be removed from the
  main file
- `IWYU pragma: private` indicates that the current header is an implementation
  detail and another one should be included instead

## Future plans and Limitations

### Umbrella headers

The "umbrella" headers are re-exporting the implementation headers for public
use, which is a common practice in Open Source projects. A notable example of
this is Googletest: the `gtest/gtest.h` top-level header does not contain any
definitions: it includes a number of "internal" headers that are not
recommended to users. The users should always write `#include
"gtest/ghtest.h"`. The way to propagate that information to Include Cleaner is
using `// IWYU pragma: private, include "public.h"` in your `private.h` header
that is being exported.

### Standard library

By default, Include Cleaner will not diagnose headers from the Standard
Library. Standard Library headers support is not complete yet (due to the
macros and the fact that a symbol is allowed to come from multiple headers) but
you can enable this unstable feature through passing `--include-cleaner-stdlib`
flag to clangd invocation.

### Inserting Includes

The complete version of Include Cleaner will not only warn about unused
headers, but also provide a way to include used headers directly, not through a
chain of transitive includes.

### Template type aliases

Include Cleaner does not currently support the templated type aliases because
Clang AST does not record the fact that expanded type was reached through a
type alias in cases like this:

```c++
// vec.h
template<class T>
using Vec = vector<T, Alloc<T>>;
```

So, if you include `vec.h` and use `Vec<int>` in your main file, IncludeCleaner
will for now consider `<vector>` standard header to be used, not `vec.h`.
