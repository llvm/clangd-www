# LLVM remote index service

There's currently a test instance of clangd remote-index for LLVM project at
`llvm.clangd-index-staging.dev`. The service is maintained at best effort,
and is not an official LLVM product.

After getting a clangd with remote-index support as described in
[here](./remote-index.md#getting-remote-index-support-in-clangd), you can
point it at `llvm.clangd-index-staging.dev:50051` either through
[config](./config.md) or [command line
flags](./remote-index.md#using-remote-index-feature).

## Overview

The service is provided to make development of LLVM on less powerful machines
easier and make the development process more accessible. The whole service
implementation, including infrastructure, is open source and publicly
available:

* [clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote):
  `clangd-index-server` and client implementation
* [llvm-remote-index](https://github.com/clangd/llvm-remote-index) for
  indexing, data pipelines and deployment scripts

The service is hosted on GCP by clangd team, with sponsorship of Google.

Whole LLVM codebase (`-DLLVM_ENABLE_PROJECTS="all"`) is indexed on a daily
basis, index snapshots are available in [clangd/llvm-remote-index
releases](https://github.com/clangd/llvm-remote-index/releases). We only
index the main branch of LLVM and check for the new idex version every 6
hours on the deployment server. The server also checks for new versions of
`clangd-index-server` which is fetched from [clangd/clangd
snapshots](https://github.com/clangd/clangd/releases).

## Privacy and security notice

Remote index service is offered for free to everyone on internet, mainly
benefiting people working on the open-source LLVM project. The service is run
on best-effort basis and this is not an official LLVM product.

Source code that is served is the open source version of LLVM: sources from
the [LLVM monorepo](https://github.com/llvm/llvm-project) main branch are
fetched without any modifications. The infrastructure used and the code being
run is publicly available
([clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote)
for server and client implementation,
[llvm-remote-index](https://github.com/clangd/llvm-remote-index) for
indexing, data pipelines and deployment). Google generously donated the
funding for Google Cloud Platform instance that is used, but it is a public
instance (same as any instance open source developers can use themselves).

Requests from user contain some data from clangd instance such as the file
you are editing, (possibly incomplete) token before the cursor and other
index signals. Full description of transferred data is
[`Index.proto`](https://github.com/llvm/llvm-project/blob/master/clang-tools-extra/clangd/index/remote/Index.proto)
and
[`Service.proto`](https://github.com/llvm/llvm-project/blob/master/clang-tools-extra/clangd/index/remote/Service.proto)
files. No data is stored longer than needed and no user-specific data is
stored at all: as soon as the request is complete we throw away the data
keeping only the aggregate statistics (request latencies, number of requests,
etc) and logs without any personal data to ensure service stability and
diagnose issues. As the result, personal data is not stored anywhere.
Aggregate data is used to track improve the state of the service, it is
available upon request. Here is the
[Dockerfile](https://github.com/clangd/llvm-remote-index/blob/master/deployment/Dockerfile)
we use for running the service and [logging
implementation](https://github.com/llvm/llvm-project/blob/master/clang-tools-extra/clangd/index/remote/server/Server.cpp).
