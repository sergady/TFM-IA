# Dashboard de encuestas TFM

Interfaz visual para consultar los resultados de las encuestas del TFM sobre la incorporacion juvenil al mercado laboral.

## Que incluye

- Aplicacion web con React, Vite y Recharts.
- Filtros por fase, nivel de estudios y situacion laboral.
- Indicadores principales, graficos de barreras, dificultad del primer empleo, edad y situacion laboral.
- Lectura rapida de respuestas abiertas mediante terminos frecuentes y citas representativas.
- Script de preparacion de datos compatible con CSV y Excel.
- Workflow de GitHub Actions para publicar en GitHub Pages.

## Estructura de datos

Coloca las fuentes originales en `data/raw/`:

```text
data/raw/
├── fase-1.csv
├── fase-2.xlsx
└── fase-final.xlsx
```

Si `data/raw/` esta vacia, el script usa automaticamente `../cleanData.csv` como primera fase.

## Uso local

Instala dependencias:

```bash
npm install
pip install -r requirements.txt
```

Prepara los datos:

```bash
npm run prepare:data
```

Ejecuta la interfaz:

```bash
npm run dev
```

Genera la version publicable:

```bash
npm run build
```

## Publicacion en GitHub Pages

El proyecto esta configurado para el repositorio:

```text
https://github.com/sergady/TFM-IA.git
```

Despues de subirlo a GitHub:

1. Entra en el repositorio.
2. Ve a `Settings > Pages`.
3. En `Build and deployment`, selecciona `GitHub Actions`.
4. Haz push a la rama `main`.

La web se publicara en:

```text
https://sergady.github.io/TFM-IA/
```

## Privacidad

Antes de publicar, revisa que los archivos subidos no contengan datos personales o respuestas identificables. Para publicar resultados abiertos, es preferible trabajar con datos anonimizados o agregados.
