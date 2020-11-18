# Remote index

## Motivation

Clangd uses global idex for code completion, navigation and other useful
features. Global index is typically generated automatically by background
index at Clangd startup and kept fresh or manually by `clangd-indexer` (see
[indexing](design/indexing.md) for more information). For large projects
(e.g. LLVM and Chromium) index takes a long time to build (3-4 hours on
powerful very machines for Chrome-sized project) and induces a large memory
overhead (up to 6GB on RAM) to serve within clangd.

We want to improve user experience to for developes of large projects. Hence,
we introduce remote index: a feature that allows serving index on a separate
machine and connecting to this index from your device. This means you don't
have to build the index yourself anymore, clangd will use significantly less
memory on the machine you are working on. You can work from your laptop or
just a machine not powerful enough to process the whole codebase you work on
and still get all clangd features that rely on indexing the whole project.

Remote index feature is in beta now and you can expect minor bugs and
changes. If you encounter any problems or have any questions, please reach
out to us through Bug Tracker, Forum or Chat. Your feedback helps us polish
the feature and make it more useful for developers using clangd.

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

## How it works

Remote index uses the global static index built with `clangd-indexer` under
the hood and replaces local static and background indices (see
[indexing](/design/indexing.md) for more details on those). It contains all
public symbols in the indexed project. The server (`clangd-index-server`
instance) loads the index file and provides RPC service for the index
requests (index-based code completion, references, etc). Clangd instance
connects to it and forwards requests to index server whenever global index is
needed. Unlike background index, remote index server does not rebuild the
index incrementally and automatically - it just serves the given one, so it
would most likely be more outdated. This problem is solved by manually
rebuilding the whole static index (`clangd-indexer` can not update existing
one incrementally yet) and replacing the file on disk: `clangd-index-server`
watches index file updates and will use hot-reloading to ensure no-downtime
index update.

Our whole implementation is open source and you can browse the code at
[clang-tools-extra/clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote).

## Hosting the server

If you would like to host the server for your project and share it with the
developers, you should consider implementing infrastructure required to run
the server and provide an up-to-date index version. Essentially, what you
need providing a connection to `clangd-index-server` instance running
somewhere and the supporting infrastructure to keep the index relatively
up-to-date automatically. Developers working on your project would connect
to the remote index server using `--remote-index-address` flag in their clangd
invocation.

The first thing you would need is the indexing job. Here's what it looks
like:

* Fetch the latest version of source code
* Invoke build system tooling with the correct configuration to produce
  generated files and the compilation database (`compile_commands.json`)
* Run `clangd-indexer` to build static index

And the data flow to assemble everything together might look like this:

* Continuously check for newer source code version, if there is one --- run
  indexing job, or simply do that periodically (every day/every N hours)
* After the indexing job builds the index push it to the storage and tag it
  with the latest version
* On the server side, continuously check for new index versions in the storage.
  As soon as the new index version is available, replace index file to allow
  `clangd-index-server` hot-reloading the index.

If you want to host remote indexing service for your project, please do not
hesitate to reach out to us for assistance or any questions.

### Remote index for LLVM

We provide a reference implementation of described pipeline for the LLVM
project, which clangd is a part of. Our version of the pipeline uses GitHub
Actions to fetch and index LLVM sources and deploys into Google Cloud. You
can find code in
[llvm-remote-index](https://github.com/clangd/llvm-remote-index) and modify
it to fit the needs of your project.

If you want to use remote index for LLVM or if you're interested in the
details of the service, please see [LLVM remote index
service](/llvm-remote-index.md).
