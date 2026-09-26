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

### ✏️ Note Editing

* A flexible editor that supports both markdown and WYSIWYG (visual) modes.
* Allows free editing with automatic or manual saving.
* Internal and external link autocompletion is supported.

### 🗂 Recent Notes

* Lists recently viewed or created notes as cards and grids.
* Use the header icon buttons on the top right to intuitively switch between Sub-note List view, Kanban Board, and Scrum Board (fixed to Sub-note List view in Simple Mode).
* Click to revisit a note, or remove it from the list if no longer needed.

---

## Usage Mode
You can adjust the app's complexity and features across 3 levels according to your workflow and purpose.
* **Header Dropdown Menu (Quick Switcher):** Click the app/notebook title in the top navigation header to open a dropdown popover, allowing you to quickly switch between registered notebooks, add a new notebook mode, return to note mode, or edit notebook settings.
* **Config Menu:** You can also change the usage mode and manage notebooks in `Config > Note Settings > Mode Settings`. If no notebook mode has been created, selecting Notebook Mode will automatically open the modal to create a new notebook.

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

### 🔲 Note Page Section Only (Focus View)

* In note screens, click the 'Maximize' icon in the header to hide navigation bars, search bars, and bottom navigation/TOC sections, focusing entirely on the note body.
* You can return to the standard view at any time by clicking the 'Restore' icon in the top right or by pressing the `Escape` key.

### 🔗 Link Recognition and Navigation

* Links within notes are automatically detected and categorized.
* Internal note links are also suggested during search and autocomplete.

### 🔍 Search History and Autocomplete

* Previously searched keywords are stored for faster reuse.
* Suggestions appear in the search bar to reduce repeat typing.

### 🔄 Note and Section Relocation

* Move entire notes or specific sections to a different title or location to reorganize your knowledge structure.
* **Move sub-notes**: When moving a parent note, you can choose to seamlessly move all of its nested sub-notes together.
* **Update backlinks**: Automatically find and update all internal links pointing to the moved note or section across all your other notes, preventing broken links.
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

Visualizes relationships among notes, boards, paragraphs, cards, and external links as a semantic knowledge graph, providing relation exploration, graph validation, and RDF Turtle export.

* **Knowledge Graph Access & Validation Badge**:
  * Open the feature from the **Knowledge Graph** item in the Drawer or Discovery menu.
  * A badge (`CountBadge`) on the menu button displays the number of detected graph validation issues (referential integrity and isolated entity violations).
* **Navigation Toolbar**:
  * Select `[Usage >]` in the top toolbar to navigate to this guide.
* **Graph Exploration & Viewport Controls**:
  * Pan by dragging the canvas; zoom using the mouse wheel, trackpad pinch, or the top-right Zoom HUD (`+`, current percentage `%`, `-`, `Fit to screen`).
  * Adjust node spacing density from 0.4x to 2.5x using the `Spacing` HUD (`-`, current density `x`, `+`); clicking the middle density button resets it to 1.0x.
* **Node Preview Sheet & N-hop Range**:
  * Selecting a node opens a preview sheet at the bottom to inspect details and set the related-node scope (N-hop).
  * The N-hop range offers `1`, `2`, and `All`.
  * When a node is selected, direct 1-hop edges are highlighted with bold lines (2.2px), arrows, and relation label boxes, N-hop edges are highlighted with lines (1.8px) and arrows, and non-focused nodes and edges are dimmed.
  * Instance previews show clickable category (`Category` / `rdf:type`) chips, and topic classes show `Parent Categories` and `Child Categories` chips for quick navigation.
  * Shared board paragraphs originating from multiple notes display `Source Notes` chips to navigate to each source document, cards show `Sub-sections` chips, and note instances display YAML frontmatter property chips (`schedule`, `updated`, etc.).
  * Regular nodes (notes, paragraphs, cards, external links) display a `[Move]` button to navigate to the note viewer or open the external browser, while topic classes provide an `[Open Virtual Note]` button for detailed concept inspection. (Multi-origin board paragraphs navigate via their individual `Source Notes` chips instead.)
* **View Options**:
  * The top toolbar toggles display their active state and item counts:
    * `Inferred (n)`: Toggles logical class inheritance (`inferred subClassOf`) and instance membership (`inferred instanceOf`) as purple dashed edges. (Displays a notification banner for 3 seconds if no inferred relations exist.)
    * `Paragraphs (n)`: Shows or hides ordinary paragraph nodes. (Hidden by default; appears when ordinary paragraphs exist.)
    * `Ordinary External Links (n)`: Shows or hides external links without other relations. (Hidden by default; appears when external links exist.)
    * `Datatypes (n)`: Visualizes note YAML frontmatter properties as literal rectangle nodes and datatype property edges. (Hidden by default; appears when properties exist.)
    * `Label: Intuitive terms / Label: RDF/OWL terms`: Switches displayed labels between friendly terms and semantic web standards (RDF/OWL).
* **Legend & Validation Modal**:
  * The bottom legend displays currently shown node types (first row) and relation types (second row) with counts and can be expanded or collapsed.
  * On the canvas, the selected node is highlighted with an orange solid ring, hovered nodes with a blue solid ring, virtual-note-eligible topic nodes with a magenta dashed ring, and violating nodes with a red dashed ring.
  * Select the top validation badge (`Validation Passed`, `Validation Warning (n)`, or `Validation Error (n)`) to open the validation modal.
  * Inspect referential integrity (unknown note/paragraph links, empty parent notes) and isolated entity issues (unconnected standalone notes), and select an affected node chip to jump directly to that node on the graph.
* **Export RDF**:
  * Select `[Export RDF]` in the graph screen toolbar to export the current mode's complete knowledge graph (classes, instances, relations, properties, validation snapshot, inference provenance) as an RDF 1.1 Turtle (`.ttl`) file. Web downloads the file; mobile opens the share sheet.
  * The export includes `owl:Class`, `owl:NamedIndividual`, `rdf:type`, `rdfs:subClassOf`, `dcterms:isPartOf`, `dcterms:references`, `rdfs:seeAlso`, PROV-O inference provenance, and SHACL application validation snapshots. (Represents an application snapshot profile rather than an assertion of complete OWL 2 DL consistency.)
* **Entity Model & Empty Note Handling Rules**:
  * Notes with no content are normally omitted from the graph and topic candidates.
  * An existing empty note is retained as a structural skeletal Note instance only when directly referenced or used as an immediate parent by a non-empty note. (Skeletal notes remain excluded from topic keyword candidates.)
  * Board paragraphs sharing the same name within a board are unified into a single `BOARD_PARAGRAPH` instance across multiple column origins, and card headings are modeled solely as `CARD` instances without duplicating paragraph nodes.

### 📑 Topic Notes

Aggregates scattered headings and cards across notes and boards into topic lists, providing real-time synthesized Topic Virtual Notes for reading and saving.

* **Topic Notes Access**:
  * Open the feature from the **Topic Notes** item in the Drawer or Discovery menu.
* **Navigation Toolbar**:
  * Select `[Usage >]` in the top toolbar to navigate to this guide.
* **Note Page Topic Tags**:
  * Topic tags related to the current note are displayed at the top of the note viewing screen.
  * Topics whose keyword matches the note title (or leaf title), whose source notes include the current note, or whose keyword (2+ characters) appears in the note's headings or descriptions are listed in descending order of relation count.
  * When two or fewer topics exist, individual keyword chips are shown; when three or more topics exist, they are collapsed into a `Topic n` chip, which expands to reveal the full topic button list under a `Topic (n) ▲` header upon clicking.
  * Selecting a topic tag immediately opens its Topic Virtual Note modal.
* **Topic Formation & Hierarchy Rules**:
  * Keywords extracted from note leaf titles, card/paragraph headings, and external-link display names form a single unified topic hierarchy.
  * A shared keyword must appear across at least three distinct source notes; keywords shorter than two characters, numeric-only keywords, and ordinary body text are excluded.
  * When an external link's visible name is a URL pattern, its entire hostname (domain) is treated as a single keyword.
  * When topic B's source notes form a proper subset of topic A's source notes (`B ⊂ A`) and parent topic A has two or more such child topics, an explicit inheritance (`subClassOf`) relationship is established between them.
* **Topic List Screen**:
  * Filter topics by `All (n)`, `Real notes only (n)`, or `Virtual notes only (n)`. (Real note status is determined by whether an existing note matches the complete topic keyword case-insensitively; matching only the leaf name in a `/` path is not considered a match.)
  * Topics are sorted descending by the sum of links, paragraphs, cards, and source notes (alphabetical for ties), displaying the subtitle `Links n · Paragraphs n · Cards n · Source Notes n · Related Topics n`, with ` (Child Topics n)` appended only when direct child topics exist.
  * Selecting any topic in the list opens its Topic Virtual Note modal regardless of whether a matching real note exists.
* **Topic Virtual Notes**:
  * Open a synthesized virtual note modal by selecting an item from the topic list, clicking a topic tag in a note page, or clicking a related topic link inside another virtual note. (Can also be opened via `[Open Virtual Note]` in the Knowledge Graph preview sheet.)
  * The top bar summarizes statistics for Links, Paragraphs, Cards, Source Notes, and Related Topics.
  * The document body synthesizes a Topic Index (links, paragraphs, board cards, source notes) and Related Topics sharing at least 3 distinct source notes (grouped into Parent Topics, Child Topics, and Other Related Topics). Topics with a matching real note are marked with a `📝` prefix, and common source notes and reference counts are displayed alongside each topic.
  * Selecting a related topic link switches the modal content to that topic in place without a separate internal back button.
  * Opening a real note from a body link or bottom action automatically restores the virtual note modal upon returning back to the screen.
  * Bottom action buttons:
    * `[Copy]`: Copies the synthesized Markdown content to the clipboard.
    * `[Go to Real Note]`: Opens the original note when a real note with the matching full title exists.
    * `[Save as Real Note]`: Saves the synthesized virtual note as a formal note and navigates to it when no real note with the matching full title exists.

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
