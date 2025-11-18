
        // Global variables
        let highlightRules = [];
        let uploadedFiles = [];
        let processedFiles = [];
        let editingRuleId = null; // Track which rule is being edited

        // PDF.js worker configuration - Use the correct worker path
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
            document.getElementById('exactMatchInput').checked = rule.exactMatch;

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
        }

        // Add highlighting rule
        function addRule() {
            const word = document.getElementById('wordInput').value.trim();
            const color = document.getElementById('colorInput').value;
            const opacity = parseFloat(document.getElementById('opacityInput').value);
            const exactMatch = document.getElementById('exactMatchInput').checked;

            if (!word) {
                alert('Please enter a word or phrase to highlight');
                return;
            }

            if (opacity < 0 || opacity > 1) {
                alert('Opacity must be between 0 and 1');
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
                        exactMatch: exactMatch
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
                    exactMatch: exactMatch
                };
                highlightRules.push(rule);
                
                // Clear inputs
                document.getElementById('wordInput').value = '';
                document.getElementById('colorInput').value = '#ffff00';
                document.getElementById('opacityInput').value = '0.3';
                document.getElementById('exactMatchInput').checked = false;
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
                const matchType = rule.exactMatch ? '(Exact)' : '(Partial)';
                ruleItem.innerHTML = `
                    <div class="rule-info">
                        <div class="color-preview" style="background-color: ${rule.color}; opacity: ${rule.opacity};"></div>
                        <span class="rule-text"><strong>${rule.word}</strong> ${matchType} - Opacity: ${rule.opacity}</span>
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
            
            // Statistics tracking
            const startTime = Date.now();
            let totalHighlightsApplied = 0;
            let totalWordsSearched = highlightRules.length;
            
            // Show progress card and reset download button
            document.getElementById('progressCard').style.display = 'block';
            document.getElementById('processBtn').disabled = true;
            
            const downloadBtn = document.getElementById('downloadBtn');
            downloadBtn.classList.remove('show');
            downloadBtn.disabled = true;

            const totalFiles = uploadedFiles.length;
            let processedCount = 0;

            addLog('info', `Starting processing of ${totalFiles} files...`);

            for (const file of uploadedFiles) {
                try {
                    addLog('info', `Processing: ${file.name}...`);
                    const result = await highlightPDF(file);
                    processedFiles.push({
                        name: file.name,
                        data: result.pdfBytes
                    });
                    totalHighlightsApplied += result.highlightCount;
                    addLog('success', `✓ Completed: ${file.name}`);
                } catch (error) {
                    addLog('error', `✗ Failed: ${file.name} - ${error.message}`);
                }

                processedCount++;
                updateProgress(processedCount, totalFiles);
            }

            const endTime = Date.now();
            const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

            addLog('success', `Processing complete! ${processedFiles.length} of ${totalFiles} files successful.`);
            
            // Add statistics dashboard
            addDashboard({
                totalFiles: totalFiles,
                successfulFiles: processedFiles.length,
                failedFiles: totalFiles - processedFiles.length,
                totalWordsSearched: totalWordsSearched,
                totalHighlights: totalHighlightsApplied,
                timeTaken: timeTaken
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

                for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
                    const page = pages[pageIndex];
                    const { width, height } = page.getSize();

                    // Get text content from PDF.js
                    const pdfPage = await pdfDocument.getPage(pageIndex + 1);
                    const textContent = await pdfPage.getTextContent();

                    // Build a combined text view with positions for better matching
                    const textItems = textContent.items.filter(item => item.str);
                    
                    // Sort items by vertical position (y) then horizontal (x)
                    textItems.sort((a, b) => {
                        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                        if (yDiff > 5) { // Different lines
                            return b.transform[5] - a.transform[5];
                        }
                        return a.transform[4] - b.transform[4]; // Same line, sort by x
                    });

                    // Process each highlight rule
                    for (const rule of highlightRules) {
                        const searchText = rule.word.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                        
                        if (rule.exactMatch) {
                            // For exact match, check individual items and nearby combinations
                            for (let i = 0; i < textItems.length; i++) {
                                const item = textItems[i];
                                const itemKey = `${pageIndex}-${i}`;
                                
                                // Skip if already highlighted by another rule
                                if (highlightedItems.has(itemKey)) continue;
                                
                                const text = item.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '');
                                
                                // Check exact match on single item (case insensitive)
                                if (text === searchText) {
                                    highlightEntireItem(page, item, height, rule);
                                    highlightedItems.add(itemKey);
                                    totalHighlights++;
                                    continue;
                                }
                                
                                // Check if this item could be the start of a multi-fragment match
                                if (searchText.startsWith(text) && text.length > 0 && i < textItems.length - 1) {
                                    let combinedText = text;
                                    let itemsToHighlight = [i];
                                    
                                    // Look ahead for adjacent items
                                    for (let j = i + 1; j < Math.min(i + 10, textItems.length); j++) {
                                        const nextItem = textItems[j];
                                        const nextItemKey = `${pageIndex}-${j}`;
                                        
                                        // Skip if already highlighted
                                        if (highlightedItems.has(nextItemKey)) break;
                                        
                                        const nextText = nextItem.str.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '');
                                        
                                        // Check if items are on the same line and close together
                                        const yDiff = Math.abs(item.transform[5] - nextItem.transform[5]);
                                        const xDiff = nextItem.transform[4] - (item.transform[4] + item.width);
                                        
                                        if (yDiff < 5 && xDiff < 100) { // Same line and reasonably close
                                            const testCombined = combinedText + nextText;
                                            
                                            if (searchText === testCombined) {
                                                // Found complete match!
                                                itemsToHighlight.push(j);
                                                itemsToHighlight.forEach(idx => {
                                                    highlightEntireItem(page, textItems[idx], height, rule);
                                                    highlightedItems.add(`${pageIndex}-${idx}`);
                                                });
                                                totalHighlights++;
                                                break;
                                            } else if (searchText.startsWith(testCombined) && nextText.length > 0) {
                                                // Partial match, continue looking
                                                combinedText = testCombined;
                                                itemsToHighlight.push(j);
                                            } else {
                                                break; // No match
                                            }
                                        } else {
                                            break; // Too far apart
                                        }
                                    }
                                }
                            }
                        } else {
                            // Partial match - search within text items (case insensitive)
                            textItems.forEach((item, index) => {
                                const itemKey = `${pageIndex}-${index}-${rule.id}`;
                                
                                // Allow multiple partial highlights on same item from different rules
                                const text = item.str.toLowerCase();
                                const searchLower = rule.word.toLowerCase();
                                
                                if (text.includes(searchLower)) {
                                    highlightWordInItem(page, item, height, rule, searchLower);
                                    totalHighlights++;
                                }
                            });
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
                    
                    // Find all occurrences of the search word (case insensitive)
                    const lowerText = fullText.toLowerCase();
                    let startIndex = 0;
                    
                    while ((startIndex = lowerText.indexOf(searchWord, startIndex)) !== -1) {
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
                }

                addLog('info', `  Applied ${totalHighlights} highlights`);

                const pdfBytes = await pdfDoc.save();
                addLog('info', `  Generated PDF: ${formatFileSize(pdfBytes.length)}`);
                return {
                    pdfBytes: pdfBytes,
                    highlightCount: totalHighlights
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
                    <div class="stat-icon">🔍</div>
                    <div class="stat-value">${stats.totalWordsSearched}</div>
                    <div class="stat-label">Search Terms</div>
                </div>
                <div class="stat-card highlight">
                    <div class="stat-icon">✨</div>
                    <div class="stat-value">${stats.totalHighlights}</div>
                    <div class="stat-label">Total Highlights</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-value">${stats.timeTaken}s</div>
                    <div class="stat-label">Time Taken</div>
                </div>
            `;
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
        document.addEventListener('DOMContentLoaded', () => {
            loadSavedRules(); // Load saved rules first
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
