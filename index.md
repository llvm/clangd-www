# What is clangd?

clangd understands your C++ code and adds smart features to your editor:
code completion, compile errors, go-to-definition and more.

`clangd` is a _language server_ that can work with many editors via a plugin.
Here's Visual Studio Code with the clangd plugin, demonstrating code completion:

![Code completion in VSCode](screenshots/basic_completion.png)

clangd is based on the [Clang](https://clang.llvm.org) C++ compiler, and is part
of the [LLVM](https://llvm.org) project.
