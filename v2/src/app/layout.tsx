import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "MN Check",
  description: "Separação, conferência e contagem de estoque",
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
};

/** Menu filtrado por perfil: o operador só vê o que pode operar. */
const LINKS = [
  { href: "/contagem", label: "Contagem", roles: ["ADMIN", "STOCK"] },
  { href: "/separacao", label: "Separação", roles: ["ADMIN", "SEPARATION"] },
  { href: "/conferencia", label: "Conferência", roles: ["ADMIN", "EXPEDITION"] },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="pt-BR">
      <body>
        {user && (
          <nav>
            {LINKS.filter((link) => link.roles.includes(user.role)).map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <span style={{ marginLeft: "auto" }} className="muted">
              {user.name}
            </span>
          </nav>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
