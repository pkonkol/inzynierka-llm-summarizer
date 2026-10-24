# Extension (Chrome)

How to install, develop and release the Chrome extension that sends the current tab to the
public page `/`. Recipes run from the repository root.

- The popup holds the summary settings (kind, length, language) and the source: the page
  address, which the server fetches, or the page text, which the extension extracts with
  Mozilla Readability (`vendor/`, unchanged 0.6.0).
- It creates the job through the public, rate-limited endpoint and opens `/?job=<id>&preset=<key>`;
  the public page fills its form from the job and shows the result.
- No bundler and no `package.json`: Chrome loads the directory as it is.

## Develop

1. `just db-up && just dev`, and in `config.js` set `ACTIVE_ENVIRONMENT = ENVIRONMENTS.local`.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → this `extension/` directory.
3. After an edit, press the reload icon on the extension's card. Popup DevTools: right-click
   the popup → **Inspect**.
4. Set `config.js` back to `ENVIRONMENTS.prod` before committing.

`just lint-extension` runs Biome on everything except `vendor/`.

## Release

```bash
just extension-zip      # extension/dist/podsumowania-extension.zip
gh release create extension-v0.1.0 extension/dist/podsumowania-extension.zip
```

Bump `version` in `manifest.json` for every release.

## Public rate limit for a test period

Anonymous callers get `PUBLIC_RATE_LIMIT_REQUESTS` summaries per hour per IP (5, set in
`infra/terraform/main/cloudrun.tf`). To raise it temporarily:

```bash
gcloud run services update llm-summarizer-backend --region europe-central2 \
  --update-env-vars PUBLIC_RATE_LIMIT_REQUESTS=100
```

The next deploy restores the value from Terraform.

## Instalacja (dla promotora)

1. Pobierz `podsumowania-extension.zip` z najnowszego wydania `extension-v…` w zakładce
   **Releases** repozytorium i rozpakuj go w miejscu, którego nie będziesz sprzątać
   (np. `Dokumenty/podsumowania`). Usunięcie folderu usuwa rozszerzenie.
2. Otwórz `chrome://extensions` i włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
3. Kliknij **Załaduj rozpakowane** i wskaż rozpakowany folder.
4. Kliknij ikonę puzzla obok paska adresu i przypnij **Podsumowania**.

Użycie: na stronie z artykułem kliknij ikonę **Podsumowania**, wybierz ustawienia i **Podsumuj**.
„Treść strony” działa także na stronach za logowaniem albo paywallem.

Aktualizacja: podmień zawartość folderu na nowy zip i kliknij ikonę odświeżania przy
rozszerzeniu w `chrome://extensions`.
