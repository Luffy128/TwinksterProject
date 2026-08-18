import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twinkster Local",
  description: "Mesa local para jugar a Hitster por Discord con MP3 propios.",
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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
