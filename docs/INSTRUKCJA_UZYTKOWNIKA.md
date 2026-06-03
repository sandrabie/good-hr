# GoodHR Workbench - instrukcja użytkownika

GoodHR Workbench to aplikacja do roboczej analizy ankiet pracowniczych. Pomaga zaimportować dane z CSV lub Excela, uporządkować pytania i odpowiedzi, sprawdzić wyniki, porównać segmenty oraz przygotować edytowalny raport slajdowy.

Aplikacja jest przeznaczona dla konsultantów HR, analityków, osób przygotowujących raporty z badań pracowniczych oraz zespołów, które chcą szybko przejść od surowych danych ankietowych do wniosków i prezentacji.

## 1. Uruchomienie aplikacji

### Wersja publiczna

Aplikacja jest dostępna pod adresem:

```text
https://goodhr-workbench.vercel.app
```

Wersja publiczna działa w przeglądarce. Dane projektów zapisane są lokalnie w przeglądarce użytkownika, dlatego inna osoba otwierająca link nie zobaczy automatycznie Twoich lokalnych importów.

### Wersja lokalna

W katalogu aplikacji uruchom:

```powershell
python -m http.server 4173
```

Następnie otwórz:

```text
http://127.0.0.1:4173
```

## 2. Podstawowa nawigacja

Aplikacja ma kilka głównych zakładek:

- Dashboard - szybki podgląd aktywnej ankiety.
- Ankiety - lista projektów, historia ankiet i wersje raportów.
- Import - wczytywanie CSV/XLSX oraz mapowanie kolumn.
- Wyniki - analiza odpowiedzi, tematów, pytań i segmentów.
- Taksonomia - edycja kategorii tematycznych.
- Kontrola danych - sprawdzenie PII, małych grup i ograniczeń publikacji.
- Raport - edytor slajdów i eksport raportu.

## 3. Import danych ankietowych

1. Wejdź w zakładkę Import.
2. Wybierz plik CSV lub XLSX z wynikami ankiety.
3. Sprawdź podgląd danych przed importem.
4. Ustaw mapowanie kolumn:
   - pytanie,
   - odpowiedź,
   - respondent,
   - segment,
   - typ pytania,
   - wartość odpowiedzi,
   - eNPS,
   - komentarz,
   - kolumna ignorowana.
5. Zwróć uwagę na ostrzeżenia importu. Aplikacja sygnalizuje m.in. sytuacje, gdy pytania mogą trafić do odpowiedzi albo gdy kolumny typu `free_text` lub `suggestion` wyglądają jak metadane, a nie odpowiedzi respondentów.
6. Kliknij przycisk importu danych ankiety.

Każdy import tworzy osobną ankietę. Dashboard i wyniki nie łączą odpowiedzi z różnych plików.

## 4. Szablony importu

Jeśli często importujesz dane z tego samego narzędzia, np. Webankieta, Excel lub powtarzalny CSV:

1. Ustaw poprawne mapowanie kolumn.
2. Zapisz szablon importu.
3. Przy kolejnym imporcie wybierz zapisany szablon.

Dzięki temu nie trzeba za każdym razem ręcznie przypisywać kolumn.

## 5. Praca z ankietami

W zakładce Ankiety można:

- przeglądać zapisane ankiety,
- wybierać aktywną ankietę,
- sprawdzać historię projektów,
- porównywać kilka ankiet w ramach jednego projektu,
- widzieć wersje raportów.

Aktywna ankieta jest widoczna w panelu po lewej stronie. Wszystkie metryki i raporty liczą się dla aktualnie wybranej ankiety.

## 6. Dashboard

Dashboard pokazuje szybki stan ankiety:

- liczbę odpowiedzi,
- średnie wyników skalowych,
- eNPS, jeżeli ankieta zawiera odpowiednie pytanie,
- gotowość danych do raportu,
- główne tematy i sygnały.

Z dashboardu można przejść bezpośrednio do wyników.

## 7. Wyniki i komentarze

Zakładka Wyniki służy do pracy analitycznej.

Typowy przebieg:

1. Wybierz kategorię tematyczną.
2. Wybierz obszar pytania.
3. Sprawdź podsumowanie odpowiedzi.
4. Przejrzyj surowe odpowiedzi respondentów.
5. W razie potrzeby wygeneruj pełniejsze podsumowanie przez lokalny model Ollama.

Aplikacja rozdziela:

- podsumowanie AI,
- surowe odpowiedzi respondentów,
- dane liczbowe,
- komentarze otwarte.

Przy pytaniach zamkniętych aplikacja pokazuje rozkład odpowiedzi, np. ile osób odpowiedziało `Tak`, `Nie`, `Raczej tak`, `Ważne`, `Mało ważne` itd. Wyniki nie są ograniczone tylko do odpowiedzi tak/nie.

## 8. Porównania segmentów

Widok Segmenty znajduje się w zakładce Wyniki.

Pozwala porównywać odpowiedzi według kolumn segmentujących, np.:

- region pracy,
- stanowisko,
- dział,
- lokalizacja,
- zespół,
- staż,
- tryb pracy.

Aplikacja pokazuje tylko pytania zamknięte lub liczbowe, ponieważ na nich segmenty można liczyć wiarygodnie. Małe grupy są automatycznie ukrywane zgodnie z progiem bezpieczeństwa.

Widok wskazuje też, gdzie problem jest najmocniejszy, czyli który segment ma najsłabszy lub najbardziej ryzykowny wynik.

## 9. Taksonomia tematów

Zakładka Taksonomia służy do porządkowania tematów.

Aplikacja tworzy robocze kategorie AI, ale konsultant może:

- zmieniać nazwy kategorii,
- scalać zbliżone tematy,
- poprawiać przypisania,
- rozdzielać tagi AI od finalnych kategorii konsultanta.

To ważne, bo AI ma wspierać analizę, ale nie powinno samodzielnie decydować o ostatecznej strukturze raportu.

## 10. Kontrola danych

Zakładka Kontrola danych pomaga sprawdzić, czy raport można pokazać dalej.

Sprawdzane są m.in.:

- potencjalne dane osobowe,
- małe grupy,
- progi publikacji,
- ograniczenia wynikające z użycia AI.

Zalecenie: nie publikuj wyników segmentów, jeżeli grupa jest zbyt mała. Nie używaj aplikacji do oceny pojedynczych osób.

## 11. Edytor raportu

Zakładka Raport działa jak prosty edytor slajdów.

Po prawej stronie znajduje się panel edycji. Zawiera:

- wybór ankiety,
- eksport Markdown i HTML,
- generowanie raportu od nowa,
- dodawanie slajdów,
- uruchomienie prezentacji,
- status aktywnego slajdu,
- ukrywanie slajdów w eksporcie,
- zmianę układu i motywu,
- wstawianie elementów.

Aktywny slajd wybiera się automatycznie podczas przewijania i edycji. Nie trzeba ręcznie wybierać slajdu z listy.

## 12. Wstawianie elementów w raporcie

W panelu po prawej dostępna jest sekcja Wstaw.

Można dodać:

- punkt tekstowy,
- metrykę,
- tabelę,
- cytat,
- punkt kontrolny.

Opcja Tabela tworzy edytowalną tabelę z kolumnami:

- Obszar,
- Wartość,
- Opis,
- Status.

Komórki tabeli można edytować bezpośrednio na slajdzie.

## 13. Eksport raportu

Dostępne eksporty:

- Markdown - tekstowy szkic raportu.
- HTML - wizualny raport/slajdy do otwarcia w przeglądarce.

Ukryte slajdy nie trafiają do prezentacji ani eksportu HTML.

## 14. Lokalny model Ollama

Aplikacja może korzystać z lokalnego modelu językowego przez Ollama.

Przykładowa konfiguracja:

```powershell
winget install --id Ollama.Ollama
ollama pull gemma3
```

Następnie uruchom Ollama i w aplikacji kliknij generowanie pełniejszego podsumowania.

Uwaga: jeżeli aplikacja jest otwarta z Vercel, przeglądarka może blokować połączenie z lokalną Ollama. Najpewniejszy sposób to otworzyć aplikację lokalnie pod `http://127.0.0.1:4173`.

## 15. Dobre praktyki

- Zawsze sprawdź mapowanie kolumn przed importem.
- Nie pokazuj wyników bardzo małych grup.
- Sprawdź cytaty i komentarze pod kątem danych osobowych.
- Traktuj kategorie AI jako szkic, nie jako ostateczną prawdę.
- Przed wysłaniem raportu klientowi przejrzyj każdy slajd.
- Nie używaj wyników do decyzji kadrowych wobec pojedynczych osób.

## 16. Najczęstsze problemy

### Aplikacja pokazuje pytania zamiast odpowiedzi

Sprawdź mapowanie kolumn w imporcie. Kolumna z treścią pytania powinna być oznaczona jako pytanie, a kolumna z wypowiedzią respondenta jako odpowiedź.

### Segmenty są dziwne albo nieużyteczne

Sprawdź, czy kolumna segmentu jest faktycznie cechą respondenta, np. region, dział, rola, lokalizacja. Nie oznaczaj jako segmentu kolumn z pytaniami ankietowymi.

### Brakuje wyników w segmencie

Aplikacja ukrywa małe grupy. To celowe zabezpieczenie przed identyfikacją respondentów.

### Ollama nie odpowiada

Sprawdź, czy Ollama jest uruchomiona i czy model został pobrany:

```powershell
ollama pull gemma3
```

### Dane zniknęły po otwarciu aplikacji na innym komputerze

Dane są zapisane lokalnie w przeglądarce. Inne urządzenie nie ma automatycznie dostępu do Twoich lokalnych projektów.

## 17. Ograniczenia

GoodHR Workbench jest prototypem roboczym. Nie ma jeszcze pełnej bazy danych, kont użytkowników, uprawnień, audytu zmian ani zaawansowanego eksportu do PPTX. Narzędzie najlepiej traktować jako wspomaganie analizy i przygotowania raportu, a nie jako samodzielny system decyzyjny.
