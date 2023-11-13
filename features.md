# Features

Here is what clangd can do for you.
Screenshots show [VSCode](https://code.visualstudio.com/); the available
features and UI will depend on your editor.

{% include toc.md %}

## Errors and warnings

clangd runs the clang compiler on your code as you type, and shows diagnostics
of errors and warnings in-place.

![screenshot: clang errors](screenshots/errors.png)

(Some errors are suppressed: diagnostics that require expanding templates in
headers are disabled for performance reasons).

### Fixes

The compiler can suggest fixes for many common problems automatically, and
clangd can update the code for you.

![screenshot: apply fix](screenshots/apply_fix.gif)

If a missing symbol was seen in a file you've edited recently, clangd will
suggest inserting it.
{:.v9}

![screenshot: include-fixer fix](screenshots/include_fixer_fix.png)

### clang-tidy checks
{:.v9}

clangd embeds [clang-tidy](https://clang.llvm.org/extra/clang-tidy/) which
provides extra hints about code problems: bug-prone patterns, performance traps,
and style issues.

![screenshot: apply clang-tidy fix](screenshots/apply_clang_tidy_fix.gif)

clangd respects your project's `.clang-tidy` file which controls the checks to
run. Not all checks work within clangd.


## Code completion

You'll see suggestions as you type based on what methods, variables, etc are
available in this context.

![screenshot: code completion](screenshots/code_completion.png)

Abbreviating words may help you find the right result faster. If you type in
`camelCase` but the function you're looking for is `snake_case`, that's OK.

### Namespace and include insertion
{:.v8}

clangd will sometimes suggest results from other files and namespaces. In this
case the correct qualifier and `#include` directive will be inserted.

![screenshot: code completion insert ns](screenshots/code_completion_insert_ns_qualifiers.gif)

### Signature help

Some editors will show you the parameters of the function you're calling, as
you fill them in.

![screenshot: signature help](screenshots/signature_help.gif)

## Cross-references

These features let you navigate your codebase.

They work across the files you've opened.
{:.v7}

clangd will also automatically index your whole project.
{:.v9}

### Find definition/declaration

Jump to the definition or declaration of a symbol under the cursor.

![screenshot: go to def](screenshots/go_to_def.gif)

(Some editors only expose "find definition" - hit it again to jump to the
declaration).
{:.v9}

This also works on #include lines, to jump to the included file.

### Find references

Show all references to a symbol under the cursor.

![screenshot: find references](screenshots/find_all_refs.gif)

Some editors will automatically highlight local references to the selected
symbol as you move around a file.

## Navigation

clangd informs the editor of the code structure in the current file.
Some editors use this to present an outline view:

![screenshot: outline](screenshots/outline.png)

In VSCode, this also allows jumping to a symbol within the current file.

Searching for symbols within the scope of the whole project is also possible.

![screenshot: navigation](screenshots/navigation.gif)

## Hover
{:.v10}

Hover over a symbol to see more information about it, such as its type,
documentation, and definition.

![screenshot: hover](screenshots/hover.png)

Hovering over `auto` will show the underlying type.

## Formatting

clangd embeds [clang-format](https://clang.llvm.org/docs/ClangFormat.html),
which can reformat your code: fixing indentation, breaking lines, and reflowing
comments.

![screenshot: format selection](screenshots/format_selection.gif)

clangd respects your project's `.clang-format` file which controls styling
options.

Format-as-you-type is experimental and doesn't work well yet.

## Refactoring

### Rename

Rename a symbol under the cursor. All usages of the symbol will be renamed,
including declaration, definition and references.

![screenshot: rename](screenshots/rename.gif)

Most symbols are renameable, such as classes, variables, functions and methods.

Renaming a symbol will affect usages of the name across the project.
{:.v11}

Known limitations

- References in templates and macro bodies may not be renamed (difficult to
  analyze in general)
- References in comments and disabled preprocessor sections are not yet renamed
- Related symbols (e.g. overriden methods in a class hierarchy) are not yet renamed
- Renaming symbols used in several files uses the [project index](design/indexing), and works best when it is up-to-date

> TIP: the rename workflow highly depends on the editor you are using. Some
> editors, e.g. VSCode, provide a way to preview the rename changes before
> applying them; while some just apply the changes directly.
{:.tip}

## Semantic Highlighting

clangd computes semantic highlight tokens to enhance the source code theming. {:.v9}

![screenshot: highlight](screenshots/semantic_highlight.png)

A token may be associated with one highlight kind and multiple highlight modifiers, as defined by the following section.

### Kinds

clangd supports following standard LSP token kinds:

| Kind              | LSP Name      | Since Version | Note                       
|-------------------|---------------|---------------|--------------------------
| Variable          | variable      | 9             |                          
| LocalVariable     | variable      | 9             |                          
| StaticField       | variable      | 9             |                          
| Parameter         | parameter     | 9             |                          
| StaticMethod      | function      | 9             |                          
| Function          | function      | 9             |                          
| Method            | method        | 9             |                          
| Field             | property      | 9             |                          
| Class             | class         | 9             |                          
| Interface         | interface     | 12            | Objective-C only         
| Enum              | enum          | 9             |                          
| EnumConstant      | enumMember    | 9             |                          
| Type              | type          | 12            |                          
| Typedef           | type          | 9             |                          
| Primitive         | type          | 9             |                          
| TemplateParameter | typeParameter | 9             |                          
| Namespace         | namespace     | 9             |                          
| Macro             | macro         | 9             |                          
| Modifier          | modifier      | 16            | `override`/`final`       
| Operator          | operator      | 15            | Including `new`/`delete` 
| Bracket           | bracket       | 15            | All `()[]{}`             
| Label             | label         | 15            |                          

On top of that, as an extension, clangd supports following additional token kinds:

| Kind         | LSP Name     | Since Version | Note                           
|--------------|--------------|---------------|--------------------------------
| Unknown      | unknown      | 12            | Dependent names                
| Concept      | concept      | 12            |                                
| InactiveCode | inactiveCode | 11            | Inactive preprocessor branches

### Modifiers

clangd supports following standard LSP token modifiers:

| Modifier       | LSP Name       | Since Version | Note
|----------------|----------------|---------------|----------------------
| Declaration    | declaration    | 12            |
| Definition     | definition     | 16            |
| Deprecated     | deprecated     | 12            |
| Readonly       | readonly       | 12            |
| Static         | static         | 12            |
| Abstract       | abstract       | 12            | For abstract methods
| DefaultLibrary | defaultLibrary | 13            | From standard library

On top of that, as an extension, clangd supports following additional token modifiers:

| Modifier                | LSP Name                | Since Version | Note
|-------------------------|-------------------------|---------------|----------------------------
| Deduced                 | deduced                 | 12            | For `auto`
| Virtual                 | virtual                 | 13            |
| DependentName           | dependentName           | 12            |
| UsedAsMutableReference  | usedAsMutableReference  | 14            | Mutable reference argument    
| UsedAsMutablePointer    | usedAsMutablePointer    | 15            | Mutable pointer argument 
| ConstructorOrDestructor | constructorOrDestructor | 15            | ctor/dtor name 
| UserDefined             | userDefined             | 15            |
| FunctionScope           | functionScope           | 12            |
| ClassScope              | classScope              | 12            |
| FileScope               | fileScope               | 12            |
| GlobalScope             | globalScope             | 12            |