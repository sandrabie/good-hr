# GoodHR Workbench - instrukcja uzytkownika

GoodHR Workbench to aplikacja do roboczej analizy ankiet pracowniczych. Pomaga zaimportowac dane z CSV lub Excela, uporzadkowac pytania i odpowiedzi, sprawdzic wyniki, porownac segmenty oraz przygotowac edytowalny raport slajdowy.

Aplikacja jest przeznaczona dla konsultantow HR, analitykow, osob przygotowujacych raporty z badan pracowniczych oraz zespolow, ktore chca szybko przejsc od surowych danych ankietowych do wnioskow i prezentacji.

## 1. Uruchomienie aplikacji

### Wersja publiczna

Aplikacja jest dostepna pod adresem:

https://goodhr-workbench.vercel.app

Wersja publiczna dziala w przegladarce. Dane projektow zapisane sa lokalnie w przegladarce uzytkownika, dlatego inna osoba otwierajaca link nie zobaczy automatycznie Twoich lokalnych importow.

### Wersja lokalna

W katalogu aplikacji uruchom:

```powershell
python -m http.server 4173
```

Nastepnie otworz:

```text
http://127.0.0.1:4173
```

## 2. Podstawowa nawigacja

Aplikacja ma kilka glownych zakladek:

- Dashboard - szybki podglad aktywnej ankiety.
- Ankiety - lista projektow, historia ankiet i wersje raportow.
- Import - wczytywanie CSV/XLSX oraz mapowanie kolumn.
- Wyniki - analiza odpowiedzi, tematow, pytan i segmentow.
- Taksonomia - edycja kategorii tematycznych.
- Kontrola danych - sprawdzenie PII, malych grup i ograniczen publikacji.
- Raport - edytor slajdow i eksport raportu.

## 3. Import danych ankietowych

1. Wejdz w zakladke Import.
2. Wybierz plik CSV lub XLSX z wynikami ankiety.
3. Sprawdz podglad danych przed importem.
4. Ustaw mapowanie kolumn:
   - pytanie,
   - odpowiedz,
   - respondent,
   - segment,
   - typ pytania,
   - wartosc odpowiedzi,
   - eNPS,
   - komentarz,
   - kolumna ignorowana.
5. Zwroc uwage na ostrzezenia importu. Aplikacja sygnalizuje m.in. sytuacje, gdy pytania moga trafiac do odpowiedzi albo gdy kolumny typu `free_text` lub `suggestion` wygladaja jak metadane, a nie odpowiedzi respondentow.
6. Kliknij przycisk importu danych ankiety.

Kazdy import tworzy osobna ankiete. Dashboard i wyniki nie lacza odpowiedzi z roznych plikow.

## 4. Szablony importu

Jesli czesto importujesz dane z tego samego narzedzia, np. Webankieta, Excel lub powtarzalny CSV:

1. Ustaw poprawne mapowanie kolumn.
2. Zapisz szablon importu.
3. Przy kolejnym imporcie wybierz zapisany szablon.

Dzieki temu nie trzeba za kazdym razem recznie przypisywac kolumn.

## 5. Praca z ankietami

W zakladce Ankiety mozna:

- przegladac zapisane ankiety,
- wybierac aktywna ankiete,
- sprawdzac historie projektow,
- porownywac kilka ankiet w ramach jednego projektu,
- widziec wersje raportow.

Aktywna ankieta jest widoczna w panelu po lewej stronie. Wszystkie metryki i raporty licza sie dla aktualnie wybranej ankiety.

## 6. Dashboard

Dashboard pokazuje szybki stan ankiety:

- liczbe odpowiedzi,
- srednie wynikow skalowych,
- eNPS, jezeli ankieta zawiera odpowiednie pytanie,
- gotowosc danych do raportu,
- glowne tematy i sygnaly.

Z dashboardu mozna przejsc bezposrednio do wynikow.

## 7. Wyniki i komentarze

Zakladka Wyniki sluzy do pracy analitycznej.

Typowy przebieg:

1. Wybierz kategorie tematyczna.
2. Wybierz obszar pytania.
3. Sprawdz podsumowanie odpowiedzi.
4. Przejrzyj surowe odpowiedzi respondentow.
5. W razie potrzeby wygeneruj pelniejsze podsumowanie przez lokalny model Ollama.

Aplikacja rozdziela:

- podsumowanie AI,
- surowe odpowiedzi respondentow,
- dane liczbowe,
- komentarze otwarte.

Przy pytaniach zamknietych aplikacja pokazuje rozklad odpowiedzi, np. ile osob odpowiedzialo `Tak`, `Nie`, `Raczej tak`, `Wazne`, `Malo wazne` itd. Wyniki nie sa ograniczone tylko do odpowiedzi tak/nie.

## 8. Porownania segmentow

Widok Segmenty znajduje sie w zakladce Wyniki.

Pozwala porownywac odpowiedzi wedlug kolumn segmentujacych, np.:

- region pracy,
- stanowisko,
- dzial,
- lokalizacja,
- zespol,
- staz,
- tryb pracy.

Aplikacja pokazuje tylko pytania zamkniete lub liczbowe, poniewaz na nich segmenty mozna liczyc wiarygodnie. Male grupy sa automatycznie ukrywane zgodnie z progiem bezpieczenstwa.

Widok wskazuje tez, gdzie problem jest najmocniejszy, czyli ktory segment ma najslabszy lub najbardziej ryzykowny wynik.

## 9. Taksonomia tematow

Zakladka Taksonomia sluzy do porzadkowania tematow.

Aplikacja tworzy robocze kategorie AI, ale konsultant moze:

- zmieniac nazwy kategorii,
- scalac zblizone tematy,
- poprawiac przypisania,
- rozdzielac tagi AI od finalnych kategorii konsultanta.

To wazne, bo AI ma wspierac analize, ale nie powinno samodzielnie decydowac o ostatecznej strukturze raportu.

## 10. Kontrola danych

Zakladka Kontrola danych pomaga sprawdzic, czy raport mozna pokazac dalej.

Sprawdzane sa m.in.:

- potencjalne dane osobowe w komentarzach,
- male grupy respondentow,
- progi publikacji,
- ograniczenia wynikajace z uzycia AI.

Zalecenie: nie publikuj wynikow segmentow, jezeli grupa jest zbyt mala. Nie uzywaj aplikacji do oceny pojedynczych osob.

## 11. Edytor raportu

Zakladka Raport dziala jak prosty edytor slajdow.

Po prawej stronie znajduje sie panel edycji. Zawiera:

- wybor ankiety,
- eksport Markdown i HTML,
- generowanie raportu od nowa,
- dodawanie slajdow,
- uruchomienie prezentacji,
- status aktywnego slajdu,
- ukrywanie slajdow w eksporcie,
- zmiane ukladu i motywu,
- wstawianie elementow.

Aktywny slajd wybiera sie automatycznie podczas przewijania i edycji. Nie trzeba recznie wybierac slajdu z listy.

## 12. Wstawianie elementow w raporcie

W panelu po prawej dostepna jest sekcja Wstaw.

Mozna dodac:

- punkt tekstowy,
- metryke,
- tabele,
- cytat,
- punkt kontrolny.

Opcja Tabela tworzy edytowalna tabele z kolumnami:

- Obszar,
- Wartosc,
- Opis,
- Status.

Komorki tabeli mozna edytowac bezposrednio na slajdzie.

## 13. Eksport raportu

Dostepne eksporty:

- Markdown - tekstowy szkic raportu.
- HTML - wizualny raport/slajdy do otwarcia w przegladarce.

Ukryte slajdy nie trafiaja do prezentacji ani eksportu HTML.

## 14. Lokalny model Ollama

Aplikacja moze korzystac z lokalnego modelu jezykowego przez Ollama.

Przykladowa konfiguracja:

```powershell
winget install --id Ollama.Ollama
ollama pull gemma3
```

Nastepnie uruchom Ollama i w aplikacji kliknij generowanie pelniejszego podsumowania.

Uwaga: jezeli aplikacja jest otwarta z Vercel, przegladarka moze blokowac polaczenie z lokalna Ollama. Najpewniejszy sposob to otworzyc aplikacje lokalnie pod `http://127.0.0.1:4173`.

## 15. Dobre praktyki

- Zawsze sprawdz mapowanie kolumn przed importem.
- Nie pokazuj wynikow bardzo malych grup.
- Sprawdz cytaty i komentarze pod katem danych osobowych.
- Traktuj kategorie AI jako szkic, nie jako ostateczna prawde.
- Przed wyslaniem raportu klientowi przejrzyj kazdy slajd.
- Nie uzywaj wynikow do decyzji kadrowych wobec pojedynczych osob.

## 16. Najczestsze problemy

### Aplikacja pokazuje pytania zamiast odpowiedzi

Sprawdz mapowanie kolumn w imporcie. Kolumna z trescia pytania powinna byc oznaczona jako pytanie, a kolumna z wypowiedzia respondenta jako odpowiedz.

### Segmenty sa dziwne albo nieuzyteczne

Sprawdz, czy kolumna segmentu jest faktycznie cecha respondenta, np. region, dzial, rola, lokalizacja. Nie oznaczaj jako segmentu kolumn z pytaniami ankietowymi.

### Brakuje wynikow w segmencie

Aplikacja ukrywa male grupy. To celowe zabezpieczenie przed identyfikacja respondentow.

### Ollama nie odpowiada

Sprawdz, czy Ollama jest uruchomiona i czy model zostal pobrany:

```powershell
ollama pull gemma3
```

### Dane zniknely po otwarciu aplikacji na innym komputerze

Dane sa zapisane lokalnie w przegladarce. Inne urzadzenie nie ma automatycznie dostepu do Twoich lokalnych projektow.

## 17. Ograniczenia

GoodHR Workbench jest prototypem roboczym. Nie ma jeszcze pelnej bazy danych, kont uzytkownikow, uprawnien, audytu zmian ani zaawansowanego eksportu do PPTX. Narzedzie najlepiej traktowac jako wspomaganie analizy i przygotowania raportu, a nie jako samodzielny system decyzyjny.
