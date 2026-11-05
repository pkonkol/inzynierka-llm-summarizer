# CVE-2026-81726 — path traversal w model-artifact API NLTK

**Status:** ryzyko zaakceptowane do 2026-12-05 (`.trivyignore.yaml`)
**Klasa:** CWE-22 — Improper Limitation of a Pathname to a Restricted Directory
**Znalezione:** 5 września 2026, przez `just scan-deps` (trivy) w CI

---

## 1. Co zgłosił skaner

Trivy wskazał na `backend/requirements.txt` cztery podatności w `nltk` 3.10.2:

| CVE | Waga | Poprawka |
|---|---|---|
| CVE-2026-79675 | CRITICAL | 3.10.3 |
| CVE-2026-71513 | HIGH | 3.10.3 |
| CVE-2026-78680 | HIGH | 3.10.3 |
| CVE-2026-81726 | HIGH | brak wydania |

Trzy pierwsze zniknęły po podbiciu locka do `nltk==3.10.3`. Deklaracja w
`requirements.in` brzmi `nltk~=3.10.0`, więc wersja mieściła się w dozwolonym zakresie i
wystarczył `just deps-compile --upgrade-package nltk` — bez zmiany zakresu.

Czwarta nie ma wersji z poprawką. Ten dokument wyjaśnia, dlaczego mimo to nie blokuje
projektu.

## 2. Na czym polega podatność

NLTK ładuje zasoby (korpusy, modele, artefakty) po nazwie: `nltk.download("wordnet")`,
`nltk.data.find("corpora/wordnet")`. Nazwa jest wewnętrznie zamieniana na ścieżkę w
katalogu z danymi. Podatność polega na tym, że ta zamiana nie normalizuje nazwy przed
złożeniem ścieżki, więc nazwa zawierająca segmenty `..` wyprowadza odczyt poza katalog
danych — do dowolnego pliku, który proces może przeczytać.

Warunkiem wykorzystania jest więc **kontrola nad nazwą zasobu**. Nie nad tekstem
przekazanym do analizy, nie nad wynikiem modelu — nad samym identyfikatorem artefaktu.

## 3. Dlaczego ta aplikacja nie jest podatna

Nazwa zasobu nigdy nie pochodzi z żądania. Pobieranie zasobów jest w
`backend/app/core/nltk_data.py` i sprowadza się do stałej zapisanej w module:

```python
_RESOURCES = {"wordnet": "corpora", "punkt_tab": "tokenizers"}
```

Pętla przechodzi wyłącznie po tym słowniku, wołając `nltk.data.find(f"{category}/{resource}")`
i `nltk.download(resource, download_dir=data_dir, ...)`. Funkcja jest wywoływana przy
starcie aplikacji (`app/main.py`), w obrazie Dockera i w testach; nie przyjmuje argumentów.

Pozostałe użycia NLTK:

- `meteor_score` w `backend/app/services/metrics/cross.py` operuje na listach tokenów
  przekazanych w pamięci; nie rozwiązuje żadnej ścieżki.
- `PunktTokenizer` w `backend/app/services/metrics/fact_level_judges.py` wewnętrznie woła
  `nltk.data.find(f"tokenizers/punkt_tab/{lang}/")`. `lang` pochodzi wyłącznie ze słownika
  `_PUNKT_LANGUAGES = {"en": "english", "pl": "polish"}`; `split_sentences` odrzuca każdy
  inny kod języka przed utworzeniem tokenizera, więc do `find` trafia jedna z dwóch stałych nazw.

Nie istnieje więc ścieżka wykonania, w której dane od użytkownika docierają do podatnego
kodu. Zagrożenie stałoby się realne, gdyby pojawił się kod pobierający korpus lub model
wskazany parametrem żądania — na przykład wybór modelu ewaluacyjnego przekazywany z
frontendu do `nltk.download`.

## 4. Co zostało zrobione

- `nltk` podbite do 3.10.3 w `backend/requirements.txt` (trzy podatności usunięte).
- CVE-2026-81726 wpisane do `.trivyignore.yaml` z uzasadnieniem i `expired_at: 2026-12-05`.
  Po tej dacie trivy zgłosi je ponownie i wpis trzeba będzie rozstrzygnąć od nowa.
- `just scan-deps` czyta ten plik przez `--ignorefile`, więc lokalne uruchomienie i CI widzą
  identyczny zestaw wyjątków.

## 5. Warunki unieważnienia tej analizy

Wpis w `.trivyignore.yaml` przestaje być uzasadniony, gdy zajdzie którykolwiek z warunków:

- NLTK wyda wersję z poprawką — wtedy obowiązuje podbicie locka, nie przedłużenie wyjątku;
- nazwa zasobu NLTK zacznie pochodzić z żądania, konfiguracji zewnętrznej albo z pliku
  wgrywanego przez użytkownika;
- pojawi się drugie miejsce w kodzie wołające `nltk.download` lub `nltk.data.find`.

Ostatni warunek jest najłatwiejszy do przeoczenia, więc weryfikacja sprowadza się do
jednego polecenia:

```
grep -rn "nltk.download\|nltk.data.find" backend/app/
```

Dopóki zwraca wyłącznie `backend/app/core/nltk_data.py`, a `PunktTokenizer` tworzy się
tylko w `fact_level_judges.py` z nazwą ze słownika `_PUNKT_LANGUAGES`, analiza z sekcji 3
pozostaje w mocy.
