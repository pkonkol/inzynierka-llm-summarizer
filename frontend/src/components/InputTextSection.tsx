import { getEvaluationSetEntryInputText } from "../api/research";
import { useFetchOnMount } from "../hooks/useFetchOnMount";
import { PreBlock } from "./ui/PreBlock";

type InputTextSectionProps = {
  setId: string;
  entryId: string;
};

export function InputTextSection({ setId, entryId }: InputTextSectionProps) {
  const { data, isLoading, errorMessage } = useFetchOnMount(
    () => getEvaluationSetEntryInputText(setId, entryId),
    `${setId}/${entryId}`,
    "Nie udało się pobrać input text",
  );

  if (isLoading) return <p className="p-3 text-mute">Ładowanie...</p>;
  if (errorMessage) return <p className="p-3 text-danger-hover">{errorMessage}</p>;
  if (!data) return null;

  return (
    <PreBlock withoutBackground className="max-w-measure">
      {data.input_text}
    </PreBlock>
  );
}
