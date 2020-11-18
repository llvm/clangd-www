# LLVM remote index service

We plan to provide [remote index](/remote-index.md) service for LLVM
developers, this document describes the details of this service.

We provide our best effort support for remote index service but it is not an
official product by either LLVM or Google.

**NOTE**: The service is currently in the alpha testing stage and we would
like to gradually expand the scope of availability and feature set.

## Overview

LLVM remote index service is implemented by the team maintaining clangd. We
plan to provide the service to LLVM developers to lower the entry bar for
developers with less powerful machines and make the development process more
accessible. The whole service implementation, including infrastructure, is
open source and publicly available
([clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote)
for `clangd-index-server` and client implementation,
[llvm-remote-index](https://github.com/clangd/llvm-remote-index) for
indexing, data pipelines and deployment). Google donated Google Cloud
Platform instance for us to run the service.

We index the whole LLVM codebase (`-DLLVM_ENABLE_PROJECTS="all"`) on a daily
basis, index snapshots are available in [clangd/llvm-remote-index
releases](https://github.com/clangd/llvm-remote-index/releases). We only
index the main branch of LLVM and check for the new idex version every 6
hours on the deployment server. The server also checks for new versions of
`clangd-index-server` which is fetched from [clangd/clangd
snapshots](https://github.com/clangd/clangd/releases). If you use LLVM remote
index service, we recommend also using clangd instance from these snapshots
to ensure compatibility with the server. We plan to avoid introducing
breaking changes between major LLVM releases but there was no major LLVM
release with remote index support so far so the compatibility layer is in
flux util then.

## Using the service

To use the service, you will need:

* Clangd with remote index feature support (more on how to get it in [Getting
  remote index support in clangd](/remote-index.md))
* Adding flags to clangd (either via CLI or [config file](/config.md)):
  `--remote-index-address` pointing to our server and `--project-root` ---
  absolute path pointing to the root of your `llvm-project` directory on your
  machine

## Privacy and security notice

Remote index service is offered for free to everyone on internet, mainly
benefiting people working on the open-source LLVM project. The service is run
on best-effort basis and this is not an official LLVM (or Google) product.

The source code we serve is the open source version of LLVM: we fetch the
sources from the [LLVM monorepo](https://github.com/llvm/llvm-project) main
branch and do not modify the sources in any way. The infrastructure we use
and the code we run is publicly available
([clangd/index/remote](https://github.com/llvm/llvm-project/tree/master/clang-tools-extra/clangd/index/remote)
for server and client implementation,
[llvm-remote-index](https://github.com/clangd/llvm-remote-index) for
indexing, data pipelines and deployment). Google generously donated the
funding for Google Cloud Platform instance we use, but this is a public
instance (same as any instance open source developers can use themselves) and
Google is not involved otherwise.

Requests from user contain some data from clangd instance such as the file
you are editing, (possibly incomplete) token before the cursor and other
index signals (the index requests and their contents can be seen in clangd
source code). We do not store any of this data and we do not store any data
about specific users: as soon as the request is complete we throw away the
data keeping only the aggregate statistics (request latencies, number of
requests, etc) and logs without any personal data to ensure service stability
and diagnose issues. As the result, personal data is not stored anywhere.
Aggregate data is used to track improve the state of the service, it is
available upon request.

We plan to provide this notice as well as the index file that is currently
used in our instance as the part of the service.
