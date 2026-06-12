"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const hrefSegments = href.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);
  const isActive =
    hrefSegments.length > 0 &&
    hrefSegments.every((segment, index) => pathSegments[index] === segment);

  return (
    <Link
      href={href}
      className={
        isActive
          ? "rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-900"
          : "rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
      }
    >
      {children}
    </Link>
  );
}

export function AppNav() {
  return (
    <nav className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-2">
        <NavLink href="/otpravki">Отправки</NavLink>
        <NavLink href="/sklad">Склад</NavLink>
      </div>
    </nav>
  );
}
