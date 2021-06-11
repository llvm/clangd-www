This guide tries to explain how clangd finds system headers while providing its
functionality. It aims to provide users with enough understanding to resolve any
issues around these headers being missing.

{% include toc.md %}

# What are system headers ?

In the context of this guide, any header a project depends on but doesn't exist
in the repository is considered a system header. These usually include: -
Standard library, e.g: `<iostream>` - Third party libraries, e.g: `boost` -
Posix, e.g: `<pthread.h>` - Compiler's built-in headers, e.g: `<stddef.h>`

These headers are usually provided either by a custom toolchain, which might be
part of the repository, or directly via system installed libraries.

Clangd itself only ships with its own built-in headers, because they are tied to
the version of clang embedded in clangd. The rest (including C++ STL) must be
provided by your system.

# How clangd finds those headers

`Clangd` comes with an embedded `clang` parser. Hence it makes use of all the
mechanisms that exist in clang for lookups, while adding some extra spices to
increase chances of discovery on Mac environemnts. Here follows some information
about what clang does.

## Search directories mentioned with compile flags

As most other compilers clang provides some command line flags to control system
header search explicitly. Most important of these is `-isystem`, which adds a
directory to system include search path.

Best way to ensure clangd can find your system includes is by putting the
directories to be searched into your compile flags via `-isystem`. You can
achieve this with
[compile\_flags.txt](https://clang.llvm.org/docs/JSONCompilationDatabase.html#alternatives),
[compile\_commadns.json](https://clang.llvm.org/docs/JSONCompilationDatabase.html)
or a
[clangd configuration file](http://clangd.llvm.org/config.html#compileflags).

You might also want to take a look at
[-isysroot](https://clang.llvm.org/docs/ClangCommandLineReference.html#cmdoption-clang-isysroot-dir),
[-system-header-prefix](https://clang.llvm.org/docs/ClangCommandLineReference.html#cmdoption-clang-system-header-prefix)
and
[env variables](https://clang.llvm.org/docs/CommandGuide/clang.html#envvar-C_INCLUDE_PATH,OBJC_INCLUDE_PATH,CPLUS_INCLUDE_PATH,OBJCPLUS_INCLUDE_PATH)
respected by clang.

## Heuristic search for system headers

Clang performs some
[toolchain specific searches](https://github.com/llvm/llvm-project/tree/main/clang/lib/Driver/ToolChains/)
to find suitable directories for system header search. The heuristics used by
most of these search algorithms primarily rely on the **directory containing the
clang driver** and **the target triple**.

You can investigate this search by invoking any clang with `-v`, for example
`clang -v -c -xc++ /dev/null` (you can replace `/dev/null` with `nul` on
windows). This prints out:

```
...
Found candidate GCC installation: /usr/lib/gcc/x86_64-linux-gnu/10
Found candidate GCC installation: /usr/lib/gcc/x86_64-linux-gnu/8
Found candidate GCC installation: /usr/lib/gcc/x86_64-linux-gnu/9
Selected GCC installation: /usr/lib/gcc/x86_64-linux-gnu/10
...
ignoring nonexistent directory "/usr/lib/gcc/x86_64-linux-gnu/10/../../../../x86_64-linux-gnu/include"
ignoring nonexistent directory "/include"
#include "..." search starts here:
#include <...> search starts here:
 /usr/lib/gcc/x86_64-linux-gnu/10/../../../../include/c++/10
 /usr/lib/gcc/x86_64-linux-gnu/10/../../../../include/x86_64-linux-gnu/c++/10
 /usr/lib/gcc/x86_64-linux-gnu/10/../../../../include/c++/10/backward
 /usr/lib/clang/13.0.0/include
 /usr/local/include
 /usr/include/x86_64-linux-gnu
 /usr/include
End of search list.
```

Directories after `#include <...> search starts here` includes all the
directories that will be used for system header search.

### Directory of the driver

These heuristics often expect the standard library to be found near the
compiler. Therefore clangd needs to know where the compiler is, especially when
using a custom toolchain.

Clangd makes use of the first argument of the compile flags as the driver's
path. Ideally this argument should specify full path to the compiler.

For example, for an entry like: `{ "directory": "/home/user/llvm/build",
"command": "/usr/bin/clang++ -c -o file.o file.cc", "file": "file.cc" },` First
argument is `/usr/bin/clang++`.

Note that, in case of a `compile_flags.txt` driver name defaults to `clang-tool`
sitting next to `clangd` binary.

### Target Triple

The second important factor is target triple. It can be explicitly specified
with `--target` compile flag or can be deduced implicitly from the driver name.

This enables `clang` to operate using different toolchains, for example with
`--target=x86_64-w64-mingw32` clang will look for mingw installed headers, which
is one common toolchain for windows. You can see its effects on the header
search dirs by executing `clang --target=x86_64-w64-mingw32 -xc++ -v -c
/dev/null` (and without the target info).

This can also be achieved by implicitly including target information in the
driver name, but is a lot more subtle and there are no good ways to change it
anyway. So this guide doesn't go into much details about it, but you can find
more
[here](https://github.com/llvm/llvm-project/blob/de79919e9ec9c5ca1aaec54ca0a5f959739d48da/clang/include/clang/Driver/ToolChain.h#L286).

## Query-driver

Instead of trying to guess the header search paths, clangd can also try to query
the actual compiler. For example if your compile flags has `/custom/compiler` as
the driver name, clangd will run something similar to `/custom/compiler -E -xc++
-v /dev/null` and parse its output.

Note that this is a mechanism that solely exists in clangd and has nothing to do
with clang.

It can be used as a last resort when clang's heuristics are not enough to detect
standard library locations being used by your custom toolcahin.

Since it implies executing arbitrary binaries, that might be checked-in with the
project, clangd does not perform this inference automatically. You need to
allowlist binaries you deem safe for execution using `--query-driver` **clangd**
command line option. Please note that this option is just an allowlist and the
real driver to be executed still comes from the compile command. It is a list of
comma separated globs and a driver from a compile command needs to match at
least one of these globs. For example to whitelist drivers in paths:

-   `/path/to/my/project/arm-gcc`
-   `/path/to/my/project/arm-g++`
-   `/path/to/other/project/gcc`

You can pass
`--query-driver="/path/to/my/project/arm-g*,/path/to/other/project/gcc"` into
clangd. You can find details about changing clangd arguments used by your editor
in [here](https://clangd.llvm.org/installation#editor-plugins), but it is always
best to check your editor/LSP client's documents directly.

# Fixing missing system header issues

Since we've established some basic understanding of how system header search
works for clang and clangd. Now let's talk about how to fix missing system
header issues.

## Headers not present in the system at all

As mentioned above, clangd doesn't ship with its own standard library. If you
can build the project you are working on the same machine you are using clangd,
you probably have the headers you need on your system but clangd is failing to
find them, so you can just skip this section.

If you know your system lacks one, you should get it from some place suitable
for your platform. Unfortunately this document is not the best place to talk
about choices or how to get them but here are some choices:

-   `libc++-dev` or `libstdc++-dev` packages on debian-like systems,
-   `mingw` for windows,
-   `libc++` or `libstdc++` for mac, either through `brew` or `XCode`.

After getting the headers clangd should hopefully be able to detect them,
assuming they are not installed to a non-default location.

## You can build your project but clangd is complaining about missing headers

In such a case you can start by checking your clangd logs to see compile flags
being used by clangd. Easiest way to achieve this is by executing `clangd
--check=/path/to/a/file/in/your/project.cc`. Outputs logs should contain
something like:

```
I[17:11:57.203] Compile command from CDB is: ...
I[17:11:57.206] internal (cc1) args are: -cc1 ...
```

If you are seeing a log line containing `Generic fallback command is` instead of
the one above, it means clangd is not able to pick your compile commands. If you
don't have any
[compilation database](https://clangd.llvm.org/installation.html#project-setup),
it is expected. But otherwise you should fix that first.
<!--- FIXME: Add a link to compilation database discovery doc. -->

You should first try executing the command from CDB to see if it can compile
your file. If it can't, it means you have problems with your compile command
again and probably there's a discrepancy between what your build system uses and
what's being fed into clangd.

## Compile command provided to clangd works on its own

There are usually two reasons for this failure. Either driver mentioned in the
compile command is relative or it is employing custom heuristics unknown to
clang.

### Relative driver name

As mentioned above most of the clang's heuristics rely on the location of the
driver. If clangd cannot figure out the absolute path for your driver, then all
those relative search heuristics will fail.

The best option here is changing the driver name in your CDB to use absolute
path rather than relative paths. Other than that you can also try putting the
directory containing your driver into `$PATH` so clangd can make it absolute
itself.

### Your driver has heuristics unknown to clang

This is the worst scenario to hit, and unfortunately is common for custom
toolchains targetting embedded devices.

You can execute the driver with `-v` option to see all the search directories it
has found and the target triple being used. Afterwards there are a couple
options:

-   Explicitly providing target triple in your compile flags and hope that
    clang's heuristics can work out the rest.
-   Add each system header search path to your compile flags via `-isystem` or
    env variables as mentioned above. Note that you might need to disable
    clang's search for system headers using
    [-nostdlibinc](https://clang.llvm.org/docs/CommandGuide/clang.html#cmdoption-nostdlibinc)
    and variants.
-   Using clangd's `--query-driver` option to let clangd infer target triple and
    system headers by executing the driver mentioned in the compile flags.
-   If it feels like your driver is actually performing a generic heuristic,
    send a patch to clang to improve it for all!
