import { CaretDown, CaretUp } from '@phosphor-icons/react';

export interface CollapseChevronProps {
    opened: boolean;
    color?: string;
    size?: number;
}

/** Collapse-section indicator: caret pointing up when opened, down when closed. */
export default function CollapseChevron({ opened, color = 'var(--mantine-color-blue-6)', size = 12 }: CollapseChevronProps) {
    return opened ? <CaretUp size={size} color={color} /> : <CaretDown size={size} color={color} />;
}
