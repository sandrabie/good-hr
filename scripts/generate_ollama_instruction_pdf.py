from pathlib import Path

import fitz

OUT = Path("docs/instrukcja-ollama-goodhr.pdf")
REGULAR = r"C:\Windows\Fonts\arial.ttf"
BOLD = r"C:\Windows\Fonts\arialbd.ttf"
ITALIC = r"C:\Windows\Fonts\ariali.ttf"

PAGE_W, PAGE_H = fitz.paper_size("a4")
MARGIN_X = 52
TOP = 48
BOTTOM = 54
CONTENT_W = PAGE_W - 2 * MARGIN_X

COLORS = {
    "ink": (0.10, 0.14, 0.17),
    "muted": (0.36, 0.42, 0.47),
    "teal": (0.08, 0.48, 0.43),
    "teal_soft": (0.88, 0.95, 0.93),
    "blue": (0.17, 0.37, 0.56),
    "line": (0.82, 0.86, 0.88),
    "soft": (0.96, 0.97, 0.97),
    "warn": (0.74, 0.45, 0.07),
}

font_regular = fitz.Font(fontfile=REGULAR)
font_bold = fitz.Font(fontfile=BOLD)
font_italic = fitz.Font(fontfile=ITALIC)

doc = fitz.open()
page = None
y = TOP


def install_fonts(target_page):
    target_page.insert_font(fontname="Arial", fontfile=REGULAR)
    target_page.insert_font(fontname="Arial-Bold", fontfile=BOLD)
    target_page.insert_font(fontname="Arial-Italic", fontfile=ITALIC)


def new_page():
    global page, y
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    install_fonts(page)
    y = TOP


def ensure(space):
    if page is None:
        new_page()
    elif y + space > PAGE_H - BOTTOM:
        new_page()


def text_width(text, size=10, bold=False, italic=False):
    font = font_bold if bold else font_italic if italic else font_regular
    return font.text_length(str(text), size)


def wrap(text, size=10, width=CONTENT_W, bold=False, italic=False):
    lines = []
    for para in str(text).replace("\r", "").split("\n"):
        if not para.strip():
            lines.append("")
            continue
        current = ""
        for word in para.split():
            candidate = word if not current else current + " " + word
            if text_width(candidate, size, bold, italic) <= width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def draw_text(text, x, y_pos, size=10, color=None, bold=False, italic=False):
    fontname = "Arial-Bold" if bold else "Arial-Italic" if italic else "Arial"
    page.insert_text((x, y_pos), str(text), fontsize=size, fontname=fontname, color=color or COLORS["ink"])


def add_title(title, subtitle):
    global y
    ensure(150)
    page.draw_rect(fitz.Rect(0, 0, PAGE_W, 150), color=None, fill=COLORS["teal_soft"])
    draw_text("GoodHR Workbench", MARGIN_X, 54, size=11, color=COLORS["teal"], bold=True)
    draw_text(title, MARGIN_X, 90, size=25, color=COLORS["ink"], bold=True)
    subtitle_y = 120
    for line in wrap(subtitle, size=11, width=CONTENT_W - 20):
        draw_text(line, MARGIN_X, subtitle_y, size=11, color=COLORS["muted"])
        subtitle_y += 15
    y = 178


def add_heading(text):
    global y
    ensure(44)
    y += 10
    draw_text(text, MARGIN_X, y, size=15, color=COLORS["blue"], bold=True)
    y += 22
    page.draw_line((MARGIN_X, y), (MARGIN_X + CONTENT_W, y), color=COLORS["line"], width=0.8)
    y += 16


def add_subheading(text):
    global y
    ensure(38)
    y += 6
    draw_text(text, MARGIN_X, y, size=12, color=COLORS["ink"], bold=True)
    y += 22


def add_paragraph(text, size=10, color=None, gap=8):
    global y
    lines = wrap(text, size=size, width=CONTENT_W)
    ensure(len(lines) * (size + 4) + gap)
    for line in lines:
        if not line:
            y += size + 2
            continue
        draw_text(line, MARGIN_X, y, size=size, color=color or COLORS["ink"])
        y += size + 4
    y += gap


def add_bullets(items, size=10):
    global y
    for item in items:
        lines = wrap(item, size=size, width=CONTENT_W - 22)
        ensure(len(lines) * (size + 4) + 8)
        draw_text("•", MARGIN_X + 2, y, size=size, color=COLORS["teal"], bold=True)
        for line in lines:
            draw_text(line, MARGIN_X + 20, y, size=size, color=COLORS["ink"])
            y += size + 4
        y += 4
    y += 4


def add_steps(items):
    global y
    for idx, (title, text) in enumerate(items, 1):
        lines = wrap(text, size=10, width=CONTENT_W - 44)
        ensure(max(36, len(lines) * 14 + 18))
        page.draw_circle((MARGIN_X + 13, y - 4), 12, color=COLORS["teal"], fill=COLORS["teal"])
        draw_text(str(idx), MARGIN_X + 9, y, size=10, color=(1, 1, 1), bold=True)
        draw_text(title, MARGIN_X + 36, y, size=11, color=COLORS["ink"], bold=True)
        y += 15
        for line in lines:
            draw_text(line, MARGIN_X + 36, y, size=10, color=COLORS["ink"])
            y += 14
        y += 10


def add_code(text):
    global y
    lines = []
    for raw in str(text).strip("\n").split("\n"):
        lines.extend(wrap(raw, size=9, width=CONTENT_W - 24))
    height = len(lines) * 13 + 20
    ensure(height + 24)
    rect = fitz.Rect(MARGIN_X, y - 8, MARGIN_X + CONTENT_W, y + height - 8)
    page.draw_rect(rect, color=COLORS["line"], fill=COLORS["soft"], width=0.7)
    y += 8
    for line in lines:
        draw_text(line, MARGIN_X + 12, y, size=9, color=COLORS["ink"])
        y += 13
    y += 26


def add_note(title, text, tone="teal"):
    global y
    lines = wrap(text, size=10, width=CONTENT_W - 24)
    height = len(lines) * 14 + 42
    ensure(height + 10)
    fill = (0.91, 0.97, 0.95) if tone == "teal" else (1.0, 0.96, 0.88)
    border = COLORS["teal"] if tone == "teal" else COLORS["warn"]
    rect = fitz.Rect(MARGIN_X, y - 6, MARGIN_X + CONTENT_W, y + height - 6)
    page.draw_rect(rect, color=border, fill=fill, width=0.9)
    draw_text(title, MARGIN_X + 12, y + 10, size=11, color=border, bold=True)
    y += 30
    for line in lines:
        draw_text(line, MARGIN_X + 12, y, size=10, color=COLORS["ink"])
        y += 14
    y += 18


new_page()
add_title(
    "Jak uruchomić lokalnie AI",
    "Krótka instrukcja dla użytkownika GoodHR Workbench, aby korzystać z pełniejszych podsumowań AI bez płatnego API.",
)

add_note(
    "Po co to jest?",
    "Ollama uruchamia model językowy lokalnie na komputerze użytkownika. Dzięki temu aplikacja GoodHR może generować dłuższe podsumowania odpowiedzi ankietowych bez wysyłania treści do płatnego modelu online.",
)

add_heading("1. Instalacja Ollamy")
add_steps(
    [
        ("Pobierz instalator", "Wejdź na https://ollama.com/download i pobierz wersję dla swojego systemu."),
        ("Zainstaluj program", "Uruchom instalator. Na Windows Ollama działa jako aplikacja w tle, a komenda ollama jest dostępna w PowerShell lub cmd."),
        ("Sprawdź instalację", "Otwórz PowerShell i wpisz komendę poniżej."),
    ]
)
add_code("ollama --version")

add_heading("2. Pobranie modelu")
add_paragraph("W aplikacji GoodHR domyślnie używany jest model gemma3. Pobierz go jedną komendą:")
add_code("ollama pull gemma3")
add_paragraph("Jeśli komputer działa wolno albo ma mało pamięci, użyj lżejszej wersji:")
add_code("ollama pull gemma3:1b")
add_note("Ważne", "Jeśli pobierzesz model gemma3:1b, wpisz dokładnie gemma3:1b w polu Model lokalny w aplikacji GoodHR.", tone="amber")

add_heading("3. Test działania")
add_paragraph("Po pobraniu modelu sprawdź, czy odpowiada lokalnie:")
add_code("ollama run gemma3")

add_heading("4. Dodanie dozwolonych źródeł w Windows")
add_paragraph("GoodHR działa w przeglądarce, a lokalna Ollama działa na Twoim komputerze. Żeby przeglądarka mogła połączyć się z lokalnym modelem, dodaj zmienną użytkownika Windows o nazwie OLLAMA_ORIGINS.")
add_subheading("Sposób najszybszy: PowerShell")
add_steps(
    [
        ("Otwórz PowerShell", "Kliknij Start, wpisz PowerShell i uruchom zwykłe okno PowerShell."),
        ("Wklej komendę", "Skopiuj poniższą komendę, wklej ją w PowerShell i zatwierdź Enterem."),
    ]
)
add_code('[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://goodhr-workbench.vercel.app,http://127.0.0.1:4173,http://localhost:4173", "User")')
add_subheading("Sposób ręczny: ustawienia Windows")
add_steps(
    [
        ("Otwórz zmienne środowiskowe", "W menu Start wyszukaj: zmienne środowiskowe. Wybierz opcję edycji zmiennych środowiskowych dla konta użytkownika."),
        ("Dodaj zmienną użytkownika", "Kliknij Nowa albo Edytuj. Nazwa zmiennej: OLLAMA_ORIGINS."),
        ("Wklej wartość", "W polu wartości wpisz: https://goodhr-workbench.vercel.app,http://127.0.0.1:4173,http://localhost:4173"),
        ("Zapisz i uruchom ponownie Ollamę", "Zatwierdź OK. Jeśli Ollama jest uruchomiona, zamknij ją z ikonki przy zegarze Windows i uruchom ponownie z menu Start."),
    ]
)
add_bullets(
    [
        "W aplikacji wpisz Adres Ollama: http://localhost:11434 i Model lokalny: gemma3.",
        "Jeśli pobrano model gemma3:1b, w polu Model lokalny wpisz gemma3:1b.",
    ]
)

add_heading("5. Korzystanie w GoodHR")
add_steps(
    [
        ("Wejdź do zakładki Wyniki", "Wybierz ankietę oraz pytanie lub obszar, który ma zostać podsumowany."),
        ("Sprawdź ustawienia modelu", "Adres Ollama powinien mieć wartość http://localhost:11434, a model np. gemma3."),
        ("Kliknij przycisk", "Użyj przycisku Wygeneruj przez Ollama przy pełniejszym podsumowaniu modelu."),
        ("Poczekaj", "Pierwsza odpowiedź może trwać dłużej, bo model musi załadować się do pamięci komputera."),
    ]
)

add_heading("6. Gdy coś nie działa")
add_bullets(
    [
        "Komunikat Nie udało się połączyć z lokalną Ollama: upewnij się, że Ollama jest uruchomiona.",
        "Komenda ollama nie jest rozpoznawana: zamknij i otwórz PowerShell ponownie albo uruchom instalator Ollamy jeszcze raz.",
        "Model nie istnieje: wpisz ollama pull gemma3 lub ustaw w aplikacji nazwę pobranego modelu.",
        "GoodHR nie łączy się z Ollamą: sprawdź zmienną OLLAMA_ORIGINS i uruchom Ollamę ponownie.",
        "Odpowiedzi są bardzo wolne: użyj modelu gemma3:1b albo zamknij inne obciążające programy.",
    ]
)

for i, target_page in enumerate(doc, 1):
    install_fonts(target_page)
    target_page.draw_line((MARGIN_X, PAGE_H - 38), (MARGIN_X + CONTENT_W, PAGE_H - 38), color=COLORS["line"], width=0.6)
    target_page.insert_text((MARGIN_X, PAGE_H - 22), "GoodHR Workbench - instrukcja lokalnego AI", fontsize=8.5, fontname="Arial", color=COLORS["muted"])
    target_page.insert_text((PAGE_W - MARGIN_X - 50, PAGE_H - 22), f"strona {i}", fontsize=8.5, fontname="Arial", color=COLORS["muted"])

OUT.parent.mkdir(parents=True, exist_ok=True)
if OUT.exists():
    OUT.unlink()
doc.save(OUT, deflate=True, garbage=4)
doc.close()
print(OUT.resolve())
