# Migración de documentos de Homologaciones 1.0

Reconstrucción del robot **CopiarArchivos** y del generador del archivo de rutas.
Solo usa la biblioteca estándar de Python 3 (para leer `.xlsx` hace falta `pip install openpyxl`).

| Archivo | Para qué sirve |
|---|---|
| `generar_rutas.py` | Convierte la consulta (`rutas_destino`) en el archivo de rutas del robot, asignando `_1`, `_2`… a los repetidos |
| `copiar_archivos.py` | El robot: copia a `código estudiante / caso / tipo de documento / archivo`, sin sobrescribir y con evidencia |
| `escenario_prueba.py` | Crea una carpeta de simulación con datos **sintéticos** y verifica el resultado de forma independiente |
| `evidencia_simulacion/` | Logs y resultados reales de la simulación (datos sintéticos) |

## Cómo se ejecuta (consola de Windows)

```bash
python generar_rutas.py --entrada rutas_destino.csv --salida C:\migracion\Rutas_migracion.csv
```

Revise `Rutas_migracion_reporte.txt`, `Rutas_migracion_excluidas.csv` y `Rutas_migracion_renombrados.csv`. Después, **siempre una simulación primero**:

```bash
python copiar_archivos.py --rutas C:\migracion\Rutas_migracion.csv --origen-base D:\bizagi-nas --destino-base E:\homologaciones --simular
```

Una prueba corta con las primeras 100 filas y verificación de hash:

```bash
python copiar_archivos.py --rutas C:\migracion\Rutas_migracion.csv --origen-base D:\bizagi-nas --destino-base E:\homologaciones --limite 100 --verificar-hash
```

La ejecución completa (si se interrumpe, se vuelve a lanzar **el mismo comando** y continúa):

```bash
python copiar_archivos.py --rutas C:\migracion\Rutas_migracion.csv --origen-base D:\bizagi-nas --destino-base E:\homologaciones
```

La carpeta de destino debe existir. Si se pasa el `.xlsx` en vez del `.csv` también lo lee (`--xlsx` en el generador crea ambos).

## Formato del archivo de rutas

`Origen, Destino, NombreArchivo, Caso, SCODIGO, TipoDocumento, NombreOriginal, Sufijo, FilaEntrada`

El robot solo necesita las tres primeras. `Origen` incluye el nombre del archivo y es relativo a `--origen-base`; `Destino` es la carpeta `codigo/caso/tipo/` relativa a `--destino-base`; `NombreArchivo` es el nombre final (con `_#` si estaba repetido). Admite barras `/` o `\` y separadores `,` `;` o tabulador. Si los encabezados no se reconocen, usa las columnas 1, 2 y 3 como el robot original.

## Reglas de los repetidos (`_#`)

- Dos filas con el mismo `código/caso/tipo/nombre` (sin distinguir mayúsculas ni acentos compuestos/descompuestos, como Windows) son un repetido.
- La primera conserva el nombre; las demás reciben `_1`, `_2`… antes de la extensión: `Notas.pdf`, `Notas_1.pdf`, `Notas_2.pdf`.
- El orden dentro del grupo se decide por la ruta de origen, no por el orden de las filas: el resultado es el mismo aunque el archivo venga reordenado.
- Si ya existe un nombre real como `Informe_1.pdf`, el repetido salta a `Informe_2.pdf` (nunca pisa un nombre real).
- Si la **misma** fila aparece dos veces (mismo origen, mismo destino) no es un repetido: se excluye como `DUPLICADO_EXACTO` y se copia una sola vez.
- Se corrigen solo los caracteres que Windows no admite (`< > : " / \ | ? *`), puntos o espacios finales y nombres reservados (`CON`, `NUL`…). **No se quitan espacios, puntos, guiones ni guiones bajos** (la versión anterior sí lo hacía).

## Resultados por fila (columna `Resultado` del CSV y del log)

| Resultado | Significado |
|---|---|
| `COPIADO` | Copiado y verificado (tamaño, y SHA-256 si se pidió) |
| `OMITIDO_YA_EXISTE` | El destino ya existe con el mismo tamaño; no se toca |
| `ERROR_ORIGEN_NO_EXISTE` | No está el archivo de origen; se sigue con la fila siguiente |
| `ERROR_CONFLICTO_DESTINO` | El destino existe con otro tamaño o contenido; **no se sobrescribe** |
| `ERROR_CARPETA` / `ERROR_COPIA` | Falló crear la carpeta o copiar; se sigue (se corta tras 25 seguidos) |
| `ERROR_RUTA_INVALIDA` | Ruta con `..`, absoluta o con campos vacíos |
| `SIMULADO_*` | Lo que habría pasado en modo `--simular` |

Códigos de salida: `0` todo bien · `1` terminó con errores en algunas filas · `2` archivo de rutas inválido (no se copió nada) · `3` abortado por errores de E/S seguidos · `130` Ctrl+C.

## Por qué secuencial

En octubre de 2023 el paralelismo produjo errores `Cannot create a file when that file already exists` y pérdidas de archivos por condiciones de carrera. Esta versión no usa hilos: cada fila se procesa completa antes de la siguiente, no hay bucles que dependan de datos externos (el único bucle de sufijos tiene tope de 100.000 intentos) y el orden del log es el orden de ejecución.

## Ejecutables de Windows (`CopiarArchivos.exe`, `GenerarRutas.exe`)

No necesitan Python instalado. Se compilan solos en GitHub Actions (`.github/workflows/robot-windows.yml`) cada vez que cambia esta carpeta. En la misma ejecución se corre el escenario completo **con esos .exe en un Windows real** (generar rutas, simular, copiar leyendo el XLSX con hash, verificar, re-ejecutar, destinos repetidos, ruta de más de 260 caracteres, nombres con caracteres que la consola no puede mostrar).

Para bajarlos: pestaña **Actions** del repositorio → ejecución más reciente en verde → sección **Artifacts** → `robot-migracion-windows` (los .exe más los logs de esa prueba). Se usan igual que los scripts:

```bash
GenerarRutas.exe --entrada rutas_destino.xlsx --salida C:\migracion\Rutas_migracion.csv --xlsx
CopiarArchivos.exe --rutas C:\migracion\Rutas_migracion.csv --origen-base D:\bizagi-nas --destino-base E:\homologaciones --simular
```

## Nombres con caracter dañado (U+FFFD)

Algunos nombres de la consulta traen el carácter `�` (error de codificación al exportar). El destino los escribe con `_` (igual que `RutaDestino` en la consulta). Para el origen, si el archivo no existe tal cual, el robot busca **en esa misma carpeta un único archivo** que calce con el patrón (`�` = 1 o 2 caracteres); si hay 0 o más de 1 candidato no adivina y lo reporta como `ERROR_ORIGEN_NO_EXISTE`. Queda anotado en el detalle del resultado: `origen resuelto por patron`.

## Lo que NO está probado

- **Carpetas de red** (NAS): la velocidad real será mucho menor que la medida en disco local.
- **Archivos reales**: la corrida con la consulta real (134.941 filas) se hizo contra un origen falso con la misma estructura (archivos pequeños con contenido único). Falta la simulación contra el origen real.
- **Windows con rutas de red UNC** (`\\servidor\carpeta`): el prefijo largo para UNC está implementado pero no se probó.
