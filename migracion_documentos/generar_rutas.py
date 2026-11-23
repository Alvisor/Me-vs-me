#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_rutas.py  -  Construye el archivo de rutas que consume copiar_archivos.py

Entrada : archivo de consulta (p. ej. rutas_destino.csv / .xlsx) con columnas
          Ruta, NombreArchivo, Caso, SCODIGO, TipoDocumento  (RutaDestino es opcional)
Salida  : Rutas_migracion.csv con columnas
          Origen, Destino, NombreArchivo, Caso, SCODIGO, TipoDocumento,
          NombreOriginal, Sufijo, FilaEntrada

Estructura del destino:  <codigo estudiante>/<caso>/<tipo de documento>/<archivo>

Repetidos: si dos filas distintas caen en el mismo destino (sin distinguir
mayusculas/minusculas, como en Windows) la primera conserva el nombre y las
demas reciben _1, _2, ...  antes de la extension.  El orden dentro de cada grupo
se decide por la ruta de origen (no por el orden de las filas), asi el resultado
es el mismo aunque el archivo de entrada venga reordenado.

Nunca borra ni modifica la entrada. Todo lo que se excluye queda en
rutas_excluidas.csv con su motivo.
"""
import argparse
import csv
import io
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

VERSION = "2.0"

ILEGALES = '<>:"/\\|?*'
RESERVADOS = {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}
MAX_INTENTOS_SUFIJO = 100000   # tope duro: el bucle de sufijos nunca puede ser infinito

ALIAS = {
    "ruta": {"ruta", "rutaorigen", "origen"},
    "nombre": {"nombrearchivo", "nombredelarchivo", "nombrearchivooriginal"},
    "caso": {"caso", "numeroradicacion", "radicacion"},
    "codigo": {"scodigo", "codigoestudiante", "codigo"},
    "tipo": {"tipodocumento", "tipodedocumento", "carpeta", "tipo"},
    "rutadestino": {"rutadestino"},
}


# ----------------------------------------------------------------- utilidades
def squeeze(s):
    return re.sub(r"[\s_\-]+", "", unicodedata.normalize("NFC", str(s)).strip().lower())


def clave(texto):
    """Clave de comparacion de rutas: NFC + sin distinguir mayusculas (Windows)."""
    return unicodedata.normalize("NFC", texto).casefold()


def partes(p):
    p = str(p).replace("\\", "/")
    return [x for x in p.split("/") if x.strip() not in ("", ".")]


def celda(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def leer_tabla(ruta):
    ext = os.path.splitext(ruta)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError:
            sys.exit("ERROR: para leer .xlsx hace falta 'pip install openpyxl'. "
                     "Alternativa: exporte la hoja a CSV (UTF-8) y use el .csv.")
        wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        filas = [[celda(v) for v in r] for r in ws.iter_rows(values_only=True)]
        wb.close()
        return filas
    crudo = open(ruta, "rb").read()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            texto = crudo.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    primera = texto.split("\n", 1)[0]
    delim = max((",", ";", "\t"), key=primera.count)
    return [[celda(c) for c in r] for r in csv.reader(io.StringIO(texto), delimiter=delim)]


def limpiar_componente(s):
    """Quita lo que Windows no admite en un nombre. Devuelve (texto, cambio?)"""
    original = s
    s = unicodedata.normalize("NFC", str(s))
    s = "".join("_" if (c in ILEGALES or ord(c) < 32 or c == "\ufffd") else c for c in s)
    s = s.rstrip(" .")                      # Windows no admite espacio/punto FINAL (el punto inicial si: ".pdf")
    if not s:
        s = "_"
    stem = s.split(".")[0].upper()
    if stem in RESERVADOS:
        s = "_" + s
    return s, s != original


def dividir_ext(nombre):
    stem, ext = os.path.splitext(nombre)
    if not ext and nombre.startswith(".") and nombre.count(".") == 1:
        return "", nombre                   # ".pdf" -> el sufijo va antes: "_1.pdf" (no ".pdf_1")
    return stem, ext


# ----------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description="Genera el archivo de rutas para copiar_archivos.py")
    ap.add_argument("--entrada", required=True, help="archivo de consulta (.csv o .xlsx)")
    ap.add_argument("--salida", default="Rutas_migracion.csv", help="archivo de rutas a generar (.csv)")
    ap.add_argument("--xlsx", action="store_true", help="ademas escribir una copia .xlsx")
    ap.add_argument("--carpeta-sin-codigo", default="Otros",
                    help="carpeta de primer nivel para los archivos SIN codigo de estudiante: "
                         "Otros/<caso>/<tipo>/ (o Otros/SIN_CASO/<tipo>/ si tampoco hay caso). "
                         "Pase '' para excluirlos en vez de incluirlos")
    ap.add_argument("--largo-aviso", type=int, default=200,
                    help="avisar cuantos destinos relativos superan este largo (por defecto 200)")
    ap.add_argument("--version", action="version", version=VERSION)
    a = ap.parse_args(argv)
    for flujo in (sys.stdout, sys.stderr):      # la consola de Windows (cp1252/cp437) no puede mostrar todos los nombres:
        try:                                    # sin esto un print() con un caracter raro tumbaria la corrida a la mitad
            flujo.reconfigure(errors="replace")
        except Exception:                       # noqa: BLE001
            pass

    t0 = datetime.now()
    carpeta_salida = os.path.dirname(os.path.abspath(a.salida))
    os.makedirs(carpeta_salida, exist_ok=True)
    base = os.path.splitext(os.path.abspath(a.salida))[0]

    print(f"[generar_rutas {VERSION}] leyendo {a.entrada} ...")
    tabla = leer_tabla(a.entrada)
    if len(tabla) < 2:
        sys.exit("ERROR: el archivo de entrada no tiene filas de datos")
    enc = tabla[0]
    idx = {}
    for i, h in enumerate(enc):
        for k, nombres in ALIAS.items():
            if squeeze(h) in nombres and k not in idx:
                idx[k] = i
    faltan = [k for k in ("ruta", "nombre") if k not in idx]
    if faltan:
        sys.exit(f"ERROR: faltan columnas obligatorias {faltan}. Encabezados encontrados: {enc}")
    usa_rutadestino = not all(k in idx for k in ("caso", "codigo", "tipo"))
    if usa_rutadestino and "rutadestino" not in idx:
        sys.exit("ERROR: se necesitan Caso, SCODIGO y TipoDocumento (o al menos RutaDestino) en la entrada")
    if usa_rutadestino:
        print("AVISO: no hay columnas Caso/SCODIGO/TipoDocumento; se deduce todo de RutaDestino")

    def get(fila, k):
        i = idx.get(k)
        return fila[i] if i is not None and i < len(fila) else ""

    # ---------------------------------------------------------- 1. normalizar
    validas = []      # dicts
    excluidas = []    # (fila, motivo, origen, nombre, detalle)
    vistos_exactos = {}
    sanitizados = 0
    for n, fila in enumerate(tabla[1:], start=2):
        if not any(fila):
            continue
        ruta, nombre = get(fila, "ruta"), get(fila, "nombre")
        if usa_rutadestino:
            pd = partes(get(fila, "rutadestino"))
            if len(pd) < 4:
                excluidas.append((n, "RUTADESTINO_INCOMPLETA", ruta, nombre, get(fila, "rutadestino")))
                continue
            codigo, caso, tipo = pd[0], pd[1], pd[2]
        else:
            codigo, caso, tipo = get(fila, "codigo"), get(fila, "caso"), get(fila, "tipo")
        if not ruta:
            excluidas.append((n, "SIN_RUTA", ruta, nombre, "")); continue
        if not nombre:
            excluidas.append((n, "SIN_NOMBRE", ruta, nombre, "")); continue
        obs = ""
        if not codigo:
            if not a.carpeta_sin_codigo:
                excluidas.append((n, "SIN_CODIGO_ESTUDIANTE", ruta, nombre, "")); continue
            codigo = a.carpeta_sin_codigo
            obs = "SIN_CODIGO"
            if not caso:
                caso, obs = "SIN_CASO", "SIN_CODIGO_NI_CASO"
        if not caso:
            excluidas.append((n, "SIN_CASO", ruta, nombre, "")); continue
        if not tipo:
            excluidas.append((n, "SIN_TIPO_DOCUMENTO", ruta, nombre, "")); continue
        pr = partes(ruta)
        if ".." in pr or re.match(r"^[A-Za-z]:$", pr[0] if pr else "") or str(ruta).startswith(("/", "\\")):
            excluidas.append((n, "RUTA_ORIGEN_INVALIDA", ruta, nombre, "ruta absoluta o con ..")); continue
        if "/" in nombre or "\\" in nombre or nombre in (".", ".."):
            excluidas.append((n, "NOMBRE_INVALIDO", ruta, nombre, "contiene separadores")); continue
        c1, k1 = limpiar_componente(codigo)
        c2, k2 = limpiar_componente(caso)
        c3, k3 = limpiar_componente(tipo)
        nom, k4 = limpiar_componente(nombre)
        if k1 or k2 or k3 or k4:
            sanitizados += 1
        origen = "/".join(pr + [nombre])
        dest_dir = f"{c1}/{c2}/{c3}"
        # duplicado exacto: mismo archivo de origen hacia el mismo destino
        kex = (clave(origen), clave(dest_dir + "/" + nom))
        if kex in vistos_exactos:
            excluidas.append((n, "DUPLICADO_EXACTO", origen, nombre, f"igual a la fila {vistos_exactos[kex]}"))
            continue
        vistos_exactos[kex] = n
        validas.append(dict(fila=n, origen=origen, dir=dest_dir, nombre=nom, original=nombre,
                            limpio=nom, caso=c2, codigo=c1, tipo=c3, cambio=(k1 or k2 or k3 or k4),
                            rd=get(fila, "rutadestino"), sufijo="", obs=obs))

    # ------------------------------------------------- 2. repetidos -> _1, _2
    grupos = defaultdict(list)
    for r in validas:
        r["key"] = clave(r["dir"] + "/" + r["nombre"])
        grupos[r["key"]].append(r)
    reservados = set(grupos.keys())            # todos los nombres "reales" quedan reservados
    usados = set(reservados)
    renombrados = []
    max_sufijo = 0
    for k, lista in grupos.items():
        if len(lista) == 1:
            continue
        lista.sort(key=lambda r: (clave(r["origen"]), r["fila"]))
        for r in lista[1:]:
            stem, ext = dividir_ext(r["nombre"])
            for nsuf in range(1, MAX_INTENTOS_SUFIJO + 1):
                cand = f"{stem}_{nsuf}{ext}"
                kc = clave(r["dir"] + "/" + cand)
                if kc not in usados:
                    usados.add(kc)
                    renombrados.append((r["fila"], r["origen"], r["dir"], r["nombre"], cand))
                    r["nombre"], r["sufijo"], r["key"] = cand, f"_{nsuf}", kc
                    max_sufijo = max(max_sufijo, nsuf)
                    break
            else:
                sys.exit(f"ERROR: no se encontro nombre libre para {r['origen']} (>{MAX_INTENTOS_SUFIJO} intentos)")

    # --------------------------------------------------- 3. validacion interna
    claves = [r["key"] for r in validas]
    if len(claves) != len(set(claves)):
        sys.exit("ERROR INTERNO: quedaron destinos repetidos tras asignar sufijos")

    # --------------------------------------------------------------- 4. salida
    encab = ["Origen", "Destino", "NombreArchivo", "Caso", "SCODIGO", "TipoDocumento",
             "NombreOriginal", "Sufijo", "FilaEntrada", "Observacion"]
    filas_out = [[r["origen"], r["dir"] + "/", r["nombre"], r["caso"], r["codigo"], r["tipo"],
                  r["original"], r["sufijo"], r["fila"], r["obs"]] for r in validas]
    with open(a.salida, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(encab)
        w.writerows(filas_out)
    if a.xlsx:
        import openpyxl
        wb = openpyxl.Workbook(write_only=True)
        ws = wb.create_sheet("Rutas")
        ws.append(encab)
        for fo in filas_out:
            ws.append(fo)
        wb.save(base + ".xlsx")
    with open(base + "_excluidas.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["FilaEntrada", "Motivo", "Origen", "NombreArchivo", "Detalle"])
        w.writerows(excluidas)
    with open(base + "_renombrados.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["FilaEntrada", "Origen", "Destino", "NombreAntes", "NombreDespues"])
        w.writerows(renombrados)

    # --------------------------------------------------------- 5. verificacion
    # releer lo escrito y comprobar unicidad de destinos con la misma regla que usa el robot
    rel = leer_tabla(a.salida)
    claves_rel = [clave(r[1].rstrip("/") + "/" + r[2]) for r in rel[1:]]
    ok = (len(claves_rel) == len(validas)) and len(claves_rel) == len(set(claves_rel))

    por_motivo = defaultdict(int)
    for e in excluidas:
        por_motivo[e[1]] += 1
    largos = [len(r["dir"]) + 1 + len(r["nombre"]) for r in validas]
    largo_max = max(largos) if largos else 0
    sobre = sum(1 for x in largos if x > a.largo_aviso)
    # RutaDestino que traia la consulta vs. el calculado (antes de agregar _#, ya con caracteres corregidos)
    difieren = [r for r in validas if r["rd"] and
                clave("/".join(partes(r["rd"]))) != clave(r["dir"] + "/" + r["limpio"])]
    con_ffffd = sum(1 for r in validas if "�" in r["origen"])
    grupos_dup = sum(1 for l in grupos.values() if len(l) > 1)
    lineas = [
        f"generar_rutas {VERSION}  -  {t0:%Y-%m-%d %H:%M:%S}",
        f"Entrada ............................ {a.entrada}",
        f"Filas leidas ....................... {len(tabla) - 1}",
        f"Filas en el archivo de rutas ....... {len(validas)}   -> {a.salida}",
        f"Filas excluidas .................... {len(excluidas)}   -> {base}_excluidas.csv",
    ] + [f"    {k:<28} {v}" for k, v in sorted(por_motivo.items())] + [
        f"Incluidos en '{a.carpeta_sin_codigo}' (sin codigo de estudiante) .. {sum(1 for r in validas if r['obs'])}"
        f"   (con caso: {sum(1 for r in validas if r['obs'] == 'SIN_CODIGO')}, "
        f"sin caso: {sum(1 for r in validas if r['obs'] == 'SIN_CODIGO_NI_CASO')})" if a.carpeta_sin_codigo else
        "Sin codigo de estudiante: EXCLUIDOS (ver motivos arriba)",
        f"Destinos repetidos (grupos) ........ {grupos_dup}",
        f"Archivos renombrados con _# ........ {len(renombrados)}   -> {base}_renombrados.csv",
        f"Sufijo maximo usado ................ _{max_sufijo}" if max_sufijo else "Sufijo maximo usado ................ (ninguno)",
        f"Nombres con caracteres corregidos .. {sanitizados}",
        f"Largo maximo destino relativo ...... {largo_max}   (aviso: {sobre} sobre {a.largo_aviso})",
        f"Filas cuyo RutaDestino original difiere del calculado: {len(difieren)}",
    ]
    for r in difieren[:10]:
        lineas.append(f"    fila {r['fila']}: entrada='{r['rd']!r}'  calculado='{r['dir']}/{r['limpio']}'")
    lineas.append(f"Nombres de ORIGEN con caracter danado (U+FFFD, probable error de codificacion en la consulta): {con_ffffd}"
                  + ("   <- el robot busca en la carpeta UN archivo que calce; si no hay uno unico, los reporta como ERROR_ORIGEN_NO_EXISTE" if con_ffffd else ""))
    lineas.append(f"VERIFICACION destinos unicos (insensible a mayusculas): {'OK' if ok else 'FALLO'}")
    lineas.append(f"Duracion: {(datetime.now() - t0).total_seconds():.1f} s")
    texto = "\n".join(lineas)
    with open(base + "_reporte.txt", "w", encoding="utf-8") as f:
        f.write(texto + "\n")
    print(texto)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
