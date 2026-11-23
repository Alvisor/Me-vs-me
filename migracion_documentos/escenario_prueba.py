#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
escenario_prueba.py - crea una carpeta de simulacion con DATOS SINTETICOS (sin datos reales)
y verifica de forma independiente el resultado del robot.

  python escenario_prueba.py crear    --carpeta sim [--masivo 20000]
  python escenario_prueba.py verificar --carpeta sim --rutas sim/Rutas_migracion.csv --destino sim/destino
"""
import argparse
import csv
import hashlib
import os
import sys
import unicodedata

COLS = ["Ruta", "NombreArchivo", "RutaDestino", "Caso", "SCODIGO", "TipoDocumento", "idEntidad", "idRegistro", "idAtributo"]


def P(p):
    """Windows: prefijo \\\\?\\ para rutas de mas de 260 caracteres (en Linux no hace nada)."""
    if os.name == "nt":
        p = os.path.abspath(p)
        return p if p.startswith("\\\\?\\") else "\\\\?\\" + p
    return p


def contenido(clave, tam):
    """Bytes deterministas y distintos por archivo (para que el hash sirva de verdad)."""
    semilla = hashlib.sha256(clave.encode()).digest()
    return (semilla * (tam // 32 + 1))[:tam]


def crear(carpeta, masivo, largo=False):
    origen = os.path.join(carpeta, "origen")
    filas = []

    def archivo(ruta, nombre, tam=1500, crear_archivo=True):
        d = os.path.join(origen, *ruta.strip("/").split("/"))
        if crear_archivo:
            os.makedirs(P(d), exist_ok=True)
            with open(P(os.path.join(d, nombre)), "wb") as f:
                f.write(contenido(ruta + nombre, tam))

    def fila(ruta, nombre, codigo, caso, tipo, **kw):
        archivo(ruta, nombre, **kw)
        rd = f"{codigo}/{caso}/{tipo}/{nombre}" if (codigo and caso) else ""      # como en la consulta real
        filas.append([ruta, nombre, rd, caso, codigo, tipo, "10013", ruta.split("/")[2], "10055"])

    # 1) repetidos exactos de nombre en el mismo estudiante/caso/tipo -> Notas.pdf, Notas_1.pdf, Notas_2.pdf
    for i in (1, 2, 3):
        fila(f"10013/1/{100 + i}/10055/", "Notas.pdf", "900000001", "HOM2020-1-1", "UCertificadoNotas")
    # 2) repetidos que solo difieren en mayusculas (colisionan en Windows)
    fila("10013/2/201/10055/", "Certificado.pdf", "900000002", "HOM2020-1-2", "UCertificadoNotas")
    fila("10013/2/202/10055/", "CERTIFICADO.PDF", "900000002", "HOM2020-1-2", "UCertificadoNotas")
    # 3) un nombre "real" que ya parece sufijo: Informe.pdf x2 + Informe_1.pdf real
    fila("10013/3/301/10055/", "Informe.pdf", "900000003", "HOM2020-1-3", "USoporte")
    fila("10013/3/302/10055/", "Informe.pdf", "900000003", "HOM2020-1-3", "USoporte")
    fila("10013/3/303/10055/", "Informe_1.pdf", "900000003", "HOM2020-1-3", "USoporte")
    # 4) fila exactamente duplicada (mismo origen y destino) -> se excluye, no se copia dos veces
    fila("10013/4/401/10055/", "Cancelación Curso.pdf", "900000004", "HOM2020-1-4", "USoporte")
    filas.append(list(filas[-1]))
    # 5) origen que NO existe en disco -> ERROR_ORIGEN_NO_EXISTE y el proceso continua
    fila("10013/5/501/10055/", "Fantasma.pdf", "900000005", "HOM2020-1-5", "USoporte", crear_archivo=False)
    # 5b) origen inexistente con caracteres que la consola de Windows no puede mostrar (cp1252/cp437)
    fila("10013/5/502/10055/", "Fantasma \u2603 \u65e5\u672c.pdf", "900000005", "HOM2020-1-5", "USoporte", crear_archivo=False)
    # 6) caracteres que Windows no admite en el nombre de destino
    #    (en Windows el sistema de archivos no permite CREAR esos origenes: se usan equivalentes validos)
    win = os.name == "nt"
    fila("10013/6/601/10055/", "Acta final.pdf" if win else "Acta: final?.pdf", "900000006", "HOM2020-1-6", "USoporte")
    # 7) puntos/espacios raros y nombre reservado de Windows
    fila("10013/7/701/10055/", "Salazar V..pdf", "900000007", "HOM2020-1-7", "UCertificadoNotas")
    fila("10013/7/702/10055/", "notas .pdf", "900000007", "HOM2020-1-7", "UCertificadoNotas")
    if not win:     # Windows no deja crear "informe." (quita el punto) ni "CON.pdf" (nombre reservado)
        fila("10013/7/703/10055/", "informe.", "900000007", "HOM2020-1-7", "UCertificadoNotas")
        fila("10013/7/704/10055/", "CON.pdf", "900000007", "HOM2020-1-7", "UCertificadoNotas")
    # 7b) nombres que EMPIEZAN con punto (aparecen en la consulta real): no se les debe quitar el punto
    fila("10013/7/705/10055/", ".pdf", "900000007", "HOM2020-1-7", "UPrograma")
    fila("10013/7/706/10055/", ".pdf", "900000007", "HOM2020-1-7", "UPrograma")          # repetido -> _1.pdf
    fila("10013/7/707/10055/", "._Solicitud homologación.pdf", "900000007", "HOM2020-1-7", "UPrograma")
    # 7c) nombre con caracter danado U+FFFD en la consulta; en disco el archivo real tiene la tilde
    archivo("10013/7/708/10055/", "Innovación 2016.pdf")
    filas.append(["10013/7/708/10055/", "Innovaci\ufffdn 2016.pdf", "900000007/HOM2020-1-7/UPrograma/Innovaci_n 2016.pdf",
                  "HOM2020-1-7", "900000007", "UPrograma", "10013", "708", "10055"])
    # 7d) ruta larga (opcional, --largo): el destino completo pasa de 260 caracteres
    if largo:
        fila("10013/7/709/10055/", "L" * 200 + ".pdf", "900000007", "HOM2020-1-7", "UBibliografia")
    # 8) acentos: mismo nombre en NFC y NFD en el mismo destino (cuentan como repetido)
    nfc = unicodedata.normalize("NFC", "Homologación.pdf")
    nfd = unicodedata.normalize("NFD", "Homologación.pdf")
    fila("10013/8/801/10055/", nfc, "900000008", "HOM2020-1-8", "UCertificadoNotas")
    fila("10013/8/802/10055/", nfd, "900000008", "HOM2020-1-8", "UCertificadoNotas")
    # 9) archivo grande (5 MB) y archivo vacio
    fila("10013/9/901/10055/", "Grande.pdf", "900000009", "HOM2020-1-9", "USoporte", tam=5 * 1024 * 1024)
    fila("10013/9/902/10055/", "Vacio.pdf", "900000009", "HOM2020-1-9", "USoporte", tam=0)
    # 10) el MISMO archivo origen va a dos casos distintos (ambos se copian)
    fila("10013/10/1001/10055/", "Compartido.pdf", "900000010", "HOM2020-1-10", "USoporte")
    filas.append(["10013/10/1001/10055/", "Compartido.pdf", "900000010/HOM2020-1-11/USoporte/Compartido.pdf",
                  "HOM2020-1-11", "900000010", "USoporte", "10013", "1001", "10055"])
    # 11) filas que deben excluirse: sin caso, sin codigo, ruta con '..'
    fila("10013/11/1101/10055/", "SinCaso.pdf", "900000011", "", "USoporte")
    fila("10013/11/1102/10055/", "SinCodigo.pdf", "", "HOM2020-1-11", "USoporte")
    fila("10013/11/1103/10055/", "SinNada.pdf", "", "", "USoporte")
    fila("10013/11/1104/10055/", "SinNada.pdf", "", "", "USoporte")          # repetido dentro de Otros/SIN_CASO -> _1
    filas.append(["../../etc/", "passwd", "900000011/HOM2020-1-11/USoporte/passwd", "HOM2020-1-11", "900000011", "USoporte", "", "", ""])

    # 12) masivo opcional: bloques de 7 archivos consecutivos caen en el mismo estudiante/caso/tipo y
    #     solo hay 2 nombres (doc_0 / doc_1) -> en cada bloque hay repetidos y sufijos hasta _3
    for i in range(masivo):
        ruta = f"10014/{i // 1000}/{i}/10055/"
        nombre = f"doc_{i % 2}.pdf"
        b = i // 7
        cod, caso, tipo = f"9100{b % 800:05d}", f"HOM2021-{b % 20}-{b % 11}", ("USoporte", "UCertificadoNotas", "USoporteCancelacion")[b % 3]
        archivo(ruta, nombre, tam=1024)
        filas.append([ruta, nombre, f"{cod}/{caso}/{tipo}/{nombre}", caso, cod, tipo, "10014", str(i), "10055"])

    with open(os.path.join(carpeta, "rutas_destino_prueba.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        w.writerows(filas)
    os.makedirs(os.path.join(carpeta, "destino"), exist_ok=True)
    print(f"Escenario creado en {carpeta}: {len(filas)} filas de consulta, origen en {origen}")


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def verificar(carpeta, rutas, destino):
    origen = os.path.join(carpeta, "origen")
    with open(rutas, newline="", encoding="utf-8-sig") as f:
        filas = list(csv.DictReader(f))
    errores, esperados = [], set()
    for r in filas:
        o = P(os.path.join(origen, *r["Origen"].split("/")))
        d = P(os.path.join(destino, *r["Destino"].strip("/").split("/"), r["NombreArchivo"]))
        if "\ufffd" in r["Origen"]:                     # el origen real tiene la tilde: lo resuelve el robot
            carpeta_o = os.path.dirname(o)
            cands = [n for n in os.listdir(carpeta_o) if n.startswith("Innovaci")]
            o = os.path.join(carpeta_o, cands[0]) if cands else o
        if os.path.isfile(o):
            esperados.add(d)
            if not os.path.isfile(d):
                errores.append(f"FALTA destino: {d}")
            elif sha(o) != sha(d):
                errores.append(f"HASH distinto: {d}")
        elif os.path.exists(d):
            errores.append(f"destino existe aunque el origen no: {d}")
    reales, partes = set(), []
    for raiz, _, nombres in os.walk(P(destino)):
        for n in nombres:
            p = os.path.join(raiz, n)
            reales.add(p)
            if n.endswith(".part"):
                partes.append(p)
    sobran = reales - esperados
    if partes:
        errores.append(f"{len(partes)} archivos .part sin terminar")
    if sobran:
        errores.extend(f"SOBRA en destino: {p}" for p in sorted(sobran)[:10])
    nombres_ci = [unicodedata.normalize("NFC", p).casefold() for p in reales]
    if len(nombres_ci) != len(set(nombres_ci)):
        errores.append("hay nombres que solo difieren en mayusculas/Unicode")
    print(f"VERIFICACION INDEPENDIENTE: filas={len(filas)} esperados={len(esperados)} en_destino={len(reales)} "
          f"-> {'OK' if not errores else 'FALLO'}")
    for e in errores[:20]:
        print("  ", e)
    return 0 if not errores else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("crear"); c.add_argument("--carpeta", required=True); c.add_argument("--masivo", type=int, default=0); c.add_argument("--largo", action="store_true")
    v = sub.add_parser("verificar"); v.add_argument("--carpeta", required=True); v.add_argument("--rutas", required=True); v.add_argument("--destino", required=True)
    a = ap.parse_args()
    if a.cmd == "crear":
        crear(a.carpeta, a.masivo, a.largo)
    else:
        sys.exit(verificar(a.carpeta, a.rutas, a.destino))
