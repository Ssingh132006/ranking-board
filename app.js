/**
 * RANKING BOARD - CORE APPLICATION LOGIC
 * Minimal, Tactile Visual Ranking & Ordering Engine
 */

(function () {
  'use strict';

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================
  const state = {
    items: [],
    workspaceTitle: 'Untitled List',
    viewMode: 'list', // 'list' | 'grid-4' | 'grid-8'
    theme: 'light',
    stagedFiles: [],
    currentStageIndex: 0,
    exportLayout: 'list',
    sortableInstance: null
  };

  // =========================================================================
  // DOM REFERENCES
  // =========================================================================
  const DOM = {
    workspaceTitle: document.getElementById('workspaceTitle'),
    segmentedControl: document.querySelector('.segmented-control'),
    segmentBtns: document.querySelectorAll('.segment-btn'),
    addItemsBtn: document.getElementById('addItemsBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    fileInput: document.getElementById('fileInput'),
    emptyDropzone: document.getElementById('emptyDropzone'),
    itemsContainer: document.getElementById('itemsContainer'),
    windowDragOverlay: document.getElementById('windowDragOverlay'),

    // Carousel Modal
    carouselModal: document.getElementById('carouselModal'),
    centerGlowBackdrop: document.getElementById('centerGlowBackdrop'),
    carouselCounter: document.getElementById('carouselCounter'),
    closeCarouselBtn: document.getElementById('closeCarouselBtn'),
    carouselStrip: document.getElementById('carouselStrip'),
    prevSlideBtn: document.getElementById('prevSlideBtn'),
    nextSlideBtn: document.getElementById('nextSlideBtn'),
    carouselNameInput: document.getElementById('carouselNameInput'),
    discardCarouselBtn: document.getElementById('discardCarouselBtn'),
    saveCarouselBtn: document.getElementById('saveCarouselBtn'),

    // Export Modal
    exportModal: document.getElementById('exportModal'),
    closeExportBtn: document.getElementById('closeExportBtn'),
    cancelExportBtn: document.getElementById('cancelExportBtn'),
    exportSegmentBtns: document.querySelectorAll('.export-segment-btn'),
    generatePdfBtn: document.getElementById('generatePdfBtn'),

    // Clear Modal
    confirmClearModal: document.getElementById('confirmClearModal'),
    closeClearModalBtn: document.getElementById('closeClearModalBtn'),
    cancelClearBtn: document.getElementById('cancelClearBtn'),
    confirmClearBtn: document.getElementById('confirmClearBtn')
  };

  // =========================================================================
  // INDEXEDDB STORAGE LAYER (Large Image Blobs & Persistence)
  // =========================================================================
  const DB_NAME = 'RankingBoardDB';
  const DB_VERSION = 1;
  const STORE_ITEMS = 'items';
  const STORE_SETTINGS = 'settings';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_ITEMS)) {
          db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
    });
  }

  async function loadStateFromDB() {
    try {
      const db = await openDatabase();

      // Load Settings
      const settingsTx = db.transaction(STORE_SETTINGS, 'readonly');
      const settingsStore = settingsTx.objectStore(STORE_SETTINGS);

      const getTitleReq = settingsStore.get('workspaceTitle');
      const getViewReq = settingsStore.get('viewMode');
      const getThemeReq = settingsStore.get('theme');

      await new Promise((resolve) => {
        settingsTx.oncomplete = resolve;
      });

      if (getTitleReq.result) state.workspaceTitle = getTitleReq.result.value;
      if (getViewReq.result) state.viewMode = getViewReq.result.value;
      if (getThemeReq.result) state.theme = getThemeReq.result.value;

      // Load Items
      const itemsTx = db.transaction(STORE_ITEMS, 'readonly');
      const itemsStore = itemsTx.objectStore(STORE_ITEMS);
      const itemsReq = itemsStore.getAll();

      await new Promise((resolve) => {
        itemsTx.oncomplete = resolve;
      });

      const loadedItems = itemsReq.result || [];
      // Sort by order index if present
      loadedItems.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      state.items = loadedItems;
    } catch (err) {
      console.warn('Could not read from IndexedDB, using defaults:', err);
    }
  }

  async function saveItemsToDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);

      // Clear existing and rewrite in current order
      store.clear();
      state.items.forEach((item, index) => {
        store.put({
          ...item,
          orderIndex: index
        });
      });

      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('Failed to save items to IndexedDB:', err);
    }
  }

  async function saveSettingToDB(key, value) {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      store.put({ key, value });
    } catch (err) {
      console.error(`Failed to save setting ${key}:`, err);
    }
  }

  async function clearDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORE_ITEMS, STORE_SETTINGS], 'readwrite');
      tx.objectStore(STORE_ITEMS).clear();
      // Keep theme but reset title
      tx.objectStore(STORE_SETTINGS).delete('workspaceTitle');
      return new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
    } catch (err) {
      console.error('Failed to clear database:', err);
    }
  }

  // =========================================================================
  // COLOR EXTRACTION & UTILITIES
  // =========================================================================

  /**
   * Cleans raw filenames into editorial, human-crafted titles.
   * Strips extensions (.webp, .png, .jpg, etc.), replaces hyphens/underscores,
   * and applies clean Title Casing.
   */
  function cleanFilename(filename) {
    if (!filename) return 'Untitled';
    let name = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    name = name.replace(/[-_+.]/g, ' '); // Replace separators with spaces
    name = name.replace(/\s+/g, ' ').trim(); // Normalize spaces
    return name.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Format rank number to strict 2-digit monospace string (01, 02, etc.)
   */
  function formatRank(num) {
    return String(num).padStart(2, '0');
  }

  /**
   * Fast, reliable dominant & vibrant color extraction using offscreen canvas.
   * Samples pixels and returns an RGB string for ambient glow.
   */
  function extractDominantColor(img) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const size = 32;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imgData = ctx.getImageData(0, 0, size, size).data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      let bestVibrancy = -1;
      let vibrantColor = [180, 180, 180];

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        if (a < 128) continue; // Skip transparency

        const brightness = (r + g + b) / 3;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;

        // Score vibrancy: colorfulness + balanced luminance
        if (brightness > 25 && brightness < 235) {
          const score = saturation * 2 + (1 - Math.abs(brightness - 128) / 128);
          if (score > bestVibrancy) {
            bestVibrancy = score;
            vibrantColor = [r, g, b];
          }
        }

        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }

      if (bestVibrancy > 0.4) {
        return `rgb(${vibrantColor[0]}, ${vibrantColor[1]}, ${vibrantColor[2]})`;
      }
      if (count > 0) {
        return `rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`;
      }
    } catch (e) {
      console.warn('Dominant color fallback triggered:', e);
    }
    return 'rgb(140, 140, 140)';
  }

  // =========================================================================
  // VIEW SWITCHING & RENDERING
  // =========================================================================

  function setViewMode(view) {
    state.viewMode = view;
    saveSettingToDB('viewMode', view);

    DOM.segmentBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    DOM.itemsContainer.className = `items-container view-${view}`;
    renderWorkspace();
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    saveSettingToDB('theme', theme);
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  }

  function renderWorkspace() {
    const { items, viewMode } = state;

    if (items.length === 0) {
      DOM.emptyDropzone.style.display = 'flex';
      DOM.itemsContainer.style.display = 'none';
      DOM.itemsContainer.innerHTML = '';
      if (state.sortableInstance) {
        state.sortableInstance.destroy();
        state.sortableInstance = null;
      }
      return;
    }

    DOM.emptyDropzone.style.display = 'none';
    DOM.itemsContainer.style.display = viewMode === 'list' ? 'flex' : 'grid';

    // Build DOM elements
    DOM.itemsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.id = item.id;

      const rankText = formatRank(index + 1);

      if (viewMode === 'list') {
        card.innerHTML = `
          <span class="rank-index">${rankText}</span>
          <div class="item-thumb-wrapper">
            <img src="${item.dataUrl}" alt="${item.title}" loading="lazy">
          </div>
          <div class="item-content">
            <span class="item-title" contenteditable="true" spellcheck="false">${item.title}</span>
          </div>
          <div class="drag-handle" title="Reorder">
            <div class="drag-handle-bar"></div>
            <div class="drag-handle-bar"></div>
            <div class="drag-handle-bar"></div>
          </div>
          <button type="button" class="item-delete-btn" aria-label="Delete">×</button>
        `;
      } else if (viewMode === 'grid-4') {
        card.innerHTML = `
          <div class="item-thumb-wrapper">
            <span class="rank-badge rank-index">${rankText}</span>
            <img src="${item.dataUrl}" alt="${item.title}" loading="lazy">
          </div>
          <div class="item-footer">
            <span class="item-title" contenteditable="true" spellcheck="false">${item.title}</span>
          </div>
          <button type="button" class="item-delete-btn" aria-label="Delete">×</button>
        `;
      } else {
        // grid-8
        card.innerHTML = `
          <div class="item-thumb-wrapper">
            <span class="rank-badge rank-index">${rankText}</span>
            <img src="${item.dataUrl}" alt="${item.title}" loading="lazy">
          </div>
          <div class="item-footer">
            <span class="item-title" contenteditable="true" spellcheck="false">${item.title}</span>
          </div>
          <button type="button" class="item-delete-btn" aria-label="Delete">×</button>
        `;
      }

      // Inline Title Edit Listener
      const titleSpan = card.querySelector('.item-title');
      titleSpan.addEventListener('blur', () => {
        const newTitle = titleSpan.textContent.trim() || 'Untitled';
        titleSpan.textContent = newTitle;
        item.title = newTitle;
        saveItemsToDB();
      });

      titleSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleSpan.blur();
        }
      });

      // Delete Button Listener
      const deleteBtn = card.querySelector('.item-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id);
      });

      fragment.appendChild(card);
    });

    DOM.itemsContainer.appendChild(fragment);

    // Re-init SortableJS
    initSortable();
  }

  function updateRankBadges() {
    const cards = DOM.itemsContainer.children;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rankEl = card.querySelector('.rank-index');
      if (rankEl) {
        rankEl.textContent = formatRank(i + 1);
      }
    }
  }

  function deleteItem(id) {
    state.items = state.items.filter((item) => item.id !== id);
    saveItemsToDB();
    renderWorkspace();
  }

  function initSortable() {
    if (state.sortableInstance) {
      state.sortableInstance.destroy();
      state.sortableInstance = null;
    }

    if (state.items.length === 0) return;

    state.sortableInstance = new Sortable(DOM.itemsContainer, {
      animation: 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      handle: state.viewMode === 'list' ? '.drag-handle, .item-card' : '.item-card',
      filter: '.item-title, .item-delete-btn',
      preventOnFilter: false,
      onEnd: function () {
        const newOrderIds = Array.from(DOM.itemsContainer.children).map((el) => el.dataset.id);
        state.items.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
        updateRankBadges();
        saveItemsToDB();
      }
    });
  }

  // =========================================================================
  // FILE UPLOAD & HORIZONTAL CENTER-STAGE CAROUSEL
  // =========================================================================

  function handleFilesSelected(files) {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/') || /\.(webp|png|jpe?g|gif|svg|avif)$/i.test(file.name)
    );

    if (validFiles.length === 0) return;

    const readPromises = validFiles.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const color = extractDominantColor(img);
            resolve({
              id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              title: cleanFilename(file.name),
              dataUrl: e.target.result,
              dominantColor: color,
              width: img.naturalWidth || 800,
              height: img.naturalHeight || 600
            });
          };
          img.onerror = () => {
            resolve({
              id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              title: cleanFilename(file.name),
              dataUrl: e.target.result,
              dominantColor: 'rgb(140, 140, 140)',
              width: 800,
              height: 600
            });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((staged) => {
      if (staged.length > 0) {
        state.stagedFiles = staged;
        state.currentStageIndex = 0;
        openCarouselModal();
      }
    });
  }

  function openCarouselModal() {
    DOM.carouselStrip.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.stagedFiles.forEach((staged, idx) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.dataset.index = idx;
      slide.innerHTML = `<img src="${staged.dataUrl}" alt="${staged.title}">`;

      slide.addEventListener('click', () => {
        scrollToSlide(idx);
      });

      fragment.appendChild(slide);
    });

    DOM.carouselStrip.appendChild(fragment);
    DOM.carouselModal.classList.add('open');
    DOM.carouselModal.setAttribute('aria-hidden', 'false');

    // Initial positioning
    requestAnimationFrame(() => {
      scrollToSlide(0);
      updateCarouselUI();
      DOM.carouselNameInput.focus();
      DOM.carouselNameInput.select();
    });
  }

  function closeCarouselModal() {
    DOM.carouselModal.classList.remove('open');
    DOM.carouselModal.setAttribute('aria-hidden', 'true');
    state.stagedFiles = [];
    state.currentStageIndex = 0;
    DOM.fileInput.value = '';
  }

  function scrollToSlide(index) {
    if (index < 0 || index >= state.stagedFiles.length) return;
    state.currentStageIndex = index;
    const slides = DOM.carouselStrip.querySelectorAll('.carousel-slide');
    if (slides[index]) {
      const target = slides[index];
      const stripCenter = DOM.carouselStrip.clientWidth / 2;
      const targetCenter = target.offsetLeft + target.offsetWidth / 2;
      DOM.carouselStrip.scrollTo({
        left: targetCenter - stripCenter,
        behavior: 'smooth'
      });
    }
    updateCarouselUI();
  }

  function updateCarouselUI() {
    const total = state.stagedFiles.length;
    const cur = state.currentStageIndex;

    DOM.carouselCounter.textContent = `${formatRank(cur + 1)} / ${formatRank(total)}`;

    // Update slides classes
    const slides = DOM.carouselStrip.querySelectorAll('.carousel-slide');
    slides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === cur);
    });

    // Update input
    const currentItem = state.stagedFiles[cur];
    if (currentItem) {
      DOM.carouselNameInput.value = currentItem.title;

      // Update ambient radial glow color
      const glowColor = currentItem.dominantColor || 'rgba(255,255,255,0.2)';
      DOM.centerGlowBackdrop.style.backgroundColor = glowColor;
    }
  }

  function commitStagedItems() {
    // Save current active input text
    if (state.stagedFiles[state.currentStageIndex]) {
      state.stagedFiles[state.currentStageIndex].title = DOM.carouselNameInput.value.trim() || 'Untitled';
    }

    state.items = [...state.items, ...state.stagedFiles];
    saveItemsToDB();
    renderWorkspace();
    closeCarouselModal();
  }

  // Detect which slide is centered on user manual horizontal scroll
  let carouselScrollTimeout = null;
  DOM.carouselStrip.addEventListener('scroll', () => {
    clearTimeout(carouselScrollTimeout);
    carouselScrollTimeout = setTimeout(() => {
      const slides = Array.from(DOM.carouselStrip.querySelectorAll('.carousel-slide'));
      if (slides.length === 0) return;

      const stripCenter = DOM.carouselStrip.scrollLeft + DOM.carouselStrip.clientWidth / 2;
      let closestIdx = 0;
      let minDistance = Infinity;

      slides.forEach((slide, idx) => {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(stripCenter - slideCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      if (closestIdx !== state.currentStageIndex) {
        state.currentStageIndex = closestIdx;
        updateCarouselUI();
      }
    }, 60);
  });

  // Carousel Name Input Listener
  DOM.carouselNameInput.addEventListener('input', (e) => {
    const cur = state.currentStageIndex;
    if (state.stagedFiles[cur]) {
      state.stagedFiles[cur].title = e.target.value;
    }
  });

  DOM.carouselNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.currentStageIndex < state.stagedFiles.length - 1) {
        scrollToSlide(state.currentStageIndex + 1);
        setTimeout(() => {
          DOM.carouselNameInput.focus();
          DOM.carouselNameInput.select();
        }, 150);
      } else {
        commitStagedItems();
      }
    } else if (e.key === 'ArrowRight' && DOM.carouselNameInput.selectionStart === DOM.carouselNameInput.value.length) {
      if (state.currentStageIndex < state.stagedFiles.length - 1) {
        e.preventDefault();
        scrollToSlide(state.currentStageIndex + 1);
      }
    } else if (e.key === 'ArrowLeft' && DOM.carouselNameInput.selectionStart === 0) {
      if (state.currentStageIndex > 0) {
        e.preventDefault();
        scrollToSlide(state.currentStageIndex - 1);
      }
    }
  });

  // Navigation Arrows
  DOM.prevSlideBtn.addEventListener('click', () => {
    if (state.currentStageIndex > 0) {
      scrollToSlide(state.currentStageIndex - 1);
    }
  });

  DOM.nextSlideBtn.addEventListener('click', () => {
    if (state.currentStageIndex < state.stagedFiles.length - 1) {
      scrollToSlide(state.currentStageIndex + 1);
    }
  });

  DOM.closeCarouselBtn.addEventListener('click', closeCarouselModal);
  DOM.discardCarouselBtn.addEventListener('click', closeCarouselModal);
  DOM.saveCarouselBtn.addEventListener('click', commitStagedItems);

  // Global Keyboard Shortcuts for Carousel
  window.addEventListener('keydown', (e) => {
    if (!DOM.carouselModal.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeCarouselModal();
    }
  });

  // =========================================================================
  // PDF EXPORT GENERATOR (Native jsPDF with Canvas Image Conversion)
  // =========================================================================

  function openExportModal() {
    state.exportLayout = state.viewMode;
    DOM.exportSegmentBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.exportLayout === state.exportLayout);
    });
    DOM.exportModal.classList.add('open');
    DOM.exportModal.setAttribute('aria-hidden', 'false');
  }

  function closeExportModal() {
    DOM.exportModal.classList.remove('open');
    DOM.exportModal.setAttribute('aria-hidden', 'true');
  }

  DOM.exportSegmentBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.exportSegmentBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.exportLayout = btn.dataset.exportLayout;
    });
  });

  DOM.exportBtn.addEventListener('click', openExportModal);
  DOM.closeExportBtn.addEventListener('click', closeExportModal);
  DOM.cancelExportBtn.addEventListener('click', closeExportModal);

  /**
   * Converts any image data URL (including .webp, .svg) to a safe PNG Data URL
   * to guarantee universal rendering inside jsPDF without format errors.
   */
  function convertImageToPngDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve({
          pngDataUrl: canvas.toDataURL('image/png'),
          aspectRatio: canvas.width / canvas.height
        });
      };
      img.onerror = () => {
        resolve({ pngDataUrl: dataUrl, aspectRatio: 1 });
      };
      img.src = dataUrl;
    });
  }

  DOM.generatePdfBtn.addEventListener('click', async () => {
    if (state.items.length === 0) {
      closeExportModal();
      return;
    }

    DOM.generatePdfBtn.textContent = 'Generating...';
    DOM.generatePdfBtn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;
      const layout = state.exportLayout;
      const isLandscape = layout === 'grid-8';

      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      let currentY = margin + 12;

      // Render Title on first page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text(state.workspaceTitle || 'Untitled List', margin, margin + 4);

      // Subtle divider line
      doc.setDrawColor(220, 218, 210);
      doc.setLineWidth(0.3);
      doc.line(margin, margin + 8, pageWidth - margin, margin + 8);

      // Pre-convert all images for fast, reliable insertion
      const convertedImages = await Promise.all(
        state.items.map((item) => convertImageToPngDataUrl(item.dataUrl))
      );

      if (layout === 'list') {
        // LIST VIEW (1 Column)
        const rowHeight = 22;
        const thumbWidth = 20;

        for (let i = 0; i < state.items.length; i++) {
          const item = state.items[i];
          const imgInfo = convertedImages[i];

          // Page overflow check
          if (currentY + rowHeight > pageHeight - margin) {
            doc.addPage();
            currentY = margin + 8;
          }

          // Rank number (Courier for monospace aesthetic)
          doc.setFont('courier', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(80, 80, 80);
          doc.text(formatRank(i + 1), margin, currentY + 12);

          // Image Thumbnail
          const imgX = margin + 12;
          const imgY = currentY + 2;
          const thumbHeight = 16;
          doc.addImage(imgInfo.pngDataUrl, 'PNG', imgX, imgY, thumbWidth, thumbHeight, undefined, 'FAST');

          // Title
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(20, 20, 20);
          const maxTextWidth = pageWidth - margin - (imgX + thumbWidth + 8);
          const lines = doc.splitTextToSize(item.title, maxTextWidth);
          doc.text(lines, imgX + thumbWidth + 8, currentY + 11);

          // Subtle row divider
          doc.setDrawColor(240, 238, 232);
          doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

          currentY += rowHeight;
        }
      } else if (layout === 'grid-4') {
        // 4-COLUMN GRID
        const cols = 4;
        const colGap = 6;
        const colWidth = (pageWidth - margin * 2 - colGap * (cols - 1)) / cols;
        const cardHeight = colWidth * 0.95 + 16;

        let colIdx = 0;

        for (let i = 0; i < state.items.length; i++) {
          const item = state.items[i];
          const imgInfo = convertedImages[i];

          if (colIdx === 0 && currentY + cardHeight > pageHeight - margin) {
            doc.addPage();
            currentY = margin + 8;
          }

          const cardX = margin + colIdx * (colWidth + colGap);
          const imgH = colWidth * 0.75;

          // Image
          doc.addImage(imgInfo.pngDataUrl, 'PNG', cardX, currentY, colWidth, imgH, undefined, 'FAST');

          // Rank Badge overlay in top left
          doc.setFillColor(20, 20, 20);
          doc.rect(cardX + 2, currentY + 2, 8, 4.5, 'F');
          doc.setFont('courier', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(formatRank(i + 1), cardX + 3, currentY + 5.3);

          // Title below
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(20, 20, 20);
          const titleLines = doc.splitTextToSize(item.title, colWidth);
          doc.text(titleLines[0] || '', cardX, currentY + imgH + 5);

          colIdx++;
          if (colIdx >= cols) {
            colIdx = 0;
            currentY += cardHeight;
          }
        }
      } else {
        // 8-COLUMN GRID (Landscape)
        const cols = 8;
        const colGap = 4;
        const colWidth = (pageWidth - margin * 2 - colGap * (cols - 1)) / cols;
        const cardHeight = colWidth + 12;

        let colIdx = 0;

        for (let i = 0; i < state.items.length; i++) {
          const item = state.items[i];
          const imgInfo = convertedImages[i];

          if (colIdx === 0 && currentY + cardHeight > pageHeight - margin) {
            doc.addPage();
            currentY = margin + 8;
          }

          const cardX = margin + colIdx * (colWidth + colGap);
          const imgH = colWidth;

          // Image
          doc.addImage(imgInfo.pngDataUrl, 'PNG', cardX, currentY, colWidth, imgH, undefined, 'FAST');

          // Rank badge
          doc.setFillColor(20, 20, 20);
          doc.rect(cardX + 1.5, currentY + 1.5, 6.5, 3.8, 'F');
          doc.setFont('courier', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(255, 255, 255);
          doc.text(formatRank(i + 1), cardX + 2.2, currentY + 4.2);

          // Title
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(20, 20, 20);
          const titleLines = doc.splitTextToSize(item.title, colWidth);
          doc.text(titleLines[0] || '', cardX, currentY + imgH + 4);

          colIdx++;
          if (colIdx >= cols) {
            colIdx = 0;
            currentY += cardHeight;
          }
        }
      }

      const safeFilename = (state.workspaceTitle || 'Ranking_Board')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();
      doc.save(`${safeFilename}_ranking.pdf`);
    } catch (err) {
      console.error('PDF Generation failed:', err);
      alert('Unable to generate PDF. Check console for details.');
    } finally {
      DOM.generatePdfBtn.textContent = 'Download PDF';
      DOM.generatePdfBtn.disabled = false;
      closeExportModal();
    }
  });

  // =========================================================================
  // CLEAR WORKSPACE CONFIRMATION
  // =========================================================================

  DOM.clearBtn.addEventListener('click', () => {
    DOM.confirmClearModal.classList.add('open');
    DOM.confirmClearModal.setAttribute('aria-hidden', 'false');
  });

  function closeClearModal() {
    DOM.confirmClearModal.classList.remove('open');
    DOM.confirmClearModal.setAttribute('aria-hidden', 'true');
  }

  DOM.closeClearModalBtn.addEventListener('click', closeClearModal);
  DOM.cancelClearBtn.addEventListener('click', closeClearModal);

  DOM.confirmClearBtn.addEventListener('click', async () => {
    state.items = [];
    state.workspaceTitle = 'Untitled List';
    DOM.workspaceTitle.textContent = 'Untitled List';
    await clearDB();
    renderWorkspace();
    closeClearModal();
  });

  // =========================================================================
  // GLOBAL LISTENERS & INITIALIZATION
  // =========================================================================

  // Workspace Title Inline Editing
  DOM.workspaceTitle.addEventListener('blur', () => {
    const text = DOM.workspaceTitle.textContent.trim() || 'Untitled List';
    DOM.workspaceTitle.textContent = text;
    state.workspaceTitle = text;
    saveSettingToDB('workspaceTitle', text);
  });

  DOM.workspaceTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      DOM.workspaceTitle.blur();
    }
  });

  // View Switcher Buttons
  DOM.segmentBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setViewMode(btn.dataset.view);
    });
  });

  // Theme Toggle Button
  DOM.themeToggleBtn.addEventListener('click', toggleTheme);

  // File Upload Handlers
  DOM.addItemsBtn.addEventListener('click', () => {
    DOM.fileInput.click();
  });

  DOM.emptyDropzone.addEventListener('click', () => {
    DOM.fileInput.click();
  });

  DOM.fileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  // Window Drag & Drop (Drop anywhere)
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      DOM.windowDragOverlay.classList.add('active');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      DOM.windowDragOverlay.classList.remove('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    DOM.windowDragOverlay.classList.remove('active');

    if (e.dataTransfer && e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });

  // Initialize Application
  async function init() {
    await loadStateFromDB();

    // Rehydrate DOM
    DOM.workspaceTitle.textContent = state.workspaceTitle;
    document.documentElement.setAttribute('data-theme', state.theme);

    setViewMode(state.viewMode);
  }

  init();
})();
