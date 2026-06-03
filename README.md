# GoodHR Workbench

GoodHR Workbench to rozwijalna aplikacja do analizy ankiet pracowniczych i przygotowywania raportów HR. Aplikacja pozwala importować dane z CSV/XLSX, mapować kolumny, analizować wyniki, porównywać segmenty, porządkować komentarze oraz tworzyć edytowalny raport slajdowy.

## Dokumentacja użytkowa

- [Instrukcja użytkownika](docs/INSTRUKCJA_UZYTKOWNIKA.md)
- [Przedstawienie funkcjonalności](docs/PRZEDSTAWIENIE_FUNKCJONALNOSCI.md)

## Uruchomienie lokalne

W katalogu aplikacji uruchom:

```powershell
python -m http.server 4173
```

Następnie otwórz:

```text
http://127.0.0.1:4173
```

## Wersja publiczna

Aplikacja może działać jako statyczna aplikacja na Vercel:

```powershell
npm run deploy
```

Aktualna wersja produkcyjna:

```text
https://goodhr-workbench.vercel.app
```

Dane projektów są przechowywane lokalnie w przeglądarce użytkownika. Publiczna wersja Vercel udostępnia kod aplikacji i przykładowe pliki CSV, ale nie przenosi automatycznie lokalnie zaimportowanych ankiet między urządzeniami.

## Dostęp z innych urządzeń w sieci LAN

Uruchom:

```powershell
npm run serve:lan
```

Skrypt pokaże adres lokalny oraz adres sieciowy, który można otworzyć na innym urządzeniu podłączonym do tej samej sieci Wi-Fi/LAN.

## Tymczasowy publiczny link

Do tymczasowego udostępnienia aplikacji można użyć tunelu Cloudflare:

```powershell
winget install --id Cloudflare.cloudflared
npm run serve:public
```

Terminal pokaże adres `https://...trycloudflare.com`. Okno terminala musi pozostać otwarte, bo zamknięcie go wyłącza publiczny dostęp.

## Lokalny model językowy Ollama

Widok wyników może korzystać z lokalnego modelu Ollama do generowania pełniejszych podsumowań odpowiedzi otwartych.

Przykładowa konfiguracja:

```powershell
winget install --id Ollama.Ollama
ollama pull gemma3
```

Najpewniejszy wariant pracy z Ollama to otwarcie aplikacji lokalnie pod:

```text
http://127.0.0.1:4173
```

Jeżeli chcesz korzystać z Ollama przez publiczną wersję Vercel, ustaw zaufane domeny:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://goodhr-workbench.vercel.app,http://127.0.0.1:4173,http://localhost:4173", "User")
```

Po zmianie zamknij i uruchom ponownie Ollama.

## Testy

W katalogu aplikacji uruchom:

```powershell
npm test
```

Testy sprawdzają m.in. filtrowanie segmentów, eNPS, import danych w formacie długim, przypisywanie kategorii oraz ignorowanie metadanych typu `free_text`, `suggestion` i list opcji odpowiedzi.

## Najważniejsze funkcje

- Import CSV/XLSX.
- Podgląd danych przed importem.
- Mapowanie kolumn i szablony importu.
- Oddzielne ankiety bez mieszania danych w dashboardzie.
- Dashboard aktywnej ankiety.
- Analiza wyników, pytań i komentarzy.
- Klasyfikacja tematów i edytor taksonomii.
- Porównania segmentów, np. według regionu, roli, działu lub lokalizacji.
- Automatyczne ukrywanie małych grup.
- Kontrola danych, PII i ograniczeń publikacji.
- eNPS.
- Lokalny model językowy Ollama do podsumowań.
- Edytor raportu slajdowego.
- Wstawianie elementów, w tym tabel.
- Tryb prezentacji.
- Eksport Markdown i HTML.

## Przykładowe CSV

Folder `data/` zawiera pliki testowe:

- `ankieta-zaangazowanie-2026.csv`
- `pulse-managerow-2026.csv`
- `onboarding-90-dni.csv`
- `kultura-bezpieczenstwa.csv`
- `praca-hybrydowa.csv`
- `format-dlugi-odpowiedzi.csv`
- `sample-import.csv`

W aplikacji przejdź do zakładki `Import`, wybierz przykładowy plik, sprawdź mapowanie kolumn i zaimportuj ankietę.

## Założenia odpowiedzialnego użycia

GoodHR Workbench jest narzędziem wspierającym analizę zagregowanych ankiet. Nie powinien służyć do oceny pojedynczych pracowników, rozpoznawania emocji, profilowania psychologicznego ani podejmowania decyzji kadrowych wobec konkretnych osób.

Wnioski, kategorie, cytaty i rekomendacje powinny zostać sprawdzone przez człowieka przed pokazaniem raportu klientowi lub organizacji.

## Struktura projektu

```text
goodhr-workbench/
  index.html
  data/
  docs/
  src/
    app.js
    analytics.js
    csv.js
    data.js
    filtering.js
    store.js
    styles.css
  tests/
  package.json
  vercel.json
```

## Status

Aplikacja jest zaawansowanym prototypem/MVP. Nadaje się do testów, demonstracji i dalszego rozwoju jako narzędzie konsultingowe. Do pełnej wersji produkcyjnej warto dodać bazę danych projektów, konta użytkowników, uprawnienia, audyt zmian oraz eksport PPTX/PDF.
