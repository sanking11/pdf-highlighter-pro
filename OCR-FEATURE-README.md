# OCR Feature for PDF Highlighter Pro

## Overview

The PDF Highlighter Pro now includes **automatic OCR (Optical Character Recognition)** capabilities to handle PDFs that contain images instead of searchable text. This feature is particularly useful for:

- Scanned documents
- Image-based PDFs (like travel itineraries, invoices, receipts)
- Screenshots saved as PDFs
- Documents without embedded text layers

## How It Works

### Automatic Detection

The application automatically detects whether each page of a PDF has a searchable text layer:

1. **Text-based PDFs**: Uses the standard fast text extraction (existing functionality)
2. **Image-based PDFs**: Automatically switches to OCR mode for that specific page

This means you can process mixed PDFs (some pages with text, some with images) without any manual configuration!

### OCR Technology

- **Library**: Tesseract.js v5.0.4
- **Language**: English (eng)
- **Processing**: Client-side in the browser
- **Privacy**: All OCR happens locally - no data sent to external servers

## Visual Indicators

When OCR is being used, you'll see clear indicators in the processing log:

- **Yellow Warning Message**: "Page X: No text layer detected, using OCR..."
- **Green Success Message**: "Page X: OCR completed, found Y text items"
- **Yellow Warning**: "Page X: OCR found no text" (if the page is blank or OCR couldn't detect text)

## Performance Considerations

### Processing Time

OCR processing is slower than standard text extraction:

- **Standard text extraction**: ~0.1-0.5 seconds per page
- **OCR processing**: ~2-5 seconds per page (depending on image complexity and text density)

### Recommendations

1. **Mixed Documents**: If you have both types, the app automatically uses the fastest method for each page
2. **Large Batches**: OCR-heavy batches will take longer - be patient and watch the progress log
3. **Quality**: Higher quality scans produce better OCR results

## Usage Instructions

### No Changes Required!

The OCR feature works automatically. Just use the application as normal:

1. **Define your highlighting rules** (Step 1)
2. **Upload your PDFs** (Step 2) - including image-based ones
3. **Click "Process Files"** (Step 3)
4. **Watch the log** - you'll see when OCR is being used
5. **Download results** (Step 4)

### Example Use Cases

#### Travel Itineraries
The sample travel itinerary PDF (`MR TAILOR - 5DUTYY TKT COPY.pdf`) is an image-based PDF. You can now:
- Search for flight numbers (e.g., "UA 6752")
- Highlight airline names (e.g., "United Airlines")
- Find booking references (e.g., "5DUTYY")
- Locate dates and times

#### Scanned Documents
- Invoices with company names
- Receipts with product codes
- Scanned contracts with specific terms
- Old documents converted from paper

## Technical Details

### Text Detection Threshold

The app considers a page to have "extractable text" if:
- It contains at least **5 text items** with content
- Each item has non-empty string data

If a page has fewer than 5 text items, OCR is triggered automatically.

### OCR Configuration

```javascript
// Scale factor for better OCR accuracy
const viewport = pdfPage.getViewport({ scale: 2.0 });

// OCR worker with English language support
const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
        if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
    }
});
```

### Coordinate System Conversion

OCR results use different coordinate systems than PDF.js:
- **Tesseract**: Top-left origin (0,0 at top-left)
- **PDF**: Bottom-left origin (0,0 at bottom-left)

The app automatically converts coordinates:
```javascript
const y = viewport.height - word.bbox.y1; // Flip Y coordinate
```

## Troubleshooting

### OCR Not Working

**Symptom**: Log shows "No text layer detected" but OCR doesn't run

**Solutions**:
1. Check browser console for Tesseract.js errors
2. Ensure stable internet connection (first load downloads OCR models)
3. Try refreshing the page
4. Clear browser cache

### Poor OCR Results

**Symptom**: OCR completes but highlights are in wrong positions

**Solutions**:
1. Check PDF image quality - low quality scans produce poor results
2. Ensure text in PDF is horizontal (rotated text may not be detected accurately)
3. Verify PDF isn't password protected or corrupted

### Slow Performance

**Symptom**: Processing takes very long

**Solutions**:
1. Process smaller batches of image-based PDFs
2. Close other browser tabs to free up memory
3. Use a faster computer if possible (OCR is CPU-intensive)

## Browser Compatibility

### Tested Browsers

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari (may be slower)

### Requirements

- Modern browser with ES6+ support
- WebAssembly support (for Tesseract.js)
- Canvas API support
- At least 4GB RAM recommended for large PDFs

## Limitations

### Current Limitations

1. **Language**: English only (can be extended to support more languages)
2. **Handwriting**: Not optimized for handwritten text
3. **Complex Layouts**: Very complex multi-column layouts may have positioning issues
4. **Image Quality**: Poor quality scans will have reduced accuracy
5. **Memory**: Very large image-based PDFs may cause browser memory issues

### Not Supported

- Encrypted/password-protected PDFs
- PDFs with DRM protection
- Handwritten text recognition
- Right-to-left languages (Arabic, Hebrew)

## Future Enhancements

Potential future improvements:
- Multi-language support
- OCR quality settings (speed vs accuracy)
- Pre-processing filters (contrast, brightness)
- Batch OCR progress indicator
- OCR result caching

## Files Modified

### HTML Files
- `index.html`: Added Tesseract.js CDN script
- `index.production.html`: Added Tesseract.js CDN script

### JavaScript Files
- `js/app.js`: Added OCR functions and integration:
  - `initOCRWorker()`: Initialize Tesseract worker
  - `hasExtractableText()`: Detect if page has text layer
  - `performOCR()`: Perform OCR on image-based pages
  - Modified `highlightPDF()`: Integrated OCR into processing pipeline

### CSS Files
- `css/styles.css`: Added `.log-warning` style for OCR indicators

## Support

For issues or questions about the OCR feature:
1. Check the processing log for detailed error messages
2. Review this README for troubleshooting steps
3. Contact the developer: Sunny Tailor

---

**Version**: 4.1.0 (OCR Update)
**Date**: 2025-11-21
**Developer**: Sunny Tailor ☕
**Powered by**: Tesseract.js, PDF.js, pdf-lib
