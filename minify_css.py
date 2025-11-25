#!/usr/bin/env python3
"""
CSS Minifier
Creates a minified version of your CSS
"""

import re

def minify_css(css_code):
    """Minify CSS code"""
    
    # Remove comments
    css_code = re.sub(r'/\*.*?\*/', '', css_code, flags=re.DOTALL)
    
    # Remove extra whitespace
    css_code = re.sub(r'\s+', ' ', css_code)
    
    # Remove spaces around special characters
    css_code = re.sub(r'\s*([{}:;,>+~])\s*', r'\1', css_code)
    
    # Remove last semicolon in a block
    css_code = re.sub(r';\}', '}', css_code)
    
    # Remove spaces after colons in property values
    css_code = re.sub(r':\s+', ':', css_code)
    
    # Remove newlines
    css_code = css_code.replace('\n', '').replace('\r', '')
    
    return css_code.strip()

def create_minified_css(input_file, output_file):
    """Create minified CSS file"""
    
    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        original = f.read()
    
    original_size = len(original)
    print(f"Original size: {original_size:,} bytes ({original_size/1024:.2f} KB)")
    
    print("Minifying CSS...")
    minified = minify_css(original)
    minified_size = len(minified)
    
    print(f"Minified size: {minified_size:,} bytes ({minified_size/1024:.2f} KB)")
    print(f"Reduction: {(1-minified_size/original_size)*100:.1f}%")
    
    print(f"\nWriting to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"/*! PDF Bulk Highlighter - Minified CSS */\n")
        f.write(minified)
    
    print("✅ CSS minification complete!")
    
    return minified

if __name__ == "__main__":
    import sys
    import os
    
    if len(sys.argv) < 2:
        print("CSS Minifier")
        print("\nUsage:")
        print("  python3 minify_css.py <input.css> [output.css]")
        print("\nExample:")
        print("  python3 minify_css.py css/styles.css css/styles.min.css")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.css', '.min.css')
    
    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found!")
        sys.exit(1)
    
    create_minified_css(input_file, output_file)
    print(f"\n🎨 Use {output_file} in production")
    print(f"   Keep {input_file} as your source")
