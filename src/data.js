export const topicRules = [
  {
    id: "satisfaction",
    name: "Satysfakcja z pracy",
    tone: "mieszane",
    color: "teal",
    keywords: ["zadowol", "satysfakc", "komfort pracy"],
    questionKeywords: ["generalnie jestem zadowol", "zadowolona z pracy", "zadowolony z pracy"]
  },
  {
    id: "loyalty",
    name: "Przyszłość i retencja",
    tone: "mieszane",
    color: "blue",
    keywords: ["przyszlosc", "przyszłość", "zostac", "zostać", "odejsc", "odejść", "rotac", "retenc", "wiaze", "wiąż"],
    questionKeywords: ["wiaze swoja przyszlosc", "wiążę swoją przyszłość", "przyszlosc z firma", "przyszłość z firmą"]
  },
  {
    id: "pride",
    name: "Duma i identyfikacja",
    tone: "pozytywne",
    color: "green",
    keywords: ["dumn", "identyfik", "wartosci", "wartości", "marka pracodawcy"],
    questionKeywords: ["jestem dumna", "jestem dumny", "duma z pracy"]
  },
  {
    id: "recommendation",
    name: "Rekomendacja pracodawcy",
    tone: "mieszane",
    color: "amber",
    keywords: ["polec", "rekomend", "pracodawce", "pracodawcę", "enps"],
    questionKeywords: ["polecisz", "polecilbys", "poleciłbyś", "jako pracodawce", "jako pracodawcę"]
  },
  {
    id: "leadership",
    name: "Zaufanie do kadry zarządzającej",
    tone: "mieszane",
    color: "amber",
    keywords: ["zarzad", "zarząd", "kadra zarzadz", "kadra zarządz", "zaufanie", "strateg", "najwyzsza kadra", "najwyższa kadra"],
    questionKeywords: ["mam zaufanie do kadry", "kadra zarzadzajaca", "kadra zarządzająca", "zarzad i najwyzsza kadra", "zarząd i najwyższa kadra"]
  },
  {
    id: "psychological_safety",
    name: "Swoboda wypowiedzi i pomysły",
    tone: "mieszane",
    color: "teal",
    keywords: ["przestrzen do", "przestrzeń do", "swobodnej komunikacji", "dzielenia sie pomysl", "dzielenia się pomysł", "pomyslami", "pomysłami", "bez obaw", "otwarcie mowic", "otwarcie mówić"],
    questionKeywords: ["czuje przestrzen do swobodnej komunikacji", "czuję przestrzeń do swobodnej komunikacji", "dzielenia sie pomyslami", "dzielenia się pomysłami"]
  },
  {
    id: "information_flow",
    name: "Przepływ informacji",
    tone: "mieszane",
    color: "blue",
    keywords: ["inform", "przepływ", "przeplyw", "wymiana informacji", "na biezaco", "na bieżąco", "co dzieje sie", "co dzieje się", "kanał", "kanal", "decyz"],
    questionKeywords: ["wymiana informacji", "na biezaco informuje", "na bieżąco informuje", "przeplyw informacji", "przepływ informacji"]
  },
  {
    id: "cooperation",
    name: "Współpraca i wsparcie między jednostkami",
    tone: "mieszane",
    color: "green",
    keywords: ["współprac", "wspolprac", "inne jednostki", "miedzy dzial", "między dział", "miedzy zespol", "między zespoł", "wsparcie innych", "pomoc"],
    questionKeywords: ["wspolprace z innymi jednostkami", "współpracę z innymi jednostkami", "wsparcie innych jednostek", "sprzyja dobrej wspolpracy", "sprzyja dobrej współpracy"]
  },
  {
    id: "team_atmosphere",
    name: "Atmosfera w zespole",
    tone: "pozytywne",
    color: "teal",
    keywords: ["atmosfer", "relacje", "zyczliw", "życzliw", "szacunek", "pomaga sobie", "zespole panuje"],
    questionKeywords: ["w moim zespole panuje", "przyjazna atmosfera", "atmosfera w zespole"]
  },
  {
    id: "integration",
    name: "Integracja i kontakty pracowników",
    tone: "mieszane",
    color: "blue",
    keywords: ["integrac", "kontakty", "spotkania integracyjne", "team building", "relacje miedzy pracownikami", "relacje między pracownikami"],
    questionKeywords: ["lepsza integracje", "lepszą integrację", "kontakty miedzy pracownikami", "kontakty między pracownikami"]
  },
  {
    id: "feedback",
    name: "Feedback i rozmowy o pracy",
    tone: "mieszane",
    color: "amber",
    keywords: ["feedback", "informacji zwrotnej", "informcji zwrotnej", "rozmawia ze mna", "rozmawia ze mną", "bieżącej informacji", "biezacej informacji", "ocena pracy"],
    questionKeywords: ["udziela mi biezacej", "udziela mi bieżącej", "rozmawia ze mna na temat mojej pracy", "rozmawia ze mną na temat mojej pracy"]
  },
  {
    id: "compensation",
    name: "Wynagrodzenie i benefity",
    tone: "mieszane",
    color: "amber",
    keywords: ["wynagrodz", "pensj", "plac", "płac", "premi", "benefit", "podwyz", "podwyż"],
    questionKeywords: ["wynagrodzenie", "system premiowy", "benefity"]
  },
  {
    id: "workload",
    name: "Priorytety i przeciążenie",
    tone: "negatywne",
    color: "coral",
    keywords: ["priorytet", "priorytety", "dużo", "duzo", "nadmiar", "przeciąż", "obciąż", "termin", "deadline", "chaos", "grafik", "zmienia", "zmienian"]
  },
  {
    id: "communication",
    name: "Komunikacja i decyzje",
    tone: "mieszane",
    color: "amber",
    keywords: ["komunik", "inform", "decyz", "spotkan", "wiedzieć", "wiemy", "kanał", "kanal", "przepływ", "przeplyw"]
  },
  {
    id: "growth",
    name: "Rozwój i awanse",
    tone: "neutralno-negatywne",
    color: "blue",
    keywords: ["rozwój", "rozwoj", "awans", "szkol", "ścież", "sciez", "karier", "kompetenc"]
  },
  {
    id: "manager",
    name: "Wsparcie przełożonego",
    tone: "pozytywne",
    color: "teal",
    keywords: ["przełoż", "przeloz", "manager", "menedż", "menedz", "lider", "szef", "wspar", "feedback"]
  },
  {
    id: "tools",
    name: "Narzędzia i procesy",
    tone: "mieszane",
    color: "green",
    keywords: ["system", "narzęd", "narzed", "proces", "procedur", "excel", "sprzęt", "sprzet", "aplikac"]
  },
  {
    id: "energy",
    name: "Energia i zasoby",
    tone: "mieszane",
    color: "teal",
    keywords: ["energia", "energi", "zuży", "zuzy", "oszczęd", "oszczed", "wyłącz", "wylacz", "zasil", "green it"]
  },
  {
    id: "transport",
    name: "Transport i mobilność",
    tone: "mieszane",
    color: "blue",
    keywords: ["transport", "dojazd", "dojeżdż", "dojezdz", "biura", "samoch", "rower", "publiczn", "zdaln", "hybryd"]
  },
  {
    id: "infrastructure",
    name: "Sprzęt i infrastruktura",
    tone: "mieszane",
    color: "green",
    keywords: ["infrastruktur", "serwer", "chmur", "laptop", "komputer", "log", "środowisk", "srodowisk", "zasob"]
  },
  {
    id: "reporting",
    name: "Raportowanie i mierniki",
    tone: "neutralne",
    color: "amber",
    keywords: ["raport", "miernik", "mierzyć", "mierzyc", "wskaź", "wskaz", "dashboard", "monitor"]
  },
  {
    id: "initiatives",
    name: "Inicjatywy green IT",
    tone: "pozytywne",
    color: "teal",
    keywords: ["inicjatyw", "pomysł", "pomysl", "pilotaż", "pilotaz", "przetest", "program", "checklist"]
  }
];

export const sampleCsvFiles = [
  {
    file: "ankieta-zaangazowanie-2026.csv",
    client: "Acme Polska",
    name: "Zaangażowanie 2026",
    wave: "Q2 2026",
    description: "Klasyczne badanie zaangażowania: skale 1-5, eNPS, segmenty i dwa pytania otwarte."
  },
  {
    file: "pulse-managerow-2026.csv",
    client: "Nord Factory",
    name: "Pulse managerów",
    wave: "Maj 2026",
    description: "Krótka ankieta menedżerska o decyzyjności, obciążeniu i przepływie informacji."
  },
  {
    file: "onboarding-90-dni.csv",
    client: "Softline",
    name: "Onboarding 90 dni",
    wave: "Rocznik 2026",
    description: "Ankieta nowych pracowników: wdrożenie, przełożony, narzędzia i komentarze."
  },
  {
    file: "kultura-bezpieczenstwa.csv",
    client: "Medlog",
    name: "Kultura bezpieczeństwa",
    wave: "Q1 2026",
    description: "Dane do testowania tematów procesowych, ryzyk i małych segmentów."
  },
  {
    file: "praca-hybrydowa.csv",
    client: "FinCore",
    name: "Praca hybrydowa",
    wave: "Czerwiec 2026",
    description: "Ankieta o komunikacji, narzędziach, przeciążeniu spotkaniami i współpracy zdalnej."
  },
  {
    file: "format-dlugi-odpowiedzi.csv",
    client: "Nowy klient",
    name: "Format długi odpowiedzi",
    wave: "Test importu",
    description: "CSV w układzie jeden wiersz = jedna odpowiedź na jedno pytanie, z kolumnami pytanie i odpowiedź."
  }
];

export const sampleProject = {
  id: "sample-goodhr-2026",
  name: "Zaangażowanie 2026",
  client: "Acme Polska",
  wave: "Q1 2026",
  sourceFile: "dane-przykladowe-wbudowane",
  status: "przegląd raportu",
  createdAt: "2026-06-01T10:00:00.000Z",
  thresholds: {
    numeric: 5,
    comments: 10
  },
  schema: {
    columns: [
      { name: "Dział", type: "segment" },
      { name: "Staż", type: "segment" },
      { name: "Polecił(a)bym firmę jako miejsce pracy", type: "enps" },
      { name: "Przełożony wspiera mnie w pracy", type: "scale" },
      { name: "Komunikacja w firmie jest skuteczna", type: "scale" },
      { name: "Mam jasną ścieżkę rozwoju", type: "scale" },
      { name: "Obciążenie pracą jest rozsądne", type: "scale" },
      { name: "Współpraca między działami działa dobrze", type: "scale" },
      { name: "Co działa dobrze?", type: "comment" },
      { name: "Co najbardziej przeszkadza?", type: "comment" }
    ]
  },
  responses: [
    {
      "Dział": "Biuro",
      "Staż": "1-3 lata",
      "Polecił(a)bym firmę jako miejsce pracy": "8",
      "Przełożony wspiera mnie w pracy": "5",
      "Komunikacja w firmie jest skuteczna": "4",
      "Mam jasną ścieżkę rozwoju": "4",
      "Obciążenie pracą jest rozsądne": "3",
      "Współpraca między działami działa dobrze": "4",
      "Co działa dobrze?": "Menedżer jest dostępny i regularnie daje feedback.",
      "Co najbardziej przeszkadza?": "Priorytety zmieniają się kilka razy w tygodniu i czasem trudno ustalić, co jest najważniejsze."
    },
    {
      "Dział": "Produkcja",
      "Staż": "3-5 lat",
      "Polecił(a)bym firmę jako miejsce pracy": "6",
      "Przełożony wspiera mnie w pracy": "4",
      "Komunikacja w firmie jest skuteczna": "3",
      "Mam jasną ścieżkę rozwoju": "2",
      "Obciążenie pracą jest rozsądne": "2",
      "Współpraca między działami działa dobrze": "3",
      "Co działa dobrze?": "Zespół dobrze sobie pomaga na zmianie.",
      "Co najbardziej przeszkadza?": "Grafiki są zmieniane za późno, a obciążenie jest nierówne."
    },
    {
      "Dział": "Sprzedaż",
      "Staż": "poniżej roku",
      "Polecił(a)bym firmę jako miejsce pracy": "9",
      "Przełożony wspiera mnie w pracy": "5",
      "Komunikacja w firmie jest skuteczna": "3",
      "Mam jasną ścieżkę rozwoju": "3",
      "Obciążenie pracą jest rozsądne": "3",
      "Współpraca między działami działa dobrze": "3",
      "Co działa dobrze?": "Szybka reakcja przełożonego i dobra atmosfera w zespole.",
      "Co najbardziej przeszkadza?": "Brakuje jednego miejsca, gdzie widać decyzje i właścicieli tematów."
    },
    {
      "Dział": "Logistyka",
      "Staż": "5+ lat",
      "Polecił(a)bym firmę jako miejsce pracy": "4",
      "Przełożony wspiera mnie w pracy": "3",
      "Komunikacja w firmie jest skuteczna": "3",
      "Mam jasną ścieżkę rozwoju": "2",
      "Obciążenie pracą jest rozsądne": "2",
      "Współpraca między działami działa dobrze": "4",
      "Co działa dobrze?": "Ludzie z działu potrafią się dogadać mimo presji.",
      "Co najbardziej przeszkadza?": "Za dużo pracy wpada jako pilne, bez jasnego priorytetu."
    },
    {
      "Dział": "Biuro",
      "Staż": "5+ lat",
      "Polecił(a)bym firmę jako miejsce pracy": "7",
      "Przełożony wspiera mnie w pracy": "4",
      "Komunikacja w firmie jest skuteczna": "4",
      "Mam jasną ścieżkę rozwoju": "3",
      "Obciążenie pracą jest rozsądne": "4",
      "Współpraca między działami działa dobrze": "4",
      "Co działa dobrze?": "Procesy są coraz lepiej opisane i nowe osoby szybciej się wdrażają.",
      "Co najbardziej przeszkadza?": "Część narzędzi nadal wymaga pracy ręcznej w Excelu."
    },
    {
      "Dział": "Produkcja",
      "Staż": "1-3 lata",
      "Polecił(a)bym firmę jako miejsce pracy": "5",
      "Przełożony wspiera mnie w pracy": "3",
      "Komunikacja w firmie jest skuteczna": "2",
      "Mam jasną ścieżkę rozwoju": "2",
      "Obciążenie pracą jest rozsądne": "2",
      "Współpraca między działami działa dobrze": "3",
      "Co działa dobrze?": "Bezpośredni lider stara się pomagać.",
      "Co najbardziej przeszkadza?": "Po odejściu Anny nikt realnie nie przejął komunikacji między zmianami."
    },
    {
      "Dział": "Sprzedaż",
      "Staż": "3-5 lat",
      "Polecił(a)bym firmę jako miejsce pracy": "7",
      "Przełożony wspiera mnie w pracy": "4",
      "Komunikacja w firmie jest skuteczna": "3",
      "Mam jasną ścieżkę rozwoju": "3",
      "Obciążenie pracą jest rozsądne": "2",
      "Współpraca między działami działa dobrze": "3",
      "Co działa dobrze?": "Klienci doceniają szybkość reakcji zespołu.",
      "Co najbardziej przeszkadza?": "Kanały sprzedaży mają sprzeczne priorytety i każdy ciągnie w swoją stronę."
    },
    {
      "Dział": "HR",
      "Staż": "1-3 lata",
      "Polecił(a)bym firmę jako miejsce pracy": "9",
      "Przełożony wspiera mnie w pracy": "5",
      "Komunikacja w firmie jest skuteczna": "4",
      "Mam jasną ścieżkę rozwoju": "4",
      "Obciążenie pracą jest rozsądne": "4",
      "Współpraca między działami działa dobrze": "4",
      "Co działa dobrze?": "Widać realne zainteresowanie badaniem i planem działań.",
      "Co najbardziej przeszkadza?": "Potrzebujemy lepszego systemu do raportowania wyników ankiet."
    }
  ]
};
