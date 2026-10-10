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
* 🧳 Export and import notes and boards in Markdown/JSON ZIP archives

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
* Clicking a URL-encoded relative file link such as `[Document](../folder/Document%20Title.md)` opens the target document relative to the current note's folder.

### ✏️ Note Editing

* A flexible editor that supports both markdown and WYSIWYG (visual) modes.
* Allows free editing with automatic or manual saving.
* Internal and external link autocompletion is supported.
* `[` autocomplete and pasting internal links generate URL-encoded relative `.md` links from the current note, preserving paragraph and section information.

### 🗂 Recent Notes

* Lists recently viewed or created notes as cards and grids.
* Use the header icon buttons on the top right to intuitively switch between Sub-note List view, Kanban Board, and Scrum Board (fixed to Sub-note List view in Simple Mode).
* Click to revisit a note, or remove it from the list if no longer needed.

---

## Usage Mode
You can adjust the app's complexity and features across 3 levels according to your workflow and purpose.
* **Header Dropdown Menu (Quick Switcher):** Click the app/notebook title in the top navigation header to open a dropdown popover, allowing you to quickly switch between registered notebooks, add a new notebook mode, return to note mode, or edit notebook settings.
* **Config Menu:** You can also change the usage mode and manage notebooks in `Config > Note Settings > Mode Settings`. If no notebook mode has been created, selecting Notebook Mode will automatically open the modal to create a new notebook.
* Refreshing in local mode restores the last selected usage mode and notebook. Deleted notebooks and locked private notebooks return to Note Mode.

### 🌱 Simple Mode
The lightest memo environment providing only essential features. Useful when you want to focus on quick note-taking and reading, hiding unnecessary UI (extensions, changelog, etc.).

### 📝 Note Mode
Provides pure document writing and knowledge management features without board or private functionalities. Suitable for users who need structured information and extension features.

* **🗃 Archive**
  * Shows previous versions (snapshots) of notes.
  * Compare historical content over time, sorted by save date.
  * Useful for version control and restoring past content.

### 📓 Notebook Mode
An environment where you can organize the app's features into distinct 'Notebooks'. When creating a notebook, you can designate its sub-mode such as general workspace, private workspace, or private note to work in isolated workspaces.

* **Notebook Management via Header Dropdown:**
  * Click the active notebook title in the top header to view the list of registered notebooks and switch between workspaces instantly.
  * Click the three-dot menu (⋮) on any notebook item to edit its title, description, sub-mode, or delete it. Deleting the currently active notebook mode automatically returns to standard Note Mode.
  * Use the `+ Add Notebook Mode` button to quickly create a new notebook, or use `〈 Switch to Note Mode` to instantly return to standard Note Mode.

* **🗂 Workspace**
  * A notebook type that includes features to visualize and manage note sections as Kanban/Scrum boards.
  * Recommended when managing projects and schedules alongside memos and document management.

* **🔐 Private Note & Workspace**
  * Notebook types that allow you to hide sensitive information when viewing notes in public spaces or sharing your screen.
  * **Unified Private Mode Toggle:** Once Notebook Mode is selected, you can lock/unlock all private notebooks at once using the Private Mode (On/Off) toggle.
  * **Enhanced Security (OTP):** By enabling 'Require OTP for Private Mode', the system will prompt for an OTP via a secure modal whenever you enter the mode or attempt to disable this security setting.
  * **Auto-unlock Timer:** If the 'Auto-unlock (10 mins)' option is enabled, Private Mode will automatically turn off after 10 minutes of inactivity to ensure your data remains secure.
  * If you attempt to access a hidden notebook directly (e.g., via URL) while the mode is **Off**, a warning message will appear, and the content will remain hidden.

#### 🗂 Board
> Workspace types only feature

  * Visualize and manage note sections as a Kanban/Scrum board.
  * **Icon-based View Switcher:** Use the intuitive header icon buttons on the upper right of the Recent Pages screen to switch between or automatically create Sub-note List View, Kanban Board, Scrum Board, and Board Settings. The icon on the left of note titles lets you easily jump back to the parent board.
  * **Alphabetical Column Sorting:** In Kanban and Scrum boards, columns (direct sub-notes) are stably sorted **alphabetically by title (with numeric prefix support)** rather than by modification date, ensuring that column order never jumps around when cards are edited or moved.
  * Each **column** corresponds to a specific note (e.g., "To Do", "In Progress").
  * Each **card** is automatically generated from sections (e.g., H2, H3) within that note.
  * In **Scrum Boards**, **Rows** are automatically generated based on the level immediately above the card's header (Header Level - 1). This enables a more multi-dimensional organization of cards.
  * Scrum items in the board list display note, named row, and card counts. Rows with the same title are counted once, and the unnamed default row is excluded.
  * Cards can be **dragged and dropped** to another column.
  * When a card is moved, its corresponding section is **physically moved** to the target note.
  * Single-clicking (tapping) a card navigates to the note view screen, while double-clicking (double-tapping) opens the editing screen.
  * **Enhanced Empty State UI:** When notes or cards have no description, an icon with the note title is displayed instead of a blank card. Accessing an empty note provides quick buttons to edit content or create a board (disabled in Simple Mode).

### 📊 Usage Mode Feature Comparison

| Feature | 🌱 Simple Mode | 📝 Note Mode | 📓 Notebook Mode |
| :--- | :---: | :---: | :---: |
| **Basic Note Writing/Editing** | ✅ Supported | ✅ Supported | ✅ Supported |
| **Recent Notes (List View)** | ✅ Supported | ✅ Supported | ✅ Supported |
| **TOC & Sub-notes** | ✅ Supported | ✅ Supported | ✅ Supported |
| **Extensions** | ❌ Unsupported | ✅ Supported | ✅ Supported |
| **Changelog (Archive)** | ❌ Unsupported | ✅ Supported | ✅ Supported |
| **Private Features** | ❌ Unsupported | ❌ Unsupported | ✅ Private Notebooks |
| **Board (Kanban)** | ❌ Unsupported | ❌ Unsupported | ✅ Workspace Notebooks |

---

## Advanced Features

### 📝 Dual Editor Support

* The note editing screen can be freely converted to both WYSIWYG and Markdown methods with the `M↓` button.
* Changes in one mode are reflected in real-time in the other.
* Ideal for users who prefer visual editing or are familiar with markdown syntax.

### 🏷️ YAML Frontmatter Preservation and Metadata Support

* Automatically recognizes and protects **YAML Frontmatter (`--- ... ---`)** metadata blocks at the top of markdown documents.
* During visual (WYSIWYG) editing, the frontmatter block is safely hidden to prevent accidental modification, and is preserved verbatim (100% untouched) upon markdown mode switching, note saving, and archive export.
* Fully compatible with markdown files created in external tools like Obsidian or Jekyll that contain document metadata.

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

### 🔄 Note and Section Relocation

* Move entire notes or specific sections to a different title or location to reorganize your knowledge structure.
* **Move sub-notes**: When moving a parent note, you can choose to seamlessly move all of its nested sub-notes together.
* **Update backlinks**: Automatically find and update all internal links pointing to the moved note or section across all your other notes, preventing broken links. Relative `.md` and `.markdown` links are also found and updated using the folder of the note containing each link.
* **Preview changes**: Safely preview the structural changes and text diffs before confirming the move. If the target note already exists, you will be warned and can choose to overwrite.

### 💾 Storage Options and Account Sync

* Choose between local or cloud-based accounts for saving notes.
* Online sync keeps notes up-to-date automatically.
* For local accounts, Note and Simple modes automatically save data to internal browser storage (OPFS) without extra setup.
* For local accounts, Notebook mode links directly to a chosen folder on your computer, with permissions preserved in browser storage (IndexedDB).

### 📌 Pin Tabs

* Double-click or long-press the current tab or recently changed note to pin it to the tab list.
* You can unpin it by pressing the X button.

### ⇄ Reorder Tabs

* You can freely rearrange the order of items in the Tab List, by simply dragging them up or down.
* The new order is applied immediately and saved automatically. Position frequently used notes at the top to enhance your workflow efficiency.

### 🔐 Personal Access Token (PAT) Management

* You can directly generate and manage Personal Access Tokens (PATs) required for integrating with external services and applications.
* New tokens can be issued in a dedicated section within the Account Edit modal; for security reasons, the token value is displayed only once immediately after issuance, so it must be copied and stored in a safe place right away.
* You can view the list of currently active tokens and their expiration dates, and maintain security by deleting tokens that are no longer in use at any time.

---

## Extension Features

### 🧩 Extracted Templates

- Enable **Extracted Templates** in the current notebook's Extension Settings, then open it from the home menu or Drawer. It also works in Note Mode. The introductory text and **Usage** button share the top row; the button opens this section of the user guide.
- Opening the screen automatically discovers templates from notes with similar headings, labelled fields and table columns. Returning to the notebook refreshes the sources. No search button, manual example selection or separate inference step is needed.
- The **Extraction criteria** switch in the catalog header is off by default, selecting **Whole-note structure**. On selects **Whole notes + shared table forms**, including bold-cell header recognition. Changing the switch refreshes the catalog. The switch and template choices pause briefly during extraction, and the count shows `…` without a separate loading card. Return to the list to change criteria while previewing or writing. Date placeholders, notebook-root exclusion, splitting rules, and the two-thirds similarity boundary apply in both modes.
- All matching structural groups are offered; the former limit of twelve groups no longer hides less frequent document patterns.
- Documents with different overall sections can still provide a shared table form. If a named column layout occurs in at least two distinct notes and includes a source missed by whole-document matching, that table structure becomes an additional template. Surrounding document-specific headings are excluded, while common row labels and nested tables remain. Repeating a table within one note does not count as multiple sources; unnamed data columns do not qualify for this recovery step. Fully bold first-row cells also serve as table headers when an import uses ordinary cells instead of header cells.
- Each group is compared in full. Structures present in at least 60% of its notes (and at least two notes) form a reusable template. `▤ number` shows how many similar notes contributed.
- When a template's **Similar notes** have multiple top-level folders, it is split only if every folder contains at least two notes. If any folder contains one note, the entire original template is retained. Splits use the original structural name, such as `Agenda`, `Agenda (2)`, without a folder prefix. Loose notes form a separate template when at least two remain; a single loose note keeps the whole template together. A template that originally has one top-level folder includes that folder's name, such as `Team meetings · Agenda`; a template without folders keeps its original name. Each split retains the common inferred body; note previews and title patterns use that template's own sources.
- Discovered templates are compared again by headings, fields, table columns and rows, lists, and standalone dates. Candidates with structural similarity of at least **2/3 (66⅔%)** appear in the same card. The calculation uses exactly `2 / 3`, so 66% is below the boundary. Every pair within a group meets that threshold, with no hierarchy or subgroups. `▦ 2` and `≈ 80%` mean two templates with a minimum similarity of approximately 80%. Each candidate retains its own body and source notes.
- The catalog uses a vertical list with a short structural outline for each candidate. A single template appears directly without a group header; only multiple similar templates share a group card. Groups of different heights do not leave gaps beside other items. The top **list** and **preview** buttons switch stages. **New note** stays disabled in the catalog and preview, then becomes active when the right card's **New note** button opens the writing stage. Visible captions, keyboard focus and selected states identify each action without hover tooltips.
- Headings, table columns and repeated row labels, and list types become a Markdown skeleton with `{{name}}` placeholders. Source YAML metadata, links and body values are excluded. Review row labels to ensure they represent structure. Nested tables become standalone Markdown tables labelled with their original row context.
- Standalone calendar labels such as `05-25 Mon`, `2026-05-25` or Korean month/day labels become `{{ Date }}` placeholders. Dates between repeated tables retain their original position, and subsequent dates use distinct fields such as `{{ Date (2) }}`. Bold date labels remain bold; date headings keep their child sections. Actual historical dates are excluded. This supports daily scrum and other repeated date-and-table layouts across notebooks.
- Select a template to see a selection panel on the left and one shared preview on the right. The left card uses one list: the first item shows a distinct template icon and the template name; top-level source folders follow with the same row layout. There is no separate **Similar notes** heading or total count. Choose the template item or an individual source note to change the preview; only one is visible at a time. The right card's heading shows the current template or note name. The current item is highlighted. Narrow screens stack the panels and move to the preview after selection. Scroll areas reach the left and right edges of each card, with reading space inside the scroll area. Use **Open note** in the source preview to visit the ordinary note screen.
- **Similar notes** follow the title-path hierarchy, such as `Team meetings/Weekly/Note name`. Expand a path to select an individual original note. The list has no search field.
- The current notebook and its selected local folder name are excluded from top-level group labels, template naming, and splitting. If that name wraps source paths, its child paths are grouped instead. Original note paths are retained for opening notes and creating notes from title patterns; actual notebook items are excluded from discovery.
- The action beside the right card's heading changes with its content: **New note** for a template, **Open note** for a source note. Choose the blue **New note** button in the template preview to open the writing stage. The title form and preview sit together on wide screens and stack on narrow screens. The structure and placeholders are visible before entering a note title. The preview reaches the card's bottom edge without a padded strip beneath it.
- In the writing form, **Title template** offers several patterns inferred from the names of this body template's source notes. Similar names in the same path retain common text and replace differences with `{{ Date }}`, `{{ Number }}` and `{{ Keyword }}`. For example, dated weekly meetings produce `Team meetings/{{ Date }} Weekly meeting`. Choose a pattern or the **✎** option to enter a title directly. If no repeating pattern is found, enter a title directly.
- Fill all title fields to see the resulting note title including its original folder path. Fields with the same name share their value across the title and body templates. Optional body fields start collapsed under `{{ }} · number`; expand to fill them. Use the **Preview** button beside the title form heading to preview the new note, edit it in the normal editor and save it. Unfilled body fields remain as placeholders. Nested paths such as `Folder/New note` are supported; creation refuses to replace an existing note with the same title.
- The top **Preview** button returns to source comparison while retaining the writing draft. The **list** button returns to the catalog to select another template. Templates are rebuilt from the current notebook without template editing, a saved library or import/export controls.
- Structural analysis runs on the device without an external AI call. Semantic equivalence between differently worded sections and unstructured prose is not inferred automatically; adjust the new note in its preview when needed.
- Analysis and similar-note lookup stay within the current account, notebook and privacy mode. Hidden notes are excluded in normal mode. Other notebooks automatically derive templates from their own note structures.

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
| Isolated note | The note has content but lacks incoming paths (no parent note, no backlinks, and not assigned to any board) |

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
  * `YYYY/MM/DD`
  * `YYYY/MM/DD ~ YYYY/MM/DD`
  * `YYYY. M. D.`
  * `YYYY. M. D.~YYYY. M. D.`
* Use the date selector or calendar to browse notes by day.
* View and edit dated sections directly from this screen.
* Each note's current schedule is visually represented as a timer bar, making it easy to see its current state.
* Clicking a **timer tag** (e.g., `YYYY-MM-DD`) in a note opens a quick menu to adjust the schedule:
  * `+1 day`, `+1 month`, `Extend`, or `Delete`.

### 🕸️ Knowledge Graph

Local notebooks read file contents on each refresh and compare checksums, reusing conversions of unchanged files to speed up repeated loading of large folders. The knowledge graph reuses note paragraph analysis. On an active screen, notes and boards refresh every 30 seconds; external edits, additions, renames and deletions appear on the next read, including edits that preserve both the file modification time and byte size.

Large graphs update their layout incrementally and animate between layout steps so you can keep panning and zooming while nodes settle. During movement, the canvas temporarily uses a lower resolution, tiny nodes appear as points, and relationship decorations are simplified. All nodes and relationships remain available; selected, hovered, and warning nodes retain their detailed indicators. The original resolution, node shapes, and relationship decorations return after movement stops. Edge highlights then start on large graphs.

Visualizes relationships among notes, boards, paragraphs, cards, and external links as a knowledge graph, providing relation exploration and graph validation.

* **Internal Links**: Relative `.md` and `.markdown` links are resolved from the source note's folder to display note and paragraph references. Directly referenced empty notes are also included in the graph.
* **Knowledge Graph Access & Validation Badge**:
  * Open the feature from the **Knowledge Graph** item in the Drawer or Discovery menu.
  * A badge (`CountBadge`) on the menu button displays the number of detected graph validation issues (referential integrity and isolated entity violations).
* **Navigation Toolbar**:
  * Select `[Usage >]` in the top toolbar to navigate to this guide.
* **Graph Exploration & Viewport Controls**:
  * Pan by dragging the canvas; zoom using the mouse wheel, trackpad pinch, or the top-right Zoom HUD (`+`, current percentage `%`, `-`, `Fit to screen`).
  * Adjust node spacing density from 0.4x to 2.5x using the `Spacing` HUD (`-`, current density `x`, `+`); clicking the middle density button resets it to 1.0x.
  * Members and descendants are placed outward from their Note or Board class through membership and containment. External links spread around the Note or Board class of the citing content, including when ordinary external links are shown. The External Link class stays near the Note class, or between the Note class and citing Board classes when board links are present. It is not a layout hub.
  * All `Note containment` edges keep the same length, and all `Paragraph containment` edges keep the same length within their category. This also applies during selection and paragraph/external-link visibility changes; adjusting `Spacing` scales these lengths together.
* **Node Preview Sheet & N-hop Range**:
  * Selecting a node moves it to the center of the visible area above the bottom preview sheet without changing zoom. Dragging or zooming stops the automatic movement; the sheet lets you inspect details and set the related-node scope (N-hop).
  * The N-hop range offers `1`, `2`, and `All`.
  * When a node is selected, direct 1-hop edges are highlighted with bold lines (2.2px), arrows, and relation label boxes, N-hop edges are highlighted with lines (1.8px) and arrows, and non-focused nodes and edges are dimmed.
  * Instance previews show clickable category (`Category`) chips for quick navigation.
  * Shared board paragraphs originating from multiple notes display `Source Notes` chips to navigate to each source document, cards show `Sub-sections` chips, and note instances display YAML frontmatter property chips (`schedule`, `updated`, etc.).
  * Nodes display a `[Move]` button to navigate to the note viewer or open the external browser. (Multi-origin board paragraphs navigate via their individual `Source Notes` chips instead.)
* **View Options**:
  * The top toolbar toggles display their active state and item counts:
    * `Paragraphs (n)`: Shows or hides ordinary paragraph nodes. (Hidden by default; appears when ordinary paragraphs exist.)
    * `Ordinary External Links (n)`: Shows or hides external links without other relations. (Hidden by default; appears when external links exist.)
    * When **Extracted Templates** is enabled for this notebook, the **Discovered templates** toggle with a document icon cycles **Whole-note structure → Whole notes + shared table forms → off**. It starts off; the caption shows the extraction criteria and template count, or `…` while calculating. Turning it off removes the added template nodes and relations. Ordinary paragraph and external-link options still work independently, and switching notebooks, accounts, privacy scopes, or disabling the extension resets template display.
    * Each candidate becomes a light neutral **Template** node, sized like a board note and connected to its represented source documents by **Template source** relations. Multiple templates in the same flat similarity group share a dark neutral **Template group** node sized like a built-in category; single templates have no group node. Group membership uses the catalog's exact `2 / 3` threshold. Select a group to choose its templates, or a template to choose its source nodes in the detail sheet. Templates and groups have no document **move** action. Source files, YAML metadata and validation results remain unchanged.
* **Legend & Validation Modal**:
  * The bottom legend displays currently shown node types (first row) and relation types (second row) with counts and can be expanded or collapsed.
  * On the canvas, the selected node is highlighted with an orange solid ring, hovered nodes with a blue solid ring, and violating nodes with a red dashed ring.
  * Select the top validation badge (`Validation Passed`, `Validation Warning (n)`, or `Validation Error (n)`) to open the validation modal.
  * Inspect referential integrity (unknown note/paragraph links, empty parent notes) and isolated entity issues (unconnected standalone notes), and select an affected node chip to jump directly to that node on the graph.
* **Entity Model & Empty Note Handling Rules**:
  * Notes with no content are normally omitted from the graph.
  * An existing empty note is retained as a structural skeletal Note instance only when directly referenced or used as an immediate parent by a non-empty note.
  * Board paragraphs sharing the same name within a board are unified into a single `BOARD_PARAGRAPH` instance across multiple column origins, and card headings are modeled solely as `CARD` instances without duplicating paragraph nodes.

### 📦 Archive (Backup and Restore)

* Export all notes and boards in a ZIP archive for comprehensive backup.
  * **Notes** are saved as Markdown (`.md`) files.
  * **Boards** (Kanban/Scrum options and settings) are saved as structured JSON (`.json`) files (e.g., `{Board Title}.json`).
* Restore notes and boards seamlessly by importing ZIP archives, Markdown (`.md`) files, or board JSON (`.json`) files.

### 🎯 Random Note Access

* Open a randomly selected note to discover content from a new perspective.

### 📄 PDF Export (Default Style)

* Export or print the current note (or selected sub-paragraph) as a PDF document with default clean styling optimized for printing.
* Forces a clean white background and black text, optimized for printing and standard document sharing.
* Click the print icon button at the top of the note viewing screen to export.

### 📄 PDF Export (Theme Style)

* Export the current note (or selected sub-paragraph) as a PDF document retaining your active theme colors (dark mode, skins, etc.).
* Click the PDF icon button at the top of the note viewing screen to export.

### 🔲 Focus View (Note Page Section Only)

* Can be enabled in Extension Settings.
* In note screens, click the 'Maximize' icon in the header to hide navigation bars, search bars, and bottom navigation/TOC sections, focusing entirely on the note body.
* You can return to the standard view at any time by clicking the 'Restore' icon in the top right or by pressing the `Escape` key.

### 🔄 Notebook Sync (Local Account - My Account Synchronization)

* Synchronizes notes (`.md`) and boards (`.json`) between your local account and your account.
* **Automatic Pairing & Badge**: When logged in and working in Notebook mode, the Sync button in the Drawer and Discovery tab displays a badge indicating the number of modified, added, or differing files.
* **Local Notebook Creation & Folder Connection**: If a matching notebook does not exist locally, the standard notebook creation modal opens with pre-filled account notebook details, prompting you to pick a local PC directory before proceeding with synchronization.
* **Visual Diff & Smart Sync**: Inspect visual text differences before applying changes with smart conflict resolution (latest modified wins).
* **Conflict Detection & Choice**: When a note has been modified concurrently on both local and account sides, it is marked as a conflict, allowing you to choose between [Reflect Local Account] and [Reflect My Account] directly on the card.
* **Auto-sync(non-conflicting notes)**: When enabled, non-conflicted items (new notes, one-way modified notes, and boards) are automatically synchronized in the background while leaving conflicts for manual resolution.
* **Sync Triggers**: Configure auto-checks on app focus and save directly from the sync screen.

---

## 📞 Contact

If you have feature suggestions, bug reports, or questions, feel free to reach out:

* Email: [ydh051541@naver.com](mailto:ydh051541@naver.com)
* GitHub Issues: [https://github.com/blacktokki/blacktokki-notebook/issues](https://github.com/blacktokki/blacktokki-notebook/issues)
