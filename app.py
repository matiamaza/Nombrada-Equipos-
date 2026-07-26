from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import List

import streamlit as st
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

MAX_CUADRILLAS = 5
CUADRILLAS_DISPONIBLES = ["STS 1", "STS 2", "G9", "G5", "G10", "G6"]
MAX_PREVIEW_LENGTH = 500


st.set_page_config(
    page_title="Nombrada SVTI",
    page_icon="⚓",
    layout="wide",
)

st.markdown(
    """
    <style>
    .stApp {
        background: linear-gradient(180deg, #0B132B 0%, #1C2541 100%);
        color: #EAEFF7;
    }
    .main-title {
        font-size: 2.2rem;
        font-weight: 700;
        color: #EAEFF7;
        margin-bottom: 0;
    }
    .subtitle {
        color: #B8C4D9;
        margin-top: 0;
        margin-bottom: 1rem;
    }
    .block-container {
        padding-top: 2rem;
    }
    div[data-testid="stFileUploader"] {
        background-color: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 12px;
        padding: 0.75rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def _extract_pdf_info(file_bytes: bytes, file_name: str) -> dict:
    try:
        reader = PdfReader(BytesIO(file_bytes))
        page_count = len(reader.pages)

        preview_parts: List[str] = []
        for page in reader.pages[:2]:
            text = (page.extract_text() or "").strip()
            if text:
                preview_parts.append(text.replace("\n", " "))
        preview = " ".join(preview_parts)[:MAX_PREVIEW_LENGTH] or "Sin texto extraíble."
    except PdfReadError as exc:
        raise ValueError(f"No se pudo leer el archivo PDF '{file_name}': {exc}") from exc

    return {
        "nombre": file_name,
        "paginas": page_count,
        "preview": preview,
    }


def _build_output_pdf(equipos_info: dict, personas_info: dict, cuadrillas: List[str]) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Resumen Nombrada SVTI",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleSVTI",
        parent=styles["Heading1"],
        textColor=colors.HexColor("#0B132B"),
        fontSize=19,
        spaceAfter=12,
    )
    normal_style = ParagraphStyle(
        "NormalSVTI",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
    )

    story = [
        Paragraph("Resumen de Nombrada - SVTI", title_style),
        Paragraph(
            f"Fecha de generación (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}",
            normal_style,
        ),
        Spacer(1, 12),
    ]

    cuadrillas_text = ", ".join(cuadrillas) if cuadrillas else "Sin cuadrillas seleccionadas"
    story.append(Paragraph(f"<b>Cuadrillas en turno:</b> {cuadrillas_text}", normal_style))
    story.append(Spacer(1, 12))

    table_data = [
        ["Archivo", "Páginas", "Vista previa (primeras páginas)"],
        [equipos_info["nombre"], str(equipos_info["paginas"]), equipos_info["preview"]],
        [personas_info["nombre"], str(personas_info["paginas"]), personas_info["preview"]],
    ]

    table = Table(table_data, colWidths=[5 * cm, 2.5 * cm, 8.5 * cm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B132B")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#BCC7D9")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F5F7FB")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    story.append(table)

    doc.build(story)
    return buffer.getvalue()


st.markdown('<p class="main-title">Nombrada de Equipos y Personas - SVTI</p>', unsafe_allow_html=True)
st.markdown(
    '<p class="subtitle">Carga los PDFs de equipos/personas y selecciona hasta 5 cuadrillas por turno.</p>',
    unsafe_allow_html=True,
)

left_col, right_col = st.columns([1.2, 1], gap="large")

with left_col:
    st.subheader("1) Cargar archivos PDF")
    equipos_pdf = st.file_uploader("Archivo PDF de equipos", type=["pdf"], key="equipos_pdf")
    personas_pdf = st.file_uploader("Archivo PDF de personas", type=["pdf"], key="personas_pdf")

with right_col:
    st.subheader("2) Definir cuadrillas de turno")
    cantidad_cuadrillas = st.slider("Cantidad de cuadrillas", min_value=1, max_value=MAX_CUADRILLAS, value=1)

    seleccionadas: List[str] = []
    for i in range(cantidad_cuadrillas):
        opciones = [c for c in CUADRILLAS_DISPONIBLES if c not in seleccionadas]
        seleccion = st.selectbox(
            f"Cuadrilla #{i + 1}",
            options=opciones,
            key=f"cuadrilla_{i}",
            help="Cada cuadrilla solo puede seleccionarse una vez.",
        )
        seleccionadas.append(seleccion)

st.divider()

if st.button("Generar PDF", type="primary", use_container_width=True):
    if not equipos_pdf or not personas_pdf:
        st.error("Debes cargar ambos archivos PDF para continuar.")
    else:
        try:
            equipos_info = _extract_pdf_info(equipos_pdf.getvalue(), equipos_pdf.name)
            personas_info = _extract_pdf_info(personas_pdf.getvalue(), personas_pdf.name)
            output_pdf = _build_output_pdf(equipos_info, personas_info, seleccionadas)
            st.success("PDF generado correctamente.")
            st.download_button(
                label="Descargar PDF de salida",
                data=output_pdf,
                file_name="resumen_nombrada_svti.pdf",
                mime="application/pdf",
                use_container_width=True,
            )
        except ValueError as exc:
            st.error(f"Error de datos al procesar archivos: {exc}")
        except Exception as exc:
            st.error(f"Error inesperado al generar el PDF: {exc}")
else:
    st.info("Carga los archivos y presiona 'Generar PDF'.")
