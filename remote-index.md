# Remote index

A [project-wide index](/design/indexing.html) can be slow to build, particlarly
for large projects on slower machines like laptops. A "remote index" allows
a shared server to host the index instead.

## How it works

The remote index has three components:

- the **indexer** is a batch process that should run on a powerful machine.
  It parses all the code for your project, and produces an index file.
- the **server** exposes the index over a network. It loads the index file into
  memory, and exposes a [gRPC](https://grpc.io) service to query it.
- the **client** is part of clangd, which runs on your development machine.
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

## clangd client

The official LLVM releases do not yet include remote index support, but
unofficial weekly snapshots are available for common platforms.

You can also build from source. This requires more effort and time, so is
useful if you are interested in modifying or debugging the source code.

### Downloading latest release from GitHub

Weekly snapshots of clangd are available on GitHub [clangd/clangd
releases](https://github.com/clangd/clangd/releases). These binaries are
built with remote index support.

**NOTE**: Snapshots are marked as "pre-release" so the ["latest
release"](https://github.com/clangd/clangd/releases/latest) points to the
latest _major LLVM release_ (e.g. 11.0.0). Remote index is not enabled
in the major releases yet.

### Building from sources

In general you can follow the [LLVM instructions](https://llvm.org/docs/CMake.html)
to build `llvm-project` with CMake. You'll need the following CMake flags:

- `-DLLVM_ENABLE_PROJECTS=clang;clang-tools-extra` (to build clangd)
- `-DCLANGD_ENABLE_REMOTE=On` (remote index is off by default)

Remote index implementation depends on gRPC and Protobuf libraries. You'll
need to provide these dependencies either via [compiling gRPC from
sources](https://github.com/grpc/grpc/blob/master/BUILDING.md) or system
libraries (e.g. `apt install libgrpc++-dev libprotobuf-dev
protobuf-compiler-grpc` in Ubuntu and Debian, `brew install grpc protobuf` on
macOS). If your installation cannot be discovered by CMake automatically or
you want to use a custom installation, you can use `-DGRPC_INSTALL_PATH` to
tell CMake about a particular directory.

Once you have cmake set up, you can build the `clangd` target, and optionally
`clangd-index-server` and `clangd-indexer`.

## Using remote index feature

When using clangd with remote index support, you can specify the server to
connect to in two ways:

- [clangd configuration files](/config.html) (recommended)
- clangd flags `--remote-index-address` and `--project-root` (best for testing)

Either way, you'll need to specify a server address such as `127.0.0.1:50051`,
and the project root on your local machine, e.g. `/home/me/src/my-project/`.
The project root is used to translate paths from the server to your machine.

An unofficial test [service](/llvm-remote-index.html) is available for LLVM.
The [configuration scripts](https://github.com/clangd/llvm-remote-index) for
this service may be a useful starting point if you want to host an index.
