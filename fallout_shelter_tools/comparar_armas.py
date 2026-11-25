#!/usr/bin/env python3
"""Compara las armas de tu partida de Fallout Shelter con la lista completa.

Uso:
    python comparar_armas.py "C:\\Users\\TU_USUARIO\\Documents\\My Games\\Fallout Shelter\\Vault1.sav"
    python comparar_armas.py Vault1.sav --faltan-fabricables
    python comparar_armas.py partida.json     # JSON ya descifrado

Requiere:  pip install cryptography
Solo LEE el archivo; no lo modifica.
"""
import argparse, base64, csv, json, sys
from collections import Counter
from pathlib import Path

# Clave/IV AES-CBC que usa el juego para los .sav (iguales en FSSE/FOSE)
KEY = bytes.fromhex("a7ca9f3366d892c2f0bef417341ca971b69ae9f7bacccffcf43c62d1d7d021f9")
IV = bytes.fromhex("7475383967656a693334626a65726975")
REF = Path(__file__).with_name("weapons_reference.csv")


def cargar_partida(ruta):
    raw = Path(ruta).read_bytes()
    if raw.lstrip()[:1] == b"{":          # ya es JSON
        return json.loads(raw)
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding
    cifrado = base64.b64decode(raw)
    dec = Cipher(algorithms.AES(KEY), modes.CBC(IV)).decryptor()
    datos = dec.update(cifrado) + dec.finalize()
    unp = padding.PKCS7(128).unpadder()
    return json.loads(unp.update(datos) + unp.finalize())


def armas_de_la_partida(save):
    c = Counter()
    for it in save.get("vault", {}).get("inventory", {}).get("items", []):
        if it.get("type") == "Weapon":
            c[it["id"]] += 1
    for d in save.get("dwellers", {}).get("dwellers", []):   # armas equipadas
        w = d.get("equipedWeapon") or {}
        if w.get("type") == "Weapon" and w.get("id") != "Fist":
            c[w["id"]] += 1
    return c


URL_REF = "https://raw.githubusercontent.com/robot9706/FSSE/gh-pages/CSV/csv_excel_weapons.csv"


def cargar_referencia():
    if not REF.exists():                      # descarga la lista si no esta junto al script
        import urllib.request
        print("Descargando lista de armas...", file=sys.stderr)
        REF.write_bytes(urllib.request.urlopen(URL_REF, timeout=30).read())
    with open(REF, newline="", encoding="utf-8") as f:
        filas = list(csv.DictReader(f, delimiter=";"))
    return {r["ID"]: r for r in filas if r["Type"] == "Gun" or r["Type"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("save")
    ap.add_argument("--faltan-fabricables", action="store_true",
                    help="mostrar solo las que faltan y se pueden fabricar")
    a = ap.parse_args()

    ref = cargar_referencia()
    tengo = armas_de_la_partida(cargar_partida(a.save))
    ids_ref = set(ref)
    faltan = sorted(ids_ref - set(tengo))
    desconocidas = sorted(set(tengo) - ids_ref)

    def linea(i):
        r = ref[i]
        nombre = (r["Name"].replace(",", "").strip() + " " if r["Name"] else "")
        return (f"  {i:<34} {r['Type']:<6} dmg {r['MinDamage']}-{r['MaxDamage']:<3} "
                f"{r['Rarity']:<9} fabricable: {r['Craftable']}")

    if not a.faltan_fabricables:
        print(f"=== TIENES ({len(set(tengo) & ids_ref)}/{len(ids_ref)}) ===")
        for i in sorted(set(tengo) & ids_ref):
            print(linea(i) + f"   x{tengo[i]}")
    if a.faltan_fabricables:
        faltan = [i for i in faltan if ref[i]["Craftable"] == "Yes"]
    print(f"\n=== FALTAN ({len(faltan)}) ===")
    for i in faltan:
        print(linea(i))
    if desconocidas:
        print(f"\n=== EN TU PARTIDA PERO NO EN LA LISTA ({len(desconocidas)}) ===")
        print("  (probablemente armas añadidas en actualizaciones posteriores)")
        for i in desconocidas:
            print(f"  {i}  x{tengo[i]}")


if __name__ == "__main__":
    main()
