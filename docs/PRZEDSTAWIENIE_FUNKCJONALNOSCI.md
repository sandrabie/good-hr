# GoodHR Workbench - przedstawienie funkcjonalnosci

## Krotki opis

GoodHR Workbench to narzedzie do analizy ankiet pracowniczych i przygotowywania raportow HR. Aplikacja pomaga przejsc od surowych danych z ankiety do uporzadkowanych wynikow, tematow, segmentow i edytowalnej prezentacji.

Najwieksza wartosc aplikacji polega na tym, ze laczy trzy etapy pracy konsultanta:

1. Import i porzadkowanie danych.
2. Analize wynikow, komentarzy i segmentow.
3. Przygotowanie raportu slajdowego.

## Dla kogo jest aplikacja

Aplikacja jest przeznaczona dla:

- konsultantow HR,
- analitykow ankiet pracowniczych,
- zespolow People/HR,
- osob przygotowujacych raporty z badan opinii,
- firm, ktore chca analizowac ankiety lokalnie lub w kontrolowanym srodowisku.

## Problem, ktory rozwiazuje

Typowy raport z ankiety pracowniczej wymaga wielu recznych krokow:

- wczytania danych z Excela lub CSV,
- rozpoznania, ktore kolumny sa pytaniami, odpowiedziami i segmentami,
- policzenia wynikow,
- uporzadkowania komentarzy,
- sprawdzenia malych grup i danych wrazliwych,
- przygotowania raportu,
- napisania wnioskow i rekomendacji.

GoodHR Workbench skraca ten proces i daje jedno miejsce pracy nad calym raportem.

## Najwazniejsze funkcje

### 1. Import CSV/XLSX

Aplikacja pozwala wczytywac dane z plikow CSV i Excel. Uzytkownik widzi podglad danych przed importem i moze przypisac kolumny do odpowiednich typow.

Obslugiwane sa m.in.:

- pytania,
- odpowiedzi,
- wartosci liczbowe,
- komentarze,
- segmenty,
- eNPS,
- typy pytan,
- identyfikatory respondentow i pytan.

### 2. Mapowanie i szablony importu

Uzytkownik moze zapisac szablon mapowania kolumn. To przyspiesza prace z powtarzalnymi zrodlami danych, np. Webankieta, Excel lub cykliczne badania klienta.

Aplikacja ostrzega, gdy wykryje, ze pytania moga zostac potraktowane jako odpowiedzi.

### 3. Oddzielne ankiety i projekty

Kazdy import tworzy osobna ankiete. Dane nie sa mieszane w dashboardzie.

Mozna pracowac na kilku ankietach w jednym projekcie, np.:

- fala Q1,
- fala Q2,
- ankieta onboardingowa,
- ankieta pulse,
- ankieta dla konkretnej grupy.

### 4. Dashboard ankiety

Dashboard pokazuje szybki stan aktywnej ankiety:

- liczbe odpowiedzi,
- srednie wynikow,
- eNPS,
- gotowosc danych,
- glowne tematy.

Dashboard jest punktem startowym przed wejsciem w szczegolowa analize.

### 5. Wyniki i komentarze

Widok Wyniki laczy dane liczbowe i jakosciowe.

Uzytkownik wybiera:

1. kategorie,
2. obszar pytania,
3. konkretne odpowiedzi i podsumowanie.

Aplikacja pokazuje osobno:

- podsumowanie AI,
- odpowiedzi respondentow,
- rozklady odpowiedzi zamknietych,
- komentarze otwarte.

### 6. Klasyfikacja tematow

Aplikacja tworzy robocze kategorie tematyczne na podstawie pytan i odpowiedzi.

Przyklady kategorii:

- komunikacja i decyzje,
- wspolpraca,
- narzedzia i procesy,
- rozwoj,
- priorytety i przeciazenie,
- inicjatywy Green IT,
- sprzet i infrastruktura.

Konsultant moze poprawiac taksonomie i rozdzielac tagi AI od finalnych kategorii.

### 7. Porownania segmentow

Aplikacja pozwala porownywac wyniki wedlug segmentow, np.:

- region pracy,
- rola,
- dzial,
- lokalizacja,
- zespol,
- staz,
- tryb pracy.

Widok segmentow pokazuje roznice miedzy grupami i wskazuje, gdzie problem jest najmocniejszy.

Male grupy sa automatycznie ukrywane, aby ograniczyc ryzyko identyfikacji respondentow.

### 8. Kontrola danych

Zakladka Kontrola danych wspiera bezpieczne przygotowanie raportu.

Sprawdzane sa:

- potencjalne dane osobowe,
- male grupy,
- progi publikacji,
- ograniczenia zwiazane z AI.

Aplikacja przypomina, ze raport nie powinien sluzyc do oceny pojedynczych pracownikow.

### 9. Edytor raportu

Raport jest tworzony jako zestaw edytowalnych slajdow.

Uzytkownik moze:

- wygenerowac raport automatycznie,
- dodawac nowe slajdy,
- zmieniac kolejnosc slajdow,
- ukrywac slajdy w eksporcie,
- nadawac statusy: roboczy, do sprawdzenia, gotowy,
- edytowac tekst bezposrednio na slajdzie,
- zmieniac motyw i uklad,
- uruchomic tryb prezentacji.

### 10. Wstawianie elementow

W panelu po prawej mozna wstawic:

- punkt tekstowy,
- metryke,
- tabele,
- cytat,
- punkt kontrolny.

Tabela jest edytowalna i moze sluzyc np. do planu dzialan, porownania segmentow lub listy rekomendacji.

### 11. Eksport

Aplikacja pozwala eksportowac raport do:

- Markdown,
- HTML.

Eksport HTML pozwala otworzyc raport w przegladarce i pokazac go jako prezentacje robocza.

### 12. Lokalny model jezykowy

Aplikacja moze korzystac z lokalnego modelu Ollama do tworzenia pelniejszych podsumowan odpowiedzi otwartych.

To pozwala testowac podejscie AI bez wysylania danych do platnego zewnetrznego API.

## Przykladowy scenariusz demo

### Demo 1: Import danych

1. Otworz zakladke Import.
2. Wybierz plik CSV/XLSX.
3. Pokaz podglad danych.
4. Pokaz mapowanie kolumn.
5. Zaimportuj ankiete.

Cel demo: pokazac, ze aplikacja nie wymaga recznego przepisywania danych.

### Demo 2: Analiza wynikow

1. Przejdz do Dashboardu.
2. Pokaz glowne metryki ankiety.
3. Wejdz w Wyniki.
4. Wybierz kategorie i obszar pytania.
5. Pokaz podsumowanie i surowe odpowiedzi.

Cel demo: pokazac, jak z odpowiedzi powstaja wnioski.

### Demo 3: Segmenty

1. Otworz widok Segmenty.
2. Wybierz segment, np. region lub rola.
3. Wybierz pytanie zamkniete.
4. Pokaz roznice miedzy grupami.

Cel demo: pokazac, gdzie problem jest najmocniejszy i jak aplikacja chroni male grupy.

### Demo 4: Raport

1. Wejdz w Raport.
2. Wygeneruj raport.
3. Edytuj tytul slajdu.
4. Wstaw tabele.
5. Zmien status slajdu.
6. Uruchom tryb prezentacji.
7. Wyeksportuj HTML.

Cel demo: pokazac, ze aplikacja prowadzi od danych do prezentacji.

## Korzysci dla uzytkownika

- Mniej recznego przepisywania danych.
- Szybsze przejscie od ankiety do raportu.
- Jasne oddzielenie odpowiedzi respondentow od podsumowan AI.
- Lepsza kontrola nad segmentami i malymi grupami.
- Mozliwosc pracy na kilku ankietach/projektach.
- Edytowalny raport zamiast statycznego wyniku.
- Lokalna praca z danymi i opcjonalne lokalne AI.

## Zakres odpowiedzialnego uzycia

GoodHR Workbench powinien wspierac diagnoze organizacyjna, a nie automatyzowac decyzje kadrowe.

Aplikacja nie jest przeznaczona do:

- oceny pojedynczych pracownikow,
- rozpoznawania emocji,
- profilowania psychologicznego,
- podejmowania decyzji o zatrudnieniu, awansie, premii lub zwolnieniu.

Ostateczne kategorie, wnioski i rekomendacje powinien zatwierdzic czlowiek.

## Obecny status produktu

Aplikacja jest zaawansowanym prototypem/MVP. Nadaje sie do testow, demonstracji i dalszego rozwoju funkcji konsultingowych.

Najwazniejsze elementy do dalszego rozwoju:

- baza danych projektow,
- konta uzytkownikow i uprawnienia,
- audyt zmian,
- eksport PPTX/PDF,
- silniejsze modele jezykowe lub lokalne embeddingi,
- stabilizacja importu dla kolejnych formatow ankiet.
