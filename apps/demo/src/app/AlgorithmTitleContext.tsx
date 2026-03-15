"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const TitleContext = createContext<string>("");
const SetTitleContext = createContext<(title: string) => void>(() => {});

export function AlgorithmTitleProvider({ children }: { children: ReactNode }) {
    const [title, setTitle] = useState("");
    const stableSetTitle = useCallback((t: string) => setTitle(t), []);
    return (
        <SetTitleContext.Provider value={stableSetTitle}>
            <TitleContext.Provider value={title}>
                {children}
            </TitleContext.Provider>
        </SetTitleContext.Provider>
    );
}

export function useAlgorithmTitle() {
    return useContext(TitleContext);
}

export function useSetAlgorithmTitle() {
    return useContext(SetTitleContext);
}
