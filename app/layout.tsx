import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finflow — Quản lý tài chính thông minh",
  description: "Theo dõi dòng tiền, thu chi và giao dịch ngân hàng qua SePay.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
