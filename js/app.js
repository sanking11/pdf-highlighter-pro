
        // Global variables
        let highlightRules = [];
        let uploadedFiles = [];
        let processedFiles = [];
        let editingRuleId = null; // Track which rule is being edited
        let detailedReport = []; // Detailed report for CSV export
        let lifetimeFilesProcessed = 0; // Track total files processed since website launch
        let globalFilesProcessed = 0; // Track global files processed across all users

        // Supabase configuration
        const SUPABASE_URL = 'https://zeyjrzhucptfstjpucht.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpleWpyemh1Y3B0ZnN0anB1Y2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MzM5NTgsImV4cCI6MjA3OTEwOTk1OH0.f3zVK1HY_RZcsk3Kgktr8m-mmnqFroJVOu2Z05OxkNE';
        const { createClient } = window.supabase;
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // PDF.js worker configuration - Use the correct worker path
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // Tesseract.js OCR initialization
        let ocrWorker = null;

        // Initialize OCR worker
        async function initOCRWorker() {
            if (ocrWorker) return ocrWorker;

            try {
                ocrWorker = await Tesseract.createWorker('eng', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                });
                console.log('OCR Worker initialized successfully');
                return ocrWorker;
            } catch (error) {
                console.error('Error initializing OCR worker:', error);
                return null;
            }
        }

        // Check if a PDF page has extractable text
        async function hasExtractableText(pdfPage) {
            try {
                const textContent = await pdfPage.getTextContent();
                const textItems = textContent.items.filter(item => item.str && item.str.trim().length > 0);
                return textItems.length > 5; // Need at least 5 text items to consider it "has text"
            } catch (error) {
                console.error('Error checking text content:', error);
                return false;
            }
        }

        // Helper function to preprocess canvas for better OCR
        function preprocessCanvas(canvas, type = 'original') {
            const processedCanvas = document.createElement('canvas');
            processedCanvas.width = canvas.width;
            processedCanvas.height = canvas.height;
            const ctx = processedCanvas.getContext('2d');

            // Draw original image
            ctx.drawImage(canvas, 0, 0);

            if (type === 'original') {
                return processedCanvas;
            }

            // Get image data for preprocessing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            if (type === 'contrast') {
                // Increase contrast
                const factor = 1.5;
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
                    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
                    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
                }
            } else if (type === 'grayscale') {
                // Convert to grayscale with enhanced contrast
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }
            } else if (type === 'threshold') {
                // Apply adaptive threshold (binarization)
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    const threshold = gray > 128 ? 255 : 0;
                    data[i] = data[i + 1] = data[i + 2] = threshold;
                }
            } else if (type === 'sharpen') {
                // Sharpen for small text
                const originalData = new Uint8ClampedArray(data);
                const width = canvas.width;
                const sharpenKernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

                for (let y = 1; y < canvas.height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        for (let c = 0; c < 3; c++) {
                            let sum = 0;
                            for (let ky = -1; ky <= 1; ky++) {
                                for (let kx = -1; kx <= 1; kx++) {
                                    const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                                    sum += originalData[idx] * sharpenKernel[(ky + 1) * 3 + (kx + 1)];
                                }
                            }
                            const idx = (y * width + x) * 4 + c;
                            data[idx] = Math.min(255, Math.max(0, sum));
                        }
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
            return processedCanvas;
        }

        // Merge adjacent OCR text fragments that should form complete words/phrases
        // This combines fragments like "CATEGORY" + "1" into "CATEGORY 1"
        function mergeAdjacentOCRFragments(textItems, pdfPageDimensions) {
            if (textItems.length === 0) return textItems;

            // Sort items by Y position (top to bottom), then X position (left to right)
            const sorted = [...textItems].sort((a, b) => {
                const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                if (yDiff > 5) { // Different lines
                    return b.transform[5] - a.transform[5]; // Higher Y first (top to bottom in PDF coords)
                }
                return a.transform[4] - b.transform[4]; // Same line, left to right
            });

            const merged = [];
            const used = new Set();

            for (let i = 0; i < sorted.length; i++) {
                if (used.has(i)) continue;

                const item = sorted[i];
                let mergedText = item.str;
                let mergedWidth = item.width;
                let lastMergedItem = item; // Track the last item we merged
                const itemsToMerge = [i];
                let hasWordNumberMerge = false; // Track if we've already done a Word+Number merge

                // Look for adjacent items to merge
                for (let j = i + 1; j < sorted.length; j++) {
                    if (used.has(j)) continue;

                    const nextItem = sorted[j];

                    // Calculate distances using the LAST merged item's position
                    // This ensures we check distance from "erat" to "nisl", not from "ante." to "nisl"
                    const yDiff = Math.abs(lastMergedItem.transform[5] - nextItem.transform[5]);
                    const xDiff = nextItem.transform[4] - (lastMergedItem.transform[4] + lastMergedItem.width);

                    // Debug: Log EVERY time we check nisl (even if not adjacent)
                    if (nextItem.str.toLowerCase() === 'nisl') {
                        console.log(`  🎯 Checking "nisl" with "${mergedText.substring(0, 50)}" → xDiff:${xDiff.toFixed(1)}px, yDiff:${yDiff.toFixed(1)}px, lastMerged:"${lastMergedItem.str}"`);
                    }

                    // Items are adjacent if:
                    // - Same line (yDiff < 5)
                    // - Close horizontally (xDiff < 20 pixels)
                    const isAdjacent = yDiff < 5 && xDiff >= -5 && xDiff < 20;

                    if (!isAdjacent) {
                        // If not on same line anymore, stop looking
                        if (yDiff > 5) break;
                        continue;
                    }

                    // Check if merging makes sense semantically
                    // Pass the xDiff to help decide if items are truly adjacent
                    const shouldMerge = shouldMergeFragments(mergedText, nextItem.str, xDiff);

                    // Debug: Log merge decisions for "donec", "erat", "nisl", "ante"
                    if ((mergedText.toLowerCase().includes('donec') || mergedText.toLowerCase().includes('erat') || mergedText.toLowerCase().includes('ante')) &&
                        (nextItem.str.toLowerCase() === 'nisl' || nextItem.str.toLowerCase() === 'erat' || nextItem.str.toLowerCase() === 'in' || nextItem.str.toLowerCase().includes('donec'))) {
                        console.log(`  🔍 Merge check: "${mergedText.substring(0, 30)}" + "${nextItem.str}" → shouldMerge:${shouldMerge}, xDiff:${xDiff.toFixed(1)}px, yDiff:${yDiff.toFixed(1)}px, isAdjacent:${isAdjacent}`);
                    }

                    if (shouldMerge) {
                        // Check if this is a Word+Number merge
                        const isWordNumberMerge = /^[a-zA-Z\s]+$/.test(mergedText.trim()) && /^\d+$/.test(nextItem.str.trim());

                        // If we already did a Word+Number merge, don't do another one
                        // This prevents "CATEGORY 1" from becoming "CATEGORY 11"
                        if (hasWordNumberMerge && isWordNumberMerge) {
                            break; // Stop merging for this item
                        }

                        // Determine if we need a space between fragments
                        // Always add space if merging two text items with letters (to prevent "Donecinerat")
                        const t1HasLetters = /[a-zA-Z]/.test(mergedText);
                        const t2HasLetters = /[a-zA-Z]/.test(nextItem.str);
                        const bothHaveLetters = t1HasLetters && t2HasLetters;

                        // Add space if: gap > 3px OR merging two text items with letters
                        const needsSpace = xDiff > 3 || bothHaveLetters;
                        mergedText += (needsSpace ? ' ' : '') + nextItem.str;
                        mergedWidth = (nextItem.transform[4] + nextItem.width) - item.transform[4];
                        itemsToMerge.push(j);

                        // Update lastMergedItem to track the rightmost item we've merged
                        lastMergedItem = nextItem;

                        // Mark that we've done a Word+Number merge
                        if (isWordNumberMerge) {
                            hasWordNumberMerge = true;
                        }
                    }
                }

                // Mark all merged items as used
                itemsToMerge.forEach(idx => {
                    // Debug: Log when nisl gets marked as used
                    if (sorted[idx].str.toLowerCase() === 'nisl') {
                        console.log(`  ⚠️ Marking "nisl" as USED (merged into "${mergedText}")`);
                    }
                    used.add(idx);
                });

                // Debug: Log final merged result for items containing donec
                if (mergedText.toLowerCase().includes('donec')) {
                    console.log(`  ✅ Final merged item: "${mergedText}" (merged ${itemsToMerge.length} fragments)`);
                }

                // Create merged item
                merged.push({
                    str: mergedText,
                    transform: item.transform, // Keep original position
                    width: mergedWidth,
                    height: item.height,
                    confidence: item.confidence,
                    fromOCR: item.fromOCR || false
                });
            }

            return merged;
        }

        // Determine if two text fragments should be merged
        function shouldMergeFragments(text1, text2, xDiff = 10) {
            const t1 = text1.trim();
            const t2 = text2.trim();

            if (!t1 || !t2) return false;

            // CRITICAL: Don't merge sentence endings with new sentences
            // If t1 ends with ". " or just "." and t2 starts with capital, they're different sentences
            if (/[.!?]\s*$/.test(t1) && /^[A-Z]/.test(t2)) {
                return false;
            }

            // Check for numbers and words
            const t1IsNumber = /^\d+$/.test(t1);
            const t2IsNumber = /^\d+$/.test(t2);
            const t1IsWord = /^[a-zA-Z]+$/.test(t1);
            const t2IsWord = /^[a-zA-Z]+$/.test(t2);
            // Check if text contains letters (even with punctuation/spaces)
            const t1HasLetters = /[a-zA-Z]/.test(t1);
            const t2HasLetters = /[a-zA-Z]/.test(t2);

            // PATTERN 1: Word + Single Digit Number (e.g., "CATEGORY" + "1")
            // Only merge if the number is a SINGLE digit to avoid merging table data
            if (t1IsWord && t2IsNumber && t2.length === 1) {
                return true;
            }

            // PATTERN 2: Single Digit Number + Word (e.g., "1" + "st")
            if (t1IsNumber && t1.length === 1 && t2IsWord) {
                return true;
            }

            // PATTERN 3: Single character + anything (for special chars, punctuation)
            // But ONLY if it's not a common word
            if ((t1.length === 1 && !t1IsWord) || (t2.length === 1 && !t2IsWord)) {
                return true;
            }

            // PATTERN 4: Text with letters + Word, ONLY if VERY close (< 8 pixels)
            // This handles cases like "nulla, non" + "consequat"
            if (t1HasLetters && t2IsWord && xDiff < 8) {
                return true;
            }

            // PATTERN 5: Word + Word, ONLY if they're VERY close (< 8 pixels apart)
            // This handles cases like "non" + "consequat" OR "Donec in erat" + "nisl" OR "erat" + "nisl."
            // Check if t1 ends with a word (for merged text like "ante. Donec in erat")
            // Check if t2 starts with a word (for text with punctuation like "nisl.")
            const t1EndsWithWord = /[a-zA-Z]+$/.test(t1);
            const t2StartsWithWord = /^[a-zA-Z]+/.test(t2);
            if (t1EndsWithWord && t2StartsWithWord && xDiff < 8) {
                return true;
            }

            return false;
        }

        // Perform OCR on a PDF page and return text with positions
        // Enhanced with multiple passes and preprocessing
        async function performOCR(pdfPage, pdfPageDimensions) {
            try {
                // Initialize OCR worker if not already done
                const worker = await initOCRWorker();
                if (!worker) {
                    throw new Error('OCR worker not available');
                }

                // Use a higher scale for better OCR accuracy
                const scale = 2.0;
                const viewport = pdfPage.getViewport({ scale: scale });

                // Render page to canvas
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                await pdfPage.render(renderContext).promise;

                // IMPROVEMENT 2 & 3: Multiple OCR passes with different preprocessing
                const preprocessTypes = ['original', 'contrast', 'sharpen', 'grayscale', 'threshold'];
                const allWords = new Map(); // Use Map to deduplicate by position

                for (const preprocessType of preprocessTypes) {
                    const processedCanvas = preprocessCanvas(canvas, preprocessType);

                    // IMPROVEMENT 1: Lower confidence threshold to catch more variations
                    const { data } = await worker.recognize(processedCanvas, {
                        tessedit_char_whitelist: '',
                        tessedit_pageseg_mode: '1', // Auto page segmentation with OSD
                    });

                    // Process words from this pass
                    if (data.words && data.words.length > 0) {
                        data.words.forEach(word => {
                            // IMPROVEMENT 1: Accept lower confidence words (threshold 30 instead of default 60)
                            if (word.text && word.text.trim().length > 0 && word.confidence >= 30) {
                                // Create a position key for deduplication
                                const posKey = `${Math.round(word.bbox.x0 / 5)}-${Math.round(word.bbox.y0 / 5)}`;

                                // Keep the word with highest confidence for each position
                                if (!allWords.has(posKey) || allWords.get(posKey).confidence < word.confidence) {
                                    allWords.set(posKey, word);
                                }
                            }
                        });
                    }
                }

                // Convert deduplicated words to text items
                const textItems = [];
                for (const word of allWords.values()) {
                    // Tesseract coordinates are in canvas pixels (scaled by 2.0)
                    // Need to convert back to PDF page coordinates

                    // Scale down from canvas to PDF coordinates
                    const x = word.bbox.x0 / scale;
                    const width = (word.bbox.x1 - word.bbox.x0) / scale;
                    const height = (word.bbox.y1 - word.bbox.y0) / scale;

                    // Flip Y coordinate: Tesseract uses top-left origin, PDF uses bottom-left
                    // Tesseract y0 is top of text, y1 is bottom
                    // PDF y is at the baseline (bottom-left origin)
                    // The highlight function draws at y-2 with height+4, so we need the baseline
                    // For OCR, baseline is approximately at y1 (bottom of bounding box)
                    const y = pdfPageDimensions.height - (word.bbox.y1 / scale);

                    // For the transform matrix, we need to encode the font size
                    // The height gives us approximate font size for proper highlighting
                    const fontSize = height;

                    textItems.push({
                        str: word.text,
                        transform: [fontSize, 0, 0, fontSize, x, y], // [scaleX, skewY, skewX, scaleY, x, y]
                        width: width,
                        height: height,
                        confidence: word.confidence,
                        fromOCR: true // Flag to indicate this came from OCR
                    });
                }

                console.log(`OCR found ${textItems.length} text items using ${preprocessTypes.length} preprocessing passes`);

                // POST-PROCESSING: Merge adjacent text fragments to form complete words/phrases
                // This helps combine "CATEGORY" + "1" into "CATEGORY 1"
                const mergedItems = mergeAdjacentOCRFragments(textItems, pdfPageDimensions);
                console.log(`After merging: ${mergedItems.length} text items (merged ${textItems.length - mergedItems.length} fragments)`);

                return {
                    items: mergedItems
                };
            } catch (error) {
                console.error('OCR Error:', error);
                return { items: [] };
            }
        }

        // IMPROVEMENT 5: Fuzzy text matching using Levenshtein distance
        function levenshteinDistance(str1, str2) {
            const len1 = str1.length;
            const len2 = str2.length;
            const matrix = [];

            // Initialize matrix
            for (let i = 0; i <= len1; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= len2; j++) {
                matrix[0][j] = j;
            }

            // Fill matrix
            for (let i = 1; i <= len1; i++) {
                for (let j = 1; j <= len2; j++) {
                    const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,      // deletion
                        matrix[i][j - 1] + 1,      // insertion
                        matrix[i - 1][j - 1] + cost // substitution
                    );
                }
            }

            return matrix[len1][len2];
        }

        // Fuzzy match function - returns true if strings are similar enough
        function fuzzyMatch(text1, text2, threshold = 0.85) {
            // Normalize both strings: lowercase, remove spaces and hyphens
            const normalized1 = text1.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
            const normalized2 = text2.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');

            // Exact match after normalization
            if (normalized1 === normalized2) return true;

            // Calculate similarity using Levenshtein distance
            const maxLen = Math.max(normalized1.length, normalized2.length);

            if (maxLen === 0) return true;

            // Strict length check: lengths must be exactly the same or differ by max 1-2 characters
            // This prevents "CheckMyTrip" (11 chars) from matching "CheckMyTripApp" (14 chars)
            const lengthDiff = Math.abs(normalized1.length - normalized2.length);
            if (lengthDiff > 2) return false;

            const distance = levenshteinDistance(normalized1, normalized2);
            const similarity = 1 - (distance / maxLen);

            return similarity >= threshold;
        }

        // Load saved rules from localStorage on startup
        function loadSavedRules() {
            try {
                const savedRules = localStorage.getItem('pdfHighlighterRules');
                if (savedRules) {
                    highlightRules = JSON.parse(savedRules);
                    displayRules();
                    updateProcessButton();
                    console.log('Loaded', highlightRules.length, 'saved rules');
                }
            } catch (error) {
                console.error('Error loading saved rules:', error);
            }
        }

        // Load lifetime files processed count from localStorage
        function loadLifetimeCount() {
            try {
                const savedCount = localStorage.getItem('pdfHighlighterLifetimeCount');
                if (savedCount) {
                    lifetimeFilesProcessed = parseInt(savedCount) || 0;
                    console.log('Loaded lifetime count:', lifetimeFilesProcessed, 'files processed');
                }
            } catch (error) {
                console.error('Error loading lifetime count:', error);
            }
        }

        // Save lifetime files processed count to localStorage
        function saveLifetimeCount() {
            try {
                localStorage.setItem('pdfHighlighterLifetimeCount', lifetimeFilesProcessed.toString());
                console.log('Saved lifetime count:', lifetimeFilesProcessed);
            } catch (error) {
                console.error('Error saving lifetime count:', error);
            }
        }

        // Fetch global files processed count from Supabase
        async function fetchGlobalCount() {
            try {
                console.log('Fetching global count from Supabase...');
                const { data, error } = await supabaseClient
                    .from('global_stats')
                    .select('total_files_processed')
                    .eq('id', 1)
                    .single();

                if (error) {
                    console.error('Error fetching global count:', error);
                    console.log('This may be because the global_stats table does not exist or is not accessible');
                    return 0;
                }

                globalFilesProcessed = data.total_files_processed || 0;
                console.log('✓ Successfully fetched global count:', globalFilesProcessed);
                return globalFilesProcessed;
            } catch (error) {
                console.error('Error fetching global count:', error);
                console.log('Global counter will remain at 0');
                return 0;
            }
        }

        // Update global files processed count in Supabase
        async function updateGlobalCount(filesCount) {
            try {
                console.log(`Updating global count (adding ${filesCount} files)...`);

                // First, fetch the current count
                const { data: currentData, error: fetchError } = await supabaseClient
                    .from('global_stats')
                    .select('total_files_processed')
                    .eq('id', 1)
                    .single();

                if (fetchError) {
                    console.error('Error fetching current global count:', fetchError);
                    console.log('Unable to update global statistics - database may not be configured');
                    return false;
                }

                const currentTotal = currentData.total_files_processed || 0;
                const newTotal = currentTotal + filesCount;
                console.log(`Current global total: ${currentTotal}, New total: ${newTotal}`);

                // Update with new total
                const { error: updateError } = await supabaseClient
                    .from('global_stats')
                    .update({
                        total_files_processed: newTotal,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', 1);

                if (updateError) {
                    console.error('Error updating global count:', updateError);
                    return false;
                }

                globalFilesProcessed = newTotal;
                console.log('✓ Successfully updated global count to:', globalFilesProcessed);
                return true;
            } catch (error) {
                console.error('Error updating global count:', error);
                console.log('Global counter update failed - continuing without it');
                return false;
            }
        }

        // Save rules to localStorage
        function saveRulesToStorage() {
            try {
                localStorage.setItem('pdfHighlighterRules', JSON.stringify(highlightRules));
                console.log('Saved', highlightRules.length, 'rules to storage');
            } catch (error) {
                console.error('Error saving rules:', error);
            }
        }

        // Edit rule - populate form with rule data
        function editRule(id) {
            const rule = highlightRules.find(r => r.id === id);
            if (!rule) return;

            // Populate form
            document.getElementById('wordInput').value = rule.word;
            document.getElementById('colorInput').value = rule.color;
            document.getElementById('opacityInput').value = rule.opacity;
            document.getElementById('exactMatchInput').checked = rule.exactMatch || false;
            document.getElementById('caseSensitiveInput').checked = rule.caseSensitive || false;
            document.getElementById('useOCRInput').checked = rule.useOCR || false;

            // Change button to "Update Rule"
            const addBtn = document.getElementById('addRuleBtn');
            addBtn.textContent = 'Update Rule';
            addBtn.style.background = 'linear-gradient(135deg, #00aa00, #00dd00)';

            // Show cancel button
            document.getElementById('cancelEditBtn').style.display = 'inline-block';

            // Store the ID being edited
            editingRuleId = id;

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Cancel edit mode
        function cancelEdit() {
            editingRuleId = null;
            const addBtn = document.getElementById('addRuleBtn');
            addBtn.textContent = 'Add Rule';
            addBtn.style.background = 'linear-gradient(135deg, #ff6b00, #ff9933)';
            
            // Hide cancel button
            document.getElementById('cancelEditBtn').style.display = 'none';
            
            // Clear inputs
            document.getElementById('wordInput').value = '';
            document.getElementById('colorInput').value = '#ffff00';
            document.getElementById('opacityInput').value = '0.3';
            document.getElementById('exactMatchInput').checked = false;
            document.getElementById('caseSensitiveInput').checked = false;
            document.getElementById('useOCRInput').checked = false;
        }

        // Add highlighting rule
        function addRule() {
            const word = document.getElementById('wordInput').value.trim();
            const color = document.getElementById('colorInput').value;
            const opacity = parseFloat(document.getElementById('opacityInput').value);
            const exactMatch = document.getElementById('exactMatchInput').checked;
            const caseSensitive = document.getElementById('caseSensitiveInput').checked;
            const useOCR = document.getElementById('useOCRInput').checked;

            if (!word) {
                alert('Please enter a word or phrase to highlight');
                return;
            }

            if (opacity < 0 || opacity > 1) {
                alert('Opacity must be between 0 and 1');
                return;
            }

            // Check for duplicate word (case-insensitive check)
            const duplicateRule = highlightRules.find(r =>
                r.id !== editingRuleId &&
                r.word.toLowerCase() === word.toLowerCase()
            );

            if (duplicateRule) {
                alert(`⚠️ The word "${word}" already exists in your rules!\n\nExisting rule:\n• Color: ${duplicateRule.color}\n• Opacity: ${duplicateRule.opacity}\n\nPlease edit the existing rule or use a different word.`);
                return;
            }

            // Check if we're editing an existing rule
            if (editingRuleId !== null) {
                // Update existing rule
                const ruleIndex = highlightRules.findIndex(r => r.id === editingRuleId);
                if (ruleIndex !== -1) {
                    highlightRules[ruleIndex] = {
                        id: editingRuleId,
                        word: word,
                        color: color,
                        opacity: opacity,
                        exactMatch: exactMatch,
                        caseSensitive: caseSensitive,
                        useOCR: useOCR
                    };
                }
                cancelEdit(); // Reset to add mode
            } else {
                // Add new rule
                const rule = {
                    id: Date.now(),
                    word: word,
                    color: color,
                    opacity: opacity,
                    exactMatch: exactMatch,
                    caseSensitive: caseSensitive,
                    useOCR: useOCR
                };
                highlightRules.push(rule);

                // Clear inputs
                document.getElementById('wordInput').value = '';
                document.getElementById('colorInput').value = '#ffff00';
                document.getElementById('opacityInput').value = '0.3';
                document.getElementById('exactMatchInput').checked = false;
                document.getElementById('caseSensitiveInput').checked = false;
                document.getElementById('useOCRInput').checked = false;
            }

            displayRules();
            saveRulesToStorage(); // Save to localStorage
            updateProcessButton();
        }

        // Display highlighting rules
        function displayRules() {
            const rulesList = document.getElementById('rulesList');
            const clearAllBtn = document.getElementById('clearAllBtn');
            const exportBtn = document.getElementById('exportRulesBtn');
            rulesList.innerHTML = '';

            if (highlightRules.length === 0) {
                rulesList.innerHTML = '<p style="text-align: center; color: #999;">No rules added yet. Add words to highlight.</p>';
                clearAllBtn.style.display = 'none';
                exportBtn.style.display = 'none';
                return;
            }

            clearAllBtn.style.display = 'inline-block';
            exportBtn.style.display = 'inline-block';

            highlightRules.forEach(rule => {
                const ruleItem = document.createElement('div');
                ruleItem.className = 'rule-item';

                // Build option badges
                const badges = [];
                if (rule.exactMatch) badges.push('<span style="background: rgba(0,150,255,0.2); color: #66b3ff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">🎯 Exact</span>');
                if (rule.caseSensitive) badges.push('<span style="background: rgba(255,150,0,0.2); color: #ffaa66; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">🔠 Case</span>');
                if (rule.useOCR) badges.push('<span style="background: rgba(150,0,255,0.2); color: #bb66ff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">📃 OCR</span>');

                const badgesHTML = badges.length > 0 ? badges.join(' ') : '<span style="color: #999; font-size: 0.85em;">(Partial)</span>';

                ruleItem.innerHTML = `
                    <div class="rule-info">
                        <div class="color-preview" style="background-color: ${rule.color}; opacity: ${rule.opacity};"></div>
                        <span class="rule-text"><strong>${rule.word}</strong> ${badgesHTML} - Opacity: ${rule.opacity}</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-edit" data-rule-id="${rule.id}">Edit</button>
                        <button class="btn-remove" data-rule-id="${rule.id}">Remove</button>
                    </div>
                `;
                rulesList.appendChild(ruleItem);
            });

            // Add event listeners to edit buttons
            document.querySelectorAll('.btn-edit').forEach(btn => {
                btn.addEventListener('click', function() {
                    const ruleId = parseInt(this.getAttribute('data-rule-id'));
                    editRule(ruleId);
                });
            });

            // Add event listeners to remove buttons
            document.querySelectorAll('.btn-remove').forEach(btn => {
                btn.addEventListener('click', function() {
                    const ruleId = parseInt(this.getAttribute('data-rule-id'));
                    removeRule(ruleId);
                });
            });
        }

        // Remove individual rule
        function removeRule(ruleId) {
            const ruleIndex = highlightRules.findIndex(r => r.id === ruleId);
            if (ruleIndex !== -1) {
                highlightRules.splice(ruleIndex, 1);
                displayRules();
                updateProcessButton();
                saveRulesToStorage();
                
                // Clear logs and hide progress card when removing rules
                if (highlightRules.length === 0) {
                    clearProgressCard();
                }
            }
        }

        // Clear all rules
        function clearAllRules() {
            if (confirm('Are you sure you want to clear all highlighting rules?')) {
                highlightRules = [];
                displayRules();
                updateProcessButton();
                saveRulesToStorage();
                
                // Clear logs and hide progress card
                clearProgressCard();
            }
        }

        // Export rules to JSON file
        function exportRules() {
            if (highlightRules.length === 0) {
                alert('No rules to export. Please add some rules first.');
                return;
            }

            const dataStr = JSON.stringify(highlightRules, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pdf-highlighter-rules-${Date.now()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('Exported', highlightRules.length, 'rules');
            
            // Show success message
            const exportBtn = document.getElementById('exportRulesBtn');
            const originalText = exportBtn.textContent;
            exportBtn.textContent = '✓ Exported!';
            exportBtn.style.background = 'rgba(0, 200, 0, 0.3)';
            setTimeout(() => {
                exportBtn.textContent = originalText;
                exportBtn.style.background = 'rgba(100, 200, 100, 0.15)';
            }, 2000);
        }

        // Import rules from JSON file
        function importRules(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedRules = JSON.parse(e.target.result);
                    
                    // Validate the imported data
                    if (!Array.isArray(importedRules)) {
                        alert('Invalid file format. Expected an array of rules.');
                        return;
                    }

                    // Validate each rule has required properties
                    const isValid = importedRules.every(rule => 
                        rule.hasOwnProperty('word') && 
                        rule.hasOwnProperty('color') && 
                        rule.hasOwnProperty('opacity')
                    );

                    if (!isValid) {
                        alert('Invalid rule format in the file.');
                        return;
                    }

                    // Ask user if they want to replace or merge
                    let shouldReplace = true;
                    if (highlightRules.length > 0) {
                        shouldReplace = confirm(
                            `You have ${highlightRules.length} existing rule(s).\n\n` +
                            'Click OK to REPLACE all rules.\n' +
                            'Click Cancel to MERGE (add to existing rules).'
                        );
                    }

                    if (shouldReplace) {
                        highlightRules = importedRules;
                    } else {
                        // Merge: add imported rules with new IDs to avoid conflicts
                        importedRules.forEach(rule => {
                            highlightRules.push({
                                ...rule,
                                id: Date.now() + Math.random() // Ensure unique ID
                            });
                        });
                    }

                    displayRules();
                    updateProcessButton();
                    saveRulesToStorage();

                    alert(`Successfully imported ${importedRules.length} rule(s)!`);
                    console.log('Imported', importedRules.length, 'rules');

                } catch (error) {
                    console.error('Import error:', error);
                    alert('Error reading file. Please ensure it\'s a valid JSON file exported from this tool.');
                }
            };

            reader.readAsText(file);
            
            // Reset file input so the same file can be imported again
            event.target.value = '';
        }

        // Remove individual file - UPDATED VERSION
        // Remove individual file

function removeFile(index) {
    if (index >= 0 && index < uploadedFiles.length) {
        uploadedFiles.splice(index, 1);
        displayFiles();
        updateProcessButton();
        
        // Restart bouncing if no files left
        if (uploadedFiles.length === 0) {
            document.querySelector('label[for="pdfFiles"]').classList.remove('has-files');
            document.querySelector('label[for="zipFile"]').classList.remove('has-files');
        }

        // Always reset file inputs to allow re-uploading
        document.getElementById('pdfFiles').value = '';
        document.getElementById('zipFile').value = '';
    }
}

        // Handle individual PDF uploads
    function handlePDFUpload(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
        console.log('No files selected');
        return;
    }
    
    let addedCount = 0;
    
    files.forEach(file => {
        console.log('Checking file:', file.name, 'Size:', file.size, 'Type:', file.type);
        
        if (file.type === 'application/pdf') {
            // Check if file already exists (by name and size)
            const isDuplicate = uploadedFiles.some(existingFile => {
                const match = existingFile.name === file.name && existingFile.size === file.size;
                if (match) {
                    console.log('Duplicate found:', file.name);
                }
                return match;
            });
            
            if (!isDuplicate) {
                uploadedFiles.push(file);
                addedCount++;
                console.log('Added file:', file.name);
            }
        } else {
            console.log('Not a PDF, skipping:', file.name);
        }
    });
    
    console.log(`Total added: ${addedCount}, Total files now: ${uploadedFiles.length}`);
    displayFiles();
    updateProcessButton();
    
    // Stop bouncing animation
    if (uploadedFiles.length > 0) {
        document.querySelector('label[for="pdfFiles"]').classList.add('has-files');
    }

    // Reset the input
    event.target.value = '';
}

        // Handle ZIP file upload
   async function handleZIPUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log('Loading ZIP file:', file.name);

    try {
        const zip = await JSZip.loadAsync(file);
        let pdfCount = 0;
        let duplicateCount = 0;

        for (const [filename, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && filename.toLowerCase().endsWith('.pdf')) {
                const blob = await zipEntry.async('blob');
                const pdfFile = new File([blob], filename, { type: 'application/pdf' });
                
                console.log('Checking ZIP file:', pdfFile.name, 'Size:', pdfFile.size);
                
                // Check if file already exists (by name and size)
                const isDuplicate = uploadedFiles.some(existingFile => 
                    existingFile.name === pdfFile.name && existingFile.size === pdfFile.size
                );
                
                if (!isDuplicate) {
                    uploadedFiles.push(pdfFile);
                    pdfCount++;
                    console.log('Added from ZIP:', pdfFile.name);
                } else {
                    duplicateCount++;
                    console.log('Duplicate in ZIP:', pdfFile.name);
                }
            }
        }

        console.log(`Extracted ${pdfCount} PDFs, skipped ${duplicateCount} duplicates. Total files: ${uploadedFiles.length}`);
        displayFiles();
        updateProcessButton();
        // Stop bouncing animation
        if (uploadedFiles.length > 0) {
            document.querySelector('label[for="zipFile"]').classList.add('has-files');
        }

    } catch (error) {
        console.error('Error reading ZIP file:', error);
        alert('Error reading ZIP file. Please ensure it contains valid PDF files.');
    }
    
    // Reset the input
    event.target.value = '';
}

        // Display uploaded files
        function displayFiles() {
    const filesList = document.getElementById('filesList');
    const clearAllFilesBtn = document.getElementById('clearAllFilesBtn');
    filesList.innerHTML = '';

    if (uploadedFiles.length === 0) {
        filesList.innerHTML = '<p style="text-align: center; color: #999;">No files uploaded yet.</p>';
        clearAllFilesBtn.style.display = 'none';
        return;
    }

    clearAllFilesBtn.style.display = 'inline-block';

    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.style.display = 'flex';
        fileItem.style.justifyContent = 'space-between';
        fileItem.style.alignItems = 'center';
        
        const fileInfo = document.createElement('span');
        fileInfo.textContent = `${index + 1}. ${file.name} (${formatFileSize(file.size)})`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-file';
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('data-file-index', index);
        
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        filesList.appendChild(fileItem);
    });

    // Add event listeners to remove buttons
    document.querySelectorAll('.btn-remove-file').forEach(btn => {
        btn.addEventListener('click', function() {
            const fileIndex = parseInt(this.getAttribute('data-file-index'));
            removeFile(fileIndex);
        });
    });
}
// Remove individual file
function removeFile(index) {
    if (index >= 0 && index < uploadedFiles.length) {
        uploadedFiles.splice(index, 1);
        displayFiles();
        updateProcessButton();
        
        // Clear logs and hide progress card when removing files
        clearProgressCard();
        
        // Restart bouncing if no files left
        if (uploadedFiles.length === 0) {
            document.querySelector('label[for="pdfFiles"]').classList.remove('has-files');
            document.querySelector('label[for="zipFile"]').classList.remove('has-files');
        }
    }
}

// Helper function to clear progress card and logs
function clearProgressCard() {
    // Hide progress card
    document.getElementById('progressCard').style.display = 'none';
    
    // Clear progress bar
    document.getElementById('progressFill').style.width = '0%';
    
    // Clear progress text
    document.getElementById('progressText').textContent = '0 / 0 files processed';
    
    // Clear processing log
    document.getElementById('processingLog').innerHTML = '';
    
    // Hide dashboard card
    const dashboardCard = document.getElementById('dashboardCard');
    if (dashboardCard) {
        dashboardCard.style.display = 'none';
    }
    
    // Hide and disable download button by removing 'show' class
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.classList.remove('show');
        downloadBtn.disabled = true;
    }
}


// Clear all files - UPDATED VERSION
function clearAllFiles() {
    if (uploadedFiles.length === 0) return;
    
    if (confirm(`Are you sure you want to remove all ${uploadedFiles.length} file(s)?`)) {
        uploadedFiles = [];
        displayFiles();
        updateProcessButton();
        
        // Clear logs and hide progress card
        clearProgressCard();
        
        // Restart bouncing animation
        document.querySelector('label[for="pdfFiles"]').classList.remove('has-files');
        document.querySelector('label[for="zipFile"]').classList.remove('has-files');

        // Reset file inputs so you can upload the same files again
        document.getElementById('pdfFiles').value = '';
        document.getElementById('zipFile').value = '';
    }
}
        // Format file size
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }

        // Update process button state
        function updateProcessButton() {
            const processBtn = document.getElementById('processBtn');
            processBtn.disabled = !(uploadedFiles.length > 0 && highlightRules.length > 0);
        }

        // Process all files
        async function processFiles() {
            if (uploadedFiles.length === 0 || highlightRules.length === 0) {
                alert('Please add highlighting rules and upload PDF files');
                return;
            }

            processedFiles = [];
            detailedReport = []; // Reset detailed report

            // Statistics tracking
            const startTime = Date.now();
            let totalHighlightsApplied = 0;
            let totalWordsSearched = highlightRules.length;
            let filesWithHighlights = 0;

            // Show progress card and reset download button
            document.getElementById('progressCard').style.display = 'block';
            document.getElementById('processBtn').disabled = true;
            
            const downloadBtn = document.getElementById('downloadBtn');
            downloadBtn.classList.remove('show');
            downloadBtn.disabled = true;

            const totalFiles = uploadedFiles.length;
            let processedCount = 0;

            addLog('info', `Starting processing of ${totalFiles} files...`);

            // Pre-check: Detect if any files need OCR
            const rulesHaveOCR = highlightRules.some(rule => rule.useOCR);
            if (rulesHaveOCR) {
                addLog('info', `✓ OCR enabled in rules - will scan images and charts`);
            }

            for (const file of uploadedFiles) {
                try {
                    addLog('info', `Processing: ${file.name}...`);
                    const result = await highlightPDF(file);
                    processedFiles.push({
                        name: file.name,
                        data: result.pdfBytes
                    });
                    
                    // Track detailed statistics
                    totalHighlightsApplied += result.highlightCount;
                    if (result.highlightCount > 0) {
                        filesWithHighlights++;
                    }
                    
                    // Add to detailed report
                    detailedReport.push({
                        filename: file.name,
                        pages: result.pagesInfo,
                        termDetails: result.termDetails
                    });
                    
                    addLog('success', `✓ Completed: ${file.name}`);
                } catch (error) {
                    addLog('error', `✗ Failed: ${file.name} - ${error.message}`);
                }

                processedCount++;
                updateProgress(processedCount, totalFiles);
            }

            const endTime = Date.now();
            const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

            // Update lifetime count
            lifetimeFilesProcessed += processedFiles.length;
            saveLifetimeCount();

            // Update global count in Supabase
            addLog('info', 'Updating global statistics...');
            const updateSuccess = await updateGlobalCount(processedFiles.length);

            if (!updateSuccess) {
                addLog('info', 'Note: Global statistics update failed, but your files are processed successfully.');
            }

            addLog('success', `Processing complete! ${processedFiles.length} of ${totalFiles} files successful.`);

            // Add statistics dashboard
            addDashboard({
                totalFiles: totalFiles,
                successfulFiles: processedFiles.length,
                failedFiles: totalFiles - processedFiles.length,
                totalWordsSearched: totalWordsSearched,
                totalHighlights: totalHighlightsApplied,
                filesWithHighlights: filesWithHighlights,
                timeTaken: timeTaken,
                lifetimeTotal: lifetimeFilesProcessed,
                globalTotal: globalFilesProcessed
            });
            
            // Enable and show download button
            downloadBtn.classList.add('show');
            downloadBtn.disabled = false;
            document.getElementById('processBtn').disabled = false;
            
            addLog('info', '✓ Ready to download! Click the GREEN download button below.');
        }

        // Highlight PDF using pdf-lib
        async function highlightPDF(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
                const pages = pdfDoc.getPages();

                addLog('info', `  Loaded PDF with ${pages.length} pages`);

                // Load the PDF with PDF.js to extract text positions
                const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                const pdfDocument = await loadingTask.promise;

                let totalHighlights = 0;
                const highlightedItems = new Set(); // Track already highlighted items to prevent overlaps
                
                // Track detailed statistics per term and per page
                const termStats = {};
                highlightRules.forEach(rule => {
                    termStats[rule.word] = {
                        term: rule.word,
                        color: rule.color,
                        matchType: rule.exactMatch ? 'Whole Word' : 'Partial',
                        caseSensitive: rule.caseSensitive ? 'Yes' : 'No',
                        count: 0,
                        pages: []
                    };
                });
                const pagesWithHighlights = new Set();

                for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
                    const page = pages[pageIndex];
                    const { width, height } = page.getSize();

                    // Get text content from PDF.js
                    const pdfPage = await pdfDocument.getPage(pageIndex + 1);

                    // Get regular extractable text
                    const extractedText = await pdfPage.getTextContent();
                    const extractedItems = extractedText.items.filter(item => item.str);

                    // Calculate total text length to detect if PDF is image-based
                    const totalTextLength = extractedItems.reduce((sum, item) => sum + item.str.trim().length, 0);
                    const isImageBasedPDF = totalTextLength < 50; // Less than 50 characters suggests scanned/image PDF

                    if (isImageBasedPDF) {
                        addLog('warning', `  Page ${pageIndex + 1}: Image-based PDF detected (${totalTextLength} chars). OCR will be used for ALL rules automatically.`);
                    }

                    // Check if ANY rule needs OCR OR if file requires OCR (image-based PDF)
                    const rulesNeedOCR = highlightRules.some(rule => rule.useOCR);
                    const needsOCR = rulesNeedOCR || isImageBasedPDF;

                    // OCR items storage (only populated if needed)
                    let ocrItemsSorted = [];

                    // Run OCR ONCE per page if ANY rule needs it OR if file is image-based
                    if (needsOCR) {
                        if (isImageBasedPDF && !rulesNeedOCR) {
                            addLog('warning', `  Page ${pageIndex + 1}: Image-based PDF detected! Running OCR for OCR-enabled rules...`);
                        } else {
                            addLog('info', `  Page ${pageIndex + 1}: Running OCR for OCR-enabled rules...`);
                        }

                        const pageDimensions = { width, height };
                        const ocrText = await performOCR(pdfPage, pageDimensions);
                        const ocrItems = ocrText.items;

                        // Create a Map of all extracted text with positions for better deduplication
                        const extractedTextMap = new Map();
                        extractedItems.forEach(item => {
                            const normalized = item.str.toLowerCase().trim().replace(/\s+/g, '');
                            const posKey = `${Math.round(item.transform[4] / 5) * 5}-${Math.round(item.transform[5] / 5) * 5}`;
                            const key = `${normalized}-${posKey}`;
                            extractedTextMap.set(key, item);
                        });

                        // Combine extracted + OCR items (deduplicated)
                        let allItems = [...extractedItems];
                        let duplicatesRemoved = 0;
                        for (const ocrItem of ocrItems) {
                            const ocrTextNormalized = ocrItem.str.toLowerCase().trim().replace(/\s+/g, '');
                            const ocrPosKey = `${Math.round(ocrItem.transform[4] / 5) * 5}-${Math.round(ocrItem.transform[5] / 5) * 5}`;
                            const ocrKey = `${ocrTextNormalized}-${ocrPosKey}`;

                            // If this text was already extracted at same position, skip the OCR version
                            if (extractedTextMap.has(ocrKey)) {
                                duplicatesRemoved++;
                            } else {
                                // This is new text found only by OCR (like text in images) or at different position
                                allItems.push(ocrItem);
                            }
                        }

                        // Sort combined items for OCR-enabled rules
                        ocrItemsSorted = [...allItems];
                        ocrItemsSorted.sort((a, b) => {
                            const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                            if (yDiff > 5) { // Different lines
                                return b.transform[5] - a.transform[5];
                            }
                            return a.transform[4] - b.transform[4]; // Same line, sort by x
                        });

                        // IMPROVEMENT: Merge adjacent combined items for better phrase matching
                        const beforeOCRMerge = ocrItemsSorted.length;
                        ocrItemsSorted = mergeAdjacentOCRFragments(ocrItemsSorted, { width, height });
                        const mergedOCRCount = beforeOCRMerge - ocrItemsSorted.length;

                        addLog('success', `  Page ${pageIndex + 1}: Found ${extractedItems.length} extracted + ${ocrItems.length} OCR items (${ocrItemsSorted.length} total after merge)`);
                    } else {
                        addLog('info', `  Page ${pageIndex + 1}: Extracted ${extractedItems.length} text items (OCR not needed)`);
                    }

                    // Sort extracted items only (for non-OCR rules)
                    let extractedItemsSorted = [...extractedItems];
                    extractedItemsSorted.sort((a, b) => {
                        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                        if (yDiff > 5) { // Different lines
                            return b.transform[5] - a.transform[5];
                        }
                        return a.transform[4] - b.transform[4]; // Same line, sort by x
                    });

                    // IMPROVEMENT: Merge adjacent extracted items for better phrase matching
                    // This helps match phrases like "non consequat" even if they're separate words
                    const beforeMergeCount = extractedItemsSorted.length;
                    console.log(`  Page ${pageIndex + 1}: BEFORE merge - ${beforeMergeCount} extracted items`);

                    // Debug: Look for "non" and "consequat" before merging
                    const nonItems = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('non'));
                    const consequatItems = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('consequat'));
                    console.log(`  Found ${nonItems.length} items with "non":`, nonItems.map(i => `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`));
                    console.log(`  Found ${consequatItems.length} items with "consequat":`, consequatItems.map(i => `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`));

                    // Debug: Look for "donec" BEFORE merging to see raw text
                    const donecItemsBefore = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('donec'));
                    console.log(`  BEFORE MERGE - Found ${donecItemsBefore.length} items with "donec":`, donecItemsBefore.map(i => {
                        return `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`;
                    }));

                    // Debug: Look for "ante" BEFORE merging
                    const anteItemsBefore = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('ante'));
                    console.log(`  BEFORE MERGE - Found ${anteItemsBefore.length} items with "ante":`, anteItemsBefore.map(i => {
                        return `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`;
                    }));

                    // Debug: Look for "nisl" BEFORE merging
                    const nislItemsBefore = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('nisl'));
                    console.log(`  BEFORE MERGE - Found ${nislItemsBefore.length} items with "nisl":`, nislItemsBefore.map(i => {
                        return `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`;
                    }));

                    // Calculate distance between "non" and "consequat"
                    if (nonItems.length > 0 && consequatItems.length > 0) {
                        nonItems.forEach((nonItem, idx) => {
                            consequatItems.forEach(consItem => {
                                const yDiff = Math.abs(nonItem.transform[5] - consItem.transform[5]);
                                const xDiff = consItem.transform[4] - (nonItem.transform[4] + (nonItem.width || 0));
                                console.log(`  Distance from non[${idx}] "${nonItem.str}" to "${consItem.str}": xDiff=${xDiff.toFixed(1)}px, yDiff=${yDiff.toFixed(1)}px, shouldMerge=${xDiff < 8 && yDiff < 5}`);
                            });
                        });
                    }

                    extractedItemsSorted = mergeAdjacentOCRFragments(extractedItemsSorted, { width, height });
                    console.log(`  Page ${pageIndex + 1}: AFTER merge - ${extractedItemsSorted.length} extracted items (merged ${beforeMergeCount - extractedItemsSorted.length} fragments)`);

                    // Debug: Look for "non consequat" after merging
                    const mergedNonConsequat = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('non') && item.str.toLowerCase().includes('consequat'));
                    console.log(`  Found ${mergedNonConsequat.length} items with "non consequat":`, mergedNonConsequat.map(i => `"${i.str}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)})`));

                    // Debug: Look for "donec" and "nisl" after merging
                    const donecItems = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('donec'));
                    const nislItems = extractedItemsSorted.filter(item => item.str.toLowerCase().includes('nisl'));
                    console.log(`  Found ${donecItems.length} items with "donec":`, donecItems.map(i => `"${i.str.substring(0, 60)}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`));
                    console.log(`  Found ${nislItems.length} items with "nisl":`, nislItems.map(i => `"${i.str.substring(0, 60)}" at (${i.transform[4].toFixed(1)}, ${i.transform[5].toFixed(1)}) width=${i.width?.toFixed(1)}`));

                    // Calculate distance between "donec in erat" and "nisl"
                    if (donecItems.length > 0 && nislItems.length > 0) {
                        donecItems.forEach((donecItem, idx) => {
                            nislItems.forEach(nislItem => {
                                const yDiff = Math.abs(donecItem.transform[5] - nislItem.transform[5]);
                                const xDiff = nislItem.transform[4] - (donecItem.transform[4] + (donecItem.width || 0));
                                console.log(`  Distance from donec[${idx}] to nisl: xDiff=${xDiff.toFixed(1)}px, yDiff=${yDiff.toFixed(1)}px, shouldMerge=${xDiff < 8 && yDiff < 5}`);
                            });
                        });
                    }

                    // Process each highlight rule
                    for (const rule of highlightRules) {
                        // IMPORTANT: Use OCR items if:
                        // 1. This specific rule has OCR enabled, OR
                        // 2. The PDF was auto-detected as image-based (needs OCR for all rules)
                        // If neither condition is true, use only extracted items
                        const shouldUseOCR = rule.useOCR || isImageBasedPDF;
                        const textItems = (shouldUseOCR && ocrItemsSorted.length > 0) ? ocrItemsSorted : extractedItemsSorted;

                        // Normalize search text based on case sensitivity
                        const searchText = rule.caseSensitive
                            ? rule.word.replace(/\s+/g, '').replace(/-/g, '')
                            : rule.word.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');

                        // Debug logging
                        if (rule.word.toLowerCase().includes('category')) {
                            console.log(`\n=== Searching for: "${rule.word}" (normalized: "${searchText}") on page ${pageIndex + 1} ===`);
                            console.log(`Rule exactMatch: ${rule.exactMatch}, useOCR: ${rule.useOCR}, isImageBasedPDF: ${isImageBasedPDF}`);
                            console.log(`Searching in ${textItems.length} text items (${shouldUseOCR ? 'extracted + OCR' : 'extracted only'})`);
                            console.log(`Total extracted items: ${extractedItems.length}, Total OCR items: ${ocrItemsSorted.length}`);

                            // Find all items containing "1" or "CATEGORY" with numbers
                            console.log('\nLooking for all "1" items:');
                            textItems.forEach((item, idx) => {
                                if (item.str.trim() === '1' || item.str.includes('1')) {
                                    console.log(`  Item ${idx}: "${item.str}" at position (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
                                }
                            });
                            console.log('\nLooking for items with "CATEGORY" + number:');
                            textItems.forEach((item, idx) => {
                                if (item.str.toLowerCase().includes('category') && /\d/.test(item.str)) {
                                    console.log(`  Item ${idx}: "${item.str}" at position (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
                                }
                            });

                            // Find all CATEGORY items with positions
                            console.log('\nAll CATEGORY items:');
                            textItems.forEach((item, idx) => {
                                if (item.str.toLowerCase().includes('category')) {
                                    const itemNormalized = item.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');
                                    console.log(`  Item ${idx}: "${item.str}" at position (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)}) → normalized: "${itemNormalized}"`);
                                }
                            });

                            // Count how many contain CATEGORY
                            const catCount = textItems.filter(item => item.str.toLowerCase().includes('category')).length;
                            console.log(`\nItems containing 'category': ${catCount}`);

                            // Look for items that already contain "category 1" together
                            console.log('\nSearching for items that already contain "category" + "1" together:');
                            let foundComplete = false;
                            textItems.forEach((item, idx) => {
                                const itemNormalized = item.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');
                                // Check for exact match
                                if (itemNormalized === 'category1') {
                                    console.log(`  ★★★ EXACT MATCH! Item ${idx}: "${item.str}" at position (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
                                    foundComplete = true;
                                }
                                // Also check for items that contain both words
                                else if (item.str.toLowerCase().includes('category') && item.str.includes('1')) {
                                    console.log(`  ⚠ Contains both: Item ${idx}: "${item.str}" → normalized: "${itemNormalized}" at (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
                                }
                            });
                            if (!foundComplete) {
                                console.log('  ❌ No exact "category1" match found as single item');
                            }

                            // Check items in EXTRACTED-ONLY (without OCR) to see what PDF natively provides
                            console.log('\n=== COMPARING EXTRACTED vs OCR items ===');
                            console.log(`Using OCR items: ${rule.useOCR}, Total items: ${textItems.length}`);
                            console.log(`Extracted items (non-OCR): ${extractedItemsSorted.length}`);
                            console.log('\nSearching in EXTRACTED-ONLY items for "category 1":');
                            extractedItemsSorted.forEach((item, idx) => {
                                const itemNormalized = item.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');
                                if (itemNormalized === 'category1' || itemNormalized.includes('category1')) {
                                    console.log(`  ★★★ EXTRACTED Item ${idx}: "${item.str}" at (${item.transform[4].toFixed(1)}, ${item.transform[5].toFixed(1)})`);
                                }
                            });

                            // Find ALL items near the Y coordinate of the first CATEGORY (440.8)
                            console.log('\n=== ITEMS NEAR Y=440.8 (where CATEGORY 1 should be) ===');
                            textItems.forEach((item, idx) => {
                                const yPos = item.transform[5];
                                if (Math.abs(yPos - 440.8) < 10) {
                                    console.log(`  Item ${idx}: "${item.str}" at (${item.transform[4].toFixed(1)}, ${yPos.toFixed(1)})`);
                                }
                            });
                        }

                        if (rule.exactMatch) {
                            // For exact match, check individual items and nearby combinations
                            let categoryItemsFound = 0;

                            if (rule.word.toLowerCase().includes('category')) {
                                console.log(`\n  Starting exact match loop for ${textItems.length} items...`);
                            }

                            for (let i = 0; i < textItems.length; i++) {
                                const item = textItems[i];
                                // Use position + text as key to prevent duplicate highlighting of same content
                                const posKey = `${Math.round(item.transform[4])}-${Math.round(item.transform[5])}`;
                                const itemKey = `${pageIndex}-${posKey}-${item.str.trim().substring(0, 20)}`;

                                // Debug: count category items
                                if (rule.word.toLowerCase().includes('category') && item.str.toLowerCase().includes('category')) {
                                    categoryItemsFound++;
                                }

                                // Skip if already highlighted by another rule
                                if (highlightedItems.has(itemKey)) {
                                    if (rule.word.toLowerCase().includes('category') && item.str.toLowerCase().includes('category')) {
                                        console.log(`  Item ${i}: "${item.str}" SKIPPED (already highlighted by key: ${itemKey})`);
                                    }
                                    continue;
                                }

                                // Remove punctuation and normalize for comparison (respect case sensitivity)
                                const text = rule.caseSensitive
                                    ? item.str.trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '')
                                    : item.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');

                                // Debug for category search
                                if (rule.word.toLowerCase().includes('category') && item.str.toLowerCase().includes('category')) {
                                    console.log(`  Item ${i}: "${item.str}" → normalized: "${text}", searchText: "${searchText}"`);
                                }

                                // IMPORTANT: For exact match, ensure we ONLY match if the text is EXACTLY the search term
                                // This prevents "CheckMyTrip App" from matching when searching for "CheckMyTrip"

                                // IMPROVEMENT 4: Case insensitive exact match first
                                if (text === searchText) {
                                    if (rule.word.toLowerCase().includes('category')) {
                                        console.log(`  ✓ MATCH FOUND!`);
                                    }
                                    highlightEntireItem(page, item, height, rule);
                                    highlightedItems.add(itemKey);
                                    totalHighlights++;

                                    // Track statistics
                                    termStats[rule.word].count++;
                                    if (!termStats[rule.word].pages.includes(`p${pageIndex + 1}`)) {
                                        termStats[rule.word].pages.push(`p${pageIndex + 1}`);
                                    }
                                    pagesWithHighlights.add(pageIndex + 1);

                                    continue;
                                }

                                // DISABLED: Fuzzy matching was too aggressive, matching "500CWB" with "600CWB"
                                // Only enable fuzzy matching if specifically needed for OCR errors
                                // const normalizedItemText = item.str.toLowerCase().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');
                                // const normalizedSearchText = rule.word.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                                // if (normalizedItemText.length === normalizedSearchText.length && normalizedItemText.length > 0) {
                                //     const distance = levenshteinDistance(normalizedItemText, normalizedSearchText);
                                //     if (distance === 1) {
                                //         // Fuzzy match code here
                                //     }
                                // }
                                
                                // Check if this item could be the start of a multi-fragment match
                                if (searchText.startsWith(text) && text.length > 0 && i < textItems.length - 1) {
                                    if (rule.word.toLowerCase().includes('category')) {
                                        console.log(`  Multi-fragment: Starting with "${item.str}" (normalized: "${text}")`);
                                    }

                                    let combinedText = text;
                                    let itemsToHighlight = [i];

                                    // Look ahead for adjacent items (large window to find vertically stacked text)
                                    for (let j = i + 1; j < Math.min(i + 220, textItems.length); j++) {
                                        const nextItem = textItems[j];
                                        // Use position + text as key (same format as above)
                                        const nextPosKey = `${Math.round(nextItem.transform[4])}-${Math.round(nextItem.transform[5])}`;
                                        const nextItemKey = `${pageIndex}-${nextPosKey}-${nextItem.str.trim().substring(0, 20)}`;

                                        // Skip if already highlighted
                                        if (highlightedItems.has(nextItemKey)) break;

                                        const nextText = rule.caseSensitive
                                            ? nextItem.str.trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '')
                                            : nextItem.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '').replace(/[.,;:!?]/g, '');

                                        // Check if items are adjacent (horizontal or vertical)
                                        const yDiff = Math.abs(item.transform[5] - nextItem.transform[5]);
                                        const xDiff = nextItem.transform[4] - (item.transform[4] + item.width);
                                        const xPosDiff = Math.abs(item.transform[4] - nextItem.transform[4]); // X position difference

                                        if (rule.word.toLowerCase().includes('category')) {
                                            if (nextItem.str.includes('1') || nextText === '1') {
                                                console.log(`    *** FOUND "1"! Item: "${nextItem.str}" (norm: "${nextText}"), yDiff=${yDiff.toFixed(1)}, xDiff=${xDiff.toFixed(1)}, xPosDiff=${xPosDiff.toFixed(1)}, combined="${combinedText + nextText}"`);
                                            } else if (nextText.length > 0 && nextText.length < 20) {
                                                console.log(`    Checking next: "${nextItem.str}" (norm: "${nextText}"), yDiff=${yDiff.toFixed(1)}, xDiff=${xDiff.toFixed(1)}, combined="${combinedText + nextText}"`);
                                            }
                                        }

                                        // Check if items are close together:
                                        // - Horizontally adjacent: same line (yDiff < 5) and close horizontally (xDiff < 100)
                                        // - Vertically stacked: reasonably aligned x position (xPosDiff < 400) and vertically close (yDiff < 50 to avoid matching table numbers far below)
                                        const isHorizontallyAdjacent = yDiff < 5 && Math.abs(xDiff) < 100;
                                        const isVerticallyStacked = xPosDiff < 400 && yDiff > 5 && yDiff < 50;

                                        if (isHorizontallyAdjacent || isVerticallyStacked) {
                                            const testCombined = combinedText + nextText;

                                            // Check exact match first
                                            if (searchText === testCombined) {
                                                if (rule.word.toLowerCase().includes('category')) {
                                                    console.log(`    ✓✓✓ MULTI-FRAGMENT MATCH FOUND! "${testCombined}"`);
                                                    console.log(`    Items to highlight: ${itemsToHighlight.length + 1} items`);
                                                    itemsToHighlight.forEach(idx => {
                                                        console.log(`      - Item ${idx}: "${textItems[idx].str}" at (${textItems[idx].transform[4].toFixed(1)}, ${textItems[idx].transform[5].toFixed(1)})`);
                                                    });
                                                    console.log(`      - Item ${j}: "${textItems[j].str}" at (${textItems[j].transform[4].toFixed(1)}, ${textItems[j].transform[5].toFixed(1)})`);
                                                }
                                                // Found complete match!
                                                itemsToHighlight.push(j);
                                                itemsToHighlight.forEach(idx => {
                                                    const highlightItem = textItems[idx];
                                                    highlightEntireItem(page, highlightItem, height, rule);
                                                    // Use position-based key
                                                    const hPosKey = `${Math.round(highlightItem.transform[4])}-${Math.round(highlightItem.transform[5])}`;
                                                    highlightedItems.add(`${pageIndex}-${hPosKey}-${highlightItem.str.trim().substring(0, 20)}`);
                                                });
                                                totalHighlights++;

                                                // Track statistics
                                                termStats[rule.word].count++;
                                                if (!termStats[rule.word].pages.includes(`p${pageIndex + 1}`)) {
                                                    termStats[rule.word].pages.push(`p${pageIndex + 1}`);
                                                }
                                                pagesWithHighlights.add(pageIndex + 1);

                                                break;
                                            }

                                            // DISABLED: Fuzzy matching was too aggressive
                                            // const normalizedSearchText = rule.word.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                                            // if (testCombined.length === normalizedSearchText.length) {
                                            //     const distance = levenshteinDistance(testCombined, normalizedSearchText);
                                            //     if (distance === 1) {
                                            //         // Fuzzy match code
                                            //     }
                                            // }

                                            if (searchText.startsWith(testCombined) && nextText.length > 0) {
                                                // Partial match, continue looking
                                                combinedText = testCombined;
                                                itemsToHighlight.push(j);
                                            }
                                            // Note: Don't break here - keep checking more items in case they're not in visual order
                                        }
                                        // Note: Don't break here either - items might not be in visual left-to-right order
                                    }
                                }
                            }

                            // Debug: summary
                            if (rule.word.toLowerCase().includes('category')) {
                                console.log(`Total CATEGORY items found in loop: ${categoryItemsFound}`);
                            }
                        } else {
                            // Partial match - search within text items
                            const isDebugRule = rule.word.toLowerCase().includes('non consequat') || rule.word.toLowerCase().includes('donec');

                            if (isDebugRule) {
                                console.log(`\n=== PARTIAL MATCH for "${rule.word}" ===`);
                                console.log(`Searching ${textItems.length} text items...`);
                            }

                            let matchCount = 0;
                            textItems.forEach((item, idx) => {
                                // Use position + text as key to prevent duplicates (same as exact match)
                                const posKey = `${Math.round(item.transform[4])}-${Math.round(item.transform[5])}`;
                                const itemKey = `${pageIndex}-${posKey}-${item.str.trim().substring(0, 20)}-${rule.id}`;

                                // Skip if already highlighted by this rule
                                if (highlightedItems.has(itemKey)) {
                                    return;
                                }

                                // Allow multiple partial highlights on same item from different rules
                                // Respect case sensitivity
                                const text = rule.caseSensitive ? item.str : item.str.toLowerCase();
                                const searchText = rule.caseSensitive ? rule.word : rule.word.toLowerCase();

                                // Normalize whitespace for comparison (collapse multiple spaces to single space)
                                const normalizedText = text.replace(/\s+/g, ' ');
                                const normalizedSearch = searchText.replace(/\s+/g, ' ');

                                // Also try without spaces (for cases where PDF has "Donecinieratnisl" as one word)
                                const textNoSpaces = text.replace(/\s+/g, '');
                                const searchNoSpaces = searchText.replace(/\s+/g, '');

                                // Debug for search phrases
                                if (isDebugRule && text.toLowerCase().includes(searchText.split(' ')[0])) {
                                    console.log(`  Item ${idx}: "${item.str.substring(0, 80)}"`);
                                    console.log(`    Original text: "${text.substring(0, 80)}"`);
                                    console.log(`    Normalized text: "${normalizedText.substring(0, 80)}"`);
                                    console.log(`    Text without spaces: "${textNoSpaces.substring(0, 80)}"`);
                                    console.log(`    Search without spaces: "${searchNoSpaces.substring(0, 80)}"`);
                                    console.log(`    text.includes("${searchText}"): ${text.includes(searchText)}`);
                                    console.log(`    normalizedText.includes("${normalizedSearch}"): ${normalizedText.includes(normalizedSearch)}`);
                                    console.log(`    textNoSpaces.includes("${searchNoSpaces}"): ${textNoSpaces.includes(searchNoSpaces)}`);
                                }

                                // Try multiple matching strategies:
                                // 1. Normalized whitespace (handles multiple spaces)
                                // 2. Without spaces (handles text rendered as single word)
                                if (normalizedText.includes(normalizedSearch) || textNoSpaces.includes(searchNoSpaces)) {
                                    matchCount++;
                                    if (isDebugRule) {
                                        console.log(`  ✓ MATCH #${matchCount}! Highlighting: "${item.str.substring(0, 80)}"`);
                                    }
                                    highlightWordInItem(page, item, height, rule, searchText);
                                    highlightedItems.add(itemKey); // Mark as highlighted
                                    totalHighlights++;

                                    // Track statistics
                                    termStats[rule.word].count++;
                                    if (!termStats[rule.word].pages.includes(`p${pageIndex + 1}`)) {
                                        termStats[rule.word].pages.push(`p${pageIndex + 1}`);
                                    }
                                    pagesWithHighlights.add(pageIndex + 1);
                                }
                            });

                            if (isDebugRule) {
                                console.log(`=== End PARTIAL MATCH (found ${matchCount} matches) ===\n`);
                            }
                        }
                    }
                }

                // Helper function to highlight entire item (for exact match)
                function highlightEntireItem(page, item, height, rule) {
                    const transform = item.transform;
                    const x = transform[4];
                    const y = transform[5];
                    const fullWidth = item.width || 50;
                    
                    // Calculate rotation angle
                    const a = transform[0];
                    const b = transform[1];
                    const angleRad = Math.atan2(b, a);
                    const angleDeg = angleRad * 180 / Math.PI;
                    
                    // Calculate text height
                    const fontSize = Math.sqrt(a * a + b * b);
                    const textHeight = fontSize;
                    
                    const rgb = hexToRgb(rule.color);
                    
                    try {
                        page.drawRectangle({
                            x: x - 1,
                            y: y - 2,
                            width: fullWidth + 2,
                            height: textHeight + 4,
                            rotate: PDFLib.degrees(angleDeg),
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            opacity: rule.opacity,
                            borderWidth: 0
                        });
                    } catch (drawError) {
                        console.error('Error drawing entire item highlight:', drawError);
                    }
                }
                
                // Helper function to highlight specific word within item (for partial match)
                function highlightWordInItem(page, item, height, rule, searchWord) {
                    const transform = item.transform;
                    const x = transform[4];
                    const y = transform[5];
                    const fullText = item.str;
                    const fullWidth = item.width || 50;

                    // Calculate rotation angle
                    const a = transform[0];
                    const b = transform[1];
                    const angleRad = Math.atan2(b, a);
                    const angleDeg = angleRad * 180 / Math.PI;

                    // Calculate text height
                    const fontSize = Math.sqrt(a * a + b * b);
                    const textHeight = fontSize;

                    const rgb = hexToRgb(rule.color);

                    // Normalize whitespace for matching (handle multiple spaces in PDF text)
                    const lowerText = fullText.toLowerCase();
                    const normalizedText = lowerText.replace(/\s+/g, ' ');
                    const normalizedSearch = searchWord.replace(/\s+/g, ' ');

                    // Also try without spaces (for text rendered as single word)
                    const textNoSpaces = lowerText.replace(/\s+/g, '');
                    const searchNoSpaces = searchWord.replace(/\s+/g, '');

                    let startIndex = 0;
                    let foundMatch = false;

                    // Strategy 1: Try normalized search first (handles multiple spaces)
                    while ((startIndex = normalizedText.indexOf(normalizedSearch, startIndex)) !== -1) {
                        foundMatch = true;
                        const matchLength = searchWord.length;
                        
                        // Better width calculation using actual matched text
                        // Create a more accurate estimate based on character types
                        let estimatedOffset = 0;
                        let estimatedWidth = 0;
                        
                        // Calculate widths character by character with better estimates
                        for (let i = 0; i < fullText.length; i++) {
                            const char = fullText[i];
                            let charWeight = 1.0;
                            
                            // Adjust weight based on character type (very rough estimation)
                            if (char === ' ') charWeight = 0.3;
                            else if ('iIl|!.,;:\'"'.includes(char)) charWeight = 0.4;
                            else if ('fjtJ()[]{}`.'.includes(char)) charWeight = 0.5;
                            else if ('rT-+=*^~'.includes(char)) charWeight = 0.6;
                            else if ('MWmw@%#'.includes(char)) charWeight = 1.3;
                            else if (char === char.toUpperCase() && char !== char.toLowerCase()) charWeight = 1.1;
                            
                            if (i < startIndex) {
                                estimatedOffset += charWeight;
                            } else if (i < startIndex + matchLength) {
                                estimatedWidth += charWeight;
                            }
                        }
                        
                        // Calculate total weight
                        let totalWeight = 0;
                        for (let i = 0; i < fullText.length; i++) {
                            const char = fullText[i];
                            let charWeight = 1.0;
                            if (char === ' ') charWeight = 0.3;
                            else if ('iIl|!.,;:\'"'.includes(char)) charWeight = 0.4;
                            else if ('fjtJ()[]{}`.'.includes(char)) charWeight = 0.5;
                            else if ('rT-+=*^~'.includes(char)) charWeight = 0.6;
                            else if ('MWmw@%#'.includes(char)) charWeight = 1.3;
                            else if (char === char.toUpperCase() && char !== char.toLowerCase()) charWeight = 1.1;
                            totalWeight += charWeight;
                        }
                        
                        // Calculate actual pixel offsets
                        const offsetX = (estimatedOffset / totalWeight) * fullWidth;
                        const matchWidth = (estimatedWidth / totalWeight) * fullWidth;
                        
                        try {
                            // Handle rotation
                            if (Math.abs(angleDeg) > 1) {
                                const offsetXRotated = offsetX * Math.cos(angleRad);
                                const offsetYRotated = offsetX * Math.sin(angleRad);
                                
                                page.drawRectangle({
                                    x: x + offsetXRotated - 1,
                                    y: y + offsetYRotated - 2,
                                    width: matchWidth + 2,
                                    height: textHeight + 4,
                                    rotate: PDFLib.degrees(angleDeg),
                                    color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                                    opacity: rule.opacity,
                                    borderWidth: 0
                                });
                            } else {
                                // Non-rotated text
                                page.drawRectangle({
                                    x: x + offsetX - 1,
                                    y: y - 2,
                                    width: matchWidth + 2,
                                    height: textHeight + 4,
                                    color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                                    opacity: rule.opacity,
                                    borderWidth: 0
                                });
                            }
                        } catch (drawError) {
                            console.error('Error drawing word highlight:', drawError);
                        }
                        
                        // Move to next occurrence
                        startIndex += matchLength;
                    }

                    // Strategy 2: If no match found, try without spaces (for single-word rendering)
                    if (!foundMatch && textNoSpaces.includes(searchNoSpaces)) {
                        // Find where the match is in the no-spaces version
                        const noSpaceIndex = textNoSpaces.indexOf(searchNoSpaces);
                        if (noSpaceIndex !== -1) {
                            // Map the no-space index back to the original text to find the substring
                            // We need to calculate which portion of the original text corresponds to the match
                            let charCountNoSpaces = 0;
                            let matchStartInOriginal = -1;
                            let matchEndInOriginal = -1;

                            // Find the start position in original text
                            for (let i = 0; i < fullText.length && charCountNoSpaces <= noSpaceIndex + searchNoSpaces.length; i++) {
                                if (fullText[i] !== ' ' && fullText[i] !== '\t' && fullText[i] !== '\n') {
                                    if (charCountNoSpaces === noSpaceIndex && matchStartInOriginal === -1) {
                                        matchStartInOriginal = i;
                                    }
                                    if (charCountNoSpaces === noSpaceIndex + searchNoSpaces.length && matchEndInOriginal === -1) {
                                        matchEndInOriginal = i;
                                    }
                                    charCountNoSpaces++;
                                }
                            }

                            if (matchStartInOriginal === -1) matchStartInOriginal = 0;
                            if (matchEndInOriginal === -1) matchEndInOriginal = fullText.length;

                            // Calculate offset and width for the matched portion
                            let estimatedOffset = 0;
                            let estimatedWidth = 0;

                            for (let i = 0; i < fullText.length; i++) {
                                const char = fullText[i];
                                let charWeight = 1.0;

                                if (char === ' ') charWeight = 0.3;
                                else if ('iIl|!.,;:\'"'.includes(char)) charWeight = 0.4;
                                else if ('fjtJ()[]{}`.'.includes(char)) charWeight = 0.5;
                                else if ('rT-+=*^~'.includes(char)) charWeight = 0.6;
                                else if ('MWmw@%#'.includes(char)) charWeight = 1.3;
                                else if (char === char.toUpperCase() && char !== char.toLowerCase()) charWeight = 1.1;

                                if (i < matchStartInOriginal) {
                                    estimatedOffset += charWeight;
                                } else if (i < matchEndInOriginal) {
                                    estimatedWidth += charWeight;
                                }
                            }

                            let totalWeight = 0;
                            for (let i = 0; i < fullText.length; i++) {
                                const char = fullText[i];
                                let charWeight = 1.0;
                                if (char === ' ') charWeight = 0.3;
                                else if ('iIl|!.,;:\'"'.includes(char)) charWeight = 0.4;
                                else if ('fjtJ()[]{}`.'.includes(char)) charWeight = 0.5;
                                else if ('rT-+=*^~'.includes(char)) charWeight = 0.6;
                                else if ('MWmw@%#'.includes(char)) charWeight = 1.3;
                                else if (char === char.toUpperCase() && char !== char.toLowerCase()) charWeight = 1.1;
                                totalWeight += charWeight;
                            }

                            const offsetX = (estimatedOffset / totalWeight) * fullWidth;
                            const matchWidth = (estimatedWidth / totalWeight) * fullWidth;

                            try {
                                if (Math.abs(angleDeg) > 1) {
                                    const offsetXRotated = offsetX * Math.cos(angleRad);
                                    const offsetYRotated = offsetX * Math.sin(angleRad);

                                    page.drawRectangle({
                                        x: x + offsetXRotated - 1,
                                        y: y + offsetYRotated - 2,
                                        width: matchWidth + 2,
                                        height: textHeight + 4,
                                        rotate: PDFLib.degrees(angleDeg),
                                        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                                        opacity: rule.opacity,
                                        borderWidth: 0
                                    });
                                } else {
                                    page.drawRectangle({
                                        x: x + offsetX - 1,
                                        y: y - 2,
                                        width: matchWidth + 2,
                                        height: textHeight + 4,
                                        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                                        opacity: rule.opacity,
                                        borderWidth: 0
                                    });
                                }
                            } catch (drawError) {
                                console.error('Error drawing no-space word highlight:', drawError);
                            }
                        }
                    }
                }

                addLog('info', `  Applied ${totalHighlights} highlights`);

                const pdfBytes = await pdfDoc.save();
                addLog('info', `  Generated PDF: ${formatFileSize(pdfBytes.length)}`);
                
                // Prepare pages info
                const pagesInfo = Array.from(pagesWithHighlights).sort((a, b) => a - b).join(', ');
                
                return {
                    pdfBytes: pdfBytes,
                    highlightCount: totalHighlights,
                    pagesInfo: pagesInfo,
                    termDetails: Object.values(termStats)
                };
            } catch (error) {
                console.error('PDF Processing Error:', error);
                throw new Error(`Failed to process PDF: ${error.message}`);
            }
        }

        // Convert hex color to RGB
        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 0 };
        }

        // Update progress bar
        function updateProgress(current, total) {
            const percentage = (current / total) * 100;
            document.getElementById('progressFill').style.width = percentage + '%';
            document.getElementById('progressText').textContent = `${current} / ${total} files processed`;
        }

        // Add log entry
        function addLog(type, message) {
            const log = document.getElementById('processingLog');
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
        }

        // Add statistics dashboard
        function addDashboard(stats) {
            // Show dashboard card
            const dashboardCard = document.getElementById('dashboardCard');
            dashboardCard.style.display = 'block';

            // Populate dashboard content
            const dashboardContent = document.getElementById('dashboardContent');
            dashboardContent.innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon">📁</div>
                    <div class="stat-value">${stats.totalFiles}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-icon">✅</div>
                    <div class="stat-value">${stats.successfulFiles}</div>
                    <div class="stat-label">Successful</div>
                </div>
                ${stats.failedFiles > 0 ? `
                <div class="stat-card error">
                    <div class="stat-icon">❌</div>
                    <div class="stat-value">${stats.failedFiles}</div>
                    <div class="stat-label">Failed</div>
                </div>
                ` : ''}
                <div class="stat-card">
                    <div class="stat-icon">📑</div>
                    <div class="stat-value">${stats.filesWithHighlights}</div>
                    <div class="stat-label">Files with Highlights</div>
                </div>
                <div class="stat-card highlight">
                    <div class="stat-icon">✨</div>
                    <div class="stat-value">${stats.totalHighlights}</div>
                    <div class="stat-label">Total Highlights</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-value">${Math.round(stats.timeTaken / 60)}m</div>
                    <div class="stat-label">Time Taken</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, rgba(255, 107, 0, 0.15), rgba(255, 153, 51, 0.15)); border: 2px solid rgba(255, 153, 51, 0.4);">
                    <div class="stat-icon">👤</div>
                    <div class="stat-value" style="color: #ffa64d; font-size: 1.8em;">${stats.lifetimeTotal}</div>
                    <div class="stat-label" style="color: #ffa64d;">Your Total Files</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, rgba(0, 200, 83, 0.15), rgba(0, 255, 100, 0.15)); border: 2px solid rgba(0, 255, 100, 0.4);">
                    <div class="stat-icon">🌍</div>
                    <div class="stat-value" style="color: #00ff88; font-size: 1.8em;">${stats.globalTotal || 0}</div>
                    <div class="stat-label" style="color: #00ff88;">Global Total (All Users)</div>
                </div>
            `;
            
            // Check if CSV button container already exists, if not create it
            let csvButtonContainer = document.getElementById('csvButtonContainer');
            if (!csvButtonContainer) {
                csvButtonContainer = document.createElement('div');
                csvButtonContainer.id = 'csvButtonContainer';
                csvButtonContainer.style.textAlign = 'center';
                csvButtonContainer.style.marginTop = '25px';
                csvButtonContainer.style.paddingTop = '20px';
                csvButtonContainer.style.borderTop = '1px solid rgba(255, 153, 51, 0.2)';
                dashboardCard.appendChild(csvButtonContainer);
            }
            
            // Add CSV Export button below all cards
            csvButtonContainer.innerHTML = `
                <button id="exportCSVBtn" class="stat-card highlight" style="
                   background: rgba(255, 160, 51, 0.15);
                    box-shadow: 0 6px 25px rgba(255, 167, 51, 0.2);


                    padding: 10px 20px;
                    font-size: 12px;
                    font-weight: bold;
                    border-radius: 10px;
                    cursor: pointer;
                    border: 2px solid #ffcc00;
                    color: #ffcc00;


                    backdrop-filter: blur(10px);


                    transition: all 0.3s ease;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 6px 25px rgba(255, 150, 51, 0.77)'"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(255, 147, 47, 1)'">
                    📊 Download Detail Excel Report
                </button>
            `;

            // Add click event listener for the export button
            const exportBtn = document.getElementById('exportCSVBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', exportDetailedCSV);
            }
        }

        // Download results as ZIP
        async function downloadResults() {
            console.log('Download button clicked!');
            console.log('Processed files:', processedFiles.length);
            
            if (processedFiles.length === 0) {
                alert('No processed files to download');
                return;
            }

            // If only one file, download it directly
            if (processedFiles.length === 1) {
                console.log('Downloading single PDF...');
                downloadSinglePDF(processedFiles[0]);
                return;
            }

            addLog('info', 'Creating ZIP file...');
            console.log('Creating ZIP with', processedFiles.length, 'files');

            try {
                const zip = new JSZip();
                const folder = zip.folder('highlighted_pdfs');

                processedFiles.forEach(file => {
                    const filename = file.name.replace('.pdf', '_highlighted.pdf');
                    console.log('Adding to ZIP:', filename);
                    folder.file(filename, file.data);
                });

                console.log('Generating ZIP blob...');
                const content = await zip.generateAsync({ 
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                });

                console.log('ZIP generated, size:', content.size);
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `highlighted_pdfs_${Date.now()}.zip`;
                document.body.appendChild(a);
                console.log('Triggering download...');
                a.click();
                document.body.removeChild(a);
                
                setTimeout(() => URL.revokeObjectURL(url), 100);

                addLog('success', 'ZIP file downloaded successfully!');
            } catch (error) {
                console.error('ZIP Error:', error);
                addLog('error', `Error creating ZIP: ${error.message}`);
                
                // Fallback: download files individually
                addLog('info', 'Attempting to download files individually...');
                downloadFilesIndividually();
            }
        }

        // Download a single PDF file
        function downloadSinglePDF(file) {
            try {
                console.log('Creating PDF blob for:', file.name);
                console.log('Data type:', typeof file.data, 'Length:', file.data.length || file.data.byteLength);
                
                const blob = new Blob([file.data], { type: 'application/pdf' });
                console.log('Blob created, size:', blob.size);
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name.replace('.pdf', '_highlighted.pdf');
                
                console.log('Download filename:', a.download);
                
                document.body.appendChild(a);
                a.click();
                console.log('Click triggered');
                
                document.body.removeChild(a);
                
                setTimeout(() => URL.revokeObjectURL(url), 100);
                
                addLog('success', `Downloaded: ${a.download}`);
            } catch (error) {
                console.error('Download Error:', error);
                addLog('error', `Failed to download: ${error.message}`);
            }
        }

        // Download all files individually
        function downloadFilesIndividually() {
            processedFiles.forEach((file, index) => {
                setTimeout(() => {
                    downloadSinglePDF(file);
                }, index * 500); // Stagger downloads by 500ms
            });
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', async () => {
            loadSavedRules(); // Load saved rules first
            loadLifetimeCount(); // Load lifetime files processed count
            await fetchGlobalCount(); // Fetch global count from Supabase
            displayRules();
            displayFiles();
            updateProcessButton();
            // Initialize drag and drop
            initDragAndDrop();
            
            // Add event listeners
            document.getElementById('addRuleBtn').addEventListener('click', addRule);
            document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
            document.getElementById('clearAllBtn').addEventListener('click', clearAllRules);
            document.getElementById('exportRulesBtn').addEventListener('click', exportRules);
            document.getElementById('importRulesFile').addEventListener('change', importRules);
            document.getElementById('processBtn').addEventListener('click', processFiles);
            document.getElementById('downloadBtn').addEventListener('click', downloadResults);
            document.getElementById('pdfFiles').addEventListener('change', handlePDFUpload);
            document.getElementById('zipFile').addEventListener('change', handleZIPUpload);
            document.getElementById('clearAllFilesBtn').addEventListener('click', clearAllFiles);
            document.getElementById('addRuleBtn').addEventListener('click', addRule);

            // Add enter key support for adding rules
            document.getElementById('wordInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addRule();
                }
            });

            // Advanced Options Toggle functionality
            const advancedToggle = document.getElementById('advancedOptionsToggle');
            const advancedContainer = document.getElementById('advancedOptionsContainer');
            const advancedIcon = document.getElementById('advancedToggleIcon');

            advancedToggle.addEventListener('click', () => {
                if (advancedContainer.style.display === 'none' || advancedContainer.style.display === '') {
                    advancedContainer.style.display = 'flex';
                    advancedIcon.textContent = '▼';
                } else {
                    advancedContainer.style.display = 'none';
                    advancedIcon.textContent = '▶';
                }
            });

            // Tooltip functionality for info icons
            const tooltipData = {
                'exact-match': {
                    header: '🎯 Exact Match',
                    content: '<strong>ON:</strong> Matches complete words only. "category 1" will match "CATEGORY 1" but not "category 123".<br><br><strong>OFF:</strong> Partial matching. "cat" will match "cat", "category", "catalog", etc.'
                },
                'case-sensitive': {
                    header: '🔠 Case Sensitive',
                    content: '<strong>ON:</strong> Matches exact case. "Test" will only match "Test", not "test" or "TEST".<br><br><strong>OFF:</strong> Ignores case. "test" matches "Test", "TEST", "TeSt", etc.'
                },
                'use-ocr': {
                    header: '📃 Use OCR',
                    content: '<strong>ON:</strong> Scans images and charts for text. Use this for text inside images, diagrams, or screenshots. Takes longer time to process <br><br><strong>OFF:</strong> Only searches regular PDF text. Faster processing but won\'t find text in images.'
                }
            };

            const sharedTooltip = document.getElementById('shared-tooltip');
            const tooltipHeader = document.getElementById('tooltip-header');
            const tooltipContent = document.getElementById('tooltip-content');

            console.log('Tooltip elements:', sharedTooltip, tooltipHeader, tooltipContent);

            document.querySelectorAll('.info-icon').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tooltipType = icon.getAttribute('data-tooltip-type');
                    const data = tooltipData[tooltipType];

                    // If clicking the same icon, toggle tooltip off
                    if (sharedTooltip.classList.contains('show') && sharedTooltip.dataset.currentType === tooltipType) {
                        sharedTooltip.classList.remove('show');
                        return;
                    }

                    // Update tooltip content
                    tooltipHeader.textContent = data.header;
                    tooltipContent.innerHTML = data.content;
                    sharedTooltip.dataset.currentType = tooltipType;

                    // Simple center-based positioning
                    // Position tooltip centered horizontally and near the top
                    sharedTooltip.style.left = '50%';
                    sharedTooltip.style.transform = 'translateX(-50%)';
                    sharedTooltip.style.top = '100px';

                    // Show tooltip
                    sharedTooltip.classList.add('show');
                });
            });

            // Close button functionality
            document.getElementById('tooltip-close').addEventListener('click', (e) => {
                e.stopPropagation();
                sharedTooltip.classList.remove('show');
            });

            // Close tooltip when clicking outside
            document.addEventListener('click', () => {
                sharedTooltip.classList.remove('show');
            });

            // Prevent tooltip from closing when clicking inside it
            sharedTooltip.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Drag and Drop Functionality
function initDragAndDrop() {
    const pdfLabel = document.querySelector('label[for="pdfFiles"]');
    const zipLabel = document.querySelector('label[for="zipFile"]');
    
    // Prevent default drag behaviors on the whole document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // PDF Drop Zone
    ['dragenter', 'dragover'].forEach(eventName => {
        pdfLabel.addEventListener(eventName, () => {
            pdfLabel.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        pdfLabel.addEventListener(eventName, () => {
            pdfLabel.classList.remove('drag-over');
        }, false);
    });
    
    pdfLabel.addEventListener('drop', handlePDFDrop, false);
    
    // ZIP Drop Zone
    ['dragenter', 'dragover'].forEach(eventName => {
        zipLabel.addEventListener(eventName, () => {
            zipLabel.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        zipLabel.addEventListener(eventName, () => {
            zipLabel.classList.remove('drag-over');
        }, false);
    });
    
    zipLabel.addEventListener('drop', handleZIPDrop, false);
}

// Handle PDF drop
function handlePDFDrop(e) {
    const dt = e.dataTransfer;
    const files = Array.from(dt.files);
    
    console.log('PDF files dropped:', files.length);
    
    let addedCount = 0;
    
    files.forEach(file => {
        console.log('Checking dropped file:', file.name, 'Type:', file.type);
        
        if (file.type === 'application/pdf') {
            // Check if file already exists
            const isDuplicate = uploadedFiles.some(existingFile => 
                existingFile.name === file.name && existingFile.size === file.size
            );
            
            if (!isDuplicate) {
                uploadedFiles.push(file);
                addedCount++;
                console.log('Added dropped file:', file.name);
            } else {
                console.log('Duplicate dropped file:', file.name);
            }
        } else {
            console.log('Not a PDF, skipping:', file.name);
            alert(`${file.name} is not a PDF file`);
        }
    });
    
    console.log(`Total added: ${addedCount}, Total files now: ${uploadedFiles.length}`);
    displayFiles();
    updateProcessButton();
}

// Handle ZIP drop
async function handleZIPDrop(e) {
    const dt = e.dataTransfer;
    const files = Array.from(dt.files);
    
    if (files.length === 0) return;
    
    const file = files[0]; // Take only the first file
    
    if (!file.name.toLowerCase().endsWith('.zip')) {
        alert('Please drop a ZIP file');
        return;
    }
    
    console.log('ZIP file dropped:', file.name);

    try {
        const zip = await JSZip.loadAsync(file);
        let pdfCount = 0;
        let duplicateCount = 0;

        for (const [filename, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && filename.toLowerCase().endsWith('.pdf')) {
                const blob = await zipEntry.async('blob');
                const pdfFile = new File([blob], filename, { type: 'application/pdf' });
                
                console.log('Checking ZIP file:', pdfFile.name, 'Size:', pdfFile.size);
                
                // Check if file already exists
                const isDuplicate = uploadedFiles.some(existingFile => 
                    existingFile.name === pdfFile.name && existingFile.size === pdfFile.size
                );
                
                if (!isDuplicate) {
                    uploadedFiles.push(pdfFile);
                    pdfCount++;
                    console.log('Added from ZIP:', pdfFile.name);
                } else {
                    duplicateCount++;
                    console.log('Duplicate in ZIP:', pdfFile.name);
                }
            }
        }

        console.log(`Extracted ${pdfCount} PDFs, skipped ${duplicateCount} duplicates. Total files: ${uploadedFiles.length}`);
        
        if (pdfCount > 0) {
            alert(`Successfully extracted ${pdfCount} PDF file(s) from ZIP!`);
        }
        if (duplicateCount > 0) {
            alert(`Skipped ${duplicateCount} duplicate file(s)`);
        }
        
        displayFiles();
        updateProcessButton();
    } catch (error) {
        console.error('Error reading dropped ZIP file:', error);
        alert('Error reading ZIP file. Please ensure it contains valid PDF files.');
    }
}
    


// Particle Background System
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    radius: 150
};

window.addEventListener('mousemove', (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
});

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.baseSize = this.size;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.color = this.getRandomColor();
        this.pulseSpeed = Math.random() * 0.02 + 0.01;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    getRandomColor() {
        const colors = [
            'rgba(255, 107, 0, 0.6)',   // Orange
            'rgba(255, 153, 51, 0.6)',  // Bright orange
            'rgba(255, 204, 0, 0.6)',   // Yellow-orange
            'rgba(255, 122, 26, 0.5)'   // Medium orange
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        // Move particle
        this.x += this.speedX;
        this.y += this.speedY;

        // Wrap around screen
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;

        // Pulse effect
        this.pulsePhase += this.pulseSpeed;
        this.size = this.baseSize + Math.sin(this.pulsePhase) * 1.5;

        // Attract to mouse
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * force * 2;
            this.y += Math.sin(angle) * force * 2;
        }
    }

    draw() {
        // Ensure size is always positive
        const drawSize = Math.abs(this.size);
        if (drawSize < 0.1) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// Create particles
const particles = [];
const particleCount = 100;

for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
}

// Connect nearby particles
function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 100) {
                const opacity = (1 - distance / 100) * 0.3;
                ctx.strokeStyle = `rgba(255, 153, 51, ${opacity})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
}

// Animation loop
function animate() {
    // Clear with fade effect for trails
    ctx.fillStyle = 'rgba(42, 21, 6, 0.1)'; // Match your background color
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });

    // Connect particles
    connectParticles();

    requestAnimationFrame(animate);
}

animate();

// Export detailed Excel report with color-coded terms
async function exportDetailedCSV() {
    if (detailedReport.length === 0) {
        alert('No data to export. Please process files first.');
        return;
    }

    try {
        // Load ExcelJS library if not already loaded
        if (typeof ExcelJS === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }

        // Create a new workbook using ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Highlight Report');

        // Set column widths
        worksheet.columns = [
            { header: 'Filename', key: 'filename', width: 40 },
            { header: 'Term', key: 'term', width: 30 },
            { header: 'Pages', key: 'pages', width: 15 },
            { header: 'Total Count', key: 'count', width: 12 }
        ];

        // Style the header row - only the 4 header cells (not full row)
        const headerRow = worksheet.getRow(1);
        for (let col = 1; col <= 4; col++) {
            const cell = headerRow.getCell(col);
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF6B00' } // Orange color
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Collect file data with term colors
        const fileRows = [];
        
        detailedReport.forEach(fileReport => {
            const filename = fileReport.filename;
            
            // Collect all terms found in this file
            const termsInFile = [];
            
            fileReport.termDetails.forEach(termDetail => {
                if (termDetail.count > 0) {
                    termsInFile.push({
                        term: termDetail.term,
                        color: termDetail.color,
                        pages: termDetail.pages.join(','),
                        count: termDetail.count
                    });
                }
            });
            
            // If file has highlights, add row for it
            if (termsInFile.length > 0) {
                const allPages = [...new Set(termsInFile.flatMap(t => t.pages.split(',')))].sort((a, b) => parseInt(a) - parseInt(b)).join(',');
                const totalCount = termsInFile.reduce((sum, t) => sum + t.count, 0);

                fileRows.push({
                    filename: filename,
                    terms: termsInFile,
                    pages: allPages,
                    totalCount: totalCount
                });
            }
        });

        // Add data rows - one row per file, combine terms with semicolon
        fileRows.forEach(row => {
            const newRow = worksheet.addRow({
                filename: row.filename,
                term: row.terms.map(t => t.term).join(';'),
                pages: row.pages,
                count: row.totalCount
            });

            // Style the Term cell with rich text and black background
            const termCell = newRow.getCell(2); // Column B (Term)

            // Build rich text with each term in its own color
            const richText = [];
            row.terms.forEach((termData, idx) => {
                richText.push({
                    text: termData.term,
                    font: {
                        color: { argb: 'FF' + termData.color.replace('#', '') },
                        bold: true,
                        size: 11
                    }
                });

                // Add semicolon separator in white
                if (idx < row.terms.length - 1) {
                    richText.push({
                        text: ';',
                        font: {
                            color: { argb: 'FFFFFFFF' },
                            bold: true,
                            size: 11
                        }
                    });
                }
            });

            termCell.value = { richText: richText };
            termCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' } // Black background
            };
            termCell.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Track total count for summary
        let grandTotal = 0;

        // Add rows for files with NO terms found (NULL rows in red)
        detailedReport.forEach(fileReport => {
            const totalHighlightsInFile = fileReport.termDetails.reduce((sum, term) => sum + term.count, 0);
            if (totalHighlightsInFile === 0) {
                const nullRow = worksheet.addRow({
                    filename: fileReport.filename,
                    term: 'NULL',
                    pages: 'NULL',
                    count: 0
                });

                // Apply red color to all cells in this row
                nullRow.eachCell((cell) => {
                    cell.font = {
                        color: { argb: 'FFFF0000' }, // Red text
                        bold: true,
                        size: 11
                    };
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                });
            }
        });

        // Calculate grand total from fileRows
        grandTotal = fileRows.reduce((sum, row) => sum + row.totalCount, 0);

        // Add a total row at the end
        const totalRow = worksheet.addRow({
            filename: '',
            term: '',
            pages: '',
            count: `Total ${grandTotal}`
        });

        // Style the total row - bold and bigger font
        const totalCell = totalRow.getCell(4); // Total Count column
        totalCell.font = {
            bold: true,
            size: 14, // Bigger font
            color: { argb: 'FF000000' }
        };
        totalCell.alignment = { vertical: 'middle', horizontal: 'left' };

        // Generate Excel file using ExcelJS
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = `pdf-highlighter-report-${Date.now()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    
    // Show success message
    const exportBtn = document.getElementById('exportCSVBtn');
    const originalText = exportBtn.textContent;
    exportBtn.textContent = '✓ Excel Downloaded!';
    exportBtn.style.background = 'linear-gradient(135deg, #00aa00, #00dd00)';
    
    setTimeout(() => {
        exportBtn.textContent = originalText;
        exportBtn.style.background = 'linear-gradient(135deg, rgba(255, 160, 51, 0.15), rgba(255, 160, 51, 0.15))';
    }, 9000);
    
    console.log('Excel report exported successfully!');
    } catch (error) {
        console.error('Error exporting Excel:', error);
        alert('Error creating Excel file. Please try again.');
    }
}

// ============================================
// AI CHATBOT FUNCTIONALITY
// ============================================

// Knowledge base about the app
const appKnowledgeBase = {
    features: {
        keywords: ['feature', 'features', 'what can', 'capabilities', 'functions', 'what does'],
        response: `**PDF Highlighter Pro Features** ✨

**Core Features:**
• Smart Highlighting - Add words/phrases to highlight across PDFs
• Exact Match - Match complete words only
• Case Sensitive - Match exact uppercase/lowercase
• OCR Support - Scan images and charts for text using AI
• Batch Processing - Process multiple PDFs or ZIP files
• Export/Import Rules - Save your highlight rules as JSON
• Download Results - Get all highlighted PDFs in a ZIP
• Dashboard Stats - Track files, highlights, and time

What would you like to know more about?`
    },

    exactMatch: {
        keywords: ['exact match', 'complete word', 'whole word', 'partial match'],
        response: `**Exact Match** controls how text matching works:

**When ON (Exact Match):**
• Matches complete words only
• "category 1" matches "CATEGORY 1" ✓
• "category 1" does NOT match "category 123" ✗
• "test" matches "test" ✓ but NOT "testing" ✗

**When OFF (Partial Matching):**
• Matches any occurrence
• "cat" matches "cat", "category", "catalog", "scatter"
• "test" matches "test", "testing", "contest", "latest"

💡 **Tip:** Use Exact Match ON for precise, whole-word matches!`
    },

    caseSensitive: {
        keywords: ['case sensitive', 'uppercase', 'lowercase', 'capital letter'],
        response: `**Case Sensitive** controls letter case matching:

**When ON (Case Sensitive):**
• Matches exact case only
• "Test" matches only "Test" ✓
• Won't match "test", "TEST", or "TeSt" ✗

**When OFF (Case Insensitive):**
• Ignores case differences
• "test" matches "Test", "TEST", "TeSt", "test" ✓
• Very flexible for general highlighting

💡 **Tip:** Keep OFF for most cases. Turn ON for acronyms or proper nouns!`
    },

    ocr: {
        keywords: ['ocr', 'scan', 'image', 'chart', 'screenshot', 'picture'],
        response: `**Use OCR** (Optical Character Recognition)

**When ON:**
• Scans images, charts, and diagrams for text
• Uses advanced AI (Tesseract.js)
• Perfect for scanned documents
• ⏱️ Processing takes longer

**When OFF:**
• Only searches regular PDF text
• ⚡ Much faster processing
• Good for digital PDFs

**Best Uses for OCR:**
• Scanned documents
• Screenshots in PDFs
• Charts with text labels
• Text embedded in images

⚠️ **Limitation:** Very small text in charts might not be detected accurately.`
    },

    howToUse: {
        keywords: ['how to use', 'how do i', 'tutorial', 'guide', 'start', 'begin', 'steps'],
        response: `**Quick Start Guide** 📚

**Step 1: Add Highlight Rules**
• Enter a word or phrase in the text box
• Toggle options: Exact Match, Case Sensitive, Use OCR
• Click "Add Rule" button

**Step 2: Upload PDFs**
• Click "Choose PDF Files" or drag & drop
• Or upload a ZIP file containing PDFs

**Step 3: Process Files**
• Click "Process PDFs" button
• Watch the magic happen! ✨

**Step 4: Download Results**
• Click "Download Results" button
• Get all highlighted PDFs in a ZIP file

Need help with a specific step?`
    },

    batchProcessing: {
        keywords: ['batch', 'multiple pdf', 'many files', 'bulk', 'zip file'],
        response: `**Batch Processing** lets you highlight multiple PDFs at once:

**Option 1: Multiple PDFs**
• Select multiple PDF files (Ctrl+Click or Cmd+Click)
• Or drag & drop multiple PDFs
• All files will be processed together

**Option 2: ZIP File**
• Upload a ZIP containing PDFs
• App automatically extracts and processes them
• Great for large batches!

📊 **Dashboard** shows:
• Number of files processed
• Total highlights applied
• Processing time

💾 **Download**: Get all highlighted PDFs in a single ZIP file!`
    },

    rules: {
        keywords: ['rule', 'export rule', 'import rule', 'save rule', 'highlight rule'],
        response: `**Rules Management** 📋

**1. Add Rules:**
• Click "Add Rule" button
• Each rule can have different options (Exact Match, Case, OCR)

**2. Export Rules:**
• Click "Export Rules" to save as JSON file
• Backup your rules or share with others

**3. Import Rules:**
• Click "Import Rules" button
• Select your JSON file
• Rules load instantly!

**4. Clear Rules:**
• "Clear All Rules" removes all highlight rules
• ⚠️ Use carefully!

💡 **Tip:** Export your rules before clearing them!`
    },

    greeting: {
        keywords: ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'],
        response: `Hey there! 👋 I'm your friendly PDF Highlighter Pro assistant!

**I can help you with:**
• Understanding app features
• Learning how to use different options
• Tips for batch processing
• OCR and highlighting tips
• General knowledge (tech, AI, science, etc.)
• Or just chat!

What can I help you with today?`
    },

    thanks: {
        keywords: ['thank', 'thanks', 'appreciate', 'helpful'],
        response: `You're very welcome! 😊 I'm happy to help!

Feel free to ask me anything else about PDF Highlighter Pro or just chat. I'm here for you! 💪`
    }
};

// Casual conversation responses
const casualResponses = {
    howAreYou: {
        keywords: ['how are you', 'how r u', 'how are u', 'hows it going', 'whats up'],
        responses: [
            "I'm doing great, thanks for asking! 😊 Ready to help you with PDF highlighting or anything else!",
            "Fantastic! Just here helping amazing people like you! How can I assist you today?",
            "I'm wonderful! Excited to help you make the most of PDF Highlighter Pro!"
        ]
    },

    jokes: {
        keywords: ['joke', 'funny', 'make me laugh'],
        responses: [
            "Why did the PDF go to therapy? It had too many issues to resolve! 😄",
            "What's a PDF's favorite drink? Adobe-ccino! ☕😂",
            "Why do PDFs make terrible comedians? Their jokes are always too compressed! 🤣"
        ]
    },

    weather: {
        keywords: ['weather', 'temperature', 'sunny', 'rain', 'snow'],
        response: "I'm a chatbot, so I don't experience weather, but I hope it's nice where you are! ☀️ Need help highlighting some PDFs?"
    },

    name: {
        keywords: ['your name', 'who are you', 'what are you'],
        response: "I'm the PDF Highlighter Pro AI Assistant! 🤖 I'm here to help you understand and use this awesome app. Think of me as your personal PDF highlighting guide!"
    },

    creator: {
        keywords: ['who made', 'who created', 'developer', 'creator', 'built this'],
        response: "This amazing app was designed and developed by **SUNNY** with lots of love ❤️ coffee ☕ and AI 👽! Pretty cool, right?"
    }
};

// General knowledge responses
const generalKnowledge = {
    whatIsPDF: {
        keywords: ['what is pdf', 'what is a pdf', 'pdf meaning', 'pdf stands for'],
        response: `**PDF** stands for **Portable Document Format** 📄

**Key Features:**
• Created by Adobe in 1993
• Preserves formatting across all devices
• Can contain text, images, links, and forms
• Industry standard for document sharing
• Can be viewed on any device with a PDF reader

**Fun Fact:** PDFs are used worldwide for contracts, resumes, ebooks, and official documents!`
    },

    programming: {
        keywords: ['what is programming', 'what is coding', 'how to code', 'learn programming'],
        response: `**Programming** is writing instructions for computers! 💻

**Popular Languages:**
• Python - Great for beginners, AI, data science
• JavaScript - Web development, apps
• Java - Enterprise applications, Android
• C++ - Games, system software
• HTML/CSS - Web design

**Getting Started:**
• Start with Python or JavaScript
• Try free platforms like Codecademy, freeCodeCamp
• Build small projects to learn
• Practice daily!

Want to know about a specific language?`
    },

    ai: {
        keywords: ['what is ai', 'artificial intelligence', 'machine learning', 'what is ml'],
        response: `**AI (Artificial Intelligence)** is technology that mimics human intelligence! 🤖

**Types of AI:**
• Machine Learning - Learns from data
• Deep Learning - Neural networks (like human brain)
• Natural Language Processing - Understanding language
• Computer Vision - Understanding images

**Real-World Uses:**
• Voice assistants (Siri, Alexa)
• Recommendation systems (Netflix, YouTube)
• Self-driving cars
• Medical diagnosis
• This chatbot! 😊

**Fun Fact:** OCR in this app uses AI to read text from images!`
    },

    time: {
        keywords: ['what time', 'what is the time', 'current time', 'time now'],
        response: `The current time is **${new Date().toLocaleTimeString()}** 🕐

**Your Date:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Need help with anything else?`
    },

    math: {
        keywords: ['calculate', 'plus', 'minus', 'times', 'divided', 'multiply', 'subtract', 'add'],
        response: `I can help with basic questions, but I'm specialized in PDF Highlighter Pro! 🧮

**For calculations:**
• Use your device's calculator app
• Try WolframAlpha for complex math
• Google Calculator (just type in Google)

**I'm best at:**
• PDF highlighting questions
• App feature explanations
• Quick conversations

What can I help you with?`
    },

    internet: {
        keywords: ['what is internet', 'how does internet work', 'what is wifi', 'what is web'],
        response: `**The Internet** is a global network connecting billions of devices! 🌐

**How It Works:**
• Computers connect via cables, satellites, and wireless
• Data travels in small packets
• Routers direct traffic to the right destination
• Takes milliseconds to travel worldwide!

**Key Components:**
• WiFi - Wireless internet connection
• Browser - Software to view websites (Chrome, Firefox)
• Servers - Computers that store websites
• DNS - Converts website names to addresses

**Fun Fact:** Over 5 billion people use the internet!`
    },

    science: {
        keywords: ['what is science', 'scientific method', 'branches of science'],
        response: `**Science** is the study of the natural world! 🔬

**Main Branches:**
• Physics - Energy, matter, forces
• Chemistry - Substances and reactions
• Biology - Living organisms
• Astronomy - Space and celestial objects
• Earth Science - Our planet

**Scientific Method:**
• Ask a question
• Do research
• Form a hypothesis
• Test with experiments
• Analyze results
• Draw conclusions

**Cool Fact:** The universe is about 13.8 billion years old!`
    },

    history: {
        keywords: ['history', 'historical', 'when was', 'who invented'],
        response: `I can share some basic historical info! 📚

**I'm better at:**
• PDF Highlighter Pro features
• Tech-related questions
• General conversations

**For detailed history:**
• Try Wikipedia
• Google Search
• History.com

What would you like to know? (I'm best with tech topics!)`
    },

    technology: {
        keywords: ['what is technology', 'latest tech', 'innovation', 'gadget'],
        response: `**Technology** shapes our modern world! 🚀

**Current Tech Trends:**
• AI & Machine Learning
• Cloud Computing
• 5G Networks
• Virtual/Augmented Reality
• Blockchain & Crypto
• Internet of Things (IoT)

**Everyday Tech:**
• Smartphones
• Laptops & Tablets
• Smart Home Devices
• Wearables (smartwatches)
• Apps like this PDF Highlighter!

**Fun Fact:** The first computer weighed over 27 tons!`
    },

    health: {
        keywords: ['health', 'fitness', 'exercise', 'diet', 'medical'],
        response: `**Important:** I'm not a medical professional! 👨‍⚕️

**General Health Tips:**
• Stay hydrated - Drink 8 glasses of water daily
• Exercise - 30 minutes daily
• Sleep - 7-9 hours per night
• Balanced diet - Fruits, veggies, proteins
• Mental health - Take breaks, manage stress

**For medical advice:**
• Consult a real doctor
• Call health hotlines
• Visit healthcare websites

**I can help with:** PDF highlighting and tech questions! 😊`
    },

    learning: {
        keywords: ['how to learn', 'study tips', 'education', 'learning'],
        response: `**Effective Learning Tips** 📖

**Study Techniques:**
• Pomodoro - 25 min study, 5 min break
• Active recall - Test yourself
• Spaced repetition - Review over time
• Teach others - Best way to learn
• Take notes - Handwritten is best!

**Highlight Your Study Materials:**
• Use this PDF Highlighter Pro! 💡
• Highlight key concepts
• Use different colors for topics
• Review highlighted sections

**Free Resources:**
• Khan Academy, Coursera, edX
• YouTube tutorials
• Library resources

Want to know how highlighting helps learning?`
    },

    quantumEntanglement: {
        keywords: ['quantum entanglement', 'entanglement', 'quantum physics', 'quantum mechanics', 'spooky action'],
        response: `**Quantum Entanglement** - Einstein's "Spooky Action" 🌌

**What It Is:**
• Two particles become connected (entangled)
• Measuring one instantly affects the other
• Works across ANY distance - even light-years!
• Einstein called it "spooky action at a distance"

**Key Principles:**
• Particles share a quantum state
• No information travels faster than light
• Used in quantum computing & encryption
• Breaks classical physics rules

**Real Applications:**
• Quantum computers (super-fast calculations)
• Ultra-secure communication
• Quantum teleportation (information, not matter!)
• Future quantum internet

**Mind-Blowing Fact:** Change one particle's spin, the entangled partner changes instantly - defying space and time! 🔬✨`
    },

    universe: {
        keywords: ['universe', 'big bang', 'how universe formed', 'cosmos', 'space', 'creation of universe'],
        response: `**The Universe** - Our Cosmic Home 🌌

**The Big Bang (13.8 Billion Years Ago):**
• Universe began as a tiny, hot point
• Expanded rapidly in a fraction of a second
• Still expanding today!
• All matter, energy, space, and time created

**Universe Structure:**
• Observable universe: 93 billion light-years across
• Contains 2 trillion galaxies
• Our Milky Way: 100-400 billion stars
• 95% is "dark" (dark matter & dark energy)

**Key Concepts:**
• Space-time fabric (gravity bends it)
• Multiverse theory (infinite parallel universes?)
• Cosmic inflation (rapid early expansion)
• Heat death (eventual fate in trillions of years)

**Philosophical Perspective:**
• We are the universe experiencing itself
• Made of stardust (literally!)
• Consciousness exploring its own nature
• Everything is interconnected energy

**Beautiful Truth:** You contain atoms from stars that died billions of years ago! ⭐🌍`
    },

    meditation: {
        keywords: ['meditation', 'meditate', 'mindfulness', 'how to meditate', 'meditation benefits'],
        response: `**Meditation** - The Art of Inner Peace 🧘

**What Is Meditation:**
• Training attention and awareness
• Observing thoughts without judgment
• Present-moment consciousness
• Ancient practice (5,000+ years old)

**Proven Benefits:**
• Reduces stress & anxiety by 60%
• Improves focus & concentration
• Lowers blood pressure & inflammation
• Enhances emotional regulation
• Increases gray matter in brain
• Boosts immune system

**How to Start:**
1. **Sit comfortably** - Spine straight, relaxed
2. **Close eyes** - Or soft gaze downward
3. **Focus on breath** - Natural breathing
4. **Notice thoughts** - Let them pass like clouds
5. **Start small** - 5 minutes daily
6. **Be consistent** - Same time each day

**Types of Meditation:**
• Mindfulness (awareness of present)
• Vipassana (insight meditation)
• Transcendental (mantra-based)
• Loving-kindness (compassion practice)
• Body scan (physical awareness)

**Pro Tips:**
• Don't force "empty mind" - observe thoughts
• Use apps: Headspace, Calm, Insight Timer
• Join guided sessions or groups
• Practice in nature when possible

**Remember:** Meditation is a practice, not perfection! 🌸`
    },

    consciousness: {
        keywords: ['consciousness', 'awareness', 'conscious', 'what is consciousness', 'self awareness'],
        response: `**Consciousness** - The Greatest Mystery 🧠✨

**What Is Consciousness:**
• Your subjective experience of existence
• Awareness of self and surroundings
• The "observer" behind your thoughts
• Cannot be fully explained by science (yet!)

**Levels of Consciousness:**
• **Waking** - Normal aware state
• **Dreaming** - Subconscious narratives
• **Deep Sleep** - Unconscious regeneration
• **Meditative** - Expanded awareness
• **Flow** - Complete immersion
• **Transcendent** - Unity consciousness

**Scientific Theories:**
• Integrated Information Theory (consciousness is information integration)
• Global Workspace Theory (broadcast in brain)
• Quantum consciousness (Penrose-Hameroff)
• Panpsychism (consciousness is fundamental)

**Philosophical Perspectives:**
• **Vedanta:** You ARE pure consciousness (Atman = Brahman)
• **Buddhism:** Consciousness is impermanent and not-self
• **Neuroscience:** Emergent property of complex neurons
• **Idealism:** Consciousness creates reality

**Mind-Expanding Insights:**
• You're not your thoughts - you're the awareness OF thoughts
• Consciousness may be the foundation of reality itself
• Every living being shares this mysterious quality
• Meditation reveals deeper layers of consciousness

**The Hard Problem:** How does physical brain create subjective experience? Nobody knows! 🤔💭`
    },

    fitness: {
        keywords: ['fitness', 'workout', 'exercise', 'gym', 'fitness tips', 'how to get fit'],
        response: `**Fitness & Health** - Your Body is Your Temple 💪🏋️

**Core Principles:**
• **Consistency** beats intensity
• **Progressive overload** - Gradually increase difficulty
• **Recovery** is when growth happens
• **Nutrition** is 70% of results
• **Sleep** is crucial (7-9 hours)

**Complete Workout Plan:**
• **Monday:** Chest & Triceps
• **Tuesday:** Back & Biceps
• **Wednesday:** Legs & Core
• **Thursday:** Shoulders & Abs
• **Friday:** Full body or cardio
• **Weekend:** Active recovery (yoga, walking)

**Essential Exercises:**
• Compound: Squats, Deadlifts, Bench Press, Pull-ups
• Core: Planks, Russian twists, Leg raises
• Cardio: HIIT, Running, Swimming, Cycling

**Nutrition Basics:**
• Protein: 0.8-1g per lb bodyweight
• Carbs: Energy for workouts
• Healthy fats: Hormones & brain
• Water: 3-4 liters daily
• Whole foods over processed

**Beginner Tips:**
• Start with 3 days/week
• Focus on form over weight
• Track progress (photos, measurements)
• Find workout partner or coach
• Be patient - results take 8-12 weeks

**Remember:** Fitness is a lifelong journey, not a destination! 🌟`
    },

    yoga: {
        keywords: ['yoga', 'yoga benefits', 'how to do yoga', 'yoga poses', 'asana'],
        response: `**Yoga** - Union of Body, Mind & Spirit 🧘‍♀️🕉️

**What Is Yoga:**
• 5,000-year-old practice from India
• Physical postures (asanas)
• Breath control (pranayama)
• Meditation & mindfulness
• Philosophy of living

**8 Limbs of Yoga (Patanjali):**
1. **Yama** - Ethical principles
2. **Niyama** - Self-discipline
3. **Asana** - Physical postures
4. **Pranayama** - Breath control
5. **Pratyahara** - Sensory withdrawal
6. **Dharana** - Concentration
7. **Dhyana** - Meditation
8. **Samadhi** - Enlightenment

**Proven Benefits:**
• Increases flexibility & strength
• Reduces stress & anxiety
• Improves cardiovascular health
• Balances hormones
• Enhances mental clarity
• Boosts immune system
• Better sleep quality

**Popular Styles:**
• **Hatha** - Gentle, beginner-friendly
• **Vinyasa** - Flowing, dynamic
• **Ashtanga** - Structured, intense
• **Yin** - Deep stretching, meditative
• **Kundalini** - Spiritual, breath-focused
• **Restorative** - Healing, relaxing

**Beginner Poses:**
• Mountain Pose (Tadasana)
• Downward Dog (Adho Mukha Svanasana)
• Child's Pose (Balasana)
• Warrior I & II (Virabhadrasana)
• Tree Pose (Vrksasana)
• Corpse Pose (Savasana)

**Getting Started:**
• Take beginner classes (online or studio)
• Practice 10-20 minutes daily
• Listen to your body - no forcing
• Focus on breath coordination
• Use props (blocks, straps, cushions)

**Yoga Philosophy:**
"Yoga is the journey of the self, through the self, to the self." - Bhagavad Gita 🙏`
    },

    construction: {
        keywords: ['construction', 'building', 'construction industry', 'how to build', 'building construction'],
        response: `**Construction Industry** - Building Our World 🏗️👷

**Construction Process:**
1. **Planning & Design**
   • Architectural drawings
   • Structural engineering
   • Permits & approvals
   • Budget & timeline

2. **Site Preparation**
   • Land survey & excavation
   • Foundation laying
   • Utilities setup

3. **Structural Work**
   • Framing (wood/steel)
   • Concrete pouring
   • Roofing installation

4. **MEP Systems**
   • Mechanical (HVAC)
   • Electrical wiring
   • Plumbing systems

5. **Finishing**
   • Interior walls & flooring
   • Painting & fixtures
   • Final inspections

**Key Professionals:**
• **Architect** - Designs building aesthetics & function
• **Structural Engineer** - Ensures safety & stability
• **Project Manager** - Coordinates timeline & budget
• **Site Supervisor** - Manages daily operations
• **Trade Workers** - Carpenters, electricians, plumbers

**Important Documents:**
• **Architectural Drawings** - Floor plans, elevations, sections
• **Structural Drawings** - Foundation, framing, load-bearing details
• **MEP Drawings** - Mechanical, electrical, plumbing layouts
• **Specifications** - Materials, standards, quality requirements

**Modern Trends:**
• Green building (sustainable materials)
• BIM (Building Information Modeling)
• Prefabrication & modular construction
• Smart home integration
• 3D-printed structures

**Safety First:** PPE (hard hats, safety boots, gloves) and OSHA compliance are mandatory! ⚠️`
    },

    dhConstruction: {
        keywords: ['d&h construction', 'd and h construction', 'dh construction', 'd&h auckland', 'construction auckland new zealand'],
        response: `**D&H Construction Company** - Auckland, New Zealand 🇳🇿🏗️

**Company Overview:**
• **Location:** Auckland, New Zealand
• **Specialization:** Residential & commercial construction
• **Services:** New builds, renovations, extensions, structural work

**Core Services:**
• **Architectural Design** - Custom home & building design
• **Structural Engineering** - Foundation & framework design
• **Project Management** - End-to-end construction oversight
• **Renovation & Remodeling** - Updating existing structures
• **Consultation** - Expert advice for building projects

**Why Choose D&H:**
• Licensed & certified professionals
• Quality craftsmanship & materials
• On-time & on-budget delivery
• Compliance with NZ building codes
• Sustainable building practices
• Excellent customer service

**Documentation Expertise:**
• **Structural Drawings** - Detailed load-bearing plans, foundation specs, framing details
• **Architectural Drawings** - Floor plans, elevations, 3D renderings, interior layouts
• **Building Consent Drawings** - Council-approved plans
• **Engineering Calculations** - Safety & compliance documentation

**Auckland Building Standards:**
• Earthquake-resistant design (NZ Seismic Code)
• Weather-tight construction (rain/wind protection)
• Energy efficiency standards
• Resource consent compliance

**Contact:** For professional construction services in Auckland, D&H Construction delivers excellence! 📞`
    },

    structuralDrawings: {
        keywords: ['structural drawings', 'structural plans', 'structural design', 'structural engineering drawings'],
        response: `**Structural Drawings** - The Skeleton of Buildings 📐🏗️

**What Are Structural Drawings:**
• Engineering plans showing load-bearing elements
• Ensure building safety & stability
• Required for building permits
• Created by licensed structural engineers

**Key Components:**
1. **Foundation Plans**
   • Footing details & dimensions
   • Soil bearing capacity
   • Reinforcement specifications
   • Drainage systems

2. **Framing Plans**
   • Beam & column layouts
   • Load transfer paths
   • Connection details
   • Material specifications (steel/timber/concrete)

3. **Reinforcement Details**
   • Rebar placement & sizing
   • Concrete mix specifications
   • Cover requirements
   • Lap splice lengths

4. **Section Views**
   • Cross-sectional details
   • Height & depth specifications
   • Connection assemblies
   • Support conditions

**Critical Information:**
• **Loads:** Dead load, live load, wind, seismic
• **Materials:** Strength grades, types
• **Dimensions:** Accurate measurements
• **Annotations:** Technical notes & specifications
• **Stamps:** Engineer seal & signature

**Standards & Codes:**
• **New Zealand:** NZS 3604, AS/NZS 1170
• **Australia:** AS 3600, AS 4100
• **USA:** IBC, ACI, AISC
• **Eurocode:** EN 1990-1999

**Common Structural Systems:**
• **Moment Frame** - Rigid beam-column connections
• **Braced Frame** - Diagonal bracing for lateral loads
• **Shear Wall** - Concrete walls resist horizontal forces
• **Post & Beam** - Simple column-supported system

**Why They Matter:**
• Building safety & code compliance
• Prevent structural failures
• Guide construction teams
• Legal protection for all parties

**Pro Tip:** Always use professional engineers for structural design - safety is non-negotiable! ⚠️🔧`
    },

    architecturalDrawings: {
        keywords: ['architectural drawings', 'architectural plans', 'floor plans', 'building plans', 'architectural design'],
        response: `**Architectural Drawings** - Bringing Visions to Life 🏛️✏️

**What Are Architectural Drawings:**
• Visual representation of building design
• Show aesthetics, layout, and function
• Created by licensed architects
• Blueprint for construction teams

**Types of Drawings:**
1. **Site Plan**
   • Property boundaries & dimensions
   • Building placement on land
   • Driveway, landscaping, utilities
   • North arrow & scale

2. **Floor Plans**
   • Room layouts & dimensions
   • Door & window locations
   • Furniture placement
   • Traffic flow patterns

3. **Elevations**
   • Exterior views (front, back, sides)
   • Height measurements
   • Material finishes
   • Roof pitch & style

4. **Sections**
   • Vertical cut-through views
   • Ceiling heights & floor levels
   • Wall construction details
   • Foundation to roof assembly

5. **Details**
   • Close-up construction specifics
   • Window/door frames
   • Staircase design
   • Custom features

**Key Information:**
• **Dimensions** - Precise measurements
• **Materials** - Finishes & specifications
• **Symbols** - Standard architectural notation
• **Scale** - Typical 1:50 or 1:100
• **Annotations** - Notes & clarifications

**Drawing Stages:**
• **Conceptual** - Initial ideas & sketches
• **Schematic** - Basic layout & flow
• **Design Development** - Refined details
• **Construction Documents** - Final buildable plans

**Modern Tools:**
• **CAD** - Computer-Aided Design (AutoCAD, Revit)
• **BIM** - Building Information Modeling
• **3D Rendering** - Photorealistic visualizations
• **VR Walkthroughs** - Immersive previews

**What Architects Consider:**
• **Function** - How spaces will be used
• **Aesthetics** - Visual appeal & style
• **Light** - Natural & artificial lighting
• **Flow** - Movement between spaces
• **Sustainability** - Energy efficiency
• **Budget** - Cost-effective solutions
• **Codes** - Building regulations

**Popular Architectural Styles:**
• Modern - Clean lines, minimal ornamentation
• Contemporary - Current trends, asymmetry
• Traditional - Classic proportions, symmetry
• Industrial - Exposed structure, raw materials
• Minimalist - "Less is more" philosophy

**Remember:** Great architecture balances form, function, and beauty! 🎨🏡`
    }
};

// Chatbot state
let chatHistory = [];

// Initialize chatbot
function initChatbot() {
    const chatbotToggle = document.getElementById('chatbotToggle');
    const chatbotContainer = document.getElementById('chatbotContainer');
    const chatbotMinimize = document.getElementById('chatbotMinimize');
    const chatbotSend = document.getElementById('chatbotSend');
    const chatbotInput = document.getElementById('chatbotInput');
    const chatbotBadge = document.getElementById('chatbotBadge');

    // Toggle chatbot
    chatbotToggle.addEventListener('click', () => {
        chatbotContainer.classList.toggle('show');
        chatbotBadge.classList.add('hidden');
    });

    // Minimize chatbot
    chatbotMinimize.addEventListener('click', () => {
        chatbotContainer.classList.remove('show');
    });

    // Send message on button click
    chatbotSend.addEventListener('click', sendMessage);

    // Send message on Enter key
    chatbotInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Send message function
function sendMessage() {
    const chatbotInput = document.getElementById('chatbotInput');
    const message = chatbotInput.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessage(message, 'user');

    // Clear input
    chatbotInput.value = '';

    // Show typing indicator
    showTypingIndicator();

    // Get AI response after a delay (async)
    setTimeout(async () => {
        const response = await getAIResponse(message);
        hideTypingIndicator();
        addMessage(response, 'bot');
    }, 800 + Math.random() * 400); // Random delay between 800-1200ms
}

// Add message to chat
function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbotMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatar = sender === 'bot' ? '🤖' : '👤';

    // Format the text for better readability
    const formattedText = formatMessage(text);

    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-text">${formattedText}</div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Store in history
    chatHistory.push({ text, sender, time: new Date() });
}

// Format message text for better HTML display
function formatMessage(text) {
    // Convert **text** to <strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Convert bullet points • to proper list items
    text = text.replace(/^• (.+)$/gm, '<div class="bullet-item">• $1</div>');

    // Convert line breaks to <br>
    text = text.replace(/\n/g, '<br>');

    // Add spacing after headings (text followed by colon)
    text = text.replace(/(<strong>[^<]+:<\/strong>)/g, '$1<br>');

    return text;
}

// Show typing indicator
function showTypingIndicator() {
    const messagesContainer = document.getElementById('chatbotMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message';
    typingDiv.id = 'typing-indicator';

    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="message-text">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Hide typing indicator
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Get current time
function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// AI Response Logic
async function getAIResponse(message) {
    const lowerMessage = message.toLowerCase();

    // Try to get AI response from Groq API first (priority)
    try {
        const aiResponse = await getAIAPIResponse(message);
        if (aiResponse) {
            console.log('✅ Using Groq API response');
            return aiResponse;
        }
    } catch (error) {
        console.log('⚠️ Groq API failed, using fallback knowledge base');
    }

    // Fallback 1: Check app knowledge base
    for (const [key, data] of Object.entries(appKnowledgeBase)) {
        if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
            console.log('✅ Using app knowledge base');
            return data.response;
        }
    }

    // Fallback 2: Check casual responses
    for (const [key, data] of Object.entries(casualResponses)) {
        if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
            console.log('✅ Using casual responses');
            if (data.responses) {
                // Random response from array
                return data.responses[Math.floor(Math.random() * data.responses.length)];
            }
            return data.response;
        }
    }

    // Fallback 3: Check general knowledge
    for (const [key, data] of Object.entries(generalKnowledge)) {
        if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
            console.log('✅ Using general knowledge');
            return data.response;
        }
    }

    // Fallback 4: Use comprehensive smart response system
    console.log('✅ Using smart fallback response');
    return getSmartFallbackResponse(message);
}

// Get response from AI API via local server
async function getAIAPIResponse(message) {
    try {
        console.log('🤖 Calling AI server...');

        // Call Vercel-hosted Node.js server which proxies to Groq API
        const response = await fetch('https://pdf-highlighter-pro.vercel.app/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            console.error('❌ Server responded with:', response.status);
            return null;
        }

        const data = await response.json();

        if (data && data.response) {
            console.log('✅ Got AI response from server!');
            return data.response;
        }

        return null;
    } catch (error) {
        console.log('⚠️ Server not running or unavailable:', error.message);
        return null;
    }
}

// Smart fallback response for unknown questions
function getSmartFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();

    // Quantum physics
    if (lowerMessage.includes('quantum') && (lowerMessage.includes('entanglement') || lowerMessage.includes('entangle'))) {
        return `**Quantum Entanglement** - A Mind-Bending Physics Phenomenon! 🔬

**What It Is:**
When two particles become "entangled", they form a special connection. If you measure one particle, it instantly affects the other - even if they're on opposite sides of the universe!

**Key Facts:**
• Einstein called it "spooky action at a distance"
• Happens at the quantum (atomic) level
• Faster than light? No - no information travels
• Used in quantum computing and encryption
• Particles can be photons, electrons, or atoms

**How It Works:**
• Two particles interact and become linked
• They share a quantum state
• Measuring one collapses both wave functions
• The correlation is instant (non-local)

**Real Applications:**
• Quantum computers (processing power)
• Ultra-secure communication
• Quantum teleportation (of information)
• Advanced sensors and imaging

**Fun Fact:** Scientists have entangled particles over 1,200 km apart!`;
    }

    if (lowerMessage.includes('black hole') || lowerMessage.includes('space')) {
        return `**Black Holes** are cosmic mysteries! 🌌

**What They Are:**
• Regions where gravity is so strong, nothing escapes
• Not even light can escape!
• Formed when massive stars collapse

**Types:**
• Stellar - From collapsed stars
• Supermassive - At galaxy centers
• Intermediate - Mid-sized

**Cool Facts:**
• Time slows near black holes
• First image captured in 2019
• Millions exist in our galaxy!`;
    }

    if (lowerMessage.includes('climate') || lowerMessage.includes('global warming')) {
        return `**Climate Change** is a critical global issue 🌍

**Key Facts:**
• Average global temperature rising
• Caused mainly by greenhouse gases
• CO2 from burning fossil fuels
• Affects weather patterns worldwide

**Effects:**
• Rising sea levels
• Extreme weather events
• Ecosystem changes
• Ice caps melting

**What Helps:**
• Renewable energy
• Reducing emissions
• Conservation
• Sustainable practices`;
    }

    // History topics
    if (lowerMessage.includes('world war') || lowerMessage.includes('ww2') || lowerMessage.includes('ww1')) {
        return `I can provide basic historical info, but for detailed history, I recommend checking Wikipedia or History.com! 📚

**I'm best at:**
• PDF Highlighter Pro features
• Technology topics
• Science basics
• General conversation

What else can I help you with?`;
    }

    // Physics - Photons
    if (lowerMessage.includes('photon')) {
        return `**Photons** - Particles of Light! 💡

**What They Are:**
• Elementary particles that carry light
• Have no mass but have energy
• Travel at the speed of light (186,282 miles/second)
• Both a particle AND a wave (wave-particle duality)

**Key Properties:**
• Energy depends on frequency (E = hf)
• Can behave like waves (interference, diffraction)
• Can behave like particles (photoelectric effect)
• Cannot be split into smaller pieces

**Real-World Uses:**
• Solar panels - Convert photons to electricity
• Lasers - Concentrated photon beams
• Fiber optics - Internet communication
• Photography - Camera sensors detect photons
• Medical imaging - X-rays, PET scans

**Fun Facts:**
• Your eyes detect photons to see!
• Photons from the sun take 8 minutes to reach Earth
• Einstein won Nobel Prize for explaining photons

**In This App:**
• OCR uses photons! Camera captures reflected photons from text 📸`;
    }

    // Math topics
    if (lowerMessage.includes('calculus') || lowerMessage.includes('derivative') || lowerMessage.includes('integral')) {
        return `**Calculus** is the mathematics of change! 📐

**Two Main Parts:**
• Derivatives - Rate of change (like speed)
• Integrals - Accumulation (like distance)

**Uses:**
• Physics and engineering
• Economics and finance
• Computer graphics
• AI and machine learning

**Learning Resources:**
• Khan Academy
• Paul's Online Math Notes
• MIT OpenCourseWare

Want to know anything else?`;
    }

    // Countries/Geography
    if (lowerMessage.includes('country') || lowerMessage.includes('capital') || lowerMessage.includes('geography')) {
        return `I can share basic geography facts! 🗺️

**For detailed info:**
• Try Google Maps
• Wikipedia for countries
• CIA World Factbook

**I'm better at:**
• PDF Highlighter Pro features
• Technology questions
• Science topics
• General conversations

What would you like to know?`;
    }

    // Try to give an intelligent answer based on question type
    // Check if it's a "what is" question
    if (lowerMessage.startsWith('what is') || lowerMessage.startsWith('what are') || lowerMessage.startsWith('whats')) {
        const topic = message.replace(/what\s+(is|are)\s+/i, '').replace(/\?/g, '').trim();
        return `**Great question about "${topic}"!** 🤔

I don't have specific information about that topic in my knowledge base yet, but I can help you in other ways!

**I can answer questions about:**
• **PDF Highlighter Pro** - Features, how to use it, tips
• **Technology** - AI, programming, internet, gadgets
• **Science** - Physics, space, climate, biology basics
• **Learning** - Study techniques, education tips

**For "${topic}":**
• Try searching Google or Wikipedia
• Ask me a related tech or app question
• Rephrase as a more specific question

**Or ask me:**
• "How does this app work?"
• "What is artificial intelligence?"
• "Tell me about quantum physics"
• "Study tips"

What else can I help you with?`;
    }

    // Check if it's a "how to" question
    if (lowerMessage.includes('how to') || lowerMessage.includes('how do') || lowerMessage.includes('how can')) {
        return `**I'd love to help you with that!** 💡

For detailed "how to" guides on topics outside the app, I recommend:
• **YouTube** - Video tutorials
• **Google Search** - Step-by-step guides
• **WikiHow** - Detailed instructions

**I can help you with:**
• How to use PDF Highlighter Pro features
• How to highlight PDFs efficiently
• How technology works (AI, internet, etc.)
• How to study effectively

Try asking me something like:
• "How do I use exact match?"
• "How does OCR work?"
• "How to highlight multiple PDFs?"

What would you like to know?`;
    }

    // Default intelligent response
    return `**Interesting question!** 🤔

I'm an AI assistant for **PDF Highlighter Pro**, with knowledge about tech, science, and general topics!

**What I know well:**
• **App Features** - Highlighting, OCR, batch processing
• **Technology** - AI, programming, internet, computers
• **Science** - Physics, space, climate, biology
• **Learning** - Study tips and techniques

**Popular questions I can answer:**
• "What is quantum entanglement?"
• "What is artificial intelligence?"
• "What is a PDF?"
• "Tell me about black holes"
• "How does this app work?"

**Your question:** "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"

For specific details, try Google or ask me something from my knowledge areas!

What else can I help with?`;
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initChatbot();
});

