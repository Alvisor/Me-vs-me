#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
copiar_archivos.py  -  Robot de copia  (reconstruccion de CopiarArchivos, v2)

Lee el archivo de rutas generado por generar_rutas.py y copia cada documento a
<destino-base>/<codigo estudiante>/<caso>/<tipo de documento>/<archivo>.

Principios (aprendidos de las pruebas de 2023):
  * SECUENCIAL. Sin hilos: no hay condiciones de carrera ni carpetas creadas "dos veces".
  * NUNCA SOBRESCRIBE. Si el destino ya existe con el mismo tamano lo omite (se puede
    volver a ejecutar sin riesgo); si existe distinto, lo reporta como conflicto y sigue.
  * Un error en una fila NO detiene el proceso: se registra y se continua.
  * Copia a "<archivo>.part" y solo al verificar el tamano lo renombra: una interrupcion
    nunca deja un archivo a medias que parezca completo.
  * Antes de copiar valida que el archivo de rutas no tenga destinos repetidos
    (sin distinguir mayusculas); si los hay, aborta sin copiar nada.
  * Evidencia: log de texto + CSV con el resultado de CADA fila + resumen final.
  * No modifica el archivo de rutas de entrada.

Codigos de salida: 0 ok | 1 termino con errores en filas | 2 archivo de rutas invalido
                   3 abortado por errores de E/S seguidos | 130 interrumpido (Ctrl+C)
"""
import argparse
import csv
import getpass
import hashlib
import io
import os
import platform
import re
import shutil
import socket
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime

VERSION = "2.0"

ALIAS = {
    "origen": {"origen", "rutaorigen"},
    "destino": {"destino", "directoriodestino", "carpetadestino"},
    "nombre": {"nombrearchivo", "nombredelarchivo", "nuevonombre", "nombrenuevo"},
}
ERRORES_ES = {"ERROR_COPIA", "ERROR_CARPETA"}      # los que cuentan para el corte por errores seguidos


# ---------------------------------------------------------------- utilidades
def squeeze(s):
    return re.sub(r"[\s_\-]+", "", unicodedata.normalize("NFC", str(s)).strip().lower())


def clave(texto):
    return unicodedata.normalize("NFC", texto).casefold()


def celda(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def partes(p):
    return [x for x in str(p).replace("\\", "/").split("/") if x.strip() not in ("", ".")]


def ruta_os(p):
    """En Windows usa el prefijo \\\\?\\ para rutas de mas de 260 caracteres."""
    if os.name == "nt":
        p = os.path.abspath(p)
        if not p.startswith("\\\\?\\"):
            p = "\\\\?\\UNC\\" + p[2:] if p.startswith("\\\\") else "\\\\?\\" + p
    return p


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta_os(ruta), "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


def hms(seg):
    seg = int(seg)
    return f"{seg // 3600:02d}:{seg % 3600 // 60:02d}:{seg % 60:02d}"


def leer_tabla(ruta):
    ext = os.path.splitext(ruta)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError:
            sys.exit("ERROR: para leer .xlsx hace falta 'pip install openpyxl' (o use el .csv)")
        wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
        filas = [[celda(v) for v in r] for r in wb.worksheets[0].iter_rows(values_only=True)]
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


# ------------------------------------------------------- carga y validacion
def cargar_rutas(ruta_archivo):
    tabla = leer_tabla(ruta_archivo)
    if len(tabla) < 2:
        sys.exit("ERROR: el archivo de rutas no tiene filas de datos")
    enc = [squeeze(h) for h in tabla[0]]
    idx = {}
    for k, nombres in ALIAS.items():
        for i, h in enumerate(enc):
            if h in nombres:
                idx[k] = i
                break
    if len(idx) < 3:
        if "rutadestino" in enc and "origen" not in idx:
            print("ERROR: este parece el archivo de CONSULTA (rutas_destino), no el de rutas del robot.\n"
                  "       Primero ejecute:  python generar_rutas.py --entrada <consulta> --salida Rutas_migracion.csv")
            sys.exit(2)
        if len(tabla[0]) >= 3 and not idx:
            idx = {"origen": 0, "destino": 1, "nombre": 2}
            print("AVISO: encabezados no reconocidos; se usan las columnas 1, 2 y 3 "
                  "(origen, destino, nombre) como en el robot original.")
        else:
            print(f"ERROR: faltan columnas {sorted(set(ALIAS) - set(idx))}. Encabezados: {tabla[0]}")
            sys.exit(2)
    filas = []
    for n, f in enumerate(tabla[1:], start=2):
        if not any(f):
            continue
        g = lambda k: f[idx[k]] if idx[k] < len(f) else ""
        o, d, nom = g("origen"), g("destino"), g("nombre")
        po, pd = partes(o), partes(d)
        motivo = ""
        if not po or not pd or not nom:
            motivo = "fila con campos vacios"
        elif ".." in po or ".." in pd or nom in (".", "..") or "/" in nom or "\\" in nom:
            motivo = "ruta con '..' o nombre con separadores"
        elif str(o).startswith(("/", "\\")) or str(d).startswith(("/", "\\")) or \
                (len(po[0]) == 2 and po[0][1] == ":") or (len(pd[0]) == 2 and pd[0][1] == ":"):
            motivo = "ruta absoluta (debe ser relativa a las carpetas base)"
        filas.append(dict(fila=n, o=po, d=pd + [nom], invalida=motivo,
                          origen_txt="/".join(po), destino_txt="/".join(pd + [nom])))
    return filas


def destinos_repetidos(filas):
    vistos, repetidos = {}, []
    for f in filas:
        if f["invalida"]:
            continue
        k = clave(f["destino_txt"])
        if k in vistos:
            repetidos.append((f["fila"], vistos[k], f["destino_txt"]))
        else:
            vistos[k] = f["fila"]
    return repetidos


def resolver_origen(O):
    """La consulta trae algunos nombres con el caracter danado U+FFFD (error de codificacion: 'innovaci\ufffdn').
    Si el archivo no existe tal cual, busca en SU carpeta un unico archivo que calce con el patron.
    Si hay 0 o mas de 1 candidato no adivina: devuelve None."""
    nombre = os.path.basename(O)
    if "\ufffd" not in nombre:
        return None
    patron = re.compile("".join(".{1,2}" if c == "\ufffd" else re.escape(c) for c in nombre), re.S)
    try:
        cands = [n for n in os.listdir(os.path.dirname(O)) if patron.fullmatch(n)]
    except OSError:
        return None
    return os.path.join(os.path.dirname(O), cands[0]) if len(cands) == 1 else None


# ---------------------------------------------------------------- una fila
def copiar_fila(f, ob, db, verificar_hash, simular):
    O = ruta_os(os.path.join(ob, *f["o"]))
    D = ruta_os(os.path.join(db, *f["d"]))
    nota = ""
    try:
        if not os.path.isfile(O):
            alt = resolver_origen(O)
            if not alt:
                return "ERROR_ORIGEN_NO_EXISTE", "no existe el archivo de origen", 0, ""
            O, nota = alt, "origen resuelto por patron: " + os.path.basename(alt)
        tam = os.path.getsize(O)
    except OSError as e:
        return "ERROR_ORIGEN_ILEGIBLE", f"{type(e).__name__}: {e}", 0, ""

    try:
        existe = os.path.lexists(D)
    except OSError as e:
        return "ERROR_CARPETA", f"{type(e).__name__}: {e}", tam, ""
    if existe:
        if not os.path.isfile(D):
            return "ERROR_CONFLICTO_DESTINO", "el destino existe y no es un archivo", tam, ""
        tam_d = os.path.getsize(D)
        if tam_d != tam:
            return ("ERROR_CONFLICTO_DESTINO",
                    f"ya existe con otro tamano (destino {tam_d} vs origen {tam}); no se sobrescribe", tam, "")
        if verificar_hash and sha256(O) != sha256(D):
            return "ERROR_CONFLICTO_DESTINO", "mismo tamano pero contenido distinto; no se sobrescribe", tam, ""
        return ("SIMULADO_YA_EXISTE" if simular else "OMITIDO_YA_EXISTE"), "mismo tamano" + ("; " + nota if nota else ""), tam, ""

    if simular:
        return "SIMULADO_COPIAR", nota, tam, ""

    carpeta = os.path.dirname(D)
    try:
        os.makedirs(carpeta, exist_ok=True)
    except OSError as e:
        return "ERROR_CARPETA", f"no se pudo crear la carpeta: {type(e).__name__}: {e}", tam, ""

    tmp = D + ".part"
    terminado = False
    try:
        shutil.copyfile(O, tmp)
        try:
            shutil.copystat(O, tmp)
        except OSError:
            pass
        tam_c = os.path.getsize(tmp)
        if tam_c != tam:
            return "ERROR_COPIA", f"tamano distinto tras copiar ({tam_c} vs {tam}); se descarto", tam, ""
        h = ""
        if verificar_hash:
            h = sha256(tmp)
            if h != sha256(O):
                return "ERROR_COPIA", "hash distinto tras copiar; se descarto", tam, ""
        os.replace(tmp, D)
        terminado = True
        return "COPIADO", nota, tam, h
    except Exception as e:                                   # noqa: BLE001  (se registra y se sigue)
        return "ERROR_COPIA", f"{type(e).__name__}: {e}", tam, ""
    finally:
        # Corre SIEMPRE (error, tamano distinto o Ctrl+C a mitad de copia): nunca queda un .part colgado
        if not terminado:
            try:
                os.remove(tmp)
            except OSError:
                pass


# --------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description="Copia documentos segun el archivo de rutas (secuencial, sin sobrescribir)")
    ap.add_argument("--rutas", required=True, help="archivo de rutas (.csv o .xlsx) generado por generar_rutas.py")
    ap.add_argument("--origen-base", required=True, help="carpeta raiz donde estan los archivos de origen")
    ap.add_argument("--destino-base", required=True, help="carpeta raiz de destino (debe existir)")
    ap.add_argument("--salida", default="salida_copiado", help="carpeta donde se guardan log y resultado")
    ap.add_argument("--simular", action="store_true", help="no copia nada: solo valida y reporta que haria")
    ap.add_argument("--verificar-hash", action="store_true", help="compara SHA-256 origen/destino (mas lento)")
    ap.add_argument("--desde", type=int, default=1, help="empezar en la fila N de datos (1 = primera)")
    ap.add_argument("--limite", type=int, default=0, help="procesar como maximo N filas (0 = todas)")
    ap.add_argument("--max-errores-seguidos", type=int, default=25,
                    help="abortar tras N errores de copia/carpeta seguidos (disco lleno, red caida...)")
    ap.add_argument("--version", action="version", version=VERSION)
    a = ap.parse_args(argv)
    for flujo in (sys.stdout, sys.stderr):      # la consola de Windows (cp1252/cp437) no puede mostrar todos los nombres:
        try:                                    # sin esto un print() con un caracter raro tumbaria la corrida a la mitad
            flujo.reconfigure(errors="replace")
        except Exception:                       # noqa: BLE001
            pass

    ob, db = os.path.abspath(a.origen_base), os.path.abspath(a.destino_base)
    if not os.path.isdir(ruta_os(ob)):
        print(f"ERROR: no existe la carpeta de origen: {ob}"); return 2
    if not os.path.isdir(ruta_os(db)):
        print(f"ERROR: no existe la carpeta de destino: {db}\n       (se exige que exista para evitar copiar a una ruta mal escrita)"); return 2
    if clave(ob) == clave(db):
        print("ERROR: origen y destino son la misma carpeta"); return 2

    filas = cargar_rutas(a.rutas)
    rep = destinos_repetidos(filas)
    if rep:
        print(f"ERROR: el archivo de rutas tiene {len(rep)} destinos repetidos (sin distinguir mayusculas). NO se copio nada.")
        for fila, primera, dest in rep[:15]:
            print(f"   fila {fila} repite el destino de la fila {primera}: {dest}")
        print("   Genere el archivo con generar_rutas.py (asigna _1, _2, ...) y vuelva a ejecutar.")
        return 2

    sel = filas[max(a.desde - 1, 0):]
    if a.limite > 0:
        sel = sel[:a.limite]
    total = len(sel)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs(a.salida, exist_ok=True)
    pref = "simulacion" if a.simular else "ejecucion"
    p_log = os.path.join(a.salida, f"log_{pref}_{ts}.txt")
    p_csv = os.path.join(a.salida, f"resultado_{pref}_{ts}.csv")
    flog = open(p_log, "w", encoding="utf-8")
    fcsv = open(p_csv, "w", newline="", encoding="utf-8-sig")
    wcsv = csv.writer(fcsv)
    wcsv.writerow(["Fila", "Origen", "Destino", "Resultado", "Detalle", "Bytes", "Segundos", "SHA256"])

    def log(txt, consola=False):
        flog.write(txt + "\n"); flog.flush()
        if consola:
            print(txt, flush=True)

    t_ini = datetime.now()
    log(f"copiar_archivos {VERSION}  |  {'SIMULACION (no copia)' if a.simular else 'EJECUCION'}", True)
    log(f"Inicio ............ {t_ini:%Y-%m-%d %H:%M:%S}")
    log(f"Equipo/usuario .... {socket.gethostname()} / {getpass.getuser()}  ({platform.system()} {platform.release()}, Python {platform.python_version()})")
    log(f"Archivo de rutas .. {os.path.abspath(a.rutas)}  ({len(filas)} filas; se procesaran {total})", True)
    log(f"Origen base ....... {ob}", True)
    log(f"Destino base ...... {db}", True)
    log(f"Verificar hash .... {a.verificar_hash}   |   corte por errores seguidos: {a.max_errores_seguidos}")
    log("-" * 100)

    cont, bytes_ok, seguidos = Counter(), 0, 0
    bytes_a_copiar = 0
    estado = "COMPLETO"
    t0 = time.perf_counter()
    ultimo_print = t0
    hechas = 0
    try:
        for f in sel:
            ti = time.perf_counter()
            if f["invalida"]:
                res, det, tam, h = "ERROR_RUTA_INVALIDA", f["invalida"], 0, ""
            else:
                res, det, tam, h = copiar_fila(f, ob, db, a.verificar_hash, a.simular)
            seg = time.perf_counter() - ti
            hechas += 1
            cont[res] += 1
            if res in ("COPIADO",):
                bytes_ok += tam
            if res == "SIMULADO_COPIAR":
                bytes_a_copiar += tam
            wcsv.writerow([f["fila"], f["origen_txt"], f["destino_txt"], res, det, tam, f"{seg:.4f}", h])
            fcsv.flush()
            linea = f"[{datetime.now():%H:%M:%S}] fila {f['fila']:>7}  {res:<24} {f['destino_txt']}" + (f"   <- {det}" if det else "")
            log(linea, consola=res.startswith("ERROR"))
            seguidos = seguidos + 1 if res in ERRORES_ES else 0
            if seguidos >= a.max_errores_seguidos:
                estado = f"ABORTADO: {seguidos} errores de copia/carpeta seguidos (revise disco, permisos o red)"
                break
            ahora = time.perf_counter()
            if hechas % 1000 == 0 or ahora - ultimo_print >= 10 or hechas == total:
                ultimo_print = ahora
                vel = hechas / max(ahora - t0, 1e-9)
                resto = (total - hechas) / vel if vel else 0
                err = sum(v for k, v in cont.items() if k.startswith("ERROR"))
                log(f"  progreso {hechas}/{total} ({hechas * 100 / max(total, 1):.1f}%)  {vel:,.0f} filas/s  "
                    f"errores={err}  faltan ~{hms(resto)}", consola=True)
    except KeyboardInterrupt:
        estado = "INTERRUMPIDO por el usuario (Ctrl+C). Vuelva a ejecutar el mismo comando: lo ya copiado se omite."

    os.fsync(fcsv.fileno()) if not fcsv.closed else None
    fcsv.close()
    dur = time.perf_counter() - t0
    errores = sum(v for k, v in cont.items() if k.startswith("ERROR"))
    log("-" * 100)
    log(f"RESUMEN  ({estado})", True)
    for k in sorted(cont):
        log(f"   {k:<26} {cont[k]:>9}", True)
    log(f"   {'filas procesadas':<26} {hechas:>9} de {total}", True)
    if a.simular:
        try:
            libre = shutil.disk_usage(db).free
        except OSError:
            libre = float('inf')
        log(f"   Espacio a copiar ......... {bytes_a_copiar / 1e6:,.1f} MB   |   libre en destino: {libre / 1e6:,.1f} MB"
            + ("   <-- NO ALCANZA" if bytes_a_copiar > libre else ""), True)
    else:
        log(f"   Bytes copiados ........... {bytes_ok / 1e6:,.1f} MB", True)
    log(f"   Duracion ................. {hms(dur)}  ({hechas / max(dur, 1e-9):,.0f} filas/s)", True)
    log(f"   Log ...................... {p_log}", True)
    log(f"   Resultado por fila ....... {p_csv}", True)
    flog.close()
    if estado.startswith("INTERRUMPIDO"):
        return 130
    if estado.startswith("ABORTADO"):
        return 3
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
