# GoodHR Workbench - przedstawienie funkcjonalności

## Krótki opis

GoodHR Workbench to narzędzie do analizy ankiet pracowniczych i przygotowywania raportów HR. Aplikacja pomaga przejść od surowych danych z ankiety do uporządkowanych wyników, tematów, segmentów i edytowalnej prezentacji.

Największa wartość aplikacji polega na tym, że łączy trzy etapy pracy konsultanta:

1. Import i porządkowanie danych.
2. Analizę wyników, komentarzy i segmentów.
3. Przygotowanie raportu slajdowego.

## Dla kogo jest aplikacja

Aplikacja jest przeznaczona dla:

- konsultantów HR,
- analityków ankiet pracowniczych,
- zespołów People/HR,
- osób przygotowujących raporty z badań opinii,
- firm, które chcą analizować ankiety lokalnie lub w kontrolowanym środowisku.

## Problem, który rozwiązuje

Typowy raport z ankiety pracowniczej wymaga wielu ręcznych kroków:

- wczytania danych z Excela lub CSV,
- rozpoznania, które kolumny są pytaniami, odpowiedziami i segmentami,
- policzenia wyników,
- uporządkowania komentarzy,
- sprawdzenia małych grup i danych wrażliwych,
- przygotowania raportu,
- napisania wniosków i rekomendacji.

GoodHR Workbench skraca ten proces i daje jedno miejsce pracy nad całym raportem.

## Najważniejsze funkcje

### 1. Import CSV/XLSX

Aplikacja pozwala wczytywać dane z plików CSV i Excel. Użytkownik widzi podgląd danych przed importem i może przypisać kolumny do odpowiednich typów.

Obsługiwane są m.in.:

- pytania,
- odpowiedzi,
- wartości liczbowe,
- komentarze,
- segmenty,
- eNPS,
- typy pytań,
- identyfikatory respondentów i pytań.

### 2. Mapowanie i szablony importu

Użytkownik może zapisać szablon mapowania kolumn. To przyspiesza pracę z powtarzalnymi źródłami danych, np. Webankieta, Excel lub cykliczne badania klienta.

Aplikacja ostrzega, gdy wykryje, że pytania mogą zostać potraktowane jako odpowiedzi.

### 3. Oddzielne ankiety i projekty

Każdy import tworzy osobną ankietę. Dane nie są mieszane w dashboardzie.

Można pracować na kilku ankietach w jednym projekcie, np.:

- fala Q1,
- fala Q2,
- ankieta onboardingowa,
- ankieta pulse,
- ankieta dla konkretnej grupy.

### 4. Dashboard ankiety

Dashboard pokazuje szybki stan aktywnej ankiety:

- liczbę odpowiedzi,
- średnie wyników,
- eNPS,
- gotowość danych,
- główne tematy.

### 5. Wyniki i komentarze

Widok Wyniki łączy dane liczbowe i jakościowe.

Użytkownik wybiera:

1. kategorię,
2. obszar pytania,
3. konkretne odpowiedzi i podsumowanie.

Aplikacja pokazuje osobno:

- podsumowanie AI,
- odpowiedzi respondentów,
- rozkłady odpowiedzi zamkniętych,
- komentarze otwarte.

### 6. Klasyfikacja tematów

Aplikacja tworzy robocze kategorie tematyczne na podstawie pytań i odpowiedzi.

Przykłady kategorii:

- komunikacja i decyzje,
- współpraca,
- narzędzia i procesy,
- rozwój,
- priorytety i przeciążenie,
- inicjatywy Green IT,
- sprzęt i infrastruktura.

Konsultant może poprawiać taksonomię i rozdzielać tagi AI od finalnych kategorii.

### 7. Porównania segmentów

Aplikacja pozwala porównywać wyniki według segmentów, np.:

- region pracy,
- rola,
- dział,
- lokalizacja,
- zespół,
- staż,
- tryb pracy.

Widok segmentów pokazuje różnice między grupami i wskazuje, gdzie problem jest najmocniejszy.

Małe grupy są automatycznie ukrywane, aby ograniczyć ryzyko identyfikacji respondentów.

### 8. Kontrola danych

Zakładka Kontrola danych wspiera bezpieczne przygotowanie raportu.

Sprawdzane są:

- potencjalne dane osobowe,
- małe grupy,
- progi publikacji,
- ograniczenia związane z AI.

Aplikacja przypomina, że raport nie powinien służyć do oceny pojedynczych pracowników.

### 9. Edytor raportu

Raport jest tworzony jako zestaw edytowalnych slajdów.

Użytkownik może:

- wygenerować raport automatycznie,
- dodawać nowe slajdy,
- zmieniać kolejność slajdów,
- ukrywać slajdy w eksporcie,
- nadawać statusy: roboczy, do sprawdzenia, gotowy,
- edytować tekst bezpośrednio na slajdzie,
- zmieniać motyw i układ,
- uruchomić tryb prezentacji.

### 10. Wstawianie elementów

W panelu po prawej można wstawić:

- punkt tekstowy,
- metrykę,
- tabelę,
- cytat,
- punkt kontrolny.

Tabela jest edytowalna i może służyć np. do planu działań, porównania segmentów lub listy rekomendacji.

### 11. Eksport

Aplikacja pozwala eksportować raport do:

- Markdown,
- HTML.

Eksport HTML pozwala otworzyć raport w przeglądarce i pokazać go jako prezentację roboczą.

### 12. Lokalny model językowy

Aplikacja może korzystać z lokalnego modelu Ollama do tworzenia pełniejszych podsumowań odpowiedzi otwartych.

To pozwala testować podejście AI bez wysyłania danych do płatnego zewnętrznego API.

## Przykładowy scenariusz demo

### Demo 1: Import danych

1. Otwórz zakładkę Import.
2. Wybierz plik CSV/XLSX.
3. Pokaż podgląd danych.
4. Pokaż mapowanie kolumn.
5. Zaimportuj ankietę.

Cel demo: pokazać, że aplikacja nie wymaga ręcznego przepisywania danych.

### Demo 2: Analiza wyników

1. Przejdź do Dashboardu.
2. Pokaż główne metryki ankiety.
3. Wejdź w Wyniki.
4. Wybierz kategorię i obszar pytania.
5. Pokaż podsumowanie i surowe odpowiedzi.

Cel demo: pokazać, jak z odpowiedzi powstają wnioski.

### Demo 3: Segmenty

1. Otwórz widok Segmenty.
2. Wybierz segment, np. region lub rola.
3. Wybierz pytanie zamknięte.
4. Pokaż różnice między grupami.

Cel demo: pokazać, gdzie problem jest najmocniejszy i jak aplikacja chroni małe grupy.

### Demo 4: Raport

1. Wejdź w Raport.
2. Wygeneruj raport.
3. Edytuj tytuł slajdu.
4. Wstaw tabelę.
5. Zmień status slajdu.
6. Uruchom tryb prezentacji.
7. Wyeksportuj HTML.

Cel demo: pokazać, że aplikacja prowadzi od danych do prezentacji.

## Korzyści dla użytkownika

- Mniej ręcznego przepisywania danych.
- Szybsze przejście od ankiety do raportu.
- Jasne oddzielenie odpowiedzi respondentów od podsumowań AI.
- Lepsza kontrola nad segmentami i małymi grupami.
- Możliwość pracy na kilku ankietach/projektach.
- Edytowalny raport zamiast statycznego wyniku.
- Lokalna praca z danymi i opcjonalne lokalne AI.

## Zakres odpowiedzialnego użycia

GoodHR Workbench powinien wspierać diagnozę organizacyjną, a nie automatyzować decyzje kadrowe.

Aplikacja nie jest przeznaczona do:

- oceny pojedynczych pracowników,
- rozpoznawania emocji,
- profilowania psychologicznego,
- podejmowania decyzji o zatrudnieniu, awansie, premii lub zwolnieniu.

Ostateczne kategorie, wnioski i rekomendacje powinien zatwierdzić człowiek.

## Obecny status produktu

Aplikacja jest zaawansowanym prototypem/MVP. Nadaje się do testów, demonstracji i dalszego rozwoju funkcji konsultingowych.

Najważniejsze elementy do dalszego rozwoju:

- baza danych projektów,
- konta użytkowników i uprawnienia,
- audyt zmian,
- eksport PPTX/PDF,
- silniejsze modele językowe lub lokalne embeddingi,
- stabilizacja importu dla kolejnych formatów ankiet.
