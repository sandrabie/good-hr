# GoodHR Workbench

## Dokumentacja uzytkowa

- [Instrukcja uzytkownika](docs/INSTRUKCJA_UZYTKOWNIKA.md)
- [Przedstawienie funkcjonalnosci](docs/PRZEDSTAWIENIE_FUNKCJONALNOSCI.md)

Rozwijalny starter lokalnej aplikacji do analizy ankiet pracowniczych.

To nie jest już statyczna makieta. Aplikacja ma stan, osobne ankiety, prostą analitykę, import CSV, mapowanie kolumn, wykrywanie potencjalnego PII, tematy komentarzy, zapis w `localStorage` i eksport/import ankiety w JSON.

## Uruchomienie

W katalogu `outputs/goodhr-workbench` uruchom:

```powershell
python -m http.server 4173
```

Następnie otwórz:

```text
http://localhost:4173
```

## Dostep z innych urzadzen

### Vercel

Projekt jest przygotowany do publikacji jako statyczna aplikacja na Vercel:

```powershell
npm run deploy
```

Po wdrozeniu Vercel zwroci publiczny adres `https://...vercel.app`. Dane ankiet zapisane lokalnie w przegladarce nie sa wysylane do Vercel automatycznie. Publiczna wersja zawiera kod aplikacji i przykladowe CSV z folderu `data/`; konkretne projekty mozna przenosic przez eksport/import JSON.

### Lokalny model jezykowy Ollama

Widok `Wyniki` ma przycisk generowania podsumowania przez lokalny model Ollama. Odpowiedzi sa wysylane do `http://localhost:11434/api/generate`, czyli do modelu uruchomionego na komputerze osoby korzystajacej z aplikacji.

Przykladowa konfiguracja:

```powershell
winget install --id Ollama.Ollama
ollama pull gemma3
python -m http.server 4173
```

Nastepnie otworz aplikacje lokalnie pod `http://localhost:4173` albo `http://127.0.0.1:4173`. Publiczna wersja z Vercel nadal dziala jako interfejs, ale lokalne generowanie moze byc blokowane przez przegladarke, jesli strona `https://...vercel.app` probuje laczyc sie z lokalnym `http://localhost`.

Jesli chcesz generowac z widoku otwartego na Vercel, ustaw lokalnej Ollamie zaufane domeny i zrestartuj aplikacje Ollama:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://goodhr-workbench.vercel.app,http://127.0.0.1:4173,http://localhost:4173", "User")
```

Po zmianie zamknij Ollama i uruchom ja ponownie, a potem sprobuj jeszcze raz w przegladarce.

### Inne urzadzenia w tej samej sieci Wi-Fi/LAN

Uruchom:

```powershell
npm run serve:lan
```

Skrypt pokaze dwa adresy:

- lokalny, np. `http://127.0.0.1:4174/`;
- sieciowy, np. `http://192.168.1.110:4174/`.

Adres sieciowy mozna otworzyc na telefonie, tablecie albo innym komputerze podlaczonym do tej samej sieci. Jesli Windows Firewall zapyta o dostep, wybierz zgode dla sieci prywatnych.

### Publiczny link dla osoby spoza sieci

Do tymczasowego publicznego linku uzyj tunelu Cloudflare:

```powershell
winget install --id Cloudflare.cloudflared
npm run serve:public
```

W terminalu pojawi sie adres `https://...trycloudflare.com`. Ten link mozna wyslac osobie na dowolnym urzadzeniu. Okno terminala musi pozostac otwarte, bo zamkniecie go wylacza publiczny dostep.

Uwaga: aplikacja jest prototypem client-side. Dane zapisane w `localStorage` sa osobne dla kazdej przegladarki, wiec osoba otwierajaca link nie zobaczy automatycznie Twoich lokalnie zaimportowanych ankiet. Jesli chcesz przekazac konkretny projekt, wyeksportuj go do JSON i zaimportuj na drugim urzadzeniu.

## Testy

W katalogu `outputs/goodhr-workbench` można sprawdzić filtrowanie i przypisanie kategorii:

```powershell
node --test
```

## Co działa w tej wersji

- Lista ankiet i wybór aktywnej ankiety.
- Lokalny zapis ankiet w przeglądarce.
- Przykładowy projekt GoodHR z danymi ankietowymi.
- Import CSV z automatycznym wykrywaniem typów kolumn.
- Import obsługuje też format długi: jeden wiersz = jedna odpowiedź na jedno pytanie, np. `id_odpowiedzi`, `id_pytania`, `kategoria`, `pytanie`, `odpowiedz`.
- Wczytywanie przykładowych CSV jednym kliknięciem z widoku Import.
- Każdy import CSV tworzy oddzielną ankietę/dataset; dashboard nie agreguje odpowiedzi z różnych plików.
- Mapowanie kolumn na segment, skalę, eNPS i komentarz.
- Dashboard z metrykami.
- Analiza ilościowa i heatmapa segmentów.
- Proste grupowanie komentarzy na tematy regułowe.
- Główne wnioski z ankiety: grupowanie pytań skalowych i komentarzy w tematy.
- Widok `Wyniki` łączy tematy, pytania skalowe i komentarze, ale wizualnie rozdziela `Podsumowanie AI` od `Odpowiedzi ankietowanych`.
- Widok `Wyniki` prowadzi analizę w kolejności: kategoria, unikalny obszar pytania, odpowiedzi respondentów i podsumowanie AI dla tego obszaru.
- Powtarzające się obszary pytań są scalane w jedną opcję filtra, a podsumowanie AI liczy wniosek z odpowiedzi w całej grupie.
- Obszar pytania zachowuje sens konkretnego pytania, szczególnie przy odpowiedziach zamkniętych typu `Tak/Nie`, żeby odpowiedzi nie były oderwane od kontekstu.
- Testy automatyczne sprawdzają filtrowanie segmentów oraz przypisanie pytań i komentarzy do tematów.
- Proste wykrywanie PII w komentarzach.
- Widok `Kontrola danych` do sprawdzania PII, małych grup i progów 5/10 przed raportem.
- Guardraile AI Act: brak oceny jednostek, brak rozpoznawania emocji, obowiązkowy przegląd konsultanta i zakaz użycia do decyzji kadrowych wobec osób.
- Studio raportu ze szkicem streszczenia i dowodami.
- Eksport/import całego projektu do JSON.
- Eksport szkicu raportu do Markdown i HTML.

## Przykładowe CSV

Folder `data/` zawiera zestaw plików do testowania różnych typów badań:

- `ankieta-zaangazowanie-2026.csv` - klasyczne badanie zaangażowania z eNPS, skalami 1-5 i komentarzami.
- `pulse-managerow-2026.csv` - ankieta dla menedżerów o priorytetach, decyzyjności i obciążeniu.
- `onboarding-90-dni.csv` - ankieta onboardingowa po pierwszych 90 dniach.
- `kultura-bezpieczenstwa.csv` - ankieta o bezpieczeństwie, procedurach i presji czasu.
- `praca-hybrydowa.csv` - ankieta o pracy hybrydowej, narzędziach i spotkaniach.
- `format-dlugi-odpowiedzi.csv` - test pliku, w którym `pytanie` i `tagi` są metadanymi, a `przykladowa_odpowiedz_pracownika` zawiera właściwą odpowiedź respondenta.
- `sample-import.csv` - mały plik bazowy zostawiony do szybkiego ręcznego importu.

W aplikacji wejdź w `Import`, wybierz jedną z kart w sekcji "Przykładowe CSV do testów" i kliknij `Wczytaj`. Potem sprawdź mapowanie kolumn i kliknij `Importuj dane ankiety`.

W `Dashboard` każda zaimportowana ankieta ma osobną kartę. Przełączenie karty zmienia aktywny dataset i wszystkie metryki, tematy, komentarze oraz raport są liczone wyłącznie dla tej jednej ankiety.

## Założenia AI Act

Prototyp jest projektowany jako narzędzie do analizy zagregowanych ankiet, a nie jako system monitorowania lub oceniania pracowników.

Zasady wbudowane w UI:

- analiza tematów działa na poziomie ankiety, segmentu lub grupy odpowiedzi;
- aplikacja nie pokazuje oceny pojedynczego respondenta;
- aplikacja nie rozpoznaje emocji pracownika ani nie tworzy profilu psychologicznego;
- raport wymaga przeglądu konsultanta;
- wyników nie należy używać do decyzji kadrowych wobec osób, np. zatrudnienia, awansu, premii, zwolnienia lub oceny indywidualnej.

## Struktura

```text
goodhr-workbench/
  index.html
  src/
    app.js          # UI, routing widoków, zdarzenia
    analytics.js    # obliczenia, tematy, PII, raport
    csv.js          # parser CSV i inferencja typów kolumn
    data.js         # dane przykładowe i reguły tematów
    filtering.js    # pomocnicze filtrowanie segmentów używane w testach i przyszłych widokach
    store.js        # localStorage, import/export JSON
    styles.css      # wygląd aplikacji
```

## Proponowane kolejne kroki

1. Dodać eksport raportu do PDF/PPTX na podstawie obecnego eksportu HTML/Markdown.
2. Podmienić regułowe tematy komentarzy na embeddingi i klastrowanie.
3. Dodać szyfrowany format projektu `.goodhrproj`.
4. Dodać wersjonowanie raportów i dziennik zmian insightów.
5. Przepiąć UI na Tauri/Electron, jeśli ma powstać instalowalna aplikacja desktopowa.
