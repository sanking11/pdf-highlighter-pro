# 🚀 DEPLOYMENT GUIDE

## Quick Deploy to Your Website

### Step 1: Prepare Files
Before uploading, make sure you have:
- ✅ `index.production.html`
- ✅ `css/styles.min.css`
- ✅ `js/app.min.js`
- ✅ `assets/` folder (all images and icons)

### Step 2: Upload to Server
Upload these files to your web server:

```
your-website-root/
├── index.html  ← Rename index.production.html to this
├── css/
│   └── styles.min.css
├── js/
│   └── app.min.js
└── assets/
    ├── favicon.svg
    ├── pdf-icon.png
    ├── zip-icon.png
    └── report.png
```

### Step 3: Verify
1. Visit your website URL
2. Test all features:
   - Upload PDFs
   - Add highlighting rules
   - Process files
   - Download results
3. Check browser console (F12) for errors

---

## 📋 Pre-Deployment Checklist

- [ ] Tested `index.production.html` locally
- [ ] All features working
- [ ] No console errors
- [ ] Files are minified versions
- [ ] Source files backed up
- [ ] Assets folder included

---

## 🖥️ Hosting Options

### Option 1: Traditional Web Hosting
1. Use FTP/SFTP client (FileZilla, Cyberduck)
2. Upload files to `public_html` or `www` folder
3. Access via your domain

### Option 2: GitHub Pages (Free!)
```bash
# In your project folder
git init
git add .
git commit -m "Initial commit"
git push to GitHub
# Enable GitHub Pages in repo settings
```

### Option 3: Netlify/Vercel (Free!)
1. Create account on Netlify or Vercel
2. Drag and drop your folder
3. Get instant HTTPS URL

---

## ⚙️ Server Configuration

### Apache (.htaccess)
```apache
# Enable compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>

# Enable caching
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
```

### Nginx
```nginx
# Enable gzip compression
gzip on;
gzip_types text/css application/javascript;

# Cache static files
location ~* \.(css|js|png|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 🔒 Security Headers (Optional but Recommended)

Add these to your server configuration for extra security:

### For Apache (.htaccess):
```apache
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"
    Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
```

### For Nginx:
```nginx
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "SAMEORIGIN";
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";
```

---

## 🐛 Troubleshooting

### Files not loading?
- Check file paths are correct
- Verify files are uploaded to correct directory
- Check file permissions (should be readable)

### CSS/JS not working?
- Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Check browser console for 404 errors
- Verify file names match exactly (case-sensitive)

### Images not showing?
- Check `assets/` folder is uploaded
- Verify image paths in HTML
- Check image file permissions

---

## 📊 Performance Testing

After deployment, test your site:

1. **Google PageSpeed Insights**: https://pagespeed.web.dev/
2. **GTmetrix**: https://gtmetrix.com/
3. **WebPageTest**: https://www.webpagetest.org/

Expected scores with minified files:
- Performance: 90-100
- Accessibility: 90-100
- Best Practices: 90-100

---

## 🔄 Updating Your Site

When you make changes:

```bash
# 1. Edit source files
nano js/app.js

# 2. Test locally
open index.html

# 3. Re-protect
./protect.sh

# 4. Upload new minified files
# Upload: css/styles.min.css
# Upload: js/app.min.js
# Upload: index.production.html (rename to index.html)
```

---

## ✅ Post-Deployment

After deploying:
1. ✅ Test on multiple browsers (Chrome, Firefox, Safari, Edge)
2. ✅ Test on mobile devices
3. ✅ Check all features work
4. ✅ Monitor for errors
5. ✅ Keep source files backed up

---

**Your site is now live and protected!** 🎉

For support, check browser console for errors.
