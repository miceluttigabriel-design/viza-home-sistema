# ============================================================================
# Task 121 (pedido del dueño): retirar el botón "IMPORTAR FABRICANTES, MARCAS,
# GRUPO Y MODELO" de la Base. El dueño dijo que ya no es necesario.
#
# Qué elimina (SOLO del panel de administración, admin-panel.tsx):
#   1. El bloque de estado del importador (fabImportOpen/Loading/Preview/
#      Applying/Result + fabFileInputRef + fabRowsRef).
#   2. Los handlers handleFabricanteFile y handleFabricanteApply.
#   3. El botón + su input de archivo oculto.
#   4. El modal completo de vista previa / aplicar.
#   5. Re-wording mínimo de 2 comentarios de campo que mencionaban el botón.
#
# Qué NO toca:
#   - Las rutas API /api/products/import-fabricante/{preview,apply} quedan
#     intactas (backend sin UI: nadie las dispara, no corren solas).
#   - Las columnas FABRICANTE/MARCA/GRUPO/MODELO y todo lo demás.
# ============================================================================
from pathlib import Path

F = Path("src/components/viza/admin-panel.tsx")
lines = F.read_text(encoding="utf-8").splitlines(keepends=True)

def find(sub: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"NO ENCONTRADO: {sub!r}")

def expect(i: int, sub: str) -> None:
    if sub not in lines[i]:
        raise SystemExit(f"ASSERT en línea {i+1}: esperaba {sub!r}, hay {lines[i]!r}")

# ── BLOQUE A: estado del importador ─────────────────────────────────────────
a0 = find('// ─── IMPORTAR FABRICANTES, MARCAS, GRUPO Y MODELO (planilla LISTA VIZA HOME, hoja "base") ───')
a1 = find("const fabRowsRef", a0)
expect(a1 + 1, "")  # línea en blanco después del ref
expect(a0 - 1, "")  # blanco antes
del lines[a0 : a1 + 2]

# ── BLOQUE B: handlers (comentario + handleFabricanteFile + handleFabricanteApply) ──
b0 = find("// ─── IMPORTAR FABRICANTES, MARCAS, GRUPO Y MODELO: procesar el Excel EN EL NAVEGADOR ───")
expect(b0 - 1, "")          # blanco antes (cierra el handler de márgenes)
b1 = find("// ─── IMPORTAR VALOR + % ADD: procesar el Excel EN EL NAVEGADOR ───", b0)
expect(b1 - 1, "")          # blanco entre apply y el comentario del siguiente
del lines[b0 : b1 - 1]      # deja el blanco previo al comentario del siguiente

# ── BLOQUE C: botón + input oculto ──────────────────────────────────────────
c0 = find("{/* Boton IMPORTAR FABRICANTES, MARCAS, GRUPO Y MODELO (planilla LISTA VIZA HOME) — solo supremo_admin */}")
expect(c0 - 1, "")          # blanco antes
c1 = find("{/* Boton IMPORTAR VALOR ADD (planilla LISTA VIZA HOME) — solo supremo_admin */}", c0)
expect(c1 - 1, "")          # blanco antes del comentario siguiente
del lines[c0 : c1 - 1]

# ── BLOQUE D: modal completo (comentario ════ + {fabImportOpen && (...)}) ───
d0 = find("MODAL: IMPORTAR FABRICANTES") - 1  # la línea ════ que abre el comentario
expect(d0, "════")            # empieza con la línea de ════
d1 = find("MODAL: IMPORTAR VALOR + % ADD + SAFRA", d0) - 1  # su línea ════
expect(d1, "════")
del lines[d0 : d1 - 1]        # deja los blancos previos al comentario del VALOR ADD

texto = "".join(lines)

# ── Comentarios de campo (GRUPO y MARCA) que mencionaban el botón ───────────
viejo1 = (
    "Se muestra (como GRUPO) y es editable en esta tabla; el botón\n"
    "  // IMPORTAR FABRICANTES, MARCAS, GRUPO Y MODELO la llena desde la planilla."
)
nuevo1 = (
    "Se muestra (como GRUPO) y es editable en esta tabla; la planilla\n"
    "  // LISTA VIZA HOME la llena (el botón IMPORTAR FABRICANTES fue retirado\n"
    "  // del panel a pedido del dueño, Task 121)."
)
viejo2 = (
    "MARCA es la columna MARCA del Excel: el botón\n"
    "  // IMPORTAR FABRICANTES, MARCAS, GRUPO Y MODELO escribe aquí las marcas de\n"
    "  // la planilla."
)
nuevo2 = (
    "MARCA es la columna MARCA del Excel (el botón IMPORTAR FABRICANTES\n"
    "  // que la escribía fue retirado del panel a pedido del dueño, Task 121)."
)
assert viejo1 in texto, "comentario GRUPO no encontrado"
assert viejo2 in texto, "comentario MARCA no encontrado"
texto = texto.replace(viejo1, nuevo1).replace(viejo2, nuevo2)

F.write_text(texto, encoding="utf-8")

# ── Verificación ────────────────────────────────────────────────────────────
resto = [l for l in texto.splitlines() if any(k in l for k in ("fabImport", "fabRowsRef", "fabFileInputRef", "handleFabricante", "IMPORTAR FABRICANTES"))]
print("líneas restantes con referencias al importador:", len(resto))
for l in resto:
    print("  RESTO:", l.strip()[:100])
print("OK — admin-panel.tsx reescrito")
