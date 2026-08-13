# SSRF w scraperze — analiza i poprawka

**Status:** naprawione (`backend/app/services/scraper.py`)
**Klasa:** OWASP Top 10 A10:2021 — Server-Side Request Forgery, OWASP API Security API7:2023
**Znalezione:** sierpień 2026, podczas wdrażania statycznej analizy kodu

Dokument jest pisany pod zrozumienie mechanizmu, nie pod checklistę. Najważniejsza jest
sekcja 5 — to ona tłumaczy, dlaczego oczywiste poprawki nie działają.

---

## 1. Czym jest SSRF

Atakujący nie sięga do systemu bezpośrednio — **każe to zrobić Twojemu serwerowi**.
Znaczenie ma to, że żądanie wychodzi z wnętrza infrastruktury, więc:

- omija reguły sieciowe blokujące ruch z zewnątrz,
- niesie tożsamość usługi (jej adres IP, przynależność do VPC, czasem nagłówki),
- osiąga adresy, które z internetu nie istnieją: `localhost`, `10.0.0.0/8`, `169.254.169.254`.

Kluczowa intuicja: **granica zaufania nie przebiega tam, gdzie się wydaje.** Kod traktuje
URL jako „dane od użytkownika", ale sieć traktuje wynikające z niego żądanie jako „ruch od
zaufanej usługi".

## 2. Dlaczego scraper jest podręcznikowym przypadkiem

Funkcja „podaj URL, a my go pobierzemy i streścimy" ma SSRF **wpisany w wymaganie
produktowe**. Pobieranie dowolnego adresu podanego przez użytkownika to nie błąd — to cała
funkcjonalność. Dlatego nie da się tego naprawić przez „nie pobieraj URL-i od użytkownika";
trzeba zdefiniować, **które** adresy są dozwolone.

Drugi czynnik: **kanał zwrotny.** W typowym SSRF atakujący jest ślepy — wysyła żądanie
i nie widzi odpowiedzi. Tutaj treść odpowiedzi **wraca do niego jako streszczenie**. To
zamienia SSRF w działający kanał odczytu.

## 3. Ścieżka w tym kodzie (stan przed poprawką)

```
POST /api/v1/jobs/summarize    url: str          ← brak walidacji na granicy API
      ↓                        summarize.py
extract_text_from_url(url)                       ← brak walidacji
      ↓                        scraper.py
trafilatura.fetch_url(url)                       ← żądanie HTTP wychodzi z Cloud Run
      ↓
bare_extraction() → LLM → treść wraca do użytkownika
```

Ani jednego punktu kontroli. Warto odnotować, że `backend/CLAUDE.md` **wymaga** walidacji na
granicy routera — czyli było to naruszenie własnej reguły projektu, nie tylko dobrej praktyki.

## 4. Co realnie było osiągalne

Uczciwa ocena, bo przesadzanie z wagą jest równie mylące jak bagatelizowanie.

| Cel | Osiągalny | Dlaczego |
|---|---|---|
| Token konta usługi z metadata servera GCP | **nie** | Wymaga nagłówka `Metadata-Flavor: Google`; trafilatura go nie wysyła. To celowa obrona GCP dokładnie przed tym scenariuszem |
| `http://localhost:*` w kontenerze | tak | Ale w kontenerze nie ma nic poza uvicornem — głównie rekursja na własne API |
| Usługi w VPC | **nie dziś** | Cloud Run bez konektora VPC nie ma trasy do sieci prywatnej |
| Rozpoznanie sieci | częściowo | Różnice w czasie odpowiedzi i treści błędów zdradzają, co odpowiada |
| Nadużycie usługi jako proxy | tak | Serwis pobiera treści w imieniu atakującego, na nasz koszt i z naszym IP w logach ofiary |

**Wniosek: ryzyko było średnie, ale rosłoby samo.** Wiersz o VPC jest tu najważniejszy —
podatność była **uśpiona**. Dodanie konektora VPC do Cloud Run, bez jednej zmiany w tym
pliku, otwierałoby dostęp do całej sieci prywatnej. To jest ten typ długu, który zaskakuje
pół roku później, gdy nikt już nie pamięta, że scraper pobiera dowolny adres.

## 5. Dlaczego naiwne poprawki nie działają

Każda z poniższych „poprawek" pojawia się w realnych code review i każda jest do obejścia.

| Naiwna poprawka | Obejście |
|---|---|
| Blokuj napisy `"localhost"` i `"127.0.0.1"` | `http://127.1`, `http://2130706433` (zapis dziesiętny), `http://0x7f.0x0.0x0.0x1` (szesnastkowy), `http://[::1]`, `http://0.0.0.0` — wszystkie prowadzą pod pętlę zwrotną |
| Blokuj zakresy prywatne w tekście URL-a | Atakujący podaje własną domenę, której rekord A wskazuje `10.0.0.5`. W URL-u nie ma żadnego adresu IP |
| Sprawdź adres IP **przed** żądaniem | **DNS rebinding:** pierwsze zapytanie DNS zwraca adres publiczny (walidacja przechodzi), drugie — przy faktycznym połączeniu — prywatny. Klasyczne TOCTOU |
| Sprawdź tylko adres wejściowy | **Przekierowania:** `http://zlosliwy.example` odpowiada `302 → http://169.254.169.254`. Walidacja objęła wyłącznie pierwszy hop |
| Blokuj schematy inne niż http/https | Konieczne, ale niewystarczające — cała reszta powyżej dotyczy poprawnych URL-i `http://` |
| Timeout i limit rozmiaru | Ogranicza szkody, nie blokuje ataku |

**Wniosek metodyczny: SSRF nie da się naprawić walidacją napisu.** Trzeba kontrolować
**rzeczywisty adres, z którym nawiązywane jest połączenie, na każdym hopie.**

## 6. Poprawka

Warstwowo, od granicy API w głąb.

**1. Granica API** — `url: HttpUrl` w `JobCreateRequest`. Odrzuca `file://`, `gopher://`,
`ftp://` i URL-e syntaktycznie niepoprawne, zanim cokolwiek poniżej je zobaczy. To jest
realizacja zasady „parse, don't validate": typ niesie gwarancję, kod niżej jej nie sprawdza
ponownie.

**2. Weryfikacja rozwiązanych adresów** — `_assert_fetchable` w `services/scraper.py`, obok
jedynego miejsca, które jej używa. Rozwiązuje nazwę i sprawdza **każdy** zwrócony adres:

```python
ip.is_private or ip.is_loopback or ip.is_link_local
or ip.is_reserved or ip.is_multicast or ip.is_unspecified
```

Obejmuje IPv4 i IPv6. Sprawdzanie *rozwiązanych adresów* zamiast tekstu URL-a jest sednem —
atakujący kontroluje własny DNS, więc `http://ich.example` może wskazywać `10.0.0.5`, nie
zawierając ani jednego podejrzanego znaku.

**3. Przekierowania obsługiwane ręcznie** — `scraper.py` porzucił `trafilatura.fetch_url`
(które nie daje kontroli nad przekierowaniami) na rzecz pętli po `httpx` z
`follow_redirects=False`, gdzie **guard uruchamia się ponownie dla każdego hopa**. Ekstrakcja
(`bare_extraction`) zostaje bez zmian — rozdzielone zostało samo pobieranie.

**4. Ograniczenie szkód** — limit 10 MB odpowiedzi, 5 przekierowań, timeout 15 s
(5 s na połączenie).

### Co zostało świadomie nie domknięte

**DNS rebinding.** Między walidacją a połączeniem następuje drugie rozwiązanie nazwy, więc
atakujący z rekordem o TTL=0 może zwrócić inny adres za drugim razem. Pełne zamknięcie
wymaga przypięcia zwalidowanego adresu IP do połączenia przy zachowaniu nagłówka `Host` —
co przy HTTPS psuje SNI i weryfikację certyfikatu, więc wymaga własnego transportu httpx.

Nie zrobione, bo: przy Cloud Run bez konektora VPC zysk jest bliski zeru (nie ma dokąd
prowadzić rebindingu poza `localhost` pustego kontenera), a koszt to nietrywialny własny
transport. **Do zrobienia razem z konektorem VPC, nie później** — patrz sekcja 4.

**Warstwa sieciowa.** Docelowo egress przez konektor VPC z regułami firewalla. Wtedy nawet
udany SSRF na poziomie aplikacji nie ma dokąd pójść. To właściwe miejsce na tę kontrolę
w dojrzałej architekturze — obrona w aplikacji jest pierwszą warstwą, nie jedyną.

## 7. Wykrywanie i regresja

- **Test regresyjny:** `backend/tests/test_scraper.py` — po jednym przypadku na *klasę*
  obejścia z sekcji 5 (zapis dziesiętny, IPv6 mapowany, link-local, zły schemat, RFC1918),
  nie po jednym na każdą pisownię. Uruchamiany przez `just test-backend`, czyli w CI przy
  każdym pushu.
- **Semgrep** (Tier 1): reguła taint mode, source = pola requestu FastAPI, sink = warstwa
  HTTP. Wychwyci, gdy ktoś w przyszłości doda drugą ścieżkę pobierania z pominięciem guarda.
- **Log:** odrzucenie to `log.warning("scraper url rejected", url=...)`. Powtarzające się
  odrzucenia z jednego konta to sygnał rekonesansu.

## 8. Wnioski

1. **Walidacja typu to nie walidacja semantyki.** `HttpUrl` mówi „to jest poprawny URL", nie
   „pod ten adres wolno się połączyć". Rozróżnienie tych dwóch pytań jest sednem sprawy.
2. **Granice zaufania biegną przez sieć, nie przez kod.** Ta sama funkcja jest bezpieczna
   w skrypcie CLI na laptopie i niebezpieczna w Cloud Run.
3. **Podatność może być uśpiona.** Waga rosła przez zmianę topologii sieci, nie kodu —
   dlatego przegląd bezpieczeństwa musi obejmować architekturę wdrożenia, nie tylko diff.
4. **TOCTOU jest wszędzie.** DNS rebinding to ten sam wzorzec, co wyścig przy dostępie do
   pliku: sprawdziłeś jedną rzecz, użyłeś innej.
5. **Skanery diffowe nie znajdują starego długu.** Ten kod istniał od miesięcy i przeszedłby
   każdy przegląd PR-a, bo żaden PR go nie dotykał. Zielony PR znaczy bezpieczna *zmiana*,
   nie bezpieczna *aplikacja*.
