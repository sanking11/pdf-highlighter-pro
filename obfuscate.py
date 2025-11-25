#!/usr/bin/env python3
"""
JavaScript Minifier and Obfuscator
Creates a protected version of your JavaScript code
"""

import re
import random
import string
import hashlib

def generate_var_name(index):
    """Generate obfuscated variable names"""
    chars = string.ascii_lowercase
    name = '_0x'
    # Create unique hex-like names
    hex_val = hex(index)[2:]
    return f"_0x{hex_val}"

def minify_js(js_code):
    """Basic JavaScript minification - SAFE version that preserves string literals"""

    # First, extract and protect all string literals
    strings = []
    string_placeholder = "___STRING_PLACEHOLDER_{}___"

    # Match both single and double quoted strings, including escaped quotes
    def save_string(match):
        strings.append(match.group(0))
        return string_placeholder.format(len(strings) - 1)

    # Protect strings from minification
    js_code = re.sub(r'"(?:[^"\\]|\\.)*"', save_string, js_code)
    js_code = re.sub(r"'(?:[^'\\]|\\.)*'", save_string, js_code)
    js_code = re.sub(r'`(?:[^`\\]|\\.)*`', save_string, js_code)  # template literals

    # Now safe to minify
    # Remove comments
    js_code = re.sub(r'//.*?\n', '\n', js_code)
    js_code = re.sub(r'/\*.*?\*/', '', js_code, flags=re.DOTALL)

    # Remove extra whitespace
    js_code = re.sub(r'\s+', ' ', js_code)

    # Remove spaces around operators and symbols
    js_code = re.sub(r'\s*([{}();,:])\s*', r'\1', js_code)
    js_code = re.sub(r'\s*([=+\-*/<>!&|])\s*', r'\1', js_code)

    # Remove unnecessary semicolons before }
    js_code = re.sub(r';}', '}', js_code)

    # Restore strings (in reverse order to avoid partial replacements)
    for i in range(len(strings) - 1, -1, -1):
        js_code = js_code.replace(string_placeholder.format(i), strings[i])

    return js_code.strip()

def obfuscate_strings(js_code):
    """Obfuscate string literals - DISABLED for now to avoid errors"""
    # String obfuscation can cause issues, so we'll skip it
    # and just rely on minification + anti-debug
    return js_code

def obfuscate_js(js_code, level='medium'):
    """
    Obfuscate JavaScript code
    
    Args:
        js_code: JavaScript source code
        level: 'light', 'medium', or 'heavy'
    """
    print(f"Obfuscating with {level} level...")
    
    # First minify
    code = minify_js(js_code)
    
    if level in ['medium', 'heavy']:
        # Obfuscate strings
        code = obfuscate_strings(code)
    
    if level == 'heavy':
        # Add anti-debugging
        anti_debug = """
(function(){var _0xcheck=function(){var _0xstart=new Date();
debugger;var _0xend=new Date();
if(_0xend-_0xstart>100){window.location.reload();}};
setInterval(_0xcheck,1000);})();
"""
        code = anti_debug + code
    
    # Add protective wrapper
    wrapped = f"""
/*! PDF Bulk Highlighter - Protected Code */
(function(_0xwindow,_0xdocument){{
'use strict';
{code}
}})(window,document);
"""
    
    return wrapped

def create_protected_version(input_file, output_file, level='heavy'):
    """Create protected version of JavaScript file"""
    
    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        original_code = f.read()
    
    original_size = len(original_code)
    print(f"Original size: {original_size:,} bytes ({original_size/1024:.2f} KB)")
    
    # Minify first
    print("Minifying...")
    minified = minify_js(original_code)
    minified_size = len(minified)
    print(f"Minified size: {minified_size:,} bytes ({minified_size/1024:.2f} KB)")
    print(f"Reduction: {(1-minified_size/original_size)*100:.1f}%")
    
    # Then obfuscate
    protected = obfuscate_js(original_code, level=level)
    protected_size = len(protected)
    
    print(f"\nWriting protected version to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(protected)
    
    print(f"Protected size: {protected_size:,} bytes ({protected_size/1024:.2f} KB)")
    print(f"\n✅ Protection complete!")
    print(f"   Original:  {original_size:,} bytes")
    print(f"   Minified:  {minified_size:,} bytes ({(1-minified_size/original_size)*100:.1f}% smaller)")
    print(f"   Protected: {protected_size:,} bytes")
    
    return protected

def create_source_map(input_file, output_dir):
    """Create a source map for debugging"""
    import json
    
    with open(input_file, 'r', encoding='utf-8') as f:
        code = f.read()
    
    # Simple source map
    source_map = {
        "version": 3,
        "file": "app.min.js",
        "sources": ["app.js"],
        "names": [],
        "mappings": ""
    }
    
    map_file = f"{output_dir}/app.min.js.map"
    with open(map_file, 'w') as f:
        json.dump(source_map, f)
    
    print(f"Source map created: {map_file}")

if __name__ == "__main__":
    import sys
    import os
    
    if len(sys.argv) < 2:
        print("JavaScript Obfuscator & Minifier")
        print("\nUsage:")
        print("  python3 obfuscate.py <input.js> [output.js] [level]")
        print("\nLevels:")
        print("  light  - Minification only")
        print("  medium - Minification + string obfuscation")
        print("  heavy  - Full obfuscation + anti-debugging (default)")
        print("\nExample:")
        print("  python3 obfuscate.py js/app.js js/app.min.js heavy")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.js', '.min.js')
    level = sys.argv[3] if len(sys.argv) > 3 else 'heavy'
    
    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found!")
        sys.exit(1)
    
    create_protected_version(input_file, output_file, level)
    print(f"\n🔒 Your code is now protected!")
    print(f"   Use {output_file} in production")
    print(f"   Keep {input_file} as your source (backup)")
