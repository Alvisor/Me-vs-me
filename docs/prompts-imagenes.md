# Prompts para generar ilustraciones con IA

La app ya incluye fotos de dominio público (free-exercise-db) con la posición inicial (`0.jpg`) y final (`1.jpg`) de cada ejercicio.
Si prefieres ilustraciones con estilo propio, genera **dos imágenes por ejercicio** y reemplaza los archivos en `img/ex/<carpeta>/`.

## Estilo base (pégalo delante de cada prompt)

> Flat vector illustration, fitness app style, side view, single athletic person in plain dark t-shirt and shorts,
> clean light-grey background, no text, no logos, anatomically correct joints, the working muscles subtly highlighted in orange (#ff5a1f),
> 3:2 aspect ratio, consistent character across the series.

Consejo: usa siempre la misma "semilla" o la opción de *personaje consistente* para que todas las imágenes parezcan de la misma serie.

## Prompts por ejercicio

| Carpeta | Imagen 0 (inicio) | Imagen 1 (final) |
|---|---|---|
| `Barbell_Full_Squat` | Back squat, standing upright with barbell on upper back, feet shoulder width, toes slightly out. Highlight quads and glutes. | Same person at the bottom of a deep back squat, thighs below parallel, knees tracking over toes, neutral spine, heels flat. |
| `Hack_Squat` | Hack squat machine, back against the pad, legs almost straight. | Bottom of hack squat, knees deeply bent, back flat on pad. |
| `Leg_Press` | 45° leg press, legs almost straight (not locked), feet mid-platform. | Bottom of leg press, knees close to chest, lower back still on the seat. |
| `Split_Squat_with_Dumbbells` | Bulgarian split squat, rear foot on bench, dumbbells in hands, standing tall. | Bottom position, rear knee near the floor, front shin slightly forward, torso slightly leaning. |
| `Romanian_Deadlift` | Standing tall holding barbell at hip level, soft knees. Highlight hamstrings and glutes. | Hip hinge: hips pushed back, bar at mid-shin sliding along the legs, flat back, slight knee bend. |
| `Seated_Leg_Curl` | Seated leg curl machine, legs extended, torso leaning slightly forward. Highlight hamstrings. | Knees fully bent, heels under the seat. |
| `Lying_Leg_Curls` | Lying leg curl machine, legs straight, hips on pad. | Knees fully bent, hips still on pad. |
| `Incline_Dumbbell_Press` | 30° incline bench, dumbbells at chest level, elbows ~45° from torso, chest stretched. Highlight chest. | Arms extended above upper chest, dumbbells close together. |
| `Barbell_Bench_Press_-_Medium_Grip` | Flat bench press, bar touching lower chest, shoulder blades retracted, feet on floor. | Arms locked out, bar above shoulders. |
| `Dips_-_Chest_Version` | Parallel bar dips, arms straight at top, torso leaning forward. | Bottom of the dip, shoulders slightly below elbows, torso forward. |
| `Wide-Grip_Lat_Pulldown` | Lat pulldown, arms fully stretched overhead holding the wide bar. Highlight lats. | Bar pulled to upper chest, elbows down and back, chest up. |
| `Pullups` | Dead hang from a pull-up bar, arms straight. | Chin over the bar, elbows pulled to the ribs. |
| `Dumbbell_Incline_Row` | Chest supported on 45° incline bench, arms hanging with dumbbells. Highlight upper back. | Dumbbells pulled to the hips, shoulder blades squeezed. |
| `Seated_Cable_Rows` | Seated cable row, arms extended forward, back neutral, slight forward reach. | Handle pulled to the abdomen, torso upright, shoulder blades together. |
| `Side_Lateral_Raise` | Standing, dumbbells at the sides, slight forward lean. Highlight side delts. | Arms raised to shoulder height out to the sides, elbows slightly bent. |
| `Cable_Seated_Lateral_Raise` | Single-arm cable lateral raise from low pulley, hand near the hip. | Arm raised to shoulder height. |
| `Cable_Rope_Overhead_Triceps_Extension` | Facing away from cable, rope behind head, elbows bent pointing forward, triceps stretched. Highlight triceps. | Arms fully extended overhead in front, elbows still. |
| `Incline_Dumbbell_Curl` | Seated on 60° incline bench, arms hanging straight behind torso with dumbbells. Highlight biceps. | Dumbbells curled to shoulders, elbows not moving forward. |
| `Standing_Calf_Raises` | Standing calf raise machine, heels dropped below the step, deep calf stretch. Highlight calves. | Up on the toes, full contraction, knees straight. |

## Cómo reemplazar las imágenes

1. Exporta en JPG, 3:2 (por ejemplo 900×600).
2. Guarda como `img/ex/<carpeta>/0.jpg` (inicio) y `1.jpg` (final), sobrescribiendo las actuales.
3. Recarga la app. Si ya la tenías instalada, recarga dos veces para que el service worker se actualice.
