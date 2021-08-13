## [clangd.llvm.org](https://clangd.llvm.org/)

This is the **source code** of clangd's website.

The website itself can be found at https://clangd.llvm.org/.

## I'm in the right place, how do I build the docs?

The docs are built and published by pushing to this repository (Github Pages).
Usually you won't need more than GitHub's markdown preview feature.

But if you're changing layout, and want to see exactly what it will look like,
you can run jekyll locally.

```
apt-get install rubygems ruby-dev # or similar
gem install github-pages
jekyll serve
```

The instance at http://localhost:4000/ will refresh when you edit any file.
