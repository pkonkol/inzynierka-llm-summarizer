import { getEvaluationSetEntryInputText } from "../api/research";
import { useFetchOnMount } from "../utils/useFetchOnMount";
import { PreBlock } from "./PreBlock";

type Props = {
  setId: string;
  entryId: string;
};

export function InputTextSection({ setId, entryId }: Props) {
  const { data, isLoading, errorMessage } = useFetchOnMount(
    () => getEvaluationSetEntryInputText(setId, entryId),
    `${setId}/${entryId}`,
    "Nie udało się pobrać input text",
  );

  if (isLoading) return <p className="p-3 text-muted">Ładowanie...</p>;
  if (errorMessage) return <p className="p-3 text-danger">{errorMessage}</p>;
  if (!data) return null;

  return (
    <PreBlock withoutBackground className="mx-auto max-w-measure">
      {data.input_text}
    </PreBlock>
  );
}
