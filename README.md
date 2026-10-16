# Ranking Board

A tactile, minimal, single-page visual ranking and ordering workspace inspired by Linear, Are.na, and Apple. Built with zero-build static architecture for GitHub Pages.

---

## Features

- **Strict Editorial Aesthetic**: Curated warm neutral palette (`#F7F5F0`) with pitch-black dark mode (`#0D0D0D`). Pure geometric UI typography paired with `JetBrains Mono` for live rank badges (`01`, `02`, `03`...). Zero marketing fluff or unnecessary subtext.
- **Three Layout Views**:
  - `List`: Single-column horizontal rows with compact thumbnail, large rank index, title, and drag handle.
  - `4 Col`: Vertical poster cards with top-left rank badges.
  - `8 Col`: High-density bird's-eye overview for organizing 20+ items at once.
- **Physics-Based Drag-and-Drop**: Snappy 180ms reordering powered by SortableJS with instant rank index recalculation.
- **Review & Name Center-Stage Carousel**:
  - Automatically cleans filenames (e.g. `dune_part_two.webp` → `Dune Part Two`).
  - Full-screen horizontal snap carousel (`scroll-snap-type: x mandatory`).
  - Active center card scales up (`scale(1.12)`).
  - Offscreen HTML5 Canvas dominant color extraction generates dynamic ambient radial back-glow.
  - Direct keyboard workflow (`Enter` or `Right Arrow` advances to next slide; `Escape` exits).
- **Format Support**: Native support for `.webp`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, and `.avif`.
- **High-Resolution PDF Export**: Native client-side PDF document generation formatted cleanly across pages for List, 4-Column, or 8-Column layouts.
- **Local Persistence**: Integrated `IndexedDB` storage safely stores large image data URLs without hitting standard 5MB `localStorage` limits.

---

## Local Development & Preview

Because this is a zero-build static web application, you can run it locally with any simple static server:

```bash
# Using Python 3
python3 -m http.server 8000
```

Then open your browser to `http://localhost:8000`.

---

## Deploying to GitHub Pages

This project is configured to deploy directly to GitHub Pages at:
**https://github.com/Ssingh132006/ranking-board**

### Step-by-Step Push Instructions

Open your terminal in the project directory and run the following commands:

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Add all files
git add .

# 3. Create initial commit
git commit -m "feat: complete visual ranking board with webp support, dynamic glow carousel, and pdf export"

# 4. Set default branch to main
git branch -M main

# 5. Add your GitHub repository remote
git remote add origin https://github.com/Ssingh132006/ranking-board.git

# 6. Push to GitHub
git push -u origin main
```

*(If your remote repository already has an initial README or commit, run `git pull origin main --rebase` before `git push -u origin main`)*.

### Activating GitHub Pages in GitHub UI

1. Open your repository at: **https://github.com/Ssingh132006/ranking-board**
2. Click **Settings** (top navigation tab).
3. In the left sidebar, click **Pages** (under the "Code and automation" section).
4. Under **Build and deployment** > **Source**:
   - Choose **GitHub Actions** (the included `.github/workflows/deploy.yml` workflow will automatically build and publish your site upon each push to `main`).
   - *Alternatively*: If you prefer branch deployment without Actions, select **Deploy from a branch**, choose `main` branch, and set the folder to `/ (root)`, then click **Save**.
5. Within 1–2 minutes, your live site URL will be displayed at the top of the Pages settings page (e.g., `https://ssingh132006.github.io/ranking-board/`).

---

## License

MIT
