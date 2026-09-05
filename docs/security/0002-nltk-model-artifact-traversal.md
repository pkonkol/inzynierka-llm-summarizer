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

Nazwa zasobu nigdy nie pochodzi z żądania. Cały kontakt z tym API jest w
`backend/app/core/nltk_data.py` i sprowadza się do dwóch stałych zapisanych w module:

```python
_WORDNET_RESOURCES = ("wordnet", "omw-1.4")
```

Pętla przechodzi wyłącznie po tej krotce, wołając `nltk.data.find(f"corpora/{resource}")`
i `nltk.download(resource, download_dir=data_dir, ...)`. Funkcja jest wywoływana raz, przy
starcie aplikacji (`app/main.py`), i nie przyjmuje argumentów.

Drugie i jedyne pozostałe użycie NLTK to `meteor_score` w
`backend/app/services/metrics/cross.py`. Operuje na listach tokenów przekazanych w
pamięci; nie rozwiązuje żadnej ścieżki i nie sięga po artefakty po nazwie.

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

Dopóki zwraca wyłącznie `backend/app/core/nltk_data.py`, analiza z sekcji 3 pozostaje w
mocy.
