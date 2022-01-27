---
redirect_from: /llvm-remote-index
redirect_from: /llvm-remote-index.html
---
# Using a remote index

Usually clangd will build an [index](/design/indexing) of your project in the
background. For large projects, this can be slow.

If someone has set up a clangd index server for your project, then you can query
this central index instead of building your own.

## Obtaining a suitable version of clangd

You need a remote-index-enabled version (12 or later) of clangd, such as
[the latest clangd release on github](https://github.com/clangd/clangd/releases/latest).

The official LLVM releases and Debian etc packages of clangd 12 are not
remote-index-enabled!

(If building clangd from source, you need `-DCLANGD_ENABLE_REMOTE=On` in CMake).

## Configuring clangd to use the remote index

You'll need the address of the server you want to connect to, and the local
source code it matches.

In your [user configuration](/config), add a section like:

```yaml
If:
  PathMatch: /path/to/code/.*
Index:
  External:
    Server: someserver:5900
    MountPoint: /path/to/code/
```

## What to expect

After restarting clangd, it should no longer want to index your whole project,
and you should get complete results for find-references etc.

Results may not be entirely up-to-date. Index servers usually scan the
project once a day, and if you're working on a branch you may get further skew.
Files that you've had open will still be indexed locally and will be up-to-date.

Queries to the index server may reveal information about the code you're editing
(e.g. partial identifiers). Public servers should have a privacy policy.

## Public index servers

Some open-source projects have public servers:

- [LLVM](http://clangd-index.llvm.org/): `clangd-index.llvm.org:5900`
- [Chromium](https://linux.clangd-index.chromium.org/): `linux.clangd-index.chromium.org:5900` (`linux` can instead be `chromeos`/`android`/`fuchsia`/`chromecast-linux`/`chromecast-android`)

## Running up an index server

This is a little more involved, and you'll want to understand the
[design of the remote index](/design/remote-index). In short:

 - you should periodically check out and index your project with a command like
   `clangd-indexer --executor=all-TUs /proj/compile_commands.json > proj.idx`
 - run the server as `clangd-index-server proj.idx /proj`. It listens on port
   50051 by default, and reloads the index file when it is overwritten.

The `clangd-indexer` and `clangd-index-server` tools can be found in
`clangd_indexing_tools.zip` on the
[release page](https://github.com/clangd/clangd/releases/latest).

[clangd/llvm-remote-index](https://github.com/clangd/llvm-remote-index) is an
example of a production-ready instance, with the indexing step running on
GitHub Actions and the server running on Google Compute Engine.
