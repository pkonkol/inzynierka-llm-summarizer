import { useEffect, useState } from "react";
import {
  errorText,
  getSupportedLanguages,
  getSupportedModels,
  getSupportedModes,
} from "../api/client";

// The three /meta endpoints and the "first entry wins" default, shared by every form that
// starts a summarization: the home page's URL card and the evaluation set's new-run panel.
export function useSummarizationOptions() {
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [modes, setModes] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedMode, setSelectedMode] = useState("simple");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getSupportedModels(), getSupportedModes(), getSupportedLanguages()])
      .then(([modelMap, modeMap, languageList]) => {
        if (!isMounted) return;
        setModels(modelMap);
        setModes(modeMap);
        setLanguages(languageList);

        const firstProvider = Object.keys(modelMap)[0];
        const firstModel = firstProvider ? modelMap[firstProvider]?.[0] : undefined;
        if (firstProvider && firstModel) setSelectedModel(`${firstProvider}:${firstModel}`);

        const firstMode = Object.keys(modeMap)[0];
        if (firstMode) setSelectedMode(firstMode);
        if (languageList[0]) setSelectedLanguage(languageList[0]);
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(`Nie udało się pobrać konfiguracji: ${errorText(error)}`);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    models,
    modes,
    languages,
    selectedModel,
    setSelectedModel,
    selectedMode,
    setSelectedMode,
    selectedLanguage,
    setSelectedLanguage,
    isLoading,
    errorMessage,
  };
}
