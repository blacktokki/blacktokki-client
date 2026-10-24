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
- Use relative links such as `[Document](../folder/Document%20Title.md)` to open notes in other folders. A `#paragraph` link opens that paragraph in the current note.

### ✏️ Note Editing

- A flexible editor that supports both markdown and WYSIWYG (visual) modes.
- Allows free editing with automatic or manual saving.
- Internal and external link autocompletion is supported.
- Use `[` autocomplete to select a note or paragraph, or paste an internal link.

### 🗂 Recent Notes

- Lists recently viewed or created notes as cards and grids.
- Use the header icon buttons on the top right to intuitively switch between Sub-note List view, Kanban Board, and Scrum Board (fixed to Sub-note List view in Simple Mode).
- Click to revisit a note, or remove it from the list if no longer needed.

---

## Usage Mode

You can adjust the app's complexity and features across 3 levels according to your workflow and purpose.

- **Quick switcher:** Select the app or notebook name at the top to switch or add notebooks. You can also return to Note Mode or open notebook settings.
- **Config Menu:** Change modes in `Config > Note Settings > Mode Settings`. If no notebook exists, the new-notebook screen opens.
- Refreshing in local mode restores the last selected usage mode and notebook. Deleted notebooks and locked private notebooks return to Note Mode.

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
  - **OTP verification:** Enable 'Require OTP for Private Mode' to require a code when entering the mode or disabling this setting. This option is available for online accounts with OTP enabled.
  - **Auto-unlock Timer:** If the 'Auto-unlock (10 mins)' option is enabled, Private Mode will automatically turn off after 10 minutes of inactivity to ensure your data remains secure.
  - If you attempt to access a hidden notebook directly (e.g., via URL) while the mode is **Off**, a warning message will appear, and the content will remain hidden.

#### 🗂 Board

> Workspace types only feature

- Visualize and manage note sections as a Kanban/Scrum board.
- Use the icons at the top right of Recent Notes to switch between the sub-note list, Kanban, Scrum, and board settings. The board icon beside a note title returns to its parent board.
- Columns follow note-title order. Add numbers at the start of titles to set their order.
- Each **column** corresponds to a specific note (e.g., "To Do", "In Progress").
- Each **card** is automatically generated from sections (e.g., H2, H3) within that note.
- **Scrum board** rows use the heading level above the cards. For example, when H3 sections are cards, H2 headings provide row names.

- Cards can be **dragged and dropped** to another column.
- Moving a card also moves its section to the target note.
- Single-clicking (tapping) a card navigates to the note view screen, while double-clicking (double-tapping) opens the editing screen.
- In an empty note, use the edit or create-board buttons to get started (except in Simple Mode).

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

- Metadata between `--- ... ---` at the start of a document is retained when saving or exporting the note.
- Metadata is hidden in visual editing mode. Switch to Markdown mode to view or edit it.

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
- **Update backlinks**: Update links in other notes that point to the moved note or section.
- **Preview changes**: Safely preview the structural changes and text diffs before confirming the move. If the target note already exists, you will be warned and can choose to overwrite.

### 💾 Storage Options and Account Sync

- Choose a local or online account for storage. Notes in an online account can be synchronized.
- With a local account, Note and Simple modes save in your browser without a folder setup.
- With a local account in Notebook mode, choose a folder on your computer to connect.

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

### 🧩 Extracted Templates

Use the shared format of similar notes to write new meeting minutes, work logs, or other recurring documents.

1. Enable **Extracted Templates** in **Extension Settings**, then open it from the home menu or sidebar.
2. Select a format under **Discovered templates** to preview it. To compare originals, select the list icon (**Similar notes**) and choose a note. Select the list icon again to return to the preview.
3. Select the pencil icon (**New note**). Choose a **Title template** and fill in dates or keywords, or choose **Enter title directly**.
4. Fill in **Content template**, then check **Content preview**. Switching between these views preserves your entries.
5. Select **save**. If saving is unavailable, complete the fields shown in the message. Change the title if a note with that title already exists.

**Filling fields and checking sources**

- `{{ Date }}` and `{{ Keyword }}` are fields to fill in. Title fields marked with `*` are required. Empty body fields remain as placeholders. Fields with the same name share the value you enter.
- For repeating table rows or columns, use **＋ Table row / ＋ Table column** to add items and **×** to remove them. Repeating column names can also be edited.
- The folder path in the title is where the new note will be saved. Starting from a template tag on a note that has not been created yet prefills that note's title.
- Select a **template name tag** at the top of a note to open **Similar notes**. If the tag's name is shortened, open the template screen to see the full name.
- Use `Tab` to focus the body tabs and `←` / `→` to switch. The document icon beside the template name returns to its preview; **‹ Template list** lets you choose another template.

If no templates appear, check that at least two notes have similar heading structures or table layouts. Review the new note in the preview before saving.

### ⚡ Quick Memo

- A feature that allows you to immediately add sub-paragraphs by selecting a specific note and a parent paragraph.
- Information about the most recently used note and paragraph is automatically saved, allowing for quick recording in the same location next time.
- You can easily change the target (note and paragraph) by clicking the exchange icon at the top.

### 🔍 Full-text Search

- Enter a keyword and click 🔍 or press Enter to open the search screen. Use the **Search** tab to search note titles and contents.
- Opening the search page without a keyword shows a prompt to enter one in the search bar.
- Scroll to the end of the result list to load more results.

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

### 🕸️ Knowledge Graph

Explore connections among notes, boards, paragraphs, cards, and external links, and open their sources. Enable **Settings → Extensions → Knowledge Graph**, then open **Knowledge Graph** from the menu.

- **Navigate and find items**: Drag to pan and use the mouse wheel, pinch, or zoom buttons to zoom. **Search** finds names among currently displayed items. Select a result to see its location and details. Adjust **Spacing** to change the distance between items.
- **Select an item**: View its connections and sources. Choose **1** or **2** to focus on nearby connections, or **All** for the full range. Open originals from the connection and source lists.
- **View options**: Use **Base**, **Paragraphs**, and **Ordinary External Links** to choose what appears. Keywords and templates have their own toggles. **Graph controls** shows or hides the tools.
- **Keywords and Relationships**: Open analysis with the top button. After analysis, enable the matching graph toggle to display keywords, types, and relationships. Relationship lines appear for groups meeting **Evidence satisfied**; inspect all results and evidence on the analysis screen.
- **Discovered templates**: When **Extracted Templates** is enabled, show templates and their source connections. Select a template or group to explore related documents.
- **Legend and validation**: The bottom legend shows item and relationship types with counts. Select **Validation Passed**, **Validation Warning**, or **Validation Error** to inspect issues, then select an item to locate it.

Empty notes appear when needed for another note's reference or hierarchy. Local file changes appear on the next automatic refresh.

#### 🔎 Graph Search

1. Enter a query in the top search bar, then select the **Knowledge Graph** tab.
2. If preparation is required, select **Start analysis**. Search continues automatically with your query when preparation finishes.
3. Adjust **N-hop Range** to choose how far to explore connections. To find connections between items, include their names in the query.
4. Choose a **Context size** of 16k, 32k, 64k, 128k, or 256k for the amount of result content. Here, 1k means 1,000 Markdown source characters. **Context usage** shows the amount used and the limit.
5. Read **Traversal paths**, **Nearby paths**, **Related items**, and **Source quotations**. Use citation numbers and source links to read evidence or open its original note or paragraph. Select an external link's name to open it.

The selected range and size may leave out some content or evidence; omissions are indicated in the result. If an expected connection or passage is missing, increase the range or context size. Search also includes items hidden on the canvas.

Use reference links beside quotations to read the linked sources. While searching, you can choose another context size or cancel the search.

**Traversal paths** shows connections between query items, while **Nearby paths** shows connections to nearby items. Paths use nested lists grouped by starting item, with shared sections shown once. Multiple relationships from the same parent to the same item appear side by side with their directions and citation numbers. Each item shows its classification in parentheses; paragraphs also identify their source notes, such as `(Paragraph[Note name])`.

If paths are not found or are omitted due to the size limit, check the notices and affected item pairs. The Traversal paths heading shows `(normal paths/total)`, counting only normal paths and affected pairs actually listed. Without missing or omission notices, it shows only the path count `(n)`. Increasing the range may reveal connections not found in the selected range.

#### 🏷️ Keywords and Relationships

Find recurring keywords and relationships in the current notebook. Check automatically detected results against their original sources.

1. Open **Keywords and Relationships** at the top of the knowledge graph.
2. For **Cache reusable**, view the saved results. For **Cache creation required**, select **Start analysis**; for **Cache update required**, select **Update cache**. Errors appear in **Analysis notices**.
3. Search names in **Keywords**, or expand **Keyword filters** to narrow the list. Select a name to open **Entity**.
4. In **Entity**, inspect general relationships, source notes, and associations. Use **Associations** to inspect relationships and evidence for entity pairs. Select a card's heading or arrow to expand it.
5. Select a source note or paragraph title to open the original. After editing notes, use **Refresh notes** and follow the **Update cache** prompt. **Run analysis again** is available after analysis finishes.

Analysis continues when you visit another screen. The progress bar shows overall progress and the current stage's status. **Refresh notes** is unavailable during analysis and search preparation. Stopping analysis or changing the notebook, account, or privacy mode cancels the work. A cancelled or failed update preserves the previous saved results.

For slow search preparation, check `검색 준비: 처리 시간` in the developer console. Each run records one summary on completion, failure, or cancellation, with total time, whether it exceeded five seconds, relationship cache timing, and detailed timings from storage reads through model readiness.

Search preparation overlaps relationship analysis and reuses saved search data. Once ready, changing the query or connection range reuses the same prepared data.

The performance summary separates source preparation, index construction, model file loading, and first inference. A negative `시작ms` means that work started before the search preparation indicator appeared.

Opening search also reuses completed template discovery for the same sources, notebook scope, root names, and language. Incomplete analysis does not replace the completed search index. Large contexts, including 256k, check evidence and attribute changes by recalculating only the affected lines and paths; quotation ranges and the Markdown size limit remain exact.

Analysis and search cache keys follow the other storage settings: `prefix:accountId:notebookId:privacy`. Local accounts leave the account ID empty, and ordinary notes use notebook ID `0`. Usage mode is omitted, and only the new key format is read and written. Localized type labels are compared by hash.

The collection cache stores pattern hashes, occurrence structure and references into the current notes instead of duplicating note titles, bodies or quotations. It restores these in memory once from the loaded notes without extracting keywords or collecting relationships again. The vector cache stores model information, hashed identities and numeric embeddings; search text remains in memory. Source or rule changes invalidate collection references. On the first use of this format, older source-bearing collection caches are removed and need one analysis run to rebuild; existing embedding vectors are retained.

Keywords are names recurring in at least **three distinct notes**. Shared parts of names also appear as constituent keywords: for example, `서울역`, `서울시청`, and `서울버스` can produce `서울`.

In **Keyword filters**, **OR** accepts at least one selected option and **AND** requires all. **All** removes that filter's restriction. Collapsing the filters keeps your selections active.

- **Keyword source**: note, section, reference, bold text, property, or property value.
- **Keyword composition**: compound, contained, synthetic, constituent, or **None**. A compound name contains another keyword; that inner name is contained. A constituent is the shared part of names, and an original name containing it is synthetic. One keyword can have several roles.
- **Entity pattern**: numeric pattern, common-prefix pattern, or **None**.
- **Entity type**: items repeatedly found together in lists, headings, or tables. Selecting a parent type includes its subtypes. **None** shows keywords without a type.

In **Entity → General relationships**, inspect type and pattern memberships and compound–contained or synthetic–constituent relationships. Pairs already linked through these general relationships are not repeated as associations. **Source notes** lets you narrow results by source and open the original text.

Entity associations and **Associations** provide these filters:

- **Association type**: shared sentence, list item, table row, table cell, property value, or a connection through a property.
- **Aggregation basis**: **Property**, **Table column combination**, or **Evidence group**.
- **Grouping type**: groups based on entity types, patterns, or keywords. Add **Evidence satisfied** to narrow results using repeated evidence and association scores.

Different filters apply together. For association type and aggregation basis, **AND** requires all selected conditions within the same pair. Expand cards to follow **Connection type → Aggregation basis → Source evidence**. Types and patterns appear as `{{Editor}}`; keywords keep their original names. Use **Previous** and **Next** for more pages.

The **association score** measures connection strength, not probability. The **generalization score** shows recurrence across different pairs and notes. Check the source for specific meanings and direction. Unevaluated results show **Not evaluated**.

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

### 🔲 Focus View (Note Page Section Only)

- Can be enabled in Extension Settings.
- In note screens, click the 'Maximize' icon in the header to hide navigation bars, search bars, and bottom navigation/TOC sections, focusing entirely on the note body.
- You can return to the standard view at any time by clicking the 'Restore' icon in the top right or by pressing the `Escape` key.

### 🔄 Notebook Sync (Local Account - My Account Synchronization)

Synchronize notes and boards between your local account and your online account.

- While signed in and using Notebook mode, the Sync button in the sidebar and Discovery tab shows the number of changed files.
- If there is no matching local notebook, follow the prompt to choose a folder.
- Compare changes on the sync screen before applying them. Smart sync gives priority to the latest revision.
- If the same note was edited on both sides, choose **Reflect Local Account** or **Reflect My Account**.
- Enable **Auto-sync** to apply items without conflicts automatically. Resolve conflicting items manually.
- Choose whether to check for changes when opening the screen or saving a note. Use manual refresh to check at any time.

---

## 📞 Contact

If you have feature suggestions, bug reports, or questions, feel free to reach out:

- Email: [ydh051541@naver.com](mailto:ydh051541@naver.com)
- GitHub Issues: [https://github.com/blacktokki/blacktokki-notebook/issues](https://github.com/blacktokki/blacktokki-notebook/issues)
