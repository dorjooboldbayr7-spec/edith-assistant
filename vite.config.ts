import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron файлаас (file://) ачаалах тул харьцангуй зам хэрэгтэй.
  base: "./",
  server: { port: 5173, strictPort: true },
  // PostCSS тохиргоо хэрэггүй. Хоосон тохиргоо өгснөөр Vite эцэг хавтсуудаас
  // postcss.config / package.json хайхаа больж, тэнд эвдэрсэн файл байсан ч алдаа гарахгүй.
  css: { postcss: {} },
});
