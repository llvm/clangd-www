# Include Cleaner

Manually managing includes in a C++ translation unit, especially in the face of
transitive inclusions, requires a lot of effort. Include Cleaner aims to
provide diagnostics to keep includes in an
[IWYU](https://include-what-you-use.org/)-clean state.

Include Cleaner is available in "preview" mode with an incomplete set of
capabilities and can be enabled through [configuration
file](/config#unusedincludes). If you experience any bugs, please submit a bug
report in [clangd/issues](https://github.com/clangd/clangd/issues).

{:.v14}

## How it works

Include Cleaner issues diagnostics for includes that are present but not used
in the main file. When you open a file, clangd will analyze the symbols the
file uses and mark all headers defining these symbols as "used". The warnings
will be issued for the headers that are included but not marked as "used".
Example:

```c++
// foo.h
#pragma once

class Foo {};
```

```c++
// bar.h
#pragma once

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
dependency on it.

### Deciding what headers are used

Clangd relies on Clang AST to deduce which headers are used and which aren't,
the whole Include Cleaner decision process is described below.

#### Scanning the main file

IncludeCleaner will traverse Clang AST of the main file. It will recursively
visit AST nodes and collect locations of all referenced symbols (e.g.  types,
functions, global variables). Any declaration explicitly mentioned in the code,
brought in via macro expansions, implicitly through type deductions or template
instantiations will be marked as "used". Example:

```c++
// foo.h
#pragma once

// USED
int foo();

// USED
#define FOO foo

// USED
struct Bar {
  Bar();
}

// USED
struct Baz;

// USED
template <typename T> Baz getBaz();
```

```c++
// main.cpp

#include "foo.h"

int main() {
  // Uses foo() and FOO
  FOO();
  // Uses Baz, getBaz and Bar.
  auto baz = getBaz<Bar>();
}
```

This means that Include Cleaner is conservatively treating symbols in the
expanded code as usages as opposed to only explicitly spelled symbols.

Include Cleaner will also traverse the macro names in the spelled code to
collect used macros.

After the process is complete, all declaration and definition locations will be
collected and passed to the next stage.

#### Marking the headers as used

`SourceLocation` instances collected at the previous step will be converted to
`FileID`s and deduplicated.

This is achieved by looking at two hints in the code:

- `IWYU pragma: private` directives, which explicitly tells a particular header
  should only be included through another.
- Header being non-self contained (e.g. missing header guards or pragma once,
  having a `.inc` extension). In which case Include Cleaner uses the first
  self-contained header in the include stack as the public interface.

After the responsible headers are collected, the only step left is producing
diagnostics for unused headers.

#### Issuing warnings

After most of the work is done, Include Cleaner needs to decide which headers
are not used in the main file. All inclusions are scanned and checked for
containing `IWYU pragma: keep`; if they do not, they are not used and will be
warned about.

### IWYU pragmas

IWYU tool offers a set of
[pragmas](https://github.com/include-what-you-use/include-what-you-use/blob/master/docs/IWYUPragmas.md).
Include Cleaner respects `keep`, `private` and (partly) `export`.

## Future plans and Limitations

### Umbrella headers

The "umbrella" headers are re-exporting the implementation headers for public
use, which is a common practice in Open Source projects. A notable example of
this is Googletest: the `gtest/gtest.h` top-level header does not contain any
definitions: it includes a number of "internal" headers that are not
recommended to users. The users should always write `#include
"gtest/gtest.h"`. The way to propagate that information to Include Cleaner is
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

