---
version: 1.0
name: podsumowania-design
description: |
  System wizualny aplikacji „Podsumowania” (praca inżynierska, Politechnika Gdańska):
  podsumowywanie artykułów przez LLM, strona publiczna + konsola badawcza /admin.
  Jeden krój mono (JetBrains Mono), kremowe płótno, prawie-czarny tusz, linie 1px zamiast kart,
  4px promienia tylko na kontrolkach, znaczniki ASCII [x] [✓] [+] zamiast ikon.
  Baza: DESIGN.md OpenCode; zasady struktury i treści częściowo z OpenWork.

colors:
  ink: "#201d1d"              # tekst, primary, linki — 16.3:1 na canvas
  ink-deep: "#0f0000"         # wciśnięty primary
  body: "#424245"             # dłuższy tekst drugiego planu — 9.8:1
  mute: "#646262"             # etykiety, metadane, nieaktywne zakładki — 5.9:1
  stone: "#6e6e73"            # separatory okruszków — 5.0:1
  ash: "#9a9898"              # tylko tekst wyłączony / podkreślenie aktywnej zakładki — 2.8:1
  canvas: "#fdfcfc"           # jedyne tło strony
  surface-soft: "#f8f7f7"     # tło pól i kompozytora
  surface-card: "#f1eeee"     # snippet, przycisk wyłączony, szkielet ładowania
  surface-dark: "#201d1d"     # chip „publiczne”, toast
  hairline: "rgba(15,0,0,0.12)"   # linie sekcji i list (NIE granice pól)
  hairline-strong: "#646262"  # granice pól, ramka kompozytora, linia paska zakładek — 5.9:1
  on-dark: "#fdfcfc"
  info: "#0056b3"             # informacja na jasnym — 6.9:1
  warning: "#995f06"          # „w toku” — 5.1:1
  danger: "#d70015"           # błąd — 5.3:1
  success-on-dark: "#30d158"  # zielony tylko na ciemnym (8.3:1); na jasnym „gotowe” jest w tuszu

typography:
  family: "JetBrains Mono"    # fallback: IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
  display:  { size: 36px, weight: 700, lineHeight: 1.3 }   # tylko tytuł strony publicznej
  title:    { size: 24px, weight: 700, lineHeight: 1.35 }  # tytuł strony w konsoli
  subtitle: { size: 20px, weight: 700, lineHeight: 1.4 }   # tytuł wygenerowanego podsumowania
  heading:  { size: 16px, weight: 700, lineHeight: 1.5 }   # nagłówki sekcji
  reading:  { size: 16px, weight: 400, lineHeight: 1.65 }  # pole źródła, treść podsumowania
  body:     { size: 15px, weight: 400, lineHeight: 1.6 }   # cały UI; token `text-ui` (`text-body` to kolor)
  strong:   { size: 15px, weight: 500, lineHeight: 1.6 }   # etykiety pól, przyciski
  caption:  { size: 13px, weight: 400, lineHeight: 1.7 }   # metadane, czasy, stopka, ścieżki nawigacji

rounded:
  none: 0px                   # wszystkie kontenery
  sm: 4px                     # wszystkie kontrolki
  full: 9999px                # nieużywane; zarezerwowane

spacing:                      # siatka 4px
  scale: [4, 8, 12, 16, 24, 32, 48, 64, 96]
  section: 96px               # między sekcjami strony; 64 tablet, 48 mobile
  gutter: [16px, 24px, 32px]  # mobile / sm / lg

sizes:
  nav: 56px
  button: 36px
  input: 40px
  touch-row: 44px             # zakładki, wiersze list, checkboxy
  container-frame: 1280px     # rama strony
  container-column: 960px     # strony jednokolumnowe (import, katalog)
  measure: 68ch               # maks. długość wiersza tekstu do czytania

components:
  button-primary:   { bg: ink, text: canvas, rounded: sm, height: button, padding: 0 20px, weight: 500 }
  button-secondary: { bg: canvas, text: ink, border: hairline-strong, rounded: sm, height: button }
  button-disabled:  { bg: surface-card, text: ash, rounded: sm }
  field:            { bg: surface-soft, text: ink, border: hairline-strong, rounded: sm, height: input, focus: "bg canvas + border ink" }
  composer:         { bg: surface-soft, border: hairline-strong, rounded: sm, focus-within: "bg canvas + border ink" }
  tab:              { text: mute, active: "text ink + 2px ash underline + [x]", min-height: touch-row }
  panel:            { border: hairline, rounded: none, bg: canvas }
  list-row:         { border-bottom: hairline, padding: 8px 0 }
  status:           { form: "[glif] słowo", colors: { completed: ink, failed: danger, pending: mute, running: warning } }
  alert:            { border: danger, text: danger, bg: canvas, prefix: "[✗]", rounded: none }
  snippet:          { bg: surface-card, rounded: sm, padding: 12px 16px }
  tooltip:          { bg: canvas, border: hairline-strong, text: body, size: caption, rounded: none }
  toast:            { bg: ink, text: canvas, rounded: sm, size: caption }
  path-nav:         { size: caption, links: underlined ink, active: "bold + aria-current" }
---

# Podsumowania — system wizualny

## 1. Charakter

Narzędzie, nie strona marketingowa. Ma wyglądać jak dobrze zrobiony program: spokojnie, technicznie, czytelnie. Charakter daje jedna decyzja typograficzna (wszystko w JetBrains Mono), a nie dekoracje. Dwie warstwy aplikacji (strona publiczna i konsola `/admin`) używają tego samego systemu; różnią się gęstością, a nie stylem.

Kolejność narzędzi do budowania hierarchii (za OpenWork): **układ → odstęp → typografia → kolor tekstu → tło → linia**. Cienia nie ma w systemie wcale.

## 2. Zasady

1. **Jeden element dominujący na ekran.** Na `/` jest nim pole źródła. Wszystko inne jest cichsze.
2. **Stan, nie opis.** Interfejs pokazuje, co jest prawdą (`[✓] gotowe · 3,4 s`), zamiast opisywać sam siebie.
3. **Stopniowe odsłanianie.** Na ekranie jest tylko to, co potrzebne do decyzji. Reszta czeka pod `[+]` (przykład wyniku, zaawansowane parametry, prompt, surowe metadane).
4. **Płasko, bez ramki w ramce.** Grupowanie robi odstęp i jedna linia 1px. Pole w kompozytorze nie ma własnej ramki, bo ma ją kompozytor.
5. **Przycisk przy tym, co zatwierdza.** Akcja stoi w tym samym bloku co pola, z których bierze dane.
6. **Wiersz: etykieta z lewej, stan z prawej.** Nagłówki paneli, wiersze list, metadane.
7. **Kolor tylko dla mniejszości, która wymaga uwagi.** Stan normalny jest w tuszu; kolor dostają błąd i „w toku”.
8. **Każdy stan jest zaprojektowany:** pusty, ładowanie (szkielet w kształcie wyniku), wynik, błąd, wyłączony.

## 3. Typografia

- Jeden krój: **JetBrains Mono** 400 / 500 / 700. Fallback: IBM Plex Mono → systemowy mono. Brak kursywy i kroju proporcjonalnego.
- **UI ma 15px, tekst do czytania 16px.** Mono jest szerszy od proporcjonalnego, więc 15px w UI daje gęstość zwykłego 16px sansa. Pole źródła i treść podsumowania zostają na 16px / 1.65, bo tam się czyta dłużej.
- Hierarchia rozmiarem i wagą na jednym kroju: display 36 → title 24 → subtitle 20 → heading 16/700 → body 15 → caption 13.
- `display` występuje raz w całej aplikacji: tytuł strony publicznej.
- Sentence case. Wersaliki tylko w skrótach (PL, EN, JSON).
- Liczby w tabelach z `tabular-nums`, wyrównane do prawej.
- Długość wiersza tekstu do czytania ≤ 68ch.

## 4. Kolor

- Jedno tło: `canvas`. Brak pasów w innym kolorze.
- Tusz `ink` robi wszystko: tekst, primary, linki (podkreślone, nie niebieskie).
- Szarości mają stałe role: `body` dłuższy tekst drugiego planu, `mute` etykiety i metadane, `stone` separatory, `ash` wyłącznie stan wyłączony.
- **Granice kontrolek to `hairline-strong`**, nie `hairline`. Jasna linia ma 1.3:1, a WCAG 1.4.11 wymaga 3:1.
- Kolory stanów to ciemne stopnie rampy Apple HIG, dobrane tak, żeby tekst miał ≥ 4.5:1 na kremie. Jasny zielony istnieje tylko na ciemnym tle.
- Stan nigdy nie jest przekazywany samym kolorem: zawsze glif w nawiasach + słowo.

| Stan | Zapis | Kolor |
|---|---|---|
| gotowe | `[✓] gotowe` | ink |
| błędne | `[✗] błędne` | danger |
| w kolejce | `[⋯] w kolejce` | mute |
| w toku | `[▶] w toku` | warning |

## 5. Układ

- **Rama 1280px**, marginesy boczne 16 / 24 / 32px (mobile / sm / lg). Strony jednokolumnowe (import, katalog) mają 960px.
- Strona publiczna: tytuł wyrównany do lewej, pod nim **dwie równe kolumny**: kompozytor i wynik. Wysokość pasa to `100vh − 15rem` (min. 36rem). Na telefonie kolumny idą jedna pod drugą.
- Konsola: dwie kolumny (lista | szczegóły). Panel szczegółów otwiera się po wybraniu pozycji i wtedy formularz znika.
- Rytm: 96px między sekcjami strony, 32px między blokami w kolumnie, 16px wewnątrz bloku.
- Breakpointy Tailwinda (sm 640, lg 1024). Poniżej 640px: jedna kolumna, presety 2×2, pasek ścieżek przewija się w poziomie.

## 6. Komponenty

Nazwy odpowiadają plikom w `src/components`.

### Prymitywy (`ui/`)

- **Button**: `primary` (tusz, jeden na widok) i `secondary` (obrys `hairline-strong`). Wyłączony: tło `surface-card`, tekst `ash`. Wciśnięty primary: `ink-deep`. Hoverów nie ma.
- **LinkButton**: wygląd `secondary`, zawsze prawdziwy `<a>`.
- **Field** (Input, Select, Textarea, RangeInput): tło `surface-soft`, granica `hairline-strong`, 40px. Fokus: tło `canvas` + granica `ink`. Błąd: granica `danger` + komunikat `[✗] …` pod polem przez `aria-describedby`. Range i checkbox mają `accent-color: ink`.
- **Panel**: ramka `hairline`, ostre rogi, bez tła i cienia.
- **Alert**: ramka i tekst `danger`, prefiks `[✗]`, w przepływie strony. Nie znika sam.
- **Toast**: tusz na kremie w rogu ekranu, 3 s. Tylko zdarzenia przejściowe („Skopiowano…”).
- **Modal / ConfirmDialog**: ramka `hairline-strong`, ostre rogi, tło strony przyciemnione do 40% tuszu. Pytanie w tytule, skutek w treści, akcje: Anuluj (secondary) + czasownik (primary).
- **Tooltip**: pojawia się przy najechaniu i fokusie, Esc go chowa (WCAG 1.4.13). Zastępuje `title=`.
- **DisclosureButton / DisclosureSections**: wiersz z `[+]` / `[-]`, `aria-expanded`, linia `hairline` pod spodem.
- **Table**: bez ramek; nagłówek w `caption` / `mute` z linią `hairline-strong`, wiersze rozdzielone `hairline`. W wąskim widoku tabela przewija się w swoim polu.

### Domenowe

- **Kompozytor** (strona publiczna: SourceField + PresetTabs + długość + język + przycisk): jedna ramka 4px, pole bez własnej ramki, pod linią kontrolki. Ostatni wiersz: suwak „Długość: średnio”, język (mały select, `caption`), `ctrl+enter`, **Podsumuj**.
- **PresetTabs**: natywne radio w `fieldset`, wizualnie zakładki `[ ] Fakty i wnioski` / `[x] Kluczowe punkty` w siatce 2×2 nad linią `hairline-strong`. Pod zakładkami opis wybranego rodzaju; przykład pod `[+] przykład`.
- **PublicSummaryResult**: nagłówek 48px `Podsumowanie` … stan. Pusty: „Tu pojawi się podsumowanie.”. Ładowanie: „Przygotowuję podsumowanie...” + szkielet. Wynik: tytuł w `subtitle`, markdown w `reading`, listy z `- `, na dole czas + Kopiuj + Pobierz .txt.
- **NavDock**: pasek ścieżek, tylko w `/admin/*`. Szczegóły w punkcie 7.
- **StatusLabel**: tabela w punkcie 4.
- **SummaryDetailPanel**: Panel; wiersze InfoRow jako lista definicji (etykieta `mute` | wartość `ink`, `caption`); treść w `reading`; sekcje Metryki / Prompt / Surowe metadane jako Disclosure.
- **JobActivityPanel / CompletedJobsList / JobsPage**: listy wierszy z linią `hairline`; adres podkreślony, pod nim status, model i czas w `caption`.
- **MetricsSection**: siatka par wartość (`strong` 15/500, `tabular-nums`) nad podpisem w `caption`, rozdzielonych odstępem. Wartość nigdy nie jest większa od nagłówka sekcji. Bez dekoracyjnych wykresów.
- **Chip „publiczne”**: `surface-dark`, tekst `on-dark`, `caption`, 4px.

## 7. Nawigacja konsoli: ścieżki

```
/   /admin   /admin/jobs   /admin/research/import   /admin/research   [/admin/research/{id}]        /design   [✓] Zalogowano
```

- Tekst linku to dokładnie adres trasy (routing przez History API).
- Aktywna trasa: pogrubiona, bez podkreślenia, `aria-current="page"`.
- Podstrona otwarta z listy (zbiór, przebieg) dopisuje swoją ścieżkę za nadrzędną zakładką.
- Nazwa modułu i opis z NavDock (np. „Podsumowania · Nowe. Formularz nowego podsumowania…”) są w Tooltipie.
- `/design` (katalog systemu, tylko serwer deweloperski) jest wyszarzony i przesunięty w prawo: narzędzie autora.
- Mobile: jeden wiersz z przewijaniem w poziomie.
- Strona publiczna nie ma tego paska: tylko nazwa `podsumowania` i „Zaloguj”.

## 8. Treść

- Etykiety zaczynają się od czasownika: „Podsumuj”, „Utwórz przebieg”, „Importuj zbiór”. Unikamy „OK” i „Wyślij”.
- Tytuł albo opis, nie oba naraz, jeśli mówią to samo.
- Błąd mówi, co zrobić dalej, bez obwiniania: „Podaj adres artykułu albo wklej jego treść”.
- Bez strzałek w przyciskach, bez emoji, bez ikon „AI” (iskierki, różdżki, roboty).
- Znaczniki ASCII są jedynymi ikonami: `[x]` `[ ]` `[✓]` `[✗]` `[⋯]` `[▶]` `[+]` `[-]` `[?]`.

## 9. Dostępność

- Kontrast tekstu ≥ 4.5:1, granic kontrolek ≥ 3:1 (wartości w front matter).
- Fokus zawsze widoczny: obrys 2px `ink` z odstępem 2px; w polach tło `canvas` + granica `ink`.
- Cele dotyku ≥ 44px na zakładkach, wierszach i checkboxach.
- Region wyniku i listy zadań mają `aria-live="polite"`, montowany od pierwszego renderu.
- `prefers-reduced-motion`: brak animacji poza zmianą stanu.

## 10. Czego nie robimy

- Cienie, gradienty, przezroczyste tła, glassmorphism.
- Karty w kartach i pogrubione ramki zaznaczenia.
- Pasy tła w innym kolorze i ciemne bloki dla ozdoby.
- Pikselowe / ASCII-artowe logotypy.
- Niebieskie linki, kolorowe CTA, kolor jako jedyny nośnik stanu.
- Wartości spoza tokenów (`[13px]`, `#abc`, `rounded-[3px]`) w komponentach.
- Nowe warianty przycisków na poziomie strony.

## 11. Implementacja

- Tokeny w `src/index.css` w `@theme` (Tailwind v4). Domyślne kolory, promienie i cienie Tailwinda są wyłączone (`--color-*: initial` itd.), więc poza paletą nie da się wyjść przypadkiem.
- Komponenty składają klasy z tokenów; strony składają komponenty i nie definiują własnego wyglądu.
- Rozmiar UI 15px to `text-ui`. Nazwa `text-body` należy do koloru `body`; Tailwind rozwiązuje ją jako kolor.
- Domyślne rozmiary tekstu Tailwinda też są wyłączone (`--text-*: initial`); `text-sm` czy `text-xs` nie istnieją.
- Kolory stanów na jasnym tle: błąd `danger-hover`, „w toku” `warning-active`, informacja `accent-hover`. Gołe `danger`, `warning`, `success`, `accent` mają < 4.5:1 na `canvas` i występują tylko na `surface-dark` (toast).
- Utility w `index.css`: `btn` / `btn-primary` / `btn-secondary`, `field` / `field-area` / `field-compact` / `field-label`, `badge`, `markdown` (wynik LLM). Używają ich tylko prymitywy z `components/ui` i komponenty domenowe.
- Wzorcowa implementacja: `docs/design/reference/index.html` + `index.css`; żywy katalog prymitywów: `/design` (`src/pages/DesignPage.tsx`).
- Zmiana kroju to jedna linia: `--font-mono`. Gdyby tekst do czytania miał kiedyś przejść na sans, służy do tego osobny token `--font-reading`.
