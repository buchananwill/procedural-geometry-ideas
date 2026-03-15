"use client";

import { useEffect } from "react";
import { Group, ScrollArea, Stack, Drawer, ActionIcon, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useSetAlgorithmTitle } from "./AlgorithmTitleContext";

interface AlgorithmPageLayoutProps {
    canvas: React.ReactNode;
    panels: React.ReactNode;
    algorithmName?: string;
}

export default function AlgorithmPageLayout({ canvas, panels, algorithmName }: AlgorithmPageLayoutProps) {
    const setTitle = useSetAlgorithmTitle();
    useEffect(() => {
        setTitle(algorithmName ?? "");
        return () => setTitle("");
    }, [algorithmName, setTitle]);
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

    return (
        <>
            <Group
                align="stretch"
                gap="md"
                wrap="nowrap"
                style={{ height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))" }}
            >
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
                    {canvas}

                    {!isDesktop && (
                        <ActionIcon
                            variant="filled"
                            color="blue"
                            size="xl"
                            radius="xl"
                            onClick={openDrawer}
                            style={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                zIndex: 10,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            }}
                            title="Open controls"
                        >
                            <Text size="lg" fw={700}>&#9776;</Text>
                        </ActionIcon>
                    )}
                </div>

                {isDesktop && (
                    <ScrollArea style={{ height: "100%", width: 240, flexShrink: 0 }}>
                        <Stack w={240}>{panels}</Stack>
                    </ScrollArea>
                )}
            </Group>

            <Drawer
                opened={drawerOpened && !isDesktop}
                onClose={closeDrawer}
                title="Controls"
                position="right"
                size="280"
                padding="sm"
            >
                <ScrollArea style={{ height: "calc(100vh - 80px)" }}>
                    {panels}
                </ScrollArea>
            </Drawer>
        </>
    );
}
