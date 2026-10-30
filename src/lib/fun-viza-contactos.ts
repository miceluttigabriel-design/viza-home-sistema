// ─── CONTACTO (número de teléfono) POR USUARIO — planilla oficial FUN.VIZA ───
// Task 101, pedido del dueño: "estos contactos hay que agregar el de cada uno
// dentro del GDA del sistema, cada uno con su respectivo número".
//
// Fuente: "VIZA PLANILLA CONTATOS Y CORREOS.xlsx" (hoja FUN.VIZA, columnas
// CORREO y CONTACTO). El Excel muestra los números con ":" como separador
// (ej. 0983:655117); acá quedan normalizados como "0983 655117" (mismos
// dígitos, solo lectura más clara). Los de Brasil van tal cual.
//
// Es SOLO REFERENCIA de lectura en el cliente, igual que el SECTOR del GDA:
// NO se guarda en la base, NO cambia el modelo User, NO toca ninguna API.
// La coincidencia es por EMAIL (columna CORREO de la planilla), en minúscula.
//
// Quedan sin número (muestran "—" en el GDA) porque la planilla todavía no
// lo tiene: documentos@viza.com.py (TODAVIA), factura@viza.com.py
// (DE CLIENTES), sercom@viza.com.py (SERCOM) y ventas.nueva@viza.com.py (VER).
// Las filas sin correo (entregadores, limpiadoras, etc.) no van acá porque
// el GDA lista usuarios del sistema, que siempre tienen email.
//
// Lib estática y client-safe (mismo patrón que encargados-sucursal.ts):
// NO importa Prisma ni la base, se puede usar desde componentes cliente.

// Mapa email → número de contacto (de la planilla + viza.compras@ que es la
// segunda dirección de Adriano Ruiz Gómez, que en la planilla comparte fila
// con ventas.online@; ambos ya se usaban para sector/sucursal desde Task 76).
const MAPA_CONTACTO_FUNVIZA: Record<string, string> = {
  // DIRECTORIO (Representante Legal, Directores y cónyuges — CENTRAL)
  "viza@viza.com.py": "0983 655117",
  "juliane@viza.com.py": "0983 522148",
  "larazago@viza.com.py": "0983 725055",
  "juliozago@viza.com.py": "0983 139163",
  "filipe.campos@viza.com.py": "44991151998",
  "julianamoleiro@viza.com.py": "43999519963",
  // Gerencias
  "baltazar@viza.com.py": "0987 700010",
  "jeyson@viza.com.py": "0983 709120",
  "danwillian@viza.com.py": "0982 586716",
  "antonio.fagner@viza.com.py": "0983 305961",
  "librado@viza.com.py": "0983 729021",
  // Administración central (CENTRAL/KATUETE)
  "contabilidad@viza.com.py": "0983 305726",
  "sac@viza.com.py": "0987 700880",
  "rrhh@viza.com.py": "0987 770737",
  "auditoria.stock@viza.com.py": "0991 839943",
  "auditoria@viza.com.py": "0987 501905",
  "viza.marketing@viza.com.py": "0985 537924",
  "viza.artes@viza.com.py": "0981 661062",
  "viza.redes@viza.com.py": "0983 708249",
  "viza.web@viza.com.py": "0992 333436",
  // Adriano Ruiz Gómez: ENC. COMPRAS (viza.compras@) y su correo de la
  // planilla (ventas.online@) — mismo número para las dos direcciones.
  "ventas.online@viza.com.py": "0983 700707",
  "viza.compras@viza.com.py": "0983 700707",
  // CAJA
  "caja.katuete@viza.com.py": "0983 552193",
  "caja.paloma@viza.com.py": "0985 606022",
  "caja.saltos@viza.com.py": "0983 196492",
  "caja.ne@viza.com.py": "0983 940024",
  // FACTURACION
  "fact.katuete@viza.com.py": "0983 514002",
  "fac.paloma@viza.com.py": "0983 413740",
  "fac.saltos@viza.com.py": "0985 126741",
  "fac.ne@viza.com.py": "0982 732405",
  // COBRANZA
  "viza.cobranza@viza.com.py": "0983 132166",
  "cobranza.katuete@viza.com.py": "0983 197176",
  "cobranza.paloma@viza.com.py": "0982 102913",
  "cobranza.saltos@viza.com.py": "0983 196374",
  "cobranza.ne@viza.com.py": "0983 635231",
  // CREDITO
  "credito@viza.com.py": "0983 539505",
  "credito1@viza.com.py": "0985 474692",
  // DEPOSITO
  "deposito.katuete@viza.com.py": "0983 413815",
  "deposito.paloma@viza.com.py": "0982 784783",
  "deposito.saltos@viza.com.py": "0983 118359",
  "deposito.ne@viza.com.py": "0984 879790",
  // VENTAS — KATUETE
  "ventas.rafael@viza.com.py": "0983 401813",
  "ventas.carla@viza.com.py": "0983 369178",
  "ventas.emmanuel@viza.com.py": "0983 206737",
  "ventas.paola@viza.com.py": "0983 342666",
  "ventas.richard@viza.com.py": "0987 187421",
  // VENTAS — LA PALOMA
  "ventas.alvaliz@viza.com.py": "0982 586680",
  "ventas.camila@viza.com.py": "0982 110999",
  "ventas.giceli@viza.com.py": "0983 185906",
  "venta.ana@viza.com.py": "0983 306274",
  "ventas.victor@viza.com.py": "0983 195983",
  // VENTAS — SALTOS DEL GUAIRA
  "ventas.rolando@viza.com.py": "0983 410263",
  "ventas.hector@viza.com.py": "0984 872671",
  "ventas.gustavo@viza.com.py": "0983 408183",
  "ventas.yessica@viza.com.py": "0982 586830",
  // VENTAS — NUEVA ESPERANZA
  "ventas.madelin@viza.com.py": "0984 265165",
  "ventas.adriano@viza.com.py": "0982 585107",
  "ventas.michael@viza.com.py": "0982 126809",
};

// Contacto de un usuario según la planilla (coincidencia por email, en
// minúscula). Devuelve "" si el email no está en la planilla o si la
// planilla todavía no tiene su número → el GDA muestra "—".
export function contactoDe(email: string): string {
  return MAPA_CONTACTO_FUNVIZA[(email || "").trim().toLowerCase()] || "";
}
