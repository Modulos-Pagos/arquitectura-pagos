# Estándares de UI — Front End de Pagos

El front end de Pagos sigue el estándar visual acordado entre los módulos de Ticket-U, documentado en
[`docs/Checklist_Consistencia_Visual.docx`](docs/Checklist_Consistencia_Visual.docx) (sección A, lineamientos generales).

## Dónde se aplica en el código

| Fila del checklist | Estándar acordado | Implementación en Pagos |
|---|---|---|
| 2 | Banner de contexto #EEF1F8 | [`components/layout/BannerPasos.tsx`](components/layout/BannerPasos.tsx): título, pasos del pago y sello de pago seguro |
| 1–5 | Colores: fondo #FFFFFF / #F8F9FA, texto #2F4374 / #6B7A9A, acento #2F4374, estados éxito/peligro/info | Variables `--color-ticket-*` en [`app/globals.css`](app/globals.css) |
| 6 | Un solo modo (claro) | [`app/layout.tsx`](app/layout.tsx): fondo blanco, texto azul marino |
| 7–10 | Poppins (títulos, 600–700) e Inter (cuerpo, 400–600) | [`app/layout.tsx`](app/layout.tsx) con `next/font` |
| 13 | Ancho máximo 1200px | `max-w-[1200px]` en [`Header.tsx`](components/layout/Header.tsx) y [`Footer.tsx`](components/layout/Footer.tsx) |
| 15 | Header TicketAzul: logo + menú (Inicio, Mis eventos, Promociones, Configuración, Mi cuenta), buscar + carrito + avatar; 64px, sticky | [`components/layout/Header.tsx`](components/layout/Header.tsx) (`h-16 sticky`, menú hamburguesa en móvil) |
| 16–17 | Botones e inputs: alto 40px, radio 8px, borde #D8DFF0, foco con halo 2px, error #B3261E | [`CheckoutForm.tsx`](components/checkout/CheckoutForm.tsx), [`Confirmacion.tsx`](components/checkout/Confirmacion.tsx), estilos de foco/error en [`app/globals.css`](app/globals.css) |
| 18 | Badges tipo pill | `rounded-full` en [`OrderSummary.tsx`](components/checkout/OrderSummary.tsx) |
| 20 | Íconos outline (Lucide) | `lucide-react` en los componentes |
| 21 | Radio 12px en tarjetas | `rounded-xl` en [`OrderSummary.tsx`](components/checkout/OrderSummary.tsx) |
| 26 | Foco visible: outline 2px #2F4374 | [`app/globals.css`](app/globals.css) |
| 32 | Errores de validación: #B3261E, 12px, bajo el campo, con ícono | [`CheckoutForm.tsx`](components/checkout/CheckoutForm.tsx) |

La sección B del checklist (estados y tarjetas de evento) corresponde al Panel Organizador y no aplica al checkout de Pagos.
