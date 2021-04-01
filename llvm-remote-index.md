# LLVM remote index service

A clangd [remote index](/remote-index.html) server for the [LLVM
project](https://github.com/llvm/llvm-project) is currently available.

To use it, you'll need clangd with remote-index support. Set the server address
to `clangd-index.llvm.org:5900`, and the project root to your `llvm-project`
directory. One way of doing it would be putting this under
`~/.config/clangd/config.yaml`:

```yaml
If:
  PathMatch: /path/to/llvm/.*
Index:
  External:
    Server: clangd-index.llvm.org:5900
    MountPoint: /path/to/llvm/
```

For more details on remote index configuration, see [remote
index](/remote-index.html).

## Overview

The service is provided to make development of LLVM on less powerful machines
easier and make the development process more accessible. The whole service
implementation, including infrastructure, is open source and publicly
available:

* [clangd/index/remote](https://github.com/llvm/llvm-project/tree/main/clang-tools-extra/clangd/index/remote):
  `clangd-index-server` and client implementation
* [llvm-remote-index](https://github.com/clangd/llvm-remote-index):
  indexing, data pipelines and deployment scripts

The service is hosted on GCP by clangd team, with sponsorship of Google.

The whole [`llvm-project`](https://github.com/llvm/llvm-project) codebase
is indexed daily (`main` branch, `-DLLVM_ENABLE_PROJECTS="all"`).
Index snapshots are published as [clangd/llvm-remote-index
releases](https://github.com/clangd/llvm-remote-index/releases) and the index
server periodically fetches the newest data.

## Privacy and security notice

This index service is offered for free to all developers, and is mostly useful
to people working on the open-source LLVM project. The service is run on a
best-effort basis. Google donated the funding for Google Cloud Platform
instance that is used, but it is a public instance running and serving
unmodified LLVM code.

The requests clangd sends to server contain information about the code such as
the file path you are editing, partial token before the cursor and other
index signals. Request details:
[`Index.proto`](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/index/remote/Index.proto)
and
[`Service.proto`](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/index/remote/Service.proto)
This data is needed to provide index results, is discarded after serving the
request, and is not stored.

Basic anonymous request information is logged to observe service level:
 - request type (e.g. "lookup")
 - success/failure
 - number of results returned
 - latency

