# PDF Bulk Highlighter - D&H Steel Construction

A powerful web application for bulk highlighting of terms in architectural and structural drawings. Built specifically for construction industry workflows.

## 🎯 Features

- **Smart Text Matching**: Handles fragmented text and multi-part identifiers (e.g., "610UB125-F6")
- **Rotation Support**: Automatically highlights text at any angle (0°, 45°, 90°, 270°, etc.)
- **Exact & Partial Matching**: Toggle between exact word matching and partial text matching
- **Bulk Processing**: Upload hundreds of PDFs individually or as a ZIP file
- **Batch Export**: Download all highlighted PDFs in a single ZIP file
- **Custom Colors & Opacity**: Define multiple highlighting rules with different colors
- **Real-time Progress**: Track processing status with detailed logs
- **Modern UI**: Futuristic orange gradient design with glassmorphism effects

## 🚀 Quick Start

### Using VS Code Live Server (Recommended)

1. **Install VS Code** from https://code.visualstudio.com/

2. **Install Live Server Extension**
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "Live Server"
   - Install

3. **Open Project**
   - File → Open Folder
   - Select this folder

4. **Launch**
   - Right-click `index.html`
   - Select "Open with Live Server"

## 📖 How to Use

### Step 1: Define Highlighting Rules
1. Enter text to highlight (e.g., "610UB125-F6")
2. Choose color and opacity (0.3 recommended)
3. Toggle "Exact Match" for precise matching
4. Click "Add Rule"

### Step 2: Upload PDFs
- **Individual**: Click "Upload Individual PDFs" → Select files
- **ZIP**: Click "Upload ZIP File" → Select ZIP

### Step 3: Process
- Click "Process Files"
- Monitor progress bar and log

### Step 4: Download
- Click green "Download" button when complete
- Get ZIP with all highlighted PDFs

## 💡 Usage Examples

**Steel Identifiers:**
```
"610UB125-F6" → Yellow (#FFFF00) → 0.3 → Exact Match ✓
"310UC97" → Cyan (#00FFFF) → 0.3 → Exact Match ✓
```

**General Terms:**
```
"BEAM" → Yellow → 0.3 → Partial Match
"COLUMN" → Cyan → 0.3 → Partial Match
```

## 🐛 Troubleshooting

**No highlights?** → Check "Exact Match" setting or use Partial
**Wrong position?** → Should auto-handle rotation, check console (F12)
**Slow processing?** → Normal for large PDFs, process in batches
**Can't download?** → Check browser console for errors

## 🔧 Technical

- **100% Browser-Based**: No server required
- **Technologies**: pdf-lib, PDF.js, JSZip
- **Browsers**: Chrome/Edge (recommended), Firefox, Safari

## 📄 License

Internal use only - D&H Steel Construction

---

**Version 2.0.0** | Made for D&H Steel Construction
