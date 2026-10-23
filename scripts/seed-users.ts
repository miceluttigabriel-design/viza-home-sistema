import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const db = new PrismaClient();

interface UserDef {
  email: string;
  name: string;
  role: "supremo_admin" | "admin" | "representante";
  password: string;
}

// Generar contraseña segura: VizaHome + sufijo aleatorio criptográfico
function genPassword(): string {
  // randomBytes evita el patrón predecible de Math.random()
  return `VizaHome2026!${randomBytes(4).toString("base64url")}`;
}

// 4 USUARIOS ESPECIALES (Acceso Total: Admin + Ventas)
// IMPORTANTE: no hardcodear contraseñas. Se pueden fijar por variables de
// entorno (ej: SEED_ADMIN_PASSWORD) o se genera una aleatoria por usuario.
const adminUsers: UserDef[] = [
  { email: "viza@viza.com.py", name: "VILMAR CESAR ZAGO PEREIRA", role: "admin", password: process.env.SEED_ADMIN_PASSWORD || genPassword() },
  { email: "baltazar@viza.com.py", name: "BALTAZAR ALFREDO PALUDO GONCALVES", role: "admin", password: genPassword() },
  { email: "viza.compras@viza.com.py", name: "ADRIANO RUIZ GOMEZ", role: "admin", password: genPassword() },
  { email: "viza.cobranza@viza.com.py", name: "GABRIEL HENRIQUE MICELUTTI DA SILVA", role: "supremo_admin", password: process.env.SEED_SUPREMO_PASSWORD || genPassword() },
];

// USUARIOS REGULARES (Solo Ventas - representante)
const regularUsers: UserDef[] = [
  { email: "ventas.online@viza.com.py", name: "ADRIANO RUIZ GOMEZ", role: "representante", password: process.env.SEED_VENDEDOR_PASSWORD || genPassword() },
  { email: "juliane@viza.com.py", name: "JULIANE TEXEIRA CALAZANS", role: "representante", password: genPassword() },
  { email: "larazago@viza.com.py", name: "LARA EDUARDA NZAGO TEXEIRA", role: "representante", password: genPassword() },
  { email: "juliozago@viza.com.py", name: "JULIO CESAR ZAGO TEXEIRA", role: "representante", password: genPassword() },
  { email: "jeyson@viza.com.py", name: "JEYSON MARCELO WEISS", role: "representante", password: genPassword() },
  { email: "danwillian@viza.com.py", name: "DAN WILLIAN AUGUSTO VIEIRA", role: "representante", password: genPassword() },
  { email: "antonio.fagner@viza.com.py", name: "ANTONIO FAGNER VILLANUEVA ROSATTO", role: "representante", password: genPassword() },
  { email: "librado@viza.com.py", name: "LIBRADO JUSTO FRANCO AQUINO", role: "representante", password: genPassword() },
  { email: "ventas.rafael@viza.com.py", name: "RAFAEL LUJAN LOPEZ BORJA", role: "representante", password: genPassword() },
  { email: "ventas.carla@viza.com.py", name: "CARLA ROSSATO", role: "representante", password: genPassword() },
  { email: "ventas.emmanuel@viza.com.py", name: "EMMANUEL GONZALEZ RAMIREZ", role: "representante", password: genPassword() },
  { email: "ventas.paola@viza.com.py", name: "LILIAN PAOLA CENTURION FIGUEREDO", role: "representante", password: genPassword() },
  { email: "ventas.richard@viza.com.py", name: "RICHARD NATANAHEL MENCIA NUNEZ", role: "representante", password: genPassword() },
  { email: "ventas.alvaliz@viza.com.py", name: "ALVA LIZ VILLANUEVA ROSATTO", role: "representante", password: genPassword() },
  { email: "ventas.camila@viza.com.py", name: "CAMILA ANDREA MELGAREJO SILVA", role: "representante", password: genPassword() },
  { email: "ventas.giceli@viza.com.py", name: "GICELI DA SILVA SANCHEZ", role: "representante", password: genPassword() },
  { email: "venta.ana@viza.com.py", name: "ANA JASMIN ALCARAZ FLEITAS", role: "representante", password: genPassword() },
  { email: "ventas.victor@viza.com.py", name: "VICTOR SAMUEL ACOSTA RIOS", role: "representante", password: genPassword() },
  { email: "ventas.rolando@viza.com.py", name: "ROLANDO ALMIRON COLMAN", role: "representante", password: genPassword() },
  { email: "ventas.hector@viza.com.py", name: "HECTOR ROQUE CANETE", role: "representante", password: genPassword() },
  { email: "ventas.gustavo@viza.com.py", name: "GUSTAVO ALMIRON VELAZQUEZ", role: "representante", password: genPassword() },
  { email: "ventas.yessica@viza.com.py", name: "YESSICA MILENA ROJAS IRALA", role: "representante", password: genPassword() },
  { email: "ventas.madelin@viza.com.py", name: "MADELIN JUDITH PIRIS CHAMORRO", role: "representante", password: genPassword() },
  { email: "ventas.adriano@viza.com.py", name: "ADRIANO JUAN MACHADO SETTI", role: "representante", password: genPassword() },
  { email: "ventas.michael@viza.com.py", name: "MICHAEL GABRIEL PIRIS CHAMORRO", role: "representante", password: genPassword() },
  { email: "contabilidad@viza.com.py", name: "DELIA MARINA BARRETO MONTIEL", role: "representante", password: genPassword() },
  { email: "sac@viza.com.py", name: "BIANCA CAROLINE SCHMITT SCHUCHARDT", role: "representante", password: genPassword() },
  { email: "rrhh@viza.com.py", name: "ORALDO JUNIOR APARECIDO DOS SANTOS", role: "representante", password: genPassword() },
  { email: "auditoria.stock@viza.com.py", name: "FREDDY APONTE MALLORQUIN", role: "representante", password: genPassword() },
  { email: "auditoria@viza.com.py", name: "GUILHERME QUCHARO SARAIVA", role: "representante", password: genPassword() },
  { email: "documentos@viza.com.py", name: "GUILHERME VAZQUEZ", role: "representante", password: genPassword() },
  { email: "viza.marketing@viza.com.py", name: "ALDO JAVIER BENITEZ ROMAN", role: "representante", password: genPassword() },
  { email: "viza.artes@viza.com.py", name: "PABLO EMMANUEL CORONEL CHAMORRO", role: "representante", password: genPassword() },
  { email: "viza.redes@viza.com.py", name: "VIVIAN MAITE BENITEZ ALVAREZ", role: "representante", password: genPassword() },
  { email: "viza.web@viza.com.py", name: "MARIANA ZORRILLA FERREIRA", role: "representante", password: genPassword() },
  { email: "filipe.campos@viza.com.py", name: "FILIPE CAMPOS DA SILVA", role: "representante", password: genPassword() },
  { email: "julianamoleiro@viza.com.py", name: "JULIANA CRUZ MOLEIRO", role: "representante", password: genPassword() },
  { email: "credito@viza.com.py", name: "NAIDA RAMANA CESPEDES", role: "representante", password: genPassword() },
  { email: "credito1@viza.com.py", name: "DAMICELA JAZMIN MENDEZ CENTURION", role: "representante", password: genPassword() },
  { email: "caja.katuete@viza.com.py", name: "DEIVIANE MAISA KUZLER WEISS", role: "representante", password: genPassword() },
  { email: "caja.paloma@viza.com.py", name: "MATHIAS OSMAR BENITEZ NUNEZ", role: "representante", password: genPassword() },
  { email: "caja.saltos@viza.com.py", name: "FATIMA MONSERRAT GODOY", role: "representante", password: genPassword() },
  { email: "caja.ne@viza.com.py", name: "EUSEBIA ELIZABETH PINANEZ BOGADO", role: "representante", password: genPassword() },
  { email: "fact.katuete@viza.com.py", name: "MARIA ELIZABETH ACOSTA AGUILERA", role: "representante", password: genPassword() },
  { email: "fac.paloma@viza.com.py", name: "JUAN RAMON LOPEZ AGUILAR", role: "representante", password: genPassword() },
  { email: "fac.saltos@viza.com.py", name: "MARCELO ADRIAN ULLON FLEITAS", role: "representante", password: genPassword() },
  { email: "fac.ne@viza.com.py", name: "LIZ MARLENE PERALTA BENITEZ", role: "representante", password: genPassword() },
  { email: "cobranza.katuete@viza.com.py", name: "VER NUEVA CONTRATACION", role: "representante", password: genPassword() },
  { email: "cobranza.paloma@viza.com.py", name: "EDILIO DARIO BAEZ DELVALLE", role: "representante", password: genPassword() },
  { email: "cobranza.saltos@viza.com.py", name: "ARNALDO RAMON SANCHEZ VERA", role: "representante", password: genPassword() },
  { email: "cobranza.ne@viza.com.py", name: "NATALIE ARAMI OCAMPO URAN", role: "representante", password: genPassword() },
  { email: "deposito.katuete@viza.com.py", name: "THIAGO AUGUSTO GONZALEZ FRANCO", role: "representante", password: genPassword() },
  { email: "deposito.paloma@viza.com.py", name: "ALEJANDRO RAFAEL MEZA DAVALOS", role: "representante", password: genPassword() },
  { email: "deposito.saltos@viza.com.py", name: "PABLO SANABRIA GALEANO", role: "representante", password: genPassword() },
  { email: "deposito.ne@viza.com.py", name: "JOAO VICTOR PEREIRA RODRIGUES", role: "representante", password: genPassword() },
  { email: "factura@viza.com.py", name: "RECEPCION DE FACTURAS", role: "representante", password: genPassword() },
  { email: "sercom@viza.com.py", name: "JAVIER MELGAREJO", role: "representante", password: genPassword() },
];

async function main() {
  console.log("=== CREANDO USUARIOS DE VIZA HOME ===\n");
  
  const allUsers = [...adminUsers, ...regularUsers];
  let created = 0;
  let updated = 0;

  for (const user of allUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    const existing = await db.user.findUnique({ where: { email: user.email } });
    
    if (existing) {
      await db.user.update({
        where: { email: user.email },
        data: {
          name: user.name,
          password: hashedPassword,
          role: user.role,
          active: true,
        },
      });
      updated++;
      console.log(`[ACTUALIZADO] ${user.email} (${user.role})`);
    } else {
      await db.user.create({
        data: {
          email: user.email,
          name: user.name,
          password: hashedPassword,
          role: user.role,
          active: true,
        },
      });
      created++;
      console.log(`[CREADO] ${user.email} (${user.role})`);
    }

    // Guardar contraseña en texto plano en la bitácora (registro_contrasenas)
    const userRecord = await db.user.findUnique({ where: { email: user.email } });
    if (userRecord) {
      // Eliminar logs anteriores de este usuario y guardar el nuevo
      await db.passwordLog.deleteMany({ where: { userId: userRecord.id } });
      await db.passwordLog.create({
        data: {
          userId: userRecord.id,
          email: user.email,
          contrasenaTextoPlano: user.password,
          cambiadoPor: "SISTEMA",
        },
      });
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Total usuarios: ${allUsers.length}`);
  console.log(`  Admin (especiales): ${adminUsers.length}`);
  console.log(`  Representante (regulares): ${regularUsers.length}`);
  console.log(`  Creados nuevos: ${created}`);
  console.log(`  Actualizados: ${updated}`);

  // Imprimir listado para el PDF
  console.log(`\n=== LISTADO PARA PDF ===\n`);
  console.log("USUARIOS ESPECIALES (Acceso Total - Admin + Ventas):");
  console.log("=".repeat(80));
  for (const u of adminUsers) {
    console.log(`${u.email}\t${u.password}\t${u.name}`);
  }
  console.log("\nUSUARIOS REGULARES (Solo Ventas):");
  console.log("=".repeat(80));
  for (const u of regularUsers) {
    console.log(`${u.email}\t${u.password}\t${u.name}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
