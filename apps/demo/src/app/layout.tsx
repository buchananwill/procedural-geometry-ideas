import type { Metadata } from "next";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import AppShellLayout from "./AppShellLayout";
import { AlgorithmTitleProvider } from "./AlgorithmTitleContext";

export const metadata: Metadata = {
  title: "Procedural Geometry",
  description: "Interactive procedural geometry demos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider>
          <AlgorithmTitleProvider>
            <AppShellLayout>{children}</AppShellLayout>
          </AlgorithmTitleProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
