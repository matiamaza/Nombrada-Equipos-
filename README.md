# Nombrada-Equipos-

Interfaz web en Streamlit para cargar PDFs de nombrada (equipos y personas) de SVTI, seleccionar cuadrillas en turno y generar un PDF de salida.

## Requisitos

- Python 3.10+
- Dependencias en `requirements.txt`

## Instalación

```bash
pip install -r requirements.txt
```

## Ejecución

```bash
streamlit run app.py
```

## Funcionalidades incluidas

- Paleta moderna azul marino.
- Carga de 2 archivos PDF:
  - Nombrada de equipos
  - Nombrada de personas
- Selección de cuadrillas por turno (máximo 5):
  - STS 1, STS 2, G9, G5, G10, G6
- Generación y descarga de PDF con:
  - Resumen de cuadrillas seleccionadas
  - Información básica de ambos archivos cargados

> Queda lista para incorporar la lógica de procesamiento específica en el siguiente paso.
