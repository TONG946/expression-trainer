import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "表达训练模拟器",
  description: "个人使用的表达训练模拟器：幽默感、结构表达、高情商回复三大场景。",
};

// viewportFit: "cover" 让 env(safe-area-inset-*) 在刘海屏/全面屏生效，
// 配合各页面底部安全区 padding，修复移动端底部被系统导航栏遮挡的问题。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
