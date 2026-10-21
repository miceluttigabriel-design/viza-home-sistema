# 🚀 DEPLOY VIZA HOME EN VERCEL + NEON

## RESUMEN
- **App**: Vercel (gratis, deploy automático desde GitHub)
- **BD**: Neon PostgreSQL (gratis, mejor que SQLite para multiusuario)
- **Dominio**: viza.com.py apuntando a Vercel
- **Emails**: Tu cPanel actual (no cambia)

---

## PASO 1: Crear cuenta en Neon (1 minuto)
1. Entrá a https://neon.tech
2. Click "Sign up" → continuá con GitHub
3. Click "New Project" → nombre: "viza-home"
4. Elegí la región más cercana (Sao Paulo si estás en PY/BR)
5. **Anotá la conexión string** (te aparece como `postgresql://...`)
   Ejemplo: `postgresql://user:pass@ep-xxx.aws.neon.tech/viza_home?sslmode=require`

## PASO 2: Configurar variables en .env (local)
Editá el archivo `.env` (lo creás copiando de `.env.example`):
```
DATABASE_URL="postgresql://user:pass@ep-xxx.aws.neon.tech/viza_home?sslmode=require"
NEXTAUTH_URL="https://viza.com.py"
NEXTAUTH_SECRET="genera_un_secreto_aleatorio_de_64_chars"
```

Para generar NEXTAUTH_SECRET:
- En Linux/Mac: `openssl rand -base64 32`
- En Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## PASO 3: Crear tablas en PostgreSQL (correr 1 vez)
```bash
npx prisma db push
```
Esto crea las tablas User, PasswordLog, Product, Quote en Neon.

## PASO 4: Migrar datos SQLite → PostgreSQL (correr 1 vez)
```bash
npx tsx scripts/migrate-to-postgres.ts
```
Esto sube:
- 62 usuarios (con sus hashes bcrypt)
- 3.553 productos (con todos sus campos)
- Registros de PasswordLog

## PASO 5: Subir el código a GitHub
1. Entrá a tu GitHub: https://github.com
2. Click "+" → "New repository"
3. Nombre: `viza-home-sistema` (o el que quieras)
4. **IMPORTANTE**: Marcá "Private" (es privado, no público)
5. Click "Create repository"
6. En tu PC, abrí Git Bash (o terminal):
```bash
cd /ruta/a/viza-home-deploy
git init
git add .
git commit -m "Primer deploy VIZA HOME"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/viza-home-sistema.git
git push -u origin main
```

## PASO 6: Conectar Vercel con GitHub
1. Entrá a https://vercel.com
2. Click "Sign Up" → continuá con GitHub
3. Click "Add New Project" → importá `viza-home-sistema`
4. Vercel detecta Next.js automáticamente
5. En "Environment Variables" agregá las mismas 3 variables del .env:
   - DATABASE_URL (la de Neon)
   - NEXTAUTH_URL (https://viza.com.py o tu subdominio free)
   - NEXTAUTH_SECRET (el mismo secreto aleatorio)
6. Click "Deploy"
7. Esperá 2-3 minutos a que termine el build
8. Te da una URL tipo `viza-home-sistema.vercel.app` (temporal)

## PASO 7: Apuntar tu dominio viza.com.py a Vercel
1. En Vercel: abrí el proyecto → "Settings" → "Domains"
2. Agregá `viza.com.py` (y opcionalmente `www.viza.com.py`)
3. Vercel te da instrucciones DNS:
   - Tipo: A (o CNAME)
   - Name: @ (o www)
   - Value: `cname.vercel-dns.com`
4. Entrá a tu cPanel → "Zone Editor" → "Manage"
5. Agregá el registro DNS que te indicó Vercel
6. Esperá 5-30 minutos a que se propague el DNS

## PASO 8: Activar HTTPS (automático)
- Vercel genera certificado SSL automáticamente
- Aparece el candadito verde en el navegador
- Tu URL queda: `https://viza.com.py`

## PASO 9: Migrar el Excel (si querés refrescar productos)
Como el Excel .xlsm no se sube a GitHub (es privado), para refrescar productos:
1. Subí el Excel al panel admin → "IMPORTAR EXCEL"
2. O usá el script `scripts/import-excel-windows.ts`

---

## ✅ LISTO!
- Sistema online 24/7 en https://viza.com.py
- Cambios en GitHub → deploy automático en 2 min
- BD PostgreSQL en Neon, respaldada automáticamente
- HTTPS gratis
- Mantenés tu cPanel para emails @viza.com.py

## 🔐 CREDENCIALES INICIALES
- Supremo: viza.cobranza@viza.com.py / VizaSupremo2026!Cob
- Admin: viza@viza.com.py / vilmarrepresentante1*
- Colaborador: ventas.online@viza.com.py / vendedor1*
