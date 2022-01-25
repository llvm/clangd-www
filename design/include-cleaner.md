# Include Cleaner

The common pattern in C and C++ programs is that the source files often contain
unnecessary includes. Most of the time, these includes were added at some point
and actually used for some time, but over time the program evolved and the
symbols defined in these headers were no longer used. Keeping an eye on what
headers are actually required to build the file and manually updating them is
time-consuming and error-prone. Over time, the stale inclusions can pile up and
increase build times and complicate the dependncy graph.

Include Cleaner is a
[IWYU](https://github.com/include-what-you-use/include-what-you-use)-inspired
feature in clangd that automates the process of maintaining a necessary set of
included headers. It now is available in "preview" mode with an incomplete set
of capabilities. If you experience any bugs, please submit a bug report in
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

### Conservative filtering

Include Cleaner strives to provide safe diagnostics to reduce the posibility of
breaking the build. The tool will consider that every symbol in the "expansion"
of the main file symbols to count as a usage. Example:

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

In this case, both `macro.h` and `foo.h` will be marked as "used" because the
macro expansion contains the function call. `auto` will have a similar effect.

### IWYU pragmas

IWYU tool offers a set of
[pragmas](https://github.com/include-what-you-use/include-what-you-use/blob/master/docs/IWYUPragmas.md),
the most notable of which are:

- `IWYU pragma: keep` indicates the inclusion should not be removed from the
  main file
- `IWYU pragma: private` indicates that the current header is an implementation
  detail and another one should be included instead

Right now, only the `keep` pragma is implemented, `private` will be implemented
soon.

## Using Include Cleaner

To enable Include Cleaner, use the [configuration mechanism](/config). For
example, add the following to your configuration file to enable it globally:

```yaml
Diagnostics:
  UnusedIncludes: Strict
```

## Future plans and limitations

Include Cleaner is in the active development stage: there are several
limitations preventing us from enabling it by default but we expect to provide
the full experience in clangd 15.0.0 release.

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

### Canonicalization

The complete version of Include Cleaner will not only warn about unused
headers, but also provide a way to include used headers directly, not through a
chain of transitive includes.
