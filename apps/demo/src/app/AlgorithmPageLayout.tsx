"use client";

import { useEffect } from "react";
import { ScrollArea, Stack, Drawer, ActionIcon, Text } from "@mantine/core";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import styles from "./AlgorithmPageLayout.module.css";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useSetAlgorithmTitle } from "./AlgorithmTitleContext";

interface AlgorithmPageLayoutProps {
    canvas: React.ReactNode;
    panels: React.ReactNode;
    algorithmName?: string;
    playbackController?: React.ReactNode;
}

export default function AlgorithmPageLayout({ canvas, panels, algorithmName, playbackController }: AlgorithmPageLayoutProps) {
    const setTitle = useSetAlgorithmTitle();
    useEffect(() => {
        setTitle(algorithmName ?? "");
        return () => setTitle("");
    }, [algorithmName, setTitle]);
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

    return (
        <>
            {isDesktop ? (
                <div style={{ height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))" }}>
                    <PanelGroup orientation="horizontal" style={{ height: "100%" }}>
                        <Panel minSize={30}>
                            <div style={{ minWidth: 0, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
                                {playbackController}
                                {canvas}
                            </div>
                        </Panel>
                        <PanelResizeHandle className={styles.resizeHandle} />
                        <Panel defaultSize={`20%`} minSize={`10%`} maxSize={`40%`}>
                            <ScrollArea style={{ height: "100%" }} p={'sm'}>
                                <Stack>{panels}</Stack>
                            </ScrollArea>
                        </Panel>
                    </PanelGroup>
                </div>
            ) : (
                <div style={{ height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))", position: "relative", display: "flex", flexDirection: "column" }}>
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
                    {playbackController}
                    {canvas}
                </div>
            )}

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
