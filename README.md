# AI Suno MV

一个基于 Vite、React 和 TypeScript 的音乐 MV 生成工具。应用支持上传音频、封面图和 SRT 字幕，并在浏览器中生成带标题、字幕和音频可视化效果的视频画面。

## 功能概览

- 上传音频并预览播放。
- 上传或使用 Gemini 生成封面图。
- 导入、编辑和导出 SRT 字幕。
- 在 Canvas 中渲染标题、歌词字幕和音频可视化效果。
- 导出视频文件。

## 环境要求

- Node.js
- npm
- Gemini API Key

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置环境变量：

   在 `.env.local` 中设置：

   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```

3. 启动开发服务器：

   ```bash
   npm run dev
   ```

   默认访问地址为：

   ```text
   http://localhost:3000
   ```

## 常用命令

```bash
npm run dev      # 启动本地开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览构建产物
npm run lint     # TypeScript 类型检查
npm run clean    # 删除 dist 目录
```

## 项目结构

```text
.
├── src/
│   ├── App.tsx      # 主应用逻辑和界面
│   ├── main.tsx     # React 入口
│   └── index.css    # Tailwind CSS 入口
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 注意事项

- 不要提交 `.env.local` 或任何包含密钥的文件。
- `GEMINI_API_KEY` 只应通过本地环境变量提供。
- AI Studio 原始应用地址：https://ai.studio/apps/33df07a3-7f47-41aa-95fe-43815bffdc6e

## 许可证

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。
