---
name: format-markdown
description: Format and style a Markdown file to the project's house style. Use when the user asks to "format", "clean up", "style", or "normalize" a Markdown (.md) file.
---

# Format a Markdown file

Apply these rules to the target `.md` file exactly. Edit the file in place; do not create a new one.

## Structure

1. Start the document with a single `#` H1 title. There must be exactly one H1, and it must be the first non-frontmatter line.
2. Do not skip heading levels (an `##` is never followed directly by an `####`).
3. Leave exactly one blank line between every block (heading, paragraph, list, code fence, table). No two consecutive blank lines.
4. End the file with a single trailing newline.
5. Preserve any YAML frontmatter (`---` … `---`) untouched at the very top.

## Text style

6. Style of title is `**bold**` and `_italic_`.
7. Use ATX headings (`#`), never Setext (`===` / `---` underlines).
7. Use `-` for unordered list bullets (never `*` or `+`), with two-space indentation per nesting level.
8. Use `1.` for every ordered list item and let Markdown renumber (do not hand-number `1. 2. 3.`).
9. Emphasis: `**bold**` and `_italic_`. Do not mix `__` or `*` styles.
10. Wrap inline code, file names, and identifiers in backticks.
11. Write link text descriptively — never "click here" or a bare URL when text is available.

## Code and tables

12. Fenced code blocks use triple backticks with a language tag (e.g. ```` ```ts ````). Never indent-based code blocks.
13. Align table columns with pipes and a header separator row; keep one space of padding inside each cell.

## Finish

14. Do not change the meaning of any content — only its formatting and style.
15. After editing, report a one-line summary of what was normalized (e.g. "Fixed heading levels, converted bullets to `-`, collapsed blank lines").
