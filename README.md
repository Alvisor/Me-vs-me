# Me vs Me

Web app (PWA) para entrenar **2–3 días por semana** con una rutina full body basada en evidencia, y competir contra tu yo de la última sesión.

## Qué hace

- **Entrenar:** alterna automáticamente Full Body A y B. Registra peso y reps, con temporizador de descanso (más corto en superseries).
- **Progresión automática (doble progresión):** si llegas al tope de reps en todas las series, te sugiere subir peso; si no, mismo peso y +1 rep.
- **Me vs Me:** al terminar, compara cada ejercicio con la última vez (1RM estimado).
- **Ejercicios:** técnica paso a paso, errores comunes, músculos, por qué se eligió e imagen animada inicio/final. Permite sustituir ejercicios por alternativas.
- **Progreso:** series por músculo esta semana frente al objetivo (8–15), tendencia de fuerza e historial.
- Funciona sin conexión y los datos se guardan en el dispositivo. Se pueden exportar e importar en JSON.

## Usarla

```bash
npm start          # sirve en http://localhost:8080
npm test           # tests de la lógica (node --test)
```

Es HTML/CSS/JS sin compilación: se puede publicar tal cual en GitHub Pages, Netlify o Vercel. En el móvil: abrir la URL → "Añadir a pantalla de inicio".

## Estructura

- `js/data.js`: catálogo de ejercicios (técnica, músculos, alternativas) y rutinas A/B.
- `js/logic.js`: lógica pura (progresión, volumen semanal, comparación).
- `js/app.js`: interfaz.
- `img/ex/`: imágenes de [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio público).
- `docs/prompts-imagenes.md`: prompts para generar ilustraciones propias con IA.
