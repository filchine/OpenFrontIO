#!/bin/sh
# Add personal fork notice to the built index.html

INDEX_FILE="/home/filippo/openfront/static/index.html"

# Read the current index.html
CONTENT=$(cat "$INDEX_FILE")

# Add the fork notice banner after <body> - using | as sed delimiter
NOTICE='<div id="fork-notice" style="position:fixed;top:0;left:0;right:0;background:#fff3cd;border-bottom:2px solid #ffc107;color:#856404;padding:8px 16px;text-align:center;z-index:9999;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><strong>Personal Fork:</strong> This is a personal fork of <a href="https://openfront.io" target="_blank" style="color:#856404;text-decoration:underline;">OpenFront.io</a> - not the official server. <a href="https://github.com/filchine/OpenFrontIO" target="_blank" style="color:#856404;text-decoration:underline;margin-left:8px;">Source</a> <a href="https://openfront.io" target="_blank" style="color:#856404;text-decoration:underline;margin-left:8px;">Official Game</a> <button onclick="document.getElementById('\''fork-notice'\'').style.display='\''none'\''" style="margin-left:12px;background:#856404;color:white;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;">Dismiss</button></div>'

# Insert after <body> using | as delimiter
echo "$CONTENT" | sed "s|<body>|<body>$NOTICE|" > "$INDEX_FILE"
echo "Fork notice added to index.html"