# AI Suno MV

一个基于 React、Vite 和 Gemini API 的音乐 MV 生成工具。应用会把音频、封面图和 SRT 字幕组合成可预览、可录制导出的音乐视频，并支持 AI 辅助生成封面、歌词字幕和歌曲元信息。

## 功能

- 上传或使用默认音频、封面图和 SRT 字幕
- 自动从文件名识别歌曲名、原唱和风格
- 使用 Gemini 生成油画风格封面图
- 使用 Gemini 从音频生成简体中文 SRT 字幕
- 实时 Canvas 预览 MV 画面、歌词滚动和音频可视化
- 支持竖屏 `9:16` 和横屏 `16:9`
- 支持 `MP4` / `WebM` 导出，具体可用格式取决于浏览器的 `MediaRecorder` 支持
- 支持智能截取高能片段并导出 highlight 视频

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Google GenAI SDK
- Lucide React
- Web Audio API / Canvas API / MediaRecorder API

## 本地运行

### 环境要求

- Node.js
- npm
- Gemini API Key

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制示例环境变量文件：

```bash
cp .env.example .env.local
```

在 `.env.local` 中配置：

```bash
GEMINI_API_KEY="你的 Gemini API Key"
```

不要把真实 API Key 提交到仓库。

### 启动开发服务

```bash
npm run dev
```

默认开发服务会监听：

```text
http://localhost:3000
```

## 常用命令

```bash
npm run dev
```

启动本地开发服务。

```bash
npm run build
```

构建生产版本。

```bash
npm run preview
```

预览生产构建。

```bash
npm run lint
```

运行 TypeScript 类型检查。

```bash
npm run clean
```

删除 `dist` 构建目录。

## 默认素材

项目内置了默认演示素材，位于：

```text
public/default-assets/default-audio.wav
public/default-assets/default-cover.jpg
public/default-assets/default-subtitles.srt
```

应用启动后会自动加载这些素材，方便直接预览和导出。

## 文件名识别规则

上传音频后，应用会优先按以下格式解析文件名：

```text
歌曲名-歌手-风格.wav
```

例如：

```text
日不落-蔡依林-R&B.wav
```

如果文件名信息不足，应用会调用 Gemini 尝试推断歌曲名、原唱和音乐风格。

## 项目结构

```text
.
├── public/default-assets/   # 默认音频、封面和字幕
├── src/
│   ├── App.tsx              # 主应用逻辑和界面
│   ├── index.css            # Tailwind 入口
│   └── main.tsx             # React 入口
├── .env.example             # 环境变量示例
├── vite.config.ts           # Vite 配置
└── package.json             # 项目脚本和依赖
```

## 注意事项

- AI 封面、AI 字幕和元信息推断需要配置 `GEMINI_API_KEY`。
- 视频导出依赖浏览器原生能力，不同浏览器对 `MP4` / `WebM` 的支持可能不同。
- 录制导出时请保持页面打开，避免浏览器暂停标签页导致录制中断。
