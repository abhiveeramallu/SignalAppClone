import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { WebSocketProvider } from "@/lib/ws";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Signal Clone",
  description: "A Signal-inspired secure messaging platform (assignment project).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-neutral-50 font-sans antialiased`}>
        <AuthProvider>
          <WebSocketProvider>{children}</WebSocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
