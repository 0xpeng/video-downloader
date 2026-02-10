# Video Downloader

一個簡單的影片下載工具，支援 YouTube、TikTok、Twitter/X 等平台。

## 功能特色

- 支援多個平台：YouTube、TikTok、Twitter/X、Instagram 等
- 自動轉碼為 H.264，確保 Mac/iPhone 可以播放
- 支援影片和純音訊（MP3）下載
- 繁體中文介面

## 系統需求

- Node.js 18+
- yt-dlp
- ffmpeg

## 安裝步驟

### 1. 安裝系統依賴

**macOS (使用 Homebrew):**
```bash
brew install yt-dlp ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
pip3 install yt-dlp
```

**Windows:**
```bash
# 使用 winget
winget install yt-dlp ffmpeg

# 或使用 chocolatey
choco install yt-dlp ffmpeg
```

### 2. Clone 專案

```bash
git clone https://github.com/0xpeng/video-downloader.git
cd video-downloader
```

### 3. 安裝 Node.js 依賴

```bash
npm install
```

### 4. 啟動應用

**開發模式：**
```bash
npm run dev
```

**生產模式：**
```bash
npm run build
npm run start
```

然後開啟瀏覽器訪問：http://localhost:3000/download

## Docker 部署

如果你有安裝 Docker，可以直接用 Docker 運行：

```bash
docker build -t video-downloader .
docker run -p 3000:3000 video-downloader
```

或使用 Docker Compose：

```bash
docker-compose up -d
```

## 使用方式

1. 開啟 http://localhost:3000/download
2. 貼上影片網址
3. 點擊「下載影片」或「僅下載音訊」

## 支援的平台

| 平台 | 狀態 |
|------|------|
| YouTube | ✅ 完整支援 |
| TikTok | ✅ 完整支援 |
| Twitter/X | ✅ 完整支援 |
| Instagram | ✅ 完整支援 |
| Facebook | ✅ 完整支援 |
| Bilibili | ✅ 完整支援 |
| 其他 | 由 yt-dlp 支援的平台都可以 |

## macOS 桌面應用

專案包含一個簡易的 macOS 應用程式，可以雙擊啟動：

```bash
# 建置專案
npm run build

# 安裝到應用程式資料夾
cp -r VideoDownloader.app /Applications/
cp -r StopVideoDownloader.app /Applications/
```

## 常見問題

### Q: 下載的影片無法播放？
A: 確保你的 ffmpeg 已正確安裝。本專案會自動將影片轉碼為 H.264 格式。

### Q: TikTok 下載失敗？
A: 請確保 yt-dlp 是最新版本：`pip3 install -U yt-dlp`

### Q: 小紅書無法下載？
A: 小紅書有地區限制，可能需要使用中國 IP。

## 技術架構

- **前端**：Next.js 16、React 19、Tailwind CSS
- **後端**：Next.js API Routes
- **下載引擎**：yt-dlp
- **轉碼**：ffmpeg

## License

MIT

## 貢獻

歡迎提交 Issue 和 Pull Request！
