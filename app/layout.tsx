import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spatial DevEx Bridge",
  description:
    "A WebXR proof of concept connecting live CI/CD state to a spatial repair interaction.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
