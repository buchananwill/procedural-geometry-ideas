"use client";

import { useEffect } from "react";
import { AppShell, Burger, Group, NavLink, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAlgorithmTitle } from "./AlgorithmTitleContext";

interface AppShellLayoutProps {
    children: React.ReactNode;
}

export default function AppShellLayout({ children }: AppShellLayoutProps) {
    const pathname = usePathname();
    const algorithmTitle = useAlgorithmTitle();
    const [navbarOpened, { open: openNavbar, close: closeNavbar, toggle: toggleNavbar }] = useDisclosure(false);

    useEffect(() => {
        closeNavbar();
    }, [pathname, closeNavbar]);

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{ width: 200, breakpoint: "sm", collapsed: { mobile: !navbarOpened, desktop: !navbarOpened } }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={navbarOpened} onClick={toggleNavbar} size="sm" />
                    <Title order={3}>Procedural Geometry{algorithmTitle ? ` \u2014 ${algorithmTitle}` : ""}</Title>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <NavLink
                    component={Link}
                    href="/straight-skeleton"
                    label="Straight Skeleton"
                    active={pathname === "/straight-skeleton"}
                />
                <NavLink
                    component={Link}
                    href="/dol-system"
                    label="L-System (D0L)"
                    active={pathname === "/dol-system"}
                />
                <NavLink
                    component={Link}
                    href="/pen-stroke"
                    label="Pen Stroke -> Spline"
                    active={pathname === "/pen-stroke"}
                />
                <NavLink
                    component={Link}
                    href="/articulation"
                    label="Articulation Constraints"
                    active={pathname === "/articulation"}
                />
            </AppShell.Navbar>

            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
