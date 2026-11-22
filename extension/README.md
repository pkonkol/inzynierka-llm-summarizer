# Extension (Chrome)

How to install, develop and release the Chrome extension that summarizes the current tab, a
link, selected text or pasted text in the browser's side panel. Recipes run from the repository root.

- The toolbar icon opens the side panel; right-clicking a link offers **Podsumuj link**, and
  right-clicking selected text offers **Podsumuj zaznaczenie**.
- The panel form holds the summary settings (kind, length, language, fact check) and the source: the page
  address, which the server fetches, the page text, which the extension extracts with
  Mozilla Readability, or text pasted into the panel. A link is always summarized by its address
  and a selection by its text, both with the last form settings.
- Jobs go through the public, rate-limited endpoint. The panel polls them and shows the result;
  the clock icon lists the last 20 results, kept in the extension's local storage.
- `host_permissions` is `<all_urls>`: a side panel gets no `activeTab` grant, and reading the
  page text needs access to whichever tab is active.
- `vendor/` holds unchanged copies of Readability 0.6.0, marked 18.2.0 and DOMPurify 3.4.18.
  Model markdown is rendered with marked and sanitized with DOMPurify.
- No bundler and no `package.json`: Chrome loads the directory as it is. Requires Chrome 116+.

## Develop

1. `just dev`, and in `config.js` set `ACTIVE_ENVIRONMENT = ENVIRONMENTS.local`.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → this `extension/` directory
   (Chrome loads a directory; a zip has to be unpacked first).
3. After an edit, press the reload icon on the extension's card. Panel DevTools: right-click
   inside the panel → **Inspect**; service worker: the **service worker** link on the card.
4. Set `config.js` back to `ENVIRONMENTS.prod` before committing; `just extension-zip` refuses
   anything else.

`just lint-extension` runs Biome on everything except `vendor/`.

## Release

```bash
just extension-zip      # extension/dist/podsumowania-extension.zip
gh release create extension-v0.3.0 extension/dist/podsumowania-extension.zip
```

Bump `version` in `manifest.json` for every release.

## Public rate limit for a test period

Anonymous callers get `PUBLIC_RATE_LIMIT_REQUESTS` summaries per hour per IP (5, set in
`infra/terraform/main/cloudrun.tf`); every link summarized from the menu counts. For a demo,
raise it and keep one instance warm:

```bash
just demo-on rate_limit=100   # billed per hour while on
just demo-status
just demo-off                 # back to 5 and scale-to-zero
```

The next deploy also restores the Terraform values.

## Instalacja (dla promotora)

1. Pobierz `podsumowania-extension.zip` z najnowszego wydania `extension-v…` w zakładce
   **Releases** repozytorium i rozpakuj go w miejscu, którego nie będziesz sprzątać
   (np. `Dokumenty/podsumowania`). Usunięcie folderu usuwa rozszerzenie.
2. Otwórz `chrome://extensions` i włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
3. Kliknij **Załaduj rozpakowane** i wskaż rozpakowany folder. Chrome uprzedzi, że rozszerzenie
   może czytać dane na wszystkich stronach: tego wymaga tryb „Treść strony” w panelu bocznym.
4. Kliknij ikonę puzzla obok paska adresu i przypnij **Podsumowania**.

Użycie:

- Kliknij ikonę **Podsumowania**: po prawej otworzy się panel. Wybierz ustawienia na dole panelu
  i kliknij **Podsumuj tę stronę**; wynik pojawi się w panelu.
- Źródło **Wklejony tekst** pokazuje pole, do którego wklejasz dowolny tekst.
- Prawy przycisk myszy na linku → **Podsumuj link**: panel streści stronę spod linku bez jej otwierania.
- Zaznacz tekst na stronie, prawy przycisk → **Podsumuj zaznaczenie**.
- Ikona 🕘 w panelu pokazuje ostatnie podsumowania. Tytuł podsumowania otwiera wynik w aplikacji.
- Przycisk **Sprawdź fakty** pod streszczeniem dopisuje ocenę artykułu na tle serwisów
  fact-checkingowych i innych źródeł, ze źródłami w grupach: potwierdzają, podważają, kontekst.
- „Treść strony” działa także na stronach za logowaniem albo paywallem.

Aktualizacja: podmień zawartość folderu na nowy zip i kliknij ikonę odświeżania przy
rozszerzeniu w `chrome://extensions`.
