# UI Context

## Theme

Light and dark modes, both supported from day one. The default follows the OS setting, and the user can override it with a toggle. The design language is a calm, warm "study desk": paper-toned light mode and ink-toned dark mode, earthy accents, and a few artistic touches that make it feel handmade rather than like a generic SaaS dashboard. No blue-and-white corporate look anywhere.

Artistic touches (keep them subtle, never at the cost of readability):
- Headings use a serif display font for an editorial, notebook feel
- A very faint paper-grain texture on the page background
- Citation badges styled like small margin stamps
- Source highlighting in the viewer looks like a highlighter pen, not a hard box
- Empty states use simple hand-drawn-style line illustrations

## Art Direction

The interface should feel like old art, not a generic app. Draw inspiration from:
- Illuminated manuscripts: decorative drop caps and ornamental dividers on headings and empty states
- Vintage botanical and scientific plates: fine engraved line illustrations with captions
- Woodblock and etching prints: textured line work, slightly imperfect edges
- Old book and ledger design: ruled lines, margin notes, and framed panels with thin double borders

Rules:
- Decoration frames the content and never covers it; reading and study screens stay clean
- Reuse a small set of ornaments (divider, corner flourish, section mark) instead of many one-off graphics
- Illustrations are drawn in the palette tokens below so they work in both themes
- Motion is gentle: slow fades and page-turn-like transitions, nothing bouncy

### Gallery-site influence (siteinspire)

The owner wants the UI to take inspiration from the art and editorial sites curated on siteinspire.com (browse its Art, Illustration, and Typographic filters). Translate that into an app like this:
- Typography leads: large serif headings, tight hierarchy, generous line spacing
- Editorial grid with plenty of whitespace; occasional asymmetric layouts on landing, empty, and library screens
- Hairline rules and thin borders instead of heavy boxes and shadows
- Restrained palette: the tokens below plus one accent at a time
- Considered hover and focus states (underline draws, soft color shifts) rather than flashy effects
- Work screens (chat, viewer, upload) stay calm and functional; the boldest artistic moments belong on the landing page, library, and empty states

### Reference sites

Owner picks 3–5 siteinspire sites they love and lists them here (URL plus what to borrow: type, layout, motion, or color). Build against this list.

- (none chosen yet)

## Colors

All components must use these tokens as CSS custom properties. No hardcoded hex values in components. Theme is switched by a `data-theme="light" | "dark"` attribute on the root element.

| Role              | CSS Variable        | Light     | Dark      |
| ----------------- | ------------------- | --------- | --------- |
| Page background   | `--bg-base`         | `#F5F0E6` | `#1A1917` |
| Surface           | `--bg-surface`      | `#FFFBF3` | `#24221F` |
| Raised surface    | `--bg-raised`       | `#EFE8DA` | `#2E2B27` |
| Primary text      | `--text-primary`    | `#2B2824` | `#EDE7DA` |
| Muted text        | `--text-muted`      | `#7A7367` | `#9C9588` |
| Primary accent    | `--accent-primary`  | `#4F7355` | `#8FB596` |
| Highlight (cites) | `--accent-highlight`| `#D99A1E` | `#E8B94F` |
| Border            | `--border-default`  | `#DDD4C3` | `#3A3732` |
| Error             | `--state-error`     | `#B5483A` | `#E07A6B` |
| Success           | `--state-success`   | `#7A8F2E` | `#A3B85C` |

Notes:
- Primary accent is a sage green: buttons, active states, links
- Highlight is a warm ochre, used only for citation badges and source highlights in the viewer so citations are instantly recognizable
- Palette is a starting point and is expected to be tuned as the UI is built; change values here first, then in code

## Typography

| Role              | Font           | Variable         |
| ----------------- | -------------- | ---------------- |
| Headings / display| Fraunces       | `--font-display` |
| UI text           | Inter          | `--font-sans`    |
| Code / LaTeX      | JetBrains Mono | `--font-mono`    |

- Use the display font for page titles and section headings only
- Body, buttons, and form text use the sans font
- Math rendered from LaTeX uses KaTeX styling, consistent with the text color tokens

## Border Radius

Slightly rounded throughout. No sharp corners, no pill shapes except badges.

| Context           | Class          |
| ----------------- | -------------- |
| Inline / small UI | `rounded-md`   |
| Cards / panels    | `rounded-lg`   |
| Modals / overlays | `rounded-xl`   |
| Citation badges   | `rounded-full` |

## Component Library

shadcn/ui on top of Tailwind. Components live in `components/ui/`. Use the CLI to add new components rather than writing from scratch. Map shadcn's theme variables to the tokens above so both light and dark modes work automatically.

## Layout Patterns

- App shell (PC): three regions — left sidebar with the folder tree, center area for chat or the note list, right panel for the split-screen viewer
- Left sidebar: fixed width with a border separator; collapsible
- Right viewer panel: hidden by default, slides open when a citation badge is clicked; resizable; scrolls to the cited page and highlights the bounding box
- Chat: message column centered with a comfortable reading width; citation badges inline within answers
- Upload: drag-and-drop zone plus a file picker; shows per-file processing status
- Modals: centered overlay with a soft backdrop blur
- Top bar: workspace title, search, theme toggle, and user menu, with a bottom border
- Share dialog: lists people with their role (Viewer or Editor) and a link option

## Icons

Lucide React. Stroke-based icons only. Sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons.