import { useEffect, useState } from "react";
import {
  errorText,
  getSummaryPresets,
  getSupportedLanguages,
  getSupportedModels,
  getSupportedProcessingStrategies,
} from "../api/client";
import type { SummaryPresetOut } from "../types/api.generated";

// The /meta endpoints and the "first entry wins" default, shared by every form that starts a
// summarization: the home page's submit card and the evaluation set's new-run panel.
export function useSummarizationOptions() {
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [processingStrategies, setProcessingStrategies] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>([]);
  const [presets, setPresets] = useState<Record<string, SummaryPresetOut>>({});
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProcessingStrategy, setSelectedProcessingStrategy] = useState("direct");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getSupportedModels(),
      getSupportedProcessingStrategies(),
      getSupportedLanguages(),
      getSummaryPresets(),
    ])
      .then(([modelMap, strategyMap, languageList, presetMap]) => {
        if (!isMounted) return;
        setModels(modelMap);
        setProcessingStrategies(strategyMap);
        setLanguages(languageList);
        setPresets(presetMap);

        const firstProvider = Object.keys(modelMap)[0];
        const firstModel = firstProvider ? modelMap[firstProvider]?.[0] : undefined;
        if (firstProvider && firstModel) setSelectedModel(`${firstProvider}:${firstModel}`);

        const firstStrategy = Object.keys(strategyMap)[0];
        if (firstStrategy) setSelectedProcessingStrategy(firstStrategy);
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
    processingStrategies,
    languages,
    presets,
    selectedModel,
    setSelectedModel,
    selectedProcessingStrategy,
    setSelectedProcessingStrategy,
    selectedLanguage,
    setSelectedLanguage,
    isLoading,
    errorMessage,
  };
}
