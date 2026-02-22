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

* Use the top search bar to find existing notes or create new ones.
* Enter a new title and press `Enter` to automatically create and open the note.

### ✏️ Editing Notes

* Use the markdown-based editor to write and format content.
* Supports both **auto-save and manual save** options.
* Autocomplete triggers:
  * `[title` → internal note paragraph titles **within the current note**, and **New sub note creation** (e.g., `CurrentNote/Keyword`).
  * `http` → external link previews

---

## Screen-by-Screen Guide

### 🏠 Home

* The main screen that appears upon launch.
* Provides quick access to recently viewed notes, edit suggestions, and the timeline.
* On mobile, access main menus via the **bottom tab**; on web, use the **left-side drawer** for navigation.

### 📄 Note Page

* Displays the note title, content, and structured section list.
* The section list is auto-generated from headings (H1–H6); clicking a section jumps to its position.
* Use top buttons to edit the note, rearrange sections, or view edit history.

### ✏️ Note Editing

* A flexible editor that supports both markdown and WYSIWYG (visual) modes.
* Allows free editing with automatic or manual saving.
* Internal and external link autocompletion is supported.

### 🗂 Recent Notes

* Lists recently viewed notes in chronological order.
* Click to revisit a note, or remove it from the list if no longer needed.

### 🗂 Board

* Visualize and manage note sections as a Kanban/Scrum board.
* You can create, modify, and delete boards.
* Each **column** corresponds to a specific note (e.g., "To Do", "In Progress").
* Each **card** is automatically generated from sections (e.g., H2, H3) within that note.
* In **Scrum Boards**, **Rows** are automatically generated based on the level immediately above the card's header (Header Level - 1). This enables a more multi-dimensional organization of cards, such as by project stage or assignee.
* Cards can be **dragged and dropped** to another column.
* When a card is moved, its corresponding section is **physically moved** to the target note.

### 🗃 Archive

* Shows previous versions (snapshots) of notes.
* Compare historical content over time, sorted by save date.
* Useful for version control and restoring past content.

---

## Advanced Features

### 📝 Dual Editor Support

* The note editing screen can be freely converted to both WYSIWYG and Markdown methods with the `M↓` button.
* Changes in one mode are reflected in real-time in the other.
* Ideal for users who prefer visual editing or are familiar with markdown syntax.

### 📑 Automatic Section Detection

* Headings within notes are automatically structured into a navigable tree view.
* Quickly jump between sections and visualize the overall structure.

### ⌞⌝ Section Content Toggle

  * When focusing on a specific section, you can toggle between:
    * Viewing only that section’s content, or
    * Viewing its content **plus all nested sub-sections.**
  * This helps when you want to read or edit an entire section hierarchy as a single note.

### 🔗 Link Recognition and Navigation

* Links within notes are automatically detected and categorized.
* Internal note links are also suggested during search and autocomplete.

### 🔍 Search History and Autocomplete

* Previously searched keywords are stored for faster reuse.
* Suggestions appear in the search bar to reduce repeat typing.

### 🔄 Section Rearrangement and Copying

* Move or copy specific sections to other notes to reorganize content.
* Preview changes before confirming to ensure safe editing.

### 💾 Storage Options and Account Sync

* Choose between local or cloud-based accounts for saving notes.
* Online sync keeps notes up-to-date automatically.

### 🗃 Snapshot History and Comparison

* Notes are automatically backed up when saved.
* Compare current content with past versions through the Archive screen.

### 📌 Pin Tabs

* Double-click or long-press the current tab or recently changed note to pin it to the tab list.
* You can unpin it by pressing the X button.

### ⇄ Reorder Tabs

* You can freely rearrange the order of items in the Tab List, by simply dragging them up or down.
* The new order is applied immediately and saved automatically. Position frequently used notes at the top to enhance your workflow efficiency.

### 🔐 Private Mode

* This feature allows you to hide sensitive information when viewing notes in public spaces or sharing your screen.
* **How to hide notes:** If a note title (or the title in a sub-path) starts with a `.` (dot), that note and its sub-notes are automatically treated as privacy-protected.
    * Examples: `.SecretDiary`, `Project/.Confidential`, `PersonalInfo/.Finance`
* **Independent Tab List:** When Private Mode is active, the 'Tab List' on the Home screen switches to **'Tab List - Private Mode'**, keeping your private browsing history completely separate from the standard mode.
* **Enhanced Security (OTP):** By enabling 'Require OTP for Private Mode', the system will prompt for an OTP via a secure modal whenever you enter the mode or attempt to disable this security setting. (This feature is supported for online accounts with OTP enabled.)
* **Auto-unlock Timer:** If the 'Auto-unlock (10 mins)' option is enabled, Private Mode will automatically turn off after 10 minutes of inactivity to ensure your data remains secure.
* If you attempt to access a hidden note directly (e.g., via URL) while the mode is **Off**, a warning message will appear, and the content will remain hidden.

### 🔐 Personal Access Token (PAT) Management

* You can directly generate and manage Personal Access Tokens (PATs) required for integrating with external services and applications.
* New tokens can be issued in a dedicated section within the Account Edit modal; for security reasons, the token value is displayed only once immediately after issuance, so it must be copied and stored in a safe place right away.
* You can view the list of currently active tokens and their expiration dates, and maintain security by deleting tokens that are no longer in use at any time.

### ✨ MCP server integration

* The issued personal access token can be linked to Blacktokki Notebook’s MCP server.
* The MCP setting method based on Claude Desktop is as follows:
```json
{
  "mcpServers": {
    "blacktokkiNotebook": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://blacktokki.kro.kr/agent/sse",
        "--header",
        "Authorization: Bearer ***"
     ]
    }
  }
}
```

---

## Extension Features

### ⚡ Quick Memo
* A feature that allows you to immediately add sub-paragraphs by selecting a specific note and a parent paragraph.
* Information about the most recently used note and paragraph is automatically saved, allowing for quick recording in the same location next time.
* You can easily change the target (note and paragraph) by clicking the exchange icon at the top.

### 🔍 Full-text Search

* Enter a keyword in the search bar and click the 🔍 button or press Enter to navigate to the full-text search results page, which searches through both note titles and their entire content.

### 🧾 Edit Suggestions

* Displays notes with automatically detected problems such as empty sections, broken links, or duplicated content.
* Problem types include:

| Problem Type                              | Description                                                      |
| --------------------------------------- | ---------------------------------------------------------------- |
| Empty paragraph                         | A section heading exists but its content is empty                |
| Empty list                              | A list is present in a section, but it has no items              |
| Duplicate paragraphs (...)              | The same section title appears more than once                    |
| Duplicate contents (...)                | Identical contents are repeated in a section                     |
| Too high readability score: X > 3.0     | The reading difficulty score exceeds the recommended threshold   |
| Unknown note link (...)                 | A link points to a non-existent note                             |
| Empty parent note (...)                 | The parent note exists but contains no content                   |
| Unlinked note keyword: ...              | A keyword that could be linked to another note is left unlinked  |
| Unlinked note keyword: ... => ... (...) | A keyword is unlinked even though it is linked from another note |

* Click a problem to jump directly to the problematic section for quick editing.

### 📆 Timeline

* View your schedule at a glance based on dates written in your notes.
* You can use the specified date formats via the 🕒 button while editing a note.
* Supported date formats:
  * `YYYY-MM`
  * `YYYY-MM-DD`
  * `YYYY-MM-DD/YYYY-MM-DD`
  * `MM/DD`
  * `MM/DD ~ MM/DD`
* Use the date selector or calendar to browse notes by day.
* View and edit dated sections directly from this screen.
* Each note's current schedule is visually represented as a timer bar, making it easy to see its current state.
* Clicking a **timer tag** (e.g., `YYYY-MM-DD`) in a note opens a quick menu to adjust the schedule:
  * `+1 day`, `+1 month`, `Extend`, or `Delete`.

### 📦 Archive (Backup and Restore)

* Export all notes in Markdown or ZIP format for backup.
* Restore notes from saved files when needed.

### 🎯 Random Note Access

* Open a randomly selected note to discover content from a new perspective.

---

## 📞 Contact

If you have feature suggestions, bug reports, or questions, feel free to reach out:

* Email: [ydh051541@naver.com](mailto:ydh051541@naver.com)
* GitHub Issues: [https://github.com/blacktokki/blacktokki-notebook/issues](https://github.com/blacktokki/blacktokki-notebook/issues)
