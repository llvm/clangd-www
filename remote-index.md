# Remote index

## How it works

Remote index works in two separate components, an indexing pipeline and a
serving infrastructure. The former produces monolithic index file for a
project of interest and the latter serves information from a monolithic index
file to clangd clients using a [gRPC](https://grpc.io/)-based server.

## Indexing pipeline

Indexing pipeline uses `clangd-indexer` under the hood and collects symbols
that can be exported from headers (functions, classes, types, etc). Running
`clangd-indexer` is expensive and produced index is not incremental, so using
the remote index most likely results in a stale index that is periodically
updated on the server.

## Serving Infrastructure

`clangd-index-server` is an RPC service that processes index requests. Clangd
forwards requests to the server whenever it requires global index (e.g. find
references request, index-based code completion). Because the serving machine
paths to the source files are different from the client machine, portability is
achieved by stripping local project prefix of the serving machine and replacing
it with local project prefix (`--project-root` flag).

Remote index implementation is open source and you can find the code at
[clang-tools-extra/clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote).

There's a non-official test [service](./llvm-remote-index.md) for LLVM. Code
and configurations for the service can be found at
[clangd/llvm-remote-index](https://github.com/clangd/llvm-remote-index). That
repo is aimed to be a sample and common ground for clangd remote-index-server
instances, so feel free to fork and modify it to your needs, or contribute
any functionality that you think might be useful to others.

## Getting remote index support in clangd

As of today, you either need to build clangd from sources or use one of the
unofficial snapshots at [clangd/clangd
releases](https://github.com/clangd/clangd/releases).

If you just want to use clangd with remote index support, downloading weekly
releases might be easier. As building from sources usually requires a lot
more resources and configuration, and doesn't provide much value if you are
not planning to edit the source code.

### Downloading latest release from GitHub

Weekly snapshots of clangd are available on GitHub [clangd/clangd
releases](https://github.com/clangd/clangd/releases). These binaries are
built with remote index support, so you can directly use those.

**NOTE**: Snapshots are marked as "pre-release" so the [latest
release](https://github.com/clangd/clangd/releases/latest) points to the
latest _major LLVM release_ (e.g. 11.0.0). Remote index feature is not enabled
in the major releases we provide yet but we plan to do that in the future.

### Building from sources

Remote index support for clangd is turned off by default, so you need to
provide `-DCLANGD_ENABLE_REMOTE=On` in addition to your standard [LLVM
setup](https://llvm.org/docs/CMake.html).

Remote index implementation depends on gRPC and Protobuf libraries. You'll
need to provide these dependencies either via [compiling gRPC from
sources](https://github.com/grpc/grpc/blob/master/BUILDING.md) or system
libraries (e.g. `apt install libgrpc++-dev libprotobuf-dev
protobuf-compiler-grpc` in Ubuntu and Debian, `brew install grpc protobuf` on
macOS). If your installation cannot be discovered by CMake automatically or
you want to use a custom installation, you can use `-DGRPC_INSTALL_PATH` to
tell CMake about a particular directory.

## Using remote index feature

After getting a clangd with remote index support, you can provide server
configuration via command line flags or config files. You can find more
details about config files [here](/config.md). Necessary command line flags
are:

- `--remote-index-address` which is the address:port of the server, e.g.
  `127.0.0.1:50051`.
- `--project-root` absolute path for the project source root on local
  machine, e.g. `$HOME/src/llvm-project/`. This is used to convert relative
  paths provided by server into absolute paths on the local machine.
