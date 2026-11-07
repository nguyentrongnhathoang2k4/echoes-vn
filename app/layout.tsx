import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "../src/context/LanguageContext";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["vietnamese", "latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["vietnamese", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Echoes: 03:14 AM - Visual Novel",
  description: "Dự án Game Visual Novel Tâm lý Bí ẩn & Phiêu lưu Điểm ảnh",
  // Chặn Dark Reader tự đảo màu: chữ trên tranh minh hoạ (nhãn HTML) bị đổi sang trắng trên giấy trắng
  other: { "darkreader-lock": "true" },
};

// Game vốn tối sẵn: báo cho trình duyệt để chế độ tối tự động (Chrome Auto Dark) không đảo màu lần nữa
export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      // Extension trình duyệt (vd. QuillBot) chèn thuộc tính vào <html> trước khi React hydrate
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
