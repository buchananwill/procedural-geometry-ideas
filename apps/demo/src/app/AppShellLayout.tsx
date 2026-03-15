"use client";

import { useEffect } from "react";
import { AppShell, Burger, Drawer, Group, NavLink, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface AppShellLayoutProps {
    children: React.ReactNode;
}

export default function AppShellLayout({ children }: AppShellLayoutProps) {
    const pathname = usePathname();
    const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

    useEffect(() => {
        closeDrawer();
    }, [pathname]);

    return (
        <AppShell header={{ height: 60 }} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={drawerOpened} onClick={drawerOpened ? closeDrawer : openDrawer} size="sm" />
                    <Title order={3}>Procedural Geometry</Title>
                </Group>
            </AppShell.Header>

            <Drawer
                opened={drawerOpened}
                onClose={closeDrawer}
                position="left"
                size="xs"
                title="Navigation"
                padding="sm"
            >
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
            </Drawer>

            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
