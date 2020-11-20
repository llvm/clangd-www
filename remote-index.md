# Remote index

## How it works

Remote index uses the global static index built with `clangd-indexer` under
the hood and replaces local static and background indices (see
[indexing](/design/indexing.md) for more details on those) by separating
index into a separate service clangd can connect to. The index inside the
service contains all public symbols in the processed project.
`clangd-index-server` is an RPC service that processes index requests
(index-based code completion, references, etc). Clangd instance connects to
it and forwards requests to index server whenever global index is needed.
Unlike background index, remote index server does not rebuild the index
incrementally and automatically --- it just serves the given one, so it would
most likely be more outdated than usually. This problem is solved by manually
rebuilding the whole static index (`clangd-indexer` can not update existing
one incrementally yet) and replacing the file on disk: `clangd-index-server`
watches index file updates and will use hot-reloading to ensure no-downtime
index update.

Remote index implementation is open source and you can locate the code at
[clang-tools-extra/clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote).

We also plan to provide [remote index service](/llvm-remote-index.md) for
LLVM developers. You can find serving and indexing infrastructure code in
[llvm-remote-index](https://github.com/clangd/llvm-remote-index) and modify
it according to your own needs for hosting the server for your project.

## Getting remote index support in clangd

There are two primary ways getting clangd binaries with remote index support:
GitHub releases and building from sources. We investigate possibilities of
adding remote index support to official binaries provided by LLVM and system
packages but it's not available there yet.

### Downloading latest release from GitHub

We provide weekly snapshots of clangd through GitHub [clangd/clangd
releases](https://github.com/clangd/clangd/releases). The binaries we build
have remote index feature so you can download the latest weekly snapshot.

**NOTE**: Snapshots are marked as "pre-release" so the [latest
release](https://github.com/clangd/clangd/releases/latest) points to the
latest _major LLVM release_ (e.g. 11.0.0). Remote index feature is not enabled
in the major releases we provide yet but we plan to do that in the future.

### Building from sources

If you just want to use clangd with remote index support, please download
already compiled binaries. Building from sources is for developing and
improving the state of remote index feature since it's more complicated and
requires more steps.

Building clangd with remote index feature requires a couple more steps on top
of the standard build within LLVM. The implementation depends on gRPC and you
need it to build Clangd with remote index support. There are two ways of
getting gRPC: compiling from sources and installing system packages.
Compiling from sources is strongly preferred because we encounter issues with
system-provided package versions. A version that works and is used in our
buildbots and clangd releases is 1.33.2.

Here is the guide on how to build gRPC from sources:
[instructions](https://github.com/grpc/grpc/blob/master/BUILDING.md).
[Install after
build](https://github.com/grpc/grpc/blob/master/BUILDING.md#install-after-build)
and pass `-DCLANGD_ENABLE_REMOTE=On -DGRPC_INSTALL_PATH=/path/to/grpc` to the
CMake invocation.

If you want to use system libraries, please install gRPC and Protobuf with
their headers (e.g. `apt install libgrpc++-dev libprotobuf-dev
protobuf-compiler-grpc` in Ubuntu and Debian, `brew install grpc protobuf` on
macOS) and pass `-DCLANGD_ENABLE_REMOTE=On` to the CMake invocation.

## Using remote index feature

To use remote index feature, you need to get clangd with remote index support
and add the following flags to clangd invocation: `--remote-index-address`
pointing to the address the server is running on (e.g. `0.0.0.0:50051` if
you're running it locally) and `--project-root` which is the _absolute path_
where the sources of the project you are working on are stored (e.g.
`/home/$USER/src/llvm-project/`).

The above means that you would have to add these flags only for the project
you want to use remote index in and manually add and remove them each time
you move to a different project which is not very convenient. We plan to
support remote index flags in the [configuration file](/config.md) which will
allow to point to different remote index servers depending on the project you
are working on.
