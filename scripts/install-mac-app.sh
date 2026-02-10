#!/bin/bash

# Video Downloader macOS 應用程式安裝腳本
# 使用方式：./scripts/install-mac-app.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="VideoDownloader"
STOP_APP_NAME="StopVideoDownloader"

echo "📦 正在建立 Video Downloader macOS 應用程式..."
echo "專案目錄: $APP_DIR"

# 建立應用程式目錄結構
mkdir -p "$APP_DIR/$APP_NAME.app/Contents/MacOS"
mkdir -p "$APP_DIR/$APP_NAME.app/Contents/Resources"
mkdir -p "$APP_DIR/$STOP_APP_NAME.app/Contents/MacOS"

# 建立 Info.plist
cat > "$APP_DIR/$APP_NAME.app/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.videodownloader.app</string>
    <key>CFBundleName</key>
    <string>Video Downloader</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# 建立啟動腳本
cat > "$APP_DIR/$APP_NAME.app/Contents/MacOS/launcher" << EOF
#!/bin/bash

APP_DIR="$APP_DIR"
PORT=3000
LOG_FILE="\$APP_DIR/server.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"

if lsof -i :\$PORT > /dev/null 2>&1; then
    open "http://localhost:\$PORT/download"
    exit 0
fi

cd "\$APP_DIR"

if [ ! -d "node_modules" ]; then
    osascript -e 'display notification "正在安裝依賴..." with title "Video Downloader"'
    npm install >> "\$LOG_FILE" 2>&1
fi

if [ ! -d ".next" ]; then
    osascript -e 'display notification "正在建置應用程式..." with title "Video Downloader"'
    npm run build >> "\$LOG_FILE" 2>&1
fi

osascript -e 'display notification "正在啟動伺服器..." with title "Video Downloader"'

npm run start >> "\$LOG_FILE" 2>&1 &

sleep 3

for i in {1..10}; do
    if curl -s "http://localhost:\$PORT" > /dev/null 2>&1; then
        open "http://localhost:\$PORT/download"
        osascript -e 'display notification "Video Downloader 已啟動！" with title "Video Downloader"'
        exit 0
    fi
    sleep 1
done

osascript -e 'display alert "Video Downloader" message "伺服器啟動失敗"'
EOF

chmod +x "$APP_DIR/$APP_NAME.app/Contents/MacOS/launcher"

# 建立停止應用程式
cat > "$APP_DIR/$STOP_APP_NAME.app/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>stop</string>
    <key>CFBundleIdentifier</key>
    <string>com.videodownloader.stop</string>
    <key>CFBundleName</key>
    <string>Stop Video Downloader</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
EOF

cat > "$APP_DIR/$STOP_APP_NAME.app/Contents/MacOS/stop" << EOF
#!/bin/bash
PID=\$(lsof -ti :3000)
if [ -n "\$PID" ]; then
    kill \$PID 2>/dev/null
    osascript -e 'display notification "Video Downloader 已停止" with title "Video Downloader"'
else
    osascript -e 'display notification "Video Downloader 未在運行" with title "Video Downloader"'
fi
EOF

chmod +x "$APP_DIR/$STOP_APP_NAME.app/Contents/MacOS/stop"

echo ""
echo "✅ 應用程式已建立完成！"
echo ""
echo "📍 位置："
echo "   $APP_DIR/$APP_NAME.app"
echo "   $APP_DIR/$STOP_APP_NAME.app"
echo ""
echo "📦 安裝到應用程式資料夾："
echo "   cp -r \"$APP_DIR/$APP_NAME.app\" /Applications/"
echo "   cp -r \"$APP_DIR/$STOP_APP_NAME.app\" /Applications/"
echo ""
echo "🚀 或者直接雙擊 $APP_NAME.app 啟動！"
