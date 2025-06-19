# 📘 Blacktokki Notebook User Guide

**Blacktokki Notebook** is a markdown-based tool for knowledge and time management. Users can freely create, structure, and track notes over time. It is optimized for both mobile and web environments, making it suitable for self-directed learning, work documentation, knowledge archiving, and schedule-based reflection.

## Key Features

* ✅ Freely write notes using a markdown editor
* 📁 Organize content hierarchically using folders and sub-notes
* 🧭 Automatically generated tree view for quick navigation based on headings
* 🔍 Advanced search across titles, sections, links, and keywords
* 🔁 Move specific sections to other notes
* 📆 Automatically detect dates and visualize them as timer bars
* 🧠 Use autocomplete to quickly insert links and child notes
* 🧳 Export and import notes in Markdown format

---

## Getting Started

### 🔍 Searching and Creating Notes

* Use the top search bar to find existing notes or create new ones
* Enter a new title and press `Enter` to automatically create and open the note

### ✏️ Editing Notes

* Use the markdown-based editor to write and format content
* Autocomplete triggers:

  * `[title` → internal note links
  * `http` → external link previews

---

## Screen-by-Screen Guide

### 🏠 Home

* The main screen that appears upon launch
* Provides quick access to recently viewed notes, issue notes, and the timeline
* On mobile, access main menus via the bottom tab; on web, use the left-side drawer menu

### 📄 Note Page

* Displays the note title, content, and structured section list
* The section list is auto-generated from headings (H1\~H6); clicking a section jumps to its position
* Use top buttons to edit the note, rearrange sections, or view edit history

### ✏️ Note Editing

* A flexible editor that supports both markdown and visual (WYSIWYG) modes
* Allows free editing with both automatic and manual save options
* Supports internal note links and external link via autocomplete

### 🗂 Recent Notes

* Lists recently viewed notes in chronological order
* Click to revisit a note, or remove it from the list if no longer needed

### 🧾 Problem Notes

* Displays notes with automatically detected problems such as empty sections, broken links, or duplicated content
* Problem types include:

| Problem Type                              | Description                                                      |
| --------------------------------------- | ---------------------------------------------------------------- |
| Empty paragraph                         | A section heading exists but its content is empty                |
| Empty list                              | A list is present in a section, but it has no items              |
| Duplicate paragraphs (...)              | The same section title appears more than once                |
| Duplicate contents (...)                | Identical contents are repeated in section            |
| Too high readability score: X > 3.0     | The reading difficulty score exceeds the recommended threshold   |
| Unknown note link (...)                 | A link points to a non-existent note                             |
| Empty parent note (...)                 | The parent note exists but contains no content                   |
| Unlinked note keyword: ...              | A keyword that could be linked to another note is left unlinked  |
| Unlinked note keyword: ... => ... (...) | A keyword is unlinked even though it is linked from another note |

* Click on an problem to jump directly to the problematic section for quick editing

### 📆 Timeline

* A calendar-based view that shows all notes linked to dates
* Use the date selector or calendar to browse notes by day
* View and edit dated sections directly from this screen

### 🗃 Archive

* Shows previous versions (snapshots) of notes
* Compare historical content over time, sorted by save date
* Useful for version control and restoring past content

---

## Advanced Features

### 📝 Dual Editor Support

* The note editing screen can be freely converted to both WYSIWYG and Markdown methods with the ✏️ button.
* Changes in one mode are reflected in real-time in the other
* Ideal for users who prefer visual editing or are familiar with markdown syntax

### 📑 Automatic Section Detection

* Headings within notes are automatically structured into a navigable tree view
* Quickly jump between sections and visualize the overall structure

### 🔗 Link Recognition and Navigation

* Links within notes are automatically detected and categorized
* Internal note links are also suggested during search and autocomplete

### ⏱ Automatic Date Detection

* Recognizes date patterns like `2024-06-01` or `06/01~06/05`
* Visualizes dates in the form of a timer bar and integrates with the timeline

### 🧠 Readability Analysis

* Analyzes sentence length and structure to evaluate reading difficulty
* Helps improve overly complex or lengthy notes

### 🔍 Search History and Autocomplete

* Previously searched keywords are stored for faster reuse
* Suggestions appear in the search bar to reduce repeat typing

### 🔄 Section Rearrangement and Copying

* Move or copy specific sections to other notes to reorganize content
* Preview changes before confirming to ensure safe editing

### 📦 Backup and Restore

* Export all notes in Markdown or ZIP format for backup
* Restore notes from saved files when needed

### 💾 Storage Options and Account Sync

* Choose between local or cloud-based accounts for saving notes
* Online sync keeps notes up-to-date automatically

### 🗃 Snapshot History and Comparison

* Notes are automatically backed up when saved
* Compare current content with past versions through the Archive screen

### 🎯 Random Note Access

* Open a randomly selected note to discover content from a new perspective

### 📌 Pin open notes

* When you double-click or long-click on the first opened note or recent changes, it is fixed to the open note list.
* You can unfreeze by pressing the X button.

---

## 📞 Contact

If you have feature suggestions, bug reports, or questions, feel free to reach out:

* Email: [ydh051541@naver.com](mailto:ydh051541@naver.com)
* GitHub Issues: [https://github.com/blacktokki/blacktokki-notebook/issues](https://github.com/blacktokki/blacktokki-notebook/issues)
