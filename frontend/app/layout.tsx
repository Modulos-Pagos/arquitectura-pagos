import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter', weight: ['400', '600'] });
const poppins = Poppins({ subsets: ["latin"], variable: '--font-poppins', weight: ['600', '700'] });

export const metadata: Metadata = {
  title: "Ticket-u | Checkout Seguro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${poppins.variable} font-sans bg-ticket-bg text-ticket-primary antialiased`}>
        {children}
      </body>
    </html>
  );
}