import { useState } from 'react';
import {
    Stack, UnstyledButton, Text, Group, Collapse,
    TextInput, ActionIcon, Pill, Tooltip,
} from '@mantine/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { symbolsToText, parseKeywords } from './dol-config-utils';

function AlphabetRow({ letter, keywords, onBlurChange, onRemove }: {
    letter: string;
    keywords: string;
    onBlurChange: (letter: string, value: string) => void;
    onRemove: (letter: string) => void;
}) {
    const [draft, setDraft] = useState(keywords);
    return (
        <Group gap="xs" align="flex-end">
            <Pill size="sm">{letter}</Pill>
            <Tooltip label="Keywords assigned to this letter. Edit and press Tab or click away to apply." maw={300} multiline>
                <TextInput
                    size="xs"
                    style={{ flex: 1 }}
                    value={draft}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    onBlur={() => onBlurChange(letter, draft)}
                />
            </Tooltip>
            <ActionIcon
                size="sm"
                variant="light"
                color="red"
                onClick={() => onRemove(letter)}
                title="Remove letter"
            >
                <IconCircleMinus size={14} />
            </ActionIcon>
        </Group>
    );
}

export default function DolAlphabetSection() {
    const [opened, setOpened] = useState(true);
    const config = useDolSystemStore((s) => s.config);
    const setAlphabet = useDolSystemStore((s) => s.setAlphabet);
    const addLetter = useDolSystemStore((s) => s.addLetter);
    const removeLetter = useDolSystemStore((s) => s.removeLetter);

    const [newLetterName, setNewLetterName] = useState('');
    const [newLetterKeywords, setNewLetterKeywords] = useState('');

    return (
        <Stack gap="xs">
            <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                <Group justify="space-between">
                    <Text size="xs" c="dimmed" fw={600}>Alphabet Definitions</Text>
                    <Text size="xs" c="blue">{opened ? '\u25B2' : '\u25BC'}</Text>
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>
                <Stack gap="xs">
                    {Object.keys(config.alphabet).map((letter) => (
                        <AlphabetRow
                            key={letter}
                            letter={letter}
                            keywords={symbolsToText(config.alphabet[letter])}
                            onBlurChange={(l, val) => {
                                const keywords = parseKeywords(val);
                                setAlphabet(l, keywords);
                            }}
                            onRemove={removeLetter}
                        />
                    ))}
                    <Group gap="xs" align="flex-end">
                        <Tooltip label="A short identifier for this symbol, e.g. A or B. Used in production rules and the axiom." maw={300} multiline>
                            <TextInput
                                size="xs"
                                placeholder="Name"
                                style={{ width: 60 }}
                                value={newLetterName}
                                onChange={(e) => setNewLetterName(e.currentTarget.value)}
                            />
                        </Tooltip>
                        <Tooltip
                            maw={300}
                            multiline
                            label={
                                <span>
                                    Space-separated drawing commands this letter executes.
                                    <br /><br />
                                    Valid keywords:
                                    <br />F — draw forward
                                    <br />f — move without drawing
                                    <br />+ — turn left by Angle Delta
                                    <br />- — turn right
                                    <br />[ — push position
                                    <br />] — pop position
                                </span>
                            }
                        >
                            <TextInput
                                size="xs"
                                placeholder="Keywords"
                                style={{ flex: 1 }}
                                value={newLetterKeywords}
                                onChange={(e) => setNewLetterKeywords(e.currentTarget.value)}
                            />
                        </Tooltip>
                        <ActionIcon
                            size="sm"
                            variant="light"
                            onClick={() => {
                                const name = newLetterName.trim();
                                if (!name) return;
                                const keywords = parseKeywords(newLetterKeywords);
                                addLetter(name, keywords);
                                setNewLetterName('');
                                setNewLetterKeywords('');
                            }}
                        >
                            <IconCirclePlus size={14} />
                        </ActionIcon>
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
}
