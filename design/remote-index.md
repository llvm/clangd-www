---
redirect_from: /remote-index
redirect_from: /remote-index.html
---
# Remote index

A [project-wide index](/design/indexing) can be slow to build, particularly
for large projects on slower machines like laptops. A "remote index" allows
a shared server to host the index instead.

## How it works

The remote index has three components:

- the **indexer** is a batch process that should run on a powerful machine.
  It parses all the code for your project, and produces an index file.
- the **server** exposes the index over a network. It loads the index file into
  memory, and exposes a [gRPC](https://grpc.io) service to query it.
- the **client** is part of clangd, which runs on the development machine.
  It connects to the server and requests information (such as the definition
  of a symbol) in real-time.

Each of these components are open-source and part of
[llvm/llvm-project/clang-tools-extra/clangd](https://github.com/llvm/llvm-project/tree/main/clang-tools-extra/clangd/).

## Indexer

`clangd-indexer` collects public symbols from headers (functions, classes,
types, etc). It's necessary to run the build system for your project first,
to produce `compile_commands.json` and possibly generate source files.

Running `clangd-indexer` is expensive and produced index is not incremental.
Usually the index is produced periodically and so is always slightly stale.

## Server

`clangd-index-server` is an RPC server that processes index requests. Clangd
issues requests to the server whenever it uses its global index (e.g. find
references request, index-based code completion).

The source code lives under different paths on different machines.
The `--project-root` flags specifies the source root on the indexer machine,
this prefix will be stripped. The client will add its own prefix as appropriate.

## Client

The client is compiled into clangd, and enabled when `Index.External.Server` is
set in the [user config](/config). A "mount point" must also be specified to
translate between local and remote paths.

The remote index cannot be enabled from project config for privacy reasons
(the client reveals information about the code being edited, and the project
config from the source code repository isn't sufficiently trusted).

## Building/releases

The client and server require the gRPC libraries.
Because of this dependency, they are not enabled by default in CMake.

To build remote-index-enabled `clangd` and `clangd-index-server`, you need:
 - gRPC libraries (e.g. `apt install libgrpc++-dev libprotobuf-dev
   protobuf-compiler-grpc` or `brew install grpc protobuf` or
   [build from source](https://github.com/grpc/grpc/blob/master/BUILDING.md))
 - to set the `-DCLANGD_ENABLE_REMOTE=On` and possibly `-DGRPC_INSTALL_PATH`
   CMake flags

The [clangd releases on GitHub](https://github.com/clangd/clangd/releases)
include remote index support, but official LLVM releases do not (yet).
