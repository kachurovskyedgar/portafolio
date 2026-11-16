# Portafolio — Edgar Kachurovsky

Sitio personal de **Edgar Kachurovsky**, desarrollador web y diseñador de interfaces.
Reúne el proyecto real **Kairós** (con demo en vivo) y dos demos interactivas de
diseño e interfaces.

**Sitio publicado:** https://kachurovskyedgar.github.io/portafolio/

---

## Contenido

| Sección | Descripción |
| --- | --- |
| Inicio | Presentación, estado de disponibilidad y accesos rápidos |
| Proyectos | Kairós (producto real, demo + galería) y dos demos interactivas |
| Sobre mí | Formación, experiencia, herramientas y línea de tiempo |
| Contacto | Email, WhatsApp y GitHub |

## Proyectos

1. **Kairós** — planificador personal de tareas, calendario, enfoque y estadísticas.
   Producto completo con demo navegable. Incluye galería de capturas y enlace a la app.
   → `proyectos/kairos/`
2. **Generador de identidad** — demo interactiva de sistema de marca: presets,
   paleta, tipografía, formas y tokens CSS.
3. **Panel de ventas** — demo de dashboard con KPIs, rangos de fechas, gráfico
   interactivo, canales y tabla de pedidos.

## Estructura

```
.
├── index.html                  # Portafolio (página principal)
├── assets/
│   └── img/                    # Portadas SVG de los proyectos
└── proyectos/
    └── kairos/                 # Landing + app + assets de Kairós
        ├── index.html
        ├── acceso.html
        ├── app.html
        └── assets/
```

## Tecnologías

HTML5 · CSS3 (Grid, Flexbox, custom properties) · JavaScript (vanilla) ·
SVG · Git/GitHub · Figma/UI · SQL · Python · Java/C#

## Ejecutar en local

No requiere build ni dependencias. Al usar rutas relativas, conviene servir la
carpeta con cualquier servidor estático:

```bash
# Opción 1: Python
python -m http.server 8000

# Opción 2: Node
npx serve .
```

Luego abrir `http://localhost:8000/`.

## Notas

- El sitio es estático y está pensado para **GitHub Pages**
  (rama `main`, carpeta raíz).
- Los datos que se crean en la demo de Kairós se guardan en `localStorage`
  del navegador, por lo que cada visitante tiene su propio espacio.
- Incluye estilos de foco visibles, navegación por teclado y respeto por
  `prefers-reduced-motion`.

## Contacto

- Email: [kachurovskyedgar@gmail.com](mailto:kachurovskyedgar@gmail.com)
- WhatsApp: [+54 9 260 460 5043](https://wa.me/5492604605043)
- GitHub: [@kachurovskyedgar](https://github.com/kachurovskyedgar)

---

© Edgar Kachurovsky
