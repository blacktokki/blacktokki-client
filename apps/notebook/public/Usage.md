# 📘 Blacktokki Notebook User Guide

**Blacktokki Notebook** is a markdown-based tool for knowledge and time management. Users can freely create, structure, and track notes over time. It is optimized for both mobile and web environments, making it suitable for self-directed learning, work documentation, knowledge archiving, and schedule-based reflection.

## Key Features

- ✅ Freely write notes using a markdown editor
- 📁 Organize content hierarchically using folders and sub-notes
- 🧭 Automatically generated tree view for quick navigation based on headings
- 🔍 Advanced search across titles, sections, links, and keywords
- 🔁 Move specific sections to other notes
- 📆 Automatically detect dates and visualize them as timer bars
- 🧠 Use autocomplete to quickly insert links and child notes
- 🧳 Export and import notes and boards in Markdown/JSON ZIP archives

---

## Getting Started

### 🔍 Searching and Creating Notes

- Use the top search bar to find existing notes or create new ones.
- Enter a new title and press `Enter` to automatically create and open the note.

### ✏️ Editing Notes

- Use the markdown-based editor to write and format content.
- Supports both **auto-save and manual save** options.
- Autocomplete triggers:
  - `[title` → internal note paragraph titles **within the current note**, and **New sub note creation** (e.g., `CurrentNote/Keyword`).
  - `http` → external link previews

---

## Screen-by-Screen Guide

### 🏠 Home

- The main screen that appears upon launch.
- Provides quick access to recently viewed notes, edit suggestions, and the timeline.
- On mobile, access main menus via the **bottom tab**; on web, use the **left-side drawer** for navigation.

### 📄 Note Page

- Displays the note title, content, and structured section list.
- The section list is auto-generated from headings (H1–H6); clicking a section jumps to its position.
- Use top buttons to edit the note, rearrange sections, or view edit history.

### ✏️ Note Editing

- A flexible editor that supports both markdown and WYSIWYG (visual) modes.
- Allows free editing with automatic or manual saving.
- Internal and external link autocompletion is supported.

### 🗂 Recent Notes

- Lists recently viewed or created notes as cards and grids.
- Use the header icon buttons on the top right to intuitively switch between Sub-note List view, Kanban Board, and Scrum Board (fixed to Sub-note List view in Simple Mode).
- Click to revisit a note, or remove it from the list if no longer needed.

---

## Usage Mode

You can adjust the app's complexity and features across 3 levels according to your workflow and purpose.

- **Header Dropdown Menu (Quick Switcher):** Click the app/notebook title in the top navigation header to open a dropdown popover, allowing you to quickly switch between registered notebooks, add a new notebook mode, return to note mode, or edit notebook settings.
- **Config Menu:** You can also change the usage mode and manage notebooks in `Config > Note Settings > Mode Settings`. If no notebook mode has been created, selecting Notebook Mode will automatically open the modal to create a new notebook.

### 🌱 Simple Mode

The lightest memo environment providing only essential features. Useful when you want to focus on quick note-taking and reading, hiding unnecessary UI (extensions, changelog, etc.).

### 📝 Note Mode

Provides pure document writing and knowledge management features without board or private functionalities. Suitable for users who need structured information and extension features.

- **🗃 Archive**
  - Shows previous versions (snapshots) of notes.
  - Compare historical content over time, sorted by save date.
  - Useful for version control and restoring past content.

### 📓 Notebook Mode

An environment where you can organize the app's features into distinct 'Notebooks'. When creating a notebook, you can designate its sub-mode such as general workspace, private workspace, or private note to work in isolated workspaces.

- **Notebook Management via Header Dropdown:**

  - Click the active notebook title in the top header to view the list of registered notebooks and switch between workspaces instantly.
  - Click the three-dot menu (⋮) on any notebook item to edit its title, description, sub-mode, or delete it. Deleting the currently active notebook mode automatically returns to standard Note Mode.
  - Use the `+ Add Notebook Mode` button to quickly create a new notebook, or use `〈 Switch to Note Mode` to instantly return to standard Note Mode.

- **🗂 Workspace**

  - A notebook type that includes features to visualize and manage note sections as Kanban/Scrum boards.
  - Recommended when managing projects and schedules alongside memos and document management.

- **🔐 Private Note & Workspace**
  - Notebook types that allow you to hide sensitive information when viewing notes in public spaces or sharing your screen.
  - **Unified Private Mode Toggle:** Once Notebook Mode is selected, you can lock/unlock all private notebooks at once using the Private Mode (On/Off) toggle.
  - **Enhanced Security (OTP):** By enabling 'Require OTP for Private Mode', the system will prompt for an OTP via a secure modal whenever you enter the mode or attempt to disable this security setting.
  - **Auto-unlock Timer:** If the 'Auto-unlock (10 mins)' option is enabled, Private Mode will automatically turn off after 10 minutes of inactivity to ensure your data remains secure.
  - If you attempt to access a hidden notebook directly (e.g., via URL) while the mode is **Off**, a warning message will appear, and the content will remain hidden.

#### 🗂 Board

> Workspace types only feature

- Visualize and manage note sections as a Kanban/Scrum board.
- **Icon-based View Switcher:** Use the intuitive header icon buttons on the upper right of the Recent Pages screen to switch between or automatically create Sub-note List View, Kanban Board, Scrum Board, and Board Settings. The icon on the left of note titles lets you easily jump back to the parent board.
- **Alphabetical Column Sorting:** In Kanban and Scrum boards, columns (direct sub-notes) are stably sorted **alphabetically by title (with numeric prefix support)** rather than by modification date, ensuring that column order never jumps around when cards are edited or moved.
- Each **column** corresponds to a specific note (e.g., "To Do", "In Progress").
- Each **card** is automatically generated from sections (e.g., H2, H3) within that note.
- In **Scrum Boards**, **Rows** are automatically generated based on the level immediately above the card's header (Header Level - 1). This enables a more multi-dimensional organization of cards.
- Cards can be **dragged and dropped** to another column.
- When a card is moved, its corresponding section is **physically moved** to the target note.
- Single-clicking (tapping) a card navigates to the note view screen, while double-clicking (double-tapping) opens the editing screen.
- **Enhanced Empty State UI:** When notes or cards have no description, an icon with the note title is displayed instead of a blank card. Accessing an empty note provides quick buttons to edit content or create a board (disabled in Simple Mode).

### 📊 Usage Mode Feature Comparison

| Feature                        | 🌱 Simple Mode |  📝 Note Mode  |    📓 Notebook Mode    |
| :----------------------------- | :------------: | :------------: | :--------------------: |
| **Basic Note Writing/Editing** |  ✅ Supported  |  ✅ Supported  |      ✅ Supported      |
| **Recent Notes (List View)**   |  ✅ Supported  |  ✅ Supported  |      ✅ Supported      |
| **TOC & Sub-notes**            |  ✅ Supported  |  ✅ Supported  |      ✅ Supported      |
| **Extensions**                 | ❌ Unsupported |  ✅ Supported  |      ✅ Supported      |
| **Changelog (Archive)**        | ❌ Unsupported |  ✅ Supported  |      ✅ Supported      |
| **Private Features**           | ❌ Unsupported | ❌ Unsupported |  ✅ Private Notebooks  |
| **Board (Kanban)**             | ❌ Unsupported | ❌ Unsupported | ✅ Workspace Notebooks |

---

## Advanced Features

### 📝 Dual Editor Support

- The note editing screen can be freely converted to both WYSIWYG and Markdown methods with the `M↓` button.
- Changes in one mode are reflected in real-time in the other.
- Ideal for users who prefer visual editing or are familiar with markdown syntax.

### 🏷️ YAML Frontmatter Preservation and Metadata Support

- Automatically recognizes and protects **YAML Frontmatter (`--- ... ---`)** metadata blocks at the top of markdown documents.
- During visual (WYSIWYG) editing, the frontmatter block is safely hidden to prevent accidental modification, and is preserved verbatim (100% untouched) upon markdown mode switching, note saving, and archive export.
- Fully compatible with markdown files created in external tools like Obsidian or Jekyll that contain document metadata.

### 📑 Automatic Section Detection

- Headings within notes are automatically structured into a navigable tree view.
- Quickly jump between sections and visualize the overall structure.

### ⌞⌝ Section Content Toggle

- When focusing on a specific section, you can toggle between:
  - Viewing only that section’s content, or
  - Viewing its content **plus all nested sub-sections.**
- This helps when you want to read or edit an entire section hierarchy as a single note.

### 🔗 Link Recognition and Navigation

- Links within notes are automatically detected and categorized.
- Internal note links are also suggested during search and autocomplete.

### 🔍 Search History and Autocomplete

- Previously searched keywords are stored for faster reuse.
- Suggestions appear in the search bar to reduce repeat typing.

### 🔄 Note and Section Relocation

- Move entire notes or specific sections to a different title or location to reorganize your knowledge structure.
- **Move sub-notes**: When moving a parent note, you can choose to seamlessly move all of its nested sub-notes together.
- **Update backlinks**: Automatically find and update all internal links pointing to the moved note or section across all your other notes, preventing broken links.
- **Preview changes**: Safely preview the structural changes and text diffs before confirming the move. If the target note already exists, you will be warned and can choose to overwrite.

### 💾 Storage Options and Account Sync

- Choose between local or cloud-based accounts for saving notes.
- Online sync keeps notes up-to-date automatically.
- For local accounts, Note and Simple modes automatically save data to internal browser storage (OPFS) without extra setup.
- For local accounts, Notebook mode links directly to a chosen folder on your computer, with permissions preserved in browser storage (IndexedDB).

### 📌 Pin Tabs

- Double-click or long-press the current tab or recently changed note to pin it to the tab list.
- You can unpin it by pressing the X button.

### ⇄ Reorder Tabs

- You can freely rearrange the order of items in the Tab List, by simply dragging them up or down.
- The new order is applied immediately and saved automatically. Position frequently used notes at the top to enhance your workflow efficiency.

### 🔐 Personal Access Token (PAT) Management

- You can directly generate and manage Personal Access Tokens (PATs) required for integrating with external services and applications.
- New tokens can be issued in a dedicated section within the Account Edit modal; for security reasons, the token value is displayed only once immediately after issuance, so it must be copied and stored in a safe place right away.
- You can view the list of currently active tokens and their expiration dates, and maintain security by deleting tokens that are no longer in use at any time.

---

## Extension Features

### ⚡ Quick Memo

- A feature that allows you to immediately add sub-paragraphs by selecting a specific note and a parent paragraph.
- Information about the most recently used note and paragraph is automatically saved, allowing for quick recording in the same location next time.
- You can easily change the target (note and paragraph) by clicking the exchange icon at the top.

### 🔍 Full-text Search

- Enter a keyword in the search bar and click the 🔍 button or press Enter to navigate to the full-text search results page, which searches through both note titles and their entire content.

### 🧾 Edit Suggestions

- Displays notes with automatically detected problems such as empty sections, broken links, or duplicated content.
- Problem types include:

| Problem Type                            | Description                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Empty paragraph                         | A section heading exists but its content is empty                                                           |
| Empty list                              | A list is present in a section, but it has no items                                                         |
| Duplicate paragraphs (...)              | The same section title appears more than once                                                               |
| Duplicate contents (...)                | Identical contents are repeated in a section                                                                |
| Too high readability score: X > 3.0     | The reading difficulty score exceeds the recommended threshold                                              |
| Unknown note link (...)                 | A link points to a non-existent note                                                                        |
| Empty parent note (...)                 | The parent note exists but contains no content                                                              |
| Unlinked note keyword: ...              | A keyword that could be linked to another note is left unlinked                                             |
| Unlinked note keyword: ... => ... (...) | A keyword is unlinked even though it is linked from another note                                            |
| Isolated note                           | The note has content but lacks incoming paths (no parent note, no backlinks, and not assigned to any board) |

- Click a problem to jump directly to the problematic section for quick editing.

### 📆 Timeline

- View your schedule at a glance based on dates written in your notes.
- You can use the specified date formats via the 🕒 button while editing a note.
- Supported date formats:
  - `YYYY-MM`
  - `YYYY-MM-DD`
  - `YYYY-MM-DD/YYYY-MM-DD`
  - `MM/DD`
  - `MM/DD ~ MM/DD`
  - `YYYY/MM/DD`
  - `YYYY/MM/DD ~ YYYY/MM/DD`
  - `YYYY. M. D.`
  - `YYYY. M. D.~YYYY. M. D.`
- Use the date selector or calendar to browse notes by day.
- View and edit dated sections directly from this screen.
- Each note's current schedule is visually represented as a timer bar, making it easy to see its current state.
- Clicking a **timer tag** (e.g., `YYYY-MM-DD`) in a note opens a quick menu to adjust the schedule:
  - `+1 day`, `+1 month`, `Extend`, or `Delete`.

### 🕸️ Ontology

- Visualizes your knowledge base as a VOWL-inspired ontology graph:
  - **1. Class (Circle Nodes)**:
    Categorizes entities in the knowledge base and organizes them into inheritance (`subClassOf`) hierarchies:
    - **Built-in Class Hierarchy (Blue)**:
      - **`Note Class`**: Single base class representing general notes. All ordinary Note instances belong to this class.
      - **`Connected Paragraph Class`**: Base class classifying paragraph instances that serve as the source or target of directed cross-document links (`references`).
    - **Board Class Hierarchy (Green)**:
      - **`Board Card Class`**: Top-level abstract card class for each board.
        - ↳ **`Board Card Status Subclass`**: Subclass inheriting from the Board Card class (`subClassOf`), defined per board column/status as `{board name}: {status name}`. Individual cards are instantiated (`instanceOf`) from these status subclasses.
    - **Topic Class Hierarchy (Magenta)**:
      - **`Topic: {keyword} (Generic Topic Superclass)`**: Top-level topic superclass combining note titles, card types, and heading distinctions. Formed only when its direct subclasses plus distinct source notes of directly assigned members total at least three, or it has at least two direct subclasses. Multiple paragraphs or cards from the same note count as one source note.
        - ↳ **`Note Title: {keyword}`**: Subclass (`subClassOf`) classifying shared keywords found in the leaf titles of notes (excluding `/`-separated parent paths), formed when member instances total at least three.
        - ↳ **`Card Type: {parent heading title}`**: Subclass (`subClassOf`) based on the nearest parent heading title of a card, with card instances connected directly. (The source parent heading is excluded from heading title class candidates.)
        - ↳ **`H{N} Title: {keyword}`**: Subclass (`subClassOf`) classifying heading keywords that appear across at least three distinct notes at the same heading level (H1~H6).
      - _Rules_: Numeric-only keywords never create Topic classes. When a specialized class exists for a keyword, instances are not duplicated into the generic class; instead, the specialized class connects via `subClassOf`, enabling polymorphic inference.
  - **2. Instance (Circle Nodes)**:
    - **Note Instance (Blue Double Ring Circle)**: Independent general notes shown as `Instance (Note)` in the legend and preview (`instanceOf Note`).
    - **Card Instance (Green Circle)**: Concrete individual paragraph items instantiated from the board status subclasses (`instanceOf`).
    - **Paragraph Instance (Purple Circle)**: Each paragraph has one hierarchical `partOf` relation to its nearest parent paragraph, or to its containing note when no parent paragraph exists. Its visibility can be changed with the paragraph toggle in the top toolbar.
    - **Connected Paragraph Instance (Orange Circle)**: Paragraphs directly involved in references or Title Keyword Class membership. They keep the ordinary hierarchical `partOf` relation and, when a parent paragraph exists, add a dashed `connectedPartOf` relation directly to the containing note. They remain visible independently of the ordinary paragraph toggle. A paragraph at either end of an actual `references` relation belongs to the Link-connected Paragraph class. A paragraph connected only through Title Keyword Class membership remains classified by that title-keyword class and is not added to the Link-connected Paragraph class.
  - **3. Property (Schedule, Internalized Sections & Literal Rectangles)**:
    - Managed as node data properties and literal nodes (yellow rectangles):
      - **Schedule**: TimerTag dates (e.g. `YYYY-MM-DD`)
      - **Sections**: Sub-headers of cards and notes are internalized as structural data properties and displayed in the preview sheet's table of contents, allowing instant jump navigation.
  - **4. Relation (Directed Edges)**:
    - **`subClassOf` (Blue Arrow)**: Subclass hierarchy where a child class inherits from a parent class (Status subclass → Board Card class, specialized topic subclass → generic Topic superclass).
    - **`instanceOf` (Blue Arrow)**: Card and note instances instantiated from classes.
    - **`references` (Blue Arrow)**: Directed links from `_NOTELINK`. A link inside a paragraph or card uses that paragraph or card as its source, and a specified target paragraph is resolved before its note.
    - **`notePartOf` (Gray Arrow)**: A `partOf` hierarchy from a child note to its parent note.
    - **`cardPartOf` (Yellow Arrow)**: A `partOf` hierarchy from a card to its nearest parent paragraph or containing note.
    - **`paragraphPartOf` (Yellow Arrow)**: A `partOf` hierarchy from a paragraph to its nearest parent paragraph or containing note.
    - **`connectedPartOf` (Orange Dashed Arrow)**: A special `partOf` relation that also connects a connected paragraph with a parent paragraph directly to its containing note.
    - **Inferred relations (Purple Dashed Arrows)**: Enable the Inferred toggle to inspect logical class inheritance and inherited instance membership.
    - The bottom legend places node entries on the first row and the currently displayed relation types and their counts on the second row. Built-in, Board, and Topic classes have separate colors and counts, and Note instances appear before Card instances. The view toggles are ordered as `Paragraphs` → `Datatypes`.
  - **5. Validation & Inference**:
    - **Application Referential Integrity Check**: Detects broken links pointing to non-existent notes or paragraphs. This is a scoped application validation, not a complete OWL consistency proof.
    - Click the top **Validation HUD Badge** (`Validation Passed`, `Validation Warning`, or `Validation Error`) to inspect results and locate affected nodes.
- Independent notes with empty content are automatically excluded from both the graph and Topic keyword class candidate calculation. An existing empty note is retained as a skeletal Note instance when a non-empty note references it or needs it as a parent, but it is still excluded from Topic candidates. A note-level link to that skeletal note is valid; an explicit paragraph link remains invalid because the empty note has no paragraph. A board note is retained as a structural parent when it contains non-empty column paragraphs and its title remains a Topic candidate.
- A Note instance that shares a board name and its paragraphs are built only from the actual note content. Board configuration descriptions are not interpreted as note paragraphs, and board-column paragraphs belong to their actual column Note instance rather than directly to the board-root Note.
- **Topic Virtual Note**: When no physical note exists with the same name as a Generic Topic Superclass or standalone Topic class, the class displays an outer dashed 🪐 ring in the graph and presents an `[🪐 Open Virtual Note]` action button in its preview sheet. Selecting this button opens a Markdown viewer that indexes the topic's distributed paragraphs, cards, subclasses, and source notes in real time without generating a separate knowledge-by-subclass section. Another top-level topic is listed as related only when the sum of shared knowledge instances and shared source notes is at least three; explicit references are shown only as auxiliary evidence and do not count toward this threshold. The same related-topic count appears in each Topic-list summary and the virtual-note modal's top statistics. Each related-topic link opens the matching physical note when one exists, otherwise it opens that topic's virtual note. Users can copy the synthesized content or click **[Save as Real Note]** to materialize it as an ordinary permanent note in one click. Topics that already have a real note of the same name navigate directly to that note and are excluded from virtual note derivation.
- **Ontology Topic Screen**: A dedicated screen listing top-level Generic Topic Superclasses and standalone Topic classes using `NoteListSection`. Users can switch seamlessly between the Graph View and Topic List via the toolbar. Tapping any item directly navigates to the physical note (`NotePage`) if a note with the same name already exists, or opens the synthesized virtual note viewer (`VirtualNoteModal`) if no physical note exists, allowing immediate reading, copying, or materialization into a permanent note.
- Smooth pan and zoom controls with cursor-centered zoom and automatic screen fitting. Global node density still follows the spacing control, while each Topic hierarchy is drawn more tightly around its top-level Topic class. Spacing and zoom controls align without an empty upper gap when the viewport is wide and move below the top view toggles on narrower screens, avoiding the bottom legend and detail sheet.
- Select **Export RDF** to extract the current notebook's classes, instances, relations, properties, application-validation results, and inference provenance as an RDF 1.1 Turtle (`.ttl`) file. Topic class IDs depend on their normalized keyword and scope, so adding or removing members does not change their IRIs. Title-keyword classes are exported as instances of the class category `TopicClass` and subclasses of `KnowledgeItem`, so their members are not misclassified as separate `Topic` individuals. Cards and paragraphs retain their own titles, paragraph paths, and containment hierarchy. The validation report is a snapshot of the current application validation, not an independent SHACL recomputation. The semantic profile is an RDF 1.1 graph with RDFS entailment and selected OWL, SHACL, Dublin Core, and PROV-O vocabulary; the combined export does not claim OWL 2 DL conformance. Resources use deployment-independent `urn:blacktokki:notebook:` IRIs. Web downloads the file, while mobile opens the system share sheet.

### 📦 Archive (Backup and Restore)

- Export all notes and boards in a ZIP archive for comprehensive backup.
  - **Notes** are saved as Markdown (`.md`) files.
  - **Boards** (Kanban/Scrum options and settings) are saved as structured JSON (`.json`) files (e.g., `{Board Title}.json`).
- Restore notes and boards seamlessly by importing ZIP archives, Markdown (`.md`) files, or board JSON (`.json`) files.

### 🎯 Random Note Access

- Open a randomly selected note to discover content from a new perspective.

### 📄 PDF Export (Default Style)

- Export or print the current note (or selected sub-paragraph) as a PDF document with default clean styling optimized for printing.
- Forces a clean white background and black text, optimized for printing and standard document sharing.
- Click the print icon button at the top of the note viewing screen to export.

### 📄 PDF Export (Theme Style)

- Export the current note (or selected sub-paragraph) as a PDF document retaining your active theme colors (dark mode, skins, etc.).
- Click the PDF icon button at the top of the note viewing screen to export.

### 🔄 Notebook Sync (Local Account - My Account Synchronization)

- Synchronizes notes (`.md`) and boards (`.json`) between your local account and your account.
- **Automatic Pairing & Badge**: When logged in and working in Notebook mode, the Sync button in the Drawer and Discovery tab displays a badge indicating the number of modified, added, or differing files.
- **Local Notebook Creation & Folder Connection**: If a matching notebook does not exist locally, the standard notebook creation modal opens with pre-filled account notebook details, prompting you to pick a local PC directory before proceeding with synchronization.
- **Visual Diff & Smart Sync**: Inspect visual text differences before applying changes with smart conflict resolution (latest modified wins).
- **Conflict Detection & Choice**: When a note has been modified concurrently on both local and account sides, it is marked as a conflict, allowing you to choose between [Reflect Local Account] and [Reflect My Account] directly on the card.
- **Auto-sync(non-conflicting notes)**: When enabled, non-conflicted items (new notes, one-way modified notes, and boards) are automatically synchronized in the background while leaving conflicts for manual resolution.
- **Sync Triggers**: Configure auto-checks on app focus and save directly from the sync screen.

---

## 📞 Contact

If you have feature suggestions, bug reports, or questions, feel free to reach out:

- Email: [ydh051541@naver.com](mailto:ydh051541@naver.com)
- GitHub Issues: [https://github.com/blacktokki/blacktokki-notebook/issues](https://github.com/blacktokki/blacktokki-notebook/issues)
