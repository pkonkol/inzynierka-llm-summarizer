import { useEffect, useState } from "react";

import { getEvaluationSetEntryInputText } from "../api/research";
import { PreBlock } from "./PreBlock";

type Props = {
    setId: string;
    entryId: string;
};

export function InputTextSection({ setId, entryId }: Props) {
    const [inputText, setInputText] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        getEvaluationSetEntryInputText(setId, entryId)
            .then((data) => {
                if (!isMounted) return;
                setInputText(data.input_text);
            })
            .catch((error: unknown) => {
                if (!isMounted) return;
                setErrorMessage(`Nie udało się pobrać input text: ${String(error)}`);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [setId, entryId]);

    if (isLoading) return <p className="m-0 p-3 text-[0.82rem] text-muted">Ładowanie...</p>;
    if (errorMessage) return <p className="m-0 p-3 text-[0.82rem] text-danger">{errorMessage}</p>;

    return <PreBlock>{inputText ?? ""}</PreBlock>;
}
