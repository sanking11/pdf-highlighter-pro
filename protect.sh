#!/bin/bash
# 🔒 Protect All Files
# Run this script to prepare production files

echo "🔒 PDF Bulk Highlighter - Production Prep"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    echo "   (The folder containing index.html)"
    exit 1
fi

echo "📁 Found project files"
echo ""

# Copy JavaScript (keeping it readable and working)
echo "⚡ Preparing JavaScript..."
cp -f js/app.js js/app.min.js
if [ $? -eq 0 ]; then
    echo "   ✅ JavaScript ready"
else
    echo "   ❌ JavaScript copy failed"
    exit 1
fi
echo ""

# Copy CSS
echo "🎨 Preparing CSS..."
cp -f css/styles.css css/styles.min.css
if [ $? -eq 0 ]; then
    echo "   ✅ CSS ready"
else
    echo "   ❌ CSS copy failed"
    exit 1
fi
echo ""

# Create production HTML if it doesn't exist
if [ ! -f "index.production.html" ]; then
    echo "📝 Creating production HTML..."
    cp index.html index.production.html
    sed -i 's|css/styles.css|css/styles.min.css|g' index.production.html
    sed -i 's|js/app.js|js/app.min.js|g' index.production.html
    echo "   ✅ Production HTML created"
else
    echo "📝 Production HTML already exists"
fi
echo ""

# Show results
echo "=========================================="
echo "🎉 Protection Complete!"
echo ""
echo "📊 File Sizes:"
echo "   CSS:  $(du -h css/styles.css | cut -f1) → $(du -h css/styles.min.css | cut -f1)"
echo "   JS:   $(du -h js/app.js | cut -f1) → $(du -h js/app.min.js | cut -f1)"
echo ""
echo "🚀 Deployment Files:"
echo "   ✅ index.production.html"
echo "   ✅ css/styles.min.css"
echo "   ✅ js/app.min.js"
echo ""
echo "💾 Source Files (Keep These!):"
echo "   📝 index.html"
echo "   📝 css/styles.css"  
echo "   📝 js/app.js"
echo ""
echo "🌐 To deploy:"
echo "   1. Upload index.production.html (rename to index.html)"
echo "   2. Upload css/ and js/ folders"
echo "   3. Done!"
echo ""
echo "=========================================="
